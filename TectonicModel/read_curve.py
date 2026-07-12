import bpy
from mathutils import Vector
import math

blend_path = r"D:\OpenCode\MCP\Blender\FelsenmeAR\ModelsFelsenmeAR.blend"
bpy.ops.wm.open_mainfile(filepath=blend_path)

curve_obj = bpy.data.objects.get("WavePath")
if not curve_obj or curve_obj.type != 'CURVE':
    print("ERROR: WavePath curve not found")
    exit(1)

spline = curve_obj.data.splines[0]
bps = spline.bezier_points
n = len(bps)

# Sample 8 points evenly along the full curve length
dense = []
seg_pts = 20
num_seg = n - 1 if not spline.use_cyclic_u else n
for seg_i in range(num_seg):
    bp0 = bps[seg_i]
    bp1 = bps[(seg_i + 1) % n]
    for j in range(seg_pts):
        t = j / seg_pts
        # De Casteljau evaluation for cubic bezier
        p = (1-t)**3 * Vector(bp0.co) + 3*(1-t)**2*t * Vector(bp0.handle_right) + 3*(1-t)*t**2 * Vector(bp1.handle_left) + t**3 * Vector(bp1.co)
        dense.append(p)

# Compute cumulative arc length
cum_len = [0]
for i in range(1, len(dense)):
    cum_len.append(cum_len[-1] + (dense[i] - dense[i-1]).length)
total_len = cum_len[-1]

# Sample 8 points evenly by arc length
N = 8
pts = []
for i in range(N):
    target = i * total_len / (N - 1)
    # Find the closest dense point
    idx = min(range(len(cum_len)), key=lambda j: abs(cum_len[j] - target))
    B = dense[idx]
    Bx, By, Bz = B.x, B.y, B.z
    # Blender Z-up → Three.js Y-up: (X,Y,Z) → (X,Z,-Y)
    Tx, Ty, Tz = Bx, Bz, -By
    pts.append([round(Tx, 3), round(Ty, 3), round(Tz, 3)])

print(f"WAVE_POINTS = [")
for p in pts:
    print(f"  [{p[0]:8.3f}, {p[1]:8.3f}, {p[2]:8.3f}],")
print(f"];")
