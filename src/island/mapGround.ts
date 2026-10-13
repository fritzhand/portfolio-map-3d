/* Pure ground math for the generated island (mapWorld.ts builds the meshes from it). The island's
   shape comes from the plan (mapLayout.ts): flat ground under the town (the plaza, the ring street
   and its stalls), every road and every district; gently rolling grass between them; hills in the
   band behind the districts, open to the east, settling before the beach; the beach sloping gently
   to the waterline, then the seabed. islandHeight() is the ground truth every placement reads.
   No three.js, no DOM: unit-testable in node (mapWorld.test.ts). */
import { COVE_BACK, COVE_FLAT, COVE_REACH, ROAD_W, pieceDistance, townRadius, type MapPlan } from "./mapLayout";

/** What the ground needs from the plan (set pieces optional: without them, no coves and no pads for them). */
export type IslandShape = Pick<MapPlan, "plaza" | "street" | "island" | "clusters" | "spokes"> &
  Partial<Pick<MapPlan, "pieces">> & {
    /** Level pads for the vignettes between the districts (mapVignettes.ts): a middle, a radius and a level. */
    vignettes?: ReadonlyArray<{ x: number; z: number; r: number; level: number }>;
  };

/** The island's painted colors, shared by the ground texture (mapWorld.ts) and the minimap (mapMinimap.ts). */
export const GROUND_COLORS = {
  /** The sea shader's own color. */
  sea: "#5a7aa2",
  seabed: "#86bcc8",
  sand: "#ece5d2",
  wetSand: "#dcd2b8",
  grass: "#8cc46e",
  grassLight: "#9bd07c",
  grassDark: "#7fb862",
  hill: "#6aa556",
  road: "#d2d7db",
  roadLine: "#ffffff",
  paving: "#e3e6e3",
  pavingJoint: "#cdd2cf",
  kerb: "#f4f6f5",
  plaza: "#e7e9e6",
  plazaLine: "#cfd4d1",
  stone: "#b9bdbf",
} as const;

/** How far the hills take to rise from the town's or a district's flat ground. */
export const HILL_RAMP = 22;
/**
 * The steepest bank the ground keeps round a set piece's level pad, as rise per unit: well under the
 * engine's floor limit (a normal over 0.8 up, 0.75 per unit), so the kid walks up from a cove's floor
 * onto a pad cut into the hill above it.
 */
export const PAD_BANK = 0.5;
/** How far out from a pad's edge its bank takes to steepen to PAD_BANK, so the edge is rounded, not creased. */
const PAD_ROUND = 2;

/** How far the ground may stand above or below a pad's level, `e` out from the pad's edge. */
function padBank(e: number): number {
  if (e <= 0) return 0;
  return PAD_BANK * (e < PAD_ROUND ? (e * e) / (2 * PAD_ROUND) : e - PAD_ROUND / 2);
}

/** The paved height of every pad (plaza, roads, districts). */
export const PAD_Y = 0.4;
/** The sea's surface at rest (the town's sea plane; its swell lifts and drops it about 0.4). */
export const SEA_Y = -0.815;

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Deterministic 2D value noise in [-1, 1]. */
export function noise2(x: number, z: number): number {
  const hash = (ix: number, iz: number) => {
    let h = (ix * 374761393 + iz * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);
  return (a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz) * 2 - 1;
}

/** Distance from (x, z) to the nearest road's center line. */
export function distToSpokes(shape: Pick<MapPlan, "spokes">, x: number, z: number): number {
  let best = Infinity;
  for (const s of shape.spokes) {
    const dx = s.bx - s.ax;
    const dz = s.bz - s.az;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2));
    best = Math.min(best, Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t)));
  }
  return best;
}

export { townRadius };

/** How much (x, z) is paved or leveled: 1 in the town, on a road or in a district, easing to 0 a few units out. */
export function padWeight(shape: IslandShape, x: number, z: number): number {
  const town = townRadius(shape);
  let flat = 1 - smoothstep(town, town + 8, Math.hypot(x, z));
  flat = Math.max(flat, 1 - smoothstep(ROAD_W / 2 + 1.5, ROAD_W / 2 + 5, distToSpokes(shape, x, z)));
  for (const c of shape.clusters) {
    flat = Math.max(flat, 1 - smoothstep(0, 8, Math.hypot(x - c.cx, z - c.cz) - (c.r + 4)));
  }
  return flat;
}

/** The coves behind the coastal set pieces: how far inland of a piece its cove reaches, how far either side at least, its floor's height, and how sandy it is toward the beach. */
export const COVE = { back: COVE_BACK, half: 16, level: 0.35 } as const;

/**
 * 1 on a cove's level floor behind a coastal set piece, easing to 0 out in the hills: a rounded bay
 * (half an ellipse inland of the piece, as wide as the piece needs) where the hills open onto level
 * ground that runs down to the beach, so a coastal piece stands at the foot of no slope.
 */
export function coveAt(shape: IslandShape, x: number, z: number): number {
  if (!shape.pieces) return 0;
  let k = 0;
  for (const p of shape.pieces) {
    if (!p.coast) continue;
    const c = Math.cos(p.wedge);
    const s = Math.sin(p.wedge);
    const dx = x - p.x;
    const dz = z - p.z;
    // Toward the sea of the piece it is beach anyway; inland, the bay's rounded edge.
    const along = Math.min(0, dx * c + dz * s) / COVE.back;
    const across = (-dx * s + dz * c) / Math.max(COVE.half, p.footprint + 6);
    // Level part of the way out, then a long bank up into the hills that the kid can walk up.
    k = Math.max(k, 1 - smoothstep(COVE_FLAT, COVE_REACH, Math.hypot(along, across)));
  }
  return k;
}

/** How much the hills rise at a bearing: everywhere but the east, which stays open to the sea and its beach. */
export function hillSide(x: number, z: number): number {
  return 1 - smoothstep(0.35, 0.85, Math.cos(Math.atan2(z, x)));
}

/**
 * Terrain height: flat pads blended into gently rolling grass, and hills in the band behind the
 * districts (all round but the east), which settle onto a gentle beach and the seabed.
 */
export function islandHeight(shape: IslandShape, x: number, z: number): number {
  let h = groundHeight(shape, x, z);
  // A vignette stands on a level pad; round it the ground keeps within an easy bank of that level.
  for (const v of shape.vignettes ?? []) {
    const b = padBank(Math.hypot(x - v.x, z - v.z) - v.r);
    h = Math.min(v.level + b, Math.max(v.level - b, h));
  }
  const pieces = shape.pieces;
  if (!pieces?.length) return h;
  // Each set piece that needs it stands on a level pad (padLevels), and round the pad the ground keeps
  // within an easy bank of that level: a pad cut into a hillside or standing over a cove leaves slopes
  // the kid walks up. Toward the sea a coastal pad gives way to the beach before the walk's edge, so
  // the sand still runs down into the water.
  const levels = padLevels(shape);
  const r = Math.hypot(x, z);
  const walk = shape.island.walk;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (!p.pad) continue;
    const b = padBank(Math.hypot(x - p.x, z - p.z) - p.pad);
    const kept = Math.min(levels[i] + b, Math.max(levels[i] - b, h));
    if (kept === h) continue;
    const seaward = p.coast ? 1 - smoothstep(walk - 4, walk - 1, r) : 1;
    h += (kept - h) * seaward;
  }
  return h;
}

/** How far round a piece its level ground reaches: its pad, and behind a coastal piece its cove's level floor. */
const levelReach = (p: NonNullable<IslandShape["pieces"]>[number]) => (p.coast ? Math.max(p.pad, COVE.back * COVE_FLAT) : p.pad);

const padCache = new WeakMap<object, number[]>();
/**
 * Each pad's level: the height of the ground where its piece stands, unless the level ground of a
 * piece before it (a coastal piece's cove floor first) is too near for an easy bank between the two.
 * Then the pad is cut into the hill, or raised over the dip, just as far as that bank needs.
 */
function padLevels(shape: IslandShape): number[] {
  const pieces = shape.pieces!;
  let levels = padCache.get(pieces);
  if (!levels) {
    levels = pieces.map((p) => groundHeight(shape, p.x, p.z));
    const order = pieces.map((_, i) => i).filter((i) => pieces[i].pad).sort((i, j) => Number(pieces[j].coast) - Number(pieces[i].coast));
    for (let k = 0; k < order.length; k++) {
      const p = pieces[order[k]];
      for (let m = 0; m < k; m++) {
        const q = pieces[order[m]];
        // The two banks meet halfway across the gap between the level grounds.
        const room = 2 * padBank((Math.hypot(p.x - q.x, p.z - q.z) - levelReach(p) - levelReach(q)) / 2);
        const at = levels[order[m]];
        levels[order[k]] = Math.min(at + room, Math.max(at - room, levels[order[k]]));
      }
    }
    padCache.set(pieces, levels);
  }
  return levels;
}

/** The ground before the set pieces' pads: pads, rolling grass, hills, coves, the beach and the seabed. */
function groundHeight(shape: IslandShape, x: number, z: number): number {
  const r = Math.hypot(x, z);
  const { land, water, walk } = shape.island;
  const town = townRadius(shape);
  const flat = padWeight(shape, x, z);
  const cove = coveAt(shape, x, z);
  // Rolling grass that never dips below -0.05, above even the sea's highest swell (SEA_Y + 0.4).
  const rolling = 1.2 + 1.0 * noise2(x * 0.03, z * 0.03) + 0.25 * noise2(x * 0.11 + 7, z * 0.11);
  // The hills rise past the town and away from each district, and settle before the beach, all
  // gradually enough for the kid to walk up (see the slope tests).
  let away = 1;
  for (const c of shape.clusters) away = Math.min(away, smoothstep(c.r + 4, c.r + 4 + HILL_RAMP, Math.hypot(x - c.cx, z - c.cz)));
  const band = smoothstep(town + 4, town + 4 + HILL_RAMP, r) * (1 - smoothstep(land - 26, land - 6, r)) * away;
  const hills = band * hillSide(x, z) * (3.8 + 2.6 * noise2(x * 0.02 + 3, z * 0.02)) * (1 - cove);
  const natural = rolling + Math.max(0, hills);
  const opened = natural + (COVE.level - natural) * cove;
  const inland = opened + (PAD_Y - opened) * flat;
  // The beach: just above the sea where the kid may walk, under it past the waterline, then the seabed.
  const beach = 0.35 - 0.6 * smoothstep(land, walk, r) - 0.75 * smoothstep(walk, water, r) - 2.6 * smoothstep(water, water + 18, r);
  return inland + (beach - inland) * smoothstep(land - 12, land, r);
}

/** Room for a scattered tree, bush, rock or tuft: on land, out of the town, off every road, district and set piece, clear of the masts and out of the coves' sand. */
export function plantable(shape: IslandShape, x: number, z: number, margin: number): boolean {
  const r = Math.hypot(x, z);
  if (r > shape.island.land + 6 || islandHeight(shape, x, z) < PAD_Y - 0.05) return false;
  if (r < townRadius(shape) + margin) return false;
  if (distToSpokes(shape, x, z) < ROAD_W / 2 + 1.5 + margin) return false;
  for (const c of shape.clusters) {
    if (Math.hypot(x - c.cx, z - c.cz) < c.r + 2 + margin) return false;
    if ("mast" in c && c.mast && Math.hypot(x - c.mast.x, z - c.mast.z) < 5 + margin) return false;
  }
  for (const p of shape.pieces ?? []) {
    if (pieceDistance(p, x, z) < p.footprint + 2 + margin) return false;
    // Trees, bushes and rocks keep a lawn round each piece, and the way to it from the plaza open.
    if (margin >= 1 && (pieceDistance(p, x, z) < p.footprint + LAWN.round + margin || (!p.coast && ahead(p, x, z, LAWN.ahead, p.footprint + LAWN.side)))) return false;
  }
  if (coveSand(shape, x, z) > 0.3) return false;
  return true;
}

/** The lawn round a set piece that trees, bushes and rocks keep off: all round, and in front of an inland piece toward the plaza. */
export const LAWN = { round: 5, ahead: 28, side: 4 } as const;

/** Whether (x, z) lies in front of a piece (the way it faces), within `len` of it and `half` either side. */
export function ahead(p: { x: number; z: number; facing: number }, x: number, z: number, len: number, half: number): boolean {
  const fx = Math.sin(p.facing);
  const fz = Math.cos(p.facing);
  const along = (x - p.x) * fx + (z - p.z) * fz;
  const across = Math.abs((x - p.x) * fz - (z - p.z) * fx);
  return along >= 0 && along <= len && across <= half;
}

/** How sandy a cove's floor is at (x, z): the part of the cove toward the beach (inland of that it is level grass). */
export function coveSand(shape: IslandShape, x: number, z: number): number {
  const cove = coveAt(shape, x, z);
  if (!cove) return 0;
  const land = shape.island.land;
  return cove * smoothstep(land - COVE.back + 2, land - COVE.back / 2, Math.hypot(x, z));
}

/** `n` deterministic spots that pass plantable() and `pick`, at least 6 apart, between the town and the beach. */
export function scatter(rand: () => number, shape: IslandShape, n: number, margin: number, pick: (x: number, z: number) => boolean): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const r0 = townRadius(shape);
  const r1 = shape.island.land + 6;
  let guard = 0;
  while (out.length < n && guard++ < n * 60) {
    const a = rand() * Math.PI * 2;
    const r = r0 + Math.sqrt(rand()) * (r1 - r0);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (!plantable(shape, x, z, margin) || !pick(x, z)) continue;
    if (out.some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < 36)) continue;
    out.push([x, z]);
  }
  return out;
}

/** How much of the sea the kid hears at (x, z): none in the town, rising toward every shore, loudest on the open east beach. */
export function seaSound(shape: IslandShape, x: number, z: number): number {
  const near = smoothstep(shape.island.land - 36, shape.island.land - 2, Math.hypot(x, z));
  return near * (0.35 + 0.65 * (1 - hillSide(x, z)));
}

/** `n` deterministic spots on the east beach's dry sand for palms, at least 6 apart and `room` clear of `taken`. */
export function beachSpots(rand: () => number, shape: IslandShape, n: number, taken: ReadonlyArray<{ x: number; z: number }>, room: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const { land, walk } = shape.island;
  let guard = 0;
  while (out.length < n && guard++ < n * 80) {
    const a = (rand() * 2 - 1) * 0.7;
    const r = land - 8 + rand() * (walk - 3 - (land - 8));
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (hillSide(x, z) > 0.2 || islandHeight(shape, x, z) < SEA_Y + 0.7) continue;
    if (distToSpokes(shape, x, z) < ROAD_W / 2 + 2) continue;
    if (shape.clusters.some((c) => Math.hypot(x - c.cx, z - c.cz) < c.r + 4)) continue;
    if ((shape.pieces ?? []).some((p) => pieceDistance(p, x, z) < p.footprint + 3)) continue;
    if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < room)) continue;
    if (out.some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < 36)) continue;
    out.push([x, z]);
  }
  return out;
}

/** How far the sea's swell lifts its surface at `time` (seconds): the sea shader's own (scene/sea.ts), so a boat rides the water it floats on. */
export function swellLift(time: number): number {
  return (Math.sin(time * 0.5 + 23.124) + Math.sin(time * 0.15 + 3213.32)) * 0.2;
}
