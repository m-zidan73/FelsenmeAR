import bpy

blend_path = r"D:\OpenCode\MCP\Blender\FelsenmeAR\ModelsFelsenmeAR.blend"
out_path = r"D:\OpenCode\MCP\Blender\FelsenmeAR\public\FelsenmeAR.glb"

bpy.ops.wm.open_mainfile(filepath=blend_path)

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
