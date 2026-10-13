"""The island's asset kit, for Blender (bpy and bmesh; run with `blender --background`).

An asset is built from parts (boxes, rounded boxes, cylinders, balls, plates, bars) into one mesh.
Every face carries colorInfo: x is a palette row (src/island/palette.json, by name) or an accent
slot, y is a flag: 0 rigid, 0..1 sway weight (foliage), 3 glow (drawn unlit: LED strips, screens).
Units are world units (the walker is 1.55 tall); the origin is the middle of the footprint on the
ground; the front faces -Y in Blender (+Z in three.js). Placement inside an asset is seeded, so an
asset builds the same every time.
"""
import json
import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(REPO, "src", "island", "palette.json")) as fh:
    PALETTE = json.load(fh)

BASE_ROW = PALETTE["baseRow"]
ROW = {r["name"]: BASE_ROW + i for i, r in enumerate(PALETTE["ramps"])}
# Accent slots: the shader swaps in the rows of the district an asset stands in.
ACCENT = PALETTE["accentSlot"]
ACCENT_GLOW = ACCENT + 1
ACCENT_DEEP = ACCENT + 2
ACCENT_TINT = ACCENT + 3
GLOW = 3.0  # colorInfo.y: draw unlit


def row(name):
    """A palette row by name, or an accent slot passed through."""
    if isinstance(name, (int, float)):
        return float(name)
    if name not in ROW:
        raise KeyError(f"palette.json has no ramp '{name}'")
    return float(ROW[name])


def _jitter(verts, amt, rng):
    for v in verts:
        v.co += Vector((rng.uniform(-amt, amt), rng.uniform(-amt, amt), rng.uniform(-amt, amt)))


class Asset:
    """Accumulates parts (each built in its own bmesh) with a palette row and flag per face."""

    def __init__(self, name, seed=1):
        self.name = name
        self.V, self.F, self.FX, self.FY, self.FS = [], [], [], [], []
        self.rng = random.Random(seed)
        self.anchors = {}

    # -- internals --------------------------------------------------------------------------------
    def take(self, bm, color, smooth=False, flag=0.0, matrix=None, jit=0.0):
        if jit:
            _jitter(bm.verts, jit, self.rng)
        if matrix is not None:
            bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts[:])
        bm.verts.index_update()
        off = len(self.V)
        self.V.extend(v.co.copy() for v in bm.verts)
        r = row(color)
        for f in bm.faces:
            self.F.append([off + v.index for v in f.verts])
            self.FX.append(r)
            self.FY.append(flag)
            self.FS.append(smooth)
        bm.free()

    @staticmethod
    def _place(x, y, z, rot=0.0, tilt=(0.0, 0.0)):
        return Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, "Z") @ Matrix.Rotation(tilt[0], 4, "X") @ Matrix.Rotation(tilt[1], 4, "Y")

    # -- parts ------------------------------------------------------------------------------------
    def box(self, w, d, h, x=0, y=0, z=0, color="white", rot=0.0, tilt=(0, 0), bevel=0.0, seg=1, smooth=False, flag=0.0, jit=0.0):
        """A box standing on z (its bottom), centered on x and y; `bevel` rounds its edges."""
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(w, d, h), verts=bm.verts[:])
        bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts[:])
        if bevel > 0:
            bmesh.ops.bevel(bm, geom=bm.edges[:], offset=min(bevel, w / 2.01, d / 2.01, h / 2.01), segments=seg, affect="EDGES")
        self.take(bm, color, smooth, flag, self._place(x, y, z, rot, tilt), jit)

    def cyl(self, r1, r2, h, seg=12, x=0, y=0, z=0, color="white", smooth=False, rot=0.0, axis=None, cap=True, flag=0.0, jit=0.0):
        """A cylinder (a cone with r2 0) standing on z."""
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=cap, segments=seg, radius1=r1, radius2=r2, depth=h)
        bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts[:])
        m = self._place(x, y, z, rot)
        if axis is not None:
            m = m @ axis
        self.take(bm, color, smooth, flag, m, jit)

    def ball(self, rad, x=0, y=0, z=0, color="leaf", sub=1, squash=1.0, smooth=False, flag=0.0, jit=0.0):
        """A ball centered at z, squashed in z by `squash`."""
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=rad)
        bmesh.ops.scale(bm, vec=(1, 1, squash), verts=bm.verts[:])
        if jit:
            _jitter(bm.verts, jit, self.rng)
        self.take(bm, color, smooth, flag, Matrix.Translation((x, y, z)))

    def plate(self, pts, thick, color, smooth=False, flag=0.0):
        """A flat polygon through 3D points, thickened along its normal (seen from both sides)."""
        bm = bmesh.new()
        vs = [bm.verts.new(p) for p in pts]
        f = bm.faces.new(vs)
        f.normal_update()
        n = f.normal.copy()
        r = bmesh.ops.extrude_face_region(bm, geom=[f])
        top = [g for g in r["geom"] if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, vec=n * thick, verts=top)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        self.take(bm, color, smooth, flag)

    def slab(self, pts, thick, color, z=0.0, flag=0.0):
        """A 2D polygon (x, y) extruded up from z by thick."""
        area = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
        if area < 0:
            pts = list(reversed(pts))
        self.plate([(p[0], p[1], z) for p in pts], thick, color, flag=flag)

    def bar(self, a, b, w, d, color, flag=0.0):
        """A straight bar from point a to point b, w by d across."""
        a, b = Vector(a), Vector(b)
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(w, d, (b - a).length), verts=bm.verts[:])
        q = (b - a).normalized().to_track_quat("Z", "Y")
        self.take(bm, color, False, flag, Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4())

    def ring(self, r_in, r_out, z, color, seg=48, h=0.0, flag=0.0):
        """A flat annulus at height z (or a short band h tall)."""
        bm = bmesh.new()
        outer = [bm.verts.new((math.cos(i / seg * math.tau) * r_out, math.sin(i / seg * math.tau) * r_out, z)) for i in range(seg)]
        inner = [bm.verts.new((math.cos(i / seg * math.tau) * r_in, math.sin(i / seg * math.tau) * r_in, z)) for i in range(seg)]
        for i in range(seg):
            bm.faces.new([inner[i], inner[(i + 1) % seg], outer[(i + 1) % seg], outer[i]])
        if h > 0:
            r = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
            top = [g for g in r["geom"] if isinstance(g, bmesh.types.BMVert)]
            bmesh.ops.translate(bm, vec=(0, 0, h), verts=top)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        self.take(bm, color, False, flag)

    def anchor(self, name, x, y, z, w=0.0, h=0.0, facing=0.0):
        """A named spot the engine dresses at runtime (a screen for a logo, a board for a name):
        its center (Blender axes, converted on export), size and facing (radians about z, 0 = -Y)."""
        self.anchors[name] = {"at": [x, y, z], "w": w, "h": h, "facing": facing}

    def merge(self, other, matrix=None):
        """Append another asset's faces (moved by `matrix`)."""
        off = len(self.V)
        m = matrix or Matrix.Identity(4)
        self.V.extend(m @ v for v in other.V)
        self.F.extend([[off + i for i in f] for f in other.F])
        self.FX.extend(other.FX)
        self.FY.extend(other.FY)
        self.FS.extend(other.FS)

    # -- output -----------------------------------------------------------------------------------
    def emit(self, location=(0, 0, 0), rot=0.0):
        """The asset as a Blender object, with a FACE-domain FLOAT2 attribute 'colorInfo'."""
        me = bpy.data.meshes.new(self.name)
        me.from_pydata([tuple(v) for v in self.V], [], self.F)
        me.update()
        ci = me.attributes.new("colorInfo", "FLOAT2", "FACE")
        flat = []
        for x, y in zip(self.FX, self.FY):
            flat += [x, y]
        ci.data.foreach_set("vector", flat)
        me.polygons.foreach_set("use_smooth", self.FS)
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = location
        ob.rotation_euler.z = rot
        return ob

    def fit(self, max_r):
        """Scale the whole asset down (uniformly, anchors too) so no part reaches past max_r from its
        origin across the ground. Returns the scale used."""
        reach = max((v.x * v.x + v.y * v.y) ** 0.5 for v in self.V)
        if reach <= max_r:
            return 1.0
        k = max_r / reach
        self.V = [v * k for v in self.V]
        for a in self.anchors.values():
            a["at"] = [c * k for c in a["at"]]
            a["w"] *= k
            a["h"] *= k
        return k

    def triangles(self):
        return sum(len(f) - 2 for f in self.F)
