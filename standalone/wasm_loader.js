const fs = require('fs');
const wasm = fs.readFileSync('/home/z/my-project/download/hxqvpnrw.wasm');
console.log('File size:', wasm.length, 'bytes');

async function main() {
    // Create a memory-backed string storage for Wasm interop
    let wasmMemory = null;

    const importObject = {
        js_code: {
            'kotlin.captureStackTrace': () => {
                const e = new Error();
                return e.stack || '';
            },
            'kotlin.wasm.internal.throwJsError': (msg, fileName, line) => {
                const e = new Error(msg);
                e.fileName = fileName;
                e.lineNumber = line;
                throw e;
            },
            'kotlin.wasm.internal.stringLength': (s) => {
                return s.length;
            },
            'kotlin.wasm.internal.jsExportStringToWasm': (str, offset, len, memPtr) => {
                if (wasmMemory) {
                    const u16 = new Uint16Array(wasmMemory.buffer, memPtr, len);
                    for (let i = 0; i < len; i++) {
                        u16[i] = str.charCodeAt(offset + i);
                    }
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
            'kotlin.wasm.internal.getCachedJsObject_$external_fun': (a, b) => null,
            'kotlin.js.stackPlaceHolder_js_code': () => '',
            'kotlin.js.message_$external_prop_getter': (e) => e.message || '',
            'kotlin.js.stack_$external_prop_getter': (e) => e.stack || '',
            'kotlin.js.JsError_$external_class_instanceof': (e) => e instanceof Error,
            'kotlin.random.initialSeed': () => Math.floor(Math.random() * 4294967296)
        },
        intrinsics: {}
    };

    try {
        console.log('Loading Wasm module...');
        const { instance } = await WebAssembly.instantiate(wasm, importObject);
        console.log('SUCCESS! Module loaded!');
        const exps = instance.exports;
        console.log('Export keys:', Object.keys(exps));

        // Set up memory reference
        if (exps.memory) {
            wasmMemory = exps.memory;
            console.log('Memory size:', wasmMemory.buffer.byteLength, 'bytes');
        }

        // Call _initialize (Kotlin/Wasm init)
        if (exps._initialize) {
            console.log('\nCalling _initialize()...');
            try {
                exps._initialize();
                console.log('_initialize() done');
            } catch(e) {
                console.log('_initialize() error:', e.message);
            }
        }

        // Now check memory after init
        if (wasmMemory) {
            console.log('\nMemory after init:', wasmMemory.buffer.byteLength, 'bytes');
            const mem = new Uint8Array(wasmMemory.buffer);
            const text = new TextDecoder().decode(mem);
            
            // Search for key patterns
            let mii = text.indexOf('MII');
            if (mii >= 0) {
                console.log('\n*** FOUND MII (RSA KEY) at offset', mii, '***');
                console.log(text.substring(mii, mii + 500));
            }
            let pem = text.indexOf('-----');
            if (pem >= 0) {
                console.log('\n*** FOUND PEM at offset', pem, '***');
                console.log(text.substring(pem, pem + 500));
            }
            
            // Search for long base64 strings
            const b64 = text.match(/[A-Za-z0-9+/]{100,}={0,2}/g);
            if (b64) {
                console.log('\nLong base64 strings found:', b64.length);
                for (const s of b64) {
                    console.log('  (' + s.length + ' chars): ' + s.substring(0, 100) + '...');
                }
            }
        }

        // Try calling main or q3v
        for (const name of ['main', 'q3v']) {
            if (typeof exps[name] === 'function') {
                console.log('\nCalling ' + name + '()...');
                try {
                    const result = exps[name]();
                    console.log(name + '() returned:', typeof result, result);
                    
                    if (result !== undefined && result !== null && typeof result === 'object') {
                        console.log('Result is an object!');
                        console.log('  Constructor:', result.constructor.name);
                        console.log('  Is Proxy:', result.__proto__ === undefined || result.constructor === undefined);
                        
                        // Try to enumerate properties
                        try {
                            const keys = Object.keys(result);
                            console.log('  Own keys:', keys.length);
                            if (keys.length > 0) console.log('  Keys:', keys.slice(0, 50));
                            if (keys.length > 350) {
                                console.log('  Keys around 358:', keys.slice(355, 365));
                                console.log('  result[358]:', result[358]);
                            }
                        } catch(e) {
                            console.log('  Cannot enumerate keys:', e.message);
                        }
                        
                        // Try numeric access
                        for (const idx of [0, 1, 100, 200, 300, 358, 400, 500]) {
                            try {
                                const val = result[idx];
                                if (val !== undefined) {
                                    console.log('  result[' + idx + ']:', typeof val, val);
                                }
                            } catch(e) {}
                        }
                        
                        // Check if it's a Proxy
                        if (typeof Proxy !== 'undefined') {
                            // Try getting all possible numeric properties
                            let found = [];
                            for (let i = 0; i < 1000; i++) {
                                try {
                                    const v = result[i];
                                    if (v !== undefined) found.push(i + ':' + typeof v);
                                } catch(e) {}
                            }
                            console.log('  Defined numeric props (0-999):', found.length);
                            if (found.length > 0) {
                                console.log('  First 20:', found.slice(0, 20));
                                // Check around 358
                                let around = found.filter(f => {
                                    const idx = parseInt(f.split(':')[0]);
                                    return idx >= 350 && idx <= 370;
                                });
                                if (around.length > 0) console.log('  Around 358:', around);
                            }
                        }
                    }
                } catch(e) {
                    console.log(name + '() error:', e.message);
                    console.log(e.stack);
                }
            }
        }

    } catch(e) {
        console.log('Failed to instantiate:', e.message);
        console.log(e.stack);
    }
}

main();
