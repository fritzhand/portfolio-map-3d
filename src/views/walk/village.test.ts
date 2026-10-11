import { describe, expect, it } from "vitest";
import { COMPANIES, DISTRICTS, PEOPLE } from "../../data/catalog";
import type { Company, DistrictSlug } from "../../data/types";
import { PLAZA_RADIUS, ROAD_WIDTH, VILLAGE, layoutWorld, onRoad } from "../../data/layout";
import { HOUSE_LOT, lotsFor, ringLampAngles } from "./village";

const real = layoutWorld(
  DISTRICTS.map((d) => d.slug),
  COMPANIES,
  PEOPLE,
);

/** A world of `n` districts with `each` companies apiece, to try the village on maps unlike the example. */
function worldOf(n: number, each: number) {
  const order = Array.from({ length: n }, (_, i) => `d${i}` as DistrictSlug);
  const companies = order.flatMap((d, i) => Array.from({ length: each }, (_, k) => ({ slug: `c${i}-${k}`, name: `C${i}-${k}`, district: d }) as unknown as Company));
  return layoutWorld(order, companies, []);
}

const worlds = { example: real, one: worldOf(1, 3), two: worldOf(2, 8), many: worldOf(12, 30) };

describe("lotsFor", () => {
  it("is the same on every visit", () => {
    expect(lotsFor(real)).toEqual(lotsFor(real));
  });

  for (const [name, layout] of Object.entries(worlds)) {
    describe(name, () => {
      const { lots } = lotsFor(layout);

      it("fills the ring between the road mouths with houses", () => {
        expect(lots.length).toBeGreaterThan(8);
      });

      it("stands every house between the street and the village's edge, front toward the plaza", () => {
        for (const l of lots) {
          const r = Math.hypot(l.x, l.z);
          const { d } = HOUSE_LOT[l.kind];
          expect(r).toBeGreaterThan(VILLAGE.houseInner);
          expect(r + 0.01).toBeLessThan(VILLAGE.houseInner + d + 0.01);
          // The house's +z (sin rot, cos rot) points at the plaza's center.
          const toward = { x: -l.x / r, z: -l.z / r };
          expect(Math.sin(l.rot)).toBeCloseTo(toward.x, 6);
          expect(Math.cos(l.rot)).toBeCloseTo(toward.z, 6);
        }
      });

      it("keeps the houses off the roads to the districts", () => {
        for (const l of lots) {
          const { w } = HOUSE_LOT[l.kind];
          // Walk along the house's front: no point of it is on a road.
          const tx = Math.cos(l.rot);
          const tz = -Math.sin(l.rot);
          for (const s of [-w / 2, -w / 4, 0, w / 4, w / 2]) {
            expect(onRoad(layout, l.x + tx * s, l.z + tz * s, 0)).toBe(false);
          }
        }
      });

      it("keeps neighbors from overlapping along the ring", () => {
        const sorted = lots.slice().sort((a, b) => a.angle - b.angle);
        for (let i = 0; i + 1 < sorted.length; i++) {
          const a = sorted[i];
          const b = sorted[i + 1];
          const gap = (b.angle - a.angle) * VILLAGE.houseInner - HOUSE_LOT[a.kind].w / 2 - HOUSE_LOT[b.kind].w / 2;
          expect(gap).toBeGreaterThan(0.5);
        }
      });
    });
  }

  it("leaves the district roads open where they cross the houses' row", () => {
    const { lots } = lotsFor(real);
    for (const disc of real.discs) {
      const mouth = (ROAD_WIDTH / 2 + 3) / VILLAGE.houseInner;
      for (const l of lots) {
        let d = l.angle - disc.angle;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        expect(Math.abs(d)).toBeGreaterThan(mouth);
      }
    }
  });

  it("keeps the village clear of the districts", () => {
    for (const layout of Object.values(worlds)) {
      for (const l of lotsFor(layout).lots) {
        const { w, d } = HOUSE_LOT[l.kind];
        const reach = Math.hypot(w / 2, d / 2);
        for (const disc of layout.discs) expect(Math.hypot(l.x - disc.x, l.z - disc.z)).toBeGreaterThan(disc.r + reach * 0.5);
      }
    }
  });

  it("starts the village past the plaza and its street", () => {
    expect(VILLAGE.streetR - VILLAGE.streetWidth / 2).toBeGreaterThan(PLAZA_RADIUS);
    expect(VILLAGE.houseInner).toBeGreaterThan(VILLAGE.streetR + VILLAGE.streetWidth / 2);
  });
});

describe("ringLampAngles", () => {
  it("spaces the lamps evenly and keeps them out of the road mouths", () => {
    for (const layout of Object.values(worlds)) {
      const angles = ringLampAngles(layout);
      expect(angles.length).toBeGreaterThan(10);
      const r = VILLAGE.streetR + VILLAGE.streetWidth / 2 + 0.8;
      for (const a of angles) expect(onRoad(layout, Math.cos(a) * r, Math.sin(a) * r, -VILLAGE.streetWidth / 2 - 0.2)).toBe(false);
      for (const a of angles) {
        for (const disc of layout.discs) {
          let d = a - disc.angle;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          expect(Math.abs(d) * r).toBeGreaterThan(ROAD_WIDTH / 2 + 1);
        }
      }
    }
  });
});
