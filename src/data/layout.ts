/* Deterministic geometry for the walkable world.

   The world is an island. The publisher's hub sits in a central plaza
   (src/data/hub.ts), with the Nexus portal beside it; each district is a
   round neighborhood on a ring around it, sized by its company count,
   joined to the plaza by a road. Companies stand as pins inside their
   district, laid out on a sunflower spiral so spacing is even and the same
   on every load.

   Districts group companies. They are not addresses, and the world never
   claims to show where a company is located.

   The people roster (when the site has one) gets one more disc, appended
   after the districts on the same ring: the people area. It is not a
   district (not in the taxonomy, no company in it, no industry), only a
   place on the ring with a pin for each person.

   World units are meters-ish: the avatar is ~1.8 tall. */
import type { DistrictSlug, Company } from "./types";

export const PLAZA_RADIUS = 50;
export const WALK_SPEED = 9; // units per second
export const RUN_MULTIPLIER = 1.9;
export const DISTRICT_GAP = 9; // min clearance between neighboring districts
export const CORE_RADIUS = 5.5; // district landmark clearing; no pins inside
export const PIN_MARGIN = 3; // keep pins off the district edge
export const ROAD_WIDTH = 6;

/**
 * The village street: a ring road around the plaza, lined with houses on its outer side. It is
 * scenery you can walk on (no gate, no collider), crossed by every road to a district. The houses
 * stand between VILLAGE.houseInner and VILLAGE.outer, clear of the districts, which begin at
 * PLAZA_RADIUS + 26 at the nearest.
 */
export const VILLAGE = {
  /** Center line of the ring street. */
  streetR: 57.5,
  streetWidth: 6.4,
  /** Where the houses' front yards begin, and the edge of the village (nothing is scattered inside it). */
  houseInner: 64.6,
  outer: 73,
} as const;

/** The people area's slug. Not a district: people belong to no industry. The validator keeps it off the district list. */
export const PEOPLE_AREA = "people";
/** A disc on the ring: an industry district, or the People area. */
export type AreaSlug = DistrictSlug | typeof PEOPLE_AREA;

export interface DistrictDisc {
  slug: AreaSlug;
  x: number;
  z: number;
  r: number;
  /** Angle from the plaza (radians, 0 = +x, counter-clockwise toward -z). */
  angle: number;
  count: number;
}

export interface PinSpot {
  slug: string;
  /** The district a company is in, or PEOPLE_AREA for a person. */
  district: AreaSlug;
  x: number;
  z: number;
}

export interface WorldLayout {
  discs: DistrictDisc[];
  pins: Map<string, PinSpot>;
  ringRadius: number;
  islandRadius: number;
  spawn: { x: number; z: number; facing: number };
}

export function districtRadius(count: number): number {
  return 10 + 3.2 * Math.sqrt(Math.max(1, count));
}

/**
 * Lay districts on a ring, each taking arc length in proportion to its size. With people, the
 * People area is one more disc after the last district, sized by the number of people the
 * same way.
 */
export function layoutWorld(districtOrder: DistrictSlug[], companies: Company[], people: readonly { slug: string }[] = []): WorldLayout {
  const order: AreaSlug[] = people.length ? [...districtOrder, PEOPLE_AREA] : districtOrder;
  const counts = new Map<AreaSlug, number>(order.map((d) => [d, 0]));
  for (const m of companies) counts.set(m.district, (counts.get(m.district) ?? 0) + 1);
  if (people.length) counts.set(PEOPLE_AREA, people.length);
  const radii = order.map((d) => districtRadius(counts.get(d) ?? 0));
  const arcs = radii.map((r) => 2 * r + DISTRICT_GAP);
  const circumference = arcs.reduce((a, b) => a + b, 0);
  const maxR = Math.max(...radii);
  // Chord, not arc, must clear neighbors: pad the ring radius a little.
  const ringRadius = Math.max(circumference / (2 * Math.PI) * 1.04, PLAZA_RADIUS + maxR + 26);

  const discs: DistrictDisc[] = [];
  let cursor = -Math.PI / 2 - (arcs[0] / circumference) * Math.PI; // first district straight "north" (-z)
  order.forEach((slug, i) => {
    const span = (arcs[i] / circumference) * 2 * Math.PI;
    const angle = cursor + span / 2;
    cursor += span;
    discs.push({ slug, r: radii[i], angle, x: Math.cos(angle) * ringRadius, z: Math.sin(angle) * ringRadius, count: counts.get(slug) ?? 0 });
  });

  const pins = new Map<string, PinSpot>();
  for (const disc of discs) {
    const group = companies.filter((m) => m.district === disc.slug).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
    sunflower(group.length, CORE_RADIUS + 1.5, disc.r - PIN_MARGIN, hashString(disc.slug)).forEach((p, i) => {
      pins.set(group[i].slug, { slug: group[i].slug, district: disc.slug, x: disc.x + p.x, z: disc.z + p.z });
    });
  }
  // People, in slug order, spread over the People area the same way.
  const area = discs.find((d) => d.slug === PEOPLE_AREA);
  if (area) {
    const group = people.slice().sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    sunflower(group.length, CORE_RADIUS + 1.5, area.r - PIN_MARGIN, hashString(PEOPLE_AREA)).forEach((p, i) => {
      pins.set(group[i].slug, { slug: group[i].slug, district: PEOPLE_AREA, x: area.x + p.x, z: area.z + p.z });
    });
  }

  const islandRadius = ringRadius + maxR + 30;
  // Spawn on the plaza's south side, facing north: the hub's entrance straight ahead
  // (src/data/hub.ts places the building so), the first district beyond it.
  const spawn = { x: 0, z: PLAZA_RADIUS - 8, facing: Math.PI };
  return { discs, pins, ringRadius, islandRadius, spawn };
}

/** n points evenly spread across an annulus [r0, r1], golden-angle spiral. */
export function sunflower(n: number, r0: number, r1: number, seed = 0): { x: number; z: number }[] {
  if (n <= 0) return [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const rot = ((seed % 360) * Math.PI) / 180;
  const out: { x: number; z: number }[] = [];
  const a0 = r0 * r0;
  const a1 = r1 * r1;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const r = Math.sqrt(a0 + t * (a1 - a0));
    const th = i * golden + rot;
    out.push({ x: Math.cos(th) * r, z: Math.sin(th) * r });
  }
  return out;
}

/** The district disc containing (x, z), if any. */
export function districtAt(layout: WorldLayout, x: number, z: number): DistrictDisc | null {
  for (const d of layout.discs) if ((x - d.x) ** 2 + (z - d.z) ** 2 <= d.r * d.r) return d;
  return null;
}

/** Nearest district disc by edge distance. */
export function nearestDistrict(layout: WorldLayout, x: number, z: number): { disc: DistrictDisc; edge: number } {
  let best = layout.discs[0];
  let bestEdge = Infinity;
  for (const d of layout.discs) {
    const edge = Math.hypot(x - d.x, z - d.z) - d.r;
    if (edge < bestEdge) {
      bestEdge = edge;
      best = d;
    }
  }
  return { disc: best, edge: bestEdge };
}

/** Keep the walker on land: clamp to the island minus a beach margin. */
export function clampToIsland(layout: WorldLayout, x: number, z: number, margin = 6): { x: number; z: number } {
  const max = layout.islandRadius - margin;
  const d = Math.hypot(x, z);
  if (d <= max) return { x, z };
  return { x: (x / d) * max, z: (z / d) * max };
}

/** Is (x, z) on the road from the plaza to any district, or on the village's ring street? */
export function onRoad(layout: WorldLayout, x: number, z: number, pad = 0): boolean {
  const d = Math.hypot(x, z);
  if (Math.abs(d - VILLAGE.streetR) <= VILLAGE.streetWidth / 2 + pad) return true;
  for (const disc of layout.discs) {
    const ux = Math.cos(disc.angle);
    const uz = Math.sin(disc.angle);
    const along = x * ux + z * uz;
    if (along < PLAZA_RADIUS - 2 || along > layout.ringRadius) continue;
    const across = Math.abs(-x * uz + z * ux);
    if (across <= ROAD_WIDTH / 2 + pad && d >= PLAZA_RADIUS - 2) return true;
  }
  return false;
}

/** Deterministic scatter points for trees/rocks: on land, off roads, out of districts and the plaza. */
export function decorPoints(layout: WorldLayout, count: number, seed = 1): { x: number; z: number; s: number; k: number }[] {
  const rand = seededRandom(seed);
  const out: { x: number; z: number; s: number; k: number }[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * (layout.islandRadius - 10);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.hypot(x, z) < VILLAGE.outer) continue;
    if (layout.discs.some((d) => Math.hypot(x - d.x, z - d.z) < d.r + 2.5)) continue;
    if (onRoad(layout, x, z, 2.2)) continue;
    if (out.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 9)) continue;
    out.push({ x, z, s: 0.7 + rand() * 0.8, k: Math.floor(rand() * 4) });
  }
  return out;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, deterministic. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normalize a movement vector so diagonals are not faster. */
export function normalizeMovement(x: number, z: number): { x: number; z: number } {
  const len = Math.hypot(x, z);
  if (len <= 1e-6) return { x: 0, z: 0 };
  const k = len > 1 ? 1 / len : 1;
  return { x: x * k, z: z * k };
}
