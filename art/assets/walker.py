"""The walker's headset, in the walker's own frame (its head's middle at about 1.40 up): an arched band
over the crown and two ear cups with a ring of light. scripts/build-walker.mjs skins it to the
walker's head bone and merges it into the walker (public/island/geometries/walker.bin)."""
import math

from kit import GLOW, Asset
from mathutils import Matrix, Vector


def walker_headset():
    a = Asset("walker_headset", 151)
    cz, rad = 1.395, 0.172
    pts = [(math.cos(math.pi * k / 12) * rad, math.sin(math.pi * k / 12) * rad) for k in range(13)]
    for k in range(12):
        p0 = Vector((pts[k][0], 0.0, cz + pts[k][1]))
        p1 = Vector((pts[k + 1][0], 0.0, cz + pts[k + 1][1]))
        a.bar(p0, p1, 0.03, 0.055, "graphite")
    for sx in (-1, 1):
        a.cyl(0.066, 0.066, 0.06, 16, x=sx * 0.15, z=cz - 0.02, color="graphite", axis=Matrix.Rotation(math.pi / 2 * sx, 4, "Y"), smooth=True)
        a.cyl(0.044, 0.044, 0.064, 16, x=sx * 0.152, z=cz - 0.02, color="signal", flag=GLOW, axis=Matrix.Rotation(math.pi / 2 * sx, 4, "Y"))
    return a


ASSETS = {"walker_headset": walker_headset}
