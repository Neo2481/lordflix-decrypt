// LordFlix Standalone Decrypt — Full browser polyfills
const fs = require('fs');
const buf = fs.readFileSync('/home/z/my-project/download/lordflix-standalone/hxqvpnrw.wasm');

// ─── Browser Polyfills ───────────────────────────────────
// Kotlin/Wasm needs these even if they're stubs
globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.document = {
    createElement: (tag) => {
        if (tag === 'canvas') return { getContext: () => null, toDataURL: () => '', width: 0, height: 0, style: {} };
        if (tag === 'div' || tag === 'span' || tag === 'script' || tag === 'link' || tag === 'meta' || tag === 'img')
            return { style: {}, setAttribute: () => {}, appendChild: () => {}, removeChild: () => {}, textContent: '', innerHTML: '', classList: { add: () => {}, remove: () => {} }, children: [] };
        return { style: {}, setAttribute: () => {}, appendChild: () => {}, removeChild: () => {} };
    },
    createTextNode: (t) => t,
    getElementsByTagName: () => [],
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    head: { appendChild: () => {}, removeChild: () => {} },
    body: { appendChild: () => {}, removeChild: () => {}, style: {} },
    documentElement: { style: {}, lang: 'en' },
    readyState: 'complete',
    addEventListener: () => {},
    removeEventListener: () => {},
    cookie: '',
    title: '',
    hidden: false,
    visibilityState: 'visible',
};
globalThis.navigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    language: 'en-US',
    languages: ['en-US'],
    platform: 'Win32',
    onLine: true,
    hardwareConcurrency: 8,
    maxTouchPoints: 0,
    cookieEnabled: true,
};
globalThis.location = {
    href: 'https://lordflix.org/',
    hostname: 'lordflix.org',
    pathname: '/',
    search: '',
    hash: '',
    origin: 'https://lordflix.org',
    protocol: 'https:',
    host: 'lordflix.org',
    port: '',
};
globalThis.screen = { width: 1366, height: 768, colorDepth: 24 };
globalThis.innerWidth = 1366;
globalThis.innerHeight = 768;
globalThis.performance = { now: () => Date.now(), timing: { navigationStart: Date.now() } };
globalThis.fetch = () => Promise.reject(new Error('no fetch'));
globalThis.XMLHttpRequest = function() { this.open = () => {}; this.send = () => {}; this.abort = () => {}; };
globalThis.FormData = function() {};
globalThis.Headers = function() {};
globalThis.Request = function() {};
globalThis.Response = function() {};
globalThis.URL = URL;
globalThis.URLSearchParams = URLSearchParams;
globalThis.Blob = class Blob { constructor() {} };
globalThis.File = class File { constructor() {} };
globalThis.FileReader = class FileReader { constructor() { this.readAsText = () => {}; this.readAsArrayBuffer = () => {}; } };
globalThis.MutationObserver = class MutationObserver { constructor() {} observe() {} disconnect() {} };
globalThis.ResizeObserver = class ResizeObserver { constructor() {} observe() {} disconnect() {} };
globalThis.IntersectionObserver = class IntersectionObserver { constructor() {} observe() {} disconnect() {} };
globalThis.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.requestIdleCallback = (cb) => setTimeout(cb, 1);
globalThis.cancelIdleCallback = clearTimeout;
globalThis.crypto = { getRandomValues: (arr) => require('crypto').webcrypto.getRandomValues(arr) };
globalThis.CustomEvent = class CustomEvent { constructor(type) { this.type = type; } };
globalThis.Event = class Event { constructor(type) { this.type = type; } };
globalThis.postMessage = () => {};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');
globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;
globalThis.AbortController = class AbortController { constructor() { this.signal = { aborted: false }; this.abort = () => { this.signal.aborted = true; }; } };
globalThis.queueMicrotask = (cb) => Promise.resolve().then(cb);
globalThis.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));

// ─── Wasm Imports ────────────────────────────────────────
let wasmMemory = null;

async function run() {
    console.log('Compiling Wasm...');
    const module = await WebAssembly.compile(buf);
    console.log('Compiled OK');

    const instance = await WebAssembly.instantiate(module, {
        js_code: {
            'kotlin.captureStackTrace': function() { return new Error().stack || ''; },
            'kotlin.wasm.internal.throwJsError': function(msg, name, stack) {
                const e = new Error();
                e.message = msg;
                e.name = name;
                e.stack = stack;
                throw e;
            },
            'kotlin.wasm.internal.stringLength': function(x) { return x == null ? 0 : x.length; },
            'kotlin.wasm.internal.jsExportStringToWasm': function(s, o, l, d) {
                if (wasmMemory && s != null) {
                    try {
                        const m = new Uint16Array(wasmMemory.buffer, d, l);
                        for (let i = 0; i < l; i++) m[i] = s.charCodeAt(o + i);
                    } catch(e) {}
                }
            },
            'kotlin.wasm.internal.importStringFromWasm': function(a, l, p) {
                if (!wasmMemory || l <= 0) return p || '';
                try {
                    const m = new Uint16Array(wasmMemory.buffer, a, l);
                    const s = String.fromCharCode.apply(null, m);
                    return p == null ? s : p + s;
                } catch(e) { return p || ''; }
            },
            'kotlin.wasm.internal.getJsEmptyString': function() { return ''; },
            'kotlin.wasm.internal.isNullish': function(r) { return r == null; },
            'kotlin.js.stackPlaceHolder_js_code': function() { return new Error('Stack trace').stack || ''; },
            'kotlin.random.initialSeed': function() { return ((Math.random() * 4294967296) | 0); },
        }
    });
    console.log('Instantiated OK');

    const { q3v, main, memory, _initialize } = instance.exports;
    wasmMemory = memory;
    console.log('Memory:', memory.buffer.byteLength, 'bytes');

    // Try just q3v() (start function already ran during instantiate)
    console.log('\n=== q3v() (no manual init) ===');
    try {
        const Td = q3v();
        console.log('SUCCESS! type:', typeof Td);
        if (Td != null) {
            console.log('Has [358]:', typeof Td[358]);
            if (typeof Td[358] === 'function') {
                const testInput = 'test_encrypted_data';
                console.log('\n=== Td[358](test) ===');
                try {
                    const r = Td[358](testInput);
                    console.log('type:', typeof r);
                    console.log('result:', String(r).substring(0, 500));
                } catch(e) {
                    console.log('error:', e.constructor.name);
                }
            }
        }
    } catch(e) {
        console.log('FAILED:', e.constructor.name, e.message || '');
        if (e instanceof WebAssembly.Exception && e.getArg) {
            for (let i = 0; i < 5; i++) {
                try { console.log('  arg[' + i + ']:', typeof e.getArg(i)); } catch(x) { break; }
            }
        }
    }
}

run().catch(e => console.error('FATAL:', e.message));
