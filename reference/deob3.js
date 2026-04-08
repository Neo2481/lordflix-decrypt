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
  } catch (e) { return null; }
}

// Known decoder mappings from code analysis
const decoderConfigs = [
  { func: 'b4', offset: 313, array: 'a3' },
  { func: 'j1', offset: 2310, array: 'f3' }, // 1492*3+5509+9797*-1 = 6930-9797 = -2867? No...
];

// Calculate j1 offset
const j1Offset = 1492*3 + 5509 + 9797*-1; // 4476 + 5509 - 9797 = 188
console.log('j1 offset:', j1Offset);

// Let's find all decoder functions by searching for the pattern
// function NAME(a,b){a=a-NNN;var _=ARRAY() or const _=ARRAY()
const decoderPattern = /function (\w+)\((\w+),(\w+)\)\{(\w+)=(\w+)-(\d+);(?:var|const|let) (\w+)=(\w+)\(\)/g;
let m;
const decoders = {};
while ((m = decoderPattern.exec(code)) !== null) {
  const funcName = m[1];
  const offset = parseInt(m[6]);
  const varName = m[7];
  const arrayFuncName = m[8];
  decoders[funcName] = { offset, arrayFuncName };
  console.log(`Found decoder: ${funcName} -> offset=${offset}, array=${arrayFuncName}`);
}

// Also try with b=b-NNN pattern (same variable name)
const decoderPattern2 = /function (\w+)\((\w+),(\w+)\)\{\2=\2-(\d+);(?:var|const|let) (\w+)=(\w+)\(\)/g;
while ((m = decoderPattern2.exec(code)) !== null) {
  const funcName = m[1];
  const offset = parseInt(m[4]);
  const varName = m[5];
  const arrayFuncName = m[6];
  if (!decoders[funcName]) {
    decoders[funcName] = { offset, arrayFuncName };
    console.log(`Found decoder (alt): ${funcName} -> offset=${offset}, array=${arrayFuncName}`);
  }
}

// Extract string arrays
const arrays = {};
const arrayPattern = /function (\w+)\(\)\{(var|const|let) b=\[(.*?)\];\s*return \1=function/gs;
while ((m = arrayPattern.exec(code)) !== null) {
  arrays[m[1]] = m[3].split('","').filter(e => e.length > 0);
}

console.log('\nArrays:', Object.keys(arrays).map(k => `${k}(${arrays[k].length})`).join(', '));
console.log('Decoders:', Object.keys(decoders).length);

// For each decoder, find all unique (index, key) calls and decode
const allResults = {};
for (const [funcName, config] of Object.entries(decoders)) {
  const arrName = config.arrayFuncName;
  const offset = config.offset;
  const elements = arrays[arrName];
  if (!elements) {
    console.log(`\nWARNING: Array ${arrName} not found for decoder ${funcName}`);
    continue;
  }
  
  // Find all calls: funcName(NUMBER, "KEY")
  const callRegex = new RegExp(`${funcName}\\((\\d+),"([^"]+)"\\)`, 'g');
  let callMatch;
  const calls = new Map(); // key -> Set of arrayIndices
  
  while ((callMatch = callRegex.exec(code)) !== null) {
    const numIndex = parseInt(callMatch[1]);
    const key = callMatch[2];
    const arrayIdx = numIndex - offset;
    if (arrayIdx >= 0 && arrayIdx < elements.length) {
      if (!calls.has(key)) calls.set(key, new Set());
      calls.get(key).add(arrayIdx);
    }
  }
  
  console.log(`\n${funcName}: ${calls.size} unique keys, ${elements.length} array elements`);
  
  for (const [key, indices] of calls) {
    for (const idx of indices) {
      const encoded = elements[idx];
      if (!encoded) continue;
      const decoded = rc4Decode(encoded.trim(), key);
      if (decoded && decoded.length > 0 && decoded.length < 500) {
        allResults[`${funcName}:${numIndex}`] = decoded;
      }
    }
  }
}

console.log(`\nTotal decoded: ${Object.keys(allResults).length}`);

// Search for interesting strings
console.log('\n=== URLS ===');
for (const [k, v] of Object.entries(allResults)) {
  if (/https?:\/\/|lordflix|fembox|aggerpunk|\.club|\.org/.test(v)) {
    console.log(`  [${k}] = "${v}"`);
  }
}

console.log('\n=== CRYPTO ===');
for (const [k, v] of Object.entries(allResults)) {
  if (/decrypt|encrypt|private|RSA|cipher|JSEncrypt|CryptoJS|forge|PKCS|importKey|atob|btoa|base64/i.test(v)) {
    console.log(`  [${k}] = "${v}"`);
  }
}

console.log('\n=== API/DATA ===');
for (const [k, v] of Object.entries(allResults)) {
  if (/\.data|JSON\.parse|quality|movie|tv|stream|source|embed|player|server|fetch|response/i.test(v)) {
    console.log(`  [${k}] = "${v}"`);
  }
}

console.log('\n=== KEY/SECRET ===');
for (const [k, v] of Object.entries(allResults)) {
  if (/\bkey\b|token|password|secret|BEGIN|MIIE|MII[A-Z]|private/i.test(v)) {
    console.log(`  [${k}] = "${v}"`);
  }
}
