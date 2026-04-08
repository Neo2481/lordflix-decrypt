// ==UserScript==
// @name         LordFlix Decryptor v8
// @namespace    http://tampermonkey.net/
// @version      8.0
// @description  Extract decrypt function via Proxy on return value (no frozen object mutation)
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

    /* ───────── Hook 2: WebAssembly.instantiateStreaming ─────────
     * Strategy: Wrap the RETURN VALUE, not the frozen exports.
     * Site does: result = await instantiateStreaming(...)
     *            instance.exports.q3v()  →  Td  →  Td[358](data)
     * We intercept at .exports level to wrap q3v without touching frozen objects.
     */
    const origIST = WebAssembly.instantiateStreaming;
    WebAssembly.instantiateStreaming = async function (source, importObject) {
        console.log('🧩 instantiateStreaming intercepted!');
        const realResult = await origIST.call(this, source, importObject);
        const realExports = realResult.instance.exports;

        console.log('🧩 Exports:', Object.keys(realExports));

        // Save raw references for the wrapper
        const origQ3v = realExports.q3v;

        // Return a lookalike object with proxied instance
        const wrappedResult = {
            instance: Object.create(null)
        };

        // Proxy the instance so .exports returns our wrapped version
        Object.defineProperty(wrappedResult.instance, 'exports', {
            get: function () {
                console.log('🧩 .exports accessed — returning wrapped exports');

                // Return a Proxy over the REAL exports
                // This never mutates the frozen original — just intercepts reads
                return new Proxy(realExports, {
                    get: function (target, prop, receiver) {
                        if (prop === 'q3v') {
                            console.log('🧩 .q3v accessed — returning wrapper function');
                            // Return our wrapper that intercepts the CALL
                            return function q3vInterceptor() {
                                console.log('🧩 q3v() called by site!');
                                let Td;
                                try {
                                    Td = origQ3v.call(this);
                                    console.log('🧩 q3v() returned. Type:', typeof Td);
                                    window.__Td = Td;
                                } catch (err) {
                                    console.log('❌ q3v() threw:', err.message);
                                    throw err; // re-throw so site sees the error
                                }

                                // Now try to intercept access on Td
                                if (Td !== null && Td !== undefined) {
                                    try {
                                        const proxiedTd = new Proxy(Td, {
                                            get: function (tgt, p, rcv) {
                                                const val = Reflect.get(tgt, p, rcv);
                                                if (p === '358') {
                                                    console.log('🔑 Td[358] accessed! Type:', typeof val);
                                                    if (typeof val === 'function') {
                                                        window.decrypt = val;
                                                        console.log('✅ window.decrypt = Td[358] — READY!');
                                                    }
                                                }
                                                return val;
                                            }
                                        });
                                        return proxiedTd;
                                    } catch (e) {
                                        // If Proxy on Td fails, try direct access (read-only)
                                        console.log('⚠️ Cannot Proxy Td:', e.message);
                                        try {
                                            const fn = Td[358];
                                            console.log('🧩 Direct Td[358]:', typeof fn);
                                            if (typeof fn === 'function') {
                                                window.decrypt = fn;
                                                console.log('✅ window.decrypt = Td[358] — READY!');
                                            }
                                        } catch (e2) {
                                            console.log('❌ Cannot access Td[358]:', e2.message);
                                        }
                                        return Td;
                                    }
                                }
                                return Td;
                            };
                        }

                        // All other exports pass through normally
                        return Reflect.get(target, prop, receiver);
                    }
                });
            },
            enumerable: true,
            configurable: true
        });

        // Copy other instance properties (if any)
        for (const key of Object.keys(realResult.instance)) {
            if (key !== 'exports') {
                try {
                    Object.defineProperty(wrappedResult.instance, key, {
                        value: realResult.instance[key],
                        enumerable: true,
                        configurable: true
                    });
                } catch (ignored) {}
            }
        }

        return wrappedResult;
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
            try { return JSON.parse(raw); } catch (ignored) { return raw; }
        } catch (err) {
            console.log('❌ Error:', err.message);
        }
    };

    console.log('🔓 Decryptor v8 ready — click a movie');
})();
