// @ts-nocheck
/* Placing the island's own assets (art/, built in Blender into public/island/geometries/): load a
   model once, stand every copy of it where the plan says as one instanced mesh, each copy taking the
   accent rows of the district it stands in (palette.ts), and give the kid's collider a box for each.

   A model's anchors (art/kit.py anchor(): a screen for a logo, a board for a name) come with it in
   its header (geometry.userData.anchors). */
import { BufferAttribute, BufferGeometry, Matrix4, Quaternion, Vector3 } from 'three';
import { geometryLoader } from './engine/loaders/geometries';
import { createInstancedGeometry } from './engine/loaders/instancing';
import { phongMaterial, type PhongMaterialOptions } from './scene/materials';
import { makeInstanced } from './scene/helpers';

export interface Anchor {
  at: [number, number, number];
  w: number;
  h: number;
  facing: number;
}

/** Where a copy stands: on the ground at (x, z), turned `facing` (rotation.y), in a district's colors. */
export interface Placement {
  x: number;
  z: number;
  facing: number;
  /** The district's accent base row (palette.setDistrictColors), or the plaza's. */
  accent: number;
  scale?: number;
}

/** A collision box in a model's own frame: w across (x), d deep (z), h tall, its middle at (x, z), turned ry. */
export interface LocalBox {
  w: number;
  d: number;
  h: number;
  x: number;
  z: number;
  ry: number;
}

/** The kid bumps into these (models not listed here are walked through: shrubs, the ground's own dressing). */
export const COLLIDERS: Record<string, LocalBox[]> = {
  totem: [{ w: 1.7, d: 0.5, h: 3.1, x: 0, z: 0, ry: 0 }],
  person_post: [{ w: 0.5, d: 0.5, h: 1.8, x: 0, z: 0, ry: 0 }],
  gateway: [-1, 1].map((s) => ({ w: 0.62, d: 0.62, h: 4.7, x: s * 3.65, z: 0, ry: 0 })),
  pylon: [{ w: 1.6, d: 1.1, h: 11.6, x: 0, z: 0, ry: 0 }],
  light_pole: [{ w: 0.32, d: 0.32, h: 5.1, x: 0, z: 0, ry: 0 }],
  bench: [{ w: 2.2, d: 0.62, h: 0.46, x: 0, z: 0, ry: 0 }],
  planter: [{ w: 3.2, d: 1.2, h: 0.6, x: 0, z: 0, ry: 0 }],
  tree_capsule: [{ w: 0.4, d: 0.4, h: 2.6, x: 0, z: 0, ry: 0 }],
  tree_round: [{ w: 0.45, d: 0.45, h: 2.2, x: 0, z: 0, ry: 0 }],
  tree_cone: [{ w: 0.35, d: 0.35, h: 1.6, x: 0, z: 0, ry: 0 }],
  monument: [{ w: 3.2, d: 3.2, h: 7.9, x: 0, z: 0, ry: 0 }, { w: 4.8, d: 4.8, h: 0.8, x: 0, z: 0, ry: 0 }],
  hub_pylon: [{ w: 1, d: 1, h: 4.3, x: 0, z: 0, ry: 0 }],
  info_display: [{ w: 3.9, d: 0.6, h: 2.53, x: 0, z: -0.15, ry: 0 }],
  signpost: [{ w: 0.3, d: 0.3, h: 2.7, x: 0, z: 0, ry: 0 }],
  kiosk: [{ w: 2.8, d: 2.3, h: 2.7, x: 0, z: 0.15, ry: 0 }],
  portal_frame: [-1, 1].flatMap((s) => [{ w: 0.5, d: 0.6, h: 3.95, x: s * 3.84, z: 0, ry: 0 }, { w: 1.7, d: 0.5, h: 1.9, x: s * 2.75, z: 0, ry: 0 }]),
  planter_round: [{ w: 2.5, d: 2.5, h: 0.6, x: 0, z: 0, ry: 0 }, { w: 2.5, d: 2.5, h: 0.6, x: 0, z: 0, ry: Math.PI / 4 }],
  plaza_bench: [{ w: 3.2, d: 0.7, h: 0.95, x: 0, z: -0.04, ry: 0 }],
  house_a: [{ w: 6.2, d: 5.4, h: 6.4, x: -1.0, z: -0.4, ry: 0 }, { w: 0.25, d: 0.25, h: 3.35, x: 3.35, z: 2.45, ry: 0 }, { w: 3.2, d: 0.7, h: 0.6, x: -2.15, z: 3.0, ry: 0 }],
  house_b: [{ w: 6.2, d: 5.45, h: 5.3, x: -1.2, z: -0.18, ry: 0 }, { w: 0.22, d: 0.22, h: 2.9, x: 4.25, z: 2.3, ry: 0 }, { w: 0.22, d: 0.22, h: 2.9, x: 4.25, z: -2.6, ry: 0 }, { w: 0.4, d: 0.3, h: 1.4, x: 2.1, z: -0.9, ry: 0 }],
  house_c: [{ w: 5.0, d: 4.8, h: 3.4, x: -1.7, z: -1.0, ry: 0 }, { w: 3.0, d: 2.6, h: 6.2, x: 1.8, z: -2.3, ry: 0 }, { w: 1.6, d: 0.6, h: 0.6, x: -2.6, z: 2.6, ry: 0 }],
  sports_court: [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ w: 0.2, d: 0.2, h: 2.1, x: sx * 7.5, z: sz * 1.5, ry: 0 }))),
  playground: [
    { w: 3.1, d: 3.1, h: 1.95, x: -1.6, z: -1.2, ry: 0 },
    { w: 3.1, d: 3.1, h: 1.95, x: -1.6, z: -1.2, ry: Math.PI / 4 },
    { w: 1.5, d: 2.9, h: 2.8, x: 2.0, z: -1.82, ry: 0 },
    { w: 0.9, d: 3.1, h: 1.0, x: 2.0, z: 1.17, ry: 0 },
    { w: 3.2, d: 0.45, h: 0.5, x: -1.7, z: 2.3, ry: 0.3 },
  ],
  picnic_set: [{ w: 1.95, d: 1.9, h: 0.8, x: 0, z: 0, ry: 0 }],
  stone_a: [{ w: 2.1, d: 1.15, h: 0.6, x: 0, z: 0, ry: 0 }],
  stone_b: [{ w: 1.3, d: 0.9, h: 0.5, x: 0, z: 0, ry: -0.25 }],
  palm: [{ w: 0.55, d: 0.55, h: 3.0, x: 0.05, z: 0, ry: 0 }],
};

/** n boxes round a circle of radius r (a round building's wall, for the collider). */
export function ringBoxes(r: number, h: number, n = 8, thick = 0.6, gap?: number): LocalBox[] {
  const out: LocalBox[] = [];
  const side = 2 * r * Math.tan(Math.PI / n) + 0.1;
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    // Leave the side facing +z open (a doorway) when asked.
    if (gap !== undefined && Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < gap) continue;
    out.push({ w: side, d: thick, h, x: Math.cos(a) * r, z: Math.sin(a) * r, ry: Math.PI / 2 - a });
  }
  return out;
}

/** Load a model (cached) by its asset name. */
export function loadModel(name: string): Promise<BufferGeometry> {
  return geometryLoader.load(`${name}.bin`);
}

/** A model's anchors (from its header). */
export function anchorsOf(geo: BufferGeometry): Record<string, Anchor> {
  return (geo.userData?.anchors ?? {}) as Record<string, Anchor>;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _v = new Vector3();
const _s = new Vector3();
const UP = new Vector3(0, 1, 0);

/** A placement's world matrix (on the ground at groundY). */
export function placementMatrix(p: Placement, groundY: (x: number, z: number) => number, out = new Matrix4()): Matrix4 {
  _q.setFromAxisAngle(UP, p.facing);
  _v.set(p.x, groundY(p.x, p.z), p.z);
  _s.setScalar(p.scale ?? 1);
  return out.compose(_v, _q, _s);
}

/** An anchor's world matrix on a placed copy (its quad's front faces the anchor's way), nudged out by `lift`. */
export function anchorMatrix(p: Placement, a: Anchor, groundY: (x: number, z: number) => number, lift = 0.008): Matrix4 {
  const base = placementMatrix(p, groundY, new Matrix4());
  const local = new Matrix4().makeRotationY(a.facing);
  local.setPosition(a.at[0] + Math.sin(a.facing) * lift, a.at[1], a.at[2] + Math.cos(a.facing) * lift);
  return base.multiply(local);
}

export interface Placed {
  mesh: any;
  geometry: BufferGeometry;
}

/**
 * Stand every copy of a model as one instanced mesh, each in its own district's accent rows, and push
 * the model's collision boxes (COLLIDERS) for each copy into `colliders`.
 */
export async function placeModel(
  scene: any,
  name: string,
  placements: Placement[],
  groundY: (x: number, z: number) => number,
  colliders: Array<{ w: number; h: number; d: number; x: number; y: number; z: number; ry: number }> | null,
  material: PhongMaterialOptions = {},
): Promise<Placed | null> {
  if (!placements.length) return null;
  const base = await loadModel(name);
  const n = placements.length;
  const pos = new Float32Array(n * 3);
  const quat = new Float32Array(n * 4);
  const scale = new Float32Array(n);
  const accent = new Float32Array(n);
  placements.forEach((p, i) => {
    pos.set([p.x, groundY(p.x, p.z), p.z], i * 3);
    _q.setFromAxisAngle(UP, p.facing);
    quat.set([_q.x, _q.y, _q.z, _q.w], i * 4);
    scale[i] = p.scale ?? 1;
    accent[i] = p.accent;
  });
  const data = new BufferGeometry();
  data.setAttribute('position', new BufferAttribute(pos, 3));
  data.setAttribute('quaternion', new BufferAttribute(quat, 4));
  data.setAttribute('scale', new BufferAttribute(scale, 1));
  data.setAttribute('instAccent', new BufferAttribute(accent, 1));
  const geo = createInstancedGeometry(base, data);
  const mesh = makeInstanced(geo, phongMaterial({ ...material, accentInstanced: true }), name);
  scene.add(mesh);
  const boxes = COLLIDERS[name];
  if (colliders && boxes) {
    for (const p of placements) {
      const c = Math.cos(p.facing);
      const s = Math.sin(p.facing);
      const k = p.scale ?? 1;
      const gy = groundY(p.x, p.z);
      for (const b of boxes) colliders.push({ w: b.w * k, d: b.d * k, h: b.h * k, x: p.x + (b.x * c + b.z * s) * k, y: gy, z: p.z + (-b.x * s + b.z * c) * k, ry: p.facing + b.ry });
    }
  }
  return { mesh, geometry: base };
}
