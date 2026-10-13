/* What each set piece looks like. scenery.ts decides where the island's set pieces stand; this file
   builds each one from the kit's painted, faceted parts (kit.ts), in its own frame: y up, standing on
   y = 0, its front toward +z (out to sea for a coastal piece, toward the plaza for an inland one).

   On the coast: a lighthouse, a pier with a rowboat and a sailboat on the swell, a beach with
   parasols and a sandcastle, a row of beach huts with a lifeguard tower, a boathouse with a slipway.
   Inland, on the hills: a windmill whose sails turn, a farm, a campsite, a water tower, an orchard, an
   observatory whose dome turns slowly, a greenhouse.

   A model (PieceModel) is plain data: its parts, what the walker bumps into and what the follow
   camera keeps its view over, all in the piece's frame. PIECES lists every kind, in the order the
   island hands them out. To add a kind: write its model here, add it to PieceKind and PIECES, and
   look at it in the kit gallery (?kit). Nothing here is a model of a real place. */
import * as THREE from "three";
import { ball, bar, blend, box, cyl, gable, hull, inside, pyramid, tone, tri, type Part } from "./kit";
import type { ScenePalette } from "./palette";
import { haystack, stoneWall } from "./street";
import { paint } from "./util";
import type { BoxCollider, Collider } from "./world";

const WHITE = new THREE.Color("#ffffff");
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Something small that settles on the ground where it stands (a tree, a crate), rather than standing level with its piece. */
export interface Loose {
  x: number;
  z: number;
  parts: Part[];
  /** Unlit parts that go with it (a campfire's flames). */
  lit?: Part[];
}

/** A boat near a piece: it rides the swell at sea level. */
export interface Afloat {
  parts: Part[];
  /** Where it lies in the piece's frame, and its heading there. */
  x: number;
  z: number;
  yaw: number;
  /** How deep it sits; the swell's lift and its roll, each [amplitude, frequency]. */
  sink: number;
  bob: readonly [number, number];
  roll: readonly [number, number];
}

export interface PieceModel {
  /** Toon-lit parts, standing level where the piece stands. */
  parts: Part[];
  /** Lamp glass: frosted by day, lit by moonlight (a lantern, a lighthouse's light). */
  glass?: Part[];
  /** Glazing you can see through (a greenhouse). */
  panes?: Part[];
  /** Unlit parts in their own colors (flames). */
  lit?: Part[];
  loose?: Loose[];
  /** Parts that turn about a vertical axis (y) or about the axis the piece faces (z), through `at`, built around `at`; `rest` is their angle under reduced motion. */
  turn?: { parts: Part[]; at: THREE.Vector3; axis: "y" | "z"; speed: number; rest: number };
  afloat?: Afloat[];
  /** What the walker bumps into: circles, and boxes that turn with the piece. Heights are above the piece's ground. */
  colliders: Collider[];
  boxes?: Omit<BoxCollider, "rot">[];
  /** Circles the follow camera keeps its view over. */
  blockers?: Collider[];
}

/* ---------------- on the coast ---------------- */

function lighthouse(p: ScenePalette): PieceModel {
  const red = blend(p.roofCoral, p.awning, 0.5);
  const white = blend(p.wallCream, WHITE, 0.55);
  const parts: Part[] = [cyl(3.6, 4.0, 1.2, 10, 0, 0, 0, blend(p.wallStone, p.ink, 0.1)), cyl(3.0, 3.4, 0.5, 10, 0, 1.1, 0, tone(p.wallStone, 1.1))];
  const bands = 5;
  for (let i = 0; i < bands; i++) {
    const y0 = 1.5 + i * 2.6;
    const r0 = 2.7 - i * 0.26;
    const r1 = 2.7 - (i + 1) * 0.26;
    parts.push(cyl(r1, r0, 2.6, 10, 0, y0, 0, i % 2 ? red : white, { bottom: 0.85, top: 1.08 }));
  }
  const top = 1.5 + bands * 2.6;
  parts.push(cyl(2.4, 2.1, 0.3, 10, 0, top, 0, tone(p.ink, 1.6)), cyl(2.35, 2.35, 0.14, 10, 0, top + 1.3, 0, tone(p.ink, 1.6)));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    parts.push(cyl(0.05, 0.05, 1.2, 4, Math.cos(a) * 2.25, top + 0.15, Math.sin(a) * 2.25, tone(p.ink, 1.8)));
  }
  parts.push(cyl(0.0, 1.9, 1.3, 10, 0, top + 1.55, 0, red), ball(0.22, 0, top + 2.95, 0, tone(p.ink, 1.8)));
  // The door and two small windows.
  parts.push(box(1.1, 1.9, 0.3, 0, 0.3, 3.0, blend(p.trunk, p.ink, 0.3)));
  for (const y of [5.4, 9.2]) parts.push(box(0.55, 0.9, 0.3, 0, y, 2.5 - (y - 5.4) * 0.065, p.window));
  const glass = [paint(new THREE.CylinderGeometry(1.7, 1.7, 1.15, 10).translate(0, top + 0.72, 0), p.lampGlass)];
  const h = top + 3;
  return { parts, glass, colliders: [{ x: 0, z: 0, r: 4.0, h }], blockers: [{ x: 0, z: 0, r: 4.5, h }] };
}

function sailboat(p: ScenePalette): Part[] {
  const main = blend(p.cloud, p.wallCream, 0.3);
  return [
    ...hull(5.2, 1.9, p.cloud, p.trunk),
    cyl(0.07, 0.09, 5.8, 5, 0, 0.3, 0.2, p.trunk),
    tri(v(0.04, 0.9, 0.0), v(0.04, 5.8, 0.15), v(0.04, 0.9, 2.1), main),
    tri(v(-0.04, 0.9, 0.0), v(-0.04, 0.9, 2.1), v(-0.04, 5.8, 0.15), main),
    tri(v(0.04, 0.9, -0.2), v(0.04, 4.9, 0.0), v(0.04, 0.9, -1.8), p.awning),
    tri(v(-0.04, 0.9, -0.2), v(-0.04, 0.9, -1.8), v(-0.04, 4.9, 0.0), p.awning),
  ];
}

function rowboat(p: ScenePalette): Part[] {
  return [...hull(3.2, 1.3, blend(p.shutter, p.trunk, 0.2), p.trunk), box(1.0, 0.07, 0.2, 0, 0.55, 0.2, p.trunk), box(0.07, 0.07, 2.2, 0.8, 0.6, 0, p.trunk)];
}

/** From the beach out over the water: the deck on its posts, a lamp at the end, a rowboat and a sailboat riding the swell. */
function pier(p: ScenePalette): PieceModel {
  const len = 34;
  const wood = p.trunk;
  const parts: Part[] = [];
  const planks = Math.floor(len / 0.55);
  for (let i = 0; i < planks; i++) {
    parts.push(box(3.2, 0.12, 0.5, 0, 0.55, i * 0.55 + 0.27, tone(wood, 0.88 + (i % 3) * 0.07)));
  }
  for (let z = 0; z <= len; z += 3.3) {
    for (const x of [-1.55, 1.55]) {
      parts.push(cyl(0.16, 0.2, 3.4, 6, x, -2.4, z, tone(wood, 0.7)));
      parts.push(cyl(0.2, 0.2, 0.18, 6, x, 1.0, z, tone(wood, 0.6)));
    }
    parts.push(box(3.4, 0.14, 0.2, 0, 0.38, z, tone(wood, 0.75)));
  }
  // Rope rails at the end and a little lamp.
  parts.push(cyl(0.05, 0.05, 2.2, 4, 0, 0.6, len, tone(p.ink, 1.6)), ball(0.2, 0, 2.9, len, p.lampGlass));
  return {
    parts,
    afloat: [
      { parts: rowboat(p), x: 3.6, z: 22, yaw: 1.57, sink: 0.15, bob: [0.07, 1.1], roll: [0.04, 0.9] },
      { parts: sailboat(p), x: -14, z: 46, yaw: 0.4, sink: 0.2, bob: [0.09, 0.8], roll: [0.05, 0.7] },
    ],
    colliders: [],
  };
}

/** Three parasols with towels and deck chairs, a sandcastle with a flag, a bucket and a beach ball. */
function beach(p: ScenePalette): PieceModel {
  const parts: Part[] = [];
  const colliders: Collider[] = [];
  const stripe = [p.awning, blend(p.awning, p.cloud, 0.8), p.flag, blend(p.shutter, p.cloud, 0.3)];
  for (let k = 0; k < 3; k++) {
    const x = -5 + k * 5.2;
    const z = (k % 2) * 2.2;
    parts.push(cyl(0.04, 0.04, 2.6, 4, x, 0, z, tone(p.concrete, 0.9)));
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const g = new THREE.ConeGeometry(1.45, 0.62, 1, 1, false, a, (Math.PI * 2) / n).translate(x, 2.9, z);
      parts.push(paint(g, (i + k) % 2 ? stripe[k % stripe.length] : stripe[(k + 1) % stripe.length]));
    }
    parts.push(box(1.1, 0.04, 2.2, x + 1.2, 0.02, z + 0.4, stripe[(k + 1) % stripe.length], { rotY: 0.3 + k }));
    parts.push(box(0.7, 0.12, 1.2, x - 1.3, 0.28, z + 0.9, p.wallCream, { rotY: -0.2 }), box(0.7, 0.6, 0.1, x - 1.3, 0.3, z + 0.35, tone(p.wallCream, 0.9), { rotY: -0.2 }));
    colliders.push({ x, z, r: 0.2, h: 2.9 });
  }
  // The sandcastle, the bucket and the ball, far enough up the beach to walk along the water in front.
  const sand = blend(p.sand, p.rock, 0.12);
  const cz = 2.9;
  parts.push(cyl(1.3, 1.5, 0.8, 8, 3.5, 0, cz, sand), cyl(0.5, 0.6, 1.3, 8, 3.5, 0.8, cz, tone(sand, 1.05)), cyl(0.0, 0.62, 0.5, 8, 3.5, 2.1, cz, tone(sand, 0.95)));
  for (const [dx, dz] of [[-1.1, 0.5], [1.0, -0.6]]) parts.push(cyl(0.3, 0.38, 0.7, 7, 3.5 + dx, 0.3, cz + dz, tone(sand, 1.02)));
  parts.push(cyl(0.02, 0.02, 1.0, 4, 3.5, 2.5, cz, tone(p.trunk, 0.9)), box(0.5, 0.3, 0.03, 3.75, 3.1, cz, p.awning));
  parts.push(cyl(0.25, 0.2, 0.3, 8, 5.6, 0, cz - 0.1, p.flag), ball(0.45, 6.4, 0.5, cz + 1.1, p.cloud, 1, 1));
  colliders.push({ x: 3.5, z: cz, r: 1.6, h: 2.2 });
  return { parts, colliders };
}

/** A wooden ladder from its foot `a` to its top `b`, `w` wide. */
function ladder(a: THREE.Vector3, b: THREE.Vector3, w: number, color: THREE.Color): Part[] {
  const side = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3(0, 1, 0));
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize().multiplyScalar(w / 2);
  const out: Part[] = [bar(a.clone().add(side), b.clone().add(side), 0.07, color), bar(a.clone().sub(side), b.clone().sub(side), 0.07, color)];
  const rungs = Math.max(2, Math.round(a.distanceTo(b) / 0.4));
  for (let i = 1; i < rungs; i++) {
    const at = a.clone().lerp(b, i / rungs);
    out.push(bar(at.clone().add(side), at.clone().sub(side), 0.05, tone(color, 1.1)));
  }
  return out;
}

/** Five beach huts in a row, each on a deck on short stilts with its door to the sea, and a lifeguard tower at the end. */
function beachHuts(p: ScenePalette): PieceModel {
  const parts: Part[] = [];
  const colliders: Collider[] = [];
  const boxes: NonNullable<PieceModel["boxes"]> = [];
  const blockers: Collider[] = [];
  const white = blend(p.wallCream, WHITE, 0.6);
  const wood = p.trunk;
  const colors = [p.roofCoral, p.shutter, p.flag, p.roofRose, blend(p.windowLight, p.shutter, 0.4)];
  // The huts' front walls stand on z = F, their decks reaching toward the sea.
  const F = -1.4;
  colors.forEach((c, i) => {
    const x = -10 + i * 3.7;
    for (const sx of [-1.35, 1.35]) for (const sz of [F - 2.1, F + 0.95]) parts.push(cyl(0.1, 0.1, 1.6, 5, x + sx, -1.3, sz, tone(wood, 0.7)));
    parts.push(box(3.1, 0.3, 3.4, x, 0, F - 0.6, tone(wood, 0.92)));
    parts.push(box(2.6, 2.5, 2.2, x, 0.3, F - 1.1, c, { bottom: 0.84, top: 1.06 }));
    // Plank lines and white corner boards; a white door with a band of the hut's color; a round window in the gable.
    for (const dx of [-0.65, 0.65]) parts.push(box(0.05, 2.5, 0.04, x + dx, 0.3, F + 0.02, tone(c, 0.82)));
    for (const dx of [-1.27, 1.27]) parts.push(box(0.14, 2.5, 0.1, x + dx, 0.3, F + 0.01, white));
    parts.push(box(1.0, 1.85, 0.06, x, 0.3, F + 0.03, white), box(1.0, 0.3, 0.07, x, 1.45, F + 0.05, tone(c, 0.88)));
    parts.push(gable(2.6, 2.2, 1.05, x, 2.8, F - 1.1, i % 2 ? white : tone(c, 0.78), c, { overhang: 0.24 }));
    parts.push(paint(new THREE.CircleGeometry(0.22, 10).translate(x, 3.25, F + 0.02), p.window));
    parts.push(box(1.2, 0.16, 0.45, x, 0, F + 1.32, tone(wood, 0.8)));
    boxes.push({ x, z: F - 0.375, hx: 1.55, hz: 1.93, h: 4 });
    blockers.push({ x, z: F - 1.1, r: 1.7, h: 3.9 });
  });
  // The lifeguard tower: stilts and braces, a railed platform, a hut with a hip roof, a ladder up the front, a flag and a life ring.
  const tx = 11;
  const tz = F + 1.6;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push(cyl(0.1, 0.13, 4.3, 5, tx + sx * 1.05, -1.2, tz + sz * 1.05, white));
    parts.push(bar(v(tx + sx * 1.05, 0.3, tz - 1.05), v(tx + sx * 1.05, 2.8, tz + 1.05), 0.07, tone(white, 0.85)));
  }
  parts.push(box(2.9, 0.2, 2.9, tx, 3.1, tz, tone(wood, 0.9)));
  // The rails: both sides, and the front either side of the ladder.
  for (const [x0, x1] of [[tx - 1.45, tx - 0.6], [tx + 0.2, tx + 1.45]]) parts.push(box(x1 - x0, 0.08, 0.08, (x0 + x1) / 2, 3.85, tz + 1.4, white));
  for (const sx of [-1, 1]) parts.push(box(0.08, 0.08, 2.9, tx + sx * 1.4, 3.85, tz, white));
  for (const [x, z] of [[tx - 1.4, tz + 1.4], [tx + 1.4, tz + 1.4], [tx - 0.6, tz + 1.4], [tx + 0.2, tz + 1.4], [tx - 1.4, tz - 1.4], [tx + 1.4, tz - 1.4]]) parts.push(box(0.08, 0.75, 0.08, x, 3.3, z, white));
  parts.push(box(2.0, 1.55, 1.7, tx, 3.3, tz - 0.4, white, { bottom: 0.9, top: 1.04 }), box(1.7, 0.55, 0.06, tx, 4.1, tz + 0.46, p.window));
  parts.push(pyramid(2.6, 2.4, 0.9, tx, 4.85, tz - 0.4, p.awning));
  parts.push(...ladder(v(tx - 0.2, -1.2, tz + 2.05), v(tx - 0.2, 3.2, tz + 1.45), 0.7, tone(wood, 0.85)));
  parts.push(cyl(0.035, 0.035, 2.2, 4, tx + 1.3, 3.2, tz + 1.3, tone(p.ink, 1.6)));
  parts.push(tri(v(tx + 1.3, 5.3, tz + 1.3), v(tx + 1.3, 4.75, tz + 1.3), v(tx + 2.25, 5.0, tz + 1.3), p.awning), tri(v(tx + 1.3, 4.75, tz + 1.3), v(tx + 1.3, 5.3, tz + 1.3), v(tx + 2.25, 5.0, tz + 1.3), p.awning));
  parts.push(paint(new THREE.TorusGeometry(0.36, 0.09, 6, 14).translate(tx + 1.05, 2.4, tz + 1.17), p.awning));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) colliders.push({ x: tx + sx * 1.05, z: tz + sz * 1.05, r: 0.3, h: 5.8 });
  colliders.push({ x: tx - 0.2, z: tz + 1.8, r: 0.45, h: 3.3 });
  blockers.push({ x: tx, z: tz, r: 1.8, h: 5.8 });
  return { parts, colliders, boxes, blockers };
}

/** An open canoe: its shell, the darker inside, two thwarts; its keel at y 0 and its bow toward +z. */
function canoe(len: number, wide: number, color: THREE.Color, wood: THREE.Color): Part[] {
  const shell = () => new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(wide / 2, 0.5, len / 2).translate(0, 0.5, 0);
  return [
    paint(shell(), color),
    inside(paint(shell().scale(0.9, 0.9, 0.95).translate(0, 0.05, 0), tone(color, 0.6))),
    box(wide * 0.86, 0.05, 0.12, 0, 0.4, -0.22 * len, tone(wood, 1.1)),
    box(wide * 0.86, 0.05, 0.12, 0, 0.4, 0.22 * len, tone(wood, 1.1)),
  ];
}

/** A boathouse on a deck on stilts at the shore: upright planks, a slate roof, an open door onto a porch, a ramp down to the sand with a canoe pulled up on it. */
function boathouse(p: ScenePalette): PieceModel {
  const parts: Part[] = [];
  const wood = p.trunk;
  const plank = blend(p.wallStone, wood, 0.55);
  const white = blend(p.wallCream, WHITE, 0.6);
  const deckY = 0.5;
  const y0 = deckY + 0.3;
  // The deck on stilts, reaching a porch in front of the door.
  parts.push(box(9.0, 0.3, 7.4, 0, deckY, -1.3, tone(wood, 0.9)));
  for (const sx of [-4.2, 0, 4.2]) for (const sz of [-4.8, -1.3, 2.2]) parts.push(cyl(0.16, 0.2, 2.4, 6, sx, deckY - 2.1, sz, tone(wood, 0.62)));
  // Back and side walls, a front with a wide doorway, a slate roof.
  parts.push(box(7.0, 3.4, 0.3, 0, y0, -4.35, plank, { bottom: 0.85, top: 1.05 }));
  for (const sx of [-1, 1]) parts.push(box(0.3, 3.4, 6.0, sx * 3.35, y0, -1.5, plank, { bottom: 0.85, top: 1.05 }));
  for (const sx of [-1, 1]) parts.push(box(1.2, 3.4, 0.3, sx * 2.9, y0, 1.35, plank, { bottom: 0.85, top: 1.05 }));
  parts.push(box(7.0, 0.7, 0.3, 0, y0 + 2.7, 1.35, tone(plank, 0.95)));
  for (let i = -3; i <= 3; i++) parts.push(box(0.05, 3.4, 0.04, i * 0.95, y0, -4.52, tone(plank, 0.8)));
  parts.push(gable(7.0, 6.0, 2.1, 0, y0 + 3.4, -1.5, p.roofSlate, plank, { overhang: 0.4 }));
  // The dark inside, seen through the door, and a window in each side wall.
  parts.push(box(4.4, 2.6, 0.08, 0, y0, -4.15, tone(p.window, 0.7)));
  for (const sx of [-1, 1]) parts.push(box(0.08, 1.0, 1.4, sx * 3.52, y0 + 1.5, -2.2, white), box(0.1, 0.8, 1.2, sx * 3.54, y0 + 1.6, -2.2, p.window));
  // A lantern by the door.
  parts.push(box(0.12, 0.5, 0.12, 3.2, y0 + 2.1, 1.6, tone(p.ink, 1.6)));
  const glass = [box(0.3, 0.4, 0.3, 3.2, y0 + 1.75, 1.75, p.lampGlass)];
  // The ramp from the porch down to the sand, its rails, and the canoe pulled up on it.
  const rampLen = 3.2;
  const slope = Math.atan2(y0, rampLen);
  const run = Math.hypot(y0, rampLen);
  const rz = 2.4 + rampLen / 2;
  parts.push(paint(new THREE.BoxGeometry(2.6, 0.16, run).rotateX(slope).translate(0, y0 / 2 - 0.08, rz), tone(wood, 0.8)));
  for (const sx of [-1.3, 1.3]) parts.push(paint(new THREE.BoxGeometry(0.14, 0.22, run).rotateX(slope).translate(sx, y0 / 2, rz), tone(wood, 0.6)));
  for (const g of canoe(3.4, 0.95, p.awning, wood)) parts.push(g.rotateX(slope).translate(0.15, 0.5, 3.6));
  // Crates and a pair of oars on the porch.
  parts.push(box(0.8, 0.6, 0.7, -3.6, y0, 1.8, tone(wood, 0.85)), box(0.7, 0.5, 0.6, -3.4, y0 + 0.6, 1.7, tone(wood, 0.95), { rotY: 0.4 }));
  parts.push(bar(v(3.9, y0, 1.8), v(3.6, y0 + 2.2, 2.2), 0.06, tone(wood, 1.1)), bar(v(4.1, y0, 1.7), v(3.9, y0 + 2.2, 2.3), 0.06, tone(wood, 1.05)));
  // The whole boathouse stands a little back, to leave the beach in front free to walk along.
  const Z0 = -1.0;
  for (const g of [...parts, ...glass]) g.translate(0, 0, Z0);
  return {
    parts,
    glass,
    colliders: [],
    boxes: [
      { x: 0, z: -1.3 + Z0, hx: 4.6, hz: 3.75, h: y0 + 5.6 },
      { x: 0, z: rz + Z0, hx: 1.4, hz: rampLen / 2, h: 1.4 },
    ],
    blockers: [{ x: 0, z: -1.5 + Z0, r: 4.5, h: y0 + 5.6 }],
  };
}

/* ---------------- inland ---------------- */

function windmill(p: ScenePalette): PieceModel {
  const wall = blend(p.wallCream, WHITE, 0.3);
  // A footing under the base, for the hillside.
  const tower: Part[] = [cyl(3.2, 3.3, 1.5, 8, 0, -1.5, 0, tone(p.wallStone, 0.9)), cyl(2.2, 3.2, 1.0, 8, 0, 0, 0, p.wallStone), cyl(1.5, 2.8, 8.0, 8, 0, 0.9, 0, wall, { bottom: 0.8, top: 1.08 })];
  tower.push(cyl(0.0, 2.2, 2.6, 8, 0, 8.7, 0, p.roofCoral));
  tower.push(box(1.2, 2.0, 0.3, 0, 0.9, 2.55, blend(p.trunk, p.ink, 0.25)));
  for (const y of [3.6, 6.1]) tower.push(box(0.8, 1.0, 0.3, 0, y, 2.05 - (y - 3.6) * 0.07, p.window));
  tower.push(box(0.7, 0.5, 1.3, 0, 7.5, 1.9, tone(p.trunk, 0.9)));
  // The sails: a hub and four arms with lattice frames and cloth, around the hub (+z toward the front).
  const sails: Part[] = [ball(0.45, 0, 0, 0, tone(p.trunk, 0.85)), cyl(0.12, 0.12, 0.9, 5, 0, 0, 0, tone(p.trunk, 0.8))];
  for (let i = 0; i < 4; i++) {
    const arm = (parts: Part[]) => parts.map((q) => q.rotateZ((i * Math.PI) / 2));
    sails.push(
      ...arm([
        box(0.22, 9.6, 0.2, 0, 0.0, 0, tone(p.trunk, 0.8)),
        box(1.6, 5.2, 0.1, 0.95, 2.4, 0.05, blend(p.cloud, p.wallCream, 0.4)),
        box(0.1, 5.2, 0.14, 0.95, 2.4, 0.08, tone(p.trunk, 0.85)),
        box(1.6, 0.1, 0.14, 0.95, 4.2, 0.08, tone(p.trunk, 0.85)),
        box(1.6, 0.1, 0.14, 0.95, 2.4, 0.08, tone(p.trunk, 0.85)),
      ]),
    );
  }
  return {
    parts: tower,
    turn: { parts: sails, at: v(0, 7.4, 2.7), axis: "z", speed: 0.35, rest: 0.4 },
    colliders: [{ x: 0, z: 0, r: 3.3, h: 11.4 }],
    blockers: [{ x: 0, z: 0, r: 3.9, h: 11.4 }],
  };
}

function waterTower(p: ScenePalette): PieceModel {
  const steel = blend(p.navy, p.concrete, 0.4);
  const parts: Part[] = [];
  const colliders: Collider[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // The legs reach a little below the ground, for the hillside.
      parts.push(cyl(0.16, 0.2, 8.2, 5, sx * 2.0, -1, sz * 2.0, steel));
      colliders.push({ x: sx * 2.0, z: sz * 2.0, r: 0.4, h: 7 });
    }
  }
  for (const y of [2.2, 4.8]) {
    parts.push(box(4.4, 0.12, 0.12, 0, y, 2.0, steel), box(4.4, 0.12, 0.12, 0, y, -2.0, steel), box(0.12, 0.12, 4.4, 2.0, y, 0, steel), box(0.12, 0.12, 4.4, -2.0, y, 0, steel));
  }
  parts.push(cyl(3.0, 3.0, 3.2, 12, 0, 7.2, 0, blend(p.wallCream, p.flag, 0.15), { bottom: 0.82, top: 1.06 }), cyl(0.0, 3.2, 1.6, 12, 0, 10.4, 0, p.roofSlate), ball(0.25, 0, 12.1, 0, tone(p.ink, 1.6)));
  return { parts, colliders, blockers: [{ x: 0, z: 0, r: 3.2, h: 12.2 }] };
}

function tent(p: ScenePalette, color: THREE.Color): Part[] {
  return [
    gable(3.4, 4.0, 2.4, 0, 0, 0, color, tone(color, 0.8), { overhang: 0.05 }),
    box(1.0, 1.7, 0.08, 0, 0, 1.9, tone(color, 0.45)),
    box(0.06, 0.1, 4.4, 0, 2.38, 0, tone(p.trunk, 0.8)),
  ];
}

/** Two tents, a fire in a ring of stones, three log seats around it. */
function campsite(p: ScenePalette): PieceModel {
  const loose: Loose[] = [
    { x: -4, z: -1.5, parts: tent(p, p.roofCoral).map((g) => g.translate(-4, 0, -1.5)) },
    { x: 3.4, z: -2.4, parts: tent(p, p.roofSlate).map((g) => g.rotateY(0.5).translate(3.4, 0, -2.4)) },
  ];
  const fire: Part[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    fire.push(ball(0.28, Math.cos(a) * 0.95, 0.15, Math.sin(a) * 0.95 + 1.2, tone(p.rock, 0.85 + (i % 3) * 0.1), 0.7));
  }
  fire.push(cyl(0.7, 0.55, 0.5, 8, 0, 0.0, 1.2, tone(p.ink, 1.4)));
  const flame = [paint(new THREE.ConeGeometry(0.45, 1.2, 5).translate(0, 0.9, 1.2), p.flag), paint(new THREE.ConeGeometry(0.25, 0.8, 5).translate(0.1, 0.75, 1.3), blend(p.flag, WHITE, 0.5))];
  loose.push({ x: 0, z: 1.2, parts: fire, lit: flame });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const x = Math.cos(a) * 2.7;
    const z = Math.sin(a) * 2.7 + 1.2;
    loose.push({ x, z, parts: [paint(new THREE.CylinderGeometry(0.3, 0.3, 1.5, 7).rotateZ(Math.PI / 2).rotateY(-a + Math.PI / 2).translate(x, 0.3, z), tone(p.trunk, 0.9))] });
  }
  return { parts: [], loose, colliders: [{ x: -4, z: -1.5, r: 2.0, h: 2.4 }, { x: 3.4, z: -2.4, r: 2.0, h: 2.4 }] };
}

/** Three haystacks, rows of crops, a scarecrow and a stone wall in front. */
function farm(p: ScenePalette, rand: () => number): PieceModel {
  const loose: Loose[] = [];
  const colliders: Collider[] = [];
  for (let i = 0; i < 3; i++) {
    const x = -6 + i * 4.4;
    const z = -3 + (i % 2) * 1.6;
    loose.push({ x, z, parts: haystack(p).map((g) => g.translate(x, 0, z)) });
    colliders.push({ x, z, r: 1.7, h: 2.7 });
  }
  // The wall in four lengths, each on the ground where it stands.
  for (let k = 0; k < 4; k++) loose.push({ x: -5.25 + k * 3.5, z: 5, parts: stoneWall(3.5, p).map((g) => g.translate(-7 + k * 3.5, 0, 5)) });
  const crop = blend(p.grassTip, p.grass, 0.4);
  for (let row = 0; row < 8; row++) {
    for (let i = 0; i < 7; i++) {
      const x = 3.0 + i * 1.1;
      const z = -2 + row * 0.9;
      loose.push({ x, z, parts: [ball(0.3 + rand() * 0.08, x, 0.28, z, row % 2 ? crop : blend(crop, p.tree, 0.35), 0.8)] });
    }
  }
  // The scarecrow on a post in the crops.
  loose.push({
    x: 8.2,
    z: 3.3,
    parts: [cyl(0.07, 0.07, 2.4, 5, 8.2, 0, 3.3, p.trunk), box(1.7, 0.1, 0.1, 8.2, 1.6, 3.3, p.trunk), box(0.5, 0.8, 0.3, 8.2, 1.2, 3.3, p.roofSlate), ball(0.25, 8.2, 2.35, 3.3, p.wallCream), cyl(0.5, 0.5, 0.04, 10, 8.2, 2.5, 3.3, tone(p.flag, 0.95)), cyl(0.2, 0.28, 0.25, 8, 8.2, 2.5, 3.3, tone(p.flag, 0.9))],
  });
  colliders.push({ x: 8.2, z: 3.3, r: 0.4, h: 2.8 });
  return { parts: [], loose, colliders, boxes: [{ x: 0, z: 5, hx: 7, hz: 0.3, h: 1.1 }] };
}

/** A wheelbarrow, its wheel toward +x and its handles toward -x. */
function wheelbarrow(p: ScenePalette): Part[] {
  return [
    box(1.2, 0.35, 0.8, 0, 0.42, 0, p.roofSlate, { bottom: 0.85, top: 1.05 }),
    paint(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 10).rotateX(Math.PI / 2).translate(0.78, 0.28, 0), tone(p.ink, 1.5)),
    bar(v(0.5, 0.42, 0.12), v(0.78, 0.28, 0.0), 0.05, p.trunk),
    bar(v(0.5, 0.42, -0.12), v(0.78, 0.28, 0.0), 0.05, p.trunk),
    bar(v(-0.45, 0.6, 0.3), v(-1.35, 0.75, 0.36), 0.06, p.trunk),
    bar(v(-0.45, 0.6, -0.3), v(-1.35, 0.75, -0.36), 0.06, p.trunk),
    bar(v(-0.4, 0.45, 0.3), v(-0.45, 0, 0.3), 0.05, p.trunk),
    bar(v(-0.4, 0.45, -0.3), v(-0.45, 0, -0.3), 0.05, p.trunk),
  ];
}

/** Three rows of fruit trees, a ladder against one, crates of picked fruit and a wheelbarrow. */
function orchard(p: ScenePalette, rand: () => number): PieceModel {
  const loose: Loose[] = [];
  const colliders: Collider[] = [];
  const blockers: Collider[] = [];
  const fruitColors = [p.roofCoral, p.flag, p.awning];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const x = -6 + col * 4 + (row % 2) * 0.8;
      const z = -4 + row * 3.8;
      const fruit = fruitColors[(row + col) % fruitColors.length];
      const parts: Part[] = [cyl(0.13, 0.19, 1.5, 5, x, 0, z, p.trunk), ball(1.25, x, 2.3, z, tone(p.tree, 0.95 + rand() * 0.15), 0.82), ball(0.78, x + 0.55, 2.75, z - 0.3, blend(p.tree, p.grassTip, 0.28), 0.8)];
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + rand();
        parts.push(ball(0.13, x + Math.cos(a) * 1.12, 1.9 + rand() * 0.9, z + Math.sin(a) * 1.12, fruit, 1));
      }
      if (row === 1 && col === 2) parts.push(...ladder(v(x + 0.1, 0, z + 1.4), v(x - 0.5, 2.6, z + 0.45), 0.6, tone(p.trunk, 1.1)));
      loose.push({ x, z, parts });
      colliders.push({ x, z, r: 0.35, h: 3.3 });
      blockers.push({ x, z, r: 1.3, h: 3.4 });
    }
  }
  for (let i = 0; i < 3; i++) {
    const x = -4 + i * 1.1;
    const parts = [box(0.9, 0.5, 0.65, x, 0, 6.2, tone(p.trunk, 0.85 + i * 0.05))];
    for (let k = 0; k < 4; k++) parts.push(ball(0.14, x - 0.2 + (k % 2) * 0.4, 0.6, 6.05 + (k >> 1) * 0.3, fruitColors[i], 1));
    loose.push({ x, z: 6.2, parts });
  }
  loose.push({ x: 3.2, z: 6.3, parts: wheelbarrow(p).map((g) => g.rotateY(2.6).translate(3.2, 0, 6.3)) });
  colliders.push({ x: -2.9, z: 6.2, r: 1.6, h: 0.7 }, { x: 3.2, z: 6.3, r: 0.9, h: 0.9 });
  return { parts: [], loose, colliders, blockers };
}

/** A small observatory: a white drum on a stone plinth, a dome that turns slowly with its slit and telescope, a door with steps, a bench. */
function observatory(p: ScenePalette): PieceModel {
  const white = blend(p.wallCream, WHITE, 0.55);
  const stone = tone(p.wallStone, 1.02);
  // The plinth reaches below the ground, for the hillside.
  const parts: Part[] = [cyl(3.2, 3.45, 1.95, 16, 0, -1.5, 0, p.wallStone, { bottom: 0.7, top: 1 })];
  parts.push(cyl(2.9, 2.9, 3.0, 16, 0, 0.45, 0, white, { bottom: 0.84, top: 1.05 }));
  parts.push(cyl(3.0, 3.0, 0.22, 16, 0, 3.4, 0, p.roofSlate));
  parts.push(box(1.1, 2.0, 0.25, 0, 0.45, 2.82, tone(p.trunk, 0.8)), box(1.4, 0.15, 0.3, 0, 2.45, 2.85, p.roofSlate));
  for (const a of [-0.9, 0.9]) parts.push(box(0.55, 0.75, 0.12, Math.sin(a) * 2.88, 1.8, Math.cos(a) * 2.88, p.window, { rotY: a }));
  parts.push(box(1.7, 0.2, 0.7, 0, 0, 3.75, stone), box(1.7, 0.42, 0.5, 0, 0, 3.25, tone(stone, 0.96)));
  // A bench beside the path.
  parts.push(box(1.8, 0.1, 0.5, 3.6, 0.5, 3.6, p.trunk, { rotY: -0.6 }), box(0.1, 0.5, 0.45, 3.0, 0, 3.15, tone(p.ink, 1.6), { rotY: -0.6 }), box(0.1, 0.5, 0.45, 4.2, 0, 4.05, tone(p.ink, 1.6), { rotY: -0.6 }));
  // The dome, the slit up its front and the telescope turn together about the drum's axis.
  const domeY = 3.62;
  const R = 2.92;
  const dome: Part[] = [paint(new THREE.SphereGeometry(R, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, domeY, 0), blend(p.cloud, p.roofSlate, 0.3))];
  for (let i = 0; i < 6; i++) {
    const phi = 0.1 + i * 0.27;
    dome.push(paint(new THREE.BoxGeometry(0.85, 0.08, 0.82).rotateX(Math.PI / 2 - phi).translate(0, domeY + Math.sin(phi) * (R + 0.02), Math.cos(phi) * (R + 0.02)), tone(p.window, 0.8)));
  }
  const e = 0.8;
  dome.push(paint(new THREE.CylinderGeometry(0.24, 0.32, 3.2, 8).rotateX(Math.PI / 2 - e).translate(0, domeY + 2.4 * Math.sin(e), 2.4 * Math.cos(e)), blend(p.concrete, p.ink, 0.3)));
  dome.push(paint(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8).rotateX(Math.PI / 2 - e).translate(0, domeY + 4.0 * Math.sin(e), 4.0 * Math.cos(e)), tone(p.ink, 1.5)));
  return {
    parts,
    turn: { parts: dome, at: v(0, 0, 0), axis: "y", speed: 0.05, rest: 0 },
    colliders: [{ x: 0, z: 0, r: 3.4, h: 6.6 }, { x: 3.6, z: 3.6, r: 0.9, h: 0.7 }],
    blockers: [{ x: 0, z: 0, r: 3.8, h: 6.8 }],
  };
}

/** A greenhouse: a brick base, a white frame glazed all round and over the roof, planting beds inside; a water barrel and a stack of pots outside. */
function greenhouse(p: ScenePalette): PieceModel {
  const parts: Part[] = [];
  const panes: Part[] = [];
  const white = blend(p.wallCream, WHITE, 0.7);
  const W = 8;
  const D = 4.6;
  const base = 0.6;
  const wallH = 2.4;
  const roofH = 1.5;
  const eave = base + wallH;
  const ridge = eave + roofH;
  // The base reaches below the ground, for the hillside.
  parts.push(box(W + 0.3, base + 1.2, D + 0.3, 0, -1.2, 0, blend(p.roofCoral, p.wallStone, 0.55), { bottom: 0.7, top: 1 }));
  // Posts on every bay, a rafter over each, the eaves, the sills and the ridge.
  const bays = 5;
  for (let i = 0; i <= bays; i++) {
    const x = -W / 2 + (W * i) / bays;
    for (const z of [-D / 2, D / 2]) {
      parts.push(box(0.1, wallH, 0.1, x, base, z, white));
      parts.push(bar(v(x, eave, z), v(x, ridge, 0), 0.09, white));
    }
  }
  for (const z of [-D / 2, D / 2]) parts.push(box(W, 0.1, 0.12, 0, eave, z, white), box(W, 0.1, 0.12, 0, base + 0.02, z, white));
  for (const x of [-W / 2, W / 2]) parts.push(box(0.1, 0.1, D, x, eave, 0, white), box(0.1, wallH, 0.1, x, base, 0, white));
  parts.push(box(W + 0.1, 0.14, 0.14, 0, ridge - 0.07, 0, white));
  // The glass: both long walls, both ends with their gables, both roof slopes.
  for (const z of [-D / 2, D / 2]) panes.push(box(W - 0.1, wallH - 0.1, 0.05, 0, base + 0.05, z, p.windowLight));
  for (const x of [-W / 2, W / 2]) {
    panes.push(box(0.05, wallH - 0.1, D - 0.1, x, base + 0.05, 0, p.windowLight));
    const end = new THREE.BufferGeometry().setFromPoints([v(x, eave, -D / 2), v(x, eave, D / 2), v(x, ridge, 0)]);
    end.computeVertexNormals();
    panes.push(paint(end, p.windowLight));
  }
  const slope = Math.atan2(roofH, D / 2);
  const run = Math.hypot(roofH, D / 2);
  for (const s of [-1, 1]) panes.push(paint(new THREE.BoxGeometry(W, 0.05, run).rotateX(s * slope).translate(0, eave + roofH / 2, (s * D) / 4), p.windowLight));
  // Two planting beds, greens with a few flowers.
  for (const z of [-1.05, 1.05]) {
    parts.push(box(W - 1.2, 0.5, 1.0, 0, base, z, tone(p.trunk, 0.8)));
    for (let i = 0; i < 9; i++) parts.push(ball(0.3 + (i % 3) * 0.06, -W / 2 + 1.0 + i * 0.75, base + 0.7, z + ((i % 2) - 0.5) * 0.3, i % 4 === 1 ? p.bloom : blend(p.tree, p.grassTip, (i % 3) * 0.2), 0.85));
  }
  // A door in the middle of the front, a water barrel and a stack of pots outside.
  parts.push(box(1.1, 2.0, 0.08, 0, base, D / 2 + 0.06, tone(white, 0.92)), box(0.08, 0.08, 0.12, 0.38, base + 1.0, D / 2 + 0.12, tone(p.ink, 1.5)));
  parts.push(cyl(0.45, 0.42, 1.0, 10, W / 2 + 0.9, 0, 1.2, blend(p.shutter, p.ink, 0.25)), cyl(0.46, 0.46, 0.06, 10, W / 2 + 0.9, 0.98, 1.2, tone(p.ink, 1.5)));
  for (let i = 0; i < 3; i++) parts.push(cyl(0.3, 0.22, 0.32, 8, -W / 2 - 0.8, i * 0.24, 1.6, blend(p.roofCoral, p.sand, 0.3)));
  return {
    parts,
    panes,
    colliders: [{ x: W / 2 + 0.9, z: 1.2, r: 0.55, h: 1.1 }, { x: -W / 2 - 0.8, z: 1.6, r: 0.4, h: 0.8 }],
    boxes: [{ x: 0, z: 0, hx: W / 2 + 0.2, hz: D / 2 + 0.2, h: ridge }],
    blockers: [{ x: 0, z: 0, r: 4.8, h: ridge }],
  };
}

/* ---------------- the kinds ---------------- */

export type PieceKind = "lighthouse" | "pier" | "beach" | "huts" | "boathouse" | "windmill" | "farm" | "camp" | "tower" | "orchard" | "observatory" | "greenhouse";

export interface PieceSpec {
  /** On the shore facing the sea, or inland on the hills facing the plaza. */
  coast: boolean;
  /** A landmark: one at most on the island. */
  once?: boolean;
  /** Inland: how far outside (+) or inside (−) the ring of districts it stands (default −3). */
  ring?: number;
  /** What it is, in a few words (the kit gallery's caption). */
  title: string;
  build(p: ScenePalette, rand: () => number): PieceModel;
}

/** Every kind, in the order the island hands them out (scenery.ts): each once, then those that may repeat, by turns. */
export const PIECES: Record<PieceKind, PieceSpec> = {
  lighthouse: { coast: true, once: true, title: "A lighthouse", build: lighthouse },
  pier: { coast: true, once: true, title: "A pier, a rowboat and a sailboat", build: pier },
  beach: { coast: true, title: "Parasols, towels and a sandcastle", build: beach },
  huts: { coast: true, title: "Beach huts and a lifeguard tower", build: beachHuts },
  boathouse: { coast: true, title: "A boathouse with a slipway", build: boathouse },
  windmill: { coast: false, once: true, ring: 2, title: "A windmill", build: windmill },
  farm: { coast: false, title: "Haystacks, crops and a scarecrow", build: farm },
  camp: { coast: false, title: "A campsite with a fire", build: campsite },
  tower: { coast: false, once: true, ring: 2, title: "A water tower", build: waterTower },
  orchard: { coast: false, title: "An orchard", build: orchard },
  observatory: { coast: false, once: true, ring: 2, title: "An observatory", build: observatory },
  greenhouse: { coast: false, title: "A greenhouse", build: greenhouse },
};

export const PIECE_KINDS = Object.keys(PIECES) as PieceKind[];
