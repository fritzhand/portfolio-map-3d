/* The island's shape: a perfectly flat walkable core (plaza, roads,
   districts) and, out past the districts toward the shore, gentle
   low-poly hills that roll down to a sandy beach with a ragged,
   deterministic shoreline. In each wedge between the districts the hills
   open onto a level, sandy cove, where the coastal set pieces stand
   (scenery.ts), so a pier starts on the beach and nothing floats. */
import type { WorldLayout } from "../../data/layout";
import { ROAD_WIDTH, VILLAGE, hashString, wedgeAngles } from "../../data/layout";
import { smoothstep, valueNoise2D } from "./util";

export const SEA_LEVEL = -0.35;

/** The coves, one in the middle of each wedge between districts. */
export const COVE = {
  /** How far inside the island's radius the coastal set pieces stand. */
  inset: 12,
  /** Half the cove's width along the coast, level; it eases into the hills over `ease` more. */
  half: 16,
  /** How far the level ground reaches inland of the set pieces. */
  back: 12,
  ease: 10,
} as const;

export interface Terrain {
  /** Ground height at (x, z). Exactly 0 on the plaza, roads and every district. */
  heightAt(x: number, z: number): number;
  /** Shoreline radius at angle a (radians). */
  shoreAt(a: number): number;
  /** 0..1: how "beachy" the ground is at radius r and angle a. */
  sandAt(r: number, a: number): number;
  /** Where the ground meets the sea at angle a (radians): the radius of the waterline. */
  waterlineAt(a: number): number;
}

export function createTerrain(layout: WorldLayout): Terrain {
  const n1 = valueNoise2D(hashString("walk-shore"));
  const n2 = valueNoise2D(hashString("walk-hills"));
  const R = layout.islandRadius;
  const ring = layout.ringRadius;
  const coves = wedgeAngles(layout).map((a) => ({ c: Math.cos(a), s: Math.sin(a) }));
  const coveInner = R - COVE.inset - COVE.back;

  /** 1 inside a cove (level ground), easing to 0 out in the hills. */
  const coveAt = (x: number, z: number) => {
    const inland = smoothstep(coveInner - COVE.ease, coveInner, Math.hypot(x, z));
    if (inland <= 0) return 0;
    let k = 0;
    for (const v of coves) {
      if (x * v.c + z * v.s <= 0) continue;
      k = Math.max(k, 1 - smoothstep(COVE.half, COVE.half + COVE.ease, Math.abs(-x * v.s + z * v.c)));
    }
    return k * inland;
  };

  // The shoreline wobbles between R + 0.5 and R + 7, so clampToIsland
  // (R - 6) always keeps the walker on dry sand.
  const shoreAt = (a: number) => {
    const t = (((a / (Math.PI * 2)) % 1) + 1) % 1;
    const k = 22;
    const x = t * k;
    const raw = n1(x, 3.3) * (1 - t) + n1(x - k, 3.3) * t;
    const fine = n1(x * 3, 9.7) * (1 - t) + n1(x * 3 - k * 3, 9.7) * t;
    return R + 0.5 + raw * 5 + fine * 1.5;
  };

  const heightAt = (x: number, z: number) => {
    const r = Math.hypot(x, z);
    if (r < VILLAGE.outer + 3) return 0;
    const s = shoreAt(Math.atan2(z, x));
    let edge = Infinity;
    for (const d of layout.discs) {
      const e = Math.hypot(x - d.x, z - d.z) - d.r;
      if (e < edge) edge = e;
    }
    // Hills roll between the roads too, past the village; the village, the roads and every
    // district stay flat.
    let roadAway = Infinity;
    for (const d of layout.discs) {
      const ux = Math.cos(d.angle);
      const uz = Math.sin(d.angle);
      if (x * ux + z * uz < 0) continue;
      roadAway = Math.min(roadAway, Math.abs(-x * uz + z * ux));
    }
    const mask =
      smoothstep(5, 15, edge) *
      smoothstep(VILLAGE.outer + 3, VILLAGE.outer + 20, r) *
      smoothstep(ROAD_WIDTH / 2 + 6, ROAD_WIDTH / 2 + 18, roadAway) *
      (1 - smoothstep(s - 21, s - 10, r)) *
      (1 - coveAt(x, z));
    let h = 0;
    if (mask > 0) {
      const amp = 3.6 + 2.2 * smoothstep(ring, ring + 36, r);
      h = (n2(x * 0.045, z * 0.045) * 0.7 + n2(x * 0.13 + 40, z * 0.13 + 40) * 0.3) * amp * mask;
    }
    if (r > s - 9) h -= 0.55 * smoothstep(s - 9, s + 1, r);
    if (r > s + 1) h -= 4 * smoothstep(s + 1, s + 24, r) + 3.5 * smoothstep(s + 24, s + 90, r);
    return h;
  };

  // The beach, and the floor of each cove toward the sea.
  const sandAt = (r: number, a: number) => {
    const beach = smoothstep(-12, -8, r - shoreAt(a));
    if (beach >= 1 || r < coveInner) return beach;
    return Math.max(beach, coveAt(Math.cos(a) * r, Math.sin(a) * r) * smoothstep(coveInner + 2, coveInner + 8, r));
  };

  // The ground falls through sea level once, a few units inside the shoreline: bisect for it.
  const waterlineAt = (a: number) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const shore = shoreAt(a);
    let lo = shore - 14;
    let hi = shore + 6;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (heightAt(c * mid, s * mid) > SEA_LEVEL) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };

  return { heightAt, shoreAt, sandAt, waterlineAt };
}
