// ==UserScript==
// @name         LordFlix Decryptor Panel
// @namespace    https://lordflix.org/
// @version      6.0
// @description  Floating decrypt panel — paste encrypted data, get decrypted JSON
// @author       You
// @match        https://lordflix.org/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    /* ═══════════════════════════════════════════════════
       SECTION 1 — Core MITM Hooks (document-start)
       ═══════════════════════════════════════════════════ */

    const SS_KEY = 'lf_custom_decrypt';
    let pendingResolve = null;           // resolves when decrypted result arrives

    // Hook Response.json() — replace encrypted data field
    const origJson = Response.prototype.json;
    Response.prototype.json = async function () {
        const body = await origJson.call(this);
        try {
            if (body && typeof body.data === 'string') {
                const custom = sessionStorage.getItem(SS_KEY);
                if (custom) {
                    console.log('%c[Decryptor] Replacing API data field', 'color:#f0c;font-weight:bold');
                    body.data = custom;
                }
            }
        } catch (_) { /* ignore non-JSON */ }
        return body;
    };

    // Hook JSON.parse — capture decrypted output
    const origParse = JSON.parse;
    JSON.parse = function (text, reviver) {
        const result = origParse.call(this, text, reviver);
        try {
            const custom = sessionStorage.getItem(SS_KEY);
            if (custom && result && result.stream) {
                console.log('%c[Decryptor] Decrypted result captured!', 'color:#0f0;font-weight:bold');
                sessionStorage.removeItem(SS_KEY);

                // Push to panel
                if (pendingResolve) {
                    pendingResolve(JSON.stringify(result, null, 2));
                    pendingResolve = null;
                } else {
                    sessionStorage.setItem('lf_last_result', JSON.stringify(result, null, 2));
                }
            }
        } catch (_) { /* ignore */ }
        return result;
    };

    /* ═══════════════════════════════════════════════════
       SECTION 2 — Floating Panel UI
       ═══════════════════════════════════════════════════ */

    function injectUI() {
        if (document.getElementById('lf-decrypt-panel')) return;

        const style = document.createElement('style');
        style.textContent = `
            #lf-decrypt-panel {
                position: fixed;
                top: 14px;
                right: 14px;
                z-index: 2147483647;
                width: 420px;
                max-height: 90vh;
                background: #0d1117;
                border: 1px solid #30363d;
                border-radius: 12px;
                font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
                color: #e6edf3;
                box-shadow: 0 8px 32px rgba(0,0,0,.55);
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }
            #lf-decrypt-panel.collapsed { max-height: none; height: auto; }
            #lf-decrypt-panel.collapsed .lf-body { display: none; }

            .lf-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 14px;
                background: #161b22;
                border-bottom: 1px solid #30363d;
                cursor: pointer;
                user-select: none;
            }
            .lf-header span { font-weight: 700; font-size: 13px; letter-spacing: .3px; }
            .lf-header button {
                background: none; border: none; color: #8b949e;
                font-size: 18px; cursor: pointer; padding: 0 4px; line-height: 1;
            }
            .lf-header button:hover { color: #e6edf3; }

            .lf-body { padding: 14px; overflow-y: auto; flex: 1; }

            .lf-label {
                display: block; font-size: 11px; font-weight: 600;
                color: #8b949e; margin-bottom: 6px; text-transform: uppercase;
                letter-spacing: .5px;
            }

            #lf-input {
                width: 100%; height: 100px; resize: vertical;
                background: #0d1117; border: 1px solid #30363d;
                border-radius: 8px; padding: 10px 12px;
                color: #e6edf3; font-size: 12px; font-family: 'Cascadia Code', 'Fira Code', monospace;
                box-sizing: border-box; outline: none;
                transition: border-color .2s;
            }
            #lf-input:focus { border-color: #58a6ff; }
            #lf-input::placeholder { color: #484f58; }

            .lf-actions {
                display: flex; gap: 8px; margin-top: 10px;
            }
            .lf-btn {
                flex: 1; padding: 9px 0; border: none; border-radius: 8px;
                font-size: 13px; font-weight: 600; cursor: pointer;
                transition: background .15s, transform .1s;
            }
            .lf-btn:active { transform: scale(.97); }
            .lf-btn-primary {
                background: #238636; color: #fff;
            }
            .lf-btn-primary:hover { background: #2ea043; }
            .lf-btn-primary:disabled { background: #1a3a1a; color: #3a5a3a; cursor: not-allowed; }
            .lf-btn-secondary {
                background: #21262d; color: #c9d1d9; border: 1px solid #30363d;
            }
            .lf-btn-secondary:hover { background: #30363d; }

            .lf-status {
                margin-top: 10px; padding: 8px 12px;
                border-radius: 8px; font-size: 12px; line-height: 1.5;
                display: none;
            }
            .lf-status.info    { display: block; background: #0c2d6b; color: #79c0ff; border: 1px solid #1a4a8a; }
            .lf-status.success { display: block; background: #0d2818; color: #3fb950; border: 1px solid #1a4a2a; }
            .lf-status.error   { display: block; background: #3d1114; color: #f85149; border: 1px solid #5a1a1d; }

            #lf-output {
                width: 100%; height: 180px; resize: vertical;
                background: #010409; border: 1px solid #30363d;
                border-radius: 8px; padding: 10px 12px; margin-top: 10px;
                color: #7ee787; font-size: 11.5px;
                font-family: 'Cascadia Code', 'Fira Code', monospace;
                box-sizing: border-box; outline: none;
                display: none;
            }
            #lf-output:focus { border-color: #3fb950; }

            .lf-footer {
                padding: 8px 14px; border-top: 1px solid #21262d;
                font-size: 10px; color: #484f58; text-align: center;
            }
        `;
        document.head.appendChild(style);

        const panel = document.createElement('div');
        panel.id = 'lf-decrypt-panel';
        panel.innerHTML = `
            <div class="lf-header" id="lf-toggle">
                <span>🔓 LordFlix Decryptor</span>
                <button id="lf-collapse-btn">−</button>
            </div>
            <div class="lf-body">
                <label class="lf-label" for="lf-input">Encrypted Data</label>
                <textarea id="lf-input" placeholder='Paste encrypted data here...&#10;e.g. {"data":"xR7k9..."} or just the raw encrypted string'></textarea>

                <div class="lf-actions">
                    <button class="lf-btn lf-btn-primary" id="lf-decrypt-btn">🔓 Decrypt</button>
                    <button class="lf-btn lf-btn-secondary" id="lf-clear-btn">Clear</button>
                </div>

                <div class="lf-status" id="lf-status"></div>
                <textarea id="lf-output" readonly></textarea>
            </div>
            <div class="lf-footer">RSA-2048 · Kotlin/Wasm MITM · v6.0</div>
        `;
        document.body.appendChild(panel);

        // --- toggle collapse ---
        const toggle = document.getElementById('lf-toggle');
        const collapseBtn = document.getElementById('lf-collapse-btn');
        toggle.addEventListener('click', (e) => {
            if (e.target === collapseBtn || e.target.closest('#lf-collapse-btn')) return;
            panel.classList.toggle('collapsed');
            collapseBtn.textContent = panel.classList.contains('collapsed') ? '+' : '−';
        });
        collapseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.toggle('collapsed');
            collapseBtn.textContent = panel.classList.contains('collapsed') ? '+' : '−';
        });

        // --- elements ---
        const input     = document.getElementById('lf-input');
        const output    = document.getElementById('lf-output');
        const statusEl  = document.getElementById('lf-status');
        const decBtn    = document.getElementById('lf-decrypt-btn');
        const clearBtn  = document.getElementById('lf-clear-btn');

        function setStatus(msg, type) {
            statusEl.className = 'lf-status ' + type;
            statusEl.textContent = msg;
        }
        function clearStatus() {
            statusEl.className = 'lf-status';
            statusEl.textContent = '';
        }

        // --- decrypt button ---
        decBtn.addEventListener('click', async () => {
            const raw = input.value.trim();
            if (!raw) { setStatus('⚠ Please paste encrypted data first', 'error'); return; }

            // Extract the data field if user pasted full JSON {"data":"..."}
            let encryptedData = raw;
            try {
                const parsed = JSON.parse(raw);
                if (parsed.data) encryptedData = parsed.data;
            } catch (_) { /* user pasted raw string, that's fine */ }

            decBtn.disabled = true;
            decBtn.textContent = '⏳ Decrypting...';
            output.style.display = 'none';
            clearStatus();

            // Store in sessionStorage — the MITM hook will pick it up on next API call
            sessionStorage.setItem(SS_KEY, encryptedData);
            setStatus('🔄 Triggering decryption pipeline... Navigate to a movie page if nothing happens.', 'info');

            try {
                // Try fetching any API endpoint on lordflix.org to trigger the decrypt chain
                const resp = await fetch(window.location.href);
                // The Response.json() hook will replace the data field
                // But we also need the site's own JS to call y6() → Wasm
                // Best approach: navigate to the current page to replay full pipeline
            } catch (_) { /* cross-origin may fail, that's ok */ }

            // If we're already on a movie page, trigger a soft navigation
            // The site's SvelteKit router should handle this
            const currentPath = window.location.pathname;
            if (currentPath.includes('/watch/') || currentPath.includes('/movie/') || currentPath.includes('/tv/')) {
                setStatus('🔄 On a content page — reloading to trigger decrypt...', 'info');
                window.location.reload();
                return; // page will reload, result comes back via sessionStorage
            }

            // Not on a content page — use promise-based waiting
            const result = await new Promise((resolve, reject) => {
                pendingResolve = resolve;
                // Timeout after 15s
                setTimeout(() => {
                    if (pendingResolve) {
                        pendingResolve = null;
                        // Check sessionStorage for result (page might have navigated and come back)
                        const saved = sessionStorage.getItem('lf_last_result');
                        if (saved) {
                            resolve(saved);
                        } else {
                            reject(new Error('Timeout — navigate to a movie/show page and try again'));
                        }
                    }
                }, 15000);
            });

            // Show result
            output.value = result;
            output.style.display = 'block';
            setStatus('✅ Decrypted successfully!', 'success');
            decBtn.disabled = false;
            decBtn.textContent = '🔓 Decrypt';

        });

        // --- clear button ---
        clearBtn.addEventListener('click', () => {
            input.value = '';
            output.value = '';
            output.style.display = 'none';
            clearStatus();
            sessionStorage.removeItem(SS_KEY);
            sessionStorage.removeItem('lf_last_result');
            decBtn.disabled = false;
            decBtn.textContent = '🔓 Decrypt';
        });

        // --- resume from sessionStorage (after page reload) ---
        const savedResult = sessionStorage.getItem('lf_last_result');
        const savedInput  = sessionStorage.getItem(SS_KEY);
        if (savedResult) {
            input.value = '(see result below)';
            output.value = savedResult;
            output.style.display = 'block';
            setStatus('✅ Decrypted successfully!', 'success');
            sessionStorage.removeItem('lf_last_result');
        }
    }

    // Inject UI as soon as body is available
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectUI);
    } else {
        injectUI();
    }

    console.log('%c[Decryptor] v6.0 loaded — panel ready', 'color:#58a6ff;font-weight:bold');
})();
