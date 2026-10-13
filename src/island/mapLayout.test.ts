import { describe, expect, it } from "vitest";
import { COMPANIES, DISTRICTS, PEOPLE } from "../data/catalog";
import { layoutWorld } from "../data/layout";
import type { Company, DistrictSlug } from "../data/types";
import { distToSpokes } from "./mapGround";
import {
  DISTRICT_PAVING,
  ENTRY_BACK,
  ENTRY_HALF,
  LANDMARK_R,
  SPOT_ROOM,
  dressingFor,
  plazaDressing,
  PLAZA_DRESS,
  MONUMENT_PAD,
  PORTAL_HALF,
  PORTAL_WALK_ROOM,
  ROAD_W,
  SPACING,
  arrowTurn,
  cameraAt,
  clusterAt,
  halfFov,
  hopTargets,
  kidTheta,
  mapFrame,
  mastsSeen,
  nearestHop,
  offAxis,
  pieceDistance,
  planFromLayout,
  readerBearing,
  segmentDistance,
  townRadius,
  walkSeconds,
  wedgeKinds,
  type MapPlan,
} from "./mapLayout";

const display = DISTRICTS.map((d) => ({ slug: d.slug, label: d.label, short: d.short, color: d.color }));
const example = layoutWorld(DISTRICTS.map((d) => d.slug), COMPANIES, PEOPLE);

/** A world of `n` districts with `each` companies apiece, to try the plan on maps unlike the example. */
function worldOf(n: number, each: number) {
  const order = Array.from({ length: n }, (_, i) => `d${i}` as DistrictSlug);
  const companies = order.flatMap((d, i) => Array.from({ length: each }, (_, k) => ({ slug: `c${i}-${k}`, name: `C${i}-${k}`, district: d }) as unknown as Company));
  return layoutWorld(order, companies, []);
}

const worlds = { example, two: worldOf(2, 8), four: worldOf(4, 5), many: worldOf(12, 12) };
const plans = Object.fromEntries(Object.entries(worlds).map(([k, w]) => [k, planFromLayout(w, display)])) as Record<keyof typeof worlds, MapPlan>;
const plan = plans.example;

/** The walks from the arrival to each road's mouth and to the monument. */
const walksOf = (p: MapPlan) => [...p.clusters.map((c) => ({ x: Math.cos(c.angle) * p.plaza.r, z: Math.sin(c.angle) * p.plaza.r })), { x: 0, z: 0 }];

describe("the island plan", () => {
  it("is the same on every visit and carries every company and person over", () => {
    expect(planFromLayout(example, display)).toEqual(plan);
    const pins = plan.clusters.flatMap((c) => c.pins);
    expect(pins).toHaveLength(COMPANIES.length + PEOPLE.length);
    expect(new Set(pins.map((p) => p.slug)).size).toBe(pins.length);
    expect(plan.clusters.find((c) => c.slug === "people")?.pins).toHaveLength(PEOPLE.length);
    for (const d of DISTRICTS) expect(plan.clusters.find((c) => c.slug === d.slug)?.pins).toHaveLength(COMPANIES.filter((c) => c.district === d.slug).length);
  });

  it("calls the people area what the site calls it, in its own color", () => {
    const named = planFromLayout(example, display, { label: "Coaches", color: "#3b4a5a" });
    const people = named.clusters.find((c) => c.slug === "people")!;
    expect(people.label).toBe("Coaches");
    expect(people.color).toBe("#3b4a5a");
    expect(people.isPeople).toBe(true);
  });

  for (const [name, p] of Object.entries(plans)) {
    describe(name, () => {
      it("moves each district whole, turned so its way in stays open: its pins keep their shape inside it", () => {
        const w = worlds[name as keyof typeof worlds];
        for (const c of p.clusters) {
          const disc = w.discs.find((d) => d.slug === c.slug)!;
          for (const pin of c.pins) {
            const before = w.pins.get(pin.slug)!;
            // the same distance from the middle (a turn about it), inside the district
            expect(Math.hypot(pin.x - c.cx, pin.z - c.cz)).toBeCloseTo(Math.hypot(before.x - disc.x, before.z - disc.z), 1);
            expect(Math.hypot(pin.x - c.cx, pin.z - c.cz)).toBeLessThanOrEqual(c.r);
          }
          // the pattern's shape kept: every pair as far apart as before
          for (let i = 0; i < c.pins.length; i++) for (let j = i + 1; j < c.pins.length; j++) {
            const a = c.pins[i];
            const b = c.pins[j];
            const a0 = w.pins.get(a.slug)!;
            const b0 = w.pins.get(b.slug)!;
            expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(Math.hypot(a0.x - b0.x, a0.z - b0.z), 1);
          }
          // nothing stands in the walk in from the road to the landmark (the example's districts all leave room)
          if (name === "example" || c.pins.length <= 8) {
            for (const pin of c.pins) {
              const along = (pin.x - c.cx) * -Math.cos(c.angle) + (pin.z - c.cz) * -Math.sin(c.angle);
              const across = Math.abs((pin.x - c.cx) * -Math.sin(c.angle) - (pin.z - c.cz) * -Math.cos(c.angle));
              if (along > 0) expect(across, `${c.slug} ${pin.slug}`).toBeGreaterThanOrEqual(ENTRY_HALF + 1.2 - 0.05);
            }
          }
        }
      });

      it("rings the districts outside the street, as close in as their neighbors leave room for", () => {
        const ring = Math.hypot(p.clusters[0].cx, p.clusters[0].cz);
        const streetEdge = p.street.r + p.street.width / 2;
        for (const c of p.clusters) {
          expect(Math.hypot(c.cx, c.cz)).toBeCloseTo(ring, 1);
          expect(Math.hypot(c.cx, c.cz) - c.r - streetEdge).toBeGreaterThanOrEqual(SPACING.inset - 0.05);
          for (const o of p.clusters) {
            if (o === c) continue;
            expect(Math.hypot(o.cx - c.cx, o.cz - c.cz) - o.r - c.r).toBeGreaterThanOrEqual(SPACING.between - 0.05);
          }
        }
        // As close in as that allows: either the street or a pair of neighbors sets the ring.
        const tight = Math.min(
          ...p.clusters.map((c) => Math.hypot(c.cx, c.cz) - c.r - streetEdge - SPACING.inset),
          ...p.clusters.flatMap((c) => p.clusters.filter((o) => o !== c).map((o) => Math.hypot(o.cx - c.cx, o.cz - c.cz) - o.r - c.r - SPACING.between)),
        );
        expect(tight).toBeLessThan(0.1);
      });

      it("has the arrival look straight at the monument from the plaza, its camera over the paving", () => {
        const s = p.spawn;
        expect(Math.hypot(s.x, s.z)).toBeCloseTo(SPACING.spawn, 1);
        expect(offAxis(s, 0, 0)).toBeLessThan(0.01);
        const cam = cameraAt(s);
        expect(Math.hypot(cam.x, cam.z)).toBeLessThan(p.plaza.r);
        expect(p.monument.facing).toBeCloseTo(Math.atan2(s.x, s.z), 6);
      });

      it("stands the portal on the plaza, fully in the arrival's view, clear of the monument, the pylons and every walk", () => {
        const q = p.portal;
        expect(Math.hypot(q.x, q.z) + PORTAL_HALF).toBeLessThan(p.plaza.r);
        expect(Math.hypot(q.x, q.z) - PORTAL_HALF).toBeGreaterThan(MONUMENT_PAD + 1.5);
        for (const y of p.pylons) expect(Math.hypot(q.x - y.x, q.z - y.z)).toBeGreaterThan(PORTAL_HALF + 2);
        expect(offAxis(p.spawn, q.x, q.z, PORTAL_HALF)).toBeLessThan(halfFov());
        for (const w of walksOf(p)) expect(segmentDistance(q.x, q.z, p.spawn.x, p.spawn.z, w.x, w.z)).toBeGreaterThanOrEqual(PORTAL_WALK_ROOM - 0.05);
        // It faces the arrival.
        expect(Math.cos(q.facing - Math.atan2(p.spawn.x - q.x, p.spawn.z - q.z))).toBeGreaterThan(0.999);
      });

      it("never hides a district's mast behind the monument", () => {
        expect(mastsSeen(p.spawn, p.clusters.map((c) => c.mast)).hidden).toBe(0);
      });

      it("puts the Walking times board ahead of the arrival on the side away from the portal, facing it, listing every district left to right", () => {
        const b = p.board;
        const s = p.spawn;
        const fx = Math.sin(s.facing);
        const fz = Math.cos(s.facing);
        const ahead = (b.x - s.x) * fx + (b.z - s.z) * fz;
        const right = (b.x - s.x) * -fz + (b.z - s.z) * fx;
        const portalRight = (p.portal.x - s.x) * -fz + (p.portal.z - s.z) * fx;
        expect(ahead).toBeGreaterThan(6);
        expect(Math.abs(right)).toBeGreaterThan(3);
        expect(Math.sign(right)).toBe(-Math.sign(portalRight));
        expect(offAxis(s, b.x, b.z, 1.7)).toBeLessThan(halfFov());
        expect(Math.cos(b.facing - Math.atan2(s.x - b.x, s.z - b.z))).toBeGreaterThan(0.999);
        expect(b.rows.map((r) => r.slug).sort()).toEqual(p.clusters.map((c) => c.slug).sort());
        for (let i = 1; i < b.rows.length; i++) expect(b.rows[i].bearing).toBeGreaterThanOrEqual(b.rows[i - 1].bearing);
        for (const row of b.rows) {
          const c = p.clusters.find((k) => k.slug === row.slug)!;
          expect(row.bearing).toBeCloseTo(readerBearing(b, c.cx, c.cz), 6);
          expect(row.seconds).toBe(walkSeconds(b.x, b.z, c.cx, c.cz));
        }
      });

      it("runs a road from inside the plaza onto each district's paving, short of its pins, with a fingerpost beside its mouth", () => {
        for (const s of p.spokes) {
          const c = p.clusters.find((k) => k.slug === s.slug)!;
          expect(Math.hypot(s.ax, s.az)).toBeLessThan(p.plaza.r);
          const end = Math.hypot(s.bx - c.cx, s.bz - c.cz);
          expect(end).toBeLessThan(c.r + DISTRICT_PAVING);
          expect(end).toBeGreaterThanOrEqual(c.r);
          for (const pin of c.pins) expect(distToSpokes({ spokes: [s] }, pin.x, pin.z)).toBeGreaterThan(1);
        }
        expect(p.posts).toHaveLength(p.clusters.length);
        p.posts.forEach((post, i) => {
          const c = p.clusters[i];
          expect(post.slug).toBe(c.slug);
          const d = distToSpokes({ spokes: [p.spokes[i]] }, post.x, post.z);
          expect(d).toBeGreaterThan(ROAD_W / 2 + 1);
          expect(d).toBeLessThan(ROAD_W / 2 + 2.5);
          expect(Math.abs(Math.hypot(post.x, post.z) - p.plaza.r)).toBeLessThan(5);
          // It faces the plaza, and the arm (its local +x) points across the road's mouth.
          expect(Math.cos(post.facing - Math.atan2(-Math.cos(c.angle), -Math.sin(c.angle)))).toBeGreaterThan(0.999);
          const ax = Math.cos(post.facing);
          const az = -Math.sin(post.facing);
          const ahead = { x: post.x + ax * 2, z: post.z + az * 2 };
          expect(distToSpokes({ spokes: [p.spokes[i]] }, ahead.x, ahead.z)).toBeLessThan(d);
          expect(post.text).toBe(`${c.short} · ${walkSeconds(post.x, post.z, c.cx, c.cz)}s`);
          // the time to the district's heart, not to the step past its arch (which reads "1s" everywhere)
          expect(walkSeconds(post.x, post.z, c.cx, c.cz)).toBeGreaterThan(1);
        });
      });

      it("keeps stalls and lamps off every road and out of the arrival's first view of the plaza", () => {
        expect(p.stalls).toHaveLength(p.clusters.length);
        for (const st of p.stalls) {
          expect(Math.hypot(st.x, st.z)).toBeGreaterThan(p.street.r + p.street.width / 2 + 1);
          expect(distToSpokes(p, st.x, st.z)).toBeGreaterThan(ROAD_W / 2 + 2.5);
          // Front (+z local) toward the plaza.
          expect(Math.sin(st.ry) * -st.x + Math.cos(st.ry) * -st.z).toBeGreaterThan(0.99 * Math.hypot(st.x, st.z));
        }
        const cam = cameraAt(p.spawn);
        for (const l of [...p.lamps.plaza, ...p.lamps.roads, ...p.lamps.street]) {
          expect(distToSpokes(p, l.x, l.z)).toBeGreaterThan(ROAD_W / 2 + 0.9);
          expect(Math.hypot(l.x - cam.x, l.z - cam.z)).toBeGreaterThan(5);
        }
      });

      it("stands a set piece on the shore of every wedge, in its middle, a few steps up the beach and facing the sea", () => {
        const wedges = p.pieces.filter((q) => q.coast);
        expect(wedges).toHaveLength(p.clusters.length);
        for (const q of wedges) {
          const r = Math.hypot(q.x, q.z);
          expect(r).toBeGreaterThan(p.island.land);
          expect(r + 3).toBeLessThan(p.island.walk);
          expect(Math.cos(Math.atan2(q.z, q.x) - q.wedge)).toBeGreaterThan(0.9999);
          expect(Math.cos(q.facing - Math.atan2(Math.cos(q.wedge), Math.sin(q.wedge)))).toBeGreaterThan(0.9999);
          expect(q.reach).toBe(q.kind === "marina" ? 34 : 0);
        }
      });

      it("stands the hills' pieces clear of the town, every district, road, mast and animal, the beach and each other", () => {
        const town = townRadius(p);
        const masts = p.clusters.map((c) => c.mast);
        const inland = p.pieces.filter((q) => !q.coast);
        expect(inland.length).toBeLessThanOrEqual(p.clusters.length);
        for (const q of inland) {
          const fp = q.footprint;
          const r = Math.hypot(q.x, q.z);
          expect(r - fp).toBeGreaterThanOrEqual(town + 4 - 0.05);
          expect(r + fp).toBeLessThanOrEqual(p.island.land - 8 + 0.05);
          for (const c of p.clusters) expect(Math.hypot(q.x - c.cx, q.z - c.cz) - fp).toBeGreaterThanOrEqual(c.r + DISTRICT_PAVING + 7 - 0.05);
          for (const m of masts) expect(Math.hypot(q.x - m.x, q.z - m.z) - fp).toBeGreaterThanOrEqual(4 - 0.05);
          for (const k of [p.critters.cats, p.critters.sloth]) expect(Math.hypot(q.x - k.x, q.z - k.z) - fp).toBeGreaterThanOrEqual(4 - 0.05);
          expect(distToSpokes(p, q.x, q.z) - fp).toBeGreaterThanOrEqual(ROAD_W / 2 + 3 - 0.05);
          for (const o of p.pieces) if (o !== q) expect(pieceDistance(o, q.x, q.z) - o.footprint - fp).toBeGreaterThanOrEqual((o.coast ? 4 : 6) - 0.05);
          // It faces the plaza.
          expect(Math.cos(q.facing - Math.atan2(-q.x, -q.z))).toBeGreaterThan(0.9999);
        }
      });

      it("hands each landmark out once at most, and keeps the parasols on the open east beach, clear of the shore's pieces", () => {
        for (const kind of ["beacon", "marina", "turbine", "datacenter", "observatory"]) expect(p.pieces.filter((q) => q.kind === kind).length).toBeLessThanOrEqual(1);
        expect(p.beach).toHaveLength(4);
        for (const b of p.beach) {
          expect(Math.abs(Math.atan2(b.z, b.x))).toBeLessThanOrEqual(0.551);
          for (const q of p.pieces.filter((k) => k.coast)) expect(pieceDistance(q, b.x, b.z)).toBeGreaterThanOrEqual(q.footprint + 4 - 0.05);
          for (const o of p.beach) if (o !== b) expect(Math.hypot(o.x - b.x, o.z - b.z)).toBeGreaterThanOrEqual(7 - 0.05);
        }
      });

      it("ends the land past the farthest district, then the beach, the water and the seabed", () => {
        for (const c of p.clusters) expect(Math.hypot(c.cx, c.cz) + c.r + 20).toBeLessThan(p.island.land);
        expect(p.island.land).toBeLessThan(p.island.walk);
        expect(p.island.walk).toBeLessThan(p.island.water);
        expect(p.island.water).toBeLessThan(p.island.extent);
      });
    });
  }

  it("puts all twelve kinds of set piece on the example's island, the beacon north, the marina east and the turbine west", () => {
    expect(new Set(plan.pieces.map((q) => q.kind)).size).toBe(12);
    const nearest = (bearing: number, coast: boolean) => {
      const wedges = plan.pieces.filter((q) => q.coast === coast).map((q) => q.wedge);
      return wedges.reduce((b, a) => (Math.abs(Math.atan2(Math.sin(a - bearing), Math.cos(a - bearing))) < Math.abs(Math.atan2(Math.sin(b - bearing), Math.cos(b - bearing))) ? a : b));
    };
    expect(plan.pieces.find((q) => q.kind === "beacon")!.wedge).toBe(nearest(-Math.PI / 2, true));
    expect(plan.pieces.find((q) => q.kind === "marina")!.wedge).toBe(nearest(0, true));
    expect(plan.pieces.find((q) => q.kind === "turbine")!.wedge).toBe(nearest(Math.PI, false));
  });

  it("hands the kinds out each once, then the ones that may repeat, by turns", () => {
    const wedges = Array.from({ length: 9 }, (_, i) => -Math.PI + (i + 0.5) * ((2 * Math.PI) / 9));
    const coast = wedgeKinds(wedges, true);
    expect(new Set(coast).size).toBe(5);
    expect(coast.filter((k) => k === "beacon" || k === "marina")).toHaveLength(2);
    const inland = wedgeKinds(wedges, false);
    expect(new Set(inland).size).toBe(7);
    expect(inland.filter((k) => k === "turbine" || k === "datacenter" || k === "observatory")).toHaveLength(3);
    // With two wedges the beacon takes the northern one and the marina the eastern; with one, the first in order takes it.
    expect(wedgeKinds([0.1, -1.5], true)).toEqual(["marina", "beacon"]);
    expect(wedgeKinds([0.1], true)).toEqual(["beacon"]);
  });

  it("shows the example's arrival at least two districts' masts", () => {
    expect(mastsSeen(plan.spawn, plan.clusters.map((c) => c.mast)).inFrame).toBeGreaterThanOrEqual(2);
  });
});

describe("hopping", () => {
  const targets = hopTargets(plan, { portal: "Nexus portal", plaza: "Plaza" });

  it("offers every district, the portal and the plaza", () => {
    expect(targets.map((t) => t.id)).toEqual([...plan.clusters.map((c) => c.slug), "portal", "plaza"]);
  });

  it("lands on a district's road outside its arch, facing in", () => {
    for (const c of plan.clusters) {
      const t = targets.find((k) => k.id === c.slug)!;
      expect(t.land).toEqual(c.entry);
      expect(distToSpokes(plan, c.entry.x, c.entry.z)).toBeLessThan(0.5);
      expect(Math.hypot(c.entry.x - c.cx, c.entry.z - c.cz)).toBeCloseTo(c.r + ENTRY_BACK, 1);
      // Far enough back that the camera, CAMERA.back behind, sees the arch: and the arch is still ahead on the road.
      expect(Math.hypot(c.entry.x - c.sign.x, c.entry.z - c.sign.z)).toBeGreaterThan(4);
      expect(Math.cos(c.entry.facing - Math.atan2(c.cx - c.entry.x, c.cz - c.entry.z))).toBeGreaterThan(0.999);
    }
  });

  it("lands in front of the portal facing it, and at the arrival for the plaza", () => {
    const portal = targets.find((t) => t.id === "portal")!;
    const d = Math.hypot(portal.land.x - plan.portal.x, portal.land.z - plan.portal.z);
    expect(d).toBeGreaterThan(5);
    expect(d).toBeLessThan(7);
    expect(Math.cos(portal.land.facing - Math.atan2(plan.portal.x - portal.land.x, plan.portal.z - portal.land.z))).toBeGreaterThan(0.999);
    expect(targets.find((t) => t.id === "plaza")!.land).toEqual(plan.spawn);
  });

  it("finds the place a click on the map was meant for, or nothing out in the hills", () => {
    for (const c of plan.clusters) expect(nearestHop(targets, c.cx + c.r * 0.5, c.cz, 8)?.id).toBe(c.slug);
    expect(nearestHop(targets, plan.portal.x, plan.portal.z, 8)?.id).toBe("portal");
    expect(nearestHop(targets, 0, 2, 8)?.id).toBe("plaza");
    expect(nearestHop(targets, plan.island.land - 4, 0, 4)).toBeNull();
  });

  it("knows which district the kid stands in", () => {
    const c = plan.clusters[2];
    expect(clusterAt(plan, c.cx, c.cz)?.slug).toBe(c.slug);
    expect(clusterAt(plan, 0, 0)).toBeNull();
  });

  it("turns the kid to face a spot's facing (theta 0 faces -z)", () => {
    for (const f of [0, 0.7, -2.1, Math.PI]) {
      const t = kidTheta(f);
      expect(-Math.sin(t)).toBeCloseTo(Math.sin(f), 6);
      expect(-Math.cos(t)).toBeCloseTo(Math.cos(f), 6);
    }
  });
});

describe("the minimap's frame", () => {
  const frame = mapFrame(plan, 180);

  it("maps the island inside the square, north (-z) up, and back again", () => {
    const [x0, y0] = frame.toMap(0, -plan.island.water);
    expect(x0).toBeCloseTo(90, 6);
    expect(y0).toBeGreaterThan(0);
    expect(y0).toBeLessThan(10);
    for (const [x, z] of [[12, -40], [-70, 33], [0, 0]]) {
      const [px, py] = frame.toMap(x, z);
      const back = frame.toWorld(px, py);
      expect(back.x).toBeCloseTo(x, 6);
      expect(back.z).toBeCloseTo(z, 6);
    }
  });

  it("turns the arrow the way the kid faces: up for -z, right for +x", () => {
    expect(arrowTurn(kidTheta(Math.PI))).toBeCloseTo(0, 6);
    expect(Math.cos(arrowTurn(kidTheta(Math.PI / 2)) - Math.PI / 2)).toBeCloseTo(1, 6);
  });
});

describe("walkSeconds", () => {
  it("is the time at the kid's pace, to the nearest second, never under one", () => {
    expect(walkSeconds(0, 0, 0, 0)).toBe(1);
    expect(walkSeconds(0, 0, 45, 0)).toBe(3);
    expect(walkSeconds(0, 0, 0, 52)).toBe(3);
  });
});

describe("district themes and dressing", () => {
  const iconPlan = planFromLayout(example, DISTRICTS.map((d) => ({ slug: d.slug, label: d.label, short: d.short, color: d.color, icon: d.icon })));

  it("gives each district a theme: its own, its icon's, or one its neighbors are not using", () => {
    const own = planFromLayout(example, DISTRICTS.map((d, i) => ({ slug: d.slug, label: d.label, short: d.short, color: d.color, icon: d.icon, theme: i === 0 ? "studio" : undefined })));
    expect(own.clusters.find((c) => c.slug === DISTRICTS[0].slug)?.theme).toBe("studio");
    // The example's icons all suggest one (leaf -> greenhouse, landmark -> bank, cpu -> workshop...).
    expect(iconPlan.clusters.find((c) => c.slug === "climate")?.theme).toBe("greenhouse");
    expect(iconPlan.clusters.find((c) => c.slug === "fintech")?.theme).toBe("bank");
    expect(iconPlan.clusters.find((c) => c.slug === "hardware")?.theme).toBe("workshop");
    expect(iconPlan.clusters.find((c) => c.slug === "people")?.theme).toBe("people");
    // Without icons or themes, neighbors on the ring never share one.
    for (const p of Object.values(plans)) {
      const ring = p.clusters.slice().sort((a, b) => a.angle - b.angle).filter((c) => !c.isPeople);
      if (ring.length < 3) continue;
      ring.forEach((c, i) => expect(c.theme, c.slug).not.toBe(ring[(i + 1) % ring.length].theme));
    }
  });

  const check = (p: MapPlan) => {
    for (const c of p.clusters) {
      const d = dressingFor(c);
      expect(d).toEqual(dressingFor(c));
      expect(d.spots.map((s) => s.slug).sort()).toEqual(c.pins.map((q) => q.slug).sort());
      const things = [
        ...d.planters.map((t) => ({ ...t, room: 1.6, kind: "planter" })),
        ...d.benches.map((t) => ({ ...t, room: 1.2, kind: "bench" })),
        ...d.poles.map((t) => ({ ...t, room: 0.6, kind: "pole" })),
        ...d.trees.map((t) => ({ ...t, room: 1.4, kind: "tree" })),
      ];
      for (const t of things) {
        // inside the paving (trees may stand on its outer band), clear of the landmark and of every spot
        expect(Math.hypot(t.x - c.cx, t.z - c.cz), `${c.slug} ${t.kind}`).toBeLessThanOrEqual(c.r + DISTRICT_PAVING + 0.01);
        expect(Math.hypot(t.x - c.cx, t.z - c.cz), `${c.slug} ${t.kind}`).toBeGreaterThan(LANDMARK_R);
        for (const s of d.spots) expect(Math.hypot(t.x - s.x, t.z - s.z), `${c.slug} ${t.kind} by ${s.slug}`).toBeGreaterThanOrEqual(SPOT_ROOM * 0.6 + t.room - 0.01);
        // the walk from the road to the landmark stays open
        const inX = -Math.cos(c.angle);
        const inZ = -Math.sin(c.angle);
        const along = (t.x - c.cx) * inX + (t.z - c.cz) * inZ;
        const across = Math.abs((t.x - c.cx) * inZ - (t.z - c.cz) * inX);
        if (along > 0) expect(across, `${c.slug} ${t.kind} in the way in`).toBeGreaterThanOrEqual(ENTRY_HALF);
      }
      for (let i = 0; i < things.length; i++) for (let j = i + 1; j < things.length; j++) {
        const a = things[i];
        const b = things[j];
        expect(Math.hypot(a.x - b.x, a.z - b.z), `${c.slug} ${a.kind}/${b.kind}`).toBeGreaterThanOrEqual(a.room + b.room - 0.02);
      }
      // airy, but never bare: some poles and trees in every district
      expect(d.poles.length + d.trees.length, c.slug).toBeGreaterThan(0);
    }
  };

  it("dresses every district without crowding a spot, the landmark or the way in", () => {
    for (const p of Object.values(plans)) check(p);
    check(iconPlan);
  });

  it("holds up for one company and for a crowded district", () => {
    check(planFromLayout(worldOf(1, 1), display));
    check(planFromLayout(worldOf(3, 241), display));
  });
});

describe("the plaza's dressing", () => {
  it("keeps every path, the arrival's walks and the landmarks clear", () => {
    for (const p of Object.values(plans)) {
      const d = plazaDressing(p);
      expect(d).toEqual(plazaDressing(p));
      const cam = cameraAt(p.spawn);
      for (const t of [...d.planters, ...d.benches]) {
        expect(Math.hypot(t.x, t.z)).toBeLessThan(p.plaza.r - 2);
        for (const q of [p.portal, p.board, p.spawn, cam, ...p.pylons]) expect(Math.hypot(q.x - t.x, q.z - t.z)).toBeGreaterThanOrEqual(PLAZA_DRESS.keep - 0.01);
        for (const c of p.clusters) expect(segmentDistance(t.x, t.z, 0, 0, Math.cos(c.angle) * 40, Math.sin(c.angle) * 40)).toBeGreaterThanOrEqual(PLAZA_DRESS.path + 1.4 - 0.01);
      }
    }
    // the example's plaza is dressed, not bare
    const d = plazaDressing(plan);
    expect(d.planters.length + d.benches.length).toBeGreaterThan(2);
  });
});
