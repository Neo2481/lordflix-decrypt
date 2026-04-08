const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    
    // Listen for console
    page.on('console', msg => console.log('PAGE:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERR:', err.message));
    
    const result = await page.evaluate(() => {
        return fetch('https://lordflix.org/hls/hxqvpnrw.wasm')
            .then(r => r.arrayBuffer())
            .then(buf => {
                console.log('Got wasm:', buf.byteLength);
                
                const objCache = new Map();
                let wasmMem = null;
                
                const imports = {
                    js_code: {
                        'kotlin.captureStackTrace': () => '',
                        'kotlin.wasm.internal.throwJsError': (m, f, l) => { throw new Error(m); },
                        'kotlin.wasm.internal.stringLength': s => s.length,
                        'kotlin.wasm.internal.jsExportStringToWasm': (s, o, l, p) => { if(wasmMem)try{new Uint16Array(wasmMem.buffer,p,l).forEach((v,i)=>v=s.charCodeAt(o+i))}catch(e){} },
                        'kotlin.wasm.internal.externrefToString': v => String(v),
                        'kotlin.wasm.internal.importStringFromWasm': (p, l, p2) => { if(wasmMem)try{return String.fromCharCode(...new Uint16Array(wasmMem.buffer,p,l))}catch(e){} return ''; },
                        'kotlin.wasm.internal.getJsEmptyString': () => '',
                        'kotlin.wasm.internal.isNullish': v => v == null,
                        'kotlin.wasm.internal.getCachedJsObject_$external_fun': (o, k) => { const key=String(k); if(!objCache.has(key))objCache.set(key,{}); return objCache.get(key); },
                        'kotlin.js.stackPlaceHolder_js_code': () => '',
                        'kotlin.js.message_$external_prop_getter': e => (e&&e.message)||'',
                        'kotlin.js.stack_$external_prop_getter': e => (e&&e.stack)||'',
                        'kotlin.js.JsError_$external_class_instanceof': e => e instanceof Error,
                        'kotlin.random.initialSeed': () => 12345
                    },
                    intrinsics: {}
                };
                
                return WebAssembly.instantiate(buf, imports).then(({instance}) => {
                    const ex = instance.exports;
                    console.log('Exports:', Object.keys(ex));
                    wasmMem = ex.memory;
                    console.log('Memory:', wasmMem.buffer.byteLength);
                    
                    console.log('Calling _initialize...');
                    ex._initialize();
                    console.log('Init done! Memory:', wasmMem.buffer.byteLength);
                    
                    console.log('Calling q3v...');
                    const Td = ex.q3v();
                    console.log('q3v returned. type=' + typeof Td + ', null=' + (Td===null) + ', undef=' + (Td===undefined));
                    console.log('String(Td): ' + String(Td));
                    
                    if (Td != null && Td !== undefined) {
                        // Try numeric access
                        for (let i = 355; i <= 365; i++) {
                            try {
                                const v = Td[i];
                                console.log('Td[' + i + '] = ' + typeof v + ' : ' + String(v).substring(0, 100));
                            } catch(e) {
                                console.log('Td[' + i + '] ERROR: ' + e.message);
                            }
                        }
                        
                        // Try calling 358
                        try {
                            const fn = Td[358];
                            console.log('Td[358] type: ' + typeof fn);
                            if (typeof fn === 'function') {
                                console.log('IT IS A FUNCTION! Calling with test data...');
                                const enc = 'iT86qn61G7hh3Bd6P/8fQbVN2/xMzDjHh+5wMKHQ2O9A9U+SXyNFb38sfWcO5GTFjdVWI3t+kBWylBRrNFYH0hq8Hh1QMqKBeYkvYeOzOR0HYwY3BKvo4f+M8MfKtRrbTWp0EmOIhKBQBzILO+gqMNrD2pVYKmPVjknK8Qn2HjQ6DFMUIBcNwNCvcIuMvKkV1jvAqjYV/XpPtMNNRyl+WlZnsry3BWS4sK1B+oZbDUuIbF4QWr6M+IL/GuIRvKV0XrAksRqC2UxZ9QLMhoWCz2vHSfFhK0Nj8Px4SSv/TQOaXhXACcMnF1GrvwvUSrXRWqfv7Rw+AwV2LKQbkUeAqgb/2y+MM+QHQ2xVfGjL5yKYsWMKAZIrxhq3iTHyXHvOjNxY+BN/02quwESGgFOCqHWWuSXSG+mvv5RMrJHhS5hFF1mV2M/4Jqo6RP9Mjcmq8g==';
                                const result = fn(enc);
                                console.log('DECRYPTED: ' + result);
                                return { success: true, decrypted: result };
                            }
                        } catch(e) {
                            console.log('358 error: ' + e.message);
                        }
                        
                        return { success: false, tdType: typeof Td };
                    }
                    
                    return { success: false, tdNull: true };
                });
            })
            .catch(e => {
                console.log('ERROR: ' + e.message);
                return { error: e.message };
            });
    });
    
    console.log('\n=== FINAL RESULT ===');
    console.log(JSON.stringify(result));
    
    await browser.close();
})().catch(e => { console.log('Fatal:', e.message); process.exit(1); });
