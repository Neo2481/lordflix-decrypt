const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    
    // Create a blank page and load Wasm directly
    const html = `
    <html><body><pre id="out"></pre>
    <script>
    (async()=>{
        const out=document.getElementById('out');
        const log=m=>{out.textContent+=m+'\\n';console.log(m)};
        try{
            log('Fetching wasm...');
            const r=await fetch('https://lordflix.org/hls/hxqvpnrw.wasm');
            const buf=await r.arrayBuffer();
            log('Wasm: '+buf.byteLength+' bytes');
            
            const objCache=new Map();
            let wasmMem=null;
            
            const imports={
                js_code:{
                    'kotlin.captureStackTrace':()=>{try{return new Error().stack||''}catch(e){return''}},
                    'kotlin.wasm.internal.throwJsError':(msg,f,l)=>{const e=new Error(msg);e.fileName=f;e.lineNumber=l;throw e},
                    'kotlin.wasm.internal.stringLength':s=>s.length,
                    'kotlin.wasm.internal.jsExportStringToWasm':(str,off,len,mp)=>{if(wasmMem)try{const u=new Uint16Array(wasmMem.buffer,mp,len);for(let i=0;i<len;i++)u[i]=str.charCodeAt(off+i)}catch(e){}},
                    'kotlin.wasm.internal.externrefToString':v=>String(v),
                    'kotlin.wasm.internal.importStringFromWasm':(ptr,len,p2)=>{if(wasmMem)try{const u=new Uint16Array(wasmMem.buffer,ptr,len);let s=String.fromCharCode(...u);return p2==null?s:p2+s}catch(e){return''}return''},
                    'kotlin.wasm.internal.getJsEmptyString':()=>'',
                    'kotlin.wasm.internal.isNullish':v=>v==null,
                    'kotlin.wasm.internal.getCachedJsObject_\\$external_fun':(obj,key)=>{const k=String(key);if(!objCache.has(k))objCache.set(k,{});return objCache.get(k)},
                    'kotlin.js.stackPlaceHolder_js_code':()=>'',
                    'kotlin.js.message_\\$external_prop_getter':e=>{try{return e.message||''}catch(x){return''}},
                    'kotlin.js.stack_\\$external_prop_getter':e=>{try{return e.stack||''}catch(x){return''}},
                    'kotlin.js.JsError_\\$external_class_instanceof':e=>{try{return e instanceof Error}catch(x){return false}},
                    'kotlin.random.initialSeed':()=>(Date.now()^(Math.random()*0xFFFFFFFF))>>>0
                },
                intrinsics:{}
            };
            
            log('Instantiating...');
            const{instance}=await WebAssembly.instantiate(buf,imports);
            const ex=instance.exports;
            log('Exports: '+Object.keys(ex).join(', '));
            
            wasmMem=ex.memory;
            log('Memory before init: '+wasmMem.buffer.byteLength);
            
            log('Initializing...');
            ex._initialize();
            log('Init SUCCESS! Memory: '+wasmMem.buffer.byteLength);
            
            log('Calling q3v()...');
            const Td=ex.q3v();
            log('Td type: '+typeof Td);
            log('Td == null: '+(Td==null));
            log('Td String: '+String(Td));
            
            if(Td!=null){
                let found=[];
                for(let i=0;i<600;i++){
                    try{const v=Td[i];if(v!==undefined)found.push(i+':'+typeof v)}catch(e){}
                }
                log('Numeric props: '+found.length);
                found.slice(0,30).forEach(f=>log('  '+f));
                let around=found.filter(f=>{let n=parseInt(f.split(':')[0]);return n>=350&&n<=370});
                if(around.length>0)log('Around 358: '+JSON.stringify(around));
                
                log('Td[358] type: '+typeof Td[358]);
                if(typeof Td[358]==='function'){
                    log('*** DECRYPT FUNCTION FOUND! ***');
                    try{
                        const r=Td[358]('iT86qn61G7hh3Bd6P/8fQbVN2/xMzDjHh+5wMKHQ2O9A9U+SXyNFb38sfWcO5GTFjdVWI3t+kBWylBRrNFYH0hq8Hh1QMqKBeYkvYeOzOR0HYwY3BKvo4f+M8MfKtRrbTWp0EmOIhKBQBzILO+gqMNrD2pVYKmPVjknK8Qn2HjQ6DFMUIBcNwNCvcIuMvKkV1jvAqjYV/XpPtMNNRyl+WlZnsry3BWS4sK1B+oZbDUuIbF4QWr6M+IL/GuIRvKV0XrAksRqC2UxZ9QLMhoWCz2vHSfFhK0Nj8Px4SSv/TQOaXhXACcMnF1GrvwvUSrXRWqfv7Rw+AwV2LKQbkUeAqgb/2y+MM+QHQ2xVfGjL5yKYsWMKAZIrxhq3iTHyXHvOjNxY+BN/02quwESGgFOCqHWWuSXSG+mvv5RMrJHhS5hFF1mV2M/4Jqo6RP9Mjcmq8g==');
                        log('DECRYPTED: '+r);
                    }catch(e){log('Decrypt error: '+e.message)}
                }else if(Td[358]!==undefined){
                    log('Td[358] value: '+String(Td[358]).substring(0,200));
                }
                
                // Try getOwnPropertyNames
                try{
                    const names=Object.getOwnPropertyNames(Td);
                    log('Own property names: '+names.length);
                    names.slice(0,50).forEach(n=>log('  '+n));
                    if(names.length>350)log('Around 358: '+names.slice(355,365));
                }catch(e){log('getOwnPropertyNames error: '+e.message)}
                
                // Try Symbol.iterator
                try{
                    const iter=Td[Symbol.iterator];
                    log('Has Symbol.iterator: '+(typeof iter));
                    if(typeof iter==='function'){
                        let arr=[];
                        for(const v of Td)arr.push(v);
                        log('Iterable length: '+arr.length);
                        arr.slice(350,370).forEach((v,i)=>log('  ['+(350+i)+']: '+typeof v));
                    }
                }catch(e){log('Iterator error: '+e.message)}
            }
            
            // Dump memory
            const mem=new Uint8Array(wasmMem.buffer);
            log('\\nMemory size: '+mem.length);
            let nonZero=[];
            let rs=-1;
            for(let i=0;i<mem.length;i++){
                if(mem[i]!==0){if(rs===-1)rs=i}else{if(rs>=0){let l=i-rs;if(l>=32)nonZero.push({o:rs,l:l});rs=-1}}
            }
            log('Non-zero regions (>32 bytes): '+nonZero.length);
            nonZero.slice(0,20).forEach(r=>{
                let hex=Array.from(mem.slice(r.o,r.o+Math.min(64,r.l))).map(b=>('0'+b.toString(16)).slice(-2)).join(' ');
                log('  ['+r.o+'-'+(r.o+r.l)+'] ('+r.l+'): '+hex);
            });
            
            // Check for key patterns in memory
            const text=new TextDecoder().decode(mem);
            let mii=text.indexOf('MII');
            if(mii>=0)log('\\n*** FOUND MII at '+mii+': '+text.substring(mii,mii+200));
            else log('\\nNo MII found in memory');
            
        }catch(e){log('ERROR: '+e.message+'\\n'+e.stack)}
    })();
    </script></body></html>`;
    
    // Use data: URL to avoid navigation
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });
    
    // Wait for script to execute
    await new Promise(r => setTimeout(r, 5000));
    
    // Get output
    const output = await page.evaluate(() => document.getElementById('out').textContent);
    console.log(output);
    
    await browser.close();
})().catch(e => { console.log('Fatal:', e.message); process.exit(1); });
