const puppeteer = require('puppeteer');

(async () => {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process'
        ]
    });
    
    const page = await browser.newPage();
    
    // Set a realistic User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Block frame_ant.js
    await page.setRequestInterception(true);
    page.on('request', req => {
        if (req.url().includes('frame_ant.js') || req.url().includes('plausible') || req.url().includes('kh.aggerpunka')) {
            req.abort();
        } else {
            req.continue();
        }
    });
    
    // Intercept console messages
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('WASM') || text.includes('Td') || text.includes('358') || 
            text.includes('DECRYPT') || text.includes('FOUND') || text.includes('error') ||
            text.includes('Error') || text.includes('ERROR') || text.includes('SUCCESS') ||
            text.includes('q3v') || text.includes('Key') || text.includes('MII') ||
            text.includes('memory') || text.includes('Numeric') || text.includes('init')) {
            console.log('CONSOLE:', text);
        }
    });

    console.log('Navigating to lordflix.org...');
    await page.goto('https://lordflix.org', { waitUntil: 'networkidle2', timeout: 45000 });
    console.log('Page loaded:', page.url());
    console.log('Title:', await page.title());
    
    // Wait for the page to settle
    await new Promise(r => setTimeout(r, 3000));

    // Now inject our Wasm inspection script
    console.log('\nInjecting Wasm inspector...');
    const result = await page.evaluate(async () => {
        try {
            const wasmUrl = 'https://lordflix.org/hls/hxqvpnrw.wasm';
            
            // Check if the Wasm is already cached/accessible
            const resp = await fetch(wasmUrl);
            if (!resp.ok) return { error: 'Failed to fetch wasm: ' + resp.status };
            
            const wasmBuf = await resp.arrayBuffer();
            
            // Set up proper imports
            const objCache = new Map();
            
            let wasmMem = null;
            
            const imports = {
                js_code: {
                    'kotlin.captureStackTrace': () => { try { return new Error().stack || ''; } catch(e) { return ''; } },
                    'kotlin.wasm.internal.throwJsError': (msg, f, l) => { const e = new Error(msg); e.fileName = f; e.lineNumber = l; throw e; },
                    'kotlin.wasm.internal.stringLength': s => s.length,
                    'kotlin.wasm.internal.jsExportStringToWasm': (str, offset, len, memPtr) => {
                        if (wasmMem) {
                            try {
                                const u16 = new Uint16Array(wasmMem.buffer, memPtr, len);
                                for (let i = 0; i < len; i++) u16[i] = str.charCodeAt(offset + i);
                            } catch(e) {}
                        }
                    },
                    'kotlin.wasm.internal.externrefToString': v => String(v),
                    'kotlin.wasm.internal.importStringFromWasm': (ptr, len, ptr2) => {
                        if (wasmMem) {
                            try {
                                const u16 = new Uint16Array(wasmMem.buffer, ptr, len);
                                let s = String.fromCharCode(...u16);
                                return ptr2 == null ? s : ptr2 + s;
                            } catch(e) { return ''; }
                        }
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
            
            const { instance } = await WebAssembly.instantiate(wasmBuf, imports);
            const ex = instance.exports;
            const exportKeys = Object.keys(ex);
            
            wasmMem = ex.memory;
            
            // Initialize
            ex._initialize();
            
            const memAfterInit = wasmMem.buffer.byteLength;
            
            // Call q3v
            const Td = ex.q3v();
            
            let tdInfo = {
                type: typeof Td,
                isNull: Td == null,
                stringValue: String(Td),
                constructorName: Td ? (Td.constructor ? Td.constructor.name : 'none') : 'n/a'
            };
            
            // Try numeric property access
            let numericProps = {};
            for (let i = 0; i < 600; i++) {
                try {
                    const v = Td[i];
                    if (v !== undefined) {
                        numericProps[i] = typeof v + ':' + String(v).substring(0, 100);
                    }
                } catch(e) {}
            }
            
            // Check Td[358] specifically
            let decryptInfo = {};
            try {
                const d358 = Td[358];
                decryptInfo.type = typeof d358;
                decryptInfo.value = String(d358).substring(0, 200);
                
                if (typeof d358 === 'function') {
                    const testEnc = 'iT86qn61G7hh3Bd6P/8fQbVN2/xMzDjHh+5wMKHQ2O9A9U+SXyNFb38sfWcO5GTFjdVWI3t+kBWylBRrNFYH0hq8Hh1QMqKBeYkvYeOzOR0HYwY3BKvo4f+M8MfKtRrbTWp0EmOIhKBQBzILO+gqMNrD2pVYKmPVjknK8Qn2HjQ6DFMUIBcNwNCvcIuMvKkV1jvAqjYV/XpPtMNNRyl+WlZnsry3BWS4sK1B+oZbDUuIbF4QWr6M+IL/GuIRvKV0XrAksRqC2UxZ9QLMhoWCz2vHSfFhK0Nj8Px4SSv/TQOaXhXACcMnF1GrvwvUSrXRWqfv7Rw+AwV2LKQbkUeAqgb/2y+MM+QHQ2xVfGjL5yKYsWMKAZIrxhq3iTHyXHvOjNxY+BN/02quwESGgFOCqHWWuSXSG+mvv5RMrJHhS5hFF1mV2M/4Jqo6RP9Mjcmq8g==';
                    try {
                        const decrypted = d358(testEnc);
                        decryptInfo.decrypted = decrypted;
                    } catch(e) {
                        decryptInfo.callError = e.message;
                    }
                }
            } catch(e) {
                decryptInfo.error = e.message;
            }
            
            // Search memory
            const memArr = new Uint8Array(wasmMem.buffer);
            const memText = new TextDecoder().decode(memArr);
            
            let miiIdx = memText.indexOf('MII');
            let pemIdx = memText.indexOf('-----');
            
            // Find all non-zero regions
            let nonZeroRegions = [];
            let runStart = -1;
            for (let i = 0; i < memArr.length; i++) {
                if (memArr[i] !== 0) {
                    if (runStart === -1) runStart = i;
                } else {
                    if (runStart >= 0) {
                        const len = i - runStart;
                        if (len >= 16) {
                            const hex = Array.from(memArr.slice(runStart, Math.min(runStart + 64, memArr.length)))
                                .map(b => ('0' + b.toString(16)).slice(-2)).join('');
                            nonZeroRegions.push({ offset: runStart, length: len, hex: hex });
                        }
                        runStart = -1;
                    }
                }
            }
            
            return {
                wasmSize: wasmBuf.byteLength,
                exportKeys: exportKeys,
                memSize: memAfterInit,
                tdInfo: tdInfo,
                numericPropCount: Object.keys(numericProps).length,
                numericProps: numericProps,
                decryptInfo: decryptInfo,
                miiIdx: miiIdx,
                pemIdx: pemIdx,
                cacheEntries: objCache.size,
                nonZeroRegions: nonZeroRegions.slice(0, 30)
            };
        } catch(e) {
            return { error: e.message, stack: e.stack?.substring(0, 500) };
        }
    });
    
    console.log('\n=== RESULTS ===');
    console.log(JSON.stringify(result, null, 2));
    
    await browser.close();
    console.log('\nDone.');
})().catch(e => {
    console.log('Fatal:', e.message);
    process.exit(1);
});
