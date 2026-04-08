// Provide browser-like globals that Kotlin/Wasm might need
globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.document = {
    createElement: () => ({ style: {}, appendChild: () => {}, removeChild: () => {} }),
    getElementsByTagName: () => [],
    querySelector: () => null,
    querySelectorAll: () => [],
    head: { appendChild: () => {} },
    body: { appendChild: () => {}, removeChild: () => {} },
    documentElement: { style: {} },
    readyState: 'complete',
};
globalThis.navigator = { userAgent: 'Mozilla/5.0' };
globalThis.performance = { now: () => Date.now() };
globalThis.fetch = () => Promise.reject(new Error('no fetch'));
globalThis.XMLHttpRequest = function() {};

const fs = require('fs');
const buf = fs.readFileSync('/home/z/my-project/download/lordflix-standalone/hxqvpnrw.wasm');

let wasmMemory = null;
let callLog = [];

const importObject = {
    js_code: {
        'kotlin.captureStackTrace': function() { return null; },
        'kotlin.wasm.internal.throwJsError': function(msg) {
            callLog.push('throwJsError: ' + JSON.stringify(String(msg).substring(0, 300)));
            throw new Error(msg);
        },
        'kotlin.wasm.internal.stringLength': function(s) {
            if (s === null || s === undefined) return 0;
            if (typeof s === 'string') return s.length;
            return 0;
        },
        'kotlin.wasm.internal.jsExportStringToWasm': function(v) { return v; },
        'kotlin.wasm.internal.importStringFromWasm': function(ptr, len) {
            if (wasmMemory && len > 0 && len < 1000000) {
                try {
                    // Kotlin/Wasm strings are UTF-16
                    const bytes = new Uint8Array(wasmMemory.buffer, ptr, len * 2);
                    return new TextDecoder('utf-16le').decode(bytes);
                } catch(e) {
                    try {
                        const bytes = new Uint8Array(wasmMemory.buffer, ptr, len);
                        return new TextDecoder('utf-8').decode(bytes);
                    } catch(x) { return ''; }
                }
            }
            return '';
        },
        'kotlin.wasm.internal.getJsEmptyString': function() { return ''; },
        'kotlin.wasm.internal.isNullish': function(v) { return (v === null || v === undefined); },
        'kotlin.js.stackPlaceHolder_js_code': function() { return 0; },
        'kotlin.random.initialSeed': function() { return 42; },
    }
};

WebAssembly.instantiate(buf, importObject).then(result => {
    const { q3v, main, memory, _initialize } = result.instance.exports;
    wasmMemory = memory;

    _initialize();

    console.log('=== main() ===');
    main();

    console.log('\n=== q3v() ===');
    try {
        const Td = q3v();
        console.log('SUCCESS! type:', typeof Td);
        if (typeof Td === 'object' && Td !== null) {
            const keys = Object.keys(Td);
            console.log('Own keys:', keys.length, keys.slice(0, 5));
            console.log('Has 358:', typeof Td[358]);

            if (typeof Td[358] === 'function') {
                console.log('\n=== Calling Td[358](test input) ===');
                try {
                    const testInput = 'SGVsbG8gV29ybGQ';  // base64 test
                    const r = Td[358](testInput);
                    console.log('Result type:', typeof r);
                    console.log('Result:', String(r).substring(0, 500));
                } catch(e) {
                    console.log('Decrypt error:', e.constructor.name, e.message || '');
                    if (e instanceof WebAssembly.Exception && e.getArg) {
                        for (let i = 0; i < 5; i++) {
                            try { console.log('  arg[' + i + ']:', e.getArg(i)); } catch(x) { break; }
                        }
                    }
                }
            }
        }
    } catch(e) {
        console.log('q3v() FAILED:', e.constructor.name, e.message || '');
        if (e instanceof WebAssembly.Exception && e.getArg) {
            for (let i = 0; i < 5; i++) {
                try { console.log('  arg[' + i + ']:', e.getArg(i)); } catch(x) { break; }
            }
        }
    }

    if (callLog.length > 0) {
        console.log('\n=== throwJsError calls ===');
        callLog.forEach(l => console.log(' ', l));
    }
});
