const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', 
               '--disable-blink-features=AutomationControlled']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    
    // Check Wasm GC support
    const wasmSupport = await page.evaluate(() => {
        // Test if Wasm GC is supported by trying to compile a module with gc types
        try {
            const bytes = new Uint8Array([
                0x00, 0x61, 0x73, 0x6d, // magic
                0x01, 0x00, 0x00, 0x00, // version
                0x5f, // rec group section (id=127 for type section with GC)
                // minimal GC module
                0x01, 0x04, 0x01, 0x70, 0x00, 0x00  // type section: 1 type, struct with 0 fields
            ]);
            return WebAssembly.validate(bytes);
        } catch(e) {
            return false;
        }
    });
    console.log('Wasm GC support:', wasmSupport);
    
    // Try a different approach: inject the script directly on the site
    // First, check what page.goto returns with a shorter timeout
    console.log('Navigating...');
    try {
        await page.goto('https://lordflix.org', { waitUntil: 'domcontentloaded', timeout: 20000 });
        console.log('DOM loaded:', page.url());
    } catch(e) {
        console.log('Nav error (continuing anyway):', e.message.substring(0, 100));
    }
    
    // Wait a bit for JS to execute
    await new Promise(r => setTimeout(r, 3000));
    
    // Try to access the Wasm through the page's own context
    // Inject script that hooks fetch and catches the decryption
    const hookResult = await page.evaluate(async () => {
        return new Promise((resolve) => {
            // Hook JSON.parse to catch decrypted data
            const origParse = JSON.parse;
            JSON.parse = function(str) {
                const result = origParse.call(this, str);
                if (result && result.stream) {
                    resolve({ success: true, decrypted: result });
                }
                return result;
            };
            
            // Hook WebAssembly.instantiate to inspect exports
            const origInstantiate = WebAssembly.instantiate;
            WebAssembly.instantiate = async function(module, imports) {
                const result = await origInstantiate.apply(this, arguments);
                try {
                    const ex = result.instance.exports;
                    const keys = Object.keys(ex);
                    
                    // Try calling _initialize
                    if (ex._initialize) ex._initialize();
                    
                    // Check q3v return
                    const Td = ex.q3v();
                    
                    // Try to enumerate Td's properties
                    let props = {};
                    if (Td != null) {
                        // Try Reflect
                        try { props.reflectOwnKeys = Reflect.ownKeys(Td); } catch(e) {}
                        try { props.getOwnPropertyNames = Object.getOwnPropertyNames(Td); } catch(e) {}
                        try { props.getOwnPropertySymbols = Object.getOwnPropertySymbols(Td); } catch(e) {}
                        
                        // Try numeric access
                        let numProps = [];
                        for (let i = 0; i < 600; i++) {
                            try {
                                const v = Td[i];
                                if (v !== undefined) numProps.push(i + ':' + typeof v);
                            } catch(e) {}
                        }
                        props.numericProps = numProps;
                        props.numericPropCount = numProps.length;
                        
                        // Check 358 specifically
                        try {
                            const v358 = Td[358];
                            props.prop358Type = typeof v358;
                            props.prop358Value = v358 !== undefined ? String(v358).substring(0, 100) : 'undefined';
                            
                            if (typeof v358 === 'function') {
                                try {
                                    const testEnc = 'iT86qn61G7hh3Bd6P/8fQbVN2/xMzDjHh+5wMKHQ2O9A9U+SXyNFb38sfWcO5GTFjdVWI3t+kBWylBRrNFYH0hq8Hh1QMqKBeYkvYeOzOR0HYwY3BKvo4f+M8MfKtRrbTWp0EmOIhKBQBzILO+gqMNrD2pVYKmPVjknK8Qn2HjQ6DFMUIBcNwNCvcIuMvKkV1jvAqjYV/XpPtMNNRyl+WlZnsry3BWS4sK1B+oZbDUuIbF4QWr6M+IL/GuIRvKV0XrAksRqC2UxZ9QLMhoWCz2vHSfFhK0Nj8Px4SSv/TQOaXhXACcMnF1GrvwvUSrXRWqfv7Rw+AwV2LKQbkUeAqgb/2y+MM+QHQ2xVfGjL5yKYsWMKAZIrxhq3iTHyXHvOjNxY+BN/02quwESGgFOCqHWWuSXSG+mvv5RMrJHhS5hFF1mV2M/4Jqo6RP9Mjcmq8g==';
                                    const dec = v358(testEnc);
                                    props.decryptResult = dec;
                                } catch(e) {
                                    props.decryptError = e.message;
                                }
                            }
                        } catch(e) {
                            props.prop358Error = e.message;
                        }
                    }
                    
                    resolve({
                        wasmLoaded: true,
                        exportKeys: keys,
                        tdType: typeof Td,
                        tdNull: Td == null,
                        tdStringValue: String(Td),
                        props: props
                    });
                } catch(e) {
                    resolve({ wasmLoaded: true, error: e.message, exportKeys: keys });
                }
                return result;
            };
            
            // Set timeout
            setTimeout(() => {
                resolve({ wasmLoaded: false, error: 'Timeout waiting for Wasm' });
            }, 15000);
        });
    });
    
    console.log('\n=== RESULTS ===');
    console.log(JSON.stringify(hookResult, null, 2));
    
    await browser.close();
})().catch(e => { console.log('Fatal:', e.message); process.exit(1); });
