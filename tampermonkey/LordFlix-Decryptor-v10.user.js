// ==UserScript==
// @name         LordFlix Decryptor v10
// @namespace    http://tampermonkey.net/
// @version      10.0
// @description  Clone Wasm module into new instance to extract decrypt function
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
            console.log(result);
            window.__lastDecrypted = result;

            if (!extractionDone && savedModule && savedImports) {
                extractionDone = true;
                console.log('🧩 First decrypt seen! Cloning Wasm module in 200ms...');
                setTimeout(cloneAndExtract, 200);
            }
        }
        return result;
    };

    /* ───────── Hook 2: instantiateStreaming — save module + imports ───────── */
    const origIST = WebAssembly.instantiateStreaming;
    WebAssembly.instantiateStreaming = async function (source, importObject) {
        console.log('🧩 instantiateStreaming — capturing module & imports...');
        const result = await origIST.call(this, source, importObject);

        /* Deep-save the importObject for reuse */
        savedModule = result.module;
        savedImports = importObject;

        console.log('🧩 Module saved:', typeof savedModule);
        console.log('🧩 Imports keys:', Object.keys(savedImports));

        /* Log each import module for debugging */
        for (const modName of Object.keys(savedImports)) {
            const mod = savedImports[modName];
            console.log('  Import module "' + modName + '":',
                typeof mod,
                mod !== null ? Object.keys(mod).slice(0, 20) : 'null');
        }

        /* Return completely unchanged */
        return result;
    };

    /* ───────── Clone module and extract decrypt function ───────── */
    async function cloneAndExtract() {
        try {
            console.log('🧩 Creating CLONE instance from saved module...');

            /* Create a fresh WebAssembly.Instance from the compiled Module.
             * Each instance has its own state — no conflicts with the site's instance */
            const cloneInstance = new WebAssembly.Instance(savedModule, savedImports);
            const cloneExports = cloneInstance.exports;

            console.log('🧩 Clone exports:', Object.keys(cloneExports));

            /* Now call q3v() on our FRESH instance — it has its own init state */
            console.log('🧩 Calling q3v() on CLONE instance...');
            let Td;
            try {
                Td = cloneExports.q3v();
            } catch (qErr) {
                /* Wasm errors might not be standard Error objects */
                console.log('❌ q3v() on clone threw:', qErr);
                console.log('   typeof:', typeof qErr);
                console.log('   String:', String(qErr));
                console.log('   Constructor:', qErr && qErr.constructor ? qErr.constructor.name : 'N/A');
                if (qErr && typeof qErr === 'object') {
                    console.log('   Keys:', Object.keys(qErr));
                    console.log('   Message:', qErr.message);
                    console.log('   Stack:', qErr.stack);
                }
                return;
            }

            console.log('🧩 q3v() returned. Type:', typeof Td);
            window.__Td = Td;

            if (Td === null || Td === undefined) {
                console.log('⚠️ q3v() returned', Td);
                return;
            }

            /* Try to access Td[358] — the decrypt function */
            console.log('🧩 Accessing Td[358]...');
            try {
                const fn = Td[358];
                console.log('🧩 Td[358] type:', typeof fn);

                if (typeof fn === 'function') {
                    window.decrypt = fn;
                    console.log('✅ window.decrypt = Td[358] — STANDALONE DECRYPT READY!');
                    console.log('🔓 Usage: testDecrypt("encrypted_base64_string")');

                    /* Test it with the saved encrypted input */
                    if (window.__lastEncryptedInput) {
                        console.log('🧩 Testing with saved encrypted input...');
                        try {
                            const testRaw = fn(window.__lastEncryptedInput);
                            console.log('🧩 Test result:', testRaw);
                        } catch (testErr) {
                            console.log('❌ Test call threw:', testErr);
                        }
                    }
                } else {
                    console.log('⚠️ Td[358] is not a function, value:', fn);
                    dumpTd(Td);
                }
            } catch (propErr) {
                console.log('❌ Error accessing Td[358]:', propErr);
                console.log('   typeof:', typeof propErr, 'String:', String(propErr));
                dumpTd(Td);
            }
        } catch (err) {
            console.log('❌ Clone failed:', err);
            console.log('   typeof:', typeof err);
            console.log('   String:', String(err));
        }
    }

    function dumpTd(Td) {
        console.log('  typeof Td:', typeof Td);
        console.log('  Td.toString():', String(Td));
        try { console.log('  JSON:', JSON.stringify(Td)); } catch (e) { /* skip */ }

        /* Check prototype chain */
        try {
            const proto = Object.getPrototypeOf(Td);
            console.log('  Prototype:', proto);
            console.log('  Proto keys:', proto ? Object.getOwnPropertyNames(proto) : 'none');
        } catch (e) { /* skip */ }

        /* Try Object.getOwnPropertyNames */
        try {
            console.log('  Own property names:', Object.getOwnPropertyNames(Td));
        } catch (e) { /* skip */ }

        /* Numeric probe */
        const found = [];
        for (let i = 0; i <= 500; i++) {
            try {
                const v = Td[i];
                if (v !== undefined) {
                    found.push('Td[' + i + ']: ' + typeof v);
                }
            } catch (e) { /* skip */ }
        }
        if (found.length > 0) {
            console.log('  Found numeric properties:', found.slice(0, 30));
        } else {
            console.log('  No numeric properties found (0-500)');
        }
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
            console.log('❌ Error:', err.message || err);
        }
    };

    console.log('🔓 Decryptor v10 ready — click a movie');
})();
