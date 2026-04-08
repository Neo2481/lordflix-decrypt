// This script creates an HTML page that loads the Wasm directly
// and inspects the Kotlin/Wasm proxy object to find the decrypt function at index 358
const html = `<!DOCTYPE html>
<html>
<head><title>Wasm Inspector</title></head>
<body>
<h3>Loading Wasm...</h3>
<pre id="output"></pre>
<script>
const out = document.getElementById('output');
function log(msg) { out.textContent += msg + '\\n'; console.log(msg); }

async function main() {
    try {
        const resp = await fetch('https://lordflix.org/hls/hxqvpnrw.wasm');
        const wasmBuf = await resp.arrayBuffer();
        log('Wasm downloaded: ' + wasmBuf.byteLength + ' bytes');

        let wasmMemory = null;

        const importObject = {
            js_code: {
                'kotlin.captureStackTrace': () => { const e = new Error(); return e.stack || ''; },
                'kotlin.wasm.internal.throwJsError': (msg, fileName, line) => {
                    const e = new Error(msg); e.fileName = fileName; e.lineNumber = line; throw e;
                },
                'kotlin.wasm.internal.stringLength': (s) => s.length,
                'kotlin.wasm.internal.jsExportStringToWasm': (str, offset, len, memPtr) => {
                    if (wasmMemory) {
                        const u16 = new Uint16Array(wasmMemory.buffer, memPtr, len);
                        for (let i = 0; i < len; i++) u16[i] = str.charCodeAt(offset + i);
                    }
                },
                'kotlin.wasm.internal.externrefToString': (v) => String(v),
                'kotlin.wasm.internal.importStringFromWasm': (ptr, len, ptr2) => {
                    if (wasmMemory) {
                        const u16 = new Uint16Array(wasmMemory.buffer, ptr, len);
                        return String.fromCharCode(...u16);
                    }
                    return '';
                },
                'kotlin.wasm.internal.getJsEmptyString': () => '',
                'kotlin.wasm.internal.isNullish': (v) => v == null,
                'kotlin.wasm.internal.getCachedJsObject_\$external_fun': (a, b) => null,
                'kotlin.js.stackPlaceHolder_js_code': () => '',
                'kotlin.js.message_\$external_prop_getter': (e) => e.message || '',
                'kotlin.js.stack_\$external_prop_getter': (e) => e.stack || '',
                'kotlin.js.JsError_\$external_class_instanceof': (e) => e instanceof Error,
                'kotlin.random.initialSeed': () => Math.floor(Math.random() * 4294967296)
            },
            intrinsics: {}
        };

        log('Instantiating Wasm...');
        const { instance } = await WebAssembly.instantiate(wasmBuf, importObject);
        const exps = instance.exports;
        log('Exports: ' + Object.keys(exps).join(', '));

        if (exps.memory) {
            wasmMemory = exps.memory;
            log('Memory: ' + wasmMemory.buffer.byteLength + ' bytes');
        }

        if (exps._initialize) {
            log('Calling _initialize()...');
            exps._initialize();
            log('_initialize() done');
        }

        log('\\nMemory after init: ' + wasmMemory.buffer.byteLength + ' bytes');
        const mem = new Uint8Array(wasmMemory.buffer);
        const text = new TextDecoder().decode(mem);

        // Search for key patterns
        let mii = text.indexOf('MII');
        if (mii >= 0) log('\\n*** FOUND MII at offset ' + mii + ' ***\\n' + text.substring(mii, mii + 500));
        let pem = text.indexOf('-----');
        if (pem >= 0) log('\\n*** FOUND PEM at offset ' + pem + ' ***\\n' + text.substring(pem, pem + 500));

        // Search for base64 strings
        const b64 = text.match(/[A-Za-z0-9+/]{80,}={0,2}/g);
        if (b64) {
            log('\\nBase64 strings: ' + b64.length);
            b64.forEach(s => log('  (' + s.length + '): ' + s.substring(0, 120)));
        }

        // Now try q3v - this is the Kotlin object factory
        log('\\nCalling q3v()...');
        const Td = exps.q3v();
        log('q3v() returned type: ' + typeof Td);
        log('q3v() value: ' + Td);
        log('Is null/undefined: ' + (Td == null));

        if (Td != null && typeof Td === 'object') {
            log('\\n*** Td is an object! ***');
            log('Constructor: ' + (Td.constructor ? Td.constructor.name : 'none'));
            log('Proto: ' + (Td.__proto__ ? Td.__proto__.toString() : 'none'));
            
            // Check if it's a Proxy
            log('Is Proxy-like: ' + (typeof Td[Symbol.iterator] !== 'undefined'));
            
            // Try to get all enumerable keys
            try {
                const keys = Object.getOwnPropertyNames(Td);
                log('Own property names: ' + keys.length);
                keys.slice(0, 50).forEach(k => log('  ' + k));
                if (keys.length > 350) log('Around 358: ' + keys.slice(355, 365));
            } catch(e) { log('getOwnPropertyNames error: ' + e.message); }
            
            // Try numeric access
            log('\\nTrying numeric property access (0-500):');
            let found = [];
            for (let i = 0; i < 500; i++) {
                try {
                    const v = Td[i];
                    if (v !== undefined) found.push(i + ':' + typeof v + '=' + String(v).substring(0, 50));
                } catch(e) {}
            }
            log('Found ' + found.length + ' defined numeric props');
            found.forEach(f => log('  ' + f));
            
            // Specifically check [358]
            try {
                const v358 = Td[358];
                log('\\n*** Td[358] = ' + typeof v358 + ' ***');
                if (typeof v358 === 'function') {
                    log('It is a function! Attempting to call with test data...');
                    try {
                        const testEnc = 'iT86qn61G7hh3Bd6P/8fQbVN2/xMzDjHh+5wMKHQ2O9A9U+SXyNFb38sfWcO5GTFjdVWI3t+kBWylBRrNFYH0hq8Hh1QMqKBeYkvYeOzOR0HYwY3BKvo4f+M8MfKtRrbTWp0EmOIhKBQBzILO+gqMNrD2pVYKmPVjknK8Qn2HjQ6DFMUIBcNwNCvcIuMvKkV1jvAqjYV/XpPtMNNRyl+WlZnsry3BWS4sK1B+oZbDUuIbF4QWr6M+IL/GuIRvKV0XrAksRqC2UxZ9QLMhoWCz2vHSfFhK0Nj8Px4SSv/TQOaXhXACcMnF1GrvwvUSrXRWqfv7Rw+AwV2LKQbkUeAqgb/2y+MM+QHQ2xVfGjL5yKYsWMKAZIrxhq3iTHyXHvOjNxY+BN/02quwESGgFOCqHWWuSXSG+mvv5RMrJHhS5hFF1mV2M/4Jqo6RP9Mjcmq8g==';
                        const result = v358(testEnc);
                        log('DECRYPTED: ' + result);
                    } catch(e) {
                        log('Call error: ' + e.message);
                    }
                } else {
                    log('Value: ' + String(v358).substring(0, 200));
                }
            } catch(e) {
                log('Td[358] access error: ' + e.message);
            }

            // Try string-based access
            log('\\nTrying string property access:');
            for (const prop of ['memory', 'main', 'q3v', 'decrypt', 'rsa', 'toString', 'valueOf', Symbol.toPrimitive, Symbol.iterator]) {
                try {
                    const v = Td[prop];
                    if (v !== undefined) log('  Td[' + String(prop) + ']: ' + typeof v);
                } catch(e) {}
            }

            // Try calling it as a function
            if (typeof Td === 'function') {
                log('\\nTd is callable, trying Td()...');
                try { log('Result: ' + Td()); } catch(e) { log('Error: ' + e.message); }
            }
        }

        // Also dump the full memory after everything
        log('\\n=== FINAL MEMORY DUMP (first 2048 bytes hex) ===');
        const finalMem = new Uint8Array(wasmMemory.buffer);
        let hex = '';
        for (let i = 0; i < Math.min(2048, finalMem.length); i++) {
            hex += ('0' + finalMem[i].toString(16)).slice(-2) + ' ';
            if ((i + 1) % 32 === 0) { log(hex); hex = ''; }
        }
        if (hex) log(hex);

        log('\\n=== DONE ===');
    } catch(e) {
        log('ERROR: ' + e.message);
        log(e.stack);
    }
}

main();
</script>
</body>
</html>`;

const fs = require('fs');
fs.writeFileSync('/home/z/my-project/download/wasm_inspect.html', html);
console.log('Created wasm_inspect.html');
