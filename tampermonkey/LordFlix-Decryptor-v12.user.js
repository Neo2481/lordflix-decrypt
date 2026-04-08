// ==UserScript==
// @name         LordFlix Decryptor v12
// @namespace    http://tampermonkey.net/
// @version      12.0
// @description  Hook throwJsError to decode Exception + full js_code trace
// @match        https://lordflix.org/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    let savedModule = null;
    let savedImports = null;
    let extractionDone = false;
    let jsCodeTrace = [];

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

    /* ───────── Hook 2: instantiateStreaming ───────── */
    const origIST = WebAssembly.instantiateStreaming;
    WebAssembly.instantiateStreaming = async function (source, importObject) {
        console.log('🧩 instantiateStreaming — saving...');

        /* Hook js_code functions on the ORIGINAL import to trace site's decrypt */
        if (importObject && importObject.js_code) {
            const orig = importObject.js_code;
            for (const key of Object.keys(orig)) {
                if (typeof orig[key] === 'function') {
                    const realFn = orig[key];
                    const capturedKey = key;
                    importObject.js_code[key] = function () {
                        const args = Array.from(arguments);
                        /* Only trace during decrypt (not during init) */
                        if (extractionDone || window.__traceAll) {
                            console.log('  📡 js_code.' + capturedKey + '(' +
                                args.map(function (a) {
                                    return typeof a === 'string'
                                        ? '"' + a.substring(0, 80) + '"'
                                        : typeof a;
                                }).join(', ') + ')');
                        }
                        return realFn.apply(this, arguments);
                    };
                }
            }
            console.log('🧩 js_code hooks installed on original imports');
        }

        const result = await origIST.call(this, source, importObject);
        savedModule = result.module;
        savedImports = importObject;
        return result;
    };

    /* ───────── Clone with throwJsError hook ───────── */
    async function cloneAndExtract() {
        try {
            /* Create a copy of imports with throwJsError hooked */
            const cloneImports = {
                js_code: Object.assign({}, savedImports.js_code),
                intrinsics: Object.assign({}, savedImports.intrinsics)
            };

            /* Hook throwJsError to decode the Exception */
            const origThrowJsError = cloneImports.js_code['kotlin.wasm.internal.throwJsError'];
            if (origThrowJsError) {
                cloneImports.js_code['kotlin.wasm.internal.throwJsError'] = function (Tx, Ox, S0) {
                    console.log('=== throwJsError CALLED ===');
                    console.log('  Tx:', typeof Tx, Tx);
                    console.log('  Ox:', typeof Ox, Ox);
                    console.log('  S0:', typeof S0, S0);

                    /* Try to extract message from each arg */
                    for (const name of ['Tx', 'Ox', 'S0']) {
                        const arg = arguments[['Tx', 'Ox', 'S0'].indexOf(name)];
                        try {
                            if (arg !== null && arg !== undefined) {
                                console.log('  ' + name + ' typeof:', typeof arg);
                                console.log('  ' + name + ' String():', String(arg));
                                console.log('  ' + name + ' constructor:', arg.constructor ? arg.constructor.name : 'N/A');
                                console.log('  ' + name + ' JSON:', JSON.stringify(arg));
                                if (typeof arg === 'object') {
                                    console.log('  ' + name + ' keys:', Object.getOwnPropertyNames(arg));
                                    console.log('  ' + name + ' proto:', Object.getOwnPropertyNames(Object.getPrototypeOf(arg) || {}));
                                }
                            }
                        } catch (e) {
                            console.log('  ' + name + ' inspect error:', e.message);
                        }
                    }

                    /* Re-throw so we can catch it in our try/catch */
                    throw new Error('WASM_THROW: ' + String(Tx) + ' | ' + String(Ox) + ' | ' + String(S0));
                };
                console.log('🧩 throwJsError hooked on clone imports');
            }

            /* Hook externrefToString to see string conversions */
            const origExternrefToString = cloneImports.js_code['kotlin.wasm.internal.externrefToString'];
            if (origExternrefToString) {
                cloneImports.js_code['kotlin.wasm.internal.externrefToString'] = function (Tx) {
                    const result = origExternrefToString(Tx);
                    console.log('  📡 externrefToString(' + typeof Tx + ') → "' + String(result).substring(0, 100) + '"');
                    return result;
                };
            }

            /* Hook jsExportStringToWasm to see Wasm-bound strings */
            const origExportStr = cloneImports.js_code['kotlin.wasm.internal.jsExportStringToWasm'];
            if (origExportStr) {
                cloneImports.js_code['kotlin.wasm.internal.jsExportStringToWasm'] = function (Tx, Ox, S0, D0) {
                    console.log('  📡 jsExportStringToWasm(' + typeof Tx + ', ' + typeof Ox + ', ' + typeof S0 + ', ' + typeof D0 + ')');
                    return origExportStr.call(this, Tx, Ox, S0, D0);
                };
            }

            /* Hook importStringFromWasm to see strings coming OUT of Wasm */
            const origImportStr = cloneImports.js_code['kotlin.wasm.internal.importStringFromWasm'];
            if (origImportStr) {
                cloneImports.js_code['kotlin.wasm.internal.importStringFromWasm'] = function (Tx, Ox, S0) {
                    const result = origImportStr.call(this, Tx, Ox, S0);
                    console.log('  📡 importStringFromWasm → "' + String(result).substring(0, 100) + '"');
                    return result;
                };
            }

            /* Hook isNullish */
            const origIsNullish = cloneImports.js_code['kotlin.wasm.internal.isNullish'];
            if (origIsNullish) {
                cloneImports.js_code['kotlin.wasm.internal.isNullish'] = function (Tx) {
                    const result = origIsNullish(Tx);
                    console.log('  📡 isNullish(' + typeof Tx + ') →', result);
                    return result;
                };
            }

            /* Create clone instance with hooked imports */
            console.log('🧩 Creating clone with hooked imports...');
            const clone = new WebAssembly.Instance(savedModule, cloneImports);
            const ex = clone.exports;
            console.log('    Clone ready:', Object.keys(ex));

            /* Init sequence */
            console.log('🧩 Running _initialize()...');
            try { ex._initialize(); console.log('    ✓'); } catch (e) { console.log('    ✗', e.message || e); }

            console.log('🧩 Running main()...');
            try { ex.main(); console.log('    ✓'); } catch (e) { console.log('    ✗', e.message || e); }

            /* Now q3v() — with throwJsError hooked, we'll see the exception details */
            console.log('🧩 Calling q3v() on clone...');
            try {
                const Td = ex.q3v();
                console.log('🧩 q3v() SUCCEEDED! Type:', typeof Td);
                examineTd(Td);
            } catch (err) {
                console.log('❌ q3v() threw:', err);
                console.log('   Type:', err.constructor ? err.constructor.name : typeof err);
                console.log('   Message:', err.message || '(none)');
                console.log('   String:', String(err));

                if (err.message && err.message.startsWith('WASM_THROW:')) {
                    console.log('=== Kotlin Exception decoded! ===');
                    const parts = err.message.substring('WASM_THROW: '.length).split(' | ');
                    console.log('Exception parts:', parts);
                }

                console.log('');
                console.log('💡 q3v() throws on clone. Let\'s trace the SITE\'S successful q3v() call.');
                console.log('   Click another movie to see js_code trace of the real decrypt.');
                console.log('   Or type: window.__traceAll = true; then click a movie.');
            }

        } catch (err) {
            console.log('❌ Fatal:', err.message || err, err.stack || '');
        }
    }

    function examineTd(Td) {
        if (!Td) { console.log('⚠️ Td is', Td); return; }
        console.log('=== Td ===');
        console.log('Type:', typeof Td, 'String:', String(Td));
        const found = [];
        for (let i = 0; i <= 400; i++) {
            try { const v = Td[i]; if (v !== undefined) found.push(i + ':' + typeof v); } catch (e) {}
        }
        console.log('Numeric props:', found.join(', ') || 'none (0-400)');
        try { console.log('Keys:', Object.getOwnPropertyNames(Td)); } catch (e) {}

        if (typeof Td[358] === 'function') {
            window.decrypt = Td[358];
            console.log('✅ window.decrypt = Td[358]');
        }
    }

    window.testDecrypt = function (data) {
        if (!window.decrypt) { console.log('❌ Not ready'); return null; }
        try { const r = window.decrypt(data); try { return JSON.parse(r); } catch (e) { return r; } }
        catch (e) { console.log('❌', e.message || e); }
    };

    console.log('🔓 Decryptor v12 ready — click a movie');
})();
