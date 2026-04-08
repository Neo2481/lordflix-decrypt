import struct

with open('/home/z/my-project/download/hxqvpnrw.wasm', 'rb') as f:
    data = f.read()

# Exports section analysis
print('=== EXPORTS ===')
exp_start = 3032
exp_data = data[exp_start:exp_start+58]
pos = 0
count = 0
while pos < len(exp_data):
    name_len = 0
    shift = 0
    while pos < len(exp_data):
        byte = exp_data[pos]; pos += 1
        name_len |= (byte & 0x7f) << shift; shift += 7
        if not (byte & 0x80): break
    name = exp_data[pos:pos+name_len].decode('utf-8', errors='replace')
    pos += name_len
    kind = exp_data[pos]; pos += 1
    idx = 0
    shift = 0
    while pos < len(exp_data):
        byte = exp_data[pos]; pos += 1
        idx |= (byte & 0x7f) << shift; shift += 7
        if not (byte & 0x80): break
    kind_names = {0:'func',1:'table',2:'memory',3:'global'}
    print(f'  Export #{count}: name="{name}", kind={kind_names.get(kind,kind)}, index={idx}')
    count += 1

# Function count
print('\n=== FUNCTION COUNT ===')
func_data = data[1772:1772+173]
print(f'Number of function type indices: {func_data[0]}')

# Imports
print('\n=== IMPORTS ===')
imp_start = 1363
imp_data = data[imp_start:imp_start+406]
pos = 0
count = 0
while pos < len(imp_data):
    mod_len = 0; shift = 0
    while pos < len(imp_data):
        byte = imp_data[pos]; pos += 1
        mod_len |= (byte & 0x7f) << shift; shift += 7
        if not (byte & 0x80): break
    mod_name = imp_data[pos:pos+mod_len].decode('utf-8', errors='replace')
    pos += mod_len
    fld_len = 0; shift = 0
    while pos < len(imp_data):
        byte = imp_data[pos]; pos += 1
        fld_len |= (byte & 0x7f) << shift; shift += 7
        if not (byte & 0x80): break
    fld_name = imp_data[pos:pos+fld_len].decode('utf-8', errors='replace')
    pos += fld_len
    kind = imp_data[pos]; pos += 1
    kind_names = {0:'func',1:'table',2:'memory',3:'global'}
    print(f'  Import #{count}: module="{mod_name}", field="{fld_name}", kind={kind_names.get(kind,kind)}')
    count += 1
    if kind == 0:
        pos += 1

# Search for large byte arrays in data section
print('\n=== DATA SECTION FULL DUMP (non-UTF16) ===')
data_start = 39134
data_content = data[data_start:data_start+7472]
# Look for non-UTF16 data sections
print(f'Data section size: {len(data_content)} bytes')
# The data section contains UTF-16LE strings. Let's look for anything else
# Parse data segments
pos = 0
seg_count = data[3092]  # DataCount section
print(f'Number of data segments: {seg_count}')
# Skip to data section content
dc = data_content
pos = 0
for seg in range(seg_count):
    # flags
    flags = 0; shift = 0
    while pos < len(dc):
        byte = dc[pos]; pos += 1
        flags |= (byte & 0x7f) << shift; shift += 7
        if not (byte & 0x80): break
    # If flags has bit 0 = active, bit 1 = has memory index
    if flags & 2:
        mem_idx = dc[pos]; pos += 1
    if flags & 1:
        # Has offset expression - skip it (ends with 0x0b)
        while dc[pos] != 0x0b:
            pos += 1
        pos += 1  # skip end
    # Read data size (LEB128)
    seg_size = 0; shift = 0
    while pos < len(dc):
        byte = dc[pos]; pos += 1
        seg_size |= (byte & 0x7f) << shift; shift += 7
        if not (byte & 0x80): break
    seg_data = dc[pos:pos+seg_size]
    print(f'\n  Segment {seg}: offset_expr_flags={flags}, size={seg_size}')
    # Show hex of segment data
    print(f'    Hex (first 200): {seg_data[:200].hex()}')
    # Check if UTF-16LE
    try:
        text = seg_data.decode('utf-16-le')
        printable = sum(1 for c in text if c.isprintable())
        if printable > len(text) * 0.5:
            print(f'    UTF-16LE text: {text[:100]}')
    except:
        pass
    # Check if contains key-like patterns
    if seg_size > 200:
        # Look for high-entropy regions (potential key material)
        entropy_chunks = []
        for i in range(0, min(len(seg_data), 1024), 16):
            chunk = seg_data[i:i+16]
            unique_bytes = len(set(chunk))
            if unique_bytes > 12:  # high entropy
                entropy_chunks.append((i, chunk.hex()))
        if entropy_chunks:
            print(f'    High-entropy regions: {len(entropy_chunks)}')
            for off, h in entropy_chunks[:5]:
                print(f'      +{off}: {h}')
    pos += seg_size

# Now check Global section for initialized data (potential key)
print('\n=== GLOBALS ===')
global_start = 1959
global_data = data[global_start:global_start+1071]
pos = 0
gcount = 0
while pos < len(global_data):
    gtype = global_data[pos]; pos += 1
    mutable = global_data[pos]; pos += 1
    # Skip init expr (ends with 0x0b)
    init_bytes = []
    while pos < len(global_data) and global_data[pos] != 0x0b:
        init_bytes.append(global_data[pos])
        pos += 1
    pos += 1  # skip 0x0b
    type_names = {0x7f:'i32',0x7e:'i64',0x7d:'f32',0x7c:'f64'}
    print(f'  Global #{gcount}: type={type_names.get(gtype,"?")}, mutable={mutable}, init={init_bytes}')
    gcount += 1

print(f'\nTotal globals: {gcount}')
