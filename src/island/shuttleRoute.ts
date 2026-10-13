/* The shuttle's route round the ring street (pure, tested): the outer lane's radius and a stop just
   past each road's mouth, in the order it reaches them going counterclockwise seen from above. */
import type { MapPlan } from "./mapLayout";

export interface ShuttleRoute {
  /** The lane's radius: the outer half of the ring street. */
  r: number;
  /** Stops, as angles round the ring (radians in [0, 2pi)), increasing. */
  stops: number[];
}

/** How far past a road's mouth (along the lane) the shuttle stops, so it never waits across the road. */
export const STOP_PAST = 5;

export function shuttleRoute(plan: Pick<MapPlan, "street" | "clusters">): ShuttleRoute {
  const r = plan.street.r + plan.street.width / 4;
  const stops = plan.clusters
    .map((c) => (((c.angle + STOP_PAST / r) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2))
    .sort((a, b) => a - b);
  return { r, stops };
}
