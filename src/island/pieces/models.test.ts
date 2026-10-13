import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { COMPANIES, DISTRICTS, PEOPLE } from "../../data/catalog";
import { layoutWorld } from "../../data/layout";
import { SEA_Y, islandHeight, swellLift } from "../mapGround";
import { planFromLayout } from "../mapLayout";
import { PIECE_INFO, PIECE_KINDS } from "./kinds";
import { BOAT, MARINA, PIECE_MODELS, boatFloat, onMarina, pieceColliders, pieceToWorld, worldToPiece } from "./models";

const layout = layoutWorld(DISTRICTS.map((d) => d.slug), COMPANIES, PEOPLE);
const plan = planFromLayout(layout, DISTRICTS.map((d) => ({ slug: d.slug, label: d.label, short: d.short, color: d.color })));
const ground = (x: number, z: number) => islandHeight(plan, x, z);
const built = (name: string) => existsSync(new URL(`../../../public/island/geometries/${name}.bin`, import.meta.url));

describe("the set pieces' models", () => {
  it("gives every kind a built model, and every moving part and boat one too", () => {
    for (const kind of PIECE_KINDS) {
      const m = PIECE_MODELS[kind];
      expect(built(m.model), m.model).toBe(true);
      if (m.turn) expect(built(m.turn.model), m.turn.model).toBe(true);
    }
    expect(built(BOAT.model)).toBe(true);
  });

  it("keeps every collision box inside its kind's footprint, but the marina's deck out to sea", () => {
    for (const kind of PIECE_KINDS) {
      const fp = PIECE_INFO[kind].footprint;
      for (const b of PIECE_MODELS[kind].boxes) {
        const reach = Math.hypot(Math.abs(b.x) + b.w / 2, Math.abs(b.z) + b.d / 2);
        if (kind === "marina" && b.z + b.d / 2 > 0) continue;
        expect(reach, `${kind} ${JSON.stringify(b)}`).toBeLessThanOrEqual(fp + 0.5);
      }
    }
  });

  it("lets the walker climb onto the marina: each step up from the land is under the knee", () => {
    const floors = PIECE_MODELS.marina.boxes.filter((b) => b.h <= MARINA.deck && b.x === 0).sort((a, b) => a.z - b.z);
    let h = 0;
    for (const f of floors) {
      expect(f.h - h).toBeLessThanOrEqual(0.25);
      h = f.h;
    }
    expect(h).toBe(MARINA.deck);
  });
});

describe("the set pieces on the island", () => {
  const colliders = pieceColliders(plan.pieces, ground);

  it("turns a piece's frame into the world and back", () => {
    for (const p of plan.pieces) {
      const w = pieceToWorld(p, 2, 5);
      const l = worldToPiece(p, w.x, w.z);
      expect(l.x).toBeCloseTo(2, 9);
      expect(l.z).toBeCloseTo(5, 9);
    }
  });

  it("gives the walker colliders that reach down to the ground under them", () => {
    const boxes = plan.pieces.reduce((n, p) => n + PIECE_MODELS[p.kind].boxes.length, 0);
    expect(colliders).toHaveLength(boxes);
    for (const c of colliders) {
      expect(c.y).toBeLessThanOrEqual(ground(c.x, c.z));
      expect(c.y + c.h).toBeGreaterThan(ground(c.x, c.z) + 0.15);
    }
  });

  it("lets the walker out along the marina's deck, and nowhere else past the island's edge", () => {
    const marina = plan.pieces.find((p) => p.kind === "marina")!;
    expect(marina).toBeTruthy();
    for (const z of [0, 10, 25, 33]) {
      const w = pieceToWorld(marina, 0, z);
      expect(onMarina(plan.pieces, w.x, w.z)).toBe(true);
    }
    const end = pieceToWorld(marina, 0, MARINA.head.to - 0.5);
    expect(Math.hypot(end.x, end.z)).toBeGreaterThan(plan.island.walk);
    for (const [x, z] of [[MARINA.half + 0.5, 10], [MARINA.head.half + 0.5, 32], [0, MARINA.head.to + 1]]) {
      const w = pieceToWorld(marina, x, z);
      expect(onMarina(plan.pieces, w.x, w.z)).toBe(false);
    }
  });

  it("floats the launches on the swell, and only rises and falls with the sea under reduced motion", () => {
    for (const t of [3, 40]) {
      const f = boatFloat(t, 1.3, false);
      expect(Math.abs(f.y - (SEA_Y + swellLift(t) - BOAT.sink))).toBeLessThanOrEqual(BOAT.bob[0] + 1e-9);
      const held = boatFloat(t, 1.3, true);
      expect(held.y).toBeCloseTo(SEA_Y + swellLift(t) - BOAT.sink, 9);
      expect(held.roll).toBe(0);
    }
  });
});
