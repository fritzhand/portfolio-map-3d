/* Small shape builders for the walk world's props (houses, street furniture, set pieces): painted,
   faceted parts in a local frame (y up, the front of a building toward +z, its origin at the
   center of its footprint on the ground). A part is a non-indexed, vertex-colored geometry, so a
   whole building merges into one (util.merge) and takes the toon light like every other lit prop.

   Walls and roofs carry a soft vertical wash (darker at the foot, lighter at the top), the painted
   look of the afternoon: no texture, only vertex colors. Nothing here reads the DOM or the scene. */
import * as THREE from "three";
import { clamp, paint } from "./util";

export type Part = THREE.BufferGeometry;

export interface Shape {
  /** The wash: a color multiplier at the part's lowest and highest point. */
  bottom?: number;
  top?: number;
  /** Turn about the part's own center (y), before it is placed. */
  rotY?: number;
}

/** A new color, `k` times as bright. */
export const tone = (c: THREE.Color, k: number) => c.clone().multiplyScalar(k);
/** A new color `t` of the way from a to b. */
export const blend = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, t);

/** Multiply a painted part's colors by a vertical wash between its lowest and highest vertex. */
export function wash(g: Part, bottom: number, top: number): Part {
  const pos = g.attributes.position;
  const col = g.attributes.color as THREE.BufferAttribute;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  const span = Math.max(1e-4, hi - lo);
  for (let i = 0; i < pos.count; i++) {
    const k = bottom + (top - bottom) * ((pos.getY(i) - lo) / span);
    col.setXYZ(i, clamp(col.getX(i) * k, 0, 1.6), clamp(col.getY(i) * k, 0, 1.6), clamp(col.getZ(i) * k, 0, 1.6));
  }
  return g;
}

function place(g: Part, x: number, y: number, z: number, color: THREE.Color, s: Shape): Part {
  if (s.rotY) g.rotateY(s.rotY);
  g.translate(x, y, z);
  const out = paint(g, color);
  return s.bottom !== undefined || s.top !== undefined ? wash(out, s.bottom ?? 1, s.top ?? 1) : out;
}

/** A box standing on y (its bottom), centered on x and z. */
export const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.Color, s: Shape = {}): Part =>
  place(new THREE.BoxGeometry(w, h, d), x, y + h / 2, z, color, s);

/** A cylinder (or a cone, with rTop 0) standing on y. */
export const cyl = (rTop: number, rBot: number, h: number, seg: number, x: number, y: number, z: number, color: THREE.Color, s: Shape = {}): Part =>
  place(new THREE.CylinderGeometry(rTop, rBot, h, seg), x, y + h / 2, z, color, s);

/** A faceted ball, squashed in y by `sy`, centered at y. */
export const ball = (r: number, x: number, y: number, z: number, color: THREE.Color, sy = 1, detail = 0): Part =>
  paint(new THREE.IcosahedronGeometry(r, detail).scale(1, sy, 1).translate(x, y, z), color);

/** A square-based pyramid (a hip or tower roof): base w by d, standing on y. */
export const pyramid = (w: number, d: number, h: number, x: number, y: number, z: number, color: THREE.Color, s: Shape = {}): Part =>
  place(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).scale(w, h, d), x, y + h / 2, z, color, s);

/** A single triangle (a sail, a pennant), painted; seen from both sides when drawn with a double-sided material, and otherwise from the side its corners turn counter-clockwise. */
export function tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color): Part {
  const g = new THREE.BufferGeometry().setFromPoints([a, b, c]);
  g.computeVertexNormals();
  return paint(g, color);
}

/** A straight bar from a to b (a wire, a rail, a rope). */
export function bar(a: THREE.Vector3, b: THREE.Vector3, thick: number, color: THREE.Color): Part {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(thick, thick, len);
  const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0));
  m.setPosition(a.clone().add(b).multiplyScalar(0.5));
  g.applyMatrix4(m);
  return paint(g, color);
}

/** A part turned inside out: its triangles face the other way, so it is seen from within (the inside of a boat or a bowl). */
export function inside(g: Part): Part {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = g.attributes.color as THREE.BufferAttribute | undefined;
  for (let i = 0; i + 2 < pos.count; i += 3) {
    for (const a of col ? [pos, col] : [pos]) {
      const x = a.getX(i + 1);
      const y = a.getY(i + 1);
      const z = a.getZ(i + 1);
      a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
      a.setXYZ(i + 2, x, y, z);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** A small boat's hull: a long, faceted shell with a rim along its gunwale, its keel at y 0 and its bow toward +z. */
export function hull(len: number, wide: number, color: THREE.Color, trim: THREE.Color): Part[] {
  const g = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(wide / 2, 0.55, len / 2).translate(0, 0.5, 0);
  return [paint(g, color), box(wide * 0.8, 0.07, len * 0.7, 0, 0.5, 0, trim)];
}

/** Corners of a flat quad as two triangles, facing the way a-b-c turns counter-clockwise. */
function quad(out: number[], a: number[], b: number[], c: number[], d: number[]): void {
  out.push(...a, ...b, ...c, ...a, ...c, ...d);
}

/**
 * A gabled roof on y: the ridge runs along z (or along x with `ridgeX`), `span` wide across the
 * eaves and `len` long, `h` tall, with its eaves overhanging. The slopes take `roof` (lighter
 * toward the ridge), the gable ends `wall`, the soffit a darker tone.
 */
export function gable(span: number, len: number, h: number, x: number, y: number, z: number, roof: THREE.Color, wall: THREE.Color, o: { overhang?: number; ridgeX?: boolean } = {}): Part {
  const over = o.overhang ?? 0.45;
  const a = span / 2 + over;
  const b = len / 2 + over * 0.6;
  const pos: number[] = [];
  const col: number[] = [];
  const paintTri = (from: number, c: THREE.Color, k0: number, k1: number, bottomY = 0) => {
    for (let i = from; i < pos.length; i += 3) {
      const t = clamp((pos[i + 1] - bottomY) / h, 0, 1);
      const k = k0 + (k1 - k0) * t;
      col.push(c.r * k, c.g * k, c.b * k);
    }
  };
  let s0 = pos.length;
  // Slopes (the eave at y 0 and the ridge at y h).
  quad(pos, [-a, 0, -b], [-a, 0, b], [0, h, b], [0, h, -b]);
  quad(pos, [a, 0, b], [a, 0, -b], [0, h, -b], [0, h, b]);
  paintTri(s0, roof, 0.9, 1.06);
  s0 = pos.length;
  // The gable ends, set in a little from the eaves' ends: wall color.
  const ib = len / 2;
  const ia = span / 2;
  pos.push(-ia, 0, ib, ia, 0, ib, 0, h * (ia / a), ib);
  pos.push(ia, 0, -ib, -ia, 0, -ib, 0, h * (ia / a), -ib);
  paintTri(s0, wall, 0.92, 1);
  s0 = pos.length;
  // The soffit.
  quad(pos, [-a, 0, -b], [a, 0, -b], [a, 0, b], [-a, 0, b]);
  paintTri(s0, tone(roof, 0.55), 1, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  if (o.ridgeX) g.rotateY(-Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

/**
 * Solar panels on the front (+z side, or +x with `ridgeX`) slope of a gable(): a grid of dark blue
 * panels laid just proud of the roof, with pale joints. Same arguments as gable().
 */
export function solarPanels(span: number, len: number, h: number, x: number, y: number, z: number, color: THREE.Color, o: { overhang?: number; ridgeX?: boolean; cols?: number; rows?: number } = {}): Part[] {
  const over = o.overhang ?? 0.45;
  const a = span / 2 + over;
  const b = len / 2 + over * 0.6;
  const cols = o.cols ?? 3;
  const rows = o.rows ?? 2;
  const slope = Math.hypot(a, h);
  // Right-hand slope: eave (a, 0), ridge (0, h); outward normal (h, a) / slope.
  const nx = h / slope;
  const ny = a / slope;
  const out: Part[] = [];
  const u0 = 0.14;
  const u1 = 0.86;
  const v0 = 0.12;
  const v1 = 0.82;
  const cw = ((u1 - u0) * (2 * b)) / cols;
  const ch = ((v1 - v0) * slope) / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      // Position on the slope: along the eave line (z) and up the slope (v from the eave).
      const zc = -b + (u0 * 2 * b) + cw * (i + 0.5);
      const vc = v0 * slope + ch * (j + 0.5);
      const px = a - (vc / slope) * a + nx * 0.05;
      const py = (vc / slope) * h + ny * 0.05;
      // A slab: x along the slope's normal, y up the slope, z along the eave.
      const geo = new THREE.BoxGeometry(0.07, ch - 0.12, cw - 0.12).rotateZ(Math.atan2(a, h)).translate(px, py, zc);
      out.push(paint(geo, tone(color, (i + j) % 2 ? 1 : 0.92)));
    }
  }
  if (o.ridgeX) for (const g of out) g.rotateY(-Math.PI / 2);
  for (const g of out) g.translate(x, y, z);
  return out;
}

/** A window on a wall plane (z = the wall) of a front-facing facade: frame, glass, mullion, sill, optional shutters and a flower box. */
export function windowAt(x: number, y: number, z: number, w: number, h: number, c: { frame: THREE.Color; glass: THREE.Color; light: THREE.Color; shutter?: THREE.Color; bloom?: THREE.Color; arch?: boolean }): Part[] {
  const parts: Part[] = [
    box(w + 0.28, h + 0.28, 0.1, x, y - 0.14, z + 0.03, c.frame),
    box(w, h, 0.12, x, y, z + 0.06, c.glass, { bottom: 0.85, top: 1.1 }),
    // A pale reflection of the sky across the upper half of the pane.
    box(w * 0.8, h * 0.32, 0.13, x, y + h * 0.58, z + 0.065, c.light),
    box(0.08, h, 0.14, x, y, z + 0.075, c.frame),
    box(w + 0.5, 0.12, 0.34, x, y - 0.2, z + 0.12, c.frame),
  ];
  if (c.shutter) {
    parts.push(box(w * 0.42, h + 0.1, 0.09, x - w / 2 - w * 0.21 - 0.14, y - 0.05, z + 0.05, c.shutter));
    parts.push(box(w * 0.42, h + 0.1, 0.09, x + w / 2 + w * 0.21 + 0.14, y - 0.05, z + 0.05, c.shutter));
  }
  if (c.bloom) {
    parts.push(box(w + 0.3, 0.26, 0.34, x, y - 0.46, z + 0.2, tone(c.frame, 0.7)));
    for (let i = 0; i < 4; i++) parts.push(ball(0.13, x - w / 2 + (w * (i + 0.5)) / 4, y - 0.22, z + 0.22, i % 2 ? c.bloom : blend(c.bloom, c.shutter ?? c.frame, 0.4), 1));
  }
  return parts;
}

/** Turn parts built on a front-facing facade onto another side of a box-shaped building (0 front, 1 right, 2 back, 3 left). */
export function onSide(parts: Part[], side: number, halfW: number, halfD: number): Part[] {
  if (side === 0) return parts;
  const rot = [0, Math.PI / 2, Math.PI, -Math.PI / 2][side];
  // The parts were built on the plane z = halfD of the front; the side plane sits at its own half size.
  const target = side % 2 ? halfW : halfD;
  for (const g of parts) {
    g.translate(0, 0, target - halfD);
    g.rotateY(rot);
  }
  return parts;
}

/** Merge helper that tolerates an empty list. */
export function flat(...lists: (Part | Part[])[]): Part[] {
  return lists.flat();
}
