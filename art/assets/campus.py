"""Campus props: what stands in a district and along its streets.

Clean, minimal, daylight: white bodies with rounded edges, glass, graphite screens, thin light lines.
District color comes through the accent slots (kit.ACCENT*), so one model serves every district.
"""
import math

from kit import ACCENT, ACCENT_GLOW, ACCENT_TINT, GLOW, Asset
from mathutils import Matrix


def totem():
    """A company's screen totem: a slim white monolith on a lit base ring, a graphite screen on both
    faces (the engine shows the company's logo on them: anchors screen_front, screen_back), and a
    light strip up one edge in the district's color. 3.1 tall; the screens' middle at the walker's
    eye line."""
    a = Asset("totem", 11)
    a.cyl(0.92, 0.98, 0.12, 20, color="concrete")
    a.ring(0.93, 0.99, 0.121, ACCENT_GLOW, seg=20, h=0.035, flag=GLOW)
    a.cyl(0.8, 0.8, 0.05, 20, z=0.12, color="pearl")
    a.box(1.62, 0.38, 2.95, z=0.15, color="white", bevel=0.12, seg=2)
    for side in (-1, 1):
        y = side * 0.19
        a.box(1.42, 0.03, 0.92, y=y + side * 0.012, z=1.25, color="screen", bevel=0.04, seg=1)
        a.box(1.1, 0.03, 0.05, y=y + side * 0.016, z=1.08, color=ACCENT_GLOW, flag=GLOW)
    a.box(0.045, 0.42, 2.4, x=0.79, z=0.4, color=ACCENT_GLOW, flag=GLOW)
    a.box(1.62, 0.4, 0.07, z=3.0, color=ACCENT, bevel=0.02)
    a.anchor("screen_front", 0, -0.215, 1.71, 1.34, 0.84, facing=0.0)
    a.anchor("screen_back", 0, 0.215, 1.71, 1.34, 0.84, facing=math.pi)
    return a


def person_post():
    """A person's signpost in the people area's garden: a low lectern with a round screen for the
    person's badge (anchor screen), on a small base, a thin light line along its foot."""
    a = Asset("person_post", 13)
    a.cyl(0.55, 0.6, 0.1, 28, color="concrete")
    a.ring(0.56, 0.61, 0.101, ACCENT_GLOW, seg=28, h=0.03, flag=GLOW)
    a.box(0.22, 0.22, 1.2, z=0.1, color="white", bevel=0.06, seg=2)
    a.box(1.05, 0.14, 1.05, y=-0.02, z=1.15, color="white", bevel=0.12, seg=3, tilt=(-0.32, 0))
    a.cyl(0.42, 0.42, 0.03, 28, x=0, y=-0.11, z=1.68, color="screen", axis=Matrix.Rotation(math.pi / 2 - 0.32, 4, "X"))
    a.anchor("screen", 0, -0.135, 1.67, 0.8, 0.8, facing=0.0)
    return a


def gateway():
    """A district's gateway over its road (6 wide): two slim white pylons with light lines, a thin
    beam with a glass name panel (anchor board: the district's name) and a light line under it."""
    a = Asset("gateway", 17)
    span = 6.6
    hx = span / 2
    for sx in (-1, 1):
        x = sx * (hx + 0.35)
        a.cyl(0.62, 0.66, 0.12, 24, x=x, color="concrete")
        a.box(0.55, 0.55, 4.6, x=x, z=0.1, color="white", bevel=0.12, seg=3)
        a.box(0.05, 0.57, 3.7, x=x - sx * 0.25, z=0.45, color=ACCENT_GLOW, flag=GLOW)
    a.box(span + 1.8, 0.42, 0.34, z=4.3, color="white", bevel=0.1, seg=3)
    a.box(span + 1.5, 0.44, 0.05, z=4.25, color=ACCENT_GLOW, flag=GLOW)
    a.box(3.8, 0.1, 0.95, y=-0.27, z=4.7, color="glass2", bevel=0.05, seg=2)
    a.box(3.8, 0.12, 0.06, y=-0.28, z=4.66, color=ACCENT)
    a.anchor("board", 0, -0.33, 5.17, 3.6, 0.8, facing=0.0)
    return a


def pylon():
    """A district's pylon (its mast), seen across the island: a slim white column, a tall panel in the
    district's color, a screen near the top with the district's name (anchor board), a light strip,
    a lit crown."""
    a = Asset("pylon", 19)
    a.cyl(0.95, 1.02, 0.25, 32, color="concrete")
    a.box(0.95, 0.55, 11.2, z=0.25, color="white", bevel=0.14, seg=3)
    a.box(1.7, 0.2, 5.4, y=-0.33, z=5.2, color=ACCENT, bevel=0.08, seg=2)
    a.box(1.42, 0.05, 1.1, y=-0.44, z=9.3, color="screen", bevel=0.03, seg=2)
    a.box(0.06, 0.57, 10.4, x=0.5, z=0.6, color=ACCENT_GLOW, flag=GLOW)
    a.box(1.0, 0.6, 0.18, z=11.45, color=ACCENT_GLOW, flag=GLOW)
    a.anchor("board", 0, -0.475, 9.85, 1.32, 0.9, facing=0.0)
    return a


def light_pole():
    """A street light: a slim white pole with an LED bar set into it and a lit cap in the
    district's color. 5.2 tall."""
    a = Asset("light_pole", 23)
    a.cyl(0.3, 0.33, 0.1, 20, color="concrete")
    a.box(0.17, 0.17, 5.0, z=0.1, color="white", bevel=0.05, seg=2)
    a.box(0.12, 0.19, 3.2, z=1.6, color="glow", flag=GLOW)
    a.box(0.26, 0.26, 0.08, z=5.1, color="white", bevel=0.02)
    a.box(0.22, 0.22, 0.05, z=5.05, color=ACCENT_GLOW, flag=GLOW)
    return a


def bench():
    """A bench: a white rounded base and a warm wood seat. 2.2 long."""
    a = Asset("bench", 29)
    a.box(2.2, 0.62, 0.4, color="white", bevel=0.09, seg=3)
    a.box(2.1, 0.52, 0.06, z=0.4, color="wood", bevel=0.02)
    return a


def planter():
    """A long white planter with a lawn top and a row of soft shrubs. 3.2 by 1.2."""
    a = Asset("planter", 31)
    w, d = 3.2, 1.2
    a.box(w, d, 0.55, color="white", bevel=0.09, seg=3)
    a.box(w - 0.22, d - 0.22, 0.04, z=0.55, color="lawn")
    n = 6
    for i in range(n):
        x = -w / 2 + 0.38 + i * (w - 0.76) / (n - 1)
        a.ball(0.3 + a.rng.uniform(-0.04, 0.05), x, 0, 0.78, color="leaf2" if i % 2 else "leaf", sub=2, squash=0.82, smooth=True, flag=1.0)
    return a


def _trunk(a, h, r0=0.16, r1=0.11):
    a.cyl(r0, r1, h, 10, color="trunk", smooth=True)


def tree_capsule():
    """A campus tree: a slim trunk and a tall soft capsule crown. 6 tall."""
    a = Asset("tree_capsule", 37)
    _trunk(a, 2.6)
    a.ball(1.35, 0, 0, 4.0, color="leaf", sub=3, squash=1.5, smooth=True, flag=1.0)
    return a


def tree_round():
    """A campus tree with a round crown on a shorter trunk. 5.2 tall."""
    a = Asset("tree_round", 41)
    _trunk(a, 2.2, 0.18, 0.12)
    a.ball(1.6, 0, 0, 3.55, color="leaf2", sub=3, squash=1.0, smooth=True, flag=1.0)
    return a


def tree_cone():
    """A columnar campus tree: a narrow cone crown. 7 tall."""
    a = Asset("tree_cone", 43)
    _trunk(a, 1.6, 0.14, 0.1)
    a.cyl(1.05, 0.0, 5.4, 18, z=1.3, color="leaf", smooth=True, flag=1.0)
    a.cyl(1.07, 1.05, 0.2, 18, z=1.15, color="leaf", smooth=True, flag=1.0)
    return a


def shrub():
    """A low rounded shrub for lawns and borders. 1 tall."""
    a = Asset("shrub", 47)
    for k, (x, y, r) in enumerate(((0, 0, 0.62), (0.55, 0.15, 0.45), (-0.5, -0.1, 0.48))):
        a.ball(r, x, y, r * 0.8, color="leaf2" if k else "leaf", sub=2, squash=0.85, smooth=True, flag=0.6)
    return a


ASSETS = {
    "totem": totem,
    "person_post": person_post,
    "gateway": gateway,
    "pylon": pylon,
    "light_pole": light_pole,
    "bench": bench,
    "planter": planter,
    "tree_capsule": tree_capsule,
    "tree_round": tree_round,
    "tree_cone": tree_cone,
    "shrub": shrub,
}
