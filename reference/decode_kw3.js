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

// Extract n3 array
const n3Start = code.indexOf('function n3(){var b=["');
const arrStart = n3Start + 'function n3(){var b="'.length;
let pos = arrStart, depth = 0;
while (pos < code.length) {
  if (code[pos] === '[') depth++;
  if (code[pos] === ']') { depth--; if (depth === 0) break; }
  pos++;
}
const n3Elements = code.substring(arrStart, pos).split('","');
console.log('n3 elements:', n3Elements.length);

const offset = 231;

// Instead of regex, manually find kW calls
const calls = [];
let searchIdx = 0;
while (true) {
  const idx = code.indexOf('kW(', searchIdx);
  if (idx === -1) break;
  // Extract the call: kW(NUM,"KEY")
  const afterCall = code.substring(idx + 3);
  const match = afterCall.match(/^(\d+),"([^"]+)"/);
  if (match) {
    calls.push({ numIdx: parseInt(match[1]), key: match[2] });
  }
  searchIdx = idx + 3;
}
console.log('kW calls found:', calls.length);

// Decode each call
const results = [];
for (const call of calls) {
  const arrIdx = call.numIdx - offset;
  if (arrIdx >= 0 && arrIdx < n3Elements.length) {
    const decoded = rc4Decode(n3Elements[arrIdx].trim(), call.key);
    if (decoded && decoded.length > 0) {
      results.push({ idx: call.numIdx, key: call.key, decoded });
    }
  }
}
console.log('Decoded:', results.length);

// Print all
for (const r of results) {
  console.log(`  [${r.idx}]("${r.key}") = "${r.decoded}"`);
}

// Search for important strings
console.log('\n=== IMPORTANT ===');
for (const r of results) {
  if (/fembox|quality|decrypt|encrypt|private|RSA|key|data|JSON|fetch|stream|source|embed|cipher|BEGIN|MIIE|token|secret|\.club|\.org|api/i.test(r.decoded)) {
    console.log(`  *** [${r.idx}] = "${r.decoded}"`);
  }
}
