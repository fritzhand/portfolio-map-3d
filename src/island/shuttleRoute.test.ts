import { describe, expect, it } from "vitest";
import { COMPANIES, DISTRICTS, PEOPLE } from "../data/catalog";
import { layoutWorld } from "../data/layout";
import { ROAD_W, planFromLayout } from "./mapLayout";
import { STOP_PAST, shuttleRoute } from "./shuttleRoute";

const plan = planFromLayout(layoutWorld(DISTRICTS.map((d) => d.slug), COMPANIES, PEOPLE), DISTRICTS.map((d) => ({ slug: d.slug, label: d.label, short: d.short, color: d.color })));

describe("the shuttle's route", () => {
  const route = shuttleRoute(plan);
  it("runs in the ring street's outer lane", () => {
    expect(route.r).toBeGreaterThan(plan.street.r);
    expect(route.r).toBeLessThan(plan.street.r + plan.street.width / 2);
  });
  it("stops once past every road's mouth, in order round the ring, never across a road", () => {
    expect(route.stops).toHaveLength(plan.clusters.length);
    route.stops.forEach((a, i) => {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(Math.PI * 2);
      if (i) expect(a).toBeGreaterThan(route.stops[i - 1]);
      for (const c of plan.clusters) {
        const d = Math.abs(Math.atan2(Math.sin(a - c.angle), Math.cos(a - c.angle))) * route.r;
        expect(d).toBeGreaterThan(ROAD_W / 2);
      }
    });
    expect(STOP_PAST).toBeGreaterThan(ROAD_W / 2);
  });
  it("is deterministic", () => expect(shuttleRoute(plan)).toEqual(route));
});
