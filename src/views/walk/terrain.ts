/* The island's shape: a perfectly flat walkable core (plaza, roads,
   districts) and, out past the districts toward the shore, gentle
   low-poly hills that roll down to a sandy beach with a ragged,
   deterministic shoreline. */
import type { WorldLayout } from "../../data/layout";
import { ROAD_WIDTH, VILLAGE, hashString } from "../../data/layout";
import { smoothstep, valueNoise2D } from "./util";

export const SEA_LEVEL = -0.35;

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
      (1 - smoothstep(s - 21, s - 10, r));
    let h = 0;
    if (mask > 0) {
      const amp = 3.6 + 2.2 * smoothstep(ring, ring + 36, r);
      h = (n2(x * 0.045, z * 0.045) * 0.7 + n2(x * 0.13 + 40, z * 0.13 + 40) * 0.3) * amp * mask;
    }
    if (r > s - 9) h -= 0.55 * smoothstep(s - 9, s + 1, r);
    if (r > s + 1) h -= 4 * smoothstep(s + 1, s + 24, r) + 3.5 * smoothstep(s + 24, s + 90, r);
    return h;
  };

  const sandAt = (r: number, a: number) => smoothstep(-12, -8, r - shoreAt(a));

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
