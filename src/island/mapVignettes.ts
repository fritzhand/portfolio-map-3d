/* The land between the districts: one small vignette in each gap between two neighboring districts,
   taking turns round the island: a few homes, a park with a pond, a place to play. Airy: one per gap,
   open lawn all round it. Each stands on the gentlest open spot near its gap's middle line, off every
   road, district and set piece, and the ground levels a pad for it (mapGround.islandHeight reads
   plan.vignettes), so nothing in it sits on a slope. Pure (mapGround's math only); mapVignettes.test.ts
   checks every rule. */
import { islandHeight, plantable, type IslandShape } from "./mapGround";
import { faceToward, townRadius, type Facing, type MapPlan } from "./mapLayout";

export type VignetteKind = "homes" | "park" | "play";
const KINDS: VignetteKind[] = ["homes", "park", "play"];
/** The ground each kind takes (a radius) and the most its ground may rise or fall across it. */
export const VIGNETTE_R: Record<VignetteKind, number> = { homes: 11, park: 8.5, play: 10.5 };
/** The most the natural ground may rise or fall across a vignette before its pad levels it. */
const STEEP = 4;

export interface VignettePiece extends Facing {
  /** The asset (art/assets/neighborhood.py). */
  model: string;
}

export interface Vignette extends Facing {
  kind: VignetteKind;
  r: number;
  /** The height of its level pad. */
  level: number;
  pieces: VignettePiece[];
}

const round = (v: number) => Math.round(v * 100) / 100;

/** Where a kind's pieces stand, in its own frame (its front, +z, toward the plaza). */
function layout(kind: VignetteKind): Array<{ model: string; x: number; z: number; turn: number }> {
  if (kind === "homes") {
    return [
      { model: "house_a", x: -6.6, z: -1.2, turn: 0.3 },
      { model: "house_b", x: 1.6, z: -3.4, turn: 0 },
      { model: "house_c", x: 7.4, z: 2.4, turn: -0.5 },
      { model: "tree_round", x: -2.6, z: 5.2, turn: 0 },
    ];
  }
  if (kind === "park") {
    return [
      { model: "pond", x: 0, z: -0.5, turn: 0 },
      { model: "picnic_set", x: 5.4, z: 3.6, turn: 0.4 },
      { model: "bench", x: -3.2, z: 4.0, turn: 0 },
      { model: "tree_round", x: -5.8, z: -3.6, turn: 0 },
      { model: "tree_cone", x: 5.6, z: -3.8, turn: 0 },
    ];
  }
  return [
    { model: "sports_court", x: 0, z: -3.6, turn: 0 },
    { model: "playground", x: 4.2, z: 5.6, turn: 0 },
    { model: "bench", x: -4.6, z: 4.4, turn: 0.3 },
  ];
}

/** The gaps between neighboring districts, as bearings from the monument (radians), going round. */
export function gapBearings(plan: Pick<MapPlan, "clusters">): number[] {
  const a = plan.clusters.map((c) => c.angle).sort((p, q) => p - q);
  if (a.length < 2) return a.length ? [a[0] + Math.PI] : [];
  return a.map((v, i) => (v + (i + 1 < a.length ? a[i + 1] : a[0] + Math.PI * 2)) / 2);
}

/** How much the ground rises and falls across a disc (sampled). */
function relief(shape: IslandShape, x: number, z: number, r: number): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < 13; k++) {
    const a = (k / 12) * Math.PI * 2;
    const rr = k === 12 ? 0 : r;
    const h = islandHeight(shape, x + Math.cos(a) * rr, z + Math.sin(a) * rr);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  return hi - lo;
}

/** One vignette per gap (the kinds take turns), where open ground allows. */
export function vignettesFor(plan: MapPlan): Vignette[] {
  const shape = { ...plan, vignettes: undefined } as IslandShape;
  const out: Vignette[] = [];
  const r0 = townRadius(plan) + 2;
  const r1 = plan.island.land - 18;
  gapBearings(plan).forEach((g, i) => {
    const kind = KINDS[i % KINDS.length];
    const R = VIGNETTE_R[kind];
    let best: { x: number; z: number; score: number } | null = null;
    for (let r = r0 + R; r <= r1 - R; r += 2) {
      for (const da of [0, -0.06, 0.06, -0.12, 0.12, -0.2, 0.2, -0.28, 0.28]) {
        const a = g + da;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        // Open all round: the middle, and a ring of points at its edge.
        let open = plantable(shape, x, z, 1);
        for (let k = 0; open && k < 12; k++) {
          const b = (k / 12) * Math.PI * 2;
          open = plantable(shape, x + Math.cos(b) * R * 0.85, z + Math.sin(b) * R * 0.85, 0);
        }
        if (!open || out.some((v) => Math.hypot(v.x - x, v.z - z) < v.r + R + 6)) continue;
        const rel = relief(shape, x, z, R);
        if (rel > STEEP) continue;
        // Nearer the middle line and nearer the plaza is better.
        const score = rel * 4 + Math.abs(da) * 20 + (r - r0) * 0.05;
        if (!best || score < best.score) best = { x, z, score };
      }
    }
    if (!best) return;
    const facing = faceToward(best.x, best.z, 0, 0);
    const c = Math.cos(facing);
    const s = Math.sin(facing);
    const pieces = layout(kind).map((p) => {
      const x = best!.x + p.x * c + p.z * s;
      const z = best!.z - p.x * s + p.z * c;
      return { model: p.model, x: round(x), z: round(z), facing: round(facing + p.turn) };
    });
    out.push({ kind, x: round(best.x), z: round(best.z), facing: round(facing), r: R, level: round(islandHeight(shape, best.x, best.z)), pieces });
  });
  return out;
}

/** Whether (x, z) is inside a vignette (trees, shrubs and stones keep off). */
export function inVignette(vignettes: readonly Vignette[], x: number, z: number, margin = 0): boolean {
  return vignettes.some((v) => Math.hypot(v.x - x, v.z - z) < v.r + margin);
}
