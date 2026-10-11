import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { hashString, seededRandom } from "../../data/layout";
import { AVATAR_RADIUS } from "./nav";
import { readScenePalette } from "./palette";
import { PIECES, PIECE_KINDS, type PieceModel } from "./pieces";
import { COVE } from "./terrain";

const p = readScenePalette();
const build = (kind: (typeof PIECE_KINDS)[number]): PieceModel => PIECES[kind].build(p, seededRandom(hashString(kind)));

/** The extent of a model's parts in its own frame. */
function extent(m: PieceModel): THREE.Box3 {
  const out = new THREE.Box3();
  const add = (parts: THREE.BufferGeometry[] | undefined, at?: THREE.Vector3) => {
    for (const g of parts ?? []) {
      g.computeBoundingBox();
      const b = g.boundingBox!.clone();
      if (at) b.translate(at);
      out.union(b);
    }
  };
  add(m.parts);
  add(m.glass);
  add(m.panes);
  add(m.lit);
  for (const l of m.loose ?? []) add(l.parts);
  if (m.turn) add(m.turn.parts, m.turn.at);
  return out;
}

describe("PIECES", () => {
  it("builds every kind from the scene palette, with parts that merge (position, normal, color)", () => {
    for (const kind of PIECE_KINDS) {
      const m = build(kind);
      const parts = [...m.parts, ...(m.glass ?? []), ...(m.panes ?? []), ...(m.lit ?? []), ...(m.loose ?? []).flatMap((l) => [...l.parts, ...(l.lit ?? [])]), ...(m.turn?.parts ?? [])];
      expect(parts.length, kind).toBeGreaterThan(0);
      for (const g of parts) {
        expect(g.index, kind).toBeNull();
        for (const a of ["position", "normal", "color"]) expect(g.attributes[a], `${kind} ${a}`).toBeDefined();
        const pos = g.attributes.position.array;
        for (let i = 0; i < pos.length; i++) expect(Number.isFinite(pos[i]), kind).toBe(true);
      }
    }
  });

  it("is the same model on every build", () => {
    for (const kind of PIECE_KINDS) {
      const a = extent(build(kind));
      const b = extent(build(kind));
      expect(a.equals(b), kind).toBe(true);
    }
  });

  it("only blocks the walker where there is something to see", () => {
    for (const kind of PIECE_KINDS) {
      const m = build(kind);
      const e = extent(m).expandByScalar(0.6);
      for (const c of m.colliders) expect(e.containsPoint(new THREE.Vector3(c.x, 0, c.z)), `${kind} collider ${c.x},${c.z}`).toBe(true);
      for (const b of m.boxes ?? []) expect(e.containsPoint(new THREE.Vector3(b.x, 0, b.z)), `${kind} box ${b.x},${b.z}`).toBe(true);
      for (const l of m.loose ?? []) expect(e.containsPoint(new THREE.Vector3(l.x, 0, l.z)), `${kind} loose ${l.x},${l.z}`).toBe(true);
    }
  });

  it("leaves the beach in front of a coastal piece free to walk along the water", () => {
    // The walker keeps 6 inside the island's radius: 6 in front of a coastal piece, a little less at its sides.
    const front = COVE.inset - 6 - 0.6 - 2 * AVATAR_RADIUS;
    for (const kind of PIECE_KINDS.filter((k) => PIECES[k].coast)) {
      const m = build(kind);
      for (const c of m.colliders) expect(c.z + c.r, `${kind} collider`).toBeLessThanOrEqual(front);
      for (const b of m.boxes ?? []) expect(b.z + b.hz, `${kind} box`).toBeLessThanOrEqual(front);
    }
  });

  it("keeps a boat out on the water and a turning part on its piece", () => {
    for (const kind of PIECE_KINDS) {
      const m = build(kind);
      for (const b of m.afloat ?? []) expect(b.z, kind).toBeGreaterThan(COVE.inset);
      if (m.turn) expect(["y", "z"]).toContain(m.turn.axis);
    }
  });
});
