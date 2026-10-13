"""Build the island's assets and export each as JSON for the encoder (scripts/build-art.mjs).

  blender --background --factory-startup --python-exit-code 1 --python art/build.py -- OUT_DIR [NAME ...]

Every asset module in art/assets/ lists its builders in ASSETS = {name: function}; a builder returns
a kit.Asset. Each asset is exported to OUT_DIR/NAME.json: three.js axes (y up, front +z), one
vertex per position + normal + colorInfo, triangles. scripts/build-art.mjs turns these into the
Draco .bin files the engine loads (public/island/geometries/).
"""
import importlib
import json
import os
import pkgutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
from mathutils import Matrix  # noqa: E402

import assets  # noqa: E402

AXIS = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))  # Blender z-up -> three y-up


def registry():
    out = {}
    for mod in pkgutil.iter_modules(assets.__path__):
        try:
            m = importlib.import_module(f"assets.{mod.name}")
        except Exception as err:  # a module being edited must not stop the others building
            print(f"SKIP assets.{mod.name}: {type(err).__name__}: {err}")
            continue
        for name, fn in getattr(m, "ASSETS", {}).items():
            if name in out:
                raise SystemExit(f"asset '{name}' is defined twice")
            out[name] = fn
    return out


def export(obj, anchors):
    me = obj.data
    me.calc_loop_triangles()
    ci = me.attributes["colorInfo"]
    cn = me.corner_normals
    N3 = AXIS.to_3x3()
    positions, normals, infos, index = [], [], [], []
    weld = {}
    for tri in me.loop_triangles:
        info = tuple(ci.data[tri.polygon_index].vector)
        for c in tri.loops:
            p = AXIS @ me.vertices[me.loops[c].vertex_index].co
            n = (N3 @ cn[c].vector).normalized()
            key = (round(p.x, 5), round(p.y, 5), round(p.z, 5), round(n.x, 4), round(n.y, 4), round(n.z, 4), info)
            k = weld.get(key)
            if k is None:
                k = weld[key] = len(weld)
                positions += [round(p.x, 5), round(p.y, 5), round(p.z, 5)]
                normals += [round(n.x, 5), round(n.y, 5), round(n.z, 5)]
                infos += [info[0], info[1]]
            index.append(k)
    xs, ys, zs = positions[0::3], positions[1::3], positions[2::3]
    # anchors in three.js axes: (x, y, z) blender -> (x, z, -y); facing about +y
    anc = {k: {"at": [round(v["at"][0], 4), round(v["at"][2], 4), round(-v["at"][1], 4)], "w": v["w"], "h": v["h"], "facing": round(v["facing"], 5)} for k, v in sorted(anchors.items())}
    return {
        "type": 0,
        "userData": {"anchors": anc} if anc else None,
        "attributes": [["position", 3, positions], ["normal", 3, normals], ["colorInfo", 2, infos]],
        "index": index,
        "stats": {"vertices": len(weld), "triangles": len(index) // 3, "size": [round(max(xs) - min(xs), 3), round(max(ys) - min(ys), 3), round(max(zs) - min(zs), 3)]},
    }


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if not argv:
        raise SystemExit("usage: build.py -- OUT_DIR [NAME ...]")
    out_dir, names = argv[0], argv[1:]
    os.makedirs(out_dir, exist_ok=True)
    reg = registry()
    todo = names or sorted(reg)
    unknown = [n for n in todo if n not in reg]
    if unknown:
        raise SystemExit(f"unknown assets: {', '.join(unknown)} (known: {', '.join(sorted(reg))})")
    report = {}
    for name in todo:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        asset = reg[name]()
        obj = asset.emit()
        doc = export(obj, asset.anchors)
        if doc["userData"] is None:
            del doc["userData"]
        with open(os.path.join(out_dir, f"{name}.json"), "w") as fh:
            json.dump(doc, fh, separators=(",", ":"))
        report[name] = doc["stats"]
        print(f"ASSET {name}: {doc['stats']['triangles']} tris, {doc['stats']['vertices']} verts, size {doc['stats']['size']}")
    with open(os.path.join(out_dir, "_report.json"), "w") as fh:
        json.dump(report, fh, indent=1, sort_keys=True)


if __name__ == "__main__":
    main()
