const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    
    const result = await page.evaluate(async () => {
        try {
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
            
            // Initialize
            ex._initialize();
            
            // Call q3v
            const Td = ex.q3v();
            
            let info = {
                tdType: typeof Td,
                tdIsNull: Td === null,
                tdIsUndefined: Td === undefined,
                tdToString: String(Td),
            };
            
            if (Td != null && Td !== undefined) {
                // Try getOwnPropertyNames
                try {
                    const names = Object.getOwnPropertyNames(Td);
                    info.ownPropNames = names;
                    info.ownPropCount = names.length;
                } catch(e) { info.ownPropError = e.message; }
                
                // Try Reflect.ownKeys
                try {
                    info.reflectKeys = Reflect.ownKeys(Td).map(String);
                } catch(e) { info.reflectError = e.message; }
                
                // Try numeric access for 0-600
                let numFound = [];
                for (let i = 0; i < 600; i++) {
                    try {
                        const v = Td[i];
                        if (v !== undefined) {
                            numFound.push({ idx: i, type: typeof v, val: String(v).substring(0, 80) });
                        }
                    } catch(e) {}
                }
                info.numericPropCount = numFound.length;
                info.numericProps = numFound.slice(0, 30);
                info.around358 = numFound.filter(p => p.idx >= 355 && p.idx <= 365);
                
                // Check 358 specifically
                try {
                    const v358 = Td[358];
                    info.prop358Type = typeof v358;
                    if (v358 !== undefined) {
                        info.prop358Value = String(v358).substring(0, 200);
                        if (typeof v358 === 'function') {
                            try {
                                const testEnc = 'iT86qn61G7hh3Bd6P/8fQbVN2/xMzDjHh+5wMKHQ2O9A9U+SXyNFb38sfWcO5GTFjdVWI3t+kBWylBRrNFYH0hq8Hh1QMqKBeYkvYeOzOR0HYwY3BKvo4f+M8MfKtRrbTWp0EmOIhKBQBzILO+gqMNrD2pVYKmPVjknK8Qn2HjQ6DFMUIBcNwNCvcIuMvKkV1jvAqjYV/XpPtMNNRyl+WlZnsry3BWS4sK1B+oZbDUuIbF4QWr6M+IL/GuIRvKV0XrAksRqC2UxZ9QLMhoWCz2vHSfFhK0Nj8Px4SSv/TQOaXhXACcMnF1GrvwvUSrXRWqfv7Rw+AwV2LKQbkUeAqgb/2y+MM+QHQ2xVfGjL5yKYsWMKAZIrxhq3iTHyXHvOjNxY+BN/02quwESGgFOCqHWWuSXSG+mvv5RMrJHhS5hFF1mV2M/4Jqo6RP9Mjcmq8g==';
                                info.decrypted = v358(testEnc);
                            } catch(e) {
                                info.decryptError = e.message;
                            }
                        }
                    } else {
                        info.prop358Value = 'undefined';
                    }
                } catch(e) {
                    info.prop358Error = e.message;
                }
                
                // Check string properties
                let strProps = {};
                for (const prop of ['memory', 'main', 'q3v', 'decrypt', 'length', 'constructor', 'prototype', 'toString', 'valueOf']) {
                    try {
                        const v = Td[prop];
                        if (v !== undefined) strProps[prop] = typeof v;
                    } catch(e) {}
                }
                info.stringProps = strProps;
                
                // Try typeof with various indices
                let typeChecks = {};
                for (const idx of [0, 1, 2, 10, 50, 100, 200, 300, 358, 400, 500]) {
                    try {
                        const t = typeof Td[idx];
                        typeChecks[idx] = t;
                    } catch(e) {
                        typeChecks[idx] = 'error:' + e.message;
                    }
                }
                info.typeChecks = typeChecks;
                
            } else {
                info.note = 'Td is null or undefined - cannot inspect properties';
            }
            
            return info;
        } catch(e) {
            return { error: e.message, stack: e.stack?.substring(0, 500) };
        }
    });
    
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
})().catch(e => { console.log('Fatal:', e.message); process.exit(1); });
