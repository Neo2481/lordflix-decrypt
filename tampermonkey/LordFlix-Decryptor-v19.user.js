// ==UserScript==
// @name         LordFlix Decryptor v19
// @namespace    http://tampermonkey.net/
// @version      19.0
// @description  Intercept API response + replace encrypted data = standalone decrypt
// @match        https://lordflix.org/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    let decryptResolve = null;
    let decryptUsed = false;
    let wasmReady = false;
    let sourceMapFetched = false;

    /* ───────── Hook 1: Response.json() — replace encrypted data in API response ───────── */
    const origJson = Response.prototype.json;
    Response.prototype.json = async function () {
        const result = await origJson.call(this);

        /* Check for movie API response with encrypted data */
        if (result && result.data && typeof result.data === 'string' && result.data.length > 50) {
            console.log('🔑 API Response.data captured (' + result.data.length + ' chars)');
            window.__lastEncryptedData = result.data;

            /* If user has set custom data, REPLACE it */
            if (window.__customDecryptData) {
                console.log('🔓 REPLACING data with custom input!');
                console.log('   Original: ' + result.data.substring(0, 40) + '...');
                result.data = window.__customDecryptData;
                console.log('   Custom:   ' + result.data.substring(0, 40) + '...');
                window.__customDecryptData = null;
                decryptUsed = true;
            }
        }

        return result;
    };

    /* ───────── Hook 2: JSON.parse — capture decrypted result ───────── */
    const origParse = JSON.parse;
    JSON.parse = function (text, reviver) {
        const result = origParse.call(this, text, reviver);

        if (text && typeof text === 'string' && text.includes('"stream"')) {
            console.log('🎬 Decrypted via JSON.parse!');
            console.log('   Result:', JSON.stringify(result).substring(0, 150));

            /* If we're waiting for a custom decrypt result */
            if (decryptResolve && decryptUsed) {
                decryptUsed = false;
                const resolve = decryptResolve;
                decryptResolve = null;
                resolve(result);
            }

            window.__lastDecrypted = result;
        }

        return result;
    };

    /* ───────── Hook 3: instantiateStreaming — track Wasm load ───────── */
    const origIST = WebAssembly.instantiateStreaming;
    WebAssembly.instantiateStreaming = async function (source, importObject) {
        console.log('🧩 Wasm loading...');
        wasmReady = false;
        const result = await origIST.call(this, source, importObject);
        wasmReady = true;
        console.log('🧩 Wasm ready ✓');
        return result;
    };

    /* ───────── Fetch source map for analysis ───────── */
    async function fetchSourceMap() {
        if (sourceMapFetched) return;
        sourceMapFetched = true;

        try {
            console.log('🧩 Fetching Wasm source map...');
            const resp = await fetch('https://lordflix.org/hls/vjqxkmpf-wasm-js.wasm.map');
            if (resp.ok) {
                const mapData = await resp.text();
                console.log('✅ Source map fetched! Size:', mapData.length, 'chars');

                /* Extract sources */
                try {
                    const map = JSON.parse(mapData);
                    if (map.sources) {
                        console.log('   Sources (' + map.sources.length + '):');
                        map.sources.forEach(function (s, i) {
                            console.log('     [' + i + '] ' + s);
                        });

                        /* Look for Kotlin source files */
                        const ktSources = map.sources.filter(function (s) {
                            return s.includes('.kt') || s.includes('Kotlin');
                        });
                        if (ktSources.length > 0) {
                            console.log('   Kotlin sources:', ktSources);
                        }

                        /* Look for source contents */
                        if (map.sourcesContent && map.sourcesContent.length > 0) {
                            console.log('   Has sourcesContent: YES (' + map.sourcesContent.length + ' entries)');
                            /* Find the main decrypt-related source */
                            for (let i = 0; i < map.sourcesContent.length; i++) {
                                const content = map.sourcesContent[i];
                                if (content && (content.includes('decrypt') || content.includes('RSA') ||
                                    content.includes('Cipher') || content.includes('private') ||
                                    content.includes('Base64') || content.includes('PKCS'))) {
                                    console.log('   🔑 Found relevant source [' + i + '] ' + map.sources[i] + ':');
                                    console.log('   ' + content.substring(0, 500));
                                }
                            }

                            /* Save all source content for inspection */
                            window.__wasmSources = map.sourcesContent;
                            window.__wasmSourceMap = map;
                            console.log('   Saved to window.__wasmSourceMap and window.__wasmSources');
                        }
                    }

                    /* Save full map */
                    window.__sourceMapRaw = mapData;
                } catch (parseErr) {
                    console.log('   Parse error:', parseErr.message);
                    console.log('   First 500 chars:', mapData.substring(0, 500));
                }
            } else {
                console.log('⚠️ Source map not accessible:', resp.status);
            }
        } catch (e) {
            console.log('⚠️ Could not fetch source map:', e.message);
        }
    }

    /* ───────── Analyze obfuscated strings from binary ───────── */
    function analyzeObfuscatedStrings() {
        const strings = [
            { offset: 1774, text: 'hfca`_]_\\[Z_YcXVUTZSZRZZNLKJIZZHZZEDCZBA' },
            { offset: 1816, text: '@=<~;<:987777~6543Z2/.' },
            { offset: 1844, text: "-~,+*,)))(Z''&~&''%~$~%~#&&\"&! " }
        ];

        console.log('🧩 Analyzing obfuscated strings from Wasm binary...');

        strings.forEach(function (s) {
            console.log('');
            console.log('  @' + s.offset + ': "' + s.text + '"');
            console.log('  Length:', s.text.length);

            /* Try XOR with common keys */
            for (let key = 1; key <= 10; key++) {
                let decoded = '';
                for (let i = 0; i < s.text.length; i++) {
                    decoded += String.fromCharCode(s.text.charCodeAt(i) ^ key);
                }
                if (/^[a-zA-Z0-9+/=\s{}[\]":,._-]+$/.test(decoded) && decoded.length > 5) {
                    console.log('  XOR ' + key + ': "' + decoded + '"');
                }
            }

            /* Try ROT/Caesar shift */
            for (let shift = -10; shift <= 10; shift++) {
                let decoded = '';
                for (let i = 0; i < s.text.length; i++) {
                    const c = s.text.charCodeAt(i);
                    decoded += String.fromCharCode(c + shift);
                }
                if (/^[a-zA-Z0-9+/=\s{}[\]":,._-]+$/.test(decoded) && decoded.length > 5) {
                    console.log('  Shift ' + shift + ': "' + decoded + '"');
                }
            }

            /* Try reversing */
            const reversed = s.text.split('').reverse().join('');
            console.log('  Reversed: "' + reversed + '"');

            /* Try subtracting from a base */
            for (let base = 0x60; base <= 0x7A; base++) {
                let decoded = '';
                let valid = true;
                for (let i = 0; i < s.text.length; i++) {
                    const c = base - s.text.charCodeAt(i);
                    if (c < 0 || c > 127) { valid = false; break; }
                    decoded += String.fromCharCode(c);
                }
                if (valid && /^[a-zA-Z0-9+/=\s{}[\]":,._-]+$/.test(decoded)) {
                    console.log('  ' + base.toString(16) + '-x: "' + decoded + '"');
                }
            }
        });
    }

    /* ───────── Main decrypt function ───────── */
    window.decrypt = async function (customEncryptedData) {
        if (!wasmReady) {
            console.log('❌ Wasm not loaded yet. Wait for page to fully load, then try again.');
            return null;
        }

        console.log('🔓 decrypt() called with ' + customEncryptedData.length + ' chars');
        console.log('   Input: ' + customEncryptedData.substring(0, 50) + '...');

        return new Promise(function (resolve, reject) {
            /* Set custom data — will be injected on next API response */
            window.__customDecryptData = customEncryptedData;
            decryptUsed = false;
            decryptResolve = resolve;

            /* Timeout */
            setTimeout(function () {
                if (decryptResolve) {
                    decryptResolve = null;
                    window.__customDecryptData = null;
                    reject(new Error('Decrypt timeout (10s). Click a movie and try again.'));
                }
            }, 10000);

            /* Auto-trigger: click a movie link to force a new API call */
            console.log('🔍 Looking for movie link to auto-click...');
            const movieLinks = document.querySelectorAll('a[href*="/watch/movie/"]');
            if (movieLinks.length > 0) {
                /* Click the first movie link (different from current page if possible) */
                const currentPath = window.location.pathname;
                let targetLink = null;
                for (const link of movieLinks) {
                    if (link.pathname !== currentPath) {
                        targetLink = link;
                        break;
                    }
                }
                if (!targetLink) targetLink = movieLinks[0];
                console.log('🧩 Auto-clicking:', targetLink.href);
                targetLink.click();
            } else {
                /* No movie links found — try navigating directly */
                console.log('🧩 No movie links found. Navigating to a movie...');
                window.location.href = '/watch/movie/1159831';
            }
        });
    };

    /* ───────── Init after page load ───────── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(function () {
                fetchSourceMap();
                analyzeObfuscatedStrings();
            }, 2000);
        });
    } else {
        setTimeout(function () {
            fetchSourceMap();
            analyzeObfuscatedStrings();
        }, 2000);
    }

    console.log('🔓 Decryptor v19 ready');
    console.log('   Usage: await decrypt("encrypted_base64_string")');
    console.log('   The script will auto-click a movie to trigger decryption.');
})();
