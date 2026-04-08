const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
               '--disable-blink-features=AutomationControlled']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    
    // Block frame_ant.js and analytics
    await page.setRequestInterception(true);
    page.on('request', req => {
        const url = req.url();
        if (url.includes('frame_ant') || url.includes('plausible') || url.includes('aggerpunka') || url.includes('cast_framework') || url.includes('cast_sender')) {
            req.abort();
        } else {
            req.continue();
        }
    });
    
    // Collect console messages
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    page.on('pageerror', err => logs.push('ERR: ' + err.message));
    
    // Inject hooks BEFORE navigation
    await page.evaluateOnNewDocument(() => {
        window.__decryptResults = [];
        window.__wasmInfo = null;
        
        // Hook JSON.parse to catch decrypted data
        const origParse = JSON.parse.bind(JSON);
        JSON.parse = function(str, reviver) {
            const result = origParse(str, reviver);
            if (result && result.stream) {
                window.__decryptResults.push(result);
            }
            return result;
        };
        
        // Hook WebAssembly.instantiate to get the Wasm module info
        const origInstantiate = WebAssembly.instantiate.bind(WebAssembly);
        WebAssembly.instantiate = async function(moduleOrBuffer, imports) {
            const result = await origInstantiate(moduleOrBuffer, imports);
            try {
                const ex = result.instance.exports;
                const keys = Object.keys(ex);
                
                // Only process our target Wasm
                if (keys.includes('q3v') && keys.includes('_initialize')) {
                    // Save memory reference
                    const mem = ex.memory;
                    
                    // Call _initialize
                    if (ex._initialize) {
                        try { ex._initialize(); } catch(e) {}
                    }
                    
                    // Call q3v to get the Kotlin object
                    let Td = null;
                    try { Td = ex.q3v(); } catch(e) {}
                    
                    window.__wasmInfo = {
                        exportKeys: keys,
                        memorySize: mem.buffer.byteLength,
                        tdType: typeof Td,
                        tdNull: Td === null,
                        tdUndef: Td === undefined
                    };
                    
                    // If Td is available, try to enumerate its properties
                    if (Td != null && Td !== undefined) {
                        let info = window.__wasmInfo;
                        
                        // Check specific indices
                        let found = [];
                        for (let i = 0; i < 500; i++) {
                            try {
                                const v = Td[i];
                                if (v !== undefined) found.push(i + ':' + typeof v);
                            } catch(e) {}
                        }
                        info.numericProps = found.length;
                        info.numericPropList = found.slice(0, 30);
                        info.around358 = found.filter(f => {
                            const n = parseInt(f.split(':')[0]);
                            return n >= 355 && n <= 365;
                        });
                        
                        // Try 358 specifically
                        try {
                            const v358 = Td[358];
                            info.prop358 = typeof v358;
                            if (typeof v358 === 'function') {
                                try {
                                    const enc = 'iT86qn61G7hh3Bd6P/8fQbVN2/xMzDjHh+5wMKHQ2O9A9U+SXyNFb38sfWcO5GTFjdVWI3t+kBWylBRrNFYH0hq8Hh1QMqKBeYkvYeOzOR0HYwY3BKvo4f+M8MfKtRrbTWp0EmOIhKBQBzILO+gqMNrD2pVYKmPVjknK8Qn2HjQ6DFMUIBcNwNCvcIuMvKkV1jvAqjYV/XpPtMNNRyl+WlZnsry3BWS4sK1B+oZbDUuIbF4QWr6M+IL/GuIRvKV0XrAksRqC2UxZ9QLMhoWCz2vHSfFhK0Nj8Px4SSv/TQOaXhXACcMnF1GrvwvUSrXRWqfv7Rw+AwV2LKQbkUeAqgb/2y+MM+QHQ2xVfGjL5yKYsWMKAZIrxhq3iTHyXHvOjNxY+BN/02quwESGgFOCqHWWuSXSG+mvv5RMrJHhS5hFF1mV2M/4Jqo6RP9Mjcmq8g==';
                                    info.decrypted = v358(enc);
                                } catch(e) {
                                    info.decryptError = e.message;
                                }
                            }
                        } catch(e) {
                            info.prop358Error = e.message;
                        }
                        
                        // Dump memory to base64 for analysis
                        const memArr = new Uint8Array(mem.buffer);
                        // Find non-zero regions
                        let regions = [];
                        let rs = -1;
                        for (let i = 0; i < memArr.length; i++) {
                            if (memArr[i] !== 0) {
                                if (rs === -1) rs = i;
                            } else {
                                if (rs >= 0) {
                                    const len = i - rs;
                                    if (len >= 16) {
                                        regions.push({
                                            offset: rs,
                                            length: len,
                                            hex: Array.from(memArr.slice(rs, rs + Math.min(128, len)))
                                                .map(b => ('0' + b.toString(16)).slice(-2)).join('')
                                        });
                                    }
                                    rs = -1;
                                }
                            }
                        }
                        info.memRegions = regions.slice(0, 20);
                    }
                }
            } catch(e) {}
            return result;
        };
    });
    
    console.log('Navigating to lordflix.org...');
    try {
        await page.goto('https://lordflix.org', { waitUntil: 'networkidle2', timeout: 60000 });
    } catch(e) {
        console.log('Nav timeout (OK, continuing):', e.message.substring(0, 100));
    }
    
    console.log('Page URL:', page.url());
    console.log('Page title:', await page.title());
    
    // Wait for page to render
    await new Promise(r => setTimeout(r, 3000));
    
    // Try clicking a movie - take snapshot first
    console.log('Looking for movie elements...');
    const snapshot = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/movie/"], a[href*="/watch/"]'));
        return links.slice(0, 10).map(a => ({ text: a.textContent.trim().substring(0, 50), href: a.href }));
    });
    console.log('Movie links found:', snapshot.length);
    snapshot.forEach(s => console.log('  ', s.text, '→', s.href));
    
    if (snapshot.length > 0) {
        console.log('\nClicking first movie...');
        try {
            await page.click('a[href*="/movie/"], a[href*="/watch/"]', { timeout: 5000 });
            await new Promise(r => setTimeout(r, 5000));
        } catch(e) {
            console.log('Click error:', e.message.substring(0, 100));
        }
    }
    
    // Check results
    const wasmInfo = await page.evaluate(() => window.__wasmInfo);
    const decryptResults = await page.evaluate(() => window.__decryptResults);
    
    console.log('\n=== WASM INFO ===');
    console.log(JSON.stringify(wasmInfo, null, 2));
    
    console.log('\n=== DECRYPT RESULTS ===');
    console.log(JSON.stringify(decryptResults, null, 2));
    
    // Relevant console logs
    const relevantLogs = logs.filter(l => 
        l.includes('Wasm') || l.includes('ERROR') || l.includes('error') || 
        l.includes('fetch') || l.includes('Failed') || l.includes('decrypt')
    );
    if (relevantLogs.length > 0) {
        console.log('\n=== RELEVANT LOGS ===');
        relevantLogs.slice(0, 20).forEach(l => console.log('  ', l));
    }
    
    await browser.close();
})().catch(e => { console.log('Fatal:', e.message); process.exit(1); });
