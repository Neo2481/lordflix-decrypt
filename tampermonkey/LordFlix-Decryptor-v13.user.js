// ==UserScript==
// @name         LordFlix Decryptor v13
// @namespace    http://tampermonkey.net/
// @version      13.0
// @description  Suppress throwJsError on clone so q3v() returns Td normally
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

            if (!extractionDone && savedModule) {
                extractionDone = true;
                console.log('🧩 Decrypt seen! Extracting in 200ms...');
                setTimeout(cloneAndExtract, 200);
            }
        }
        return result;
    };

    /* ───────── Hook 2: instantiateStreaming — save + trace originals ───────── */
    const origIST = WebAssembly.instantiateStreaming;
    WebAssembly.instantiateStreaming = async function (source, importObject) {
        console.log('🧩 instantiateStreaming — saving + tracing...');

        /* Hook js_code on ORIGINAL to trace site's successful decrypt */
        if (importObject && importObject.js_code) {
            const origJC = importObject.js_code;
            for (const key of Object.keys(origJC)) {
                if (typeof origJC[key] === 'function') {
                    const realFn = origJC[key];
                    const k = key;
                    origJC[key] = function () {
                        const args = Array.from(arguments);
                        const result = realFn.apply(this, arguments);
                        /* Trace string-returning calls (likely decrypt-related) */
                        if (typeof result === 'string' && result.length > 20) {
                            console.log('  📡 [SITE] ' + k + ' → "' + result.substring(0, 120) + '"');
                        }
                        return result;
                    };
                }
            }
        }

        const result = await origIST.call(this, source, importObject);
        savedModule = result.module;
        savedImports = importObject;
        console.log('🧩 Saved. Exports:', Object.keys(result.instance.exports));
        return result;
    };

    /* ───────── Clone + suppress throwJsError ───────── */
    async function cloneAndExtract() {
        try {
            /* Create clone imports — shallow copy of js_code (preserves hooks) */
            const cloneImports = {
                js_code: Object.assign({}, savedImports.js_code),
                intrinsics: Object.assign({}, savedImports.intrinsics)
            };

            /* CRITICAL: Make throwJsError NOT throw on the clone!
             * v12 showed q3v() on clone successfully decrypts (importStringFromWasm
             * returns the full JSON), but then calls throwJsError which throws
             * a WebAssembly.Exception. By suppressing it, q3v() should return Td. */
            cloneImports.js_code['kotlin.wasm.internal.throwJsError'] = function (Tx, Ox, S0) {
                console.log('🧩 throwJsError SUPPRESSED on clone');
                console.log('  Tx:', typeof Tx, Tx !== undefined ? String(Tx).substring(0, 200) : Tx);
                console.log('  Ox:', typeof Ox, Ox !== undefined ? String(Ox).substring(0, 200) : Ox);
                console.log('  S0:', typeof S0, S0 !== undefined ? String(S0).substring(0, 200) : S0);
                /* DON'T throw — return undefined to let Wasm continue */
                return undefined;
            };

            /* Also hook getCachedJsObject to see Td property access */
            const origGetCached = cloneImports.js_code['kotlin.wasm.internal.getCachedJsObject_$external_fun'];
            if (origGetCached) {
                cloneImports.js_code['kotlin.wasm.internal.getCachedJsObject_$external_fun'] = function (Tx, Ox) {
                    const result = origGetCached(Tx, Ox);
                    console.log('  📡 [CLONE] getCachedJsObject(' + typeof Tx + ', ' + Ox + ') →', typeof result);
                    if (typeof result === 'function') {
                        console.log('    → function named:', result.name || '(anonymous)');
                    }
                    return result;
                };
            }

            /* Hook importStringFromWasm on clone to see decrypted output */
            const origImportStr = cloneImports.js_code['kotlin.wasm.internal.importStringFromWasm'];
            if (origImportStr) {
                cloneImports.js_code['kotlin.wasm.internal.importStringFromWasm'] = function (Tx, Ox, S0) {
                    const result = origImportStr.call(this, Tx, Ox, S0);
                    if (typeof result === 'string' && result.length > 20) {
                        console.log('  📡 [CLONE] importStringFromWasm → "' + result.substring(0, 120) + '"');
                    }
                    return result;
                };
            }

            console.log('🧩 Creating clone with suppressed throwJsError...');
            const clone = new WebAssembly.Instance(savedModule, cloneImports);
            const ex = clone.exports;

            /* Init sequence */
            console.log('🧩 _initialize()...');
            try { ex._initialize(); console.log('    ✓'); } catch (e) { console.log('    ✗', e.message || e); }

            console.log('🧩 main()...');
            try { ex.main(); console.log('    ✓'); } catch (e) { console.log('    ✗', e.message || e); }

            /* Now q3v() — with throwJsError suppressed */
            console.log('🧩 q3v() with suppressed throwJsError...');
            let Td;
            try {
                Td = ex.q3v();
                console.log('✅ q3v() RETURNED! Type:', typeof Td);
                console.log('   Td:', Td);
            } catch (err) {
                console.log('❌ q3v() still threw:', err.message || err);
                console.log('   String:', String(err));
                return;
            }

            if (Td === null || Td === undefined) {
                console.log('⚠️ q3v() returned null/undefined');
                return;
            }

            window.__Td = Td;

            /* Examine Td */
            console.log('=== Td Inspection ===');
            console.log('typeof:', typeof Td);
            console.log('String():', String(Td));
            console.log('constructor:', Td.constructor ? Td.constructor.name : 'N/A');

            /* Try numeric properties */
            console.log('Probing numeric properties...');
            const found = [];
            for (let i = 0; i <= 500; i++) {
                try {
                    const v = Td[i];
                    if (v !== undefined) {
                        found.push('Td[' + i + ']: ' + typeof v + (typeof v === 'function' ? ' [FUNC]' : ''));
                    }
                } catch (e) { /* skip */ }
            }
            if (found.length > 0) {
                console.log('  Found (' + found.length + '):', found.join(', '));
            } else {
                console.log('  None found (0-500)');
            }

            /* Try Object.keys and getOwnPropertyNames */
            try { console.log('  Object.keys:', Object.keys(Td)); } catch (e) {}
            try { console.log('  OwnPropertyNames:', Object.getOwnPropertyNames(Td)); } catch (e) {}

            /* Try accessing Td[358] */
            try {
                const fn = Td[358];
                console.log('Td[358]:', typeof fn);
                if (typeof fn === 'function') {
                    window.decrypt = fn;
                    console.log('✅✅✅ window.decrypt = Td[358] — STANDALONE DECRYPT READY! ✅✅✅');

                    /* Test with saved encrypted input */
                    if (window.__lastEncryptedInput) {
                        console.log('🧩 Testing with saved encrypted input...');
                        try {
                            const testResult = fn(window.__lastEncryptedInput);
                            console.log('🔓 Test decrypt result:', testResult);
                        } catch (te) {
                            console.log('❌ Test threw:', te.message || te);
                        }
                    }
                }
            } catch (e) {
                console.log('❌ Td[358] error:', e.message || e);
            }

        } catch (err) {
            console.log('❌ Fatal:', err.message || err, err.stack || '');
        }
    }

    /* ───────── Test function ───────── */
    window.testDecrypt = function (data) {
        if (!window.decrypt) { console.log('❌ Not ready yet'); return null; }
        try {
            const raw = window.decrypt(data);
            console.log('🔓 Result:', raw);
            try { return JSON.parse(raw); } catch (e) { return raw; }
        } catch (e) { console.log('❌', e.message || e); }
    };

    console.log('🔓 Decryptor v13 ready — click a movie');
})();
