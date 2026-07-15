import bpy, json
for o in bpy.data.objects:
    print('=== ' + o.name + ' ===')
    for s in o.material_slots:
        m = s.material
        if not m:
            print('  no material')
            continue
        print('  material: ' + m.name)
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image:
                for oi in n.outputs:
                    for link in oi.links:
                        dst = link.to_node
                        dsti = link.to_socket
                        print('    ' + n.image.name + ' -> ' + dst.type + ':' + dsti.name)
