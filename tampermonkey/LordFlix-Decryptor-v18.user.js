// ==UserScript==
// @name         LordFlix Decryptor v18
// @namespace    http://tampermonkey.net/
// @version      18.0
// @description  Modify Wasm binary to inject custom encrypted data
// @match        https://lordflix.org/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    let savedModule = null;
    let savedImports = null;
    let wasmBytes = null;
    let encryptedRef = null;
    let dataOffset = -1;

    /* ───────── Hook 1: JSON.parse ───────── */
    const origParse = JSON.parse;
    JSON.parse = function (text, reviver) {
        const result = origParse.call(this, text, reviver);
        if (text && typeof text === 'string' && text.includes('"stream"')) {
            window.__lastDecrypted = result;
        }
        return result;
    };

    /* ───────── Hook 2: instantiateStreaming ───────── */
    const origIST = WebAssembly.instantiateStreaming;
    WebAssembly.instantiateStreaming = async function (source, importObject) {
        console.log('🧩 instantiateStreaming — capturing...');

        if (importObject.js_code) {
            const jc = importObject.js_code;

            /* Capture encrypted input */
            const origESW = jc['kotlin.wasm.internal.jsExportStringToWasm'];
            if (origESW) {
                jc['kotlin.wasm.internal.jsExportStringToWasm'] = function (Tx, Ox, S0, D0) {
                    if (typeof Tx === 'string' && Tx.length > 50 && !encryptedRef) {
                        encryptedRef = Tx;
                        console.log('🔑 Captured encrypted data (' + Tx.length + ' chars)');
                        console.log('   First 40 chars: ' + Tx.substring(0, 40));
                        console.log('   Last 40 chars: ' + Tx.substring(Tx.length - 40));
                    }
                    return origESW.call(this, Tx, Ox, S0, D0);
                };
            }

            /* Trace output */
            const origISFW = jc['kotlin.wasm.internal.importStringFromWasm'];
            if (origISFW) {
                jc['kotlin.wasm.internal.importStringFromWasm'] = function () {
                    const r = origISFW.apply(this, arguments);
                    if (typeof r === 'string' && r.length > 20) {
                        console.log('  📡 importStringFromWasm → "' + r.substring(0, 80) + '..."');
                    }
                    return r;
                };
            }
        }

        /* Also fetch the raw wasm bytes */
        try {
            console.log('🧩 Fetching wasm binary...');
            const resp = await fetch('https://lordflix.org/hls/hxqvpnrw.wasm');
            wasmBytes = new Uint8Array(await resp.arrayBuffer());
            console.log('🧩 Wasm binary cached: ' + wasmBytes.length + ' bytes');
        } catch (e) {
            console.log('⚠️ Could not fetch wasm binary:', e.message);
        }

        const result = await origIST.call(this, source, importObject);
        savedModule = result.module;
        savedImports = importObject;
        console.log('🧩 Instance ready');
        return result;
    };

    /* ───────── Search wasm binary for pattern ───────── */
    function searchBinary(data, searchStr) {
        const search = new TextEncoder().encode(searchStr);
        const probeLen = Math.min(search.length, 20);

        console.log('🔍 Searching ' + data.length + ' bytes...');
        console.log('   Pattern (first ' + probeLen + '): ' +
            Array.from(search.slice(0, probeLen))
                .map(function (b) { return b.toString(16).padStart(2, '0'); })
                .join(' '));

        for (let i = 0; i < data.length - probeLen; i++) {
            let match = true;
            for (let j = 0; j < probeLen; j++) {
                if (data[i + j] !== search[j]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                /* Verify full match */
                let fullOk = true;
                for (let j = 0; j < search.length && (i + j) < data.length; j++) {
                    if (data[i + j] !== search[j]) { fullOk = false; break; }
                }
                if (fullOk) {
                    console.log('✅ FOUND at binary offset ' + i + '!');
                    /* Show hex context */
                    var start = Math.max(0, i - 16);
                    var end = Math.min(data.length, i + search.length + 16);
                    for (var off = start; off < end; off += 16) {
                        var hex = '';
                        var ascii = '';
                        for (var b = 0; b < 16 && (off + b) < end; b++) {
                            var byte = data[off + b];
                            hex += byte.toString(16).padStart(2, '0') + ' ';
                            ascii += (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';
                        }
                        var marker = (off <= i && i < off + 16) ? ' ◄' : '';
                        console.log('  ' + off.toString(16).padStart(6, '0') + ': ' + hex.padEnd(48) + ascii + marker);
                    }
                    return i;
                }
            }
        }
        console.log('❌ NOT FOUND in binary');
        return -1;
    }

    /* ───────── Search binary for ALL printable strings ───────── */
    function dumpBinaryStrings(data, minLen) {
        minLen = minLen || 20;
        var strings = [];
        var cur = '';
        var curStart = -1;

        for (var i = 0; i < data.length; i++) {
            var b = data[i];
            if (b >= 32 && b <= 126) {
                if (curStart === -1) curStart = i;
                cur += String.fromCharCode(b);
            } else {
                if (cur.length >= minLen) {
                    strings.push({ offset: curStart, length: cur.length, text: cur });
                }
                cur = '';
                curStart = -1;
            }
        }
        if (cur.length >= minLen) {
            strings.push({ offset: curStart, length: cur.length, text: cur });
        }

        console.log('  Found ' + strings.length + ' strings (>=' + minLen + ' chars) in binary:');
        strings.forEach(function (s) {
            var preview = s.text.length > 80 ? s.text.substring(0, 80) + '...' : s.text;
            console.log('    @' + String(s.offset).padStart(5) + ' (' + String(s.length).padStart(4) + '): "' + preview + '"');
        });
        return strings;
    }

    /* ───────── Create modified clone and decrypt ───────── */
    async function decryptWithModifiedWasm(customEncryptedData) {
        if (!wasmBytes || !encryptedRef || !savedImports) {
            console.log('❌ Missing wasm bytes or encrypted reference. Click a movie first.');
            return null;
        }

        /* Search for encrypted data in binary (cached offset) */
        if (dataOffset === -1) {
            console.log('🧩 Searching binary for encrypted data...');
            dataOffset = searchBinary(wasmBytes, encryptedRef);
        }

        if (dataOffset === -1) {
            console.log('❌ Cannot find encrypted data in binary!');
            console.log('🧩 Dumping all strings in binary...');
            dumpBinaryStrings(wasmBytes, 30);

            /* Also try searching for just the first 8 chars (might be split) */
            console.log('🧩 Trying short pattern search (first 8 chars)...');
            dataOffset = searchBinary(wasmBytes, encryptedRef.substring(0, 8));
            return null;
        }

        /* Create modified binary with custom data */
        console.log('🧩 Creating modified binary...');
        var modBytes = new Uint8Array(wasmBytes);
        var newData = new TextEncoder().encode(customEncryptedData);

        /* Zero out old data area */
        for (var k = 0; k < encryptedRef.length + 50; k++) {
            if (dataOffset + k < modBytes.length) modBytes[dataOffset + k] = 0;
        }
        /* Write new data */
        for (var k = 0; k < newData.length && (dataOffset + k) < modBytes.length; k++) {
            modBytes[dataOffset + k] = newData[k];
        }

        /* Verify patch */
        console.log('🧩 Verifying patch...');
        var patched = '';
        for (var k = 0; k < newData.length; k++) {
            patched += String.fromCharCode(modBytes[dataOffset + k]);
        }
        console.log('  Patched: "' + patched.substring(0, 40) + '..."');
        console.log('  Expected: "' + customEncryptedData.substring(0, 40) + '..."');

        /* Compile modified binary */
        console.log('🧩 Compiling modified binary...');
        var modModule;
        try {
            modModule = await WebAssembly.compile(modBytes);
        } catch (e) {
            console.log('❌ Compile failed:', e.message);
            return null;
        }

        /* Create imports with hooks */
        var cloneJC = {};
        for (var key of Object.keys(savedImports.js_code)) {
            cloneJC[key] = savedImports.js_code[key];
        }

        var capturedOutput = null;
        var origISFW = cloneJC['kotlin.wasm.internal.importStringFromWasm'];
        cloneJC['kotlin.wasm.internal.importStringFromWasm'] = function (Tx, Ox, S0) {
            var result = origISFW.call(this, Tx, Ox, S0);
            if (typeof result === 'string' && result.length > 20) {
                console.log('  📡 [MOD] → "' + result.substring(0, 100) + '..."');
                capturedOutput = result;
            }
            return result;
        };
        cloneJC['kotlin.wasm.internal.throwJsError'] = function () { return undefined; };

        /* Instantiate */
        console.log('🧩 Instantiating modified binary...');
        var modInstance;
        try {
            modInstance = new WebAssembly.Instance(modModule, {
                js_code: cloneJC,
                intrinsics: savedImports.intrinsics || {}
            });
        } catch (e) {
            console.log('❌ Instantiate failed:', e.message);
            return null;
        }

        var ex = modInstance.exports;

        /* Init + decrypt */
        console.log('🧩 _initialize + main + q3v...');
        try { ex._initialize(); } catch (e) { console.log('  init:', e.message || e); }
        try { ex.main(); } catch (e) { console.log('  main:', e.message || e); }
        try { ex.q3v(); } catch (e) { console.log('  q3v threw (expected):', String(e).substring(0, 60)); }

        if (capturedOutput) {
            console.log('✅ Decryption with custom data succeeded!');
            try { return JSON.parse(capturedOutput); } catch (e) { return capturedOutput; }
        }
        console.log('❌ No output captured');
        return null;
    }

    /* ───────── Public API ───────── */
    window.decrypt = async function (data) {
        return await decryptWithModifiedWasm(data);
    };

    /* Auto-analyze after first decrypt */
    var analyzed = false;
    var _op = JSON.parse;
    JSON.parse = function (text, reviver) {
        var r = _op.call(this, text, reviver);
        if (!analyzed && text && typeof text === 'string' && text.includes('"stream"')) {
            analyzed = true;
            setTimeout(async function () {
                console.log('');
                console.log('╔══════════════════════════════════════╗');
                console.log('║  BINARY ANALYSIS                     ║');
                console.log('╚══════════════════════════════════════╝');

                if (!wasmBytes) {
                    console.log('❌ Wasm binary not fetched');
                    return;
                }

                /* Search for encrypted data */
                dataOffset = searchBinary(wasmBytes, encryptedRef);

                if (dataOffset === -1) {
                    console.log('');
                    console.log('⚠️ Encrypted data NOT found in binary as UTF-8.');
                    console.log('   Dumping all strings >= 20 chars...');
                    dumpBinaryStrings(wasmBytes, 20);
                    console.log('');
                    console.log('   Dumping all strings >= 10 chars...');
                    dumpBinaryStrings(wasmBytes, 10);
                } else {
                    console.log('');
                    console.log('✅ Ready! Usage: await decrypt("YOUR_ENCRYPTED_DATA")');
                }
            }, 500);
        }
        return r;
    };

    console.log('🔓 Decryptor v18 ready — click a movie');
})();
