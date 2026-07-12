import json, struct
with open('public/FelsenmeAR.glb', 'rb') as f:
    f.read(12)
    while True:
        cl = struct.unpack('<I', f.read(4))[0]
        ct = struct.unpack('<I', f.read(4))[0]
        d = f.read(cl)
        if ct == 0x4E4F534A:
            gltf = json.loads(d.decode('utf-8'))
            break

for i, n in enumerate(gltf.get('nodes', [])):
    name = n.get('name', 'unnamed')
    kids = n.get('children', [])
    mesh = n.get('mesh')
    trans = n.get('translation', [0,0,0])
    print(f'Node[{i}]: name="{name}", mesh={mesh}, children={kids}, trans={trans}')
