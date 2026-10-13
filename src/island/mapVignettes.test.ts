import { describe, expect, it } from "vitest";
import { COMPANIES, DISTRICTS, PEOPLE } from "../data/catalog";
import { layoutWorld } from "../data/layout";
import type { Company, DistrictSlug } from "../data/types";
import { distToSpokes, islandHeight } from "./mapGround";
import { ROAD_W, planFromLayout, townRadius } from "./mapLayout";
import { gapBearings, inVignette, vignettesFor } from "./mapVignettes";

const display = DISTRICTS.map((d) => ({ slug: d.slug, label: d.label, short: d.short, color: d.color }));
function worldOf(n: number, each: number) {
  const order = Array.from({ length: n }, (_, i) => `d${i}` as DistrictSlug);
  const companies = order.flatMap((d, i) => Array.from({ length: each }, (_, k) => ({ slug: `c${i}-${k}`, name: `C${i}-${k}`, district: d }) as unknown as Company));
  return layoutWorld(order, companies, []);
}
const plans = {
  example: planFromLayout(layoutWorld(DISTRICTS.map((d) => d.slug), COMPANIES, PEOPLE), display),
  four: planFromLayout(worldOf(4, 5), display),
  many: planFromLayout(worldOf(12, 12), display),
};

describe("the land between the districts", () => {
  for (const [name, plan] of Object.entries(plans)) {
    it(`${name}: one airy vignette per gap at most, flat, off every road, district and set piece`, () => {
      const vs = vignettesFor(plan);
      expect(vs).toEqual(vignettesFor(plan));
      const levelled = { ...plan, vignettes: vs };
      expect(vs.length).toBeLessThanOrEqual(gapBearings(plan).length);
      if (name === "example") expect(vs.length).toBeGreaterThanOrEqual(3);
      for (const v of vs) {
        expect(Math.hypot(v.x, v.z) - v.r).toBeGreaterThan(townRadius(plan));
        expect(distToSpokes(plan, v.x, v.z)).toBeGreaterThan(v.r + ROAD_W / 2);
        for (const c of plan.clusters) expect(Math.hypot(v.x - c.cx, v.z - c.cz)).toBeGreaterThan(c.r + v.r);
        for (const p of plan.pieces) expect(Math.hypot(v.x - p.x, v.z - p.z)).toBeGreaterThan(p.footprint + v.r);
        for (const w of vs) if (w !== v) expect(Math.hypot(v.x - w.x, v.z - w.z)).toBeGreaterThan(v.r + w.r);
        // flat: no piece stands more than 0.7 above or below another
        const hs = v.pieces.map((p) => islandHeight(levelled, p.x, p.z));
        expect(Math.max(...hs) - Math.min(...hs)).toBeLessThanOrEqual(0.05);
        for (const p of v.pieces) expect(inVignette(vs, p.x, p.z, 0.5)).toBe(true);
      }
      // the kinds take turns
      const kinds = vs.map((v) => v.kind);
      expect(new Set(kinds).size).toBe(Math.min(3, kinds.length));
    });
  }
});
