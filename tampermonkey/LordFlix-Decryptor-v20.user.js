// ==UserScript==
// @name         LordFlix Decryptor v20
// @namespace    http://tampermonkey.net/
// @version      20.0
// @description  Standalone decrypt via Response.json() MITM + sessionStorage
// @match        https://lordflix.org/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    /* ───────── Phase 1: Check for stored decrypt request (after page reload) ───────── */
    var storedDecrypt = sessionStorage.getItem('__lf_decrypt');
    var decryptMode = false;

    if (storedDecrypt) {
        sessionStorage.removeItem('__lf_decrypt');
        decryptMode = true;
        console.log('🔓 RESUMING: Custom decrypt data found in sessionStorage');
        console.log('   Data: ' + storedDecrypt.substring(0, 50) + '...');
    }

    var customData = decryptMode ? storedDecrypt : null;

    /* ───────── Hook 1: Response.json() — replace encrypted data ───────── */
    var origJson = Response.prototype.json;
    Response.prototype.json = async function () {
        var result = await origJson.call(this);

        if (result && result.data && typeof result.data === 'string' && result.data.length > 50) {
            console.log('🔑 API Response.data captured (' + result.data.length + ' chars)');
            window.__lastEncryptedData = result.data;

            if (customData) {
                console.log('🔓 REPLACING with custom data!');
                console.log('   Original: ' + result.data.substring(0, 40) + '...');
                console.log('   Custom:   ' + customData.substring(0, 40) + '...');
                result.data = customData;
                customData = null; // one-shot
            }
        }

        return result;
    };

    /* ───────── Hook 2: JSON.parse — capture decrypted result ───────── */
    var origParse = JSON.parse;
    JSON.parse = function (text, reviver) {
        var result = origParse.call(this, text, reviver);

        if (text && typeof text === 'string' && text.includes('"stream"')) {
            if (decryptMode) {
                console.log('');
                console.log('╔══════════════════════════════════════════╗');
                console.log('║  ✅ CUSTOM DECRYPT RESULT               ║');
                console.log('╚══════════════════════════════════════════╝');
                console.log(JSON.stringify(result, null, 2));
                console.log('');

                /* Save result for retrieval */
                window.__decryptResult = result;
                sessionStorage.setItem('__lf_decrypt_result', JSON.stringify(result));

                /* Also show in an alert for visibility */
                var playlist = '';
                if (result.stream && result.stream[0] && result.stream[0].playlist) {
                    playlist = result.stream[0].playlist;
                }
                console.log('🔑 Playlist URL: ' + playlist);

                decryptMode = false;
            } else {
                console.log('🎬 Decrypted:', JSON.stringify(result).substring(0, 120));
            }

            window.__lastDecrypted = result;
        }

        return result;
    };

    /* ───────── Main decrypt function ───────── */
    window.decrypt = function (encryptedData) {
        if (!encryptedData || typeof encryptedData !== 'string') {
            console.log('❌ Provide encrypted data string');
            return;
        }

        console.log('🔓 decrypt() called with ' + encryptedData.length + ' chars');
        console.log('   Input: ' + encryptedData.substring(0, 50) + '...');

        /* Store in sessionStorage (survives page reload) */
        sessionStorage.setItem('__lf_decrypt', encryptedData);
        sessionStorage.removeItem('__lf_decrypt_result');

        /* Try client-side navigation first (preserves script state) */
        var movieLinks = document.querySelectorAll('a[href*="/watch/movie/"]');
        var currentPath = window.location.pathname;
        var targetLink = null;

        for (var i = 0; i < movieLinks.length; i++) {
            if (movieLinks[i].pathname !== currentPath) {
                targetLink = movieLinks[i];
                break;
            }
        }

        if (!targetLink && movieLinks.length > 0) {
            targetLink = movieLinks[0];
        }

        if (targetLink) {
            console.log('🧩 Clicking movie link (client-side nav):', targetLink.href);
            try {
                targetLink.click();
                console.log('💡 If the page reloaded, the result will appear after it loads.');
                console.log('💡 Check: window.__decryptResult or sessionStorage.');
            } catch (e) {
                console.log('⚠️ Click failed, using direct navigation');
                window.location.href = '/watch/movie/1159831';
            }
        } else {
            console.log('🧩 No movie links found. Navigating directly...');
            window.location.href = '/watch/movie/1159831';
        }
    };

    /* ───────── Check for stored result ───────── */
    var storedResult = sessionStorage.getItem('__lf_decrypt_result');
    if (storedResult) {
        sessionStorage.removeItem('__lf_decrypt_result');
        try {
            window.__decryptResult = JSON.parse(storedResult);
            console.log('');
            console.log('╔══════════════════════════════════════════╗');
            console.log('║  ✅ PREVIOUS DECRYPT RESULT              ║');
            console.log('╚══════════════════════════════════════════╝');
            console.log(storedResult.substring(0, 200));
            console.log('');
            console.log('💡 Full result: window.__decryptResult');
        } catch (e) {}
    }

    /* ───────── Quick test: decrypt with last captured data ───────── */
    window.reDecrypt = function () {
        var lastData = window.__lastEncryptedData;
        if (!lastData) {
            console.log('❌ No previous encrypted data. Load a movie first.');
            return;
        }
        console.log('🔄 Re-decrypting last captured data...');
        decrypt(lastData);
    };

    console.log('🔓 Decryptor v20 ready');
    console.log('   Usage: decrypt("encrypted_base64_string")');
    console.log('   Or:   reDecrypt() — decrypts last captured data again');
})();
