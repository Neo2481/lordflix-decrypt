// ==UserScript==
// @name         LordFlix Decryptor v16
// @namespace    http://tampermonkey.net/
// @version      16.0
// @description  Memory search + inject arbitrary encrypted data for independent decryption
// @match        https://lordflix.org/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    let savedModule = null;
    let savedImports = null;
    let savedExports = null;
    let encryptedData = null;   // captured from site's jsExportStringToWasm
    let encryptedOffset = -1;   // offset in Wasm memory
    let encryptedLength = 0;

    /* ───────── Hook 1: JSON.parse ───────── */
    const origParse = JSON.parse;
    JSON.parse = function (text, reviver) {
        const result = origParse.call(this, text, reviver);
        if (text && typeof text === 'string' && text.includes('"stream"')) {
            console.log('🎬 Site decrypted');
            window.__lastDecrypted = result;
        }
        return result;
    };

    /* ───────── Hook 2: instantiateStreaming ───────── */
    const origIST = WebAssembly.instantiateStreaming;
    WebAssembly.instantiateStreaming = async function (source, importObject) {
        console.log('🧩 instantiateStreaming — capturing...');

        /* Hook jsExportStringToWasm on ORIGINAL to capture the encrypted input */
        if (importObject.js_code) {
            const jc = importObject.js_code;

            /* Capture encrypted data going into Wasm */
            const origESW = jc['kotlin.wasm.internal.jsExportStringToWasm'];
            if (origESW) {
                jc['kotlin.wasm.internal.jsExportStringToWasm'] = function (Tx, Ox, S0, D0) {
                    if (typeof Tx === 'string' && Tx.length > 50) {
                        encryptedData = Tx;
                        console.log('🔑 Captured encrypted data (' + Tx.length + ' chars):');
                        console.log('   ' + Tx.substring(0, 60) + '...');
                    }
                    return origESW.call(this, Tx, Ox, S0, D0);
                };
            }

            /* Trace importStringFromWasm */
            const origISFW = jc['kotlin.wasm.internal.importStringFromWasm'];
            if (origISFW) {
                jc['kotlin.wasm.internal.importStringFromWasm'] = function () {
                    const r = origISFW.apply(this, arguments);
                    if (typeof r === 'string' && r.length > 20) {
                        console.log('  📡 [SITE] importStringFromWasm → "' + r.substring(0, 80) + '..."');
                    }
                    return r;
                };
            }
        }

        const result = await origIST.call(this, source, importObject);
        savedModule = result.module;
        savedImports = importObject;
        savedExports = result.instance.exports;
        console.log('🧩 Saved. Exports:', Object.keys(savedExports));
        return result;
    };

    /* ───────── Build clone with hooks ───────── */
    async function buildClone(customData) {
        const cloneJC = {};
        for (const key of Object.keys(savedImports.js_code)) {
            cloneJC[key] = savedImports.js_code[key];
        }

        let capturedOutput = null;

        /* Hook importStringFromWasm — capture decrypted output */
        const origISFW = cloneJC['kotlin.wasm.internal.importStringFromWasm'];
        cloneJC['kotlin.wasm.internal.importStringFromWasm'] = function (Tx, Ox, S0) {
            const result = origISFW.call(this, Tx, Ox, S0);
            if (typeof result === 'string' && result.length > 20) {
                console.log('  📡 [CLONE] importStringFromWasm → "' + result.substring(0, 80) + '..."');
                capturedOutput = result;
            }
            return result;
        };

        /* Suppress throwJsError */
        cloneJC['kotlin.wasm.internal.throwJsError'] = function (Tx, Ox, S0) {
            console.log('  🧩 [CLONE] throwJsError SUPPRESSED');
            return undefined;
        };

        /* Create clone */
        const clone = new WebAssembly.Instance(savedModule, {
            js_code: cloneJC,
            intrinsics: savedImports.intrinsics || {}
        });
        const ex = clone.exports;

        /* Init */
        try { ex._initialize(); } catch (e) { console.log('  init err:', e.message || e); }
        try { ex.main(); } catch (e) { console.log('  main err:', e.message || e); }

        /* If custom data provided, search and replace in memory */
        if (customData && encryptedData) {
            const mem = new Uint8Array(ex.memory.buffer);
            const searchStr = encryptedData;
            const searchBytes = new TextEncoder().encode(searchStr);

            console.log('🧩 Searching memory for encrypted data (' + searchBytes.length + ' bytes)...');

            /* Search for the first 20 bytes of the encrypted string */
            const searchSlice = searchBytes.slice(0, 20);
            let found = false;

            for (let offset = 0; offset < mem.length - 20; offset++) {
                let match = true;
                for (let j = 0; j < 20; j++) {
                    if (mem[offset + j] !== searchSlice[j]) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    console.log('✅ FOUND at offset ' + offset + '!');
                    encryptedOffset = offset;
                    encryptedLength = searchBytes.length;
                    console.log('   Context:', Array.from(mem.slice(Math.max(0, offset - 5), offset + searchBytes.length + 5))
                        .map(function (b) { return b.toString(16).padStart(2, '0'); }).join(' '));

                    /* Replace with custom data */
                    const replaceBytes = new TextEncoder().encode(customData);
                    console.log('   Writing ' + replaceBytes.length + ' bytes of custom data...');

                    /* Zero out old data area first */
                    const areaLen = Math.max(searchBytes.length, replaceBytes.length);
                    for (let k = 0; k < areaLen; k++) {
                        mem[offset + k] = 0;
                    }
                    /* Write new data */
                    for (let k = 0; k < replaceBytes.length; k++) {
                        mem[offset + k] = replaceBytes[k];
                    }

                    console.log('   ✓ Memory patched');
                    found = true;
                    break;
                }
            }

            if (!found) {
                console.log('❌ Encrypted data NOT FOUND in Wasm memory');
                console.log('   Dumping last 2000 bytes of memory for analysis...');
                dumpMemoryTail(ex.memory, 2000);
            }
        } else if (!customData) {
            /* First run: dump memory for analysis */
            console.log('🧩 Dumping clone memory tail for analysis...');
            dumpMemoryTail(ex.memory, 2000);
        }

        /* Call q3v() */
        console.log('🧩 Calling q3v() on clone...');
        try {
            ex.q3v();
        } catch (err) {
            console.log('  ⚠️ q3v() threw (expected):', String(err).substring(0, 60));
        }

        return capturedOutput;
    }

    /* ───────── Memory analysis ───────── */
    function dumpMemoryTail(wasmMemory, size) {
        const mem = new Uint8Array(wasmMemory.buffer);
        const start = Math.max(0, mem.length - size);
        console.log('  Memory size:', mem.length, 'bytes');
        console.log('  Dumping offset', start, 'to', mem.length);

        /* Look for ASCII strings (base64 chars) */
        let strings = [];
        let current = '';
        let currentStart = -1;

        for (let i = start; i < mem.length; i++) {
            const b = mem[i];
            if (b >= 32 && b <= 126) {
                if (currentStart === -1) currentStart = i;
                current += String.fromCharCode(b);
            } else {
                if (current.length >= 20) {
                    strings.push({ offset: currentStart, length: current.length, text: current });
                }
                current = '';
                currentStart = -1;
            }
        }
        if (current.length >= 20) {
            strings.push({ offset: currentStart, length: current.length, text: current });
        }

        console.log('  Found ' + strings.length + ' strings (>=20 chars):');
        strings.slice(-20).forEach(function (s) {
            const preview = s.text.substring(0, 80);
            console.log('    @' + s.offset + ' (' + s.length + '): "' + preview + (s.length > 80 ? '...' : '') + '"');
        });
    }

    /* ───────── Main decrypt function ───────── */
    window.decrypt = async function (newEncryptedData) {
        if (!savedModule) {
            console.log('❌ Wasm module not loaded. Click a movie first.');
            return null;
        }

        if (!encryptedData) {
            console.log('❌ No reference encrypted data captured yet. Click a movie first.');
            return null;
        }

        console.log('🔓 Decrypting custom data (' + newEncryptedData.length + ' chars)...');
        const result = await buildClone(newEncryptedData);

        if (result) {
            console.log('🔓 Decryption successful!');
            try { return JSON.parse(result); } catch (e) { return result; }
        } else {
            console.log('❌ No output captured from clone');
            return null;
        }
    };

    /* ───────── Auto-build first clone after site decrypt ───────── */
    let firstDone = false;
    const _op = JSON.parse;
    JSON.parse = function (text, reviver) {
        const r = _op.call(this, text, reviver);
        if (!firstDone && text && typeof text === 'string' && text.includes('"stream"')) {
            firstDone = true;
            setTimeout(async function () {
                console.log('');
                console.log('🧩 First decrypt seen. Building analysis clone...');
                await buildClone(null); // no custom data, just analyze
                console.log('');
                console.log('✅ Analysis complete. Ready for custom decryption.');
                console.log('🔓 Usage: await decrypt("your_encrypted_base64_string")');
                console.log('');
            }, 500);
        }
        return r;
    };

    console.log('🔓 Decryptor v16 ready — click a movie');
})();
