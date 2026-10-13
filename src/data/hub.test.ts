import { describe, expect, it } from "vitest";
import { AVATAR_RADIUS, resolveCollisions } from "../views/walk/nav";
import { DISTRICTS, COMPANIES, PEOPLE } from "./catalog";
import {
  HUB,
  HUB_CENTER,
  HUB_FRAME,
  HUB_ROT,
  HUB_TOP,
  PORTAL,
  WALL_PAD,
  hubBeacon,
  hubBlockers,
  hubBoxes,
  hubClearance,
  hubColliders,
  hubFootprints,
  hubRoofAt,
  hubSiteRadius,
  hubToWorld,
  type HubBox,
  type HubCircle,
  plazaLamps,
  plazaSeats,
  portalPosts,
  roadDistance,
  segmentHitsHub,
  worldToHub,
} from "./hub";
import { PLAZA_RADIUS, ROAD_WIDTH, layoutWorld } from "./layout";

// The world the walk view builds (the districts, then the people area), and one without people.
const world = layoutWorld(
  DISTRICTS.map((d) => d.slug),
  COMPANIES,
  PEOPLE,
);
const bare = layoutWorld(
  DISTRICTS.map((d) => d.slug),
  COMPANIES,
);

/** Signed difference between two headings, in (-π, π]. */
const turn = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

describe("the hub's frame", () => {
  it("round-trips between local and world", () => {
    for (const [x, z] of [[0, 0], [12.5, -3], [-24.57, 11.655]]) {
      const w = hubToWorld(x, z);
      const back = worldToHub(w.x, w.z);
      expect(back.x).toBeCloseTo(x);
      expect(back.z).toBeCloseTo(z);
    }
    expect(hubToWorld(0, 0)).toEqual({ x: HUB_CENTER.x, z: HUB_CENTER.z });
  });

  it("hands the screenshot harness the same frame", () => {
    expect(HUB_FRAME.center).toEqual([HUB_CENTER.x, HUB_CENTER.z]);
    expect(HUB_FRAME.rot).toBe(HUB_ROT);
    expect(HUB_FRAME.halfL * 2).toBeCloseTo(HUB.hall.x1 - HUB.hall.x0);
    expect(HUB_FRAME.halfD * 2).toBeCloseTo(HUB.hall.z1 - HUB.hall.z0);
    expect(HUB_FRAME.wallH).toBe(HUB.hall.parapet);
    expect(HUB_FRAME.beacon).toEqual({ x: HUB.beacon.x, z: HUB.beacon.z, top: HUB.beacon.top });
  });

  it("stacks the pavilion: the hall on its plinth, the upper volume on the hall's roof, the canopy at the front", () => {
    const { plinth, hall, upper, canopy } = HUB;
    for (const [inner, outer] of [[hall, plinth], [upper, hall]] as const) {
      expect(inner.x0).toBeGreaterThanOrEqual(outer.x0);
      expect(inner.x1).toBeLessThanOrEqual(outer.x1);
      expect(inner.z0).toBeGreaterThanOrEqual(outer.z0);
      expect(inner.z1).toBeLessThanOrEqual(outer.z1);
    }
    expect(upper.deck).toBeGreaterThan(hall.parapet);
    expect(canopy.z0).toBe(hall.z1);
    expect(canopy.y).toBeLessThan(hall.deck);
    expect(HUB.doors.x0).toBeGreaterThanOrEqual(canopy.x0);
    expect(HUB.doors.x1).toBeLessThanOrEqual(canopy.x1);
    expect(HUB_TOP).toBe(HUB.beacon.top);
  });

  it("centers the front on the building's axis: the entrance, the hub's name, the upper volume and the logo sign", () => {
    const mid = (r: { x0: number; x1: number }) => (r.x0 + r.x1) / 2;
    for (const part of [HUB.plinth, HUB.hall, HUB.upper, HUB.canopy, HUB.doors, HUB.glass]) expect(mid(part)).toBeCloseTo(0, 6);
    expect(HUB.beacon.x).toBe(0);
    // The canopy's posts and the planters mirror each other across the axis.
    const [a, b] = HUB.canopy.posts;
    expect(a.x).toBeCloseTo(-b.x, 6);
    expect(a.z).toBe(b.z);
    const [left, right] = HUB.planters;
    expect(left.x0).toBeCloseTo(-right.x1, 6);
    expect(left.x1).toBeCloseTo(-right.x0, 6);
    // The axis runs from the building through the spawn: an arrival faces the entrance.
    expect(hubToWorld(0, 0).x).toBeCloseTo(world.spawn.x, 6);
  });
});

describe("the hub on the plaza", () => {
  it("fits the plaza with room to walk around it", () => {
    expect(hubSiteRadius()).toBeLessThan(PLAZA_RADIUS - 8);
    for (const f of hubFootprints()) for (const p of f.pts) expect(Math.hypot(p.x, p.z)).toBeLessThan(PLAZA_RADIUS - 8);
    expect(hubFootprints().map((f) => f.kind)).toEqual(["hall", "upper", "canopy"]);
  });

  it("keeps every box and collider on the plaza", () => {
    for (const b of hubBoxes())
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) expect(Math.hypot(b.x + sx * b.hx, b.z + sz * b.hz)).toBeLessThan(PLAZA_RADIUS - 8);
    for (const c of hubColliders()) expect(Math.hypot(c.x, c.z) + c.r).toBeLessThan(PLAZA_RADIUS - 8);
  });

  it("spawns the walker clear of the building, facing it, with the portal in front", () => {
    const s = world.spawn;
    const at = resolveCollisions(world, s.x, s.z, hubColliders(), hubBoxes());
    expect(at.x).toBeCloseTo(s.x);
    expect(at.z).toBeCloseTo(s.z);
    expect(hubClearance(s.x, s.z)).toBeGreaterThan(6);
    // Headings: 0 faces +z. The hall is straight ahead...
    expect(Math.abs(turn(Math.atan2(HUB_CENTER.x - s.x, HUB_CENTER.z - s.z), s.facing))).toBeLessThan(0.05);
    // ...and the portal within 40 degrees of it.
    expect(Math.abs(turn(Math.atan2(PORTAL.x - s.x, PORTAL.z - s.z), s.facing))).toBeLessThan((40 * Math.PI) / 180);
  });

  it("leaves every road mouth open", () => {
    for (const w of [world, bare])
      for (const d of w.discs) {
        const r = PLAZA_RADIUS - 0.4;
        expect(hubClearance(Math.cos(d.angle) * r, Math.sin(d.angle) * r)).toBeGreaterThan(4);
      }
  });

  it("stands the lamps clear of the building, the portal and the roads", () => {
    for (const w of [world, bare]) {
      const lamps = plazaLamps(w);
      expect(lamps.length).toBeGreaterThanOrEqual(w.discs.length);
      for (const l of lamps) {
        expect(hubClearance(l.x, l.z)).toBeGreaterThan(2);
        expect(roadDistance(w, l.x, l.z)).toBeGreaterThan(ROAD_WIDTH / 2 + 1);
        for (const c of hubColliders()) expect(Math.hypot(l.x - c.x, l.z - c.z) - c.r).toBeGreaterThan(2);
      }
    }
  });

  it("sets benches and planters clear of the building, the portal, the roads and the spawn", () => {
    for (const w of [world, bare]) {
      const seats = plazaSeats(w);
      expect(seats.length).toBeGreaterThanOrEqual(12);
      for (const s of seats) {
        expect(hubClearance(s.x, s.z)).toBeGreaterThan(3);
        expect(roadDistance(w, s.x, s.z)).toBeGreaterThan(ROAD_WIDTH / 2 + 2);
        expect(Math.hypot(s.x - w.spawn.x, s.z - w.spawn.z)).toBeGreaterThan(6);
        for (const c of hubColliders()) expect(Math.hypot(s.x - c.x, s.z - c.z) - c.r).toBeGreaterThan(2);
      }
    }
  });

  it("puts the beacon's pole on the upper roof", () => {
    const b = hubBeacon();
    const l = worldToHub(b.x, b.z);
    const u = HUB.upper;
    expect(l.x).toBeGreaterThan(u.x0 + 2);
    expect(l.x).toBeLessThan(u.x1 - 2);
    expect(l.z).toBeGreaterThan(u.z0 + 2);
    expect(l.z).toBeLessThan(u.z1 - 2);
    expect(b.foot).toBe(u.parapet);
    expect(b.y0).toBeGreaterThan(u.parapet + 2);
    expect(b.y1 - b.y0).toBeGreaterThan(3);
  });
});

describe("the Nexus portal", () => {
  it("stands on the plaza, clear of the building", () => {
    expect(Math.hypot(PORTAL.x, PORTAL.z) + PORTAL.r).toBeLessThan(PLAZA_RADIUS - 8);
    // The portal's own term in hubClearance is negative inside its ring; measure the building alone.
    const building = hubBoxes()[0];
    const l = worldToHub(PORTAL.x, PORTAL.z);
    const lb = worldToHub(building.x, building.z);
    const gap = Math.hypot(Math.max(0, Math.abs(l.x - lb.x) - building.hx), Math.max(0, Math.abs(l.z - lb.z) - building.hz));
    expect(gap - PORTAL.r).toBeGreaterThan(2);
  });

  it("keeps its ring and posts off every road's line, so a road's mouth never opens onto it", () => {
    // A road begins at the plaza's rim, far past the portal; the lane kept clear is a walker's width
    // either side of the road's center line carried through the plaza.
    const lane = 2;
    for (const w of [world, bare]) {
      expect(roadDistance(w, PORTAL.x, PORTAL.z)).toBeGreaterThan(PORTAL.r + lane);
      for (const p of portalPosts()) expect(roadDistance(w, p.x, p.z) - p.r).toBeGreaterThan(lane);
    }
  });

  it("turns its face toward the spawn, with a post on either side of the opening", () => {
    const s = world.spawn;
    expect(Math.abs(turn(PORTAL.facing, Math.atan2(s.x - PORTAL.x, s.z - PORTAL.z)))).toBeLessThan(1e-9);
    const [a, b] = portalPosts();
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(2 * (PORTAL.r + 0.1));
    expect((a.x + b.x) / 2).toBeCloseTo(PORTAL.x);
    expect((a.z + b.z) / 2).toBeCloseTo(PORTAL.z);
    // The posts stand across the face, so the walker goes through between them.
    expect((b.x - a.x) * Math.sin(PORTAL.facing) + (b.z - a.z) * Math.cos(PORTAL.facing)).toBeCloseTo(0);
    expect(Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r).toBeGreaterThan(2 * AVATAR_RADIUS + 1);
  });

  it("collides its posts and lets the camera look over the ring", () => {
    for (const p of portalPosts()) expect(hubColliders().some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 1e-9 && c.r >= p.r)).toBe(true);
    expect(hubBlockers().some((b) => Math.hypot(b.x - PORTAL.x, b.z - PORTAL.z) < 1e-9 && b.r >= PORTAL.r && b.h >= PORTAL.r * 2)).toBe(true);
  });
});

describe("segmentHitsHub", () => {
  const c = hubToWorld(0, 0);
  it("finds the hall between a camera and a walker behind it", () => {
    const front = hubToWorld(0, HUB.hall.z1 + 20);
    const back = hubToWorld(0, HUB.hall.z0 + 1);
    // A walker just inside the north wall's line is hidden from a camera south of the building.
    expect(segmentHitsHub(front.x, 8, front.z, back.x, 1.3, back.z)).toBe(true);
    expect(segmentHitsHub(front.x, 8, front.z, c.x, 1.3, c.z)).toBe(true);
  });
  it("ignores lines over the roof and lines across the open plaza", () => {
    const a = hubToWorld(-30, 0);
    const b = hubToWorld(30, 0);
    expect(segmentHitsHub(a.x, 40, a.z, b.x, 40, b.z)).toBe(false);
    const s = world.spawn;
    expect(segmentHitsHub(s.x, 8.6, s.z + 21, s.x, 1.3, s.z)).toBe(false);
  });
});

describe("hubRoofAt (the follow camera's floor over the building)", () => {
  const { hall, upper, canopy } = HUB;
  it("keeps the camera over the hall's roof, the upper volume and the canopy", () => {
    const over = (x: number, z: number) => {
      const p = hubToWorld(x, z);
      return hubRoofAt(p.x, p.z);
    };
    // The hall's roof where the upper volume does not stand on it.
    for (const [x, z] of [[hall.x1 - 0.3, hall.z1 - 0.3], [(upper.x1 + hall.x1) / 2, 0], [hall.x0 + 0.3, hall.z1 - 0.3]]) expect(over(x, z)).toBeGreaterThanOrEqual(hall.parapet + 0.5);
    for (const [x, z] of [[(upper.x0 + upper.x1) / 2, (upper.z0 + upper.z1) / 2], [upper.x0 + 0.3, upper.z0 + 0.3], [upper.x1 - 0.3, upper.z1 - 0.3]]) expect(over(x, z)).toBeGreaterThanOrEqual(upper.parapet + 0.5);
    expect(over((canopy.x0 + canopy.x1) / 2, (canopy.z0 + canopy.z1) / 2)).toBeGreaterThanOrEqual(canopy.top + 0.5);
    const p = hubToWorld(0, 0);
    expect(hubRoofAt(p.x, p.z)).toBeGreaterThanOrEqual(upper.parapet + 0.5);
  });

  it("is zero over the open plaza, at the spawn and on the roads", () => {
    const s = world.spawn;
    expect(hubRoofAt(s.x, s.z)).toBe(0);
    expect(hubRoofAt(s.x, s.z + 21)).toBe(0);
    for (const d of world.discs) expect(hubRoofAt(Math.cos(d.angle) * (PLAZA_RADIUS - 1), Math.sin(d.angle) * (PLAZA_RADIUS - 1))).toBe(0);
  });

  it("eases down past a roof's edge instead of stepping, so the camera never jumps", () => {
    // Walk out from the hall's roof, across its east wall, onto the plaza.
    for (const z of [hall.z0 + 1, 0, hall.z1 - 4]) {
      let prev = Infinity;
      let maxStep = 0;
      for (let x = hall.x1 - 2; x < hall.x1 + 6; x += 0.05) {
        const p = hubToWorld(x, z);
        const h = hubRoofAt(p.x, p.z);
        if (prev !== Infinity) maxStep = Math.max(maxStep, Math.abs(h - prev));
        expect(h).toBeLessThanOrEqual(prev + 1e-9);
        prev = h;
      }
      expect(prev).toBe(0);
      expect(maxStep).toBeLessThan(0.35);
    }
    // And from the upper roof down to the hall's: no step there either.
    let prev = Infinity;
    for (let x = upper.x1 - 2; x < upper.x1 + 6; x += 0.05) {
      const p = hubToWorld(x, (upper.z0 + upper.z1) / 2);
      const h = hubRoofAt(p.x, p.z);
      if (prev !== Infinity) expect(Math.abs(h - prev)).toBeLessThan(0.35);
      prev = h;
    }
    expect(prev).toBeGreaterThanOrEqual(hall.parapet + 0.5);
  });
});

describe("the hub's colliders", () => {
  it("collides the canopy's posts where they are drawn", () => {
    for (const post of HUB.canopy.posts) {
      const at = hubToWorld(post.x, post.z);
      expect(hubColliders().some((c) => Math.hypot(c.x - at.x, c.z - at.z) < 1e-9 && c.r >= HUB.canopy.r)).toBe(true);
    }
  });

  it("keeps the walker out of the building and the planters, with the walls padded", () => {
    const [building, ...planters] = hubBoxes();
    expect(building.hx).toBeCloseTo((HUB.plinth.x1 - HUB.plinth.x0) / 2 + WALL_PAD);
    expect(building.h).toBeGreaterThanOrEqual(HUB.upper.parapet);
    expect(planters).toHaveLength(HUB.planters.length);
    for (const p of HUB.planters) {
      const c = hubToWorld((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2);
      expect(hubClearance(c.x, c.z)).toBe(0);
    }
  });

  /** Gap between two hub boxes (they share the hub's rotation, so compare them in its frame); <= 0 where they touch. */
  const boxGap = (a: HubBox, b: HubBox) => {
    const la = worldToHub(a.x, a.z);
    const lb = worldToHub(b.x, b.z);
    const dx = Math.abs(la.x - lb.x) - (a.hx + b.hx);
    const dz = Math.abs(la.z - lb.z) - (a.hz + b.hz);
    return dx > 0 || dz > 0 ? Math.hypot(Math.max(0, dx), Math.max(0, dz)) : Math.max(dx, dz);
  };
  const circleGap = (b: HubBox, c: HubCircle) => {
    const lb = worldToHub(b.x, b.z);
    const lc = worldToHub(c.x, c.z);
    const dx = Math.abs(lc.x - lb.x) - b.hx;
    const dz = Math.abs(lc.z - lb.z) - b.hz;
    return (dx > 0 || dz > 0 ? Math.hypot(Math.max(0, dx), Math.max(0, dz)) : Math.max(dx, dz)) - c.r;
  };

  it("leave no slot narrower than the walker between any two of them", () => {
    // A slot narrower than the walker's width lets the push-out wedge it in, half inside a wall.
    const tight = 2 * AVATAR_RADIUS + 0.05;
    const boxes = hubBoxes();
    const circles = hubColliders();
    const bad: string[] = [];
    const check = (gap: number, what: string) => {
      if (gap > 1e-6 && gap < tight) bad.push(`${what}: ${gap.toFixed(3)}`);
    };
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) check(boxGap(boxes[i], boxes[j]), `box ${i} / box ${j}`);
      circles.forEach((c, k) => check(circleGap(boxes[i], c), `box ${i} / circle ${k}`));
    }
    for (let i = 0; i < circles.length; i++)
      for (let j = i + 1; j < circles.length; j++) {
        const a = circles[i];
        const b = circles[j];
        check(Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r, `circle ${i} / circle ${j}`);
      }
    expect(bad).toEqual([]);
  });

  it("never leaves a walker pressing along the front, between the building and the planters, inside a wall", () => {
    // Held input, in the engine's largest sub-step (0.35), from every direction around the planters' ends.
    const boxes = hubBoxes();
    const circles = hubColliders();
    const walls = (x: number, z: number) => boxes.some((b) => Math.abs(x - b.x) < b.hx + AVATAR_RADIUS - 1e-3 && Math.abs(z - b.z) < b.hz + AVATAR_RADIUS - 1e-3);
    const starts = HUB.planters.flatMap((p) => [hubToWorld(p.x0 - 1.5, p.z0 - 0.2), hubToWorld(p.x1 + 1.5, p.z0 - 0.2)]);
    for (const start of starts)
      for (let deg = 0; deg < 360; deg += 5) {
        const a = (deg * Math.PI) / 180;
        let p = resolveCollisions(world, start.x, start.z, circles, boxes);
        for (let k = 0; k < 40; k++) {
          p = resolveCollisions(world, p.x + Math.sin(a) * 0.35, p.z + Math.cos(a) * 0.35, circles, boxes);
          expect(walls(p.x, p.z), `from (${start.x.toFixed(1)}, ${start.z.toFixed(1)}) heading ${deg}`).toBe(false);
        }
      }
  });
});
