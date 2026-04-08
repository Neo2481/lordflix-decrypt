// ==UserScript==
// @name         LordFlix Decryptor v9
// @namespace    http://tampermonkey.net/
// @version      9.0
// @description  Extract decrypt function — save reference, call AFTER site decrypts
// @match        https://lordflix.org/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    /* ───────── Hook 1: JSON.parse ───────── */
    const origParse = JSON.parse;
    let decryptExtracted = false;

    JSON.parse = function (text, reviver) {
        const result = origParse.call(this, text, reviver);
        if (text && typeof text === 'string' && text.includes('"stream"')) {
            console.log('🎬 Decrypted via JSON.parse!');
            console.log(result);
            window.__lastDecrypted = result;

            /* Trigger extraction AFTER first successful site decryption */
            if (!decryptExtracted && window.__wasmExports) {
                decryptExtracted = true;
                console.log('🧩 First decrypt seen! Scheduling extraction...');
                setTimeout(tryExtract, 100);
            }
        }
        return result;
    };

    /* ───────── Hook 2: instantiateStreaming — SAVE ONLY, no modification ───────── */
    const origIST = WebAssembly.instantiateStreaming;
    WebAssembly.instantiateStreaming = async function (source, importObject) {
        console.log('🧩 instantiateStreaming — saving reference...');
        const result = await origIST.call(this, source, importObject);

        /* Save reference — DO NOT modify result or exports */
        window.__wasmExports = result.instance.exports;
        window.__wasmModule = result.module;
        console.log('🧩 Exports saved:', Object.keys(window.__wasmExports));

        /* Return result COMPLETELY UNCHANGED */
        return result;
    };

    /* ───────── Extraction — runs after site has successfully decrypted ───────── */
    function tryExtract() {
        try {
            console.log('🧩 Calling q3v() on saved exports...');
            const Td = window.__wasmExports.q3v();
            console.log('🧩 q3v() returned. Type:', typeof Td);
            console.log('🧩 Td constructor:', Td && Td.constructor ? Td.constructor.name : 'N/A');

            window.__Td = Td;

            if (Td === null || Td === undefined) {
                console.log('❌ q3v() returned null/undefined');
                return;
            }

            /* Try to access Td[358] */
            console.log('🧩 Accessing Td[358]...');
            const fn = Td[358];
            console.log('🧩 Td[358] type:', typeof fn);
            console.log('🧩 Td[358] value:', fn);

            if (typeof fn === 'function') {
                window.decrypt = fn;
                console.log('✅ window.decrypt = Td[358] — STANDALONE DECRYPT READY!');
                console.log('🔓 Usage: testDecrypt("encrypted_base64_string")');
            } else {
                console.log('⚠️ Td[358] is not a function. Dumping Td properties...');
                dumpTd(Td);
            }
        } catch (err) {
            console.log('❌ Extraction failed:', err.name, '-', err.message);
            console.log('  Stack:', err.stack);
        }
    }

    function dumpTd(Td) {
        /* Try numeric indices */
        console.log('  Numeric probe:');
        for (let i = 0; i <= 400; i++) {
            try {
                const v = Td[i];
                if (v !== undefined) {
                    console.log('    Td[' + i + ']:', typeof v);
                }
            } catch (e) { /* skip */ }
        }

        /* Try string keys */
        console.log('  String keys:', Object.keys(Td));
        console.log('  Proto:', Object.getPrototypeOf(Td));

        /* Try typeof/symbol inspection */
        console.log('  typeof Td:', typeof Td);
        console.log('  Td.toString():', String(Td));
        try { console.log('  JSON:', JSON.stringify(Td)); } catch (e) { console.log('  JSON: (throws)'); }
    }

    /* ───────── Test function ───────── */
    window.testDecrypt = function (encryptedData) {
        if (!window.decrypt) {
            console.log('❌ window.decrypt not ready. Click a movie first.');
            return null;
        }
        try {
            const raw = window.decrypt(encryptedData);
            console.log('🔓 Raw result:', raw);
            try { return JSON.parse(raw); } catch (ignored) { return raw; }
        } catch (err) {
            console.log('❌ Error:', err.message);
        }
    };

    console.log('🔓 Decryptor v9 ready — click a movie');
})();
