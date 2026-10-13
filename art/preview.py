"""Render previews of the island's assets with the game's shading: the palette texture read at
x = half-lambert(N.L) x shadow (the sun from the game's direction), glow faces unlit, district
accents in sample colors. Output goes to art/out/ (not committed).

  blender --background --factory-startup --python-exit-code 1 --python art/preview.py -- sheet [NAME ...]
  blender ... -- sheet --night [NAME ...]
  blender ... -- sheet --out plaza totem monument     (writes art/out/plaza.png)
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import build  # noqa: E402,F401  (registry + export helpers; build.main runs only as a script)
from kit import ACCENT, PALETTE  # noqa: E402

OUT = os.path.join(HERE, "out")
SUN = Vector((0.4156, -0.4156, 0.8090)).normalized()  # mapWorld.ts: Spherical(100, 0.2 pi, -1.75 pi)
ROWS, WIDTH = PALETTE["rows"], 256
SAMPLE_ACCENT = "#2a78d6"


def _hex(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]


def _lin(u):
    return u / 12.92 if u <= 0.04045 else ((u + 0.055) / 1.055) ** 2.4


def _district(color, theme):
    """Same as src/island/ramps.ts districtRamps (accent, glow, deep, tint)."""
    c = [v * 255 for v in _hex(color)]
    w = [255, 255, 255]
    sc = lambda k: [v * k for v in c]
    tw = lambda base, t, k: [b + (tt - b) * k for b, tt in zip(base, t)]
    hx = lambda v: "#" + "".join(f"{int(round(min(255, max(0, x)))):02x}" for x in v)
    if theme == "day":
        return [[(0, hx(sc(0.62))), (0.22, hx(c)), (0.86, hx(tw(c, w, 0.25)))], [(0, hx(tw(c, w, 0.3)))],
                [(0, hx(sc(0.3))), (0.22, hx(sc(0.45))), (0.86, hx(sc(0.6)))],
                [(0, hx(tw(sc(0.8), w, 0.55))), (0.22, hx(tw(c, w, 0.72))), (0.86, hx(tw(c, w, 0.86)))]]
    d = [v * 255 for v in _hex("#2c3647")]
    return [[(0, hx(sc(0.22))), (0.22, hx(sc(0.38))), (0.86, hx(sc(0.52)))], [(0, hx(tw(c, w, 0.35)))],
            [(0, hx(sc(0.12))), (0.22, hx(sc(0.18))), (0.86, hx(sc(0.25)))],
            [(0, hx(tw(sc(0.3), d, 0.6))), (0.22, hx(tw(sc(0.45), d, 0.6))), (0.86, hx(tw(sc(0.6), d, 0.6)))]]


def palette_image(theme="day", accent=SAMPLE_ACCENT):
    import numpy as np
    img = np.zeros((ROWS, WIDTH, 4), dtype=np.float32)
    img[..., 3] = 1
    u = np.linspace(0, 1, WIDTH)

    def put(r, stops):
        for u0, h in stops:
            img[r, u >= u0, :3] = [_lin(v) for v in _hex(h)]

    for i, rp in enumerate(PALETTE["ramps"]):
        put(PALETTE["baseRow"] + i, rp[theme])
    for j, stops in enumerate(_district(accent, theme)):
        put(ACCENT + j, stops)  # previews show the accent slots directly in the sample color
    im = bpy.data.images.new("palette", WIDTH, ROWS, alpha=True, float_buffer=True)
    im.colorspace_settings.name = "Linear Rec.709"
    im.pixels = img.ravel()
    return im


def palette_material(img):
    m = bpy.data.materials.new("palette")
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    for n in list(N):
        N.remove(n)
    out = N.new("ShaderNodeOutputMaterial")
    geo = N.new("ShaderNodeNewGeometry")
    dot = N.new("ShaderNodeVectorMath"); dot.operation = "DOT_PRODUCT"; dot.inputs[1].default_value = SUN
    L.new(geo.outputs["Normal"], dot.inputs[0])
    half = N.new("ShaderNodeMapRange"); half.inputs["From Min"].default_value = -1
    L.new(dot.outputs["Value"], half.inputs["Value"])
    dif = N.new("ShaderNodeBsdfDiffuse"); s2r = N.new("ShaderNodeShaderToRGB"); L.new(dif.outputs[0], s2r.inputs[0])
    bw = N.new("ShaderNodeRGBToBW"); L.new(s2r.outputs["Color"], bw.inputs[0])
    ndl = N.new("ShaderNodeMath"); ndl.operation = "MAXIMUM"; ndl.inputs[1].default_value = 0.08; L.new(dot.outputs["Value"], ndl.inputs[0])
    ratio = N.new("ShaderNodeMath"); ratio.operation = "DIVIDE"; ratio.use_clamp = True
    L.new(bw.outputs[0], ratio.inputs[0]); L.new(ndl.outputs[0], ratio.inputs[1])
    away = N.new("ShaderNodeMath"); away.operation = "LESS_THAN"; away.inputs[1].default_value = 0.08; L.new(dot.outputs["Value"], away.inputs[0])
    shadow = N.new("ShaderNodeMath"); shadow.operation = "MAXIMUM"; shadow.use_clamp = True
    L.new(ratio.outputs[0], shadow.inputs[0]); L.new(away.outputs[0], shadow.inputs[1])
    rx = N.new("ShaderNodeMath"); rx.operation = "MULTIPLY"; rx.use_clamp = True
    L.new(half.outputs["Result"], rx.inputs[0]); L.new(shadow.outputs[0], rx.inputs[1])
    attr = N.new("ShaderNodeAttribute"); attr.attribute_type = "GEOMETRY"; attr.attribute_name = "colorInfo"
    sep = N.new("ShaderNodeSeparateXYZ"); L.new(attr.outputs["Vector"], sep.inputs[0])
    glow = N.new("ShaderNodeMath"); glow.operation = "GREATER_THAN"; glow.inputs[1].default_value = 2.5; L.new(sep.outputs["Y"], glow.inputs[0])
    mixu = N.new("ShaderNodeMix"); mixu.data_type = "FLOAT"
    L.new(glow.outputs[0], mixu.inputs["Factor"]); L.new(rx.outputs[0], mixu.inputs["A"]); mixu.inputs["B"].default_value = 0.5
    rv = N.new("ShaderNodeMath"); rv.operation = "ADD"; rv.inputs[1].default_value = 0.5; L.new(sep.outputs["X"], rv.inputs[0])
    rv2 = N.new("ShaderNodeMath"); rv2.operation = "DIVIDE"; rv2.inputs[1].default_value = ROWS; L.new(rv.outputs[0], rv2.inputs[0])
    xyz = N.new("ShaderNodeCombineXYZ"); L.new(mixu.outputs["Result"], xyz.inputs["X"]); L.new(rv2.outputs[0], xyz.inputs["Y"])
    tex = N.new("ShaderNodeTexImage"); tex.image = img; tex.interpolation = "Closest"; tex.extension = "EXTEND"
    L.new(xyz.outputs["Vector"], tex.inputs["Vector"])
    em = N.new("ShaderNodeEmission"); L.new(tex.outputs["Color"], em.inputs["Color"])
    L.new(em.outputs[0], out.inputs["Surface"])
    return m


def scene(res=(1800, 900)):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0, 0, 0, 1)
    sun = bpy.data.lights.new("sun", "SUN"); sun.energy = math.pi; sun.angle = math.radians(2)
    o = bpy.data.objects.new("sun", sun); sc.collection.objects.link(o)
    o.rotation_mode = "QUATERNION"; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(SUN)
    return sc


def figure(mat):
    """A 1.55-tall stand-in for the walker, for scale."""
    from kit import Asset
    a = Asset("figure")
    a.cyl(0.16, 0.16, 0.8, 12, color="graphite", smooth=True)
    a.box(0.5, 0.28, 0.5, z=0.78, color="graphite", bevel=0.1, seg=2)
    a.ball(0.17, 0, 0, 1.4, color="sand", sub=2, smooth=True)
    ob = a.emit(); ob.data.materials.append(mat)
    return ob


def camera(loc, target, lens=35, ortho=None):
    cam = bpy.data.cameras.new("cam"); cam.lens = lens; cam.clip_end = 3000
    if ortho:
        cam.type = "ORTHO"; cam.ortho_scale = ortho
    o = bpy.data.objects.new("cam", cam); bpy.context.scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = o


def render(path, night=False):
    import numpy as np
    sc = bpy.context.scene
    sc.render.filepath = path
    sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    t = np.linspace(0, 1, h)[:, None, None]
    lo, hi = (np.array([0.05, 0.07, 0.12]), np.array([0.01, 0.015, 0.04])) if night else (np.array([0.70, 0.84, 0.95]), np.array([0.25, 0.52, 0.83]))
    sky = lo * (1 - t) + hi * t
    al = a[..., 3:4]
    a[..., :3] = a[..., :3] * al + sky * (1 - al)
    a[..., 3] = 1
    img.pixels = a.ravel(); img.filepath_raw = path; img.file_format = "PNG"; img.save()
    print("RENDERED", path)


def sheet(names, night=False, out=None):
    reg = build.registry()
    names = names or sorted(reg)
    sc = scene()
    mat = palette_material(palette_image("night" if night else "day"))
    bpy.ops.mesh.primitive_plane_add(size=400)
    g = bpy.context.active_object
    from kit import ROW
    g.data.attributes.new("colorInfo", "FLOAT2", "FACE").data[0].vector = (ROW["paving"], 0)
    g.data.materials.append(mat)
    fig = figure(mat)
    x = 1.2
    for n in names:
        ob = reg[n]().emit()
        ob.data.materials.append(mat)
        xs = [v.co.x for v in ob.data.vertices]
        wdt = max(xs) - min(xs)
        ob.location.x = x + wdt / 2 - (max(xs) + min(xs)) / 2
        x += wdt + 1.0
    fig.location.x = 0.3
    camera((x / 2, -max(20.0, x * 1.05), max(7.0, x * 0.2)), (x / 2, 0, 3.0), lens=35)
    os.makedirs(OUT, exist_ok=True)
    render(os.path.join(OUT, f"{out or 'sheet'}{'-night' if night else ''}.png"), night)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    mode = argv[0] if argv else "sheet"
    night = "--night" in argv
    out = None
    if "--out" in argv:
        out = argv[argv.index("--out") + 1]
    names = [a for i, a in enumerate(argv[1:], 1) if not a.startswith("--") and argv[i - 1] != "--out"]
    if mode == "sheet":
        sheet(names, night, out)
    else:
        raise SystemExit(f"unknown mode {mode}")


if __name__ == "__main__":
    main()
