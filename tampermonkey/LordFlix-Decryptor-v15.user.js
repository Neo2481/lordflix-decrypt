// ==UserScript==
// @name         LordFlix Decryptor v15
// @namespace    http://tampermonkey.net/
// @version      15.0
// @description  Clone-based decrypt service — inject input, capture output
// @match        https://lordflix.org/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    let savedModule = null;
    let savedImports = null;
    let cloneExports = null;
    let cloneReady = false;
    let pendingDecrypt = null;   // encrypted data to decrypt
    let decryptResult = null;    // decrypted output
    let decryptResolve = null;   // Promise resolver

    /* ───────── Hook 1: JSON.parse — capture site's decrypts ───────── */
    const origParse = JSON.parse;
    JSON.parse = function (text, reviver) {
        const result = origParse.call(this, text, reviver);
        if (text && typeof text === 'string' && text.includes('"stream"')) {
            console.log('🎬 Site decrypted:', result);
            window.__lastDecrypted = result;
            window.__lastDecryptedRaw = text;
        }
        return result;
    };

    /* ───────── Hook 2: instantiateStreaming ───────── */
    const origIST = WebAssembly.instantiateStreaming;
    WebAssembly.instantiateStreaming = async function (source, importObject) {
        console.log('🧩 instantiateStreaming — saving module + imports...');
        const result = await origIST.call(this, source, importObject);
        savedModule = result.module;
        savedImports = importObject;

        /* Trace original js_code for diagnostics */
        if (importObject.js_code) {
            const origISFW = importObject.js_code['kotlin.wasm.internal.importStringFromWasm'];
            if (origISFW) {
                importObject.js_code['kotlin.wasm.internal.importStringFromWasm'] = function () {
                    const r = origISFW.apply(this, arguments);
                    if (typeof r === 'string' && r.length > 20) {
                        console.log('  📡 [SITE] importStringFromWasm → "' + r.substring(0, 80) + '..."');
                    }
                    return r;
                };
            }
        }

        console.log('🧩 Saved. Click a movie to prepare clone.');
        return result;
    };

    /* ───────── Build clone with hooked js_code ───────── */
    async function buildClone() {
        if (cloneReady && cloneExports) {
            console.log('🧩 Clone already ready');
            return;
        }

        /* Create fresh js_code with our hooks */
        const cloneJC = {};
        for (const key of Object.keys(savedImports.js_code)) {
            cloneJC[key] = savedImports.js_code[key];
        }

        /* Hook jsExportStringToWasm — INJECT our encrypted data */
        const origESW = cloneJC['kotlin.wasm.internal.jsExportStringToWasm'];
        cloneJC['kotlin.wasm.internal.jsExportStringToWasm'] = function (Tx, Ox, S0, D0) {
            /* If we have pending decrypt data, REPLACE the input */
            if (pendingDecrypt !== null && typeof Tx === 'string' && Tx.length > 50) {
                console.log('  📡 [CLONE] jsExportStringToWasm: REPLACING input!');
                console.log('    Original: "' + String(Tx).substring(0, 40) + '..."');
                console.log('    Injected: "' + pendingDecrypt.substring(0, 40) + '..."');
                Tx = pendingDecrypt;
                pendingDecrypt = null; // clear after injection
            } else {
                console.log('  📡 [CLONE] jsExportStringToWasm: "' + String(Tx).substring(0, 40) + '..."');
            }
            return origESW.call(this, Tx, Ox, S0, D0);
        };

        /* Hook importStringFromWasm — CAPTURE decrypted output */
        const origISFW = cloneJC['kotlin.wasm.internal.importStringFromWasm'];
        cloneJC['kotlin.wasm.internal.importStringFromWasm'] = function (Tx, Ox, S0) {
            const result = origISFW.call(this, Tx, Ox, S0);
            if (typeof result === 'string' && result.length > 20) {
                console.log('  📡 [CLONE] importStringFromWasm → "' + result.substring(0, 80) + '..."');
                /* This IS the decrypted output! */
                if (decryptResolve) {
                    decryptResult = result;
                    console.log('  ✅ [CLONE] Decrypted output captured!');
                }
            }
            return result;
        };

        /* Suppress throwJsError */
        cloneJC['kotlin.wasm.internal.throwJsError'] = function (Tx, Ox, S0) {
            console.log('  🧩 [CLONE] throwJsError SUPPRESSED');
            return undefined;
        };

        console.log('🧩 Building clone instance...');
        const clone = new WebAssembly.Instance(savedModule, {
            js_code: cloneJC,
            intrinsics: savedImports.intrinsics || {}
        });

        cloneExports = clone.exports;
        console.log('🧩 Clone created:', Object.keys(cloneExports));

        /* Init */
        console.log('🧩 _initialize()...');
        try { cloneExports._initialize(); console.log('  ✓'); } catch (e) { console.log('  ✗', e.message || e); }

        console.log('🧩 main()...');
        try { cloneExports.main(); console.log('  ✓'); } catch (e) { console.log('  ✗', e.message || e); }

        cloneReady = true;
        console.log('✅ Clone ready for decryption!');
    }

    /* ───────── Decrypt function using clone ───────── */
    window.decrypt = async function (encryptedData) {
        if (!cloneReady) {
            console.log('🧩 Building clone first...');
            await buildClone();
        }

        if (!cloneExports) {
            console.log('❌ Clone not available');
            return null;
        }

        console.log('🔓 Starting decrypt of:', encryptedData.substring(0, 40) + '...');

        /* Set up pending data and promise */
        pendingDecrypt = encryptedData;
        decryptResult = null;

        const promise = new Promise(function (resolve) {
            decryptResolve = resolve;
        });

        /* Call q3v() — this will trigger the decrypt pipeline on the clone.
         * The clone will:
         * 1. Call jsExportStringToWasm with some data → we REPLACE with our data
         * 2. Decrypt in Wasm
         * 3. Call importStringFromWasm with result → we CAPTURE it
         * 4. Throw exception → we catch and ignore
         */
        try {
            cloneExports.q3v();
        } catch (err) {
            console.log('  ⚠️ q3v() threw (expected):', String(err).substring(0, 80));
            /* This is expected — the clone always throws after decrypting */
        }

        /* Give it a moment for async operations to complete */
        await new Promise(function (r) { setTimeout(r, 100); });

        if (decryptResult) {
            console.log('🔓 Decryption successful!');
            console.log('   Result:', decryptResult.substring(0, 120));
            decryptResolve = null;
            try {
                return JSON.parse(decryptResult);
            } catch (e) {
                return decryptResult;
            }
        } else {
            console.log('❌ No decrypted output captured');
            decryptResolve = null;
            return null;
        }
    };

    /* ───────── Sync test function ───────── */
    window.testDecrypt = function (encryptedData) {
        if (typeof encryptedData === 'string') {
            console.log('🔓 Call: await decrypt("' + encryptedData.substring(0, 30) + '...")');
            window.decrypt(encryptedData).then(function (result) {
                console.log('🔓 Result:', result);
                window.__testResult = result;
            });
        } else {
            console.log('❌ Provide encrypted data string');
        }
    };

    /* ───────── Build clone after first site decrypt ───────── */
    let cloneBuilt = false;
    const origParse2 = JSON.parse;
    const origIST2 = origIST;

    /* Watch for first successful decrypt, then build clone */
    const _origParse = JSON.parse;
    let firstDecrypt = false;
    JSON.parse = function (text, reviver) {
        const result = _origParse.call(this, text, reviver);
        if (!firstDecrypt && text && typeof text === 'string' && text.includes('"stream"')) {
            firstDecrypt = true;
            console.log('🧩 First site decrypt detected. Building clone...');
            setTimeout(buildClone, 500);
        }
        return result;
    };

    console.log('🔓 Decryptor v15 ready');
    console.log('   Click a movie → clone builds automatically');
    console.log('   Then: await decrypt("encrypted_data")');
})();
