"""District landmarks: the building at each district's heart, one per theme (src/island/themes.json),
plus the people area's pavilion. Each fits inside a 4.8 radius (mapLayout.ts LANDMARK_R) and faces
-Y (the plaza). The district's name goes on its board (anchor board); its color on the accent slots.
"""
import math

import bmesh
from kit import ACCENT, ACCENT_DEEP, ACCENT_GLOW, ACCENT_TINT, GLOW, Asset
from mathutils import Matrix


def _plinth(a, r, h=0.3, color="white", glow=True, seg=40):
    a.cyl(r, r + 0.12, h, seg, color="concrete")
    if glow:
        a.ring(r + 0.02, r + 0.1, h + 0.001, ACCENT_GLOW, seg=seg, h=0.04, flag=GLOW)
    a.cyl(r - 0.25, r - 0.25, 0.05, seg, z=h, color="paving2")


def _board(a, w, z, y, h=0.62):
    """A name board on a front fascia: a glass panel with an accent line, anchor 'board'."""
    a.box(w + 0.2, 0.1, h + 0.16, y=y, z=z - 0.08, color="white", bevel=0.04, seg=2)
    a.box(w, 0.06, h, y=y - 0.05, z=z, color="glass2", bevel=0.03, seg=2)
    a.box(w, 0.07, 0.05, y=y - 0.06, z=z - 0.02, color=ACCENT_GLOW, flag=GLOW)
    a.anchor("board", 0, y - 0.09, z + h / 2, w - 0.15, h - 0.12, facing=0.0)


def _plants(a, n, r, z, rng_rows=("leaf", "leaf2"), size=(0.45, 0.75)):
    for k in range(n):
        ang = k / n * math.tau + 0.3
        x, y = math.cos(ang) * r, math.sin(ang) * r
        a.cyl(0.08, 0.11, 0.6, 8, x=x, y=y, z=z, color="trunk")
        a.ball(a.rng.uniform(*size), x, y, z + 0.9, color=rng_rows[k % 2], sub=2, squash=1.15, smooth=True, flag=1.0)


def greenhouse():
    """A geodesic glass biodome with white ribs on a lit plinth, trees inside, a white entrance."""
    a = Asset("lm_greenhouse", 101)
    _plinth(a, 4.3, 0.35)
    for sub, rad, color, wire in ((2, 3.55, "glass", False), (2, 3.59, "white", True)):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=rad)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.05], context="VERTS")
        bmesh.ops.scale(bm, vec=(1, 1, 0.95), verts=bm.verts[:])
        if wire:
            bmesh.ops.wireframe(bm, faces=bm.faces[:], thickness=0.08, use_replace=True)
        a.take(bm, color, matrix=Matrix.Translation((0, 0, 0.4)))
    _plants(a, 7, 2.1, 0.4)
    a.cyl(0.18, 0.26, 1.6, 10, z=0.4, color="trunk", smooth=True)
    a.ball(1.25, 0, 0, 2.6, color="leaf2", sub=3, smooth=True, flag=1.0)
    a.box(2.4, 1.4, 2.7, y=-3.35, z=0.35, color="white", bevel=0.12, seg=3)
    a.box(1.7, 1.45, 2.1, y=-3.36, z=0.35, color="glass2")
    _board(a, 2.6, 3.15, -4.08, 0.55)
    return a


def garden():
    """A wellness pavilion: a thin round white canopy on slim columns over a ring of planted beds and
    a feature tree, a light line under the canopy's edge."""
    a = Asset("lm_garden", 103)
    _plinth(a, 4.4, 0.25)
    for k in range(8):
        ang = k / 8 * math.tau + math.pi / 8
        a.cyl(0.11, 0.11, 3.3, 12, x=math.cos(ang) * 3.7, y=math.sin(ang) * 3.7, z=0.25, color="white", smooth=True)
    a.cyl(4.45, 4.3, 0.28, 48, z=3.55, color="white")
    a.cyl(4.25, 4.25, 0.05, 48, z=3.5, color=ACCENT_GLOW, flag=GLOW)
    a.cyl(2.2, 2.2, 0.06, 32, z=3.83, color=ACCENT_TINT)
    a.ring(2.0, 3.1, 0.3, "lawn", seg=40, h=0.25)
    a.ring(3.05, 3.15, 0.3, "white", seg=40, h=0.3)
    a.ring(1.9, 2.0, 0.3, "white", seg=40, h=0.3)
    for k in range(14):
        ang = k / 14 * math.tau
        a.ball(0.32, math.cos(ang) * 2.55, math.sin(ang) * 2.55, 0.75, color="leaf" if k % 2 else "leaf2", sub=2, squash=0.85, smooth=True, flag=0.8)
    a.cyl(0.16, 0.22, 2.0, 10, z=0.3, color="trunk", smooth=True)
    a.ball(1.3, 0, 0, 2.6, color="leaf", sub=3, squash=0.9, smooth=True, flag=1.0)
    _board(a, 2.6, 3.95, -4.2, 0.5)
    return a


def workshop():
    """A fabrication lab: a white hall with a sawtooth glass roof, a glazed front door in an accent
    frame, and a robot arm sculpture beside it."""
    a = Asset("lm_workshop", 107)
    a.box(8.6, 6.2, 0.3, color="concrete", bevel=0.05)
    a.box(8.0, 5.6, 0.04, z=0.3, color=ACCENT_GLOW, flag=GLOW)
    a.box(7.4, 5.0, 3.6, z=0.3, color="white", bevel=0.14, seg=3)
    for i in range(4):  # sawtooth: glass faces toward +y (north), white slopes toward the plaza
        x0 = -3.7 + i * 1.85
        a.plate([(x0, -2.5, 3.9), (x0 + 1.85, -2.5, 3.9), (x0 + 1.85, 2.5, 3.9), (x0, 2.5, 3.9)], 0.06, "white")
        a.plate([(x0, -2.5, 3.9), (x0, 2.5, 3.9), (x0, 2.5, 5.0), (x0, -2.5, 5.0)], 0.05, "glass")
        a.plate([(x0, -2.5, 5.0), (x0, 2.5, 5.0), (x0 + 1.85, 2.5, 3.9), (x0 + 1.85, -2.5, 3.9)], 0.06, "pearl")
    a.box(3.6, 0.2, 2.8, y=-2.55, z=0.3, color=ACCENT, bevel=0.06, seg=2)
    a.box(3.2, 0.22, 2.5, y=-2.57, z=0.3, color="glass2")
    for i in range(3):
        a.box(3.2, 0.24, 0.04, y=-2.58, z=0.3 + 0.62 * (i + 1), color="white")
    # robot arm: base, two segments, a gripper
    x0, y0 = 3.1, -3.4
    a.cyl(0.55, 0.62, 0.35, 20, x=x0, y=y0, color="graphite")
    a.cyl(0.32, 0.32, 1.3, 16, x=x0, y=y0, z=0.35, color="white", smooth=True)
    a.bar((x0, y0, 1.65), (x0 - 0.9, y0 - 0.2, 2.9), 0.26, 0.26, ACCENT)
    a.bar((x0 - 0.9, y0 - 0.2, 2.9), (x0 - 1.8, y0 - 0.4, 2.3), 0.2, 0.2, "white")
    a.ball(0.2, x0 - 0.9, y0 - 0.2, 2.9, color="graphite", sub=2, smooth=True)
    a.box(0.3, 0.3, 0.25, x=x0 - 1.85, y=y0 - 0.42, z=2.05, color="graphite")
    _board(a, 3.4, 4.25, -2.62, 0.55)
    return a


def lab():
    """An observatory-lab: a round white building with a glass band, a white dome with an accent slit
    and an antenna mast."""
    a = Asset("lm_lab", 109)
    _plinth(a, 4.3, 0.3)
    a.cyl(3.3, 3.3, 1.2, 40, z=0.3, color="white", smooth=True)
    a.cyl(3.32, 3.32, 1.0, 40, z=1.5, color="glass", smooth=True)
    a.cyl(3.4, 3.4, 0.25, 40, z=2.5, color="white", smooth=True)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=3.0)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.01], context="VERTS")
    a.take(bm, "white", smooth=True, matrix=Matrix.Translation((0, 0, 2.75)))
    a.box(0.7, 3.2, 3.05, x=0, y=0.25, z=2.75, color=ACCENT, tilt=(0.0, 0.0), bevel=0.05)
    a.cyl(0.05, 0.05, 2.0, 8, x=-1.6, y=1.2, z=5.0, color="steel")
    a.ball(0.12, -1.6, 1.2, 7.0, color=ACCENT_GLOW, sub=1, flag=GLOW)
    a.box(2.2, 1.2, 2.3, y=-3.25, z=0.3, color="white", bevel=0.12, seg=3)
    a.box(1.5, 1.25, 1.9, y=-3.26, z=0.3, color="glass2")
    _board(a, 2.6, 2.85, -3.95, 0.5)
    return a


def market():
    """A glass retail pavilion under a floating white roof slab with a deep overhang, display plinths
    inside and an accent band along the roof's edge."""
    a = Asset("lm_market", 113)
    a.box(8.8, 6.4, 0.25, color="concrete", bevel=0.05)
    a.box(7.6, 5.0, 3.0, z=0.25, color="glass", bevel=0.05)
    for x in (-3.8, -1.27, 1.27, 3.8):
        for y in (-2.5, 2.5):
            a.box(0.12, 0.12, 3.0, x=x, y=y, z=0.25, color="white")
    a.box(9.2, 6.8, 0.38, z=3.35, color="white", bevel=0.1, seg=3)
    a.box(9.0, 6.6, 0.06, z=3.3, color=ACCENT_GLOW, flag=GLOW)
    a.box(9.24, 0.06, 0.2, y=-3.42, z=3.45, color=ACCENT)
    for k, (x, y) in enumerate(((-2.4, -0.6), (0, 0.8), (2.4, -0.6))):
        a.box(1.0, 1.0, 0.9, x=x, y=y, z=0.25, color="white", bevel=0.08, seg=2)
        a.box(0.5, 0.5, 0.5, x=x, y=y, z=1.15, color=ACCENT if k % 2 else "coral", bevel=0.05, seg=2)
    _board(a, 3.6, 3.85, -3.48, 0.55)
    return a


def bank():
    """A slim fintech tower: stacked offset white and glass volumes to 9.5, a vertical accent fin and a
    lit ticker band near the top."""
    a = Asset("lm_bank", 127)
    a.box(6.4, 6.0, 0.3, color="concrete", bevel=0.05)
    a.box(5.6, 5.0, 3.2, z=0.3, color="white", bevel=0.14, seg=3)
    a.box(5.0, 5.05, 2.2, z=0.8, color="glass2")
    a.box(4.4, 4.0, 3.4, x=0.4, z=3.5, color="glass", bevel=0.06)
    for z in (4.5, 5.6, 6.7):
        a.box(4.5, 4.1, 0.12, x=0.4, z=z, color="white")
    a.box(3.6, 3.2, 2.5, x=-0.2, z=6.9, color="white", bevel=0.14, seg=3)
    a.box(3.7, 3.3, 0.35, x=-0.2, z=8.1, color="screen")
    a.box(3.72, 3.32, 0.06, x=-0.2, z=8.48, color=ACCENT_GLOW, flag=GLOW)
    a.box(0.35, 0.5, 9.0, x=-2.7, y=-2.0, z=0.3, color=ACCENT, bevel=0.06, seg=2)
    a.box(2.0, 0.5, 2.4, y=-2.6, z=0.3, color="glass2")
    _board(a, 2.8, 3.55, -2.6, 0.55)
    return a


def harbor():
    """A logistics hub: stacked container modules in white, graphite and the district color, a gantry
    crane over them and a drone pad on top."""
    a = Asset("lm_harbor", 131)
    a.box(8.8, 6.4, 0.25, color="concrete", bevel=0.05)
    mods = [(-2.4, -1.2, 0, "white"), (0.3, -1.2, 0, ACCENT), (3.0, -1.2, 0, "graphite"), (-2.4, 1.3, 0, "graphite"), (0.3, 1.3, 0, "white"),
            (-1.05, -1.2, 1.25, "white"), (1.65, 1.3, 1.25, ACCENT), (-1.05, 1.3, 1.25, "pearl")]
    for x, y, z, c in mods:
        a.box(2.6, 2.3, 1.2, x=x, y=y, z=0.25 + z, color=c, bevel=0.05, seg=2)
        for k in range(5):
            a.box(0.05, 2.32, 1.0, x=x - 1.0 + k * 0.5, y=y, z=0.35 + z, color="white" if c != "white" else "pearl")
    for x in (-3.9, 3.9):
        for y in (-2.7, 2.7):
            a.box(0.25, 0.25, 4.6, x=x, y=y, z=0.25, color="white", bevel=0.04)
        a.box(0.3, 5.7, 0.3, x=x, z=4.75, color="white")
    a.box(8.1, 0.4, 0.4, z=4.8, color=ACCENT, bevel=0.04)
    a.box(0.8, 0.8, 0.5, x=1.0, z=4.3, color="graphite")
    a.cyl(0.03, 0.03, 1.4, 6, x=1.0, z=2.9, color="steel")
    a.cyl(1.0, 1.0, 0.08, 24, x=-1.05, y=1.3, z=2.7, color="graphite")
    a.ring(0.75, 0.85, 2.79, ACCENT_GLOW, seg=24, flag=GLOW)
    _board(a, 3.0, 3.05, -2.42, 0.5)
    return a


def studio():
    """A media studio: a white box with a huge dark screen facade in an accent frame, a canopy of
    spotlights on a truss over the entrance."""
    a = Asset("lm_studio", 137)
    a.box(8.4, 6.2, 0.25, color="concrete", bevel=0.05)
    a.box(7.4, 5.2, 4.6, z=0.25, color="white", bevel=0.16, seg=3)
    a.box(6.4, 0.22, 3.4, y=-2.62, z=1.0, color=ACCENT, bevel=0.06, seg=2)
    a.box(6.0, 0.24, 3.0, y=-2.64, z=1.2, color="screen", bevel=0.04, seg=2)
    a.box(8.0, 0.25, 0.25, y=-3.6, z=4.4, color="steel")
    for x in (-3.6, 3.6):
        a.box(0.22, 0.22, 4.4, x=x, y=-3.6, z=0.25, color="steel")
    for k in range(6):
        x = -2.9 + k * 1.16
        a.cyl(0.18, 0.12, 0.42, 10, x=x, y=-3.6, z=3.95, color="graphite")
        a.cyl(0.13, 0.13, 0.03, 10, x=x, y=-3.6, z=3.93, color="glow", flag=GLOW)
    a.box(1.6, 0.3, 1.0, y=-2.65, z=0.25, color="glass2")
    a.anchor("screen", 0, -2.77, 2.7, 5.8, 2.8, facing=0.0)
    _board(a, 3.2, 4.72, -2.62, 0.5)
    return a


def school():
    """A learning pavilion: tiered seating facing a small stage under a cantilevered white roof, with a
    slim bell-and-beacon tower."""
    a = Asset("lm_school", 139)
    a.box(8.8, 7.4, 0.25, color="concrete", bevel=0.05)
    for i in range(4):  # seating tiers rising toward the back (+y)
        a.box(7.0 - i * 0.4, 1.0, 0.45 * (i + 1), y=0.4 + i * 0.95, z=0.25, color="white" if i % 2 == 0 else "wood", bevel=0.06, seg=2)
    a.box(4.0, 1.6, 0.35, y=-2.0, z=0.25, color=ACCENT_TINT, bevel=0.05)
    a.box(8.4, 5.2, 0.32, y=1.2, z=3.6, color="white", bevel=0.1, seg=3, tilt=(0.06, 0))
    a.box(8.2, 5.0, 0.05, y=1.2, z=3.55, color=ACCENT_GLOW, flag=GLOW, tilt=(0.06, 0))
    for x in (-3.9, 3.9):
        a.box(0.3, 0.3, 3.6, x=x, y=3.4, z=0.25, color="white", bevel=0.05)
    a.box(0.7, 0.7, 6.4, x=3.6, y=-2.4, z=0.25, color="white", bevel=0.1, seg=2)
    a.box(0.72, 0.72, 0.6, x=3.6, y=-2.4, z=5.3, color="glass2")
    a.ball(0.2, 3.6, -2.4, 6.9, color=ACCENT_GLOW, sub=1, flag=GLOW)
    _board(a, 3.0, 3.2, -1.95, 0.5)
    return a


def people():
    """The people area's pavilion: a ring-shaped white canopy on slim columns round a quiet lawn with
    a tree, benches under the canopy."""
    a = Asset("lm_people", 149)
    _plinth(a, 4.4, 0.25)
    for k in range(10):
        ang = k / 10 * math.tau
        a.cyl(0.1, 0.1, 3.1, 12, x=math.cos(ang) * 3.9, y=math.sin(ang) * 3.9, z=0.25, color="white", smooth=True)
    a.ring(2.6, 4.45, 3.35, "white", seg=48, h=0.25)
    a.ring(2.65, 4.4, 3.34, ACCENT_GLOW, seg=48, flag=GLOW)
    a.cyl(2.3, 2.3, 0.05, 32, z=0.3, color="lawn")
    a.cyl(0.15, 0.2, 1.8, 10, z=0.3, color="trunk", smooth=True)
    a.ball(1.2, 0, 0, 2.4, color="leaf2", sub=3, squash=0.9, smooth=True, flag=1.0)
    for k in range(5):
        ang = k / 5 * math.tau + 0.6
        x, y = math.cos(ang) * 3.2, math.sin(ang) * 3.2
        a.box(1.6, 0.5, 0.42, x=x, y=y, z=0.25, color="white", rot=ang + math.pi / 2, bevel=0.07, seg=2)
        a.box(1.5, 0.42, 0.05, x=x, y=y, z=0.67, color="wood", rot=ang + math.pi / 2)
    return a


FOOTPRINT = 4.95  # mapLayout.ts LANDMARK_R (5) less a little


def _fitted(fn):
    def build():
        a = fn()
        a.fit(FOOTPRINT)
        return a
    build.__doc__ = fn.__doc__
    return build


ASSETS = {
    "lm_greenhouse": _fitted(greenhouse),
    "lm_garden": _fitted(garden),
    "lm_workshop": _fitted(workshop),
    "lm_lab": _fitted(lab),
    "lm_market": _fitted(market),
    "lm_bank": _fitted(bank),
    "lm_harbor": _fitted(harbor),
    "lm_studio": _fitted(studio),
    "lm_school": _fitted(school),
    "lm_people": _fitted(people),
}
