import { describe, expect, it } from "vitest";
import { COMPANIES, DISTRICTS, PEOPLE } from "../../data/catalog";
import { layoutWorld } from "../../data/layout";
import { anchorsFor, wedgeAngles } from "./scenery";
import { createTerrain } from "./terrain";

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

  it("has one lighthouse, one pier, a windmill and a water tower at most", () => {
    const count = (k: string) => anchors.filter((a) => a.kind === k).length;
    expect(count("lighthouse")).toBe(1);
    expect(count("pier")).toBe(1);
    expect(count("windmill")).toBe(1);
    expect(count("tower")).toBe(1);
  });

  it("faces the coastal pieces out to sea and the inland ones toward the plaza", () => {
    for (const a of anchors) {
      const out = { x: Math.sin(a.yaw), z: Math.cos(a.yaw) };
      const dot = (out.x * a.x + out.z * a.z) / Math.hypot(a.x, a.z);
      if (a.kind === "lighthouse" || a.kind === "pier" || a.kind === "beach") expect(dot).toBeGreaterThan(0.99);
      else expect(dot).toBeLessThan(-0.99);
    }
  });
});
