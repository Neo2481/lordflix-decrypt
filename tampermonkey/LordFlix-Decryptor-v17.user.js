// ==UserScript==
// @name         LordFlix Decryptor v17
// @namespace    http://tampermonkey.net/
// @version      17.0
// @description  Full memory search + patch to decrypt arbitrary data
// @match        https://lordflix.org/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    let savedModule = null;
    let savedImports = null;
    let encryptedRef = null;  // reference encrypted string from site
    let dataLocation = null;  // {offset, length} in Wasm memory

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

            /* Capture encrypted input on ORIGINAL */
            const origESW = jc['kotlin.wasm.internal.jsExportStringToWasm'];
            if (origESW) {
                jc['kotlin.wasm.internal.jsExportStringToWasm'] = function (Tx, Ox, S0, D0) {
                    if (typeof Tx === 'string' && Tx.length > 50) {
                        encryptedRef = Tx;
                        console.log('🔑 Captured encrypted data (' + Tx.length + ' chars)');
                    }
                    return origESW.call(this, Tx, Ox, S0, D0);
                };
            }
        }

        const result = await origIST.call(this, source, importObject);
        savedModule = result.module;
        savedImports = importObject;
        return result;
    };

    /* ───────── Search entire memory for a byte pattern ───────── */
    function findInMemory(mem, searchStr) {
        const search = new TextEncoder().encode(searchStr);
        const data = new Uint8Array(mem.buffer);
        const len = Math.min(search.length, 16); // use first 16 bytes for speed

        console.log('🔍 Searching ' + data.length + ' bytes for pattern (' + len + ' bytes):');
        console.log('   ' + Array.from(search.slice(0, len)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(' '));

        for (let i = 0; i < data.length - len; i++) {
            let match = true;
            for (let j = 0; j < len; j++) {
                if (data[i + j] !== search[j]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                /* Verify full string match */
                let fullMatch = true;
                for (let j = 0; j < search.length && (i + j) < data.length; j++) {
                    if (data[i + j] !== search[j]) {
                        fullMatch = false;
                        break;
                    }
                }
                console.log('✅ FOUND at offset ' + i + '!');
                /* Show context bytes */
                const ctxStart = Math.max(0, i - 8);
                const ctxEnd = Math.min(data.length, i + search.length + 8);
                const ctx = Array.from(data.slice(ctxStart, ctxEnd))
                    .map(function (b, idx) {
                        const absIdx = ctxStart + idx;
                        const marker = (absIdx >= i && absIdx < i + search.length) ? '►' : ' ';
                        return marker + b.toString(16).padStart(2, '0');
                    }).join(' ');
                console.log('   Context: ' + ctx);
                return { offset: i, length: search.length };
            }
        }
        console.log('❌ Pattern NOT FOUND in memory');
        return null;
    }

    /* ───────── Dump all non-zero memory regions ───────── */
    function dumpAllStrings(mem) {
        const data = new Uint8Array(mem.buffer);
        let strings = [];
        let cur = '';
        let curStart = -1;

        for (let i = 0; i < data.length; i++) {
            const b = data[i];
            if (b >= 32 && b <= 126) {
                if (curStart === -1) curStart = i;
                cur += String.fromCharCode(b);
            } else {
                if (cur.length >= 10) {
                    strings.push({ offset: curStart, length: cur.length, text: cur });
                }
                cur = '';
                curStart = -1;
            }
        }
        if (cur.length >= 10) {
            strings.push({ offset: curStart, length: cur.length, text: cur });
        }

        console.log('  Found ' + strings.length + ' strings (>=10 chars) in ' + data.length + ' bytes:');
        strings.forEach(function (s) {
            const preview = s.text.length > 60 ? s.text.substring(0, 60) + '...' : s.text;
            console.log('    @' + String(s.offset).padStart(5) + ' (' + String(s.length).padStart(3) + '): "' + preview + '"');
        });
    }

    /* ───────── Create a clone with custom encrypted data ───────── */
    async function createCloneAndDecrypt(customData) {
        /* Build clone imports */
        const cloneJC = {};
        for (const key of Object.keys(savedImports.js_code)) {
            cloneJC[key] = savedImports.js_code[key];
        }

        let capturedOutput = null;

        /* Hook importStringFromWasm to capture output */
        const origISFW = cloneJC['kotlin.wasm.internal.importStringFromWasm'];
        cloneJC['kotlin.wasm.internal.importStringFromWasm'] = function (Tx, Ox, S0) {
            const result = origISFW.call(this, Tx, Ox, S0);
            if (typeof result === 'string' && result.length > 20) {
                console.log('  📡 [CLONE] → "' + result.substring(0, 80) + '..."');
                capturedOutput = result;
            }
            return result;
        };

        /* Suppress throwJsError */
        cloneJC['kotlin.wasm.internal.throwJsError'] = function (Tx, Ox, S0) {
            console.log('  🧩 throwJsError SUPPRESSED');
            return undefined;
        };

        /* Create clone */
        console.log('🧩 Creating clone...');
        const clone = new WebAssembly.Instance(savedModule, {
            js_code: cloneJC,
            intrinsics: savedImports.intrinsics || {}
        });
        const ex = clone.exports;

        /* Init */
        console.log('🧩 _initialize()...');
        try { ex._initialize(); } catch (e) { console.log('  ✗', e.message || e); }

        console.log('🧩 main()...');
        try { ex.main(); } catch (e) { console.log('  ✗', e.message || e); }

        /* Check memory size after init */
        console.log('🧩 Memory after init:', ex.memory.buffer.byteLength, 'bytes');

        /* If we know the data location from a previous search, patch it */
        if (dataLocation && customData) {
            console.log('🧩 Patching memory at offset ' + dataLocation.offset + '...');
            const mem = new Uint8Array(ex.memory.buffer);
            const replaceBytes = new TextEncoder().encode(customData);

            /* Zero out old data */
            for (let k = 0; k < dataLocation.length + 100; k++) {
                mem[dataLocation.offset + k] = 0;
            }
            /* Write new data */
            for (let k = 0; k < replaceBytes.length; k++) {
                mem[dataLocation.offset + k] = replaceBytes[k];
            }
            console.log('  ✓ Patched ' + replaceBytes.length + ' bytes');
        }

        /* If this is the first run and we have reference data, search for it */
        if (!dataLocation && encryptedRef) {
            console.log('🧩 First run: searching for reference data in memory...');
            dataLocation = findInMemory(ex.memory, encryptedRef);

            if (!dataLocation) {
                /* Also search AFTER q3v() since data might be loaded lazily */
                console.log('🧩 Searching after q3v()...');
            }

            /* Dump all strings for analysis */
            console.log('🧩 Dumping all memory strings...');
            dumpAllStrings(ex.memory);
        }

        /* Call q3v() */
        console.log('🧩 Calling q3v()...');
        try {
            ex.q3v();
        } catch (err) {
            console.log('  ⚠️ q3v() threw:', String(err).substring(0, 60));
        }

        /* If we didn't find data before q3v(), search after */
        if (!dataLocation && encryptedRef) {
            console.log('🧩 Searching memory AFTER q3v()...');
            dataLocation = findInMemory(ex.memory, encryptedRef);

            if (!dataLocation) {
                console.log('🧩 Dumping all strings after q3v()...');
                dumpAllStrings(ex.memory);
            }
        }

        /* Check memory size after q3v */
        console.log('🧩 Memory after q3v():', ex.memory.buffer.byteLength, 'bytes');

        return capturedOutput;
    }

    /* ───────── Main decrypt function ───────── */
    window.decrypt = async function (newData) {
        if (!savedModule) { console.log('❌ Click a movie first'); return null; }
        if (!encryptedRef) { console.log('❌ No reference captured'); return null; }

        console.log('🔓 Decrypting (' + newData.length + ' chars)...');
        const result = await createCloneAndDecrypt(newData);

        if (result) {
            console.log('✅ Decrypted!');
            try { return JSON.parse(result); } catch (e) { return result; }
        }
        console.log('❌ No output');
        return null;
    };

    /* ───────── Auto-analyze after first site decrypt ───────── */
    let analyzed = false;
    const _op = JSON.parse;
    JSON.parse = function (text, reviver) {
        const r = _op.call(this, text, reviver);
        if (!analyzed && text && typeof text === 'string' && text.includes('"stream"')) {
            analyzed = true;
            setTimeout(async function () {
                console.log('');
                console.log('╔══════════════════════════════════════╗');
                console.log('║  ANALYZING WASM MEMORY...            ║');
                console.log('╚══════════════════════════════════════╝');
                await createCloneAndDecrypt(null);
                console.log('');
                if (dataLocation) {
                    console.log('✅ Ready! Usage: await decrypt("encrypted_data")');
                } else {
                    console.log('⚠️ Data location not found in memory. Check string dump above.');
                }
            }, 500);
        }
        return r;
    };

    console.log('🔓 Decryptor v17 ready — click a movie');
})();
