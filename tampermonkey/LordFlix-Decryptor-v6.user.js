// ==UserScript==
// @name         LordFlix Decryptor v6
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  Extract standalone decrypt function from Kotlin/Wasm
// @match        https://lordflix.org/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    /* ───────── Hook 1: JSON.parse — capture decrypted results ───────── */
    const origParse = JSON.parse;
    JSON.parse = function (text, reviver) {
        const result = origParse.call(this, text, reviver);
        if (text && typeof text === 'string' && text.includes('"stream"')) {
            console.log('🎬 Decrypted via JSON.parse!');
            console.log(result);
            window.__lastDecrypted = result;
        }
        return result;
    };

    /* ───────── Hook 2: WebAssembly.instantiateStreaming ───────── */
    const origIST = WebAssembly.instantiateStreaming;
    WebAssembly.instantiateStreaming = async function (source, importObject) {
        console.log('🧩 instantiateStreaming intercepted!');

        const result = await origIST.call(this, source, importObject);
        const instance = result.instance;
        const exports = instance.exports;

        console.log('🧩 Wasm module loaded. Exports:', Object.keys(exports));

        /* ── Strategy: Wrap q3v export as a JS function ── */
        if (exports.q3v && typeof exports.q3v === 'function') {
            const origQ3v = exports.q3v;

            // Replace the Wasm export with our wrapper
            exports.q3v = function q3vWrapper() {
                console.log('🧩 q3v() called by site code!');

                // Call original Wasm q3v() — runs at the CORRECT time (after init)
                let Td;
                try {
                    Td = origQ3v();
                    console.log('🧩 q3v() returned Td. Type:', typeof Td);
                    console.log('🧩 Td value:', Td);
                } catch (err) {
                    console.log('❌ q3v() threw:', err.message);
                    return; // don't return broken value
                }

                window.__Td = Td;

                // Td is a Wasm GC struct. Kotlin/Wasm interop allows
                // accessing methods via numeric property index.
                // n[358](b) in the site code = Td[358] is the decrypt function
                if (Td !== null && Td !== undefined) {
                    console.log('🧩 Attempting to extract Td[358] (decrypt function)...');

                    // Try numeric property access (Kotlin/Wasm interop)
                    try {
                        const fn358 = Td[358];
                        console.log('🧩 Td[358] type:', typeof fn358, 'value:', fn358);

                        if (typeof fn358 === 'function') {
                            window.decrypt = fn358;
                            console.log('✅ window.decrypt = Td[358] — standalone decrypt function READY!');
                        } else if (fn358 !== undefined) {
                            // It might return something else — try calling it
                            console.log('🧩 Td[358] is not a function, it\'s:', typeof fn358);
                            console.log('🧩 Attempting to call it with test data...');

                            try {
                                const testResult = fn358('test');
                                console.log('🧩 Td[358]("test") returned:', typeof testResult, testResult);
                            } catch (callErr) {
                                console.log('🧩 Td[358]("test") threw:', callErr.message);
                            }
                        }
                    } catch (e) {
                        console.log('❌ Error accessing Td[358]:', e.message);
                    }

                    // Also try other numeric indices to map the struct
                    console.log('🧩 Probing Td struct for available methods...');
                    for (let i = 350; i <= 365; i++) {
                        try {
                            const prop = Td[i];
                            if (prop !== undefined) {
                                console.log('  Td[' + i + ']:', typeof prop);
                            }
                        } catch (ignored) {
                            // some indices may throw
                        }
                    }
                } else {
                    console.log('⚠️ q3v() returned null/undefined');
                }

                // Return original Td so site works normally
                return Td;
            };

            console.log('🧩 q3v() wrapped with interceptor ✓');
        }

        return result;
    };

    /* ───────── Hook 3: Expose window.decrypt test ───────── */
    window.testDecrypt = function (encryptedData) {
        if (!window.decrypt) {
            console.log('❌ window.decrypt not available yet. Click a movie first.');
            return;
        }
        try {
            const result = window.decrypt(encryptedData);
            console.log('🔓 Decrypted:', result);
            try {
                return JSON.parse(result);
            } catch (ignored) {
                return result;
            }
        } catch (err) {
            console.log('❌ decrypt() threw:', err.message);
        }
    };

    console.log('🔓 Decryptor v6 ready — click a movie to extract!');
    console.log('🔓 After extraction, use: testDecrypt("encrypted_data_string")');
})();
