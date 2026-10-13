"""The founding plaza at the island's center and the wayfinding round it: the monument, the sponsor
pylons, the arrival's Walking times display, the road-mouth signposts, the ring street's kiosks, the
frame of the Nexus portal, round planters and long benches.

Same language as campus.py: white bodies with rounded edges, glass, graphite screens, thin light lines
(the plaza's accent through kit.ACCENT*, neutral white light through "glow").
"""
import math

from kit import ACCENT, ACCENT_GLOW, GLOW, Asset
from mathutils import Matrix, Vector

# -- helpers: shapes the kit has no part for, built from its plates and rings ---------------------


def _rrect(w, d, r, seg=3):
    """A rounded rectangle's outline, w by d, corner radius r, counterclockwise seen from above."""
    hx, hy = w / 2 - r, d / 2 - r
    pts = []
    for k, (cx, cy) in enumerate(((hx, -hy), (hx, hy), (-hx, hy), (-hx, -hy))):
        a0 = -math.pi / 2 + k * math.pi / 2
        for i in range(seg + 1):
            t = a0 + i / seg * math.pi / 2
            pts.append((cx + r * math.cos(t), cy + r * math.sin(t)))
    return pts


def _rsq(w, r, seg=3):
    """A rounded square's outline, w across, corner radius r."""
    return _rrect(w, w, r, seg)


def _band(a, w, d, r, h, z, color, flag=0.0):
    """A thin band round a box with rounded edges (its corners follow the box's bevel)."""
    a.slab(_rrect(w, d, r), h, color, z=z, flag=flag)


def _loft(a, lo, z0, hi, z1, color, flag=0.0, t=0.03):
    """The side walls between two outlines with the same number of points (a tapered prism): one
    plate per side, thickened inward so neighbors meet edge to edge."""
    n = len(lo)
    for i in range(n):
        j = (i + 1) % n
        a.plate([(hi[i][0], hi[i][1], z1), (hi[j][0], hi[j][1], z1), (lo[j][0], lo[j][1], z0), (lo[i][0], lo[i][1], z0)], t, color, flag=flag)


def _spire(a, base, z0, z1, color, flag=0.0, t=0.012):
    """A pyramid over an outline at z0, its apex at z1."""
    n = len(base)
    for i in range(n):
        j = (i + 1) % n
        a.plate([(0, 0, z1), (base[j][0], base[j][1], z0), (base[i][0], base[i][1], z0)], t, color, flag=flag)


def _hoop(a, r_in, r_out, depth, cz, color, y=0.0, seg=56, flag=0.0):
    """A ring standing upright in the x-z plane (its face toward -y), centered at height cz:
    a kit ring turned on its edge."""
    b = Asset("hoop")
    b.ring(r_in, r_out, -depth / 2, color, seg=seg, h=depth, flag=flag)
    a.merge(b, Matrix.Translation((0, y, cz)) @ Matrix.Rotation(math.pi / 2, 4, "X"))


# -- the plaza --------------------------------------------------------------------------------------


def monument():
    """The plaza's centerpiece: a slender white obelisk with softly rounded edges on a low two-step
    white plinth and a pedestal, a seam of light up its front and back, a lit cap. The organization's
    name goes on the pedestal's front (anchor plaque), at the walker's eye line. 7.9 tall."""
    a = Asset("monument", 211)
    # the plinth: two low steps, a light line where the pedestal meets them
    a.box(4.8, 4.8, 0.4, color="pearl", bevel=0.08, seg=2)
    a.box(3.6, 3.6, 0.4, z=0.4, color="white", bevel=0.08, seg=2)
    _band(a, 2.98, 2.98, 0.16, 0.05, 0.79, ACCENT_GLOW, flag=GLOW)
    # the pedestal, with the plaque on its front face
    a.box(2.9, 2.9, 0.95, z=0.8, color="white", bevel=0.12, seg=3)
    a.box(2.72, 0.03, 0.64, y=-1.461, z=0.97, color="screen", bevel=0.03, seg=2)
    a.anchor("plaque", 0, -1.478, 1.29, 2.6, 0.55, facing=0.0)
    # the shaft: a rounded square tapering from 1.35 to 0.78 across
    z0, z1, w0, w1 = 1.75, 7.06, 1.35, 0.78
    lo, hi = _rsq(w0, 0.14), _rsq(w1, 0.08)
    _loft(a, lo, z0, hi, z1, "white")
    a.box(w0 + 0.12, w0 + 0.12, 0.08, z=z0, color="white", bevel=0.04, seg=2)
    # the seams of light up the front and the back
    for s in (-1, 1):
        a.bar((0, s * (w0 / 2 + 0.005), z0 + 0.25), (0, s * (w1 / 2 + 0.005), z1 - 0.1), 0.07, 0.05, ACCENT_GLOW, flag=GLOW)
    # the lit cap: a light collar and a glowing pyramidion
    collar = _rsq(w1 + 0.05, 0.1)
    _loft(a, collar, z1 - 0.1, collar, z1, ACCENT_GLOW, flag=GLOW)
    _spire(a, _rsq(w1 + 0.02, 0.09), z1, 7.9, "glow", flag=GLOW)
    return a


def hub_pylon():
    """A sponsor pylon behind the monument: a slim white column with a glass inset, a glowing block
    at its top under a white cap, on a small round base. 4.3 tall."""
    a = Asset("hub_pylon", 213)
    a.cyl(0.5, 0.54, 0.12, 24, color="concrete")
    a.box(0.62, 0.62, 3.56, z=0.12, color="white", bevel=0.12, seg=3)
    a.box(0.34, 0.66, 2.3, z=0.75, color="glass2", bevel=0.03, seg=2)
    a.box(0.5, 0.5, 0.44, z=3.66, color="glow", flag=GLOW)
    a.box(0.72, 0.72, 0.2, z=4.1, color="white", bevel=0.06, seg=2)
    return a


def info_display():
    """The arrival's Walking times board as a digital display: a white frame on two slim legs, a large
    graphite screen tilted back 10 degrees (anchor screen: the engine paints the walking times there),
    a light line under it."""
    a = Asset("info_display", 217)
    tilt = -math.radians(10)
    R = Matrix.Rotation(tilt, 4, "X")
    P = Vector((0, 0, 0.58))  # the frame's pivot: the middle of its bottom edge

    def at(x, y, z):
        return P + R @ Vector((x, y, z))

    a.box(4.3, 1.0, 0.1, y=0.1, color="concrete", bevel=0.03, seg=1)
    for sx in (-1, 1):  # legs, leaning with the frame, behind it
        f = at(sx * 1.45, 0.18, -0.456)
        a.box(0.2, 0.2, 2.1, x=f.x, y=f.y, z=f.z, color="white", tilt=(tilt, 0), bevel=0.05, seg=2)
    a.box(3.86, 0.16, 1.98, x=P.x, y=P.y, z=P.z, color="white", tilt=(tilt, 0), bevel=0.08, seg=3)
    s = at(0, -0.087, 0.14)
    a.box(3.6, 0.03, 1.7, x=s.x, y=s.y, z=s.z, color="screen", tilt=(tilt, 0), bevel=0.03, seg=2)
    g = at(0, -0.087, 0.055)
    a.box(3.2, 0.03, 0.04, x=g.x, y=g.y, z=g.z, color=ACCENT_GLOW, tilt=(tilt, 0), flag=GLOW)
    c = at(0, -0.103, 0.14 + 0.85)
    a.anchor("screen", c.x, c.y, c.z, 3.5, 1.6, facing=0.0)
    return a


def signpost():
    """A road-mouth sign: a slim white post with a display blade pointing +x (Blender), an angled tip,
    an accent top edge and a lit underline. The road's name and walking time go on the blade's front
    (anchor blade); its back has a screen too (anchor blade_back), for a sign turned round to point
    the other way. 2.7 tall."""
    a = Asset("signpost", 219)
    a.cyl(0.26, 0.29, 0.08, 20, color="concrete")
    a.box(0.16, 0.16, 2.56, z=0.08, color="white", bevel=0.05, seg=2)
    a.box(0.2, 0.2, 0.06, z=2.64, color="white", bevel=0.02)
    a.box(0.17, 0.17, 0.04, z=2.61, color=ACCENT_GLOW, flag=GLOW)
    zb, h, d = 1.875, 0.45, 0.12
    L = 1.58
    a.box(L, d, h, x=L / 2, z=zb, color="white", bevel=0.04, seg=2)
    s = h / math.sqrt(2)  # the tip: a square turned 45 degrees, half of it past the blade's end
    cx, cz = L, zb + h / 2
    off = Matrix.Rotation(math.pi / 4, 3, "Y") @ Vector((0, 0, s / 2))
    a.box(s, d, s, x=cx - off.x, z=cz - off.z, color=ACCENT, tilt=(0, math.pi / 4), bevel=0.03, seg=2)
    a.box(L - 0.08, d + 0.01, 0.05, x=L / 2 - 0.02, z=zb + h - 0.05, color=ACCENT)
    for side in (-1, 1):
        a.box(1.32, 0.02, 0.27, x=0.76, y=side * (d / 2 + 0.005), z=zb + 0.1, color="screen", bevel=0.01)
    a.box(L - 0.1, d + 0.02, 0.035, x=L / 2, z=zb - 0.01, color=ACCENT_GLOW, flag=GLOW)
    a.anchor("blade", 0.76, -d / 2 - 0.016, zb + 0.235, 1.26, 0.24, facing=0.0)
    a.anchor("blade_back", 0.76, d / 2 + 0.016, zb + 0.235, 1.26, 0.24, facing=math.pi)
    return a


def kiosk():
    """A kiosk on the ring street: a small rounded white pod with a glass serving front under a slim
    canopy, a counter, a small screen above the canopy (anchor screen) and a band in the accent color
    round its foot. 2.8 by 2.0, 2.7 tall."""
    a = Asset("kiosk", 223)
    a.box(2.8, 2.0, 0.1, color="concrete", bevel=0.03)
    a.box(2.7, 1.9, 2.6, z=0.1, color="white", bevel=0.16, seg=3)
    _band(a, 2.74, 1.94, 0.18, 0.14, 0.36, ACCENT)
    _band(a, 2.73, 1.93, 0.175, 0.035, 2.49, ACCENT_GLOW, flag=GLOW)
    # the serving front: glass lit along its top, a counter with a light line under it, a canopy
    a.box(2.2, 0.06, 0.92, y=-0.94, z=1.04, color="glass2", bevel=0.03, seg=2)
    a.box(2.1, 0.07, 0.04, y=-0.945, z=1.9, color="glow", flag=GLOW)
    for x in (-0.36, 0.36):
        a.box(0.05, 0.08, 0.92, x=x, y=-0.95, z=1.04, color="white")
    a.box(2.36, 0.44, 0.07, y=-1.06, z=0.97, color="white", bevel=0.03, seg=2)
    a.box(2.2, 0.03, 0.035, y=-1.27, z=0.935, color=ACCENT_GLOW, flag=GLOW)
    a.box(2.5, 0.42, 0.08, y=-1.1, z=2.0, color="white", bevel=0.03, seg=2)
    a.box(2.3, 0.3, 0.03, y=-1.12, z=1.98, color=ACCENT_GLOW, flag=GLOW)
    a.box(1.3, 0.03, 0.32, y=-0.955, z=2.13, color="screen", bevel=0.02)
    a.anchor("screen", 0, -0.972, 2.29, 1.2, 0.26, facing=0.0)
    return a


PORTAL_R = 3.4  # mapLayout.ts PORTAL_R
PORTAL_CY = PORTAL_R + 0.24


def portal_frame():
    """The Nexus portal's frame (the engine keeps its curtain): a white ring standing on a long low
    base, held by two white posts at its sides, a line of light just inside the ring on both faces,
    a name plate above it (anchor plate: the word Nexus). The ring's inner edge clears a circle of
    radius 3.24 at 3.64 high; the walker walks through it."""
    a = Asset("portal_frame", 227)
    cy = PORTAL_CY
    a.box(8.6, 1.9, 0.32, color="white", bevel=0.1, seg=2)
    a.box(8.0, 1.3, 0.04, z=0.32, color="paving2")
    # the ring: a wide band and a thinner, deeper one inside it round its middle (a softened edge)
    _hoop(a, 3.25, 3.56, 0.34, cy, "white")
    _hoop(a, 3.28, 3.525, 0.46, cy, "white")
    # the light just inside the ring, front and back
    for s in (-1, 1):
        _hoop(a, 3.25, 3.295, 0.06, cy, "glow", y=s * 0.215, flag=GLOW)
    # posts at its sides, a clamp to the ring at its widest point, a line of light up their inner edge
    for sx in (-1, 1):
        x = sx * 3.84
        a.box(0.46, 0.56, 3.62, x=x, z=0.32, color="white", bevel=0.12, seg=3)
        a.box(0.4, 0.4, 0.5, x=sx * 3.6, z=cy - 0.25, color="white", bevel=0.06, seg=2)
        a.box(0.05, 0.58, 2.7, x=x - sx * 0.19, z=0.6, color="glow", flag=GLOW)
    # the name plate on the ring's crown
    top = cy + 3.56
    a.box(2.6, 0.24, 0.9, z=top - 0.1, color="white", bevel=0.08, seg=3)
    a.box(2.34, 0.03, 0.66, y=-0.125, z=top + 0.02, color="screen", bevel=0.02)
    a.box(1.9, 0.03, 0.035, y=-0.13, z=top - 0.02, color="glow", flag=GLOW)
    a.anchor("plate", 0, -0.142, top + 0.35, 2.2, 0.6, facing=0.0)
    return a


def planter_round():
    """A round white planter with a lawn top, a small campus tree and two low shrubs. 1.4 radius,
    4 tall."""
    a = Asset("planter_round", 229)
    a.cyl(1.3, 1.4, 0.5, 24, color="white")
    a.cyl(1.4, 1.34, 0.07, 24, z=0.5, color="white")
    a.cyl(1.26, 1.26, 0.02, 24, z=0.565, color="lawn")
    a.cyl(0.13, 0.09, 1.75, 10, z=0.57, color="trunk", smooth=True)
    a.ball(1.1, 0, 0, 3.0, color="leaf2", sub=3, squash=1.0, smooth=True, flag=1.0)
    for k, ang in enumerate((0.5, 2.9)):
        a.ball(0.34 + a.rng.uniform(-0.03, 0.03), math.cos(ang) * 0.78, math.sin(ang) * 0.78, 0.72, color="leaf" if k else "leaf2", sub=2, squash=0.8, smooth=True, flag=0.6)
    return a


def plaza_bench():
    """A long plaza bench: a white rounded base, a warm wood seat and a slim wood backrest on two white
    uprights. 3.2 long."""
    a = Asset("plaza_bench", 231)
    a.box(3.2, 0.62, 0.4, color="white", bevel=0.09, seg=3)
    a.box(3.1, 0.52, 0.06, z=0.4, color="wood", bevel=0.02)
    for sx in (-1, 1):
        a.box(0.08, 0.1, 0.62, x=sx * 1.2, y=0.27, z=0.36, color="white", tilt=(-0.12, 0), bevel=0.03, seg=2)
    a.box(3.0, 0.06, 0.26, y=0.33, z=0.66, color="wood", tilt=(-0.12, 0), bevel=0.02)
    return a


ASSETS = {
    "monument": monument,
    "hub_pylon": hub_pylon,
    "info_display": info_display,
    "signpost": signpost,
    "kiosk": kiosk,
    "portal_frame": portal_frame,
    "planter_round": planter_round,
    "plaza_bench": plaza_bench,
}
