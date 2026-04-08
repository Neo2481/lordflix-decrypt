// ==UserScript==
// @name         LordFlix Decryptor Bridge v21
// @namespace    http://tampermonkey.net/
// @version      21.1
// @description  Companion for LordFlix Decryptor — intercepts API, decrypts, sends result back via postMessage
// @match        https://lordflix.org/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    var customData = null;
    var openerOrigin = null;
    var resultSent = false;

    /* ═══════ STEP 1: Check URL hash for decrypt request from popup ═══════ */
    try {
        var hash = window.location.hash;
        if (hash && hash.includes('__decrypt_data=')) {
            var params = new URLSearchParams(hash.substring(1));
            var encData = params.get('__decrypt_data');
            var origin = params.get('__decrypt_origin');
            if (encData) {
                customData = decodeURIComponent(encData);
                openerOrigin = origin || '*';
                console.log('🔗 Popup decrypt request received');
                console.log('   Data:', customData.substring(0, 50) + '...');
                console.log('   Origin:', openerOrigin);
            }
        }
    } catch (e) {}

    /* Also check sessionStorage (for page reload within popup) */
    if (!customData) {
        var stored = sessionStorage.getItem('__lf_bridge_data');
        if (stored) {
            customData = stored;
            openerOrigin = sessionStorage.getItem('__lf_bridge_origin') || '*';
            sessionStorage.removeItem('__lf_bridge_data');
            sessionStorage.removeItem('__lf_bridge_origin');
            console.log('🔗 Decrypt from sessionStorage');
        }
    }

    /* Store for reload resilience */
    if (customData) {
        sessionStorage.setItem('__lf_bridge_data', customData);
        sessionStorage.setItem('__lf_bridge_origin', openerOrigin || '*');
        /* Clean URL */
        if (window.location.hash.includes('__decrypt_data=')) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    }

    /* ═══════ STEP 2: Send helpers ═══════ */
    function sendToOpener(type, data) {
        if (!window.opener) return false;
        try {
            window.opener.postMessage(Object.assign({ type: type }, data), openerOrigin || '*');
            return true;
        } catch (e) {
            console.log('❌ postMessage failed:', e.message);
            return false;
        }
    }

    /* Notify ready */
    if (customData && window.opener) {
        setTimeout(function () { sendToOpener('decrypt-ready', {}); }, 500);
    }

    /* ═══════ STEP 3: Hook Response.json() — replace encrypted data ═══════ */
    var origJson = Response.prototype.json;
    Response.prototype.json = async function () {
        var result = await origJson.call(this);

        if (result && result.data && typeof result.data === 'string' && result.data.length > 50) {
            console.log('🔑 API data captured (' + result.data.length + ' chars)');

            if (customData) {
                console.log('🔗 REPLACING with popup data');
                console.log('   Was:  ' + result.data.substring(0, 40) + '...');
                console.log('   Now:  ' + customData.substring(0, 40) + '...');
                result.data = customData;
                customData = null;
            }
        }

        return result;
    };

    /* ═══════ STEP 4: Hook JSON.parse() — capture decrypted result ═══════ */
    var origParse = JSON.parse;
    JSON.parse = function (text, reviver) {
        var result = origParse.call(this, text, reviver);

        if (text && typeof text === 'string' && text.includes('"stream"') && !resultSent) {
            console.log('🎬 Decrypted!');

            if (window.opener) {
                resultSent = true;
                sendToOpener('decrypt-result', { result: result });
                /* Auto-close popup after short delay */
                setTimeout(function () {
                    try { window.close(); } catch (e) {}
                }, 1500);
            }

            /* Clean sessionStorage */
            sessionStorage.removeItem('__lf_bridge_data');
            sessionStorage.removeItem('__lf_bridge_origin');
        }

        return result;
    };

    console.log('🔗 Bridge v21.1 ready' + (customData ? ' [DECRYPT MODE]' : ''));
})();
