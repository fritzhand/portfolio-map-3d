// @ts-nocheck
/* The campus shuttle: a driverless pod looping the ring street in its outer lane, counterclockwise
   seen from above. It eases into a stop beside each road's mouth, waits, and pulls away; it slows and
   holds while the walker stands in its way. Under reduced motion it stays parked at its first stop.
   Its route is pure (shuttleRoute, tested); this file moves the model along it. */
import { Mesh } from 'three';
import { loadModel } from './campus';
import { phongMaterial } from './scene/materials';
import { NEUTRAL_ACCENT } from './palette';
import { clock } from './engine/clock';
import type { MapPlan } from './mapLayout';
import { shuttleRoute, type ShuttleRoute } from './shuttleRoute';

/** Cruising speed (units a second), how long it waits at a stop, and how far ahead it watches for the walker. */
const SPEED = 5;
const DWELL = 4;
const LOOK = 5.5;

export async function addShuttle(scene: any, plan: MapPlan, groundY: (x: number, z: number) => number, still: boolean): Promise<void> {
  const route: ShuttleRoute = shuttleRoute(plan);
  if (!route.stops.length) return;
  const geo = await loadModel('shuttle');
  if ((geo as any)._fallback) return;
  const mesh = new Mesh(geo, phongMaterial({ accentBase: NEUTRAL_ACCENT }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'shuttle';
  scene.add(mesh);
  scene.blockers?.push(mesh);

  // The route as an angle round the ring (radians, increasing counterclockwise seen from above).
  let angle = route.stops[0];
  let speed = 0;
  let waitUntil = still ? Infinity : clock.time + DWELL;
  let next = 1 % route.stops.length;
  const place = () => {
    const x = Math.cos(angle) * route.r;
    const z = Math.sin(angle) * route.r;
    mesh.position.set(x, groundY(x, z), z);
    // Facing along the direction of travel (its front is local +z): the tangent (-sin, cos).
    mesh.rotation.y = Math.atan2(-Math.sin(angle), Math.cos(angle));
  };
  place();
  if (still) return;

  let last = clock.time;
  scene.beforeRenderCbs.push(() => {
    const t = clock.time;
    const dt = Math.min(0.1, Math.max(0, t - last));
    last = t;
    if (t < waitUntil) {
      speed = 0;
      return;
    }
    const target = route.stops[next];
    let ahead = target - angle;
    while (ahead <= 0) ahead += Math.PI * 2;
    const dist = ahead * route.r;
    // Ease in to the stop; hold for the walker in front.
    let want = Math.min(SPEED, Math.max(0.6, dist * 0.6));
    const kid = scene.characters?.mesh?._localObject?.position;
    if (kid) {
      const fx = -Math.sin(angle);
      const fz = Math.cos(angle);
      const dx = kid.x - mesh.position.x;
      const dz = kid.z - mesh.position.z;
      const along = dx * fx + dz * fz;
      const across = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < LOOK && across < 2.2) want = 0;
    }
    speed += (want - speed) * Math.min(1, dt * 2);
    const step = (speed * dt) / route.r;
    if (step >= ahead) {
      angle = target;
      next = (next + 1) % route.stops.length;
      waitUntil = t + DWELL;
      speed = 0;
    } else {
      angle += step;
    }
    place();
  });
}
