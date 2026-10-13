import { describe, expect, it } from "vitest";
import { COMPANIES, DISTRICTS, PEOPLE } from "../../data/catalog";
import { layoutWorld, onRoad } from "../../data/layout";
import { FIND_KINDS, findSpots } from "./finds";
import { anchorsFor } from "./scenery";
import { createTerrain } from "./terrain";

const layout = layoutWorld(
  DISTRICTS.map((d) => d.slug),
  COMPANIES,
  PEOPLE,
);
const terrain = createTerrain(layout);
const anchors = anchorsFor(layout, terrain);
const open = (x: number, z: number) => Math.hypot(x, z) < 80 || Math.hypot(x, z) > layout.islandRadius - 10 || onRoad(layout, x, z, 1.5);

describe("findSpots", () => {
  const spots = findSpots(layout, anchors, open);

  it("hides one of each keepsake", () => {
    expect(spots.map((s) => s.id).sort()).toEqual(FIND_KINDS.map((k) => k.id).sort());
  });

  it("is the same on every visit", () => {
    expect(findSpots(layout, anchors, open)).toEqual(spots);
  });

  it("keeps each in the open, never where the world says it is blocked", () => {
    for (const s of spots) expect(open(s.x, s.z)).toBe(false);
  });

  it("keeps each beside its set piece, and the finds apart", () => {
    for (const s of spots) {
      const kind = FIND_KINDS.find((k) => k.id === s.id)!;
      const home = anchors.find((a) => a.kind === kind.near)!;
      expect(Math.hypot(s.x - home.x, s.z - home.z)).toBeLessThan(25);
    }
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) expect(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z)).toBeGreaterThanOrEqual(8);
  });

  it("still hides every find on a map with no set pieces", () => {
    const bare = findSpots(layout, [], open);
    expect(bare).toHaveLength(FIND_KINDS.length);
  });
});
