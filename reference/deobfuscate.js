const fs = require('fs');
const code = fs.readFileSync('N0f0gQZp.js', 'utf8');

// Custom base64 decoder (from the obfuscated code)
function customB64Decode(O) {
  const l = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';
  let H = '', J = 0, Q, K;
  for (K = 0; (Q = O.charAt(K++)) != undefined; ~Q && (J = J % 4 ? J * 64 + Q : Q, K % 4) ? H += String.fromCharCode(255 & J >> (-2 * K & 6)) : 0) Q = l.indexOf(Q);
  let G = '';
  for (let U = 0; U < H.length; U++) G += '%' + ('00' + H.charCodeAt(U).toString(16)).slice(-2);
  return decodeURIComponent(G);
}

// RC4 decoder
function rc4Decode(encoded, key) {
  try {
    const O = customB64Decode(encoded);
    let H = [];
    for (let i = 0; i < 256; i++) H[i] = i;
    let G = 0;
    for (let J = 0; J < 256; J++) {
      G = (G + H[J] + key.charCodeAt(J % key.length)) % 256;
      let P = H[J]; H[J] = H[G]; H[G] = P;
    }
    let J = 0; G = 0; let U = '';
    for (let Q = 0; Q < O.length; Q++) {
      J = (J + 1) % 256;
      G = (G + H[J]) % 256;
      let P = H[J]; H[J] = H[G]; H[G] = P;
      U += String.fromCharCode(O.charCodeAt(Q) ^ H[(H[J] + H[G]) % 256]);
    }
    return U;
  } catch (e) {
    return null;
  }
}

// Find all string arrays and their decoder functions
// Pattern: function XXX(){var b=["...","...",...]; return XXX=function(){return b}}
const arrayRegex = /function\s+(\w+)\(\)\{var\s+b=\["((?:[^"\\]|\\.)*)"\];return\s+\1=function/;
const matches = [];
let match;
while ((match = arrayRegex.exec(code)) !== null) {
  matches.push({ name: match[1], content: match[2] });
}
console.log(`Found ${matches.length} string arrays:`);
matches.forEach(m => console.log(`  ${m.name}: ${m.content.length} chars`));

// Extract string elements from each array
for (const arr of matches) {
  const elements = arr.content.split('","').filter(e => e.length > 0);
  console.log(`\nArray "${arr.name}": ${elements.length} elements`);

  // Find the offset and keys used with this array
  // Look for pattern: function decoderFunc(index, "key")
  const decoderPattern = new RegExp(arr.name === 'a3' ? 'b4\\((\\d+),"([^"]+)"' : 
    arr.name === 'f3' ? 'j1\\((\\d+),"([^"]+)"' :
    arr.name === 'n3' ? 'y_\\((\\d+),"([^"]+)"' : '\\w+\\((\\d+),"([^"]+)"');
  
  // Find all unique keys used with this array
  const allCalls = code.match(new RegExp(`\\w+\\(\\d+,"[^"]+"\\)`, 'g')) || [];
  const usedKeys = new Set();
  for (const call of allCalls) {
    const keyMatch = call.match(/"([^"]+)"/);
    if (keyMatch) usedKeys.add(keyMatch[1]);
  }
  console.log(`  Unique keys in code: ${usedKeys.size}`);

  // Find the offset for this decoder
  // Pattern: b=b-(\d+);
  const offsetMatch = code.match(new RegExp(`function\\s+\\w+\\([a-z],([a-z])\\)\\{[\\s\\S]*?([a-z])=([a-z])-(\\d+)`));
  // We need to find the specific decoder function
  // Let's just try common offsets
  const offsets = arr.name === 'a3' ? [313] : arr.name === 'f3' ? [5798] : arr.name === 'n3' ? [3890] : [0, 313, 5798, 3890];
  
  // Try to decode some elements and check if the results look like valid JS identifiers
  const keyArr = [...usedKeys].slice(0, 50);
  const decoded = new Map();
  
  for (const key of keyArr) {
    for (let i = 0; i < elements.length; i++) {
      const result = rc4Decode(elements[i].trim(), key);
      if (result && result.length > 0 && result.length < 200 && /^[\w\s./:?\-&#=$%@!^*(),{}[\]"']+$/.test(result)) {
        for (const offset of offsets) {
          const key2 = `${i + offset}:${key}`;
          if (!decoded.has(key2)) decoded.set(key2, result);
        }
      }
    }
  }
  
  // Search for crypto-related terms
  const cryptoResults = [];
  for (const [k, v] of decoded) {
    if (/decrypt|encrypt|private|JSEncrypt|CryptoJS|forge|atob|btoa|base64|importKey|rsa|cipher|api|\/api\/|\.data|JSON\.parse|movie|tv|stream|source|embed|video|player|quality|server|key|token|password|secret/i.test(v)) {
      cryptoResults.push({ key: k, value: v });
    }
  }
  
  if (cryptoResults.length > 0) {
    console.log(`\n  === CRYPTO/API RELATED DECODED STRINGS (${cryptoResults.length}) ===`);
    cryptoResults.forEach(r => console.log(`    [${r.key}] = "${r.value}"`));
  }
}

// Also look for standalone long base64 strings that could be keys
const longStrings = code.match(/"[A-Za-z0-9+\/=]{100,}"/g);
if (longStrings) {
  console.log(`\n=== LONG BASE64-LIKE STRINGS (${longStrings.length}) ===`);
  longStrings.forEach(s => console.log(`  ${s.substring(0, 80)}... (${s.length} chars)`));
}
