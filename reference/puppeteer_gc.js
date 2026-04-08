const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
            '--enable-experimental-webassembly-features',
            '--js-flags=--experimental-wasm-gc --experimental-wasm-function-references'
        ]
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    
    // Check Wasm GC support
    const gcSupport = await page.evaluate(() => {
        // Simple test: try to compile a Wasm module with struct type (GC feature)
        try {
            // Minimal valid wasm module with struct type (type section with (struct))
            const bytes = new Uint8Array([
                0x00, 0x61, 0x73, 0x6d,  // \0asm
                0x01, 0x00, 0x00, 0x00,  // version 1
                // Type section (id=1)
                0x01, 0x07,  // section id=1, size=7
                0x01,        // 1 type
                0x5f, 0x00,  // rec type, 0 subtypes
                0x50, 0x02, 0x7f, 0x7e  // struct with 2 fields: i32, i64
            ]);
            return WebAssembly.validate(bytes);
        } catch(e) {
            return { error: e.message };
        }
    });
    console.log('Wasm GC support:', gcSupport);
    
    if (gcSupport !== true) {
        console.log('Wasm GC not available, cannot proceed');
        await browser.close();
        return;
    }
    
    // Create a data URL page that loads and uses the Wasm
    const result = await page.evaluate(async () => {
        try {
            // Fetch Wasm
            const resp = await fetch('https://lordflix.org/hls/hxqvpnrw.wasm');
            const buf = await resp.arrayBuffer();
            
            const objCache = new Map();
            let wasmMem = null;
            
            const imports = {
                js_code: {
                    'kotlin.captureStackTrace': () => { try { return new Error().stack || ''; } catch(e) { return ''; } },
                    'kotlin.wasm.internal.throwJsError': (msg, f, l) => { const e = new Error(msg); e.fileName = f; e.lineNumber = l; throw e; },
                    'kotlin.wasm.internal.stringLength': s => s.length,
                    'kotlin.wasm.internal.jsExportStringToWasm': (str, off, len, mp) => {
                        if (wasmMem) try { const u = new Uint16Array(wasmMem.buffer, mp, len); for (let i = 0; i < len; i++) u[i] = str.charCodeAt(off + i); } catch(e) {}
                    },
                    'kotlin.wasm.internal.externrefToString': v => String(v),
                    'kotlin.wasm.internal.importStringFromWasm': (ptr, len, p2) => {
                        if (wasmMem) try { const u = new Uint16Array(wasmMem.buffer, ptr, len); let s = String.fromCharCode(...u); return p2 == null ? s : p2 + s; } catch(e) { return ''; }
                        return '';
                    },
                    'kotlin.wasm.internal.getJsEmptyString': () => '',
                    'kotlin.wasm.internal.isNullish': v => v == null,
                    'kotlin.wasm.internal.getCachedJsObject_$external_fun': (obj, key) => {
                        const k = String(key);
                        if (!objCache.has(k)) objCache.set(k, {});
                        return objCache.get(k);
                    },
                    'kotlin.js.stackPlaceHolder_js_code': () => '',
                    'kotlin.js.message_$external_prop_getter': e => { try { return e.message || ''; } catch(x) { return ''; } },
                    'kotlin.js.stack_$external_prop_getter': e => { try { return e.stack || ''; } catch(x) { return ''; } },
                    'kotlin.js.JsError_$external_class_instanceof': e => { try { return e instanceof Error; } catch(x) { return false; } },
                    'kotlin.random.initialSeed': () => (Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0
                },
                intrinsics: {}
            };
            
            const { instance } = await WebAssembly.instantiate(buf, imports);
            const ex = instance.exports;
            
            wasmMem = ex.memory;
            ex._initialize();
            
            const Td = ex.q3v();
            
            // With GC support, Td should be a proper Wasm struct object
            let result = {
                tdType: typeof Td,
                tdIsNull: Td === null,
                tdIsUndefined: Td === undefined,
                tdStringRep: String(Td),
                tdConstructor: Td ? Td.constructor?.name : 'N/A',
                tdProto: Td ? Object.getPrototypeOf(Td)?.toString?.() : 'N/A'
            };
            
            // Check numeric access
            let numericProps = {};
            if (Td != null) {
                for (let i = 0; i < 600; i++) {
                    try {
                        const v = Td[i];
                        if (v !== undefined) numericProps[i] = typeof v;
                    } catch(e) {}
                }
                result.numericPropCount = Object.keys(numericProps).length;
                result.numericProps = numericProps;
                
                // Check 358
                try {
                    const v = Td[358];
                    result.prop358Type = typeof v;
                    result.prop358Value = v !== undefined ? String(v).substring(0, 200) : 'undefined';
                    result.prop358Callable = typeof v === 'function';
                    
                    if (typeof v === 'function') {
                        try {
                            const testEnc = 'iT86qn61G7hh3Bd6P/8fQbVN2/xMzDjHh+5wMKHQ2O9A9U+SXyNFb38sfWcO5GTFjdVWI3t+kBWylBRrNFYH0hq8Hh1QMqKBeYkvYeOzOR0HYwY3BKvo4f+M8MfKtRrbTWp0EmOIhKBQBzILO+gqMNrD2pVYKmPVjknK8Qn2HjQ6DFMUIBcNwNCvcIuMvKkV1jvAqjYV/XpPtMNNRyl+WlZnsry3BWS4sK1B+oZbDUuIbF4QWr6M+IL/GuIRvKV0XrAksRqC2UxZ9QLMhoWCz2vHSfFhK0Nj8Px4SSv/TQOaXhXACcMnF1GrvwvUSrXRWqfv7Rw+AwV2LKQbkUeAqgb/2y+MM+QHQ2xVfGjL5yKYsWMKAZIrxhq3iTHyXHvOjNxY+BN/02quwESGgFOCqHWWuSXSG+mvv5RMrJHhS5hFF1mV2M/4Jqo6RP9Mjcmq8g==';
                            const dec = v(testEnc);
                            result.decrypted = dec;
                        } catch(e) {
                            result.decryptError = e.message;
                        }
                    }
                } catch(e) {
                    result.prop358Error = e.message;
                }
                
                // Try getOwnPropertyNames
                try {
                    result.ownPropertyNames = Object.getOwnPropertyNames(Td);
                    result.ownPropertyNamesCount = result.ownPropertyNames.length;
                } catch(e) {
                    result.ownPropertyNamesError = e.message;
                }
                
                // Try Reflect.ownKeys
                try {
                    result.reflectKeys = Reflect.ownKeys(Td);
                } catch(e) {
                    result.reflectKeysError = e.message;
                }
            }
            
            return result;
        } catch(e) {
            return { error: e.message, stack: e.stack?.substring(0, 500) };
        }
    });
    
    console.log('\n=== RESULTS ===');
    console.log(JSON.stringify(result, null, 2));
    
    await browser.close();
})().catch(e => { console.log('Fatal:', e.message); process.exit(1); });
