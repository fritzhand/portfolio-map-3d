/* Pure navigation helpers for the walk world: collision push-out, the
   follow camera's pitch curve, camera-relative movement, and where to stand
   when flying to a company, a person or a district. No three.js, no DOM — tested in
   nav.test.ts. */
import { clampToIsland, normalizeMovement, type DistrictDisc, type WorldLayout } from "../../data/layout";
import type { FlyRequest } from "../../state/store";

export interface Circle {
  x: number;
  z: number;
  r: number;
  /** Obstacle height (used by clearPitch). */
  h?: number;
}

export interface Box {
  x: number;
  z: number;
  hx: number;
  hz: number;
  /** Rotation about y (three.js rotation.y convention); 0 or absent for an axis-aligned box. */
  rot?: number;
}

/** A world point in a box's own frame (the inverse of three.js rotateY: wx = lx c + lz s, wz = -lx s + lz c). */
export function toBoxFrame(b: Box, x: number, z: number): { lx: number; lz: number; c: number; s: number } {
  const r = b.rot ?? 0;
  const c = r ? Math.cos(r) : 1;
  const s = r ? Math.sin(r) : 0;
  const dx = x - b.x;
  const dz = z - b.z;
  return { lx: dx * c - dz * s, lz: dx * s + dz * c, c, s };
}

export const AVATAR_RADIUS = 0.38;
export const ZOOM_MIN = 6;
export const ZOOM_MAX = 70;
export const ZOOM_DEFAULT = 12;

/** Camera pitch (radians above the horizon) for a follow distance: low and close, high and far. */
export function pitchFor(distance: number): number {
  return 0.22 + Math.pow(zoomT(distance), 1.3) * 0.8;
}

/** 0 at the closest zoom, 1 at the farthest. */
export function zoomT(distance: number): number {
  return Math.min(1, Math.max(0, (distance - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)));
}

/** How far above the avatar the camera aims: up the road when close (so the horizon shows), straight down at it when far. */
export function lookLift(distance: number): number {
  return 2.2 * (1 - zoomT(distance));
}

/** Push a point out of circles and boxes, then keep it on the island. */
export function resolveCollisions(
  layout: WorldLayout,
  x: number,
  z: number,
  circles: readonly Circle[],
  boxes: readonly Box[],
  radius = AVATAR_RADIUS,
): { x: number; z: number } {
  for (let pass = 0; pass < 2; pass++) {
    for (const c of circles) {
      const dx = x - c.x;
      const dz = z - c.z;
      const min = c.r + radius;
      if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      if (d < 1e-5) {
        x = c.x + min;
        continue;
      }
      x = c.x + (dx / d) * min;
      z = c.z + (dz / d) * min;
    }
    for (const b of boxes) {
      const hx = b.hx + radius;
      const hz = b.hz + radius;
      // Resolve in the box's own frame, so a rotated building pushes out square to its walls.
      const r = b.rot ?? 0;
      const c = r ? Math.cos(r) : 1;
      const s = r ? Math.sin(r) : 0;
      const lx = (x - b.x) * c - (z - b.z) * s;
      const lz = (x - b.x) * s + (z - b.z) * c;
      if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) continue;
      // Leave along the shallowest side.
      let nx = lx;
      let nz = lz;
      if (hx - Math.abs(lx) < hz - Math.abs(lz)) nx = Math.sign(lx || 1) * hx;
      else nz = Math.sign(lz || 1) * hz;
      x = b.x + nx * c + nz * s;
      z = b.z - nx * s + nz * c;
    }
  }
  return clampToIsland(layout, x, z);
}

/**
 * Camera-relative movement. `forward`/`right` are input axes in [-1, 1]
 * (forward = away from the camera); `cameraYaw` is the camera's orbit angle,
 * with the camera at target + (sin yaw, cos yaw) * distance.
 */
export function cameraRelative(forward: number, right: number, cameraYaw: number): { x: number; z: number } {
  const n = normalizeMovement(right, forward);
  const fx = -Math.sin(cameraYaw);
  const fz = -Math.cos(cameraYaw);
  // right = forward × up = (-fz, fx)
  return { x: fx * n.z + -fz * n.x, z: fz * n.z + fx * n.x };
}

/** Heading (rotation.y) that faces from (x0, z0) toward (x1, z1). Heading 0 faces +z. */
export function headingTo(x0: number, z0: number, x1: number, z1: number): number {
  return Math.atan2(x1 - x0, z1 - z0);
}

/**
 * Where to stand to meet a company: ~4 units from its pin, facing it, clear
 * of every other pin and prop. Of the free spots around the pin it picks the
 * one where the follow camera (behind the walker, `cameraDistance` back) has
 * the clearest view — not looking through a tree crown, the hub or a
 * landmark — preferring, on a tie, the side away from the district center.
 * `yawOffset` swings the camera off the walker's back (so the pin isn't
 * hidden behind them); the view check uses the same offset.
 */
export function standNear(
  layout: WorldLayout,
  pin: { x: number; z: number },
  disc: DistrictDisc | null,
  circles: readonly Circle[],
  boxes: readonly Box[],
  opts: { distance?: number; blockers?: readonly Circle[]; cameraDistance?: number; yawOffset?: number; tilt?: number } = {},
): { x: number; z: number; heading: number } {
  const distance = opts.distance ?? 4;
  const yawOffset = opts.yawOffset ?? 0;
  const camDist = opts.cameraDistance ?? ZOOM_DEFAULT;
  const blockers = opts.blockers ?? [];
  const cx = disc ? disc.x : 0;
  const cz = disc ? disc.z : 0;
  const base = Math.atan2(pin.z - cz, pin.x - cx);
  const clear = (x: number, z: number) =>
    circles.every((c) => (x - c.x) ** 2 + (z - c.z) ** 2 >= (c.r + AVATAR_RADIUS + 0.05) ** 2) &&
    boxes.every((b) => {
      const { lx, lz } = toBoxFrame(b, x, z);
      return Math.abs(lx) >= b.hx + AVATAR_RADIUS || Math.abs(lz) >= b.hz + AVATAR_RADIUS;
    });
  const pitch = pitchFor(camDist) + (opts.tilt ?? 0);
  let best: { x: number; z: number; heading: number } | null = null;
  let bestScore = Infinity;
  const steps = 16;
  for (let k = 0; k < steps; k++) {
    // 0, +1, -1, +2, -2, ... steps away from the outward direction.
    const o = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * ((Math.PI * 2) / steps);
    const a = base + o;
    const x = pin.x + Math.cos(a) * distance;
    const z = pin.z + Math.sin(a) * distance;
    if (!clear(x, z)) continue;
    const heading = headingTo(x, z, pin.x, pin.z);
    const yaw = heading + Math.PI + yawOffset;
    const lift = clearPitch(x, 1.2, z, yaw, pitch, camDist, blockers) - pitch;
    const score = lift + nearClutter(x, z, yaw, Math.cos(pitch) * camDist, blockers) + Math.abs(o) * 0.03;
    if (score < bestScore - 1e-6) {
      bestScore = score;
      best = { x, z, heading };
    }
  }
  if (best) return best;
  const p = resolveCollisions(layout, pin.x + Math.cos(base) * distance, pin.z + Math.sin(base) * distance, circles, boxes);
  return { ...p, heading: headingTo(p.x, p.z, pin.x, pin.z) };
}

/**
 * How much tall stuff crowds the near half of the view from a camera at orbit
 * angle `yaw`, `reach` back from (x, z): a tree crown beside the lens fills
 * the frame even when it hides nothing. 0 when the foreground is open.
 */
export function nearClutter(x: number, z: number, yaw: number, reach: number, blockers: readonly Circle[]): number {
  const dx = Math.sin(yaw);
  const dz = Math.cos(yaw);
  let clutter = 0;
  for (const b of blockers) {
    const ox = b.x - x;
    const oz = b.z - z;
    // Distance back from the walker toward the camera, and to the side of that line.
    const along = ox * dx + oz * dz;
    if (along < reach * 0.3 || along > reach + b.r) continue;
    if (Math.abs(ox * dz - oz * dx) > b.r + 3.5) continue;
    clutter += 0.06 + 0.14 * (along / reach);
  }
  return clutter;
}

/**
 * Where the walker goes when the walk view opens. The open company or person (the store never holds
 * both) wins over an older district, Overview or other fly still in the store. One opened without
 * a fly (a list card, say) still takes the walker there, reusing the stale nonce so that old
 * request is not replayed later.
 */
export function arrivalFly(selected: string | null, pending: FlyRequest | null, person: string | null = null): FlyRequest | null {
  const kind = selected ? "company" : person ? "person" : null;
  const slug = selected ?? person;
  if (!kind || !slug) return pending;
  if (pending?.kind === kind && pending.slug === slug) return pending;
  return { kind, slug, nonce: pending ? pending.nonce : -1 };
}

/** A district's road entrance, just inside its edge, facing its center. */
export function districtEntrance(disc: DistrictDisc, inset = 3): { x: number; z: number; heading: number } {
  const ux = Math.cos(disc.angle);
  const uz = Math.sin(disc.angle);
  const along = Math.hypot(disc.x, disc.z) - disc.r + inset;
  const x = ux * along;
  const z = uz * along;
  return { x, z, heading: headingTo(x, z, disc.x, disc.z) };
}

/**
 * The lowest camera pitch whose line of sight, from the look target at
 * (tx, ty, tz) back toward a camera at orbit angle `yaw` and `distance`,
 * passes over every tall obstacle in between. Returns at least `pitch`.
 */
export function clearPitch(tx: number, ty: number, tz: number, yaw: number, pitch: number, distance: number, obstacles: readonly Circle[], max = 1.25): number {
  const dx = Math.sin(yaw);
  const dz = Math.cos(yaw);
  const reach = Math.cos(pitch) * distance;
  let need = pitch;
  for (const o of obstacles) {
    if (o.h === undefined || o.h < ty) continue;
    const ox = o.x - tx;
    const oz = o.z - tz;
    const along = ox * dx + oz * dz;
    if (along < 0.2 || along - o.r > reach) continue;
    if (Math.abs(ox * dz - oz * dx) > o.r + 0.4) continue;
    const p = Math.atan2(o.h + 0.6 - ty, Math.max(0.8, along - o.r));
    if (p > need) need = p;
  }
  return Math.min(max, need);
}
