# LordFlix Decrypt API v2

**Standalone decryption API** — call the site's Kotlin/Wasm RSA-2048 decryptor directly.
No MITM interception, no page reloads per request. ~100ms per decrypt.

## How It Works

```
                    Your Code
                        │
                   POST /decrypt
                        │
                  ┌─────▼──────┐
                  │  Express    │
                  │  API Server │
                  └─────┬──────┘
                        │
                  ┌─────▼──────┐      First request only:
                  │  Puppeteer │──────► Navigate to lordflix.org
                  │  (Chrome)  │      Hook WebAssembly.instantiateStreaming
                  └─────┬──────┘      Capture Td[358] (decrypt function)
                        │
                   All subsequent requests:
                        │
                  ┌─────▼──────┐
                  │ Call Td[358]│◄── Direct Wasm function call
                  │ (encrypted) │    No page reload, no MITM
                  └─────┬──────┘
                        │
                  ┌─────▼──────┐
                  │  Decrypted │
                  │  JSON back │
                  └────────────┘
```

### Why can't we extract the RSA key?

The private key is compiled into a **Kotlin/Wasm binary** using the **Wasm GC proposal**.
Current tools (`wasm2wat`, `wasm-decompile`) don't support GC, so the binary is opaque.
The key exists only as arithmetic operations inside machine code — impossible to extract.

### Why this works

We don't extract the key. Instead, we **borrow the site's own decryptor**:
1. Load the site once → Wasm loads → we capture the decrypt function reference
2. Call it directly like a library function
3. The RSA decryption happens inside the Wasm, result comes back to JS

## Install

```bash
cd lordflix-decrypt-api
npm install
```

## Configure

| Variable    | Default               | Description                                    |
|-------------|-----------------------|------------------------------------------------|
| `PORT`      | `3456`                | API listen port                                |
| `HEADLESS`  | `true`                | Set `false` to see browser (debugging)         |
| `INIT_URL`  | `https://lordflix.org`| URL to load. API auto-finds movie links.        |
| `TIMEOUT`   | `15000`               | Per-request timeout (ms)                       |

## Run

```bash
# Start the API
node server.js

# With visible browser (debugging)
HEADLESS=false node server.js

# Development mode (auto-restart)
node --watch server.js
```

On first decrypt request, the API automatically:
1. Opens lordflix.org in headless Chrome
2. Finds and clicks a movie/show link
3. Captures the Wasm decrypt function
4. Returns ready for direct calls

## Usage

### cURL

```bash
# Decrypt
curl -X POST http://localhost:3456/decrypt \
  -H "Content-Type: application/json" \
  -d '{"data": "to9hug8ru6jTsvU6uyGpeeBtT3HRutnbqeHA+RWZ..."}'

# Check status
curl http://localhost:3456/status

# Manual init
curl -X POST http://localhost:3456/init
```

### JavaScript

```js
const resp = await fetch('http://localhost:3456/decrypt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: 'to9hug8ru6jTsvU6...' })
});
const result = await resp.json();

if (result.success) {
    const streamData = JSON.parse(result.decrypted);
    console.log(streamData.stream[0].playlist);
    // → https://api.lordflix.org/...
}
```

### Python

```python
import requests, json

resp = requests.post('http://localhost:3456/decrypt', json={
    'data': 'to9hug8ru6jTsvU6...'
})
result = resp.json()
if result['success']:
    data = json.loads(result['decrypted'])
    print(data['stream'][0]['playlist'])
```

### Any language with HTTP

```
POST http://localhost:3456/decrypt
Content-Type: application/json

{"data": "<encrypted_string>"}
```

## Response Format

**Success (200):**
```json
{
    "success": true,
    "decrypted": "{\"stream\":[{\"type\":\"hls\",\"id\":\"primary\",\"playlist\":\"https://...\"}]}",
    "time_ms": 87
}
```

**Error (500):**
```json
{
    "success": false,
    "error": "Decrypt function not available",
    "time_ms": 5000
}
```

## API Endpoints

| Method | Path        | Description                     |
|--------|-------------|---------------------------------|
| `POST` | `/decrypt`  | Decrypt encrypted data          |
| `GET`  | `/status`   | Check if decrypt function ready |
| `POST` | `/init`     | Trigger initialization          |
| `GET`  | `/`         | API info + status               |

## v1 → v2 Changes

| Feature           | v1 (MITM)        | v2 (Direct Calls)  |
|-------------------|------------------|--------------------|
| Approach          | Response.json() MITM + page reload | Direct Wasm function call |
| Speed per decrypt | 5-8 seconds      | ~50-200ms          |
| Page reloads      | Every request    | Once (on init)     |
| Network traffic   | Full page load   | None after init    |
| Reliability       | High             | High               |

## Architecture Deep Dive

### Call Chain (what happens inside the Wasm)

```
Td[358](encryptedString)
  └─► jsExportStringToWasm(string)     ← JS→Wasm string conversion
      └─► RSA-2048 private key decrypt
          └─► PKCS#1 v1.5 unpadding
              └─► UTF-8 decode
                  └─► return JSON string
```

### Wasm Module Info

- **File**: `hxqvpnrw.wasm` (46,652 bytes)
- **Language**: Kotlin compiled to WebAssembly (GC proposal)
- **Exports**: `q3v`, `main`, `memory`, `_initialize`, `startUnitTests`
- **Imports**: `js_code` (14 Kotlin interop functions) + `intrinsics` (empty)
- **Decrypt function**: `q3v()[358]` — the 359th entry in the function table

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `Wasm did not load` | Set `INIT_URL` to a specific movie/show page URL |
| `frame_ant.js` errors | Already auto-blocked by the API |
| `Decrypt function not available` | Call `POST /init` or restart |
| Slow first request | Expected — needs to load the page. Subsequent requests are fast |
| Browser crashes | API auto-restarts browser on next request |
