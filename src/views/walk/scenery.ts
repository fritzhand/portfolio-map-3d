/* Set pieces around the island: one on the coast and one in the hills in each wedge between the
   districts, the places to wander to when no one sent you anywhere, and where the keepsakes hide
   (finds.ts). What each looks like is in pieces.ts.

   anchorsFor() decides where each piece goes from the layout alone (pure: scenery.test.ts): the
   coast's kinds in PIECES order, then those that may repeat, by turns; the same inland. The coastal
   pieces stand in the coves the terrain leaves for them (terrain.ts), the inland ones on the hills.
   buildScenery() builds each model, stands it at its anchor (its small loose things each on the
   ground where they are), merges everything into a few meshes, and reports colliders, blockers for
   the follow camera, the anchors, the ground the pieces cover (so no tree grows through one), and an
   update for the things that move. */
import * as THREE from "three";
import { seededRandom, hashString, wedgeAngles, type WorldLayout } from "../../data/layout";
import type { Part } from "./kit";
import { PIECES, PIECE_KINDS, type PieceKind } from "./pieces";
import type { ScenePalette } from "./palette";
import { COVE, SEA_LEVEL, type Terrain } from "./terrain";
import { merge } from "./util";
import type { BoxCollider, Collider } from "./world";

export { wedgeAngles };
export type { PieceKind };

export interface Anchor {
  kind: PieceKind;
  /** The wedge's bisector angle, and the piece's place on it. */
  angle: number;
  x: number;
  z: number;
  /** Which way the piece faces (three.js rotation.y): toward the island's center, or out to sea. */
  yaw: number;
}

/**
 * The kinds for `n` wedges, coastal or inland, in order: every kind once (PIECES order), then the
 * ones that may repeat, by turns. With `allow`, only those kinds; a wedge left without one is null.
 */
export function pieceOrder(coast: boolean, n: number, allow?: readonly PieceKind[] | null): (PieceKind | null)[] {
  const kinds = PIECE_KINDS.filter((k) => PIECES[k].coast === coast && (!allow || allow.includes(k)));
  const again = kinds.filter((k) => !PIECES[k].once);
  return Array.from({ length: n }, (_, i) => (i < kinds.length ? kinds[i] : again.length ? again[(i - kinds.length) % again.length] : null));
}

/** Where the set pieces stand: coastal ones in the coves at the shore, inland ones in the hills between the districts. */
export function anchorsFor(layout: WorldLayout, terrain: Pick<Terrain, "waterlineAt">, allow?: readonly PieceKind[] | null): Anchor[] {
  const out: Anchor[] = [];
  const wedges = wedgeAngles(layout);
  const coast = pieceOrder(true, wedges.length, allow);
  const inland = pieceOrder(false, wedges.length, allow);
  wedges.forEach((angle, i) => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const shore = coast[i];
    if (shore) {
      const r = Math.min(layout.islandRadius - COVE.inset, terrain.waterlineAt(angle) - 7);
      out.push({ kind: shore, angle, x: c * r, z: s * r, yaw: Math.atan2(c, s) });
    }
    // Inland pieces sit on the same bisector, in the hills past the village.
    const hill = inland[i];
    if (hill) {
      const r = layout.ringRadius + (PIECES[hill].ring ?? -3);
      out.push({ kind: hill, angle, x: c * r, z: s * r, yaw: Math.atan2(-c, -s) });
    }
  });
  return out;
}

export interface Scenery {
  group: THREE.Group;
  colliders: Collider[];
  boxes: BoxCollider[];
  blockers: Collider[];
  anchors: Anchor[];
  /** Whether (x, z) is on ground a set piece covers: no tree or rock is scattered there. */
  covers(x: number, z: number): boolean;
  update(time: number, reduced: boolean): void;
  dispose(): void;
}

type Own = <T extends { dispose(): void }>(x: T) => T;

/** Room kept around a piece's parts for the trees and rocks scattered nearby. */
const COVER_PAD = 3;

export function buildScenery(
  layout: WorldLayout,
  terrain: Terrain,
  p: ScenePalette,
  own: Own,
  materials: { prop: () => THREE.Material; glass: THREE.Material; panes: THREE.Material; lit: THREE.Material },
  allow?: readonly PieceKind[] | null,
): Scenery {
  const group = new THREE.Group();
  group.name = "scenery";
  const colliders: Collider[] = [];
  const boxes: BoxCollider[] = [];
  const blockers: Collider[] = [];
  const anchors = anchorsFor(layout, terrain, allow);
  const rand = seededRandom(hashString("walk-scenery"));
  const prop = own(materials.prop());
  const m4 = new THREE.Matrix4();
  const ground = (x: number, z: number) => Math.max(0, terrain.heightAt(x, z));

  const solid: Part[] = [];
  const glass: Part[] = [];
  const panes: Part[] = [];
  const lit: Part[] = [];
  const stand = (into: Part[], parts: readonly Part[] | undefined, x: number, y: number, z: number, yaw: number) => {
    if (!parts) return;
    m4.makeRotationY(yaw).setPosition(x, y, z);
    for (const g of parts) {
      g.applyMatrix4(m4);
      into.push(g);
    }
  };

  const movers: { update(t: number, reduced: boolean): void }[] = [];
  const covered: { x: number; z: number; cos: number; sin: number; x0: number; x1: number; z0: number; z1: number }[] = [];
  const bounds = new THREE.Box3();
  const extent = new THREE.Box3();

  for (const a of anchors) {
    const m = PIECES[a.kind].build(p, rand);
    const y = ground(a.x, a.z);
    const cos = Math.cos(a.yaw);
    const sin = Math.sin(a.yaw);
    const at = (lx: number, lz: number) => ({ x: a.x + lx * cos + lz * sin, z: a.z - lx * sin + lz * cos });

    // The ground it covers: its parts' extent in its own frame, before they are moved.
    bounds.makeEmpty();
    const grow = (parts: readonly Part[] | undefined, offset?: THREE.Vector3) => {
      for (const g of parts ?? []) {
        g.computeBoundingBox();
        extent.copy(g.boundingBox!);
        if (offset) extent.translate(offset);
        bounds.union(extent);
      }
    };
    grow(m.parts);
    grow(m.glass);
    grow(m.panes);
    grow(m.lit);
    for (const l of m.loose ?? []) grow(l.parts);
    if (m.turn) grow(m.turn.parts, m.turn.at);
    if (!bounds.isEmpty()) covered.push({ x: a.x, z: a.z, cos, sin, x0: bounds.min.x - COVER_PAD, x1: bounds.max.x + COVER_PAD, z0: bounds.min.z - COVER_PAD, z1: bounds.max.z + COVER_PAD });

    stand(solid, m.parts, a.x, y, a.z, a.yaw);
    stand(glass, m.glass, a.x, y, a.z, a.yaw);
    stand(panes, m.panes, a.x, y, a.z, a.yaw);
    stand(lit, m.lit, a.x, y, a.z, a.yaw);
    for (const l of m.loose ?? []) {
      const w = at(l.x, l.z);
      const ly = ground(w.x, w.z);
      stand(solid, l.parts, a.x, ly, a.z, a.yaw);
      stand(lit, l.lit, a.x, ly, a.z, a.yaw);
    }
    // Heights in the model are above the piece's ground; the world's are absolute.
    for (const c of m.colliders) colliders.push({ ...at(c.x, c.z), r: c.r, h: c.h === undefined ? undefined : y + c.h });
    for (const b of m.boxes ?? []) boxes.push({ ...at(b.x, b.z), hx: b.hx, hz: b.hz, rot: a.yaw, h: b.h === undefined ? undefined : y + b.h });
    for (const b of m.blockers ?? []) blockers.push({ ...at(b.x, b.z), r: b.r, h: b.h === undefined ? undefined : y + b.h });

    if (m.turn) {
      // It turns on its own mesh, in a holder that stands and faces like the piece.
      const { axis, speed, rest } = m.turn;
      const mesh = new THREE.Mesh(own(merge(m.turn.parts)), prop);
      mesh.castShadow = true;
      mesh.position.copy(m.turn.at);
      const holder = new THREE.Group();
      holder.position.set(a.x, y, a.z);
      holder.rotation.y = a.yaw;
      holder.add(mesh);
      group.add(holder);
      const phase = rand() * 6;
      movers.push({ update: (t, reduced) => (mesh.rotation[axis] = reduced ? rest : t * speed + phase) });
    }
    for (const b of m.afloat ?? []) {
      const mesh = new THREE.Mesh(own(merge(b.parts)), prop);
      mesh.castShadow = true;
      const w = at(b.x, b.z);
      mesh.position.set(w.x, SEA_LEVEL - b.sink, w.z);
      mesh.rotation.y = a.yaw + b.yaw;
      group.add(mesh);
      const phase = rand() * 6;
      movers.push({
        update: (t, reduced) => {
          const tt = reduced ? 0 : t;
          mesh.position.y = SEA_LEVEL - b.sink + Math.sin(tt * b.bob[1] + phase) * b.bob[0];
          mesh.rotation.z = Math.sin(tt * b.roll[1] + phase) * b.roll[0];
        },
      });
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
  add(panes, materials.panes, false);
  add(lit, materials.lit, false);

  return {
    group,
    colliders,
    boxes,
    blockers,
    anchors,
    covers(x, z) {
      for (const c of covered) {
        const dx = x - c.x;
        const dz = z - c.z;
        const lx = dx * c.cos - dz * c.sin;
        const lz = dx * c.sin + dz * c.cos;
        if (lx >= c.x0 && lx <= c.x1 && lz >= c.z0 && lz <= c.z1) return true;
      }
      return false;
    },
    update(time, reduced) {
      for (const m of movers) m.update(time, reduced);
    },
    dispose() {},
  };
}
