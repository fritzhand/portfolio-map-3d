/* Street furniture and set-dressing parts, in the same painted low-poly style as the houses: lamp
   posts with a curved arm and a hooded lamp, a bus shelter, a picnic table under a parasol, a
   mailbox, a fire hydrant, a trash can, a picket fence, a signpost, a haystack, wire strung between
   posts. Each is a list of faceted parts (kit.ts) in its own frame (y up, standing on y = 0).
   Parts that repeat a lot (lamp posts) come as two lists, the iron and the glass, so the village
   can instance them; the rest are merged where they stand. */
import * as THREE from "three";
import { ball, bar, blend, box, cyl, pyramid, tone, type Part } from "./kit";
import type { ScenePalette } from "./palette";
import { paint } from "./util";

/** The lamp post's wire attachment, in its own frame: where the post's crossbar carries two wires. */
export const LAMP_WIRE_Y = 6.15;
export const LAMP_WIRE_SPREAD = 0.42;
export const LAMP_HEIGHT = 6.6;

/**
 * A street lamp: a slim iron post with a base and a crossbar for the wires, and a curved arm
 * reaching toward +x with a hooded lamp (a second one toward -x when `double`). Returned as the
 * iron and the glass, so the glass can take its own material.
 */
export function lampPost(p: ScenePalette, double = false): { iron: Part[]; glass: Part[] } {
  const iron = blend(p.navy, p.ink, 0.55);
  const parts: Part[] = [
    box(0.5, 0.32, 0.5, 0, 0, 0, tone(iron, 1.15)),
    cyl(0.075, 0.12, 6.3, 6, 0, 0.3, 0, iron),
    cyl(0.14, 0.1, 0.22, 6, 0, 1.0, 0, tone(iron, 1.2)),
    // The crossbar carrying the wires, with its insulators.
    box(0.08, 0.08, LAMP_WIRE_SPREAD * 2 + 0.3, 0, LAMP_WIRE_Y - 0.5, 0, iron),
    cyl(0.05, 0.05, 0.3, 4, 0, LAMP_WIRE_Y - 0.45, LAMP_WIRE_SPREAD, tone(p.concrete, 0.9)),
    cyl(0.05, 0.05, 0.3, 4, 0, LAMP_WIRE_Y - 0.45, -LAMP_WIRE_SPREAD, tone(p.concrete, 0.9)),
  ];
  const glass: Part[] = [];
  const arms = double ? [1, -1] : [1];
  for (const side of arms) {
    // A quarter-curve from the post's top outward and slightly up, as short bars.
    let prev = new THREE.Vector3(0, 6.2, 0);
    for (let i = 1; i <= 6; i++) {
      const t = i / 6;
      const next = new THREE.Vector3(side * 1.7 * Math.sin((t * Math.PI) / 2), 6.2 + 0.55 * (1 - Math.cos((t * Math.PI) / 2)) + 0.3 * t, 0);
      parts.push(bar(prev, next, 0.1 - t * 0.03, iron));
      prev = next;
    }
    // The hood and its warm bulb.
    parts.push(cyl(0.12, 0.5, 0.26, 8, side * 1.75, prev.y - 0.04, 0, iron));
    glass.push(paint(new THREE.SphereGeometry(0.22, 8, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(side * 1.75, prev.y - 0.02, 0), p.lampGlass));
  }
  return { iron: parts, glass };
}

/** A catenary-ish wire from a to b: short straight bars sagging by `sag` in the middle. */
export function wire(a: THREE.Vector3, b: THREE.Vector3, sag: number, color: THREE.Color, thick = 0.045): Part[] {
  const out: Part[] = [];
  const n = Math.max(3, Math.min(10, Math.ceil(a.distanceTo(b) / 2.2)));
  let prev = a.clone();
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const next = a.clone().lerp(b, t);
    next.y -= sag * 4 * t * (1 - t);
    out.push(bar(prev, next, thick, color));
    prev = next;
  }
  return out;
}

/** A bus shelter: four posts, a slate roof, a glass back with a pale tint, a bench and a round sign on a pole. Faces +z. */
export function busStop(p: ScenePalette): Part[] {
  const iron = blend(p.navy, p.ink, 0.45);
  const wood = p.trunk;
  const parts: Part[] = [
    box(4.2, 0.1, 1.9, 0, 0, 0, tone(p.concrete, 1.05)),
    box(4.6, 0.22, 2.3, 0, 2.55, 0, tone(p.roofSlate, 0.95)),
    box(4.8, 0.1, 2.5, 0, 2.77, 0, tone(p.roofSlate, 1.12)),
    box(4.0, 2.3, 0.08, 0, 0.2, -0.85, blend(p.windowLight, p.sea, 0.2)),
    box(4.0, 0.12, 0.5, 0, 0.62, -0.55, wood),
    box(0.1, 0.5, 0.45, -1.7, 0.1, -0.55, iron),
    box(0.1, 0.5, 0.45, 1.7, 0.1, -0.55, iron),
    cyl(0.04, 0.04, 2.4, 4, 3.0, 0, 0.4, iron),
    cyl(0.4, 0.4, 0.07, 12, 3.0, 2.3, 0.4, p.awning),
  ];
  for (const x of [-2.0, 2.0]) for (const z of [-0.85, 0.85]) parts.push(cyl(0.06, 0.06, 2.45, 4, x, 0.1, z, iron));
  parts.push(box(1.6, 0.9, 0.06, 0.8, 1.2, -0.8, blend(p.flag, p.wallCream, 0.55)));
  return parts;
}

/** A picnic table with two benches and a striped parasol. */
export function picnic(p: ScenePalette): Part[] {
  const wood = p.trunk;
  const parts: Part[] = [
    box(2.2, 0.1, 1.0, 0, 0.85, 0, wood),
    box(2.2, 0.1, 0.4, 0, 0.45, -0.85, tone(wood, 0.9)),
    box(2.2, 0.1, 0.4, 0, 0.45, 0.85, tone(wood, 0.9)),
  ];
  for (const x of [-0.8, 0.8]) parts.push(box(0.1, 0.85, 1.9, x, 0, 0, tone(wood, 0.75)));
  parts.push(cyl(0.04, 0.04, 2.5, 4, 0, 0.9, 0, p.concrete));
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const g = new THREE.ConeGeometry(1.5, 0.55, 1, 1, true, a, (Math.PI * 2) / n).translate(0, 0.28 + 3.15, 0);
    parts.push(paint(g.toNonIndexed(), i % 2 ? p.awning : blend(p.awning, p.cloud, 0.8)));
  }
  return parts;
}

/** A letterbox on a post, a fire hydrant, a trash can: tiny props for the curb. */
export function mailbox(p: ScenePalette): Part[] {
  return [cyl(0.05, 0.06, 1.1, 5, 0, 0, 0, p.trunk), box(0.5, 0.38, 0.34, 0, 1.0, 0, p.roofSlate), ball(0.17, 0, 1.2, 0, p.roofSlate, 0.8), box(0.04, 0.3, 0.04, 0.27, 1.06, 0, p.awning)];
}

export function hydrant(p: ScenePalette): Part[] {
  const red = blend(p.awning, p.roofCoral, 0.4);
  return [cyl(0.2, 0.24, 0.7, 7, 0, 0, 0, red), ball(0.22, 0, 0.78, 0, red, 0.8), cyl(0.07, 0.07, 0.5, 5, 0, 0.35, 0, tone(red, 0.85)).rotateX(0)];
}

export function trashCan(p: ScenePalette): Part[] {
  return [cyl(0.34, 0.28, 0.95, 8, 0, 0, 0, blend(p.tree, p.ink, 0.35)), cyl(0.37, 0.37, 0.1, 8, 0, 0.95, 0, tone(p.tree, 0.7))];
}

/** A picket fence along +x from 0 to len: posts, two rails and white pickets with pointed tops. */
export function fence(len: number, p: ScenePalette): Part[] {
  const white = blend(p.wallCream, p.cloud, 0.7);
  const parts: Part[] = [box(len, 0.07, 0.06, len / 2, 0.28, 0, tone(white, 0.85)), box(len, 0.07, 0.06, len / 2, 0.62, 0, tone(white, 0.85))];
  const n = Math.max(2, Math.round(len / 0.42));
  for (let i = 0; i <= n; i++) {
    const x = (len * i) / n;
    parts.push(box(0.12, 0.85 + ((i * 7) % 3) * 0.03, 0.05, x, 0, 0.04, white));
    parts.push(pyramid(0.12, 0.05, 0.1, x, 0.85 + ((i * 7) % 3) * 0.03, 0.04, white));
  }
  return parts;
}

/** A signpost with two arrow boards (blank, in the flag color and cream): at crossroads. */
export function signPost(p: ScenePalette): Part[] {
  const parts: Part[] = [cyl(0.07, 0.09, 3.0, 5, 0, 0, 0, p.trunk)];
  parts.push(box(1.7, 0.4, 0.07, 0.35, 2.4, 0.08, blend(p.wallCream, p.flag, 0.25)));
  parts.push(box(1.5, 0.4, 0.07, -0.3, 1.85, -0.08, blend(p.wallCream, p.roofSlate, 0.2)));
  return parts;
}

/** A conical haystack with a rounded top and a hay bale beside it. */
export function haystack(p: ScenePalette): Part[] {
  const hay = blend(p.sand, p.flag, 0.35);
  return [cyl(0.0, 1.6, 2.4, 9, 0, 0, 0, hay, { bottom: 0.85, top: 1.1 }), ball(0.35, 0, 2.4, 0, tone(hay, 1.1), 0.8), box(1.6, 0.9, 1.0, 2.1, 0, 0.5, tone(hay, 0.95), { rotY: 0.3 })];
}

/** A low stone wall along +x from 0 to len, capped. */
export function stoneWall(len: number, p: ScenePalette): Part[] {
  const stone = blend(p.wallStone, p.ink, 0.1);
  const parts: Part[] = [box(len, 0.9, 0.55, len / 2, 0, 0, stone, { bottom: 0.8, top: 1.05 }), box(len + 0.1, 0.14, 0.7, len / 2, 0.9, 0, tone(stone, 1.12))];
  for (let i = 0; i < Math.floor(len / 1.6); i++) parts.push(box(0.9, 0.05, 0.58, 0.8 + i * 1.6, 0.4 + (i % 2) * 0.25, 0, tone(stone, 0.82)));
  return parts;
}

/** A round stone fountain: a basin with water, a pillar, two tiered bowls and a jet. Standing on y = 0. */
export function fountain(p: ScenePalette): Part[] {
  const stone = blend(p.wallStone, p.plaza, 0.35);
  const water = blend(p.seaShallow, p.windowLight, 0.35);
  return [
    cyl(3.1, 3.3, 0.9, 12, 0, 0, 0, stone, { bottom: 0.82, top: 1.05 }),
    cyl(2.75, 2.75, 0.06, 12, 0, 0.84, 0, water),
    cyl(0.5, 0.7, 1.7, 8, 0, 0.3, 0, tone(stone, 1.04)),
    cyl(1.5, 0.6, 0.45, 10, 0, 1.75, 0, stone),
    cyl(1.3, 1.3, 0.05, 10, 0, 2.17, 0, water),
    cyl(0.18, 0.28, 1.2, 6, 0, 2.2, 0, tone(stone, 1.05)),
    cyl(0.7, 0.3, 0.3, 8, 0, 3.2, 0, stone),
    cyl(0.0, 0.34, 1.0, 6, 0, 3.4, 0, blend(water, p.cloud, 0.45)),
    ball(0.2, 0, 4.45, 0, blend(water, p.cloud, 0.6)),
  ];
}

/** A market stall: four posts, a striped sloping awning, a counter with crates of fruit. The front faces +z. */
export function stall(p: ScenePalette, tint: THREE.Color): Part[] {
  const wood = p.trunk;
  const parts: Part[] = [box(3.8, 0.9, 1.1, 0, 0, 0.45, tone(wood, 0.85)), box(3.9, 0.1, 1.3, 0, 0.9, 0.45, tone(wood, 1.05))];
  for (const x of [-1.8, 1.8]) {
    parts.push(cyl(0.07, 0.07, 3.0, 5, x, 0, -0.55, tone(wood, 0.7)), cyl(0.07, 0.07, 2.5, 5, x, 0, 1.3, tone(wood, 0.7)));
  }
  const n = 10;
  for (let i = 0; i < n; i++) {
    const g = new THREE.BoxGeometry(3.9 / n, 0.1, 2.3).rotateX(0.22).translate(-1.95 + (3.9 * (i + 0.5)) / n, 2.85, 0.4);
    parts.push(paint(g, i % 2 ? tint : blend(tint, p.cloud, 0.8)));
  }
  parts.push(box(3.9, 0.3, 0.06, 0, 2.5, 1.5, tone(tint, 0.9)));
  const fruit = [p.roofCoral, p.flag, p.tree, p.roofRose];
  for (let i = 0; i < 4; i++) {
    parts.push(box(0.8, 0.28, 0.6, -1.4 + i * 0.95, 1.0, 0.5, tone(wood, 0.8)));
    for (let k = 0; k < 4; k++) parts.push(ball(0.15, -1.4 + i * 0.95 + (k % 2) * 0.3 - 0.15, 1.35, 0.5 + (k >> 1) * 0.25 - 0.12, fruit[i % fruit.length], 0.9));
  }
  return parts;
}
