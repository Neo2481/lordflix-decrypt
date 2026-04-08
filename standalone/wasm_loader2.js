const fs = require('fs');
const wasm = fs.readFileSync('/home/z/my-project/download/hxqvpnrw.wasm');
console.log('Wasm size:', wasm.length, 'bytes');
console.log('Node.js:', process.version);

// Proper JS object cache (Kotlin/Wasm needs this for class prototypes)
const objCache = new Map();
function getCachedJsObject(obj, key) {
    const k = String(key);
    if (!objCache.has(k)) {
        objCache.set(k, {});
    }
    return objCache.get(k);
}

async function main() {
    let mem = null;
    
    const importObject = {
        js_code: {
            'kotlin.captureStackTrace': () => { try { return new Error().stack || ''; } catch(e) { return ''; } },
            'kotlin.wasm.internal.throwJsError': (msg, fileName, line) => {
                const e = new Error(msg);
                e.fileName = fileName;
                e.lineNumber = line;
                throw e;
            },
            'kotlin.wasm.internal.stringLength': (s) => s.length,
            'kotlin.wasm.internal.jsExportStringToWasm': (str, offset, len, memPtr) => {
                if (mem) {
                    try {
                        const u16 = new Uint16Array(mem.buffer, memPtr, len);
                        for (let i = 0; i < len; i++) {
                            u16[i] = str.charCodeAt(offset + i);
                        }
                    } catch(e) { console.log('jsExportStringToWasm error:', e.message); }
                }
            },
            'kotlin.wasm.internal.externrefToString': (v) => String(v),
            'kotlin.wasm.internal.importStringFromWasm': (ptr, len, ptr2) => {
                if (mem) {
                    try {
                        const u16 = new Uint16Array(mem.buffer, ptr, len);
                        let s = String.fromCharCode(...u16);
                        if (ptr2 != null) return ptr2 + s;  // concat if ptr2 provided
                        return s;
                    } catch(e) { return ''; }
                }
                return '';
            },
            'kotlin.wasm.internal.getJsEmptyString': () => '',
            'kotlin.wasm.internal.isNullish': (v) => v == null,
            'kotlin.wasm.internal.getCachedJsObject_$external_fun': getCachedJsObject,
            'kotlin.js.stackPlaceHolder_js_code': () => '',
            'kotlin.js.message_$external_prop_getter': (e) => { try { return e.message || ''; } catch(x) { return ''; } },
            'kotlin.js.stack_$external_prop_getter': (e) => { try { return e.stack || ''; } catch(x) { return ''; } },
            'kotlin.js.JsError_$external_class_instanceof': (e) => { try { return e instanceof Error; } catch(x) { return false; } },
            'kotlin.random.initialSeed': () => (Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0
        },
        intrinsics: {}
    };

    console.log('\nLoading Wasm...');
    const { instance } = await WebAssembly.instantiate(wasm, importObject);
    const ex = instance.exports;
    console.log('Exports:', Object.keys(ex));

    mem = ex.memory;
    console.log('Memory:', mem.buffer.byteLength, 'bytes');

    console.log('\nCalling _initialize()...');
    try {
        ex._initialize();
        console.log('_initialize() SUCCESS!');
    } catch(e) {
        console.log('_initialize() FAILED:', e.message);
        console.log('  Offset:', e.message.match(/0x[0-9a-f]+/)?.[0] || 'unknown');
        console.log('  Cache entries:', objCache.size);
        for (const [k, v] of objCache) {
            console.log('    Key:', k, 'Value:', typeof v, v === null ? 'NULL' : 'ok');
        }
        process.exit(1);
    }

    console.log('Memory after init:', mem.buffer.byteLength, 'bytes');

    // Search memory for key patterns
    const memArr = new Uint8Array(mem.buffer);
    const text = new TextDecoder().decode(memArr);

    console.log('\n=== Searching memory for RSA key patterns ===');
    let mii = text.indexOf('MII');
    if (mii >= 0) {
        console.log('*** FOUND MII at offset', mii, '***');
        console.log(text.substring(mii, mii + 500));
    } else {
        console.log('No MII pattern found');
    }

    let pem = text.indexOf('-----');
    if (pem >= 0) {
        console.log('*** FOUND PEM at offset', pem, '***');
        console.log(text.substring(pem, pem + 500));
    } else {
        console.log('No PEM pattern found');
    }

    // Search for DER header: 30 82
    let derCount = 0;
    for (let i = 0; i < memArr.length - 4; i++) {
        if (memArr[i] === 0x30 && memArr[i+1] === 0x82) {
            const len = (memArr[i+2] << 8) | memArr[i+3];
            if (len > 100 && len < 3000) {
                console.log('Possible DER SEQUENCE at offset', i, 'length:', len);
                console.log('  Header:', Buffer.from(memArr.slice(i, Math.min(i+20, memArr.length))).toString('hex'));
                derCount++;
            }
        }
    }
    if (derCount === 0) console.log('No DER SEQUENCE found');

    // Search for high-entropy blocks (potential key material)
    console.log('\n=== Searching for high-entropy blocks ===');
    let highEntropyBlocks = [];
    for (let i = 0; i < memArr.length - 256; i += 16) {
        const chunk = memArr.slice(i, i + 256);
        const uniqueBytes = new Set(chunk).size;
        if (uniqueBytes > 200 && !chunk.every(b => b === 0)) {
            // Check if it's not UTF-16 text
            let isText = true;
            for (let j = 0; j < chunk.length - 1; j += 2) {
                if (chunk[j+1] !== 0 && chunk[j] !== 0) {
                    isText = false;
                    break;
                }
            }
            if (!isText) {
                highEntropyBlocks.push({ offset: i, entropy: uniqueBytes });
            }
        }
    }
    console.log('High-entropy blocks (>200 unique bytes/256):', highEntropyBlocks.length);
    for (const block of highEntropyBlocks.slice(0, 10)) {
        const chunk = memArr.slice(block.offset, block.offset + 128);
        console.log(`  Offset ${block.offset}: ${Buffer.from(chunk).toString('hex')}`);
    }

    // Now try q3v()
    console.log('\n=== Calling q3v() ===');
    try {
        const Td = ex.q3v();
        console.log('q3v() returned:', typeof Td, Td);
        console.log('Td == null:', Td == null);

        if (Td != null) {
            // Try numeric access
            let found = [];
            for (let i = 0; i < 600; i++) {
                try {
                    const v = Td[i];
                    if (v !== undefined) found.push(`${i}:${typeof v}`);
                } catch(e) {}
            }
            console.log('Numeric props (0-599):', found.length);
            if (found.length > 0) {
                console.log('First 30:', found.slice(0, 30));
                const around = found.filter(f => {
                    const n = parseInt(f.split(':')[0]);
                    return n >= 350 && n <= 370;
                });
                if (around.length > 0) console.log('Around 358:', around);
            }

            // Check [358] specifically
            console.log('\nTd[358]:', typeof Td[358], Td[358]);

            if (typeof Td[358] === 'function') {
                console.log('\n*** CALLING DECRYPT FUNCTION ***');
                const testData = 'iT86qn61G7hh3Bd6P/8fQbVN2/xMzDjHh+5wMKHQ2O9A9U+SXyNFb38sfWcO5GTFjdVWI3t+kBWylBRrNFYH0hq8Hh1QMqKBeYkvYeOzOR0HYwY3BKvo4f+M8MfKtRrbTWp0EmOIhKBQBzILO+gqMNrD2pVYKmPVjknK8Qn2HjQ6DFMUIBcNwNCvcIuMvKkV1jvAqjYV/XpPtMNNRyl+WlZnsry3BWS4sK1B+oZbDUuIbF4QWr6M+IL/GuIRvKV0XrAksRqC2UxZ9QLMhoWCz2vHSfFhK0Nj8Px4SSv/TQOaXhXACcMnF1GrvwvUSrXRWqfv7Rw+AwV2LKQbkUeAqgb/2y+MM+QHQ2xVfGjL5yKYsWMKAZIrxhq3iTHyXHvOjNxY+BN/02quwESGgFOCqHWWuSXSG+mvv5RMrJHhS5hFF1mV2M/4Jqo6RP9Mjcmq8g==';
                try {
                    const result = Td[358](testData);
                    console.log('DECRYPTED:', result);
                } catch(e) {
                    console.log('Decrypt error:', e.message);
                }
            }
        }
    } catch(e) {
        console.log('q3v() error:', e.message);
    }

    // Final memory dump
    console.log('\n=== FINAL MEMORY ===');
    const finalMem = new Uint8Array(mem.buffer);
    console.log('Final memory size:', finalMem.length);

    // Search for long non-zero runs
    let runs = [];
    let runStart = -1;
    for (let i = 0; i < finalMem.length; i++) {
        if (finalMem[i] !== 0) {
            if (runStart === -1) runStart = i;
        } else {
            if (runStart >= 0) {
                const len = i - runStart;
                if (len > 64) runs.push({ offset: runStart, length: len });
                runStart = -1;
            }
        }
    }
    console.log('Non-zero runs (>64 bytes):', runs.length);
    for (const run of runs.slice(0, 20)) {
        const chunk = finalMem.slice(run.offset, Math.min(run.offset + 64, finalMem.length));
        console.log(`  [${run.offset} - ${run.offset + run.length}] (${run.length} bytes): ${Buffer.from(chunk).toString('hex')}`);
    }

    // Save memory to file for analysis
    fs.writeFileSync('/home/z/my-project/download/wasm_memory_dump.bin', Buffer.from(finalMem));
    console.log('\nMemory dumped to wasm_memory_dump.bin');
}

main().catch(e => { console.log('Fatal:', e.message); process.exit(1); });
