/**
 * LordFlix Decrypt API v2 — Direct Wasm Calls
 *
 * Instead of MITM (Response.json interception + page reload per request),
 * this version:
 *   1. Loads lordflix.org ONCE and captures the Wasm decrypt function (Td[358])
 *   2. Calls it DIRECTLY for every request — no reloads, no interception
 *   3. ~100ms per decrypt instead of ~5-8s
 *
 * How it works:
 *   - Hook WebAssembly.instantiateStreaming → capture instance
 *   - Call instance.exports.q3v() → get function table Td
 *   - Td[358] is the RSA-2048 decrypt function
 *   - Store it on window → call it directly for every API request
 *
 * Env vars:
 *   PORT        – listen port            (default 3456)
 *   HEADLESS    – show browser window    (default true)
 *   INIT_URL    – LordFlix URL to load   (default https://lordflix.org)
 *                 Must be a page that triggers the Wasm to load
 *                 (any movie/show page works — the API auto-navigates)
 *   TIMEOUT     – per-request timeout ms (default 15000)
 */

const express   = require('express');
const cors      = require('cors');
const puppeteer = require('puppeteer');

const PORT     = process.env.PORT     || 3456;
const HEADLESS = process.env.HEADLESS !== 'false';
const INIT_URL = process.env.INIT_URL || 'https://lordflix.org';
const TIMEOUT  = parseInt(process.env.TIMEOUT || '15000', 10);

// ─── Hook script — captures the decrypt function from Wasm ────
const HOOK_SCRIPT = `
window.__lf = {
    decryptFn: null,      // Td[358] — the RSA decrypt function
    ready: false,
    captureLog: [],
    wasmLoaded: false,
    callCount: 0
};

// Hook WebAssembly.instantiateStreaming to capture the Wasm instance
const __origIST = WebAssembly.instantiateStreaming;
WebAssembly.instantiateStreaming = async function(source, imports) {
    const result = await __origIST.call(WebAssembly, source, imports);
    try {
        const exports = result.instance.exports;
        window.__lf.captureLog.push('instance captured, exports: ' + Object.keys(exports).join(', '));

        // q3v() returns the function table Td — Td[358] is the decrypt function
        if (typeof exports.q3v === 'function') {
            const Td = exports.q3v();
            window.__lf.captureLog.push('q3v() called, type: ' + typeof Td);

            if (Td && typeof Td === 'object' && Td[358]) {
                window.__lf.decryptFn = Td[358];
                window.__lf.ready = true;
                window.__lf.wasmLoaded = true;
                window.__lf.captureLog.push('Td[358] captured successfully!');
            } else if (Td && typeof Td === 'function') {
                // Sometimes q3v returns something unexpected — log it
                window.__lf.captureLog.push('q3v returned function, trying index...');
            }
        }
    } catch(e) {
        window.__lf.captureLog.push('hook error: ' + e.message);
    }
    return result;
};

// Also hook WebAssembly.instantiate (fallback)
const __origI = WebAssembly.instantiate;
WebAssembly.instantiate = async function(moduleSource, imports) {
    const result = await __origI.call(WebAssembly, moduleSource, imports);
    try {
        const exports = result.instance.exports;
        if (typeof exports.q3v === 'function' && !window.__lf.ready) {
            const Td = exports.q3v();
            if (Td && Td[358]) {
                window.__lf.decryptFn = Td[358];
                window.__lf.ready = true;
                window.__lf.wasmLoaded = true;
                window.__lf.captureLog.push('Td[358] captured via instantiate fallback!');
            }
        }
    } catch(e) {}
    return result;
};
`;

// ─── Browser management ───────────────────────────────
let browser = null;
let page = null;
let initializing = false;

async function getBrowser() {
    if (!browser || !browser.connected) {
        const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
        console.log('[Browser] Launching Chromium...' + (execPath ? ' (' + execPath + ')' : ''));
        browser = await puppeteer.launch({
            headless: HEADLESS ? 'new' : false,
            executablePath: execPath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-gpu',
                '--single-process',
            ],
        });
        browser.on('disconnected', () => {
            browser = null;
            page = null;
            console.log('[Browser] Disconnected');
        });
    }
    return browser;
}

async function getPage() {
    if (page && page.isClosed()) {
        page = null;
    }
    if (!page) {
        const br = await getBrowser();
        page = await br.newPage();

        // Block frame_ant.js (anti-bot)
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.url().includes('frame_ant')) {
                req.abort();
                return;
            }
            req.continue();
        });

        // Inject hook before any page JS runs
        await page.evaluateOnNewDocument(HOOK_SCRIPT);

        // Realistic browser fingerprint
        await page.setViewport({ width: 1366, height: 768 });
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        );
    }
    return page;
}

// ─── Ensure the decrypt function is captured ──────────
async function ensureReady() {
    const pg = await getPage();

    // Check if already ready
    const status = await pg.evaluate(() => ({
        ready: window.__lf.ready,
        wasmLoaded: window.__lf.wasmLoaded,
        log: window.__lf.captureLog,
    }));

    if (status.ready) {
        console.log('[Ready] Decrypt function already captured');
        return;
    }

    if (initializing) {
        // Wait for other initialization to finish
        for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 500));
            const check = await pg.evaluate(() => window.__lf.ready);
            if (check) {
                console.log('[Ready] Decrypt function captured by parallel init');
                return;
            }
        }
        throw new Error('Initialization timeout — another init is running');
    }

    initializing = true;
    try {
        console.log('[Init] Navigating to ' + INIT_URL);
        await pg.goto(INIT_URL, { waitUntil: 'networkidle2', timeout: 30000 });

        // Check if Wasm loaded on this page
        let check = await pg.evaluate(() => window.__lf.ready);
        if (check) {
            console.log('[Init] Wasm loaded on initial page');
            return;
        }

        // Wasm is loaded lazily — find a movie/show link and click it
        console.log('[Init] Wasm not loaded yet — looking for a content link...');

        const linkFound = await pg.evaluate(() => {
            // Find movie/show links on the page
            const links = Array.from(document.querySelectorAll('a[href]'));
            const contentLink = links.find(a => {
                const href = a.getAttribute('href') || '';
                return href.includes('/movie/') || href.includes('/tv/') ||
                       href.includes('/watch/') || href.includes('/show/');
            });
            if (contentLink) {
                contentLink.click();
                return contentLink.getAttribute('href');
            }
            // Fallback: any internal link
            const anyLink = links.find(a => {
                const href = a.getAttribute('href') || '';
                return href.startsWith('/') && href.length > 2;
            });
            if (anyLink) {
                anyLink.click();
                return anyLink.getAttribute('href');
            }
            return null;
        });

        if (linkFound) {
            console.log('[Init] Clicked link: ' + linkFound);
            await pg.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
        } else {
            console.log('[Init] No content link found — trying homepage categories...');
        }

        // Poll for Wasm to load
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 500));
            check = await pg.evaluate(() => window.__lf.ready);
            if (check) {
                console.log('[Init] Wasm loaded successfully!');
                const log = await pg.evaluate(() => window.__lf.captureLog);
                console.log('[Init] Capture log:', log);
                return;
            }
        }

        // Still not ready — dump debug info
        const log = await pg.evaluate(() => window.__lf.captureLog);
        console.log('[Init] Capture log:', log);
        throw new Error('Wasm did not load. Navigate to a movie/show page manually or set INIT_URL to a content page URL.');

    } finally {
        initializing = false;
    }
}

// ─── Direct decrypt function ──────────────────────────
async function decryptDirect(encryptedData) {
    await ensureReady();
    const pg = await getPage();

    const result = await pg.evaluate(async (data) => {
        if (!window.__lf.decryptFn) {
            return { success: false, error: 'Decrypt function not available' };
        }

        try {
            window.__lf.callCount++;
            // Call Td[358](data) directly — this is the RSA-2048 decrypt
            const decrypted = window.__lf.decryptFn(data);
            return { success: true, data: decrypted };
        } catch(e) {
            return { success: false, error: e.message || String(e) };
        }
    }, encryptedData);

    return result;
}

// ─── Express app ──────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: 'text/plain', limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: false }));

// Health check + status
app.get('/', async (_req, res) => {
    let status = 'not initialized';
    let callCount = 0;
    let log = [];
    try {
        if (page && !page.isClosed()) {
            const info = await page.evaluate(() => ({
                ready: window.__lf.ready,
                wasmLoaded: window.__lf.wasmLoaded,
                callCount: window.__lf.callCount,
                log: window.__lf.captureLog,
            }));
            status = info.ready ? 'ready' : 'initializing';
            callCount = info.callCount;
            log = info.log;
        }
    } catch(_) {}

    res.json({
        service: 'LordFlix Decrypt API',
        version: '2.0.0 (Direct Wasm Calls)',
        status: status,
        decrypt_calls: callCount,
        capture_log: log,
        endpoints: {
            'POST /decrypt': 'Decrypt RSA-2048 encrypted data',
            'GET /status':   'Check if decrypt function is ready',
            'POST /init':    'Manually trigger initialization',
            'GET /':         'This message',
        },
    });
});

// Status endpoint
app.get('/status', async (_req, res) => {
    try {
        if (page && !page.isClosed()) {
            const info = await page.evaluate(() => ({
                ready: window.__lf.ready,
                wasmLoaded: window.__lf.wasmLoaded,
                callCount: window.__lf.callCount,
                log: window.__lf.captureLog,
            }));
            res.json({ success: true, ...info });
        } else {
            res.json({ success: false, ready: false, error: 'No browser page' });
        }
    } catch(e) {
        res.json({ success: false, ready: false, error: e.message });
    }
});

// Manual init
app.post('/init', async (_req, res) => {
    try {
        await ensureReady();
        res.json({ success: true, message: 'Decrypt function captured' });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Main decrypt endpoint
app.post('/decrypt', async (req, res) => {
    const startTime = Date.now();

    // Accept: JSON {"data":"..."}, raw text, or form field
    let encryptedData;
    if (typeof req.body === 'string') {
        encryptedData = req.body.trim();
    } else if (req.body && typeof req.body.data === 'string') {
        encryptedData = req.body.data;
    } else {
        return res.status(400).json({
            success: false,
            error: 'Send { "data": "<encrypted_string>" } or raw string as text/plain',
        });
    }

    if (!encryptedData || encryptedData.length < 10) {
        return res.status(400).json({
            success: false,
            error: 'Encrypted data too short or empty',
        });
    }

    console.log(`[API] Decrypt request (${encryptedData.length} chars)`);

    try {
        const result = await decryptDirect(encryptedData);
        const elapsed = Date.now() - startTime;

        if (!result.success) {
            console.error(`[API] Decrypt failed: ${result.error}`);
            return res.status(500).json({
                success: false,
                error: result.error,
                time_ms: elapsed,
            });
        }

        console.log(`[API] Decrypted in ${elapsed}ms`);
        res.json({
            success: true,
            decrypted: result.data,
            time_ms: elapsed,
        });

    } catch(err) {
        console.error(`[API] Error: ${err.message}`);
        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
});

// ─── Start server ─────────────────────────────────────
async function start() {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  LordFlix Decrypt API v2 — Direct Wasm Calls     ║');
    console.log(`║  http://localhost:${PORT}                              ║`);
    console.log('║                                                  ║');
    console.log('║  POST /decrypt  →  Decrypt data                 ║');
    console.log('║  GET  /status   →  Check readiness              ║');
    console.log('║  POST /init     →  Trigger initialization        ║');
    console.log('║                                                  ║');
    console.log('║  First request auto-initializes by navigating    ║');
    console.log('║  to the site and capturing the Wasm decrypt fn   ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');

    // Pre-launch browser
    try {
        await getBrowser();
        console.log('[Browser] Ready');
    } catch(e) {
        console.error('[Browser] Failed to launch:', e.message);
    }

    app.listen(PORT, () => {
        console.log(`[Server] Listening on port ${PORT}`);
    });
}

start().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
