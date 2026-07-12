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
    mesh = n.get('mesh')
    trans = n.get('translation', [0,0,0])
    print(f'Node[{i}]: name="{name}", mesh={mesh}, trans={trans}')

for i, m in enumerate(gltf.get('meshes', [])):
    name = m.get('name', 'unnamed')
    prims = m.get('primitives', [])
    print(f'Mesh[{i}]: name="{name}", prims={len(prims)}')
    for pi, p in enumerate(prims):
        mat = p.get('material', 'none')
        print(f'  prim[{pi}]: material={mat}')
