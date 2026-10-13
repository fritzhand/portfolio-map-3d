"""Set pieces round the island's rim (src/island/pieces/kinds.ts), in the campus look: each kind of the
old set pieces translated into a clean white, glass and light-line version.

Frames: the origin is where the piece stands, on its ground; the front faces -Y (three.js +z): out to
sea for a coastal piece, toward the plaza for an inland one. Each piece keeps inside its kind's
footprint radius (FOOTPRINT, from kinds.ts; fit() is the last safeguard), except the marina's deck,
which reaches out to sea along its front as the old pier's did. Parts that settle on a slope (pad 0,
or round a pad's edge) reach below the ground. Moving parts are separate assets with their origin at
their pivot: the turbine's rotor, the observatory's dome, the marina's boat.
"""
import math

from kit import ACCENT, ACCENT_GLOW, ACCENT_TINT, GLOW, Asset
from mathutils import Matrix

FOOTPRINT = {
    "piece_beacon": 4.6,
    "piece_marina": 3.2,  # at its base: the deck reaches ~34 out to sea along the front
    "piece_beach": 8.0,
    "piece_cabanas": 13.0,
    "piece_boathouse": 7.0,
    "piece_turbine": 5.6,
    "piece_vertical_farm": 11.5,
    "piece_pods": 6.6,
    "piece_datacenter": 3.6,
    "piece_solar_field": 9.6,
    "piece_observatory": 5.6,
    "piece_greenhouse": 6.2,
}

# The turbine's hub and the observatory dome's seat, in Blender axes of their base pieces.
TURBINE_HUB = (0.0, -1.45, 15.9)
DOME_SEAT = 4.22
MARINA_DECK = 0.7  # the deck's top above the piece's ground
MARINA_LEN = 34.0


def _xf(cx, cy, rot):
    """Local (lx, ly) of a part turned by rot about (cx, cy), to the asset's x, y."""
    c, s = math.cos(rot), math.sin(rot)
    return lambda lx, ly: (cx + lx * c - ly * s, cy + lx * s + ly * c)


def _pad(a, r, h=0.3, depth=0.9, seg=40, glow=True):
    """A round concrete footing reaching below the ground, a lit ring at its edge, a paved top."""
    a.cyl(r, r + 0.12, h + depth, seg, z=-depth, color="concrete")
    if glow:
        a.ring(r + 0.02, r + 0.1, h + 0.001, ACCENT_GLOW, seg=seg, h=0.035, flag=GLOW)
    a.cyl(r - 0.3, r - 0.3, 0.05, seg, z=h, color="paving2")


def _hug(a, r0, r1, z0, h, za, zb, ang=-math.pi / 2, w=0.06, color=ACCENT_GLOW):
    """A light line up a tapered tower (radius r0 at z0 to r1 at z0 + h), from za to zb, at bearing ang."""
    rad = lambda z: r0 + (r1 - r0) * (z - z0) / h + 0.012
    c, s = math.cos(ang), math.sin(ang)
    a.bar((c * rad(za), s * rad(za), za), (c * rad(zb), s * rad(zb), zb), w, 0.04, color, flag=GLOW)


# ---------------------------------------------------------------------------------------------- coast

def beacon():
    """A coastal beacon: a slim white tower on a round entrance drum, a gallery with a glass rail, a
    glass lantern room with a lit lamp band, a lit ring under the gallery, a beacon on top. ~16.3 tall.
    Its door and light line face the land (+Y), its windows the sea."""
    a = Asset("piece_beacon", 201)
    _pad(a, 3.0, 0.3, 0.7, seg=32)
    a.cyl(2.25, 2.25, 2.9, 32, z=0.35, color="white", smooth=True)
    a.cyl(2.27, 2.27, 0.75, 32, z=1.75, color="glass", smooth=True)
    a.cyl(2.38, 2.38, 0.24, 32, z=3.25, color="white", smooth=True)
    a.cyl(2.3, 2.3, 0.05, 32, z=3.2, color=ACCENT_GLOW, flag=GLOW)
    # the entrance, toward the land
    a.box(2.0, 1.0, 2.75, y=2.1, z=0.35, color="white", bevel=0.12, seg=3)
    a.box(1.4, 1.05, 2.25, y=2.11, z=0.35, color="glass2")
    a.box(1.4, 1.06, 0.05, y=2.12, z=2.62, color=ACCENT_GLOW, flag=GLOW)
    # the tower
    z0, ht, r0, r1 = 3.45, 9.8, 1.18, 0.86
    a.cyl(r0, r1, ht, 32, z=z0, color="white", smooth=True)
    _hug(a, r0, r1, z0, ht, 3.7, 12.4, ang=math.pi / 2)
    for z in (5.4, 7.9, 10.4):  # slit windows to the sea
        rz = r0 + (r1 - r0) * (z + 0.5 - z0) / ht
        a.box(0.32, 0.3, 1.0, y=-rz + 0.08, z=z, color="glass2", bevel=0.03)
    a.cyl(0.9, 0.885, 0.42, 32, z=12.62, color=ACCENT, smooth=True)
    # the gallery: a deck with a lit ring under it and a glass rail
    a.cyl(1.9, 1.9, 0.28, 32, z=13.2, color="white", smooth=True)
    a.cyl(1.84, 1.84, 0.05, 32, z=13.15, color=ACCENT_GLOW, flag=GLOW)
    a.cyl(1.78, 1.78, 0.72, 32, z=13.48, color="glass", cap=False)
    a.ring(1.7, 1.86, 14.2, "white", seg=32, h=0.07)
    # the lantern room: glass, white mullions, the lamp's band of light
    a.cyl(1.12, 1.12, 0.3, 32, z=13.48, color="white", smooth=True)
    a.cyl(1.0, 1.0, 1.5, 32, z=13.78, color="glass")
    a.cyl(1.02, 1.02, 0.42, 32, z=14.3, color="glow", flag=GLOW)
    for k in range(8):
        ang = k / 8 * math.tau + math.pi / 8
        a.box(0.09, 0.09, 1.5, x=math.cos(ang) * 1.0, y=math.sin(ang) * 1.0, z=13.78, color="white", rot=ang)
    a.cyl(1.25, 0.32, 0.6, 32, z=15.28, color="white", smooth=True)
    a.cyl(0.2, 0.2, 0.18, 12, z=15.86, color="white")
    a.ball(0.17, 0, 0, 16.16, color="glow", sub=2, flag=GLOW)
    return a


def marina():
    """A marina pier: a white composite deck on slim white piles, reaching MARINA_LEN out to sea along
    the front, lit edge lines and marker posts, a T-head at its end with two lit beacons, a charging
    post for the boats, and a charging kiosk on a shore pad at the land end."""
    a = Asset("piece_marina", 203)
    L, top = MARINA_LEN, MARINA_DECK
    y0 = 1.0  # the deck starts a little inland of the origin
    mid = (y0 - L) / 2
    # the shore pad and the kiosk
    a.box(5.0, 1.8, 1.2, y=1.05, z=-0.55, color="concrete", bevel=0.05)
    a.box(4.7, 1.5, 0.03, y=1.05, z=0.65, color="paving2")
    # two steps up to it from the land, low enough for the walker to climb
    for k, h in enumerate((0.43, 0.22)):
        a.box(2.6, 0.45, h + 0.55, y=2.175 + k * 0.45, z=-0.55, color="concrete", bevel=0.04)
        a.box(2.4, 0.03, 0.03, y=2.41 + k * 0.45, z=h - 0.07, color=ACCENT_GLOW, flag=GLOW)
    kx, ky = 2.0, 1.15
    a.box(0.7, 0.5, 1.75, x=kx, y=ky, z=0.65, color="white", bevel=0.12, seg=3)
    a.box(0.5, 0.03, 0.62, x=kx, y=ky + 0.25, z=1.45, color="screen", bevel=0.02, seg=2)
    a.box(0.035, 0.52, 1.2, x=kx - 0.35, y=ky, z=0.85, color=ACCENT_GLOW, flag=GLOW)
    a.box(0.72, 0.52, 0.06, x=kx, y=ky, z=2.4, color=ACCENT, bevel=0.02)
    a.box(0.18, 0.14, 0.32, x=kx + 0.36, y=ky, z=1.15, color="graphite", bevel=0.04)
    # the deck: a composite surface between white edge beams, a light line along each edge
    a.box(3.0, y0 + L, 0.2, y=mid, z=top - 0.2, color="pearl")
    for sx in (-1, 1):
        a.box(0.2, y0 + L, 0.34, x=sx * 1.5, y=mid, z=top - 0.32, color="white", bevel=0.05, seg=2)
        a.box(0.03, y0 + L - 0.3, 0.05, x=sx * 1.615, y=mid, z=top - 0.22, color=ACCENT_GLOW, flag=GLOW)
    # the T-head
    th = -L + 2.0
    a.box(7.4, 4.0, 0.2, y=th, z=top - 0.2, color="pearl")
    for sx in (-1, 1):
        a.box(0.2, 4.0, 0.34, x=sx * 3.6, y=th, z=top - 0.32, color="white", bevel=0.05, seg=2)
        a.box(2.2, 0.2, 0.34, x=sx * 2.6, y=th + 1.9, z=top - 0.32, color="white", bevel=0.05, seg=2)
        a.box(0.03, 3.7, 0.05, x=sx * 3.715, y=th, z=top - 0.22, color=ACCENT_GLOW, flag=GLOW)
        # a lit beacon post at each seaward corner
        a.box(0.26, 0.26, 1.3, x=sx * 3.3, y=th - 1.6, z=top, color="white", bevel=0.06, seg=2)
        a.box(0.28, 0.28, 0.22, x=sx * 3.3, y=th - 1.6, z=top + 1.3, color="glow", flag=GLOW)
    a.box(7.4, 0.2, 0.34, y=th - 1.9, z=top - 0.32, color="white", bevel=0.05, seg=2)
    a.box(7.1, 0.03, 0.05, y=th - 2.015, z=top - 0.22, color=ACCENT_GLOW, flag=GLOW)
    # piles and cross beams
    rows = [y0 - 0.6 - i * 4.2 for i in range(9)]
    for yy in rows:
        a.box(3.2, 0.24, 0.24, y=yy, z=top - 0.56, color="pearl")
        for sx in (-1, 1):
            a.cyl(0.15, 0.15, 3.3 + top - 0.56, 10, x=sx * 1.3, y=yy, z=-3.3, color="white")
    for sx in (-1, 1):
        for yy in (th - 1.6, th + 1.6):
            a.cyl(0.15, 0.15, 3.3 + top - 0.56, 10, x=sx * 3.3, y=yy, z=-3.3, color="white")
        a.box(0.24, 3.6, 0.24, x=sx * 3.3, y=th, z=top - 0.56, color="pearl")
    # marker posts along the edges, lit at their tops
    for i in range(6):
        yy = -3.0 - i * 4.8
        for sx in (-1, 1):
            a.box(0.16, 0.16, 0.42, x=sx * 1.42, y=yy, z=top, color="white")
            a.box(0.17, 0.17, 0.07, x=sx * 1.42, y=yy, z=top + 0.42, color=ACCENT_GLOW, flag=GLOW)
    # the boats' charging post, by the first berth (starboard, three.js x +2.6, z 18)
    a.box(0.3, 0.3, 1.05, x=1.2, y=-18.0, z=top, color="white", bevel=0.08, seg=2)
    a.box(0.04, 0.31, 0.6, x=1.05, y=-18.0, z=top + 0.3, color=ACCENT_GLOW, flag=GLOW)
    a.box(0.32, 0.32, 0.06, x=1.2, y=-18.0, z=top + 1.05, color=ACCENT)
    return a


def marina_boat():
    """A small electric launch, 4.6 long: a white hull with a stripe in the district's color, a console
    with a windscreen, a bench at the stern, a slim canopy with a solar top, an electric pod at the
    stern. Its origin is the middle of its waterline; its bow toward -Y."""
    a = Asset("piece_marina_boat", 205)
    half = [(0.84, 2.25), (0.88, 1.0), (0.86, -0.4), (0.72, -1.3), (0.46, -1.92), (0.0, -2.32)]
    top = half + [(-x, y) for x, y in reversed(half[:-1])]
    zt, zb = 0.6, -0.32  # the gunwale and the keel
    bot = [(x * 0.6, y * 0.94 + (0.06 if y > 2 else 0.0)) for x, y in top]
    at = lambda f, k=1.0: [((b[0] + (t[0] - b[0]) * f) * k, b[1] + (t[1] - b[1]) * f, zb + (zt - zb) * f) for b, t in zip(bot, top)]
    n = len(top)
    lo, hi = at(0.0), at(1.0)
    s0, s1 = at(0.6, 1.015), at(0.7, 1.015)
    for i in range(n):  # the flared hull, a stripe in the district's color along it
        j = (i + 1) % n
        a.plate([lo[i], lo[j], hi[j], hi[i]], 0.05, "white")
        a.plate([s0[i], s0[j], s1[j], s1[i]], 0.02, ACCENT)
    a.slab([(x, y) for x, y, _ in lo], 0.06, "graphite", z=zb - 0.04)
    a.slab([(x, y) for x, y, _ in at(0.62, 0.97)], 0.05, "wood", z=zb + (zt - zb) * 0.62 - 0.05)
    a.slab([(x, y) for x, y in top if y < -0.6] + [(-0.83, -0.6), (0.83, -0.6)], 0.06, "white", z=zt - 0.04)
    a.slab([(x * 1.02, y + (0.02 if y > 2 else 0.0)) for x, y in top if y > 1.9] + [(-0.86, 1.9), (0.86, 1.9)], 0.06, "white", z=zt - 0.04)
    deck = zb + (zt - zb) * 0.62
    # the console and windscreen
    a.box(0.66, 0.5, 0.78, y=-0.2, z=deck, color="white", bevel=0.1, seg=2)
    a.box(0.46, 0.03, 0.2, y=-0.02, z=deck + 0.66, color="screen", tilt=(0.5, 0))
    a.box(0.78, 0.04, 0.34, y=-0.48, z=deck + 0.78, color="glass2", tilt=(-0.45, 0))
    # the stern bench
    a.box(1.3, 0.5, 0.42, y=1.6, z=deck, color="white", bevel=0.08, seg=2)
    a.box(1.3, 0.12, 0.36, y=1.9, z=deck + 0.42, color="white", bevel=0.05, seg=2, tilt=(0.2, 0))
    # the canopy on four slim posts, a solar top, a light line along its front
    for sx in (-1, 1):
        for yy in (0.15, 1.7):
            a.box(0.06, 0.06, 1.85 - deck, x=sx * 0.6, y=yy, z=deck, color="white")
    a.box(1.42, 1.9, 0.08, y=0.93, z=1.85, color="white", bevel=0.03, seg=2)
    a.box(1.22, 1.65, 0.03, y=0.93, z=1.93, color="solar")
    a.box(1.36, 0.03, 0.03, y=-0.03, z=1.85, color=ACCENT_GLOW, flag=GLOW)
    # the electric pod and the bow light
    a.box(0.3, 0.34, 0.6, y=2.33, z=-0.2, color="graphite", bevel=0.08, seg=2)
    a.box(0.31, 0.03, 0.08, y=2.15, z=0.25, color=ACCENT_GLOW, flag=GLOW)
    a.box(0.1, 0.1, 0.06, y=-2.05, z=zt + 0.02, color="glow", flag=GLOW)
    return a


def _lounger(a, x, y, towel=None):
    """A sun lounger, its feet toward -Y: white runners, a white seat and a raised backrest."""
    for sx in (-1, 1):
        a.box(0.06, 1.75, 0.28, x=x + sx * 0.27, y=y, color="white")
    a.box(0.7, 1.25, 0.1, x=x, y=y - 0.28, z=0.28, color="white", bevel=0.04, seg=2)
    a.box(0.7, 0.72, 0.1, x=x, y=y + 0.62, z=0.555, color="white", bevel=0.04, seg=2, tilt=(0.75, 0))
    if towel is not None:
        a.box(0.56, 1.0, 0.02, x=x, y=y - 0.3, z=0.38, color=towel)


def beach():
    """A beach club's corner of the sand: three slim white umbrellas, a pair of white loungers under
    each, towels on the sand in the district's colors, side tables, a beach shower with a light line."""
    a = Asset("piece_beach", 207)
    spots = [(-4.7, 0.9), (0.0, -0.5), (4.7, 0.9)]
    for k, (x, y) in enumerate(spots):
        a.cyl(0.26, 0.3, 0.08, 16, x=x, y=y + 0.2, color="pearl")
        a.cyl(0.045, 0.045, 2.35, 8, x=x, y=y + 0.2, z=0.08, color="white", smooth=True)
        a.cyl(1.6, 0.12, 0.42, 24, x=x, y=y + 0.2, z=2.32, color="white", smooth=True)
        a.cyl(1.62, 1.58, 0.06, 24, x=x, y=y + 0.2, z=2.29, color=ACCENT if k == 1 else "pearl")
        a.cyl(0.06, 0.02, 0.18, 8, x=x, y=y + 0.2, z=2.74, color="white")
        a.cyl(0.14, 0.14, 0.04, 12, x=x, y=y + 0.2, z=2.29, color="glow", flag=GLOW)  # a downlight
        for sx in (-1, 1):
            _lounger(a, x + sx * 0.62, y, towel=ACCENT if (k == 0 and sx == 1) else None)
        a.cyl(0.2, 0.2, 0.42, 14, x=x, y=y + 0.95, color="white", smooth=True)
        a.cyl(0.22, 0.22, 0.03, 14, x=x, y=y + 0.95, z=0.42, color="pearl")
    # towels on the sand toward the water
    a.box(0.9, 1.8, 0.025, x=-2.3, y=-1.9, color=ACCENT, rot=0.18)
    a.box(0.9, 1.8, 0.025, x=2.4, y=-2.3, color=ACCENT_TINT, rot=-0.12)
    a.box(0.9, 1.8, 0.025, x=3.4, y=-2.1, color="white", rot=-0.2)
    # two low lit bollards along the back of the sand
    for bx in (-2.35, 2.35):
        a.box(0.18, 0.18, 0.6, x=bx, y=2.6, color="white", bevel=0.05, seg=2)
        a.box(0.19, 0.19, 0.08, x=bx, y=2.6, z=0.48, color=ACCENT_GLOW, flag=GLOW)
    # the beach shower on a small deck
    sx, sy = 6.6, 2.6
    a.box(1.1, 1.1, 0.06, x=sx, y=sy, color="wood", bevel=0.02)
    a.box(0.18, 0.18, 2.5, x=sx + 0.35, y=sy + 0.35, z=0.06, color="white", bevel=0.05, seg=2)
    a.box(0.04, 0.19, 1.6, x=sx + 0.26, y=sy + 0.35, z=0.5, color=ACCENT_GLOW, flag=GLOW)
    a.box(0.7, 0.16, 0.1, x=sx + 0.06, y=sy + 0.35, z=2.46, color="white", bevel=0.04, rot=0.0)
    a.cyl(0.13, 0.13, 0.04, 12, x=sx - 0.2, y=sy + 0.35, z=2.43, color="steel")
    return a


def cabanas():
    """A row of five beach cabanas set back from the water on white decks (white frames, wood slat
    walls, glass or fabric fronts in the district's tint, a light line under each roof), and a white
    observation tower for the lifeguards at the end, with a glass rail, a wrap of windows, a stair
    up its back and a rescue board."""
    a = Asset("piece_cabanas", 209)
    yc = 2.7
    fronts = ["glass", "fabric", "glass", "accent", "glass"]
    for i, front in enumerate(fronts):
        x = -9.7 + i * 3.6
        a.box(3.2, 3.8, 0.55, x=x, y=yc - 0.45, z=-0.33, color="white", bevel=0.06, seg=2)
        a.box(3.0, 3.6, 0.03, x=x, y=yc - 0.45, z=0.22, color="wood")
        fy = yc - 1.1  # the front's plane
        # back and sides: wood slats, a white frame
        a.box(2.7, 0.12, 2.45, x=x, y=yc + 1.08, z=0.25, color="wood")
        for sx in (-1, 1):
            for k in range(4):
                a.box(0.07, 0.3, 2.45, x=x + sx * 1.31, y=fy + 0.36 + k * 0.56, z=0.25, color="wood")
            a.box(0.16, 0.16, 2.5, x=x + sx * 1.35, y=fy, z=0.25, color="white")
            a.box(0.16, 0.16, 2.5, x=x + sx * 1.35, y=yc + 1.1, z=0.25, color="white")
        a.box(3.15, 2.9, 0.24, x=x, y=yc - 0.02, z=2.72, color="white", bevel=0.08, seg=2)
        a.box(2.9, 0.04, 0.04, x=x, y=yc - 1.46, z=2.69, color=ACCENT_GLOW, flag=GLOW)
        # the front
        if front == "glass":
            a.box(2.55, 0.06, 2.4, x=x, y=fy, z=0.27, color="glass2")
            a.box(0.06, 0.08, 2.4, x=x + 0.2, y=fy, z=0.27, color="white")
        else:
            tint = ACCENT_TINT if front == "fabric" else ACCENT
            for sx in (-1, 1):
                a.box(0.7, 0.08, 2.4, x=x + sx * 0.92, y=fy, z=0.27, color=tint, bevel=0.03)
            a.box(1.2, 0.05, 2.4, x=x, y=fy + 1.9, z=0.27, color="graphite")
        a.box(1.3, 0.5, 0.36, x=x + 0.5, y=yc - 2.0, z=0.25, color="white", bevel=0.08, seg=2)
        a.box(1.24, 0.44, 0.04, x=x + 0.5, y=yc - 2.0, z=0.61, color="wood")
    # the observation tower
    tx, ty = 10.4, 0.9
    for sx in (-1, 1):
        for sy in (-1, 1):
            a.box(0.2, 0.2, 3.65, x=tx + sx * 0.95, y=ty + sy * 0.95, z=-0.6, color="white")
    a.box(2.7, 2.7, 0.26, x=tx, y=ty, z=3.05, color="white", bevel=0.08, seg=2)
    a.box(2.74, 2.74, 0.05, x=tx, y=ty, z=3.14, color=ACCENT_GLOW, flag=GLOW)
    a.box(1.9, 1.7, 1.75, x=tx, y=ty + 0.15, z=3.31, color="white", bevel=0.14, seg=3)
    a.box(1.95, 1.75, 0.62, x=tx, y=ty + 0.15, z=4.0, color="glass2")
    a.box(2.45, 2.3, 0.18, x=tx, y=ty + 0.1, z=5.1, color="white", bevel=0.06, seg=2)
    a.box(2.3, 0.04, 0.04, x=tx, y=ty - 1.06, z=5.07, color=ACCENT_GLOW, flag=GLOW)
    for side in ((0, -1.3, 2.6, 0.05), (-1.3, 0, 0.05, 2.6), (1.3, 0, 0.05, 2.6)):
        dx, dy, w, d = side
        a.box(w, d, 0.85, x=tx + dx, y=ty + dy, z=3.31, color="glass")
        a.box(w + 0.04, d + 0.04, 0.06, x=tx + dx, y=ty + dy, z=4.16, color="white")
    # the stair up its back
    n = 9
    for k in range(n):
        f = (k + 0.5) / n
        a.box(0.8, 0.3, 0.06, x=tx + 0.45, y=ty + 1.4 + (1 - f) * 2.6, z=f * 3.2 - 0.03, color="pearl")
    for sx in (0.0, 0.9):
        a.bar((tx + sx, ty + 1.35, 3.2), (tx + sx, ty + 4.1, -0.2), 0.08, 0.26, "white")
    # a rescue board against the front legs, a flag mast
    a.box(0.5, 0.1, 1.9, x=tx - 0.45, y=ty - 1.25, z=0.02, color="coral", bevel=0.08, seg=2, tilt=(-0.12, 0))
    a.cyl(0.035, 0.035, 2.1, 6, x=tx + 1.2, y=ty - 1.2, z=3.31, color="steel")
    a.box(0.42, 0.03, 0.28, x=tx + 1.42, y=ty - 1.2, z=5.1, color="coral")
    return a


def boathouse():
    """A water-sports center: a white volume on a concrete plinth with two big glass doors to the sea
    under a cantilevered canopy (a light line under it), a glass lookout on the roof, an accent fin,
    a slipway down the front with lit curbs and a paddleboard on it, a rack of boards by the side."""
    a = Asset("piece_boathouse", 211)
    top = 0.5
    a.box(9.2, 6.8, 1.4, y=1.6, z=top - 1.4, color="concrete", bevel=0.06)
    a.box(8.9, 6.5, 0.03, y=1.6, z=top, color="paving2")
    a.box(9.0, 0.04, 0.05, y=1.6 - 3.42, z=top - 0.12, color=ACCENT_GLOW, flag=GLOW)
    # the volume, its front at y = 0
    a.box(7.4, 4.8, 3.8, y=2.4, z=top, color="white", bevel=0.16, seg=3)
    for sx in (-1, 1):
        a.box(2.8, 0.2, 3.0, x=sx * 1.6, y=0.0, z=top, color="glass2")
        for k in range(3):
            a.box(2.8, 0.22, 0.04, x=sx * 1.6, y=0.0, z=top + 0.75 * (k + 1), color="white")
    a.box(0.25, 0.24, 3.0, y=0.0, z=top, color="white")
    a.box(8.3, 1.7, 0.22, y=-0.45, z=top + 3.35, color="white", bevel=0.06, seg=2)
    a.box(8.1, 0.05, 0.04, y=-1.28, z=top + 3.32, color=ACCENT_GLOW, flag=GLOW)
    a.box(0.4, 0.5, 4.3, x=3.85, y=0.15, z=top, color=ACCENT, bevel=0.06, seg=2)
    # the land side: a glazed entrance under a small canopy, a ribbon window, a light line
    a.box(1.8, 0.2, 2.4, x=1.6, y=4.8, z=top, color="glass2")
    a.box(2.4, 1.0, 0.18, x=1.6, y=5.1, z=top + 2.55, color="white", bevel=0.05, seg=2)
    a.box(2.2, 0.04, 0.04, x=1.6, y=5.61, z=top + 2.52, color=ACCENT_GLOW, flag=GLOW)
    a.box(3.4, 0.2, 0.8, x=-1.7, y=4.8, z=top + 1.6, color="glass2")
    # the lookout on the roof
    a.box(3.2, 2.4, 1.9, x=-1.5, y=3.3, z=top + 3.8, color="glass", bevel=0.05)
    a.box(3.6, 2.8, 0.22, x=-1.5, y=3.3, z=top + 5.7, color="white", bevel=0.06, seg=2)
    a.box(3.4, 0.04, 0.04, x=-1.5, y=1.88, z=top + 5.67, color=ACCENT_GLOW, flag=GLOW)
    # the slipway down the front to the beach, its curbs lit; its skirt reaches below the sand
    ya, yb, za, zb = -0.2, -5.4, top, 0.02
    a.plate([(-1.5, ya, za), (1.5, ya, za), (1.5, yb, zb), (-1.5, yb, zb)], 0.75, "concrete")
    for sx in (-1, 1):
        a.bar((sx * 1.62, ya, za + 0.06), (sx * 1.62, yb, zb + 0.06), 0.24, 0.2, "white")
        a.bar((sx * 1.62, ya, za + 0.165), (sx * 1.62, yb, zb + 0.165), 0.07, 0.02, ACCENT_GLOW, flag=GLOW)
    slope = math.atan2(za - zb, ya - yb)
    a.box(0.72, 2.9, 0.12, x=-0.35, y=-2.9, z=0.27, color=ACCENT, bevel=0.05, seg=2, tilt=(slope, 0))
    # a rack of boards by the side wall
    for k, c in enumerate(("white", ACCENT_TINT, "coral")):
        a.box(0.6, 0.12, 2.3, x=-4.05, y=0.9 + k * 0.55, z=top, color=c, bevel=0.06, seg=2, tilt=(0.0, -0.12))
    a.box(0.3, 2.0, 0.12, x=-4.05, y=1.45, z=top + 1.6, color="steel")
    return a


# --------------------------------------------------------------------------------------------- inland

def turbine():
    """A wind turbine: a tapered white tower (15.35) on a lit round footing, a rounded nacelle with
    light lines along its sides and a lit beacon on a mast, a small entrance at its foot. Its rotor
    (piece_turbine_rotor) turns at TURBINE_HUB."""
    a = Asset("piece_turbine", 213)
    _pad(a, 2.5, 0.3, 1.2)
    z0, ht, r0, r1 = 0.35, 15.0, 0.85, 0.42
    a.cyl(r0, r1, ht, 24, z=z0, color="white", smooth=True)
    _hug(a, r0, r1, z0, ht, 2.9, 14.4)
    a.cyl(0.79, 0.775, 0.5, 24, z=2.2, color=ACCENT, smooth=True)
    a.box(1.3, 0.8, 2.55, y=-0.8, z=0.35, color="white", bevel=0.12, seg=3)
    a.box(0.85, 0.82, 2.1, y=-0.81, z=0.35, color="glass2")
    hz = TURBINE_HUB[2]
    a.box(1.2, 3.3, 1.25, y=0.4, z=hz - 0.62, color="white", bevel=0.4, seg=3)
    for sx in (-1, 1):
        a.box(0.03, 2.3, 0.05, x=sx * 0.6, y=0.55, z=hz - 0.05, color=ACCENT_GLOW, flag=GLOW)
    a.box(1.22, 0.5, 0.08, y=1.7, z=hz - 0.15, color=ACCENT, bevel=0.02)
    a.cyl(0.03, 0.03, 0.5, 6, x=0.3, y=1.5, z=hz + 0.6, color="steel")
    a.box(0.12, 0.12, 0.12, x=0.3, y=1.5, z=hz + 1.1, color=ACCENT_GLOW, flag=GLOW)
    return a


def turbine_rotor():
    """The turbine's rotor: a hub with a nose cone and three slender white blades with tips in the
    district's color, 5.3 long. Origin at the hub's center; it turns about the axis to the front (-Y
    in Blender, +z in three.js)."""
    a = Asset("piece_turbine_rotor", 215)
    to_front = Matrix.Rotation(math.pi / 2, 4, "X")  # a cylinder's axis z -> -y
    to_back = Matrix.Rotation(-math.pi / 2, 4, "X")
    a.cyl(0.58, 0.58, 0.5, 20, color="white", smooth=True, axis=to_back)
    a.cyl(0.58, 0.07, 1.0, 20, color="white", smooth=True, axis=to_front)
    a.cyl(0.61, 0.61, 0.07, 20, y=0.01, color=ACCENT, axis=to_front)
    R = 5.3
    body = [(0.4, -0.2), (0.95, -0.32), (1.5, -0.3), (4.5, -0.12), (4.5, 0.04), (1.5, 0.15), (0.95, 0.19), (0.4, 0.2)]
    tip = [(4.5, -0.12), (R, -0.05), (R, 0.02), (4.5, 0.04)]
    for k in range(3):
        th = math.pi / 2 + k * math.tau / 3
        d = (math.cos(th), math.sin(th))
        c = (-math.sin(th), math.cos(th))
        pt = lambda r, o: (r * d[0] + o * c[0], 0.06, r * d[1] + o * c[1])
        a.plate([pt(r, o) for r, o in body], 0.12, "white")
        a.plate([pt(r, o) for r, o in tip], 0.122, ACCENT)
        a.cyl(0.17, 0.14, 0.75, 10, x=d[0] * 0.3, z=d[1] * 0.3, color="white", smooth=True, axis=Matrix.Rotation(math.pi / 2 - th, 4, "Y"))
    return a


def vertical_farm():
    """A vertical farm: a four-storey glass tower in a white frame (~10 tall), every floor a band of
    green behind its glazing, a lit crown and a rooftop glasshouse; beside it, four low white raised
    crop beds in neat rows. Footings reach below the ground for a slope."""
    a = Asset("piece_vertical_farm", 217)
    tx, ty = -4.3, 0.8
    a.box(5.4, 5.4, 1.5, x=tx, y=ty, z=-1.2, color="concrete", bevel=0.05)
    a.box(5.2, 0.04, 0.04, x=tx, y=ty - 2.72, z=0.22, color=ACCENT_GLOW, flag=GLOW)
    storey, z0, n = 2.3, 0.3, 4
    for i in range(n):
        z = z0 + i * storey
        a.box(4.6, 4.6, 0.22, x=tx, y=ty, z=z, color="white", bevel=0.08, seg=2)
        a.box(3.9, 3.9, storey - 0.22, x=tx, y=ty, z=z + 0.22, color="glass")
        if i:  # the grow lights along the ceiling
            a.box(3.94, 3.94, 0.05, x=tx, y=ty, z=z + storey - 0.08, color="glow", flag=GLOW)
        if i:  # a planted trough along the glazing, its green spilling over the lip
            a.box(4.12, 4.12, 0.26, x=tx, y=ty, z=z + 0.22, color="white", bevel=0.05)
            a.box(4.2, 4.2, 0.85, x=tx, y=ty, z=z + 0.38, color="leaf2" if i % 2 else "leaf", bevel=0.14, seg=2, smooth=True, flag=0.3)
    top = z0 + n * storey
    for sx in (-1, 1):
        for sy in (-1, 1):
            a.box(0.24, 0.24, top - z0, x=tx + sx * 2.18, y=ty + sy * 2.18, z=z0, color="white", bevel=0.04)
    a.box(4.8, 4.8, 0.36, x=tx, y=ty, z=top, color="white", bevel=0.1, seg=3)
    a.box(4.84, 4.84, 0.05, x=tx, y=ty, z=top + 0.1, color=ACCENT_GLOW, flag=GLOW)
    # the rooftop glasshouse
    a.box(2.6, 2.6, 0.9, x=tx, y=ty, z=top + 0.36, color="glass", bevel=0.05)
    a.box(2.8, 2.8, 0.12, x=tx, y=ty, z=top + 1.26, color="white", bevel=0.04)
    a.ball(0.55, tx + 1.75, ty + 1.75, top + 0.62, color="leaf", sub=2, squash=0.8, smooth=True, flag=1.0)
    a.ball(0.45, tx - 1.8, ty + 1.6, top + 0.58, color="leaf2", sub=2, squash=0.8, smooth=True, flag=1.0)
    # the entrance on the ground floor, an accent panel beside it
    a.box(1.7, 0.4, 2.15, x=tx, y=ty - 2.0, z=0.3, color="glass2")
    a.box(1.9, 0.5, 0.18, x=tx, y=ty - 2.1, z=2.38, color="white", bevel=0.05)
    a.box(0.9, 0.18, 1.7, x=tx + 1.45, y=ty - 2.03, z=0.4, color=ACCENT, bevel=0.05, seg=2)
    # the raised crop beds, toward the front
    for j in range(4):
        x = 0.4 + j * 1.95
        a.box(1.25, 5.4, 1.2, x=x, y=0.3, z=-0.7, color="white", bevel=0.07, seg=2)
        a.box(1.05, 5.2, 0.03, x=x, y=0.3, z=0.5, color="trunk")
        for k in range(4):
            yy = -1.65 + k * 1.3
            a.ball(0.42 + a.rng.uniform(-0.04, 0.04), x, yy, 0.74, color="leaf" if (j + k) % 2 else "leaf2", sub=2, squash=0.72, smooth=True, flag=1.0)
    return a


def pods():
    """A glamping camp: three white pods (a tube with a rounded back, its round front all glass in a
    white rim with a light ring) on small wood decks, facing a low fire-pit ring with a soft glow and
    white stools round it. Footings reach below the ground for a slope."""
    a = Asset("piece_pods", 219)
    to_front = Matrix.Rotation(math.pi / 2, 4, "X")  # a cylinder's axis z -> -y
    R, L, zc = 1.08, 2.2, 1.42
    for k, deg in enumerate((152, 90, 28)):
        ang = math.radians(deg)
        r = 4.0
        cx, cy = math.cos(ang) * r, math.sin(ang) * r
        rot = ang - math.pi / 2  # its -Y (the glass, the deck) toward the fire
        at = _xf(cx, cy, rot)
        a.box(1.5, 2.2, 1.25, x=cx, y=cy, z=-0.9, color="concrete", rot=rot)
        x, y = at(0, L / 2)
        a.cyl(R, R, L, 24, x=x, y=y, z=zc, color="white", smooth=True, rot=rot, axis=to_front, cap=False)
        a.ball(R, x, y, zc, color="white", sub=3, smooth=True)
        x, y = at(0, -L / 2 + 0.06)
        a.cyl(R + 0.08, R + 0.08, 0.2, 24, x=x, y=y, z=zc, color="white", rot=rot, axis=to_front)
        x, y = at(0, -L / 2 - 0.13)
        a.cyl(R - 0.1, R - 0.1, 0.03, 20, x=x, y=y, z=zc, color=ACCENT_GLOW, rot=rot, axis=to_front, flag=GLOW)
        x, y = at(0, -L / 2 - 0.15)
        a.cyl(R - 0.18, R - 0.18, 0.03, 20, x=x, y=y, z=zc, color="glass2", rot=rot, axis=to_front)
        x, y = at(0, -L / 2 - 0.55)
        a.box(1.9, 0.9, 0.85, x=x, y=y, z=-0.5, color="concrete", rot=rot)
        a.box(2.0, 1.0, 0.12, x=x, y=y, z=0.3, color="wood", rot=rot, bevel=0.03)
    # the fire pit (at the origin) and its stools
    a.cyl(1.0, 1.06, 0.9, 24, z=-0.5, color="concrete")
    a.ring(0.62, 1.0, 0.401, "pearl", seg=24)
    a.ring(1.0, 1.07, 0.402, ACCENT_GLOW, seg=24, h=0.02, flag=GLOW)
    a.cyl(0.6, 0.6, 0.03, 24, z=0.4, color="amber", flag=GLOW)
    a.cyl(0.28, 0.0, 0.3, 8, z=0.43, color="glow", flag=GLOW)  # warm white at night
    for k in range(5):
        ang = k / 5 * math.tau - math.pi / 2 + math.pi / 5
        x, y = math.cos(ang) * 1.85, math.sin(ang) * 1.85
        a.cyl(0.26, 0.24, 0.42, 12, x=x, y=y, color="white", smooth=True)
        a.cyl(0.25, 0.25, 0.04, 12, x=x, y=y, z=0.42, color="wood")
    return a


def datacenter():
    """A compact data center: a white block on a concrete plinth with graphite louvre panels, a lit
    status strip and a lit band near the top, an accent fin by the door, cooling fans on the roof."""
    a = Asset("piece_datacenter", 221)
    a.box(4.9, 4.9, 1.3, z=-1.0, color="concrete", bevel=0.05)
    a.box(4.6, 4.6, 0.03, z=0.3, color="paving2")
    W, H = 4.0, 6.0
    hw = W / 2
    a.box(W, W, H, z=0.3, color="white", bevel=0.16, seg=3)
    for nx, ny in ((1, 0), (-1, 0), (0, 1), (0, -1)):  # a lit band round the top, on each face
        a.box(0.04 if nx else W - 0.36, W - 0.36 if nx else 0.04, 0.07, x=nx * (hw + 0.01), y=ny * (hw + 0.01), z=5.7, color=ACCENT_GLOW, flag=GLOW)

    def louvres(face, w, z0, h, n):
        """A graphite panel with white louvre slats on face +-x or -y/+y (face = (nx, ny))."""
        nx, ny = face
        x, y = nx * (hw + 0.01), ny * (hw + 0.01)
        pw, pd = (0.06, w) if nx else (w, 0.06)
        a.box(pw, pd, h, x=x, y=y, z=z0, color="graphite", bevel=0.02)
        for k in range(n):
            sw, sd = (0.1, w) if nx else (w, 0.1)
            a.box(sw, sd, 0.06, x=x + nx * 0.03, y=y + ny * 0.03, z=z0 + (k + 0.6) * h / (n + 0.2), color="steel", tilt=(0.0, 0.0))

    louvres((0, -1), 2.4, 2.75, 2.6, 6)
    louvres((1, 0), 3.0, 0.9, 4.4, 10)
    louvres((-1, 0), 3.0, 0.9, 4.4, 10)
    louvres((0, 1), 3.0, 0.9, 4.4, 10)
    # the door, the status strip over it, the accent fin
    a.box(1.2, 0.1, 2.2, x=-0.45, y=-hw, z=0.3, color="glass2")
    a.box(1.4, 0.12, 0.12, x=-0.45, y=-hw - 0.01, z=2.5, color="white")
    for k in range(12):  # the status strip: a column of lit segments
        a.box(0.07, 0.05, 0.3, x=1.55, y=-hw - 0.02, z=0.6 + k * 0.4, color="glow" if k % 4 == 3 else ACCENT_GLOW, flag=GLOW)
    a.box(0.45, 0.22, 5.4, x=-1.55, y=-hw - 0.05, z=0.3, color=ACCENT, bevel=0.06, seg=2)
    # the roof: a graphite plant deck, four fans
    a.box(3.3, 3.3, 0.35, z=H + 0.3, color="graphite", bevel=0.05)
    for sx in (-1, 1):
        for sy in (-1, 1):
            fx, fy = sx * 0.82, sy * 0.82
            a.cyl(0.72, 0.72, 0.42, 20, x=fx, y=fy, z=H + 0.65, color="steel", smooth=True)
            a.cyl(0.6, 0.6, 0.03, 20, x=fx, y=fy, z=H + 1.06, color="screen")
            a.box(1.1, 0.12, 0.04, x=fx, y=fy, z=H + 1.08, color="white", rot=0.4 * sx)
            a.box(0.12, 1.1, 0.04, x=fx, y=fy, z=H + 1.08, color="white", rot=0.4 * sx)
            a.cyl(0.14, 0.14, 0.08, 10, x=fx, y=fy, z=H + 1.08, color=ACCENT)
    return a


def solar_field():
    """A solar field: four neat rows of tilted solar panels on slim white frames, their faces to the
    front, and a small white inverter cabinet with a screen and a light line. The posts reach below the
    ground for a slope."""
    a = Asset("piece_solar_field", 223)
    tilt = 0.44
    n, pw, pd = 4, 3.0, 1.9
    span = n * pw
    for yy in (-4.8, -1.6, 1.6, 4.8):
        zp = 1.0
        a.box(span, 0.12, 0.12, y=yy, z=zp - 0.14, color="white")
        for k in range(n + 1):
            x = -span / 2 + k * pw
            a.box(0.12, 0.12, zp + 0.8, x=x, y=yy, z=-0.8, color="white")
        for k in range(n):
            x = -span / 2 + (k + 0.5) * pw
            a.box(pw - 0.06, pd + 0.06, 0.05, x=x, y=yy, z=zp, color="white", tilt=(tilt, 0))
            a.box(pw - 0.16, pd - 0.08, 0.07, x=x, y=yy, z=zp + 0.01, color="solar", tilt=(tilt, 0))
            for u in (-0.75, 0.0, 0.75):
                a.box(0.035, pd - 0.08, 0.075, x=x + u, y=yy, z=zp + 0.01, color="steel", tilt=(tilt, 0))
            a.box(pw - 0.16, 0.035, 0.075, x=x, y=yy, z=zp + 0.01, color="steel", tilt=(tilt, 0))
    # the inverter cabinet on its pad
    ix, iy = 7.5, 0.0
    a.box(1.7, 1.3, 0.9, x=ix, y=iy, z=-0.75, color="concrete", bevel=0.04)
    a.box(1.2, 0.8, 1.5, x=ix, y=iy, z=0.15, color="white", bevel=0.1, seg=3)
    a.box(0.6, 0.03, 0.4, x=ix, y=iy - 0.4, z=1.0, color="screen", bevel=0.02)
    a.box(0.04, 0.81, 1.1, x=ix + 0.6, y=iy, z=0.3, color=ACCENT_GLOW, flag=GLOW)
    a.box(1.22, 0.82, 0.06, x=ix, y=iy, z=1.65, color=ACCENT, bevel=0.02)
    return a


def observatory():
    """An observatory's base: a rounded white block on a lit plinth (reaching below the ground) with
    ribbon windows and a glazed entrance to the front, a roof terrace behind a glass rail, and on it a
    round drum with an accent band and a light line under a white lip, where the dome
    (piece_observatory_dome) sits at DOME_SEAT; an antenna mast, a bench by the path."""
    a = Asset("piece_observatory", 225)
    a.box(6.4, 6.4, 1.5, z=-1.2, color="concrete", bevel=0.05)
    a.box(6.1, 6.1, 0.03, z=0.3, color="paving2")
    a.box(6.0, 0.04, 0.05, y=-3.22, z=0.18, color=ACCENT_GLOW, flag=GLOW)
    B, zt = 5.2, 2.7
    hb = B / 2
    a.box(B, B, zt - 0.3, z=0.3, color="white", bevel=0.16, seg=3)
    for sx in (-1, 1):
        a.box(0.1, 3.6, 0.7, x=sx * hb, z=1.45, color="glass2")
    a.box(3.6, 0.1, 0.7, y=hb, z=1.45, color="glass2")
    # the terrace's glass rail
    for nx, ny in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        w, d = (0.05, B - 0.5) if nx else (B - 0.5, 0.05)
        a.box(w, d, 0.75, x=nx * (hb - 0.15), y=ny * (hb - 0.15), z=zt, color="glass")
        a.box(w + 0.05, d + 0.05, 0.06, x=nx * (hb - 0.15), y=ny * (hb - 0.15), z=zt + 0.75, color="white")
    # the drum
    a.cyl(2.0, 2.0, DOME_SEAT - 0.5 - zt, 40, z=zt, color="white", smooth=True)
    a.cyl(2.02, 2.02, 0.28, 40, z=DOME_SEAT - 0.5, color=ACCENT, smooth=True)
    a.cyl(2.08, 2.08, 0.04, 40, z=DOME_SEAT - 0.26, color=ACCENT_GLOW, flag=GLOW)
    a.cyl(2.16, 2.16, 0.22, 40, z=DOME_SEAT - 0.22, color="white", smooth=True)
    # the entrance and its step
    a.box(2.0, 0.6, 2.6, y=-hb, z=0.3, color="white", bevel=0.12, seg=3)
    a.box(1.4, 0.65, 2.2, y=-hb - 0.01, z=0.3, color="glass2")
    a.box(1.4, 0.66, 0.05, y=-hb - 0.02, z=2.52, color=ACCENT_GLOW, flag=GLOW)
    a.box(2.0, 0.6, 0.15, y=-3.5, color="white", bevel=0.04)
    # an antenna mast on the terrace, a bench by the path
    a.cyl(0.05, 0.05, 1.7, 8, x=2.05, y=2.05, z=zt, color="steel")
    a.ball(0.11, 2.05, 2.05, zt + 1.78, color=ACCENT_GLOW, sub=2, flag=GLOW)
    a.box(1.8, 0.55, 0.42, x=2.3, y=-4.1, color="white", bevel=0.08, seg=3)
    a.box(1.7, 0.45, 0.05, x=2.3, y=-4.1, z=0.42, color="wood")
    return a


def observatory_dome():
    """The observatory's dome: a white sphere on a turning ring, a dark slit over its front with light
    lines either side, a telescope's white tube looking out of it. Origin at the dome's base center;
    it turns about +Z (three.js +y). The sphere's lower half stays hidden inside the drum and block."""
    a = Asset("piece_observatory_dome", 227)
    R, z0 = 1.95, 0.2
    a.cyl(2.12, 2.12, z0, 40, color="pearl", smooth=True)
    a.ball(R, 0, 0, z0, color="white", sub=4, smooth=True)
    n = 7
    for k in range(n):  # the slit, from the ring over the top
        p0 = 0.06 + k * (math.pi / 2 + 0.12) / n
        p1 = 0.06 + (k + 1) * (math.pi / 2 + 0.12) / n
        pm = (p0 + p1) / 2
        seg = R * (p1 - p0) * 1.06
        y, z = -math.cos(pm) * (R - 0.025), z0 + math.sin(pm) * (R - 0.025)
        tilt = (math.pi / 2 - pm, 0)
        a.box(0.62, seg, 0.07, y=y, z=z, color="screen", tilt=tilt)
        for sx in (-1, 1):
            a.box(0.05, seg, 0.09, x=sx * 0.34, y=y, z=z, color=ACCENT_GLOW, flag=GLOW, tilt=tilt)
    e = 0.62  # the telescope's elevation
    aim = Matrix.Rotation(math.pi / 2 - e, 4, "X")  # a cylinder's axis z -> out of the slit
    a.cyl(0.22, 0.22, 1.25, 14, y=-math.cos(e) * 1.2, z=z0 + math.sin(e) * 1.2, color="white", smooth=True, axis=aim)
    a.cyl(0.24, 0.24, 0.12, 14, y=-math.cos(e) * 2.4, z=z0 + math.sin(e) * 2.4, color="graphite", axis=aim)
    return a


def greenhouse():
    """A research greenhouse: a long hall in a white frame with an arched glass roof, glass ends with a
    door to the front, low glass walls along its sides and roll-up curtains above them, rolled up so
    its three rows of plants on white benches show; a lit line along its plinth, a rain tank outside."""
    a = Asset("piece_greenhouse", 229)
    W, D = 8.6, 4.8
    hw, hd = W / 2, D / 2
    base = 0.35
    eave, crown = 2.7, 4.1
    a.box(W + 0.5, D + 0.5, 1.35, z=base - 1.35, color="concrete", bevel=0.05)
    a.box(W + 0.2, D + 0.2, 0.03, z=base, color="paving2")
    a.box(W + 0.54, 0.04, 0.05, y=-(hd + 0.27), z=base - 0.12, color=ACCENT_GLOW, flag=GLOW)
    bays = 6
    xs = [-hw + i * W / bays for i in range(bays + 1)]
    # the arch, as segments from eave to crown and back
    m = 6
    arch = []
    for j in range(m + 1):
        t = math.pi * j / m
        arch.append((-math.cos(t) * hd, eave + math.sin(t) * (crown - eave)))
    for j in range(m):
        (y0, z0), (y1, z1) = arch[j], arch[j + 1]
        a.plate([(-hw, y0, z0), (-hw, y1, z1), (hw, y1, z1), (hw, y0, z0)], 0.05, "glass")
    for x in xs:
        for sy in (-1, 1):
            a.box(0.12, 0.12, eave - base, x=x, y=sy * hd, z=base, color="white")
        for j in range(m):
            (y0, z0), (y1, z1) = arch[j], arch[j + 1]
            a.bar((x, y0, z0 + 0.03), (x, y1, z1 + 0.03), 0.12, 0.1, "white")
    for sy in (-1, 1):
        a.box(W + 0.12, 0.16, 0.16, y=sy * hd, z=eave - 0.1, color="white")
        a.box(W, 0.22, 0.26, y=sy * (hd + 0.04), z=eave - 0.42, color="pearl", bevel=0.1, seg=2)
        a.box(W, 0.06, 0.85, y=sy * hd, z=base, color="glass")
        a.box(W + 0.1, 0.12, 0.08, y=sy * hd, z=base + 0.85, color="white")
    # the ends: glass gables, a door in the front one... the front of the hall is its long side, so the
    # door goes in the middle bay there
    for sx in (-1, 1):
        a.plate([(sx * hw, y, z) for y, z in [(-hd, base)] + arch + [(hd, base)]], 0.05, "glass")
        a.box(0.14, D, 0.12, x=sx * hw, z=base + 0.85, color="white")
    for sy in (-1, 1):  # grow lights under the eaves, seen through the open sides
        a.box(W - 0.4, 0.05, 0.05, y=sy * (hd - 0.25), z=eave - 0.22, color="glow", flag=GLOW)
    a.box(1.3, 0.1, 2.3, y=-hd - 0.02, z=base, color="glass2")
    a.box(1.5, 0.14, 0.12, y=-hd - 0.02, z=base + 2.3, color="white")
    # the benches and plants
    for row, yy in enumerate((-1.35, 0.0, 1.35)):
        a.box(W - 1.2, 0.85, 0.7, y=yy, z=base, color="white", bevel=0.05, seg=2)
        a.box(W - 1.35, 0.72, 0.03, y=yy, z=base + 0.7, color="trunk")
        for k in range(6):
            x = -hw + 1.15 + k * (W - 2.3) / 5
            a.ball(0.38 + a.rng.uniform(-0.04, 0.04), x, yy, base + 0.98, color="leaf" if (row + k) % 2 else "leaf2", sub=2, squash=0.85, smooth=True, flag=0.6)
    # a rain tank by the side
    a.cyl(0.55, 0.55, 1.6, 16, x=hw + 0.95, y=1.1, z=base, color="white", smooth=True)
    a.cyl(0.57, 0.57, 0.12, 16, x=hw + 0.95, y=1.1, z=base + 1.1, color=ACCENT, smooth=True)
    return a


def _fitted(name, fn):
    def build():
        a = fn()
        k = a.fit(FOOTPRINT[name])
        if k < 1.0:
            print(f"FIT {name}: scaled by {k:.3f} to its footprint {FOOTPRINT[name]}")
        return a
    build.__doc__ = fn.__doc__
    return build


ASSETS = {
    "piece_beacon": _fitted("piece_beacon", beacon),
    "piece_marina": marina,  # its deck reaches out to sea; its base keeps within FOOTPRINT
    "piece_marina_boat": marina_boat,
    "piece_beach": _fitted("piece_beach", beach),
    "piece_cabanas": _fitted("piece_cabanas", cabanas),
    "piece_boathouse": _fitted("piece_boathouse", boathouse),
    "piece_turbine": _fitted("piece_turbine", turbine),
    "piece_turbine_rotor": turbine_rotor,
    "piece_vertical_farm": _fitted("piece_vertical_farm", vertical_farm),
    "piece_pods": _fitted("piece_pods", pods),
    "piece_datacenter": _fitted("piece_datacenter", datacenter),
    "piece_solar_field": _fitted("piece_solar_field", solar_field),
    "piece_observatory": _fitted("piece_observatory", observatory),
    "piece_observatory_dome": observatory_dome,
    "piece_greenhouse": _fitted("piece_greenhouse", greenhouse),
}
