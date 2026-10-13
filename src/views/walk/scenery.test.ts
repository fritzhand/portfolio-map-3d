import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { COMPANIES, DISTRICTS, PEOPLE } from "../../data/catalog";
import { layoutWorld } from "../../data/layout";
import { PIECES, PIECE_KINDS } from "./pieces";
import { readScenePalette } from "./palette";
import { anchorsFor, buildScenery, pieceOrder, wedgeAngles } from "./scenery";
import { COVE, SEA_LEVEL, createTerrain } from "./terrain";

const layout = layoutWorld(
  DISTRICTS.map((d) => d.slug),
  COMPANIES,
  PEOPLE,
);
const terrain = createTerrain(layout);

describe("wedgeAngles", () => {
  it("is the middle of every gap between neighboring districts", () => {
    const wedges = wedgeAngles(layout);
    expect(wedges).toHaveLength(layout.discs.length);
    const angles = layout.discs.map((d) => d.angle).sort((a, b) => a - b);
    wedges.forEach((w, i) => {
      const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2;
      expect(w).toBeGreaterThan(angles[i]);
      expect(w).toBeLessThan(next);
    });
  });

  it("copes with a map of one district, or none", () => {
    expect(wedgeAngles({ ...layout, discs: layout.discs.slice(0, 1) })).toHaveLength(1);
    expect(wedgeAngles({ ...layout, discs: [] })).toEqual([]);
  });
});

describe("anchorsFor", () => {
  const anchors = anchorsFor(layout, terrain);

  it("puts a coastal piece and an inland piece in every wedge", () => {
    expect(anchors).toHaveLength(layout.discs.length * 2);
  });

  it("is the same on every visit", () => {
    expect(anchorsFor(layout, terrain)).toEqual(anchors);
  });

  it("stands every piece on the island and clear of every district", () => {
    for (const a of anchors) {
      expect(Math.hypot(a.x, a.z)).toBeLessThan(layout.islandRadius - 6);
      for (const d of layout.discs) expect(Math.hypot(a.x - d.x, a.z - d.z)).toBeGreaterThan(d.r + 3);
    }
  });

  it("has one lighthouse, one pier, one windmill, one water tower and one observatory at most", () => {
    const count = (k: string) => anchors.filter((a) => a.kind === k).length;
    for (const k of PIECE_KINDS) if (PIECES[k].once) expect(count(k)).toBeLessThanOrEqual(1);
    expect(count("lighthouse")).toBe(1);
    expect(count("pier")).toBe(1);
    expect(count("windmill")).toBe(1);
    expect(count("tower")).toBe(1);
  });

  it("hands out every kind before it repeats one", () => {
    const kinds = new Set(anchors.map((a) => a.kind));
    // The example has seven wedges: room for every coastal and every inland kind.
    expect(layout.discs.length).toBeGreaterThanOrEqual(7);
    expect([...kinds].sort()).toEqual([...PIECE_KINDS].sort());
  });

  it("faces the coastal pieces out to sea and the inland ones toward the plaza", () => {
    for (const a of anchors) {
      const out = { x: Math.sin(a.yaw), z: Math.cos(a.yaw) };
      const dot = (out.x * a.x + out.z * a.z) / Math.hypot(a.x, a.z);
      if (PIECES[a.kind].coast) expect(dot).toBeGreaterThan(0.99);
      else expect(dot).toBeLessThan(-0.99);
    }
  });

  it("stands the coastal pieces in a level cove, well clear of the water", () => {
    for (const a of anchors) {
      if (!PIECES[a.kind].coast) continue;
      expect(terrain.waterlineAt(a.angle) - Math.hypot(a.x, a.z)).toBeGreaterThanOrEqual(7);
      const c = Math.cos(a.yaw);
      const s = Math.sin(a.yaw);
      for (let lx = -COVE.half + 2; lx <= COVE.half - 2; lx += 2) {
        for (let lz = -COVE.back + 2; lz <= 3; lz += 1) {
          const h = terrain.heightAt(a.x + lx * c + lz * s, a.z - lx * s + lz * c);
          expect(Math.abs(h)).toBeLessThan(0.05);
          expect(h).toBeGreaterThan(SEA_LEVEL);
        }
      }
    }
  });
});

describe("pieceOrder", () => {
  it("is each kind once, then the ones that may repeat, by turns", () => {
    const coast = PIECE_KINDS.filter((k) => PIECES[k].coast);
    const order = pieceOrder(true, coast.length + 4);
    expect(order.slice(0, coast.length)).toEqual(coast);
    for (const k of order.slice(coast.length)) expect(k && !PIECES[k].once).toBe(true);
  });

  it("keeps to the kinds a site allows, and leaves a wedge empty rather than repeat a landmark", () => {
    expect(pieceOrder(true, 4, ["pier", "huts"])).toEqual(["pier", "huts", "huts", "huts"]);
    expect(pieceOrder(false, 3, ["observatory"])).toEqual(["observatory", null, null]);
    expect(pieceOrder(false, 2, [])).toEqual([null, null]);
    const few = anchorsFor(layout, terrain, ["lighthouse", "orchard"]);
    expect(few.filter((a) => a.kind === "lighthouse")).toHaveLength(1);
    expect(few.filter((a) => a.kind === "orchard")).toHaveLength(layout.discs.length);
  });
});

describe("buildScenery", () => {
  const material = () => new THREE.MeshBasicMaterial();
  const scenery = buildScenery(layout, terrain, readScenePalette(), (x) => x, { prop: material, glass: material(), panes: material(), lit: material() });

  it("covers the ground under every piece (no tree grows through one), and not the open plaza", () => {
    for (const a of scenery.anchors) expect(scenery.covers(a.x, a.z), a.kind).toBe(true);
    expect(scenery.covers(0, 0)).toBe(false);
    expect(scenery.covers(layout.spawn.x, layout.spawn.z)).toBe(false);
  });

  it("gives colliders, boxes and blockers heights above the ground they stand on", () => {
    for (const c of [...scenery.colliders, ...scenery.boxes, ...scenery.blockers]) {
      if (c.h === undefined) continue;
      expect(c.h).toBeGreaterThan(Math.max(0, terrain.heightAt(c.x, c.z)) + 0.3);
    }
  });
});
