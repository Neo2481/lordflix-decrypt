// Parse Wasm binary to extract import function type signatures
const fs = require('fs');
const buf = fs.readFileSync('/home/z/my-project/download/lordflix-standalone/hxqvpnrw.wasm');

let pos = 8; // skip magic + version
const valTypes = { 0x7f: 'i32', 0x7e: 'i64', 0x7d: 'f32', 0x7c: 'f64', 0x70: 'funcref', 0x6f: 'externref', 0x64: 'v128', 0x70: 'funcref' };
// Wasm GC types
const gcRefTypes = { 0x6b: 'eqref', 0x6c: 'i31ref', 0x6d: 'structref', 0x6e: 'arrayref', 0x6f: 'externref', 0x70: 'funcref', 0x71: 'anyref', 0x72: 'none', 0x73: 'noextern', 0x74: 'nofunc', 0x4f: 'sub' };

function readLEB128() {
    let result = 0, shift = 0, byte;
    do {
        byte = buf[pos++];
        result |= (byte & 0x7f) << shift;
        shift += 7;
    } while (byte & 0x80);
    return result;
}

function readName() {
    const len = readLEB128();
    const name = buf.slice(pos, pos + len).toString('utf-8');
    pos += len;
    return name;
}

function readType(idx) {
    // Read a value type
    const b = buf[pos++];
    if (b === 0x40) return 'void'; // empty block type
    if (valTypes[b]) return valTypes[b];
    if (gcRefTypes[b]) return gcRefTypes[b];
    // Could be a s33 (signed LEB128 for type index)
    if (b >= 0x20) {
        let val = b;
        if (b & 0x40) val -= 128; // sign extend s33
        return `(type:${val})`;
    }
    return `unknown:0x${b.toString(16)}`;
}

const types = [];
const imports = [];

while (pos < buf.length) {
    const sectionId = buf[pos++];
    const sectionSize = readLEB128();
    const sectionEnd = pos + sectionSize;

    if (sectionId === 1) {
        // Type section
        const count = readLEB128();
        console.log(`\n=== Type Section: ${count} types ===`);
        for (let i = 0; i < count; i++) {
            const tag = buf[pos++];
            if (tag === 0x60) {
                // Function type
                const paramCount = readLEB128();
                const params = [];
                for (let j = 0; j < paramCount; j++) params.push(readType(j));
                const resultCount = readLEB128();
                const results = [];
                for (let j = 0; j < resultCount; j++) results.push(readType(j));
                const str = `(${params.join(', ')}) -> (${results.join(', ')})`;
                types.push(str);
                console.log(`  type[${i}]: ${str}`);
            } else if (tag === 0x5f) {
                // Sub type (Wasm GC)
                const flags = readLEB128();
                let superType = -1;
                if (flags & 1) superType = readLEB128();
                const structTag = buf[pos++];
                if (structTag === 0x5f) {
                    // Struct type
                    const fieldCount = readLEB128();
                    const fields = [];
                    for (let j = 0; j < fieldCount; j++) {
                        const fieldType = readType(j);
                        const isMutable = buf[pos++]; // 0=const, 1=var
                        fields.push(`${fieldType}${isMutable ? ' (mut)' : ''}`);
                    }
                    const str = `struct { ${fields.join('; ')} }`;
                    types.push(str);
                    console.log(`  type[${i}]: ${str} (sub of ${superType})`);
                } else if (structTag === 0x5e) {
                    // Array type
                    const elemType = readType(0);
                    const isMutable = buf[pos++];
                    const str = `array [${elemType}${isMutable ? ' (mut)' : ''}]`;
                    types.push(str);
                    console.log(`  type[${i}]: ${str}`);
                } else {
                    console.log(`  type[${i}]: unknown GC type tag 0x${structTag.toString(16)}`);
                    pos = sectionEnd; // skip rest
                }
            } else {
                console.log(`  type[${i}]: unknown tag 0x${tag.toString(16)}`);
                pos = sectionEnd;
            }
        }
    } else if (sectionId === 2) {
        // Import section
        const count = readLEB128();
        console.log(`\n=== Import Section: ${count} imports ===`);
        for (let i = 0; i < count; i++) {
            const moduleName = readName();
            const fieldName = readName();
            const kind = buf[pos++];
            if (kind === 0) {
                // Function import
                const typeIdx = readLEB128();
                imports.push({ module: moduleName, name: fieldName, typeIdx, type: types[typeIdx] || '???' });
                console.log(`  import[${i}]: ${moduleName}::${fieldName} -> type[${typeIdx}] = ${types[typeIdx] || '???'}`);
            } else if (kind === 1) {
                const typeIdx = readLEB128();
                console.log(`  import[${i}]: ${moduleName}::${fieldName} -> table type[${typeIdx}]`);
            } else if (kind === 2) {
                const flags = readLEB128();
                const min = readLEB128();
                const max = (flags & 1) ? readLEB128() : undefined;
                console.log(`  import[${i}]: ${moduleName}::${fieldName} -> memory (min:${min}, max:${max})`);
            } else if (kind === 3) {
                const typeIdx = readLEB128();
                const mutability = buf[pos++];
                console.log(`  import[${i}]: ${moduleName}::${fieldName} -> global type[${typeIdx}] ${mutability ? 'mut' : 'const'}`);
            } else {
                console.log(`  import[${i}]: ${moduleName}::${fieldName} -> unknown kind ${kind}`);
            }
        }
    } else if (sectionId === 7) {
        // Export section
        const count = readLEB128();
        console.log(`\n=== Export Section: ${count} exports ===`);
        for (let i = 0; i < count; i++) {
            const name = readName();
            const kind = buf[pos++];
            const idx = readLEB128();
            const kindNames = { 0: 'func', 1: 'table', 2: 'memory', 3: 'global' };
            console.log(`  export[${i}]: ${name} -> ${kindNames[kind] || kind}[${idx}]${kind === 0 && types[idx] ? ' (' + types[idx] + ')' : ''}`);
        }
    } else {
        // Skip other sections
        // console.log(`Section ${sectionId}: ${sectionSize} bytes (skipped)`);
    }
    pos = sectionEnd;
}
