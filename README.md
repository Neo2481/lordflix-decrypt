# LordFlix Decrypt Toolkit

Complete toolkit for decrypting LordFlix RSA-2048 encrypted data.

## Folder Structure

```
lordflix-toolkit/
├── README.md                 ← This file
├── decrypt-api/              ← Express API (recommended, works)
│   ├── server.js             ← API server — captures Wasm fn, calls directly
│   ├── package.json          ← Dependencies: express, puppeteer, cors
│   └── README.md             ← API docs
├── tampermonkey/             ← Browser userscript (works on-site)
│   └── LordFlix-Decryptor.user.js   ← Floating panel UI
├── standalone/               ← Wasm standalone attempt (research)
│   ├── decrypt.js            ← Full browser polyfills + Wasm load
│   ├── test.js               ← Minimal polyfills test
│   ├── parse-wasm.js         ← Parse Wasm binary (imports/exports)
│   ├── hxqvpnrw.wasm         ← Wasm binary (46,652 bytes)
│   └── package.json
├── wasm/
│   └── hxqvpnrw.wasm         ← Wasm binary copy
└── reference/
    └── N0f0gQZp.js           ← LordFlix main JS (obfuscated, for analysis)
```

## Quick Start

### Option 1: Express API (Recommended)

```bash
cd decrypt-api
npm install
node server.js
# API runs on http://localhost:3456

# Decrypt:
curl -X POST http://localhost:3456/decrypt \
  -H "Content-Type: application/json" \
  -d '{"data": "to9hug8ru6jTsvU6uyGpeeBtT3HRutnbqeHA+RWZ..."}'
```

- Loads lordflix.org ONCE on startup via headless Chrome
- Captures Wasm decrypt function (Td[358])
- Subsequent requests: ~100ms, no page reloads

### Option 2: Tampermonkey Script

1. Install Tampermonkey browser extension
2. Open `tampermonkey/LordFlix-Decryptor.user.js`
3. Install the script
4. Visit lordflix.org — floating panel appears top-right
5. Paste encrypted data, click Decrypt

## Technical Summary

### Encryption
- **Algorithm**: RSA-2048 (PKCS#1 v1.5 padding)
- **Engine**: Kotlin compiled to WebAssembly (Wasm GC proposal)
- **Wasm file**: `hxqvpnrw.wasm` (46,652 bytes)
- **Private key**: Baked into compiled Wasm — cannot be extracted

### Decryption Call Chain
```
Encrypted JSON: {"data": "base64_encrypted_string"}
    │
    ▼
W2(data) → y6(data) → T6() → q3v() → Td[358](data) → JSON.parse(result)
```

### Wasm Module Details
- **Exports**: `q3v`, `main`, `memory`, `_initialize`, `startUnitTests`
- **Import modules**: `js_code` (9 Kotlin interop functions) + `intrinsics` (empty)
- **Decrypt function**: `q3v()` returns function table `Td`, index `358` is RSA decrypt
- **Key functions**:
  - `jsExportStringToWasm` — Pass JS string into Wasm
  - `importStringFromWasm` — Get JS string out of Wasm
  - `throwJsError` — Error handling

### Why Can't We Write Our Own Decrypt Code?

1. **RSA private key is inside compiled Wasm bytecode** — not a separate file
2. **Wasm uses GC proposal** — `wasm2wat`, `wasm-decompile` all fail
3. **Exports are frozen** — `writable:false, configurable:false`, cannot Proxy
4. **Standalone Wasm throws WebAssembly.Exception** — native Wasm exception, JS cannot catch it
5. **Clone attempt** (v12) did decrypt but threw exception after — result lost
6. **Memory scan** found 0 strings, 0 readable patterns — key is pure arithmetic ops

### Versions Tried (20+ Tampermonkey scripts)
- v1-v5: Basic MITM approaches — failed
- v6-v8: Wasm export freezing — exports immutable
- v9-v10: Clone q3v() — returns undefined without init
- v11-v13: Clone with init — decrypts but throws WebAssembly.Exception
- v14-v15: Interop hooks — not triggered on clone
- v16-v18: Memory scan — nothing readable
- v19: Intermediate MITM
- **v20: SUCCESS** — Response.json() MITM + sessionStorage
- **API v1**: MITM + page reload per request (~5-8s)
- **API v2: SUCCESS** — Direct Td[358] call (~100ms) — current version

## API Endpoints (v2)

| Method | Path      | Description                |
|--------|-----------|----------------------------|
| `POST` | `/decrypt`| Decrypt encrypted data     |
| `GET`  | `/status` | Check if decrypt fn ready  |
| `POST` | `/init`   | Trigger initialization     |
| `GET`  | `/`       | API info + status          |

## Environment Variables

| Variable   | Default               | Description                  |
|------------|-----------------------|------------------------------|
| `PORT`     | `3456`                | API listen port              |
| `HEADLESS` | `true`                | Set `false` for visible browser |
| `INIT_URL` | `https://lordflix.org`| URL to load for init         |
| `TIMEOUT`  | `15000`               | Per-request timeout (ms)     |
