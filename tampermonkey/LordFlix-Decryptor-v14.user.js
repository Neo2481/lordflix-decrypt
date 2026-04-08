// ==UserScript==
// @name         LordFlix Decryptor v14
// @namespace    http://tampermonkey.net/
// @version      14.0
// @description  Hook getCachedJsObject to capture Td[358] decrypt function
// @match        https://lordflix.org/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    let savedModule = null;
    let savedImports = null;

    /* ───────── Hook 1: JSON.parse ───────── */
    const origParse = JSON.parse;
    JSON.parse = function (text, reviver) {
        const result = origParse.call(this, text, reviver);
        if (text && typeof text === 'string' && text.includes('"stream"')) {
            console.log('🎬 Decrypted via JSON.parse!');
            window.__lastDecrypted = result;
            window.__lastDecryptedRaw = text;
        }
        return result;
    };

    /* ───────── Hook 2: instantiateStreaming ─────────
     * Hook getCachedJsObject on ORIGINAL imports.
     * When site calls Td[358](data), Kotlin/Wasm interop calls:
     *   getCachedJsObject(Td, 358) → returns the decrypt function
     * We intercept this to save the function.
     */
    const origIST = WebAssembly.instantiateStreaming;
    WebAssembly.instantiateStreaming = async function (source, importObject) {
        console.log('🧩 instantiateStreaming — installing js_code hooks...');

        if (importObject && importObject.js_code) {
            const origJC = importObject.js_code;

            /* CRITICAL HOOK: getCachedJsObject
             * Kotlin/Wasm calls this to access properties on Wasm GC structs.
             * When Td[358] is accessed, this is called as getCachedJsObject(Td, 358).
             * The return value is the actual function reference. */
            const origGetCached = origJC['kotlin.wasm.internal.getCachedJsObject_$external_fun'];
            if (origGetCached) {
                origJC['kotlin.wasm.internal.getCachedJsObject_$external_fun'] = function (Tx, Ox) {
                    const result = origGetCached(Tx, Ox);

                    /* Log all calls for diagnostics */
                    console.log('  📡 getCachedJsObject(Td, ' + Ox + ') →', typeof result);

                    /* When index 358 is accessed, the result IS the decrypt function */
                    if (Ox === 358 && typeof result === 'function') {
                        window.decrypt = result;
                        window.__Td = Tx;
                        console.log('');
                        console.log('🔑🔑🔑 getCachedJsObject(Td, 358) CAPTURED! 🔑🔑🔑');
                        console.log('✅ window.decrypt = the decrypt function');
                        console.log('   Function name:', result.name || '(anonymous)');
                        console.log('   Function length:', result.length);
                        console.log('');
                        console.log('🔓 Usage: testDecrypt("encrypted_base64_string")');
                        console.log('');
                    }

                    return result;
                };
                console.log('🧩 getCachedJsObject hooked ✓');
            }

            /* Also hook importStringFromWasm to see decrypted output */
            const origImportStr = origJC['kotlin.wasm.internal.importStringFromWasm'];
            if (origImportStr) {
                origJC['kotlin.wasm.internal.importStringFromWasm'] = function (Tx, Ox, S0) {
                    const result = origImportStr.call(this, Tx, Ox, S0);
                    if (typeof result === 'string' && result.length > 20) {
                        console.log('  📡 importStringFromWasm → "' + result.substring(0, 100) + '..."');
                    }
                    return result;
                };
            }

            /* Hook externrefToString */
            const origExtToStr = origJC['kotlin.wasm.internal.externrefToString'];
            if (origExtToStr) {
                origJC['kotlin.wasm.internal.externrefToString'] = function (Tx) {
                    const result = origExtToStr(Tx);
                    if (typeof result === 'string' && result.length > 30) {
                        console.log('  📡 externrefToString → "' + result.substring(0, 80) + '..."');
                    }
                    return result;
                };
            }

            /* Hook jsExportStringToWasm to see encrypted data going IN */
            const origExportStr = origJC['kotlin.wasm.internal.jsExportStringToWasm'];
            if (origExportStr) {
                origJC['kotlin.wasm.internal.jsExportStringToWasm'] = function (Tx, Ox, S0, D0) {
                    if (typeof Tx === 'string' && Tx.length > 50) {
                        console.log('  📡 jsExportStringToWasm IN: "' + Tx.substring(0, 60) + '..."');
                        window.__lastEncryptedInput = Tx;
                    }
                    return origExportStr.call(this, Tx, Ox, S0, D0);
                };
            }
        }

        const result = await origIST.call(this, source, importObject);
        savedModule = result.module;
        savedImports = importObject;
        console.log('🧩 All hooks installed. Click a movie.');
        return result;
    };

    /* ───────── Test function ───────── */
    window.testDecrypt = function (data) {
        if (!window.decrypt) {
            console.log('❌ window.decrypt not ready. Click a movie first.');
            return null;
        }
        console.log('🧩 Calling window.decrypt...');
        try {
            const raw = window.decrypt(data);
            console.log('🔓 Raw result:', raw);
            try { return JSON.parse(raw); } catch (e) { return raw; }
        } catch (err) {
            console.log('❌ Error:', err.message || err);
        }
    };

    console.log('🔓 Decryptor v14 ready — click a movie');
})();
