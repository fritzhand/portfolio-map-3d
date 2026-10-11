/* Set pieces around the island, one or two in each wedge between the districts: out on the coast a
   lighthouse, a pier with a rowboat and a sailboat, a beach with parasols, towels and a sandcastle;
   inland on the hills a windmill (its sails turn), a farm with haystacks and a scarecrow, a campsite
   with a tent and a fire pit, a water tower. They are the places to wander to when no one sent you
   anywhere, and where the keepsakes hide (finds.ts).

   anchorsFor() decides where each piece goes from the layout alone (pure: scenery.test.ts). The
   builder makes each piece from faceted parts (kit.ts), merges them into a few meshes, and
   reports colliders, blockers for the follow camera, the anchors, and an update for the things
   that move (the sails, the boats on the swell). Nothing here is a place on a real map. */
import * as THREE from "three";
import { seededRandom, hashString, type WorldLayout } from "../../data/layout";
import { ball, blend, box, cyl, gable, tone, tri, type Part } from "./kit";
import type { ScenePalette } from "./palette";
import { SEA_LEVEL, type Terrain } from "./terrain";
import { haystack, stoneWall } from "./street";
import { merge, paint } from "./util";
import type { BoxCollider, Collider } from "./world";

export type PieceKind = "lighthouse" | "pier" | "beach" | "windmill" | "farm" | "camp" | "tower";

export interface Anchor {
  kind: PieceKind;
  /** The wedge's bisector angle, and the piece's place on it. */
  angle: number;
  x: number;
  z: number;
  /** Which way the piece faces (three.js rotation.y): toward the island's center, or out to sea. */
  yaw: number;
}

const INLAND: PieceKind[] = ["windmill", "farm", "camp", "tower"];

/** The middle of each wedge between neighboring districts (angles, radians). */
export function wedgeAngles(layout: WorldLayout): number[] {
  const a = layout.discs.map((d) => d.angle).sort((x, y) => x - y);
  if (a.length === 0) return [];
  if (a.length === 1) return [a[0] + Math.PI];
  return a.map((v, i) => {
    const next = i + 1 < a.length ? a[i + 1] : a[0] + Math.PI * 2;
    return (v + next) / 2;
  });
}

/** Where the set pieces stand: coastal ones at the shore, inland ones in the hills between the districts. */
export function anchorsFor(layout: WorldLayout, terrain: Pick<Terrain, "waterlineAt">): Anchor[] {
  const out: Anchor[] = [];
  const wedges = wedgeAngles(layout);
  wedges.forEach((angle, i) => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const shoreR = Math.min(layout.islandRadius - 12, terrain.waterlineAt(angle) - 7);
    const coast: PieceKind = i === 0 ? "lighthouse" : i === 1 ? "pier" : "beach";
    out.push({ kind: coast, angle, x: c * shoreR, z: s * shoreR, yaw: Math.atan2(c, s) });
    // Inland pieces sit on the same bisector, in the hills past the village. A windmill and a water tower are one each.
    const inland = i < INLAND.length ? INLAND[i] : i % 2 ? "farm" : "camp";
    const r = layout.ringRadius + (inland === "windmill" || inland === "tower" ? 2 : -3);
    out.push({ kind: inland, angle, x: c * r, z: s * r, yaw: Math.atan2(-c, -s) });
  });
  return out;
}

export interface Scenery {
  group: THREE.Group;
  colliders: Collider[];
  boxes: BoxCollider[];
  blockers: Collider[];
  anchors: Anchor[];
  update(time: number, reduced: boolean): void;
  dispose(): void;
}

type Own = <T extends { dispose(): void }>(x: T) => T;

const WHITE = new THREE.Color("#ffffff");

/* ---------------- the pieces, each in its own frame: y up, standing on y = 0, the front toward +z ---------------- */

function lighthouse(p: ScenePalette): { parts: Part[]; glass: Part[]; r: number; h: number } {
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
  return { parts, glass, r: 4.0, h: top + 3 };
}

function windmill(p: ScenePalette): { tower: Part[]; sails: Part[]; r: number; h: number; hub: THREE.Vector3 } {
  const wall = blend(p.wallCream, WHITE, 0.3);
  const tower: Part[] = [cyl(2.2, 3.2, 1.0, 8, 0, 0, 0, p.wallStone), cyl(1.5, 2.8, 8.0, 8, 0, 0.9, 0, wall, { bottom: 0.8, top: 1.08 })];
  tower.push(cyl(0.0, 2.2, 2.6, 8, 0, 8.7, 0, p.roofCoral));
  tower.push(box(1.2, 2.0, 0.3, 0, 0.9, 2.55, blend(p.trunk, p.ink, 0.25)));
  for (const y of [3.6, 6.1]) tower.push(box(0.8, 1.0, 0.3, 0, y, 2.05 - (y - 3.6) * 0.07, p.window));
  tower.push(box(0.7, 0.5, 1.3, 0, 7.5, 1.9, tone(p.trunk, 0.9)));
  // The sails: a hub and four arms with lattice frames and cloth, in the sails' own frame (+z toward the front).
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
  return { tower, sails, r: 3.3, h: 11.4, hub: new THREE.Vector3(0, 7.4, 2.7) };
}

function waterTower(p: ScenePalette): { parts: Part[]; r: number; h: number } {
  const steel = blend(p.navy, p.concrete, 0.4);
  const parts: Part[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(cyl(0.16, 0.2, 7.2, 5, sx * 2.0, 0, sz * 2.0, steel));
  for (const y of [2.2, 4.8]) {
    parts.push(box(4.4, 0.12, 0.12, 0, y, 2.0, steel), box(4.4, 0.12, 0.12, 0, y, -2.0, steel), box(0.12, 0.12, 4.4, 2.0, y, 0, steel), box(0.12, 0.12, 4.4, -2.0, y, 0, steel));
  }
  parts.push(cyl(3.0, 3.0, 3.2, 12, 0, 7.2, 0, blend(p.wallCream, p.flag, 0.15), { bottom: 0.82, top: 1.06 }), cyl(0.0, 3.2, 1.6, 12, 0, 10.4, 0, p.roofSlate), ball(0.25, 0, 12.1, 0, tone(p.ink, 1.6)));
  return { parts, r: 2.4, h: 12.2 };
}

function tent(p: ScenePalette, color: THREE.Color): Part[] {
  return [
    gable(3.4, 4.0, 2.4, 0, 0, 0, color, tone(color, 0.8), { overhang: 0.05 }),
    box(1.0, 1.7, 0.08, 0, 0, 1.9, tone(color, 0.45)),
    box(0.06, 0.1, 4.4, 0, 2.38, 0, tone(p.trunk, 0.8)),
  ];
}

function campsite(p: ScenePalette): { parts: Part[]; flame: Part[]; r: number } {
  const parts: Part[] = [];
  parts.push(...tent(p, p.roofCoral).map((g) => g.translate(-4, 0, -1.5)));
  parts.push(...tent(p, p.roofSlate).map((g) => g.rotateY(0.5).translate(3.4, 0, -2.4)));
  // A ring of stones, three log seats and a pot on a tripod.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    parts.push(ball(0.28, Math.cos(a) * 0.95, 0.15, Math.sin(a) * 0.95 + 1.2, tone(p.rock, 0.85 + (i % 3) * 0.1), 0.7));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const x = Math.cos(a) * 2.7;
    const z = Math.sin(a) * 2.7 + 1.2;
    parts.push(paint(new THREE.CylinderGeometry(0.3, 0.3, 1.5, 7).rotateZ(Math.PI / 2).rotateY(-a + Math.PI / 2).translate(x, 0.3, z), tone(p.trunk, 0.9)));
  }
  parts.push(cyl(0.7, 0.55, 0.5, 8, 0, 0.0, 1.2, tone(p.ink, 1.4)).translate(0, 0, 0));
  const flame = [paint(new THREE.ConeGeometry(0.45, 1.2, 5).translate(0, 0.9, 1.2), p.flag), paint(new THREE.ConeGeometry(0.25, 0.8, 5).translate(0.1, 0.75, 1.3), blend(p.flag, WHITE, 0.5))];
  return { parts, flame, r: 6 };
}

function farm(p: ScenePalette, rand: () => number): { parts: Part[]; colliders: Collider[] } {
  const parts: Part[] = [];
  const colliders: Collider[] = [];
  // Three haystacks and a bale, a stone wall, rows of crops, a scarecrow.
  for (let i = 0; i < 3; i++) {
    const x = -6 + i * 4.4;
    const z = -3 + (i % 2) * 1.6;
    parts.push(...haystack(p).map((g) => g.translate(x, 0, z)));
    colliders.push({ x, z, r: 1.7, h: 2.7 });
  }
  const wall = stoneWall(14, p);
  parts.push(...wall.map((g) => g.translate(-7, 0, 5)));
  const crop = blend(p.grassTip, p.grass, 0.4);
  for (let row = 0; row < 8; row++) {
    for (let i = 0; i < 7; i++) {
      const x = 3.0 + i * 1.1;
      const z = -2 + row * 0.9;
      parts.push(ball(0.3 + rand() * 0.08, x, 0.28, z, row % 2 ? crop : blend(crop, p.tree, 0.35), 0.8));
    }
  }
  // The scarecrow on a post in the crops.
  parts.push(cyl(0.07, 0.07, 2.4, 5, 8.2, 0, 3.3, p.trunk), box(1.7, 0.1, 0.1, 8.2, 1.6, 3.3, p.trunk), box(0.5, 0.8, 0.3, 8.2, 1.2, 3.3, p.roofSlate), ball(0.25, 8.2, 2.35, 3.3, p.wallCream), cyl(0.5, 0.5, 0.04, 10, 8.2, 2.5, 3.3, tone(p.flag, 0.95)), cyl(0.2, 0.28, 0.25, 8, 8.2, 2.5, 3.3, tone(p.flag, 0.9)));
  colliders.push({ x: 8.2, z: 3.3, r: 0.4, h: 2.8 });
  return { parts, colliders };
}

function beach(p: ScenePalette): { parts: Part[]; colliders: Collider[] } {
  const parts: Part[] = [];
  const colliders: Collider[] = [];
  const stripe = [p.awning, blend(p.awning, p.cloud, 0.8), p.flag, blend(p.shutter, p.cloud, 0.3)];
  // Three parasols, each with a towel and a deck chair.
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
  // A sandcastle with a flag, a bucket and a beach ball.
  const sand = blend(p.sand, p.rock, 0.12);
  parts.push(cyl(1.3, 1.5, 0.8, 8, 3.5, 0, 4.5, sand), cyl(0.5, 0.6, 1.3, 8, 3.5, 0.8, 4.5, tone(sand, 1.05)), cyl(0.0, 0.62, 0.5, 8, 3.5, 2.1, 4.5, tone(sand, 0.95)));
  for (const [dx, dz] of [[-1.1, 0.5], [1.0, -0.6]]) parts.push(cyl(0.3, 0.38, 0.7, 7, 3.5 + dx, 0.3, 4.5 + dz, tone(sand, 1.02)));
  parts.push(cyl(0.02, 0.02, 1.0, 4, 3.5, 2.5, 4.5, tone(p.trunk, 0.9)), box(0.5, 0.3, 0.03, 3.75, 3.1, 4.5, p.awning));
  parts.push(cyl(0.25, 0.2, 0.3, 8, 5.6, 0, 4.4, p.flag), ball(0.45, 6.4, 0.5, 5.6, p.cloud, 1, 1));
  colliders.push({ x: 3.5, z: 4.5, r: 1.6, h: 2.2 });
  return { parts, colliders };
}

/** A boat's hull: a long, pointed, faceted shell. */
function hull(len: number, wide: number, color: THREE.Color, trim: THREE.Color): Part[] {
  const g = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(wide / 2, 0.55, len / 2).translate(0, 0.5, 0);
  return [paint(g, color), box(wide * 0.8, 0.07, len * 0.7, 0, 0.5, 0, trim)];
}

function sailboat(p: ScenePalette): Part[] {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
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

function pierParts(p: ScenePalette, len: number): { parts: Part[]; boxes: { cx: number; cz: number; hx: number; hz: number }[] } {
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
  return { parts, boxes: [] };
}

/* ---------------- the builder ---------------- */

export function buildScenery(
  layout: WorldLayout,
  terrain: Terrain,
  p: ScenePalette,
  own: Own,
  materials: { prop: () => THREE.Material; glass: THREE.Material; lit: THREE.Material },
): Scenery {
  const group = new THREE.Group();
  group.name = "scenery";
  const colliders: Collider[] = [];
  const boxes: BoxCollider[] = [];
  const blockers: Collider[] = [];
  const anchors = anchorsFor(layout, terrain);
  const rand = seededRandom(hashString("walk-scenery"));
  const prop = own(materials.prop());
  const m4 = new THREE.Matrix4();
  const ground = (x: number, z: number) => Math.max(0, terrain.heightAt(x, z));

  const solid: Part[] = [];
  const glass: Part[] = [];
  const flames: Part[] = [];
  const stand = (into: Part[], parts: Part[], x: number, y: number, z: number, yaw: number) => {
    m4.makeRotationY(yaw).setPosition(x, y, z);
    for (const g of parts) {
      g.applyMatrix4(m4);
      into.push(g);
    }
  };

  const movers: { update(t: number, reduced: boolean): void }[] = [];
  const toLocal = (a: Anchor, lx: number, lz: number) => ({ x: a.x + lx * Math.cos(a.yaw) + lz * Math.sin(a.yaw), z: a.z - lx * Math.sin(a.yaw) + lz * Math.cos(a.yaw) });

  for (const a of anchors) {
    const y = ground(a.x, a.z);
    switch (a.kind) {
      case "lighthouse": {
        const m = lighthouse(p);
        stand(solid, m.parts, a.x, y, a.z, a.yaw);
        stand(glass, m.glass, a.x, y, a.z, a.yaw);
        colliders.push({ x: a.x, z: a.z, r: m.r, h: m.h });
        blockers.push({ x: a.x, z: a.z, r: m.r + 0.5, h: m.h });
        break;
      }
      case "windmill": {
        const m = windmill(p);
        stand(solid, m.tower, a.x, y, a.z, a.yaw);
        colliders.push({ x: a.x, z: a.z, r: m.r, h: m.h });
        blockers.push({ x: a.x, z: a.z, r: m.r + 0.6, h: m.h });
        // The sails turn about the hub, on their own mesh.
        const sails = new THREE.Mesh(own(merge(m.sails)), prop);
        sails.castShadow = true;
        const holder = new THREE.Group();
        holder.position.set(a.x, y, a.z);
        holder.rotation.y = a.yaw;
        sails.position.copy(m.hub);
        holder.add(sails);
        group.add(holder);
        const phase = rand() * 6;
        movers.push({ update: (t, reduced) => (sails.rotation.z = reduced ? 0.4 : t * 0.35 + phase) });
        break;
      }
      case "tower": {
        const m = waterTower(p);
        stand(solid, m.parts, a.x, y, a.z, a.yaw);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) colliders.push({ ...toLocal(a, sx * 2.0, sz * 2.0), r: 0.4, h: 7 });
        blockers.push({ x: a.x, z: a.z, r: 3.2, h: m.h });
        break;
      }
      case "farm": {
        const m = farm(p, rand);
        stand(solid, m.parts, a.x, y, a.z, a.yaw);
        for (const c of m.colliders) colliders.push({ ...toLocal(a, c.x, c.z), r: c.r, h: c.h });
        const w = toLocal(a, 0, 5);
        boxes.push({ x: w.x, z: w.z, hx: 7, hz: 0.3, rot: a.yaw, h: 1.1 });
        break;
      }
      case "camp": {
        const m = campsite(p);
        stand(solid, m.parts, a.x, y, a.z, a.yaw);
        stand(flames, m.flame, a.x, y, a.z, a.yaw);
        colliders.push({ ...toLocal(a, -4, -1.5), r: 2.0, h: 2.4 }, { ...toLocal(a, 3.4, -2.4), r: 2.0, h: 2.4 });
        break;
      }
      case "beach": {
        const m = beach(p);
        stand(solid, m.parts, a.x, y, a.z, a.yaw);
        for (const c of m.colliders) colliders.push({ ...toLocal(a, c.x, c.z), r: c.r, h: c.h });
        break;
      }
      case "pier": {
        // From the beach, out over the water: the deck, its posts, a rowboat and a sailboat riding the swell.
        const len = 34;
        const m = pierParts(p, len);
        const base = a.yaw;
        const out = { x: Math.sin(base), z: Math.cos(base) };
        // The pier's local +z points out to sea (yaw = angle of the outward direction).
        stand(solid, m.parts, a.x, Math.max(0.0, y) + 0.0, a.z, base);
        const row = new THREE.Mesh(own(merge(rowboat(p))), prop);
        row.castShadow = true;
        const sail = new THREE.Mesh(own(merge(sailboat(p))), prop);
        sail.castShadow = true;
        const rowAt = { x: a.x + out.x * 22 + out.z * 3.6, z: a.z + out.z * 22 - out.x * 3.6 };
        const sailAt = { x: a.x + out.x * 46 - out.z * 14, z: a.z + out.z * 46 + out.x * 14 };
        row.position.set(rowAt.x, SEA_LEVEL - 0.15, rowAt.z);
        row.rotation.y = base + 1.57;
        sail.position.set(sailAt.x, SEA_LEVEL - 0.2, sailAt.z);
        sail.rotation.y = base + 0.4;
        group.add(row, sail);
        const ph = rand() * 6;
        movers.push({
          update: (t, reduced) => {
            const tt = reduced ? 0 : t;
            row.position.y = SEA_LEVEL - 0.15 + Math.sin(tt * 1.1 + ph) * 0.07;
            row.rotation.z = Math.sin(tt * 0.9 + ph) * 0.04;
            sail.position.y = SEA_LEVEL - 0.2 + Math.sin(tt * 0.8 + ph * 2) * 0.09;
            sail.rotation.z = Math.sin(tt * 0.7 + ph) * 0.05;
          },
        });
        break;
      }
    }
  }

  const add = (parts: Part[], material: THREE.Material, shadow: boolean) => {
    if (!parts.length) return;
    const m = new THREE.Mesh(own(merge(parts)), material);
    m.castShadow = shadow;
    m.receiveShadow = true;
    group.add(m);
  };
  add(solid, prop, true);
  add(glass, materials.glass, false);
  add(flames, materials.lit, false);

  return {
    group,
    colliders,
    boxes,
    blockers,
    anchors,
    update(time, reduced) {
      for (const m of movers) m.update(time, reduced);
    },
    dispose() {},
  };
}
