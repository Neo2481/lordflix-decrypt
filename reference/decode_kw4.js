// Memory-efficient version: process file in chunks
const fs = require('fs');

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

// Read only the n3 array section
const code = fs.readFileSync('/home/z/my-project/download/N0f0gQZp.js', 'utf8');
const n3Start = code.indexOf('function n3(){var b=["');
const arrStart = n3Start + 'function n3(){var b="'.length;
let pos = arrStart, depth = 0;
while (pos < code.length) {
  if (code[pos] === '[') depth++;
  if (code[pos] === ']') { depth--; if (depth === 0) break; }
  pos++;
}
const arrContent = code.substring(arrStart, pos);
// Free the big code string
// Actually we need it for finding kW calls too

// Parse array lazily - only extract the element we need
function getElement(arrStr, index) {
  let current = 0;
  let inStr = false;
  let start = 0;
  for (let i = 0; i < arrStr.length; i++) {
    const c = arrStr[i];
    if (c === '"' && (i === 0 || arrStr[i-1] !== '\\')) {
      if (!inStr) {
        start = i + 1;
        inStr = true;
      } else {
        if (current === index) {
          return arrStr.substring(start, i);
        }
        current++;
        inStr = false;
      }
    }
  }
  return null;
}

// Test
console.log('Testing array access...');
const testElem = getElement(arrContent, 0);
console.log('Element 0:', testElem ? testElem.substring(0, 30) : 'null');
const testElem2382 = getElement(arrContent, 2382);
console.log('Element 2382:', testElem2382 ? testElem2382.substring(0, 30) : 'null');

const offset = 231;

// Find kW calls and decode one at a time
console.log('\nFinding kW calls...');
const calls = [];
let searchIdx = 0;
while (true) {
  const idx = code.indexOf('kW(', searchIdx);
  if (idx === -1) break;
  const afterCall = code.substring(idx + 3);
  const match = afterCall.match(/^(\d+),"([^"]+)"/);
  if (match) {
    calls.push({ numIdx: parseInt(match[1]), key: match[2] });
  }
  searchIdx = idx + 3;
}
console.log('kW calls found:', calls.length);

// Decode each
for (const call of calls) {
  const arrIdx = call.numIdx - offset;
  const encoded = getElement(arrContent, arrIdx);
  if (encoded) {
    const decoded = rc4Decode(encoded.trim(), call.key);
    if (decoded && decoded.length > 0) {
      console.log(`  [${call.numIdx}] = "${decoded}"`);
      // Check for important strings
      if (/fembox|quality|decrypt|encrypt|private|RSA|key|data|JSON|fetch|stream|source|cipher|BEGIN|MIIE|token|secret|\.club/i.test(decoded)) {
        console.log('    *** IMPORTANT ***');
      }
    }
  }
}
