import struct
import re

with open('/home/z/my-project/download/hxqvpnrw.wasm', 'rb') as f:
    data = f.read()

def read_leb128(data, pos):
    """Read unsigned LEB128 value"""
    result = 0
    shift = 0
    while pos < len(data):
        byte = data[pos]; pos += 1
        result |= (byte & 0x7f) << shift; shift += 7
        if not (byte & 0x80):
            break
    return result, pos

def read_sleb128(data, pos):
    """Read signed LEB128 value"""
    result = 0
    shift = 0
    while pos < len(data):
        byte = data[pos]; pos += 1
        result |= (byte & 0x7f) << shift; shift += 7
        if not (byte & 0x80):
            if byte & 0x40:
                result |= -(1 << shift)
            break
    return result, pos

print(f'File size: {len(data)} bytes')
print(f'Magic: {data[:4]}')
print(f'Version: {struct.unpack("<I", data[4:8])[0]}')

# Parse all sections
offset = 8
sections = {}
while offset < len(data):
    sec_id = data[offset]; offset += 1
    sec_size, offset = read_leb128(data, offset)
    sec_data = data[offset:offset+sec_size]
    sections[sec_id] = sec_data
    section_names = {0:'Custom',1:'Type',2:'Import',3:'Function',4:'Table',5:'Memory',6:'Global',7:'Export',8:'Start',9:'Element',10:'Code',11:'Data',12:'DataCount',13:'Tag'}
    name = section_names.get(sec_id, f'Unknown({sec_id})')
    print(f'Section {sec_id} ({name}): size={sec_size}')
    offset += sec_size

# Parse EXPORTS (section 7)
print('\n=== EXPORTS ===')
exp_data = sections.get(7, b'')
pos = 0
idx = 0
while pos < len(exp_data):
    num_exports, pos = read_leb128(exp_data, pos)  # count (only first iteration)
    break
pos = 0
num_exports, pos = read_leb128(exp_data, pos)
for i in range(num_exports):
    name_len, pos = read_leb128(exp_data, pos)
    name = exp_data[pos:pos+name_len].decode('utf-8', errors='replace'); pos += name_len
    kind = exp_data[pos]; pos += 1
    kind_idx, pos = read_leb128(exp_data, pos)
    kind_names = {0:'func',1:'table',2:'memory',3:'global'}
    print(f'  Export: name="{name}", kind={kind_names.get(kind, kind)}, index={kind_idx}')

# Parse IMPORTS (section 2)
print('\n=== IMPORTS ===')
imp_data = sections.get(2, b'')
pos = 0
num_imports, pos = read_leb128(imp_data, pos)
for i in range(num_imports):
    mod_len, pos = read_leb128(imp_data, pos)
    mod = imp_data[pos:pos+mod_len].decode('utf-8', errors='replace'); pos += mod_len
    fld_len, pos = read_leb128(imp_data, pos)
    fld = imp_data[pos:pos+fld_len].decode('utf-8', errors='replace'); pos += fld_len
    kind = imp_data[pos]; pos += 1
    kind_names = {0:'func',1:'table',2:'memory',3:'global'}
    kname = kind_names.get(kind, str(kind))
    
    if kind == 0:  # func
        type_idx, pos = read_leb128(imp_data, pos)
        print(f'  Import: module="{mod}", field="{fld}", kind={kname}, type_idx={type_idx}')
    elif kind == 2:  # memory
        flags = imp_data[pos]; pos += 1
        min_val, pos = read_leb128(imp_data, pos)
        max_val = None
        if flags & 1:
            max_val, pos = read_leb128(imp_data, pos)
        print(f'  Import: module="{mod}", field="{fld}", kind={kname}, min={min_val}, max={max_val}')
    else:
        print(f'  Import: module="{mod}", field="{fld}", kind={kname}')

# Parse DATA section (section 11)
print('\n=== DATA SEGMENTS ===')
data_section = sections.get(11, b'')
pos = 0
num_segs, pos = read_leb128(data_section, pos)
for i in range(num_segs):
    flags, pos = read_leb128(data_section, pos)
    if flags & 2:  # has memory index
        mem_idx, pos = read_leb128(data_section, pos)
    if flags & 1:  # has offset expr
        while data_section[pos] != 0x0b:
            pos += 1
        pos += 1  # skip 0x0b (end)
    seg_size, pos = read_leb128(data_section, pos)
    seg_data = data_section[pos:pos+seg_size]
    print(f'\n  Segment {i}: flags={flags}, size={seg_size}')
    
    # Check if UTF-16LE string
    is_utf16 = False
    try:
        text = seg_data.decode('utf-16-le')
        printable = sum(1 for c in text if c.isprintable() or c in '\n\r\t')
        if printable > len(text) * 0.6 and len(text) > 10:
            is_utf16 = True
            print(f'    Type: UTF-16LE string ({len(text)} chars)')
            print(f'    Preview: {text[:200]}')
    except:
        pass
    
    if not is_utf16:
        print(f'    Hex (first 300): {seg_data[:300].hex()}')
        # Look for base64 patterns
        text = seg_data.decode('latin-1')
        b64 = re.findall(r'[A-Za-z0-9+/]{30,}={0,2}', text)
        if b64:
            for b in b64:
                print(f'    Base64 ({len(b)} chars): {b[:200]}')
    
    pos += seg_size

# Parse GLOBALS (section 6)
print('\n=== GLOBALS ===')
global_data = sections.get(6, b'')
pos = 0
num_globals, pos = read_leb128(global_data, pos)
for i in range(num_globals):
    gtype = global_data[pos]; pos += 1
    mutable = global_data[pos]; pos += 1
    type_names = {0x7f:'i32', 0x7e:'i64', 0x7d:'f32', 0x7c:'f64', 0x70:'funcref', 0x6f:'externref'}
    tname = type_names.get(gtype, f'0x{gtype:02x}')
    
    # Read init expr
    init_start = pos
    while global_data[pos] != 0x0b:
        pos += 1
    init_expr = global_data[init_start:pos]
    pos += 1  # skip 0x0b
    
    # Decode init expr
    init_desc = ''
    if init_expr[0] == 0x41:  # i32.const
        val, _ = read_sleb128(init_expr, 1)
        init_desc = f'i32.const {val} (0x{(val & 0xFFFFFFFF):08x})'
    elif init_expr[0] == 0x42:  # i64.const
        val, _ = read_sleb128(init_expr, 1)
        init_desc = f'i64.const {val}'
    elif init_expr[0] == 0x23:  # global.get
        idx, _ = read_leb128(init_expr, 1)
        init_desc = f'global.get {idx}'
    elif init_expr[0] == 0xD2:  # ref.func
        idx, _ = read_leb128(init_expr, 1)
        init_desc = f'ref.func {idx}'
    else:
        init_desc = f'opcode 0x{init_expr[0]:02x} + {init_expr[1:].hex()}'
    
    print(f'  Global #{i}: type={tname}, mutable={mutable}, init=[{init_desc}]')

# Now search the ENTIRE binary for any RSA key patterns
print('\n=== SEARCHING FOR RSA KEY PATTERNS ===')

# 1. DER-encoded RSA private key: 30 82 XX XX 02 01 00
for i in range(len(data) - 10):
    if data[i] == 0x30 and data[i+1] == 0x82 and data[i+4:i+8] == b'\x02\x01\x00':
        length = struct.unpack('>H', data[i+2:i+4])[0]
        print(f'POSSIBLE DER RSA KEY at offset {i}, DER length={length}')

# 2. Look for sequences of i32.const in code section that could be key bytes
print('\n=== SEARCHING CODE FOR i32.const SEQUENCES ===')
code_data = sections.get(10, b'')
# Find consecutive i32.const instructions (opcode 0x41)
i32_sequences = []
pos = 0
while pos < len(code_data):
    if code_data[pos] == 0x41:  # i32.const
        val, next_pos = read_sleb128(code_data, pos+1)
        if next_pos < len(code_data) and code_data[next_pos] == 0x41:  # another i32.const
            # Start of a sequence
            seq = [val]
            pos = next_pos
            while pos < len(code_data) and code_data[pos] == 0x41:
                val, pos = read_sleb128(code_data, pos+1)
                seq.append(val)
                # Skip any end/instruction between
                while pos < len(code_data) and code_data[pos] != 0x41:
                    if code_data[pos] in (0x0b, 0x1a, 0x1b, 0x36, 0x37, 0x38, 0x3a, 0x3b):
                        break
                    pos += 1
            if len(seq) > 10:
                i32_sequences.append(seq)
        else:
            pos = next_pos if next_pos > pos else pos + 1
    else:
        pos += 1

print(f'Found {len(i32_sequences)} sequences of 10+ consecutive i32.const values')
for idx, seq in enumerate(i32_sequences[:5]):
    # Check if values look like key bytes (0-255)
    byte_like = sum(1 for v in seq if 0 <= v <= 255)
    print(f'\nSequence {idx}: {len(seq)} values, {byte_like} are byte-like (0-255)')
    print(f'  First 50: {seq[:50]}')
    if byte_like > len(seq) * 0.8:
        # This could be key bytes!
        key_bytes = bytes(v & 0xFF for v in seq)
        print(f'  As hex: {key_bytes[:100].hex()}')
        # Check for DER header
        if key_bytes[0:2] == b'\x30\x82':
            print(f'  *** STARTS WITH DER ASN.1 HEADER! ***')
        if b'MII' in key_bytes or b'-----' in key_bytes:
            print(f'  *** CONTAINS KEY MARKERS! ***')
