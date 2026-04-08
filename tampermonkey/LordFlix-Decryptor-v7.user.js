// ==UserScript==
// @name         LordFlix Decryptor v7
// @namespace    http://tampermonkey.net/
// @version      7.0
// @description  Extract standalone decrypt function — zero side effects
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
            window.__lastEncryptedInput = text;
        }
        return result;
    };

    /* ───────── Hook 2: WebAssembly.instantiateStreaming ───────── */
    const origIST = WebAssembly.instantiateStreaming;
    WebAssembly.instantiateStreaming = async function (source, importObject) {
        console.log('🧩 instantiateStreaming intercepted!');
        const result = await origIST.call(this, source, importObject);
        const ex = result.instance.exports;

        console.log('🧩 Exports:', Object.keys(ex));

        if (typeof ex.q3v === 'function') {
            const realQ3v = ex.q3v;
            ex.q3v = function () {
                console.log('🧩 q3v() called — wrapping return value...');
                const Td = realQ3v();
                window.__Td = Td;

                // Wrap Td in a Proxy that ONLY observes — never modifies
                const handler = {
                    get(target, prop, receiver) {
                        const val = Reflect.get(target, prop, receiver);

                        if (prop === '358') {
                            console.log('🔑 Td[358] accessed! Type:', typeof val);
                            if (typeof val === 'function') {
                                window.decrypt = val;
                                console.log('✅ window.decrypt is ready!');
                            }
                        }
                        return val;
                    }
                };

                try {
                    // Try wrapping — if Proxy fails on Wasm GC struct, just return as-is
                    return new Proxy(Td, handler);
                } catch (e) {
                    console.log('⚠️ Cannot Proxy Td:', e.message);
                    console.log('🧩 Td type:', typeof Td, 'Td:', Td);
                    // Fallback: try direct access on the original (read-only, no side effects)
                    try {
                        const d = Td[358];
                        console.log('🧩 Direct Td[358] type:', typeof d);
                        if (typeof d === 'function') {
                            window.decrypt = d;
                            console.log('✅ window.decrypt is ready!');
                        }
                    } catch (e2) {
                        console.log('❌ Cannot access Td[358]:', e2.message);
                    }
                    return Td;
                }
            };
            console.log('🧩 q3v() wrapped ✓');
        }

        return result;
    };

    /* ───────── Test function ───────── */
    window.testDecrypt = function (encryptedData) {
        if (!window.decrypt) {
            console.log('❌ window.decrypt not ready. Click a movie first.');
            return null;
        }
        try {
            const raw = window.decrypt(encryptedData);
            console.log('🔓 Raw result:', raw);
            try {
                return JSON.parse(raw);
            } catch (ignored) {
                return raw;
            }
        } catch (err) {
            console.log('❌ Error:', err.message);
        }
    };

    console.log('🔓 Decryptor v7 ready — click a movie');
})();
