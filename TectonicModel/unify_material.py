import bpy
import os

blend_path = r"D:\OpenCode\MCP\Blender\FelsenmeAR\ModelsFelsenmeAR.blend"
out_path = r"D:\OpenCode\MCP\Blender\FelsenmeAR\public\FelsenmeAR.glb"

bpy.ops.wm.open_mainfile(filepath=blend_path)

bpy.ops.preferences.addon_enable(module="io_scene_gltf2")

obj = bpy.data.objects.get("CapaInferior")
if not obj:
    print("ERROR: CapaInferior not found")
    exit(1)

bpy.context.view_layer.objects.active = obj

if len(obj.material_slots) > 1:
    first_mat = obj.material_slots[0].material
    for poly in obj.data.polygons:
        poly.material_index = 0
    while len(obj.material_slots) > 1:
        bpy.ops.object.material_slot_remove()

print(f"Unified {obj.name} to single material: {obj.material_slots[0].material.name if obj.material_slots else 'none'}")

bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format='GLB',
    use_selection=False,
    export_image_format='AUTO',
    export_texcoords=True,
    export_normals=True,
    export_materials='EXPORT',
)

print(f"Exported to {out_path}")
