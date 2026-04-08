// ==UserScript==
// @name         LordFlix Decryptor v11
// @namespace    http://tampermonkey.net/
// @version      11.0
// @description  Clone Wasm + explicit init sequence to extract decrypt function
// @match        https://lordflix.org/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    let savedModule = null;
    let savedImports = null;
    let extractionDone = false;

    /* ───────── Hook 1: JSON.parse ───────── */
    const origParse = JSON.parse;
    JSON.parse = function (text, reviver) {
        const result = origParse.call(this, text, reviver);
        if (text && typeof text === 'string' && text.includes('"stream"')) {
            console.log('🎬 Decrypted via JSON.parse!');
            window.__lastDecrypted = result;
            window.__lastDecryptedRaw = text;

            if (!extractionDone && savedModule && savedImports) {
                extractionDone = true;
                console.log('🧩 First decrypt seen! Extracting in 200ms...');
                setTimeout(cloneAndExtract, 200);
            }
        }
        return result;
    };

    /* ───────── Hook 2: instantiateStreaming — save Module + Imports ───────── */
    const origIST = WebAssembly.instantiateStreaming;
    WebAssembly.instantiateStreaming = async function (source, importObject) {
        console.log('🧩 instantiateStreaming — saving...');
        const result = await origIST.call(this, source, importObject);
        savedModule = result.module;
        savedImports = JSON.parse(JSON.stringify(importObject, function (key, val) {
            if (typeof val === 'function') return '__FUNCTION__:' + val.name || 'anon';
            return val;
        }));
        /* Save the ACTUAL importObject (with real function references) */
        savedImports = importObject;
        console.log('🧩 Module + Imports saved');
        return result;
    };

    /* ───────── Clone + Init + Extract ───────── */
    async function cloneAndExtract() {
        try {
            /* Step 1: Create fresh instance */
            console.log('🧩 [1] Creating clone instance...');
            const clone = new WebAssembly.Instance(savedModule, savedImports);
            const ex = clone.exports;
            console.log('    Clone created. Exports:', Object.keys(ex));

            /* Step 2: Check _initialize — is it a function? */
            console.log('🧩 [2] _initialize:', typeof ex._initialize);

            /* Step 3: Try explicit _initialize() (might be idempotent if start section ran it) */
            if (typeof ex._initialize === 'function') {
                try {
                    console.log('    Calling _initialize() explicitly...');
                    ex._initialize();
                    console.log('    _initialize() completed ✓');
                } catch (initErr) {
                    console.log('    _initialize() threw:', initErr.message || initErr);
                }
            }

            /* Step 4: Try main() — some Kotlin/Wasm modules need main() before q3v() */
            if (typeof ex.main === 'function') {
                try {
                    console.log('🧩 [3] Calling main()...');
                    ex.main();
                    console.log('    main() completed ✓');
                } catch (mainErr) {
                    console.log('    main() threw:', mainErr.message || mainErr);
                }
            }

            /* Step 5: Now try q3v() */
            console.log('🧩 [4] Calling q3v()...');
            let Td;
            try {
                Td = ex.q3v();
                console.log('    q3v() returned! Type:', typeof Td);
            } catch (qErr) {
                console.log('    q3v() threw:', qErr.message || qErr);

                /* If still null pointer, try with the ORIGINAL instance's exports
                 * (the site already called q3v() on it successfully, but it can only
                 *  be called once — so this will likely fail too, but let's confirm) */
                console.log('🧩 [5] Clone failed. Trying alternate approach...');

                /* Alternate: hook into the site's existing Td by intercepting
                 * the specific property access pattern */
                alternateExtract();
                return;
            }

            /* Step 6: Examine Td */
            window.__Td = Td;
            examineTd(Td);

        } catch (err) {
            console.log('❌ Clone failed:', err.message || err);
        }
    }

    /* ───────── Alternate approach: Intercept at the caller level ─────────
     * Since we can't Proxy Wasm GC structs or modify frozen exports,
     * we'll intercept at the JAVASCRIPT level where y6(b) calls n[358](b).
     *
     * The site code pattern is approximately:
     *   const n = await T6();          // n = Td
     *   const result = n[358](b);      // b = encrypted data
     *   return JSON.parse(result);
     *
     * We know this happens inside N0f0gQZp.js.
     * Strategy: Hook String.prototype methods that Td[358] might call internally,
     * since the decrypt function likely uses JS string operations via js_code imports.
     */
    function alternateExtract() {
        console.log('🧩 Alternate: Setting up JS-level hooks...');

        /* The Kotlin/Wasm decrypt function uses js_code imports to interact with JS.
         * Key imports include:
         *   - kotlin.wasm.internal.externrefToString
         *   - kotlin.wasm.internal.jsExportStringToWasm
         *   - kotlin.wasm.internal.stringLength
         *   - kotlin.wasm.internal.importStringFromWasm
         *
         * We can hook these to capture the decrypt function's behavior.
         */

        /* Hook String.fromCharCode — used by Wasm to construct strings */
        const origFromCharCode = String.fromCharCode;
        let fromCharCodeCalls = [];
        String.fromCharCode = function () {
            const result = origFromCharCode.apply(this, arguments);
            fromCharCodeCalls.push(result);
            if (fromCharCodeCalls.length > 1000) fromCharCodeCalls.shift();
            return result;
        };

        /* Hook TextDecoder — used by Wasm to decode byte arrays to strings */
        const OrigTextDecoder = TextDecoder;
        const origDecode = TextDecoder.prototype.decode;
        TextDecoder.prototype.decode = function (input) {
            const result = origDecode.call(this, input);
            /* Check if result looks like decrypted JSON */
            if (typeof result === 'string' && result.length > 50 && result.includes('"')) {
                console.log('🧩 TextDecoder decoded potential JSON:', result.substring(0, 200));
            }
            return result;
        };

        console.log('    JS hooks installed. Click another movie to capture decrypt internals.');

        /* Also: save the js_code functions for inspection */
        if (savedImports && savedImports.js_code) {
            console.log('    js_code functions available for inspection:');
            console.log('    window.__js_code =', savedImports.js_code);
            window.__js_code = savedImports.js_code;
        }
    }

    function examineTd(Td) {
        if (Td === null || Td === undefined) {
            console.log('⚠️ Td is', Td);
            return;
        }

        console.log('=== Td Inspection ===');
        console.log('typeof:', typeof Td);
        console.log('String():', String(Td));
        console.log('constructor:', Td.constructor ? Td.constructor.name : 'N/A');

        /* Try Object.keys */
        try {
            const keys = Object.keys(Td);
            console.log('Object.keys:', keys);
        } catch (e) {
            console.log('Object.keys: (throws)', e.message);
        }

        /* Try getOwnPropertyNames */
        try {
            const own = Object.getOwnPropertyNames(Td);
            console.log('ownPropertyNames:', own);
        } catch (e) {
            console.log('ownPropertyNames: (throws)', e.message);
        }

        /* Try numeric access 0-500 */
        console.log('Numeric probe (0-400):');
        const found = [];
        for (let i = 0; i <= 400; i++) {
            try {
                const v = Td[i];
                if (v !== undefined) {
                    found.push(i + ':' + typeof v);
                }
            } catch (e) { /* skip */ }
        }
        if (found.length > 0) {
            console.log('  Found:', found.join(', '));
        } else {
            console.log('  None found');
        }

        /* Try calling Td[358] if it exists */
        try {
            const fn = Td[358];
            console.log('Td[358]:', typeof fn);
            if (typeof fn === 'function') {
                window.decrypt = fn;
                console.log('✅ window.decrypt = Td[358] — READY!');

                /* Test with saved data */
                if (window.__lastEncryptedInput) {
                    try {
                        const test = fn(window.__lastEncryptedInput);
                        console.log('🧩 Test decrypt result:', test);
                    } catch (te) {
                        console.log('🧩 Test decrypt threw:', te.message || te);
                    }
                }
            }
        } catch (e) {
            console.log('Td[358] error:', e.message || e);
        }
    }

    /* ───────── Test function ───────── */
    window.testDecrypt = function (encryptedData) {
        if (!window.decrypt) {
            console.log('❌ window.decrypt not ready yet.');
            return null;
        }
        try {
            const raw = window.decrypt(encryptedData);
            try { return JSON.parse(raw); } catch (e) { return raw; }
        } catch (err) {
            console.log('❌ Error:', err.message || err);
        }
    };

    /* ───────── Manual extract trigger ───────── */
    window.runExtract = function () {
        if (savedModule && savedImports) {
            cloneAndExtract();
        } else {
            console.log('❌ Wasm module not loaded yet. Click a movie first.');
        }
    };

    console.log('🔓 Decryptor v11 ready — click a movie');
})();
