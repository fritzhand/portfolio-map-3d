"""The land between the districts: a few modern residences, a pond, a sports court, a playground, picnic
tables, landscape stones, beach palms, and the campus shuttle.

Same language as the campus props: white bodies with rounded edges, glass, warm wood accents, thin
light lines (neutral `glow` on the homes; the district color through the accent slots on the play
and transit pieces), soft greenery that sways.
"""
import math

from kit import ACCENT, ACCENT_GLOW, ACCENT_TINT, GLOW, Asset
from mathutils import Matrix, Vector


# -- helpers --------------------------------------------------------------------------------------
def _solar_row(a, xs, y, z, w=1.0, d=1.5, tilt=0.28):
    """Solar panels on low white rails, tilted to face the front (-Y)."""
    lift = math.sin(tilt) * d / 2
    for x in xs:
        a.box(w, d, 0.06, x=x, y=y, z=z + 0.1 + lift, color="solar", tilt=(tilt, 0), bevel=0.015)
    span = max(xs) - min(xs) + w
    cx = (max(xs) + min(xs)) / 2
    for yy in (y - d * 0.3, y + d * 0.3):
        a.box(span, 0.08, 0.1 + lift + (yy - y) * math.tan(tilt), x=cx, y=yy, z=z, color="pearl")


def _shrubs(a, pts, z, r=0.32):
    for k, (x, y) in enumerate(pts):
        a.ball(r + a.rng.uniform(-0.04, 0.05), x, y, z + r * 0.75, color="leaf2" if k % 2 else "leaf", sub=2, squash=0.82, smooth=True, flag=1.0)


def _round_rect(w, d, r, n=3):
    """A rounded rectangle's outline (x, y), its corners arcs of n segments (matches a box bevel)."""
    pts = []
    for cx, cy, a0 in ((w / 2 - r, d / 2 - r, 0.0), (-w / 2 + r, d / 2 - r, 0.5), (-w / 2 + r, -d / 2 + r, 1.0), (w / 2 - r, -d / 2 + r, 1.5)):
        for i in range(n + 1):
            t = (a0 + 0.5 * i / n) * math.pi
            pts.append((cx + math.cos(t) * r, cy + math.sin(t) * r))
    return pts


def _blob(rx, ry, n, wob):
    """An organic closed outline: an ellipse with a soft wobble (wob = [(amp, freq, phase), ...])."""
    pts = []
    for i in range(n):
        t = i / n * math.tau
        s = 1 + sum(amp * math.sin(f * t + ph) for amp, f, ph in wob)
        pts.append((rx * s * math.cos(t), ry * s * math.sin(t)))
    return pts


def _lily(a, x, y, z, r, color, notch=0.0):
    pts = [(x, y)]
    n = 9
    for i in range(n + 1):
        t = notch + 0.35 + i / n * (math.tau - 0.7)
        pts.append((x + math.cos(t) * r, y + math.sin(t) * r))
    a.slab(pts, 0.025, color, z=z)


def _geodesic_edges():
    """The edges of a frequency-2 geodesic hemisphere (unit radius, a vertex at the pole, a clean
    decagon at the equator)."""
    phi = (1 + 5 ** 0.5) / 2
    base = []
    for s1 in (-1, 1):
        for s2 in (-1, 1):
            base += [Vector((0, s1, s2 * phi)), Vector((s1, s2 * phi, 0)), Vector((s2 * phi, 0, s1))]
    q = base[0].normalized().rotation_difference(Vector((0, 0, 1)))
    verts = [(q @ v).normalized() for v in base]
    faces = []
    n = len(verts)
    edge = min((verts[i] - verts[j]).length for i in range(n) for j in range(i + 1, n))
    near = lambda i, j: abs((verts[i] - verts[j]).length - edge) < 1e-4
    for i in range(n):
        for j in range(i + 1, n):
            for k in range(j + 1, n):
                if near(i, j) and near(j, k) and near(i, k):
                    faces.append((verts[i], verts[j], verts[k]))
    seen, out = set(), []

    def add(p, q2):
        if p.z < -1e-4 or q2.z < -1e-4:
            return
        key = tuple(sorted((tuple(round(c, 4) for c in p), tuple(round(c, 4) for c in q2))))
        if key not in seen:
            seen.add(key)
            out.append((p, q2))

    for v1, v2, v3 in faces:
        m12, m23, m31 = ((v1 + v2) / 2).normalized(), ((v2 + v3) / 2).normalized(), ((v3 + v1) / 2).normalized()
        for p, q2 in ((v1, m12), (m12, v2), (v2, m23), (m23, v3), (v3, m31), (m31, v1), (m12, m23), (m23, m31), (m31, m12)):
            add(p, q2)
    return out


def _on_roof(x0, y0, z0, tilt, u, v, h):
    """A point on a roof slab tilted about x (origin x0, y0, z0 at its bottom middle), in its own frame."""
    return (x0 + u, y0 + v * math.cos(tilt) - h * math.sin(tilt), z0 + v * math.sin(tilt) + h * math.cos(tilt))


# -- residences -----------------------------------------------------------------------------------
def house_a():
    """A two-storey home of stacked white volumes: the upper one slides over a wood-soffit carport on a
    slim column; floor-to-ceiling glass below, a ribbon window and a wood panel above, a roof terrace
    with a glass rail and planters, solar panels on the top roof. 8.6 by 7.2, 6.9 tall."""
    a = Asset("house_a", 201)
    a.box(8.6, 7.2, 0.15, color="concrete", bevel=0.04)
    # ground floor: x -4.1..2.1, y -2.3..3.1, top 3.35
    a.box(6.2, 5.4, 3.2, x=-1.0, y=0.4, z=0.15, color="white", bevel=0.14, seg=3)
    a.box(3.4, 0.06, 2.55, x=-2.15, y=-2.32, z=0.35, color="glass2", bevel=0.02)
    for x in (-3.0, -1.3):
        a.box(0.07, 0.1, 2.55, x=x, y=-2.33, z=0.35, color="white")
    a.box(1.05, 0.08, 2.2, x=0.95, y=-2.33, z=0.15, color="wood", bevel=0.02)
    a.box(1.7, 0.9, 0.12, x=0.95, y=-2.7, z=2.62, color="white", bevel=0.04, seg=2)
    a.box(1.5, 0.06, 0.03, x=0.95, y=-3.1, z=2.6, color="glow", flag=GLOW)
    # upper floor: x -1.8..3.6, y -2.7..3.1, top 6.35; it overhangs the carport (x 2.1..3.6)
    a.box(5.4, 5.8, 3.0, x=0.9, y=0.2, z=3.35, color="white", bevel=0.14, seg=3)
    a.box(1.42, 5.7, 0.04, x=2.86, y=0.2, z=3.31, color="wood")
    a.box(0.05, 5.6, 0.03, x=3.56, y=0.2, z=3.36, color="glow", flag=GLOW)
    a.box(0.18, 0.18, 3.2, x=3.35, y=-2.45, z=0.15, color="white", bevel=0.04, seg=2)
    a.box(1.42, 5.6, 0.04, x=2.86, y=0.2, z=0.15, color="paving2")
    a.box(2.6, 0.06, 1.35, x=-0.25, y=-2.72, z=4.3, color="glass2", bevel=0.02)
    a.box(5.1, 0.04, 0.04, x=0.9, y=-2.72, z=3.42, color="glow", flag=GLOW)
    a.box(1.9, 0.08, 2.55, x=2.45, y=-2.73, z=3.55, color="wood", bevel=0.02)
    for i in range(4):
        a.box(0.04, 0.1, 2.55, x=1.73 + i * 0.48, y=-2.75, z=3.55, color="trunk")
    a.box(0.06, 2.4, 1.35, x=3.62, y=0.8, z=4.3, color="glass2", bevel=0.02)
    # back and west glazing
    a.box(3.0, 0.06, 2.4, x=-2.0, y=3.12, z=0.35, color="glass2", bevel=0.02)
    a.box(0.07, 0.1, 2.4, x=-2.0, y=3.13, z=0.35, color="white")
    a.box(3.6, 0.06, 1.35, x=1.0, y=3.12, z=4.3, color="glass2", bevel=0.02)
    a.box(0.06, 2.2, 2.4, x=-4.12, y=0.9, z=0.35, color="glass2", bevel=0.02)
    # roof terrace on the ground floor's west part: glass rail, planter
    a.box(2.25, 0.05, 0.85, x=-2.95, y=-2.2, z=3.35, color="glass")
    a.box(0.05, 5.15, 0.85, x=-4.0, y=0.4, z=3.35, color="glass")
    a.box(2.3, 0.08, 0.05, x=-2.95, y=-2.2, z=4.2, color="white")
    a.box(0.08, 5.2, 0.05, x=-4.0, y=0.4, z=4.2, color="white")
    a.box(0.7, 2.2, 0.45, x=-3.45, y=1.6, z=3.35, color="white", bevel=0.06, seg=2)
    _shrubs(a, [(-3.45, 0.95), (-3.45, 1.6), (-3.45, 2.25)], 3.8, 0.28)
    # solar on the top roof
    for y in (-1.15, 1.25):
        _solar_row(a, [-1.0, 0.1, 1.2, 2.3], y, 6.35, w=1.0, d=1.6)
    # front bed
    a.box(3.2, 0.7, 0.4, x=-2.15, y=-3.0, z=0.15, color="white", bevel=0.06, seg=2)
    _shrubs(a, [(-3.3, -3.0), (-2.55, -3.0), (-1.8, -3.0), (-1.05, -3.0)], 0.55, 0.27)
    return a


def house_b():
    """A one-and-a-half-storey home under a floating mono-pitch roof (low at the front, solar on it),
    a glass clerestory beneath, full-height glazing behind wood fins, and a carport with an EV charger.
    9 by 7.1, 5.3 tall."""
    a = Asset("house_b", 203)
    a.box(8.8, 7.0, 0.15, color="concrete", bevel=0.04)
    # main volume: x -4.3..1.9, y -2.3..2.9, top 3.15
    a.box(6.2, 5.2, 3.0, x=-1.2, y=0.3, z=0.15, color="white", bevel=0.14, seg=3)
    # the roof: rises toward the back
    tilt = 0.3
    x0, y0, z0 = -1.2, 0.3, 4.15
    a.box(6.8, 6.6, 0.26, x=x0, y=y0, z=z0, color="white", bevel=0.1, seg=3, tilt=(tilt, 0))
    a.box(6.6, 0.05, 0.03, x=x0, y=y0 - 3.3 * math.cos(tilt) + 0.08, z=z0 - 3.3 * math.sin(tilt) - 0.01, color="glow", flag=GLOW)
    # clerestory: the glass wedge between the walls and the roof
    zf = z0 + (-2.25 - y0) * math.tan(tilt)
    zb = z0 + (2.85 - y0) * math.tan(tilt)
    a.plate([(-4.2, -2.25, 3.1), (-4.2, 2.85, 3.1), (-4.2, 2.85, zb), (-4.2, -2.25, zf)], 6.0, "glass")
    for u in (-2.4, -0.8, 0.8, 2.4):
        for v in (-1.6, 0.2):
            px, py, pz = _on_roof(x0, y0, z0, tilt, u, v, 0.27)
            a.box(1.45, 1.65, 0.05, x=px, y=py, z=pz, color="solar", tilt=(tilt, 0), bevel=0.015)
    # front: glazing behind wood fins, a wood door
    a.box(4.1, 0.06, 2.6, x=-2.0, y=-2.32, z=0.3, color="glass2", bevel=0.02)
    for i in range(9):
        a.box(0.1, 0.18, 2.75, x=-3.9 + i * 0.27, y=-2.45, z=0.15, color="wood")
    a.box(0.06, 0.1, 2.6, x=-0.6, y=-2.33, z=0.3, color="white")
    a.box(1.0, 0.08, 2.2, x=0.85, y=-2.33, z=0.15, color="wood", bevel=0.02)
    a.box(0.5, 0.04, 0.04, x=0.85, y=-2.37, z=2.5, color="glow", flag=GLOW)
    # carport: x 2.0..4.4
    a.box(2.5, 5.6, 0.18, x=3.15, y=0.2, z=2.75, color="white", bevel=0.06, seg=2)
    a.box(2.3, 0.05, 0.03, x=3.15, y=-2.55, z=2.73, color="glow", flag=GLOW)
    for y in (-2.3, 2.6):
        a.box(0.16, 0.16, 2.6, x=4.25, y=y, z=0.15, color="white", bevel=0.04, seg=2)
    a.box(2.3, 5.4, 0.03, x=3.1, y=0.2, z=0.15, color="paving2")
    a.box(0.34, 0.22, 1.25, x=2.1, y=0.9, z=0.15, color="white", bevel=0.08, seg=2)
    a.box(0.24, 0.24, 0.05, x=2.1, y=0.88, z=1.0, color="glow", flag=GLOW)
    a.box(0.2, 0.23, 0.22, x=2.1, y=0.88, z=0.6, color="graphite", bevel=0.03)
    # back and west glazing
    a.box(3.4, 0.06, 2.5, x=-2.0, y=2.92, z=0.3, color="glass2", bevel=0.02)
    a.box(0.07, 0.1, 2.5, x=-2.0, y=2.93, z=0.3, color="white")
    a.box(0.06, 2.2, 1.5, x=-4.32, y=0.6, z=1.1, color="glass2", bevel=0.02)
    # side garden
    _shrubs(a, [(-4.05, 3.25), (0.9, 3.25), (1.6, 3.2)], 0.15, 0.3)
    return a


def house_c():
    """A two-storey home whose white upper bar runs front to back and cantilevers over a wood deck,
    its end glazed in a deep wood frame; a pale-gray glass ground floor with a planted roof, a white
    utility block under the bar, solar on top. 8.6 by 7.8, 6.7 tall."""
    a = Asset("house_c", 205)
    a.box(8.6, 7.6, 0.15, color="concrete", bevel=0.04)
    # ground floor (pale gray): x -4.2..0.8, y -1.4..3.4, top 3.15
    a.box(5.0, 4.8, 3.0, x=-1.7, y=1.0, z=0.15, color="pearl", bevel=0.12, seg=3)
    a.box(2.9, 0.06, 2.55, x=-2.4, y=-1.42, z=0.3, color="glass2", bevel=0.02)
    a.box(0.06, 0.1, 2.55, x=-2.4, y=-1.43, z=0.3, color="white")
    a.box(1.0, 0.08, 2.2, x=-0.25, y=-1.43, z=0.15, color="wood", bevel=0.02)
    a.box(0.06, 3.4, 2.5, x=-4.22, y=1.0, z=0.35, color="glass2", bevel=0.02)
    # its planted roof
    a.box(3.4, 4.4, 0.06, x=-2.35, y=1.0, z=3.15, color="lawn")
    a.box(3.6, 0.1, 0.3, x=-2.35, y=-1.25, z=3.15, color="white")
    _shrubs(a, [(-3.6, 2.6), (-2.8, 2.9), (-1.4, -0.6)], 3.2, 0.3)
    # utility block under the bar's back: x 0.3..3.3, y 1.0..3.6
    a.box(3.0, 2.6, 3.0, x=1.8, y=2.3, z=0.15, color="white", bevel=0.12, seg=3)
    a.box(2.2, 0.06, 2.2, x=1.9, y=0.98, z=0.15, color="pearl", bevel=0.02)
    for k in range(1, 4):
        a.box(2.2, 0.08, 0.03, x=1.9, y=0.98, z=0.15 + k * 0.55, color="steel")
    # upper bar: x -0.3..3.7, y -3.8..3.6, top 6.15
    a.box(4.0, 7.4, 3.0, x=1.7, y=-0.1, z=3.15, color="white", bevel=0.14, seg=3)
    a.box(3.8, 0.34, 2.6, x=1.7, y=-3.72, z=3.35, color="wood", bevel=0.04, seg=2)
    a.box(3.3, 0.06, 2.2, x=1.7, y=-3.9, z=3.55, color="glass2", bevel=0.02)
    a.box(0.06, 0.08, 2.2, x=1.7, y=-3.92, z=3.55, color="white")
    a.box(3.9, 2.6, 0.04, x=1.7, y=-2.55, z=3.11, color="wood")
    a.box(3.3, 0.04, 0.04, x=1.7, y=-3.9, z=3.43, color="glow", flag=GLOW)
    a.box(0.5, 0.04, 0.04, x=-0.25, y=-1.47, z=2.5, color="glow", flag=GLOW)
    a.box(0.06, 4.0, 1.2, x=3.72, y=0.4, z=4.4, color="glass2", bevel=0.02)
    a.box(0.06, 2.4, 1.2, x=-0.32, y=0.8, z=4.4, color="glass2", bevel=0.02)
    a.box(2.6, 0.06, 1.4, x=1.7, y=3.62, z=4.2, color="glass2", bevel=0.02)
    a.box(2.6, 0.06, 2.4, x=-2.4, y=3.42, z=0.35, color="glass2", bevel=0.02)
    a.box(1.2, 0.06, 1.0, x=1.8, y=3.62, z=1.4, color="glass2", bevel=0.02)
    a.box(0.06, 1.2, 2.2, x=3.32, y=2.3, z=0.15, color="wood", bevel=0.02)
    # deck under the cantilever, a planter on its edge
    a.box(4.2, 2.5, 0.12, x=1.7, y=-2.65, z=0.15, color="wood", bevel=0.03)
    a.box(1.6, 0.6, 0.45, x=-2.6, y=-2.6, z=0.15, color="white", bevel=0.06, seg=2)
    _shrubs(a, [(-3.1, -2.6), (-2.1, -2.6)], 0.6, 0.27)
    # solar on the bar
    _solar_row(a, [0.9, 2.5], -1.8, 6.15, w=1.4, d=1.5)
    _solar_row(a, [0.9, 2.5], 0.3, 6.15, w=1.4, d=1.5)
    _solar_row(a, [0.9, 2.5], 2.4, 6.15, w=1.4, d=1.5)
    return a


# -- landscape ------------------------------------------------------------------------------------
POND_WOB = [(0.06, 2, 0.6), (0.045, 3, 1.1), (0.025, 5, 2.0)]


def pond():
    """A shallow pond: an organic water surface in a thin white rim, lily pads with two white blooms, a
    short wood boardwalk on a white frame, two stepping stones, small lights in the rim. 9.9 by 6.3,
    0.29 tall."""
    a = Asset("pond", 211)
    n = 40
    inner = _blob(4.4, 2.9, n, POND_WOB)
    outer = [(x * (1 + 0.3 / 4.4 * 1.2), y * (1 + 0.3 / 2.9)) for x, y in _blob(4.4, 2.9, n, POND_WOB)]
    under = [(x * 1.02, y * 1.02) for x, y in inner]
    a.slab(under, 0.07, "water", z=0.0)
    for i in range(n):
        j = (i + 1) % n
        a.slab([inner[i], inner[j], outer[j], outer[i]], 0.14, "white")
    for i in (5, 15, 26, 35):
        x, y = [(p + q) / 2 for p, q in zip(inner[i], outer[i])]
        a.box(0.2, 0.2, 0.012, x=x, y=y, z=0.14, color="glow", flag=GLOW, rot=math.atan2(y, x))
    # lily pads
    for k, (x, y, r) in enumerate(((-1.6, 0.9, 0.42), (-1.0, 1.5, 0.3), (-2.4, 0.2, 0.34), (1.9, -0.9, 0.38), (2.5, -0.3, 0.28), (0.4, 1.7, 0.33))):
        _lily(a, x, y, 0.07, r, "leaf2" if k % 2 else "leaf", notch=k * 1.3)
    for x, y in ((-1.55, 0.95), (1.95, -0.85)):
        a.cyl(0.12, 0.05, 0.1, 6, x=x, y=y, z=0.095, color="white")
        a.cyl(0.04, 0.04, 0.06, 6, x=x, y=y, z=0.12, color="amber")
    # boardwalk from the front-left rim into the water
    bx, by = -2.7, -1.9
    a.box(1.4, 2.4, 0.2, x=bx, y=by, z=0.04, color="white", bevel=0.04, seg=2, rot=0.35)
    for i in range(6):
        t = -1.0 + i * 0.4
        a.box(1.28, 0.34, 0.05, x=bx - math.sin(0.35) * t, y=by + math.cos(0.35) * t, z=0.24, color="wood", rot=0.35, bevel=0.01)
    # stepping stones on the right
    for x, y, r in ((3.55, 0.7, 0.42), (2.75, 1.2, 0.36)):
        a.cyl(r, r - 0.04, 0.16, 12, x=x, y=y, z=0.0, color="stone", smooth=False)
    return a


def sports_court():
    """A small court: a blue playing surface with white lines (raised strips), a low white curb with a
    light line inside it, and a minimal white goal frame at each end. 17.6 by 10."""
    a = Asset("sports_court", 213)
    L, W = 16.8, 9.2
    a.box(L, W, 0.08, color="court")
    for sy in (-1, 1):
        a.box(L + 0.8, 0.4, 0.22, y=sy * (W / 2 + 0.2), color="white", bevel=0.06, seg=2)
        a.box(L, 0.04, 0.02, y=sy * (W / 2 - 0.03), z=0.08, color=ACCENT_GLOW, flag=GLOW)
    for sx in (-1, 1):
        a.box(0.4, W, 0.22, x=sx * (L / 2 + 0.2), color="white", bevel=0.06, seg=2)
        a.box(0.04, W, 0.02, x=sx * (L / 2 - 0.03), z=0.08, color=ACCENT_GLOW, flag=GLOW)
    # lines
    lw, lz, lh = 0.09, 0.08, 0.012
    bl, bw = 15.0, 8.0
    for sy in (-1, 1):
        a.box(bl + lw, lw, lh, y=sy * bw / 2, z=lz, color="white")
    for sx in (-1, 1):
        a.box(lw, bw, lh, x=sx * bl / 2, z=lz, color="white")
        # goal area
        a.box(lw, 4.4, lh, x=sx * (bl / 2 - 1.8), z=lz, color="white")
        for sy in (-1, 1):
            a.box(1.8, lw, lh, x=sx * (bl / 2 - 0.9), y=sy * 2.2, z=lz, color="white")
        a.cyl(0.12, 0.12, lh, 10, x=sx * (bl / 2 - 3.0), z=lz, color="white")
    a.box(lw, bw, lh, z=lz, color="white")
    a.ring(1.45, 1.45 + lw, lz, "white", seg=40, h=lh)
    a.cyl(0.12, 0.12, lh, 10, z=lz, color="white")
    # goals: 3 wide, 2 tall, 0.9 deep, behind the end lines
    for sx in (-1, 1):
        gx = sx * bl / 2
        bx = sx * (bl / 2 + 0.9)
        for sy in (-1, 1):
            a.box(0.12, 0.12, 2.0, x=gx, y=sy * 1.5, z=0.08, color="white", bevel=0.03, seg=2)
            a.bar((gx, sy * 1.5, 1.98), (bx, sy * 1.5, 0.14), 0.07, 0.07, "white")
            a.bar((bx, sy * 1.5, 0.12), (gx, sy * 1.5, 0.12), 0.07, 0.07, "white")
        a.box(0.12, 3.12, 0.12, x=gx, z=1.96, color="white", bevel=0.03, seg=2)
        a.box(0.07, 3.0, 0.07, x=bx, z=0.085, color="white")
        a.box(0.05, 2.9, 0.03, x=gx - sx * 0.065, z=1.99, color=ACCENT_GLOW, flag=GLOW)
        # a sparse net on the back
        for k in range(1, 5):
            y = -1.5 + k * 0.6
            a.bar((gx, y, 1.98), (bx, y, 0.14), 0.025, 0.025, "pearl")
    return a


def playground():
    """A playground on a round soft-rubber mat (white edge, a light ring): a geodesic climbing dome of
    white bars, a slide tower with panels and a chute in the district color, a low balance beam and
    three stepping pods. 9.4 across."""
    a = Asset("playground", 217)
    R = 4.5
    a.cyl(R + 0.15, R + 0.2, 0.1, 40, color="white")
    a.ring(R + 0.02, R + 0.1, 0.101, ACCENT_GLOW, seg=40, h=0.025, flag=GLOW)
    a.cyl(R, R, 0.12, 40, color="rubber")
    # geodesic dome
    dx, dy, dr = -1.6, 1.2, 1.75
    for p, q in _geodesic_edges():
        a.bar((dx + p.x * dr, dy + p.y * dr, 0.16 + p.z * dr), (dx + q.x * dr, dy + q.y * dr, 0.16 + q.z * dr), 0.08, 0.08, "white")
    a.cyl(0.35, 0.35, 0.05, 12, x=dx, y=dy, z=0.12, color=ACCENT_TINT)
    # slide tower: deck at 1.5 on four posts, panels, a canopy, steps at the back
    tx, ty = 2.0, 1.1
    for sx in (-1, 1):
        for sy in (-1, 1):
            a.box(0.14, 0.14, 2.55, x=tx + sx * 0.62, y=ty + sy * 0.62, z=0.12, color="white")
    a.box(1.45, 1.45, 0.16, x=tx, y=ty, z=1.42, color="white", bevel=0.05, seg=2)
    a.box(0.06, 1.24, 0.62, x=tx + 0.66, y=ty, z=1.58, color=ACCENT, bevel=0.02)
    a.box(0.06, 1.24, 0.62, x=tx - 0.66, y=ty, z=1.58, color=ACCENT, bevel=0.02)
    a.box(1.6, 1.6, 0.12, x=tx, y=ty, z=2.67, color="white", bevel=0.05, seg=2)
    a.box(1.5, 1.5, 0.03, x=tx, y=ty, z=2.65, color=ACCENT_GLOW, flag=GLOW)
    for i in range(4):
        a.box(1.0, 0.36, 0.3 + i * 0.3, x=tx, y=ty + 0.9 + (3 - i) * 0.36, z=0.12, color="white" if i % 2 else "pearl", bevel=0.03)
    # chute: from the deck's front edge (y ty-0.72, z 1.5) down to (y -2.3, z 0.38)
    y_hi, z_hi, y_lo, z_lo = ty - 0.72, 1.5, -2.2, 0.4
    ln = math.hypot(y_hi - y_lo, z_hi - z_lo)
    ang = math.atan2(z_hi - z_lo, y_hi - y_lo)
    cy, cz = (y_hi + y_lo) / 2, (z_hi + z_lo) / 2
    a.box(0.72, ln, 0.07, x=tx, y=cy, z=cz - 0.035, color=ACCENT, tilt=(ang, 0), bevel=0.02)
    for sx in (-1, 1):
        a.box(0.07, ln, 0.26, x=tx + sx * 0.38, y=cy, z=cz - 0.06, color="white", tilt=(ang, 0), bevel=0.02)
    a.box(0.72, 0.55, 0.07, x=tx, y=y_lo - 0.25, z=z_lo - 0.035, color=ACCENT, bevel=0.02)
    for sx in (-1, 1):
        a.box(0.07, 0.55, 0.26, x=tx + sx * 0.38, y=y_lo - 0.25, z=z_lo - 0.06, color="white", bevel=0.02)
        a.box(0.1, 0.1, z_lo - 0.12, x=tx + sx * 0.38, y=y_lo - 0.45, z=0.12, color="white")
    # balance beam
    bx, by, br = -1.7, -2.3, 0.3
    a.box(3.2, 0.16, 0.1, x=bx, y=by, z=0.36, color="wood", rot=br, bevel=0.02)
    for t in (-1.3, 1.3):
        a.box(0.22, 0.44, 0.24, x=bx + math.cos(br) * t, y=by + math.sin(br) * t, z=0.12, color="white", rot=br, bevel=0.05, seg=2)
    # stepping pods
    for k, (x, y, h) in enumerate(((0.2, -0.7, 0.22), (0.75, -1.35, 0.32), (0.0, -1.75, 0.42))):
        a.cyl(0.28, 0.3, h, 16, x=x, y=y, z=0.12, color="white")
        a.cyl(0.24, 0.24, 0.03, 16, x=x, y=y, z=0.12 + h, color=ACCENT if k == 1 else ACCENT_TINT)
    return a


def picnic_set():
    """A picnic table with benches: a white frame, wood top and seats, a slim white umbrella with an
    accent trim. 2.6 across, 2.5 tall."""
    a = Asset("picnic_set", 219)
    a.box(1.9, 0.82, 0.06, z=0.72, color="wood", bevel=0.02)
    for sy in (-1, 1):
        a.box(1.9, 0.32, 0.05, y=sy * 0.74, z=0.42, color="wood", bevel=0.02)
    for sx in (-1, 1):
        x = sx * 0.72
        a.box(0.08, 1.86, 0.07, x=x, z=0.35, color="white", bevel=0.02)
        a.box(0.08, 0.7, 0.06, x=x, z=0.66, color="white", bevel=0.02)
        for sy in (-1, 1):
            a.bar((x, sy * 0.6, 0.0), (x, sy * 0.26, 0.69), 0.08, 0.08, "white")
    a.cyl(0.035, 0.035, 2.3, 8, color="white")
    a.cyl(1.3, 0.06, 0.34, 12, z=2.08, color="white")
    a.cyl(1.31, 1.31, 0.05, 12, z=2.05, color=ACCENT)
    a.cyl(0.06, 0.03, 0.12, 8, z=2.42, color="white")
    a.cyl(0.08, 0.08, 0.025, 8, z=0.0, color="concrete")
    return a


def _lump(a, rx, ry, rz, x=0.0, y=0.0, z=0.0, rot=0.0, sub=3, jit=0.05):
    """An ellipsoid stone (radii rx, ry, rz), its middle at z; whatever dips below the ground is
    flattened onto it, so the stone sits on a flat base."""
    b = Asset("lump", a.rng.randrange(1 << 30))
    b.ball(1.0, color="stone", sub=sub, smooth=True, jit=jit)
    m = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, "Z") @ Matrix.Diagonal((rx, ry, rz, 1.0))
    b.V = [m @ v for v in b.V]
    for v in b.V:
        v.z = max(v.z, 0.0)
    a.merge(b)


def stone_a():
    """A smooth landscape stone, low and long, with a small one leaning on it. 2.2 by 1.4, 0.65 tall."""
    a = Asset("stone_a", 223)
    _lump(a, 0.96, 0.6, 0.66, x=-0.14, z=-0.04, rot=0.12)
    _lump(a, 0.42, 0.36, 0.4, x=0.66, y=-0.26, z=-0.04, rot=-0.4, sub=2)
    return a


def stone_b():
    """A smaller smooth landscape stone. 1.4 by 1.0, 0.5 tall."""
    a = Asset("stone_b", 227)
    _lump(a, 0.68, 0.48, 0.56, z=-0.06, rot=-0.25)
    return a


def palm():
    """A beach palm: a smooth, slightly curved trunk of stacked tapering segments, a full crown of
    folded two-tone fronds in two tiers that sway, three coconuts. 8 tall."""
    a = Asset("palm", 229)
    H, lean, n = 7.0, 0.85, 6
    pt = lambda t: Vector((lean * t * t, 0.0, H * t))
    rad = lambda t: 0.27 - 0.11 * t
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        p0, p1 = pt(t0), pt(t1)
        d = p1 - p0
        th = math.atan2(d.x, d.z)
        a.cyl(rad(t0) * 0.84, rad(t0), d.length + 0.03, 8, x=p0.x, y=p0.y, z=p0.z, color="trunk", smooth=True, axis=Matrix.Rotation(th, 4, "Y"))
    top = pt(1.0)
    a.cyl(0.2, 0.13, 0.3, 8, x=top.x, z=top.z - 0.05, color="trunk", smooth=True)
    for ang in (0.6, 2.7, 4.6):
        a.ball(0.17, top.x + math.cos(ang) * 0.2, math.sin(ang) * 0.2, top.z - 0.2, color="wood", sub=1, smooth=True)
    nf = 9
    ss = (0.0, 0.3, 0.68, 1.0)
    ws = (0.14, 0.96, 0.8, 0.0)
    for k in range(nf):
        az = k / nf * math.tau + a.rng.uniform(-0.05, 0.05)
        upper = k % 2 == 0
        L = (2.9 if upper else 3.3) + a.rng.uniform(-0.1, 0.1)
        rise = 0.62 if upper else 0.3
        droop = (0.92 if upper else 0.8) + a.rng.uniform(0.0, 0.06)
        dirv = Vector((math.cos(az), math.sin(az), 0.0))
        side = Vector((-math.sin(az), math.cos(az), 0.0))
        rib = [top + Vector((0, 0, 0.14)) + dirv * (L * s) + Vector((0, 0, L * (rise * s - droop * s * s))) for s in ss]
        for sgn, col in ((1, "leaf"), (-1, "leaf2")):
            edge = [rib[i] + side * (sgn * ws[i] / 2) + Vector((0, 0, ws[i] * 0.2)) for i in range(4)]
            a.plate([rib[0], edge[0], edge[1], rib[1]], 0.03, col, flag=1.0)
            a.plate([rib[1], edge[1], edge[2], rib[2]], 0.03, col, flag=1.0)
            a.plate([rib[2], edge[2], rib[3]], 0.03, col, flag=1.0)
    return a


# -- transit --------------------------------------------------------------------------------------
def shuttle():
    """The campus shuttle: an autonomous pod with a rounded white body, a wrap-around glass band over a
    thin light line, a light strip on a graphite face at front and back, an accent stripe low on each
    side, a glazed door on its right (-X), a solar roof with a lidar puck, four small dark wheels.
    4.4 long (front at -Y), 2 wide, 2.6 tall; origin at its middle on the ground."""
    a = Asset("shuttle", 233)
    W, D, r = 2.0, 4.4, 0.34
    z0, z1 = 0.26, 2.52
    # wheels (mostly inside the body's skirt) and the dark underbody
    for sx in (-1, 1):
        for sy in (-1, 1):
            spin = Matrix.Rotation(sx * math.pi / 2, 4, "Y")
            a.cyl(0.3, 0.3, 0.22, 14, x=sx * 0.87, y=sy * 1.45, z=0.3, color="graphite", axis=spin @ Matrix.Translation((0, 0, -0.11)))
            a.cyl(0.15, 0.15, 0.02, 10, x=sx * 0.98, y=sy * 1.45, z=0.3, color="steel", axis=spin)
    a.box(1.6, 3.6, 0.2, z=0.14, color="graphite", bevel=0.06, seg=2)
    # body
    a.box(W, D, z1 - z0, z=z0, color="white", bevel=r, seg=3)
    # the glass band (a rounded-rectangle slab flush with the body's sides), a light line under it
    a.slab(_round_rect(W + 0.016, D + 0.016, r + 0.008, 3), 0.98, "glass", z=1.2)
    a.slab(_round_rect(W + 0.03, D + 0.03, r + 0.015, 3), 0.04, "glow", z=1.16, flag=GLOW)
    # door on the right (-X): glass down to the step, white seams
    a.box(0.03, 1.1, 0.6, x=-W / 2 - 0.005, y=0.15, z=0.58, color="glass2")
    for y in (-0.42, 0.72):
        a.box(0.035, 0.03, 1.6, x=-W / 2 - 0.012, y=y, z=0.58, color="white")
    # faces: graphite panel with a light strip, front and back
    for sy in (-1, 1):
        y = sy * (D / 2 + 0.01)
        a.box(1.12, 0.04, 0.34, y=y, z=0.74, color="graphite", bevel=0.03, seg=2)
        a.box(0.92, 0.06, 0.06, y=y + sy * 0.005, z=0.88, color="glow", flag=GLOW)
    # accent stripes low on the sides
    a.box(0.03, 3.5, 0.12, x=W / 2 + 0.005, z=0.78, color=ACCENT)
    for y0, y1 in ((-1.75, -0.45), (0.75, 1.75)):  # the right side's stripe stops at the door
        a.box(0.03, y1 - y0, 0.12, x=-W / 2 - 0.005, y=(y0 + y1) / 2, z=0.78, color=ACCENT)
    # solar roof, lidar puck near the front
    a.box(1.2, 3.5, 0.03, z=z1, color="solar", bevel=0.01)
    a.cyl(0.15, 0.13, 0.07, 14, y=-1.85, z=z1 - 0.01, color="graphite")
    a.ring(0.11, 0.15, z1 + 0.06, ACCENT_GLOW, seg=14, h=0.02, flag=GLOW)
    return a


ASSETS = {
    "house_a": house_a,
    "house_b": house_b,
    "house_c": house_c,
    "pond": pond,
    "sports_court": sports_court,
    "playground": playground,
    "picnic_set": picnic_set,
    "stone_a": stone_a,
    "stone_b": stone_b,
    "palm": palm,
    "shuttle": shuttle,
}
