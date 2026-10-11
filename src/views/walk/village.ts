/* The village around the plaza: a ring street with houses along its outer side, lamp posts with
   wire strung between them (and bunting on it), crosswalks where the district roads cross, bus
   shelters, picnic spots, signposts at the road mouths, fences and a patchy stone wall at the
   village's edge. The district roads run through gaps the lots leave open.

   lotsFor() decides where every house stands (pure: village.test.ts), from the layout alone: houses
   march around the ring in order, skip the road mouths, and leave small gaps between them.
   buildVillage() then builds the houses and furniture, merges them into a handful of meshes
   (one per sector for the houses, so the cameras cull the far ones), and reports what the world
   needs: walking colliders, boxes for the houses, blockers for the follow camera and spots for
   plants. Everything is built once per mount and disposed with the world. */
import * as THREE from "three";
import { ROAD_WIDTH, VILLAGE, PLAZA_RADIUS, seededRandom, hashString, type WorldLayout } from "../../data/layout";
import { HOUSE_KINDS, buildHouse, type HouseKind } from "./houses";
import { box, blend, type Part } from "./kit";
import type { ScenePalette } from "./palette";
import { fence, fountain, hydrant, lampPost, LAMP_HEIGHT, LAMP_WIRE_SPREAD, LAMP_WIRE_Y, mailbox, picnic, busStop, signPost, stall, stoneWall, trashCan, wire } from "./street";
import { merge, paint } from "./util";
import type { BoxCollider, Collider } from "./world";

/** The footprint each kind's lot is cut for (its widest and deepest build), in world units. */
export const HOUSE_LOT: Record<HouseKind, { w: number; d: number }> = {
  cottage: { w: 9.9, d: 7.5 },
  townhouse: { w: 10.1, d: 7.2 },
  solar: { w: 12.1, d: 7.0 },
  shop: { w: 9.3, d: 7.4 },
  villa: { w: 9.7, d: 7.2 },
  shed: { w: 6.5, d: 5.6 },
};

export interface Lot {
  kind: HouseKind;
  /** Ring angle of the lot's center. */
  angle: number;
  /** The house's center, and its yaw (three.js rotation.y: the front toward the plaza). */
  x: number;
  z: number;
  rot: number;
}

export interface Gap {
  angle: number;
  /** Free arc length between two houses, in world units. */
  width: number;
}

/** Half the width kept clear of a road's center line where it crosses the houses' row. */
const MOUTH = ROAD_WIDTH / 2 + 4.6;
const TAU = Math.PI * 2;

/** An angle brought into [-pi, pi). */
function wrap(a: number): number {
  return ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

/** Where the houses stand, and the gaps between them. Deterministic, and pure. */
export function lotsFor(layout: WorldLayout, seed = "walk-village"): { lots: Lot[]; gaps: Gap[] } {
  const rand = seededRandom(hashString(seed));
  const R = VILLAGE.houseInner;
  const mouth = MOUTH / R;
  const roads = layout.discs.map((d) => d.angle);
  const weights: HouseKind[] = ["cottage", "cottage", "cottage", "townhouse", "townhouse", "solar", "solar", "shop", "villa", "shed"];
  const lots: Lot[] = [];
  const gaps: Gap[] = [];
  const start = 0.11;
  let a = start;
  let firstEdge = 0;
  let last: HouseKind | null = null;
  let guard = 0;
  while (guard++ < 400) {
    let kind = weights[Math.floor(rand() * weights.length)];
    if (kind === last) kind = HOUSE_KINDS[(HOUSE_KINDS.indexOf(kind) + 1 + Math.floor(rand() * 4)) % HOUSE_KINDS.length];
    const { w, d } = HOUSE_LOT[kind];
    const half = (w / 2) / R;
    let center = a + half;
    let jumped = false;
    for (const r of roads) {
      const delta = wrap(center - r);
      if (Math.abs(delta) < half + mouth) {
        center += mouth + half - delta;
        jumped = true;
      }
    }
    if (jumped) {
      // Jumping may land on another road's mouth (rare); check once more.
      for (const r of roads) {
        const delta = wrap(center - r);
        if (Math.abs(delta) < half + mouth) center += mouth + half - delta;
      }
    }
    if (lots.length === 0) firstEdge = center - half;
    else if (center + half > firstEdge + TAU - 0.5 / R) break;
    const radius = R + d / 2;
    const angle = center;
    lots.push({ kind, angle, x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, rot: Math.atan2(-Math.cos(angle), -Math.sin(angle)) });
    last = kind;
    const gap = 0.9 + rand() * 4.6;
    gaps.push({ angle: center + half + gap / R / 2, width: gap });
    a = center + half + gap / R;
  }
  return { lots, gaps };
}

/** Where the lamp posts of the ring street stand (angles), clear of the road mouths. */
export function ringLampAngles(layout: WorldLayout, spacing = 13.5): number[] {
  const r = VILLAGE.streetR + VILLAGE.streetWidth / 2 + 0.8;
  const n = Math.round((TAU * r) / spacing);
  const roads = layout.discs.map((d) => d.angle);
  const out: number[] = [];
  const clear = (ROAD_WIDTH / 2 + 1.6) / r;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.05;
    if (roads.some((road) => Math.abs(wrap(a - road)) < clear)) continue;
    out.push(a);
  }
  return out;
}

export interface PlantSpot {
  kind: "oak" | "cypress" | "palm" | "shrub" | "flowers";
  x: number;
  z: number;
  s: number;
}

export interface Village {
  group: THREE.Group;
  colliders: Collider[];
  boxes: BoxCollider[];
  blockers: Collider[];
  plants: PlantSpot[];
  dispose(): void;
}

type Own = <T extends { dispose(): void }>(x: T) => T;

export function buildVillage(
  layout: WorldLayout,
  p: ScenePalette,
  own: Own,
  materials: { prop: () => THREE.Material; glass: THREE.Material },
): Village {
  const group = new THREE.Group();
  group.name = "village";
  const colliders: Collider[] = [];
  const boxes: BoxCollider[] = [];
  const blockers: Collider[] = [];
  const plants: PlantSpot[] = [];
  const rand = seededRandom(hashString("walk-village-dress"));
  const prop = own(materials.prop());
  const m4 = new THREE.Matrix4();

  /** Turn parts by yaw and stand them at (x, z), into a list. */
  const stand = (into: Part[], parts: Part[], x: number, z: number, yaw = 0, y = 0) => {
    m4.makeRotationY(yaw).setPosition(x, y, z);
    for (const g of parts) {
      g.applyMatrix4(m4);
      into.push(g);
    }
  };
  const mesh = (parts: Part[], shadow = true): THREE.Mesh | null => {
    if (!parts.length) return null;
    const m = new THREE.Mesh(own(merge(parts)), prop);
    m.castShadow = shadow;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  /* ---------------- houses, fences, the wall ---------------- */
  const { lots, gaps } = lotsFor(layout);
  const sectors = 8;
  const bySector: Part[][] = Array.from({ length: sectors }, () => []);
  const fences: Part[] = [];
  const dressing: Part[] = [];
  const houseRand = seededRandom(hashString("walk-village-houses"));
  for (const lot of lots) {
    const model = buildHouse(lot.kind, p, houseRand);
    const sector = Math.floor((((lot.angle % TAU) + TAU) % TAU) / (TAU / sectors));
    stand(bySector[sector], model.parts, lot.x, lot.z, lot.rot);
    boxes.push({ x: lot.x, z: lot.z, hx: model.hx, hz: model.hz, rot: lot.rot, h: model.height });
    blockers.push({ x: lot.x, z: lot.z, r: Math.max(model.hx, model.hz) * 0.85, h: model.height });
    // A picket fence across part of the front yard, with a gap for the path.
    if (lot.kind !== "shop" && houseRand() < 0.55) {
      const fz = model.hz + 2.3;
      const half = model.hx + 0.2;
      const gapHalf = 1.0 + houseRand() * 0.6;
      const c = Math.cos(lot.rot);
      const s = Math.sin(lot.rot);
      for (const side of [-1, 1]) {
        const len = half - gapHalf;
        // Built along local +x from the gap's edge (or from the corner, on the left) outward.
        const x0 = side < 0 ? -half : gapHalf;
        const part = fence(len, p);
        for (const g of part) g.translate(x0, 0, fz);
        stand(fences, part, lot.x, lot.z, lot.rot);
        const cx = x0 + len / 2;
        boxes.push({ x: lot.x + cx * c + fz * s, z: lot.z - cx * s + fz * c, hx: len / 2 + 0.05, hz: 0.12, rot: lot.rot, h: 0.9 });
      }
    }
  }
  for (const list of bySector) mesh(list);

  /* ---------------- the gaps between houses: trees, bushes, some life ---------------- */
  const R = VILLAGE.houseInner + 2.4;
  let busStops = 0;
  let picnics = 0;
  const wide = gaps.map((g, i) => ({ g, i })).filter((q) => q.g.width > 4.2);
  for (const { g, i } of gaps.map((g, i) => ({ g, i }))) {
    const c = Math.cos(g.angle);
    const s = Math.sin(g.angle);
    const inward = Math.atan2(-c, -s);
    if (g.width > 4.2 && busStops < 2 && (wide.length < 3 || i % 2 === 0)) {
      stand(dressing, busStop(p), c * (VILLAGE.streetR + VILLAGE.streetWidth / 2 + 3.5), s * (VILLAGE.streetR + VILLAGE.streetWidth / 2 + 3.5), inward);
      boxes.push({ x: c * (VILLAGE.streetR + VILLAGE.streetWidth / 2 + 3.3), z: s * (VILLAGE.streetR + VILLAGE.streetWidth / 2 + 3.3), hx: 2.2, hz: 0.9, rot: inward, h: 2.8 });
      busStops++;
      continue;
    }
    if (g.width > 3.2 && picnics < 2 && i % 3 === 1) {
      stand(dressing, picnic(p), c * (R + 4.6), s * (R + 4.6), inward + 0.3);
      colliders.push({ x: c * (R + 4.6), z: s * (R + 4.6), r: 1.5, h: 1.0 });
      picnics++;
    }
    const kind = rand() < 0.4 ? "cypress" : rand() < 0.7 ? "oak" : "palm";
    plants.push({ kind, x: c * (R + 5.0), z: s * (R + 5.0), s: 0.9 + rand() * 0.45 });
    if (rand() < 0.7) plants.push({ kind: rand() < 0.5 ? "flowers" : "shrub", x: Math.cos(g.angle + 0.012) * (R + 1.2), z: Math.sin(g.angle + 0.012) * (R + 1.2), s: 0.8 + rand() * 0.5 });
  }

  /* ---------------- the road mouths: signposts, hydrants, mailboxes, trees ---------------- */
  for (const disc of layout.discs) {
    const ux = Math.cos(disc.angle);
    const uz = Math.sin(disc.angle);
    const nx = -uz;
    const nz = ux;
    const across = ROAD_WIDTH / 2 + 1.5;
    const rr = VILLAGE.streetR + VILLAGE.streetWidth / 2 + 2.4;
    const yaw = Math.atan2(-nx, -nz);
    stand(dressing, signPost(p), ux * rr + nx * across, uz * rr + nz * across, Math.atan2(ux, uz) + Math.PI / 2);
    colliders.push({ x: ux * rr + nx * across, z: uz * rr + nz * across, r: 0.25, h: 3 });
    stand(dressing, hydrant(p), ux * (rr + 1.2) - nx * (across + 0.4), uz * (rr + 1.2) - nz * (across + 0.4), 0);
    colliders.push({ x: ux * (rr + 1.2) - nx * (across + 0.4), z: uz * (rr + 1.2) - nz * (across + 0.4), r: 0.3, h: 0.9 });
    stand(dressing, mailbox(p), ux * (rr + 6.5) + nx * (across + 0.6), uz * (rr + 6.5) + nz * (across + 0.6), yaw);
    colliders.push({ x: ux * (rr + 6.5) + nx * (across + 0.6), z: uz * (rr + 6.5) + nz * (across + 0.6), r: 0.3, h: 1.3 });
    stand(dressing, trashCan(p), ux * (rr + 9.5) - nx * (across + 0.6), uz * (rr + 9.5) - nz * (across + 0.6), 0);
    colliders.push({ x: ux * (rr + 9.5) - nx * (across + 0.6), z: uz * (rr + 9.5) - nz * (across + 0.6), r: 0.4, h: 1 });
    // A pair of cypresses flanking the road where the village ends.
    for (const side of [-1, 1]) plants.push({ kind: "cypress", x: ux * (VILLAGE.outer + 2.5) + nx * side * (ROAD_WIDTH / 2 + 3.2), z: uz * (VILLAGE.outer + 2.5) + nz * side * (ROAD_WIDTH / 2 + 3.2), s: 1.1 + rand() * 0.2 });
  }

  /* ---------------- the plaza: a fountain, and market stalls facing the hub ---------------- */
  {
    stand(dressing, fountain(p), -19, 17, 0);
    colliders.push({ x: -19, z: 17, r: 3.5, h: 3.4 });
    blockers.push({ x: -19, z: 17, r: 3.6, h: 4.6 });
    const stalls: [number, number, number, THREE.Color][] = [
      [-30, 2, Math.PI / 2 - 0.35, p.awning],
      [-30, -12, Math.PI / 2 - 0.1, p.flag],
      [30, 3, -Math.PI / 2 + 0.35, p.shutter],
      [30, -12, -Math.PI / 2 + 0.1, p.roofRose],
    ];
    for (const [x, z, yaw, tint] of stalls) {
      stand(dressing, stall(p, tint), x, z, yaw);
      boxes.push({ x, z: z, hx: 2.0, hz: 0.9, rot: yaw, h: 2.9 });
    }
  }

  /* ---------------- the stone wall at the village's edge (patchy, with gaps) ---------------- */
  {
    const wallR = VILLAGE.outer - 0.4;
    const seg = 7;
    const n = Math.round((TAU * wallR) / seg);
    const roads = layout.discs.map((d) => d.angle);
    const walls: Part[] = [];
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * TAU;
      if (roads.some((r) => Math.abs(wrap(a - r)) < (MOUTH + 1.2) / wallR)) continue;
      if (rand() < 0.38) continue;
      const wx = Math.cos(a) * wallR;
      const wz = Math.sin(a) * wallR;
      // Local +x runs along the tangent.
      const yaw = Math.atan2(-Math.cos(a), -Math.sin(a));
      const part = stoneWall(seg - 0.15, p);
      for (const g of part) g.translate(-(seg - 0.15) / 2, 0, 0);
      stand(walls, part, wx, wz, yaw);
      boxes.push({ x: wx, z: wz, hx: (seg - 0.15) / 2, hz: 0.3, rot: yaw, h: 1.1 });
    }
    mesh(walls);
  }

  /* ---------------- lamps, wires and bunting ---------------- */
  const iron = blend(p.navy, p.ink, 0.6);
  const lampGeoms = lampPost(p, false);
  const single: { x: number; z: number; yaw: number; double: boolean; dir: THREE.Vector2 }[] = [];
  const lampAt = (x: number, z: number, ix: number, iz: number, double = false) => {
    const len = Math.hypot(ix, iz) || 1;
    const yaw = Math.atan2(-iz / len, ix / len);
    single.push({ x, z, yaw, double, dir: new THREE.Vector2(ix / len, iz / len) });
    colliders.push({ x, z, r: 0.28, h: LAMP_HEIGHT });
  };
  const ringR = VILLAGE.streetR + VILLAGE.streetWidth / 2 + 0.8;
  const ringLamps = ringLampAngles(layout).map((a) => ({ a, x: Math.cos(a) * ringR, z: Math.sin(a) * ringR }));
  ringLamps.forEach((l) => lampAt(l.x, l.z, -Math.cos(l.a), -Math.sin(l.a)));
  // Along each district road, both sides, in pairs.
  const roadLamps: { x: number; z: number; ix: number; iz: number; road: number; side: number; r: number }[] = [];
  layout.discs.forEach((disc, road) => {
    const ux = Math.cos(disc.angle);
    const uz = Math.sin(disc.angle);
    const nx = -uz;
    const nz = ux;
    const end = Math.hypot(disc.x, disc.z) - disc.r - 4;
    const first = VILLAGE.streetR + VILLAGE.streetWidth / 2 + 3.2;
    const sideOff = ROAD_WIDTH / 2 + 0.9;
    const step = Math.max(10, Math.min(14, (end - first) / Math.max(1, Math.round((end - first) / 12))));
    for (let r = first; r <= end + 0.01; r += step) {
      for (const side of [-1, 1]) {
        const x = ux * r + nx * side * sideOff;
        const z = uz * r + nz * side * sideOff;
        roadLamps.push({ x, z, ix: -nx * side, iz: -nz * side, road, side, r });
        lampAt(x, z, -nx * side, -nz * side);
      }
    }
    // The stretch between the plaza and the ring street too.
    for (const side of [-1, 1]) {
      const r = PLAZA_RADIUS + 3.4;
      const x = ux * r + nx * side * sideOff;
      const z = uz * r + nz * side * sideOff;
      roadLamps.push({ x, z, ix: -nx * side, iz: -nz * side, road, side, r });
      lampAt(x, z, -nx * side, -nz * side);
    }
  });

  // Instanced lamp posts (single and double-armed) with their glass.
  const lampIron = own(merge(lampGeoms.iron));
  const lampGlass = own(merge(lampGeoms.glass));
  const lampMesh = new THREE.InstancedMesh(lampIron, prop, Math.max(1, single.length));
  const glassMesh = new THREE.InstancedMesh(lampGlass, materials.glass, Math.max(1, single.length));
  single.forEach((l, i) => {
    m4.makeRotationY(l.yaw).setPosition(l.x, 0, l.z);
    lampMesh.setMatrixAt(i, m4);
    glassMesh.setMatrixAt(i, m4);
  });
  lampMesh.count = glassMesh.count = single.length;
  lampMesh.castShadow = true;
  lampMesh.computeBoundingSphere();
  glassMesh.computeBoundingSphere();
  group.add(lampMesh, glassMesh);
  own(lampMesh);
  own(glassMesh);

  // Wires between neighboring posts along the ring and along each road side, and bunting on one.
  const wires: Part[] = [];
  const bunting: Part[] = [];
  const attach = (x: number, z: number, yaw: number, side: number) => new THREE.Vector3(x + side * LAMP_WIRE_SPREAD * Math.sin(yaw), LAMP_WIRE_Y - 0.1, z + side * LAMP_WIRE_SPREAD * Math.cos(yaw));
  const bunt = (a: THREE.Vector3, b: THREE.Vector3, sag: number) => {
    const n = Math.max(3, Math.floor(a.distanceTo(b) / 1.1));
    const colors = [p.flag, p.awning, p.shutter, p.wallCream, p.roofRose];
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const at = a.clone().lerp(b, t);
      at.y -= sag * 4 * t * (1 - t);
      const dir = b.clone().sub(a).setY(0).normalize().multiplyScalar(0.2);
      const tri = new THREE.BufferGeometry().setFromPoints([at.clone().sub(dir), at.clone().add(dir), at.clone().add(new THREE.Vector3(0, -0.5, 0))]);
      tri.computeVertexNormals();
      const t2 = tri.clone();
      const pos = t2.attributes.position;
      for (let k = 0; k < pos.count; k += 3) {
        const x1 = pos.getX(k + 1);
        const y1 = pos.getY(k + 1);
        const z1 = pos.getZ(k + 1);
        pos.setXYZ(k + 1, pos.getX(k + 2), pos.getY(k + 2), pos.getZ(k + 2));
        pos.setXYZ(k + 2, x1, y1, z1);
      }
      bunting.push(paint(tri, colors[i % colors.length]), paint(t2, colors[i % colors.length]));
    }
  };
  const ringIdx = ringLamps.map((l, i) => ({ l, yaw: single[i].yaw }));
  for (let i = 0; i < ringIdx.length; i++) {
    const a = ringIdx[i];
    const b = ringIdx[(i + 1) % ringIdx.length];
    for (const side of [-1, 1]) {
      const pa = attach(a.l.x, a.l.z, a.yaw, side);
      const pb = attach(b.l.x, b.l.z, b.yaw, side);
      // Skip the long way round (a road mouth): the wire still spans it, but sag scales with length.
      const sag = Math.min(1.1, pa.distanceTo(pb) * 0.045);
      wires.push(...wire(pa, pb, sag, iron));
      if (side === 1) bunt(pa, pb, sag);
    }
  }
  const offset = ringLamps.length;
  const groups = new Map<string, { x: number; z: number; yaw: number; r: number }[]>();
  roadLamps.forEach((l, i) => {
    const key = `${l.road}:${l.side}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ x: l.x, z: l.z, yaw: single[offset + i].yaw, r: l.r });
  });
  for (const list of groups.values()) {
    list.sort((a, b) => a.r - b.r);
    for (let i = 0; i + 1 < list.length; i++) {
      for (const side of [-1, 1]) {
        const pa = attach(list[i].x, list[i].z, list[i].yaw, side);
        const pb = attach(list[i + 1].x, list[i + 1].z, list[i + 1].yaw, side);
        wires.push(...wire(pa, pb, Math.min(0.9, pa.distanceTo(pb) * 0.04), iron));
      }
    }
  }
  mesh(wires, false);
  mesh(bunting, false);

  /* ---------------- crosswalks where the roads meet the plaza and the ring street ---------------- */
  {
    const zebra: Part[] = [];
    const cream = blend(p.cloud, p.roadLine, 0.4);
    for (const disc of layout.discs) {
      const ux = Math.cos(disc.angle);
      const uz = Math.sin(disc.angle);
      for (const r of [PLAZA_RADIUS + 1.8, VILLAGE.streetR + VILLAGE.streetWidth / 2 + 1.1]) {
        for (let k = -2; k <= 2; k++) {
          const across = k * 1.05;
          const x = ux * r - uz * across;
          const z = uz * r + ux * across;
          zebra.push(box(0.55, 0.03, 2.4, x, 0.047, z, cream, { rotY: Math.atan2(ux, uz) }));
        }
      }
    }
    const m = mesh(zebra, false);
    if (m) m.castShadow = false;
  }

  /* ---------------- the rest ---------------- */
  mesh(fences);
  mesh(dressing);

  return {
    group,
    colliders,
    boxes,
    blockers,
    plants,
    dispose() {
      for (const o of [lampIron, lampGlass]) o.dispose();
    },
  };
}
