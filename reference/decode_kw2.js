const fs = require('fs');
const code = fs.readFileSync('/home/z/my-project/download/N0f0gQZp.js', 'utf8');

function customB64Decode(O) {
  const l = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';
  let H = '', J = 0, Q, K;
  for (K = 0; (Q = O.charAt(K++)) != undefined; ~Q && (J = J % 4 ? J * 64 + Q : Q, K % 4) ? H += String.fromCharCode(255 & J >> (-2 * K & 6)) : 0) Q = l.indexOf(Q);
  let G = '';
  for (let U = 0; U < H.length; U++) G += '%' + ('00' + H.charCodeAt(U).toString(16)).slice(-2);
  return decodeURIComponent(G);
}

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

// Extract n3 array manually
const n3Start = code.indexOf('function n3(){var b=["');
const arrContentStart = n3Start + 'function n3(){var b="'.length;
// Find the closing ];
let pos = arrContentStart;
let depth = 0;
while (pos < code.length) {
  if (code[pos] === '[') depth++;
  if (code[pos] === ']') { depth--; if (depth === 0) break; }
  pos++;
}
const arrContent = code.substring(arrContentStart, pos);
const n3Elements = arrContent.split('","');
console.log('n3 elements:', n3Elements.length);

// y_/kW offset = 231
const offset = 231;

// Extract all kW(NUM, "KEY") calls  
const kwRegex = /kW\((\d+),"([^"]+)"\)/g;
let m;
const results = new Map();
while ((m = kwRegex.exec(code)) !== null) {
  const numIdx = parseInt(m[1]);
  const key = m[2];
  const arrIdx = numIdx - offset;
  if (arrIdx >= 0 && arrIdx < n3Elements.length) {
    const encoded = n3Elements[arrIdx];
    const decoded = rc4Decode(encoded.trim(), key);
    if (decoded && decoded.length > 0) {
      results.set(`${numIdx}:${key}`, decoded);
    }
  }
}

console.log('Decoded:', results.size, 'strings');

// Print all
const sorted = [...results.entries()].sort((a,b) => parseInt(a[0]) - parseInt(b[0]));
for (const [k, val] of sorted) {
  console.log(`  [${k}] = "${val}"`);
}

// Search for crypto/api/fembox
console.log('\n=== IMPORTANT FINDINGS ===');
for (const [k, val] of sorted) {
  if (/fembox|quality|decrypt|encrypt|private|RSA|key|data|JSON\.parse|fetch|stream|source|embed|player|cipher|BEGIN|MIIE|token|secret|\.club/i.test(val)) {
    console.log(`  *** [${k}] = "${val}"`);
  }
}
