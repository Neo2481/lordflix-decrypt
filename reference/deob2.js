const fs = require('fs');
const code = fs.readFileSync('/home/z/my-project/download/N0f0gQZp.js', 'utf8');

// Custom base64 decoder
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

// Extract all string arrays with their names
const arrays = {};
const regex = /function (\w+)\(\)\{(var|const) b=\[(.*?)\];\s*return \1=function/gs;
let match;
while ((match = regex.exec(code)) !== null) {
  const name = match[1];
  const content = match[3];
  arrays[name] = content.split('","').filter(e => e.length > 0);
}

// Extract all decoder functions with their offsets and array names
// Pattern: function DECODER(a, b) { a = a - OFFSET; const _ = ARRAY_NAME(); ... }
const decoderRegex = /function (\w+)\((\w+),(\w+)\)\{(\w+)=(\w+)-(\d+);(?:var|const|let) \w+=\4\(\)\(/g;
const decoders = {};
while ((match = decoderRegex.exec(code)) !== null) {
  const funcName = match[1];
  const offset = parseInt(match[6]);
  // Find which array it uses
  const afterOffset = code.substring(match.index, match.index + 200);
  const arrayMatch = afterOffset.match(/\w+\(\)/);
  if (arrayMatch) {
    decoders[funcName] = { offset, arrayRef: arrayMatch[0] };
  }
}

console.log('String arrays:', Object.keys(arrays).map(k => `${k}(${arrays[k].length})`).join(', '));
console.log('Decoders:', JSON.stringify(decoders));

// Map decoder functions to their arrays
// The decoder function calls ARRAY_NAME() to get the array
const decoderToOffset = {};
for (const [funcName, info] of Object.entries(decoders)) {
  // Find which array function is called inside this decoder
  const funcIdx = code.indexOf(`function ${funcName}(`);
  if (funcIdx >= 0) {
    const funcBody = code.substring(funcIdx, funcIdx + 500);
    for (const arrName of Object.keys(arrays)) {
      if (funcBody.includes(`${arrName}()`)) {
        decoderToOffset[funcName] = { offset: info.offset, arrayName: arrName };
        break;
      }
    }
  }
}

console.log('\nDecoder mappings:');
for (const [fn, info] of Object.entries(decoderToOffset)) {
  console.log(`  ${fn}: offset=${info.offset}, array=${info.arrayName}(${arrays[info.arrayName].length} elements)`);
}

// Find all calls to decoder functions and their keys
const allDecodedStrings = {};

for (const [funcName, info] of Object.entries(decoderToOffset)) {
  const elements = arrays[info.arrayName];
  const offset = info.offset;
  
  // Find calls: funcName(NUMBER, "KEY")
  const callRegex = new RegExp(`${funcName}\\((\\d+),"([^"]+)"\\)`, 'g');
  let callMatch;
  const uniqueCalls = new Map(); // key -> Set of indices
  
  while ((callMatch = callRegex.exec(code)) !== null) {
    const index = parseInt(callMatch[1]);
    const key = callMatch[2];
    const arrayIndex = index - offset;
    
    if (arrayIndex >= 0 && arrayIndex < elements.length) {
      if (!uniqueCalls.has(key)) uniqueCalls.set(key, new Set());
      uniqueCalls.get(key).add(arrayIndex);
    }
  }
  
  console.log(`\nDecoder ${funcName}: ${uniqueCalls.size} unique keys`);
  
  // Decode strings for each key
  for (const [key, indices] of uniqueCalls) {
    for (const idx of indices) {
      const encoded = elements[idx];
      if (!encoded) continue;
      const decoded = rc4Decode(encoded.trim(), key);
      if (decoded && decoded.length > 0) {
        allDecodedStrings[`${funcName}:${idx + offset}:${key}`] = decoded;
      }
    }
  }
}

console.log(`\nTotal decoded strings: ${Object.keys(allDecodedStrings).length}`);

// Search for crypto/API related strings
console.log('\n=== CRYPTO/API RELATED ===');
for (const [k, v] of Object.entries(allDecodedStrings)) {
  if (/fembox|quality|decrypt|encrypt|private|privateKey|JSEncrypt|CryptoJS|forge|atob|btoa|base64|importKey|rsa|cipher|api\.|\.data|JSON\.parse|movie|tv|stream|source|embed|video|player|quality|server|key|token|password|secret|AES|RSA|PKCS/i.test(v)) {
    console.log(`  [${k}] = "${v}"`);
  }
}

// Search for URLs
console.log('\n=== URLs ===');
for (const [k, v] of Object.entries(allDecodedStrings)) {
  if (/https?:\/\//.test(v) || /\.lordflix/.test(v) || /\.club/.test(v)) {
    console.log(`  [${k}] = "${v}"`);
  }
}
