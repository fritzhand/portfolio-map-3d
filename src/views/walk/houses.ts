/* The village's houses: six hand-built, painted buildings in the same low-poly summer style, each
   a list of faceted parts (kit.ts) in the building's own frame (its front toward +z, its origin
   at the center of the footprint on the ground). The village (village.ts) turns each toward the
   plaza, merges them into a few draw calls, and gives each a box collider from its footprint.

   Mauve and cream walls, coral, rose and slate roofs, dark glass with a pale sky in it, teal
   shutters, an awning here and there, a chimney, a flower box: the colors come from the scene
   palette, so the moonlit theme turns the windows on. Nothing here is a model of a real building. */
import * as THREE from "three";
import type { ScenePalette } from "./palette";
import { ball, bar, blend, box, cyl, gable, onSide, pyramid, solarPanels, tone, windowAt, type Part } from "./kit";
import { paint } from "./util";

export type HouseKind = "cottage" | "townhouse" | "solar" | "shop" | "villa" | "shed";
export const HOUSE_KINDS: readonly HouseKind[] = ["cottage", "townhouse", "solar", "shop", "villa", "shed"];

export interface HouseModel {
  parts: Part[];
  /** Half the footprint (the walls and their plinth), for the box collider. */
  hx: number;
  hz: number;
  /** The roof's highest point, for the follow camera. */
  height: number;
}

const WHITE = new THREE.Color("#ffffff");
const BLACK = new THREE.Color("#000000");

interface Look {
  wall: THREE.Color;
  roof: THREE.Color;
  trim: THREE.Color;
  stone: THREE.Color;
  door: THREE.Color;
  glass: THREE.Color;
  light: THREE.Color;
  shutter: THREE.Color;
  awning: THREE.Color;
  bloom: THREE.Color;
  wood: THREE.Color;
}

function look(p: ScenePalette, rand: () => number, walls = [p.wallMauve, p.wallCream, p.wallStone], roofs = [p.roofCoral, p.roofRose, p.roofSlate]): Look {
  const wall = blend(walls[Math.floor(rand() * walls.length)], rand() < 0.5 ? WHITE : BLACK, 0.03 + rand() * 0.07);
  const roof = blend(roofs[Math.floor(rand() * roofs.length)], rand() < 0.5 ? WHITE : BLACK, 0.02 + rand() * 0.06);
  return {
    wall,
    roof,
    trim: blend(wall, WHITE, 0.55),
    stone: blend(p.wallStone, p.ink, 0.12),
    door: blend(p.trunk, p.ink, 0.3),
    glass: p.window,
    light: p.windowLight,
    shutter: p.shutter,
    awning: p.awning,
    bloom: p.bloom,
    wood: p.trunk,
  };
}

/** A sloped slab (an awning over a door or a window), its high edge against the wall at z. */
function awning(w: number, x: number, y: number, z: number, color: THREE.Color, depth = 1.5): Part[] {
  const g = new THREE.BoxGeometry(w, 0.14, depth).rotateX(0.3).translate(x, y + 0.2, z + depth / 2 - 0.05);
  const parts: Part[] = [paint(g, color)];
  // Valance and side cheeks.
  parts.push(box(w, 0.28, 0.1, x, y - 0.18, z + depth - 0.12, tone(color, 0.86)));
  return parts;
}

/** A front door in a frame, with a step, on the wall at z. */
function door(x: number, z: number, w: number, h: number, l: Look): Part[] {
  return [
    box(w + 0.4, h + 0.25, 0.12, x, 0.3, z + 0.02, l.trim),
    box(w, h, 0.16, x, 0.3, z + 0.05, l.door, { bottom: 0.85, top: 1.08 }),
    box(w - 0.35, h * 0.34, 0.18, x, 0.3 + h * 0.52, z + 0.06, tone(l.door, 0.78)),
    ball(0.07, x + w * 0.34, 0.3 + h * 0.48, z + 0.2, tone(l.trim, 0.9)),
    box(w + 1.0, 0.26, 0.9, x, 0.0, z + 0.45, l.stone),
  ];
}

/** Planters, a pot or two: dressing for a front yard, in local coordinates. */
function pots(x: number, z: number, p: ScenePalette, l: Look, n = 2): Part[] {
  const out: Part[] = [];
  for (let i = 0; i < n; i++) {
    const px = x + i * 0.9;
    out.push(cyl(0.3, 0.22, 0.5, 7, px, 0, z, blend(p.roofCoral, p.wallStone, 0.3)));
    out.push(ball(0.38, px, 0.82, z, i % 2 ? p.tree : p.grass, 0.9));
    if (i % 2 === 0) out.push(ball(0.1, px + 0.1, 1.1, z + 0.12, l.bloom));
  }
  return out;
}

function chimney(x: number, y0: number, y1: number, z: number, l: Look): Part[] {
  return [box(0.95, y1 - y0, 0.95, x, y0, z, blend(l.stone, l.roof, 0.18), { bottom: 0.9 }), box(1.2, 0.2, 1.2, x, y1, z, tone(l.stone, 0.8))];
}

/** A small cottage: a gabled roof (its ridge across or along the street), a chimney, two shuttered windows and a door. */
function cottage(p: ScenePalette, rand: () => number): HouseModel {
  const l = look(p, rand);
  const w = 8.2 + rand() * 1.6;
  const d = 6.6 + rand() * 0.8;
  const wh = 3.4;
  const ridgeX = rand() < 0.55;
  const rh = 2.7;
  const y0 = 0.3 + wh;
  const parts: Part[] = [box(w + 0.3, 0.46, d + 0.3, 0, 0, 0, l.stone), box(w, wh, d, 0, 0.3, 0, l.wall, { bottom: 0.8, top: 1.06 })];
  parts.push(gable(ridgeX ? d : w, ridgeX ? w : d, rh, 0, y0, 0, l.roof, l.wall, { ridgeX, overhang: 0.5 }));
  const front = d / 2;
  const dx = rand() < 0.5 ? -w * 0.1 : w * 0.1;
  parts.push(...door(dx, front, 1.3, 2.4, l));
  parts.push(...awning(2.5, dx, 3.0, front, l.awning));
  const wc = { frame: l.trim, glass: l.glass, light: l.light, shutter: l.shutter, bloom: rand() < 0.6 ? l.bloom : undefined };
  parts.push(...windowAt(-w * 0.3 + (dx > 0 ? -0.5 : 0.8), 1.35, front, 1.4, 1.5, wc));
  parts.push(...windowAt(w * 0.3 + (dx > 0 ? -0.8 : 0.5), 1.35, front, 1.4, 1.5, wc));
  parts.push(...onSide(windowAt(-d * 0.22, 1.35, front, 1.3, 1.5, wc), 1, w / 2, d / 2));
  parts.push(...onSide(windowAt(d * 0.22, 1.35, front, 1.3, 1.5, wc), 3, w / 2, d / 2));
  if (!ridgeX) parts.push(...windowAt(-0.0, y0 + 0.6, front, 0.9, 0.9, { ...wc, shutter: undefined, bloom: undefined }));
  parts.push(...chimney(w * (ridgeX ? 0.28 : 0.1), y0 + 0.4, y0 + rh + 1.1, -d * 0.12, l));
  parts.push(...pots(front - 0.3 - 0.1 + (dx > 0 ? -2.6 : 1.8), front + 1.0, p, l));
  return { parts, hx: w / 2 + 0.15, hz: d / 2 + 0.15, height: y0 + rh + 1.3 };
}

/** A two-story house with a hip roof, a balcony and a red awning over a wide ground-floor window. */
function townhouse(p: ScenePalette, rand: () => number): HouseModel {
  const l = look(p, rand, [p.wallCream, p.wallMauve, p.wallCream], [p.roofCoral, p.roofRose, p.roofCoral]);
  const w = 8.8 + rand() * 1.2;
  const d = 7.0;
  const floor = 3.1;
  const front = d / 2;
  const top = 0.3 + floor * 2;
  const parts: Part[] = [box(w + 0.3, 0.46, d + 0.3, 0, 0, 0, l.stone), box(w, floor * 2, d, 0, 0.3, 0, l.wall, { bottom: 0.78, top: 1.06 })];
  // A cornice between the floors and under the roof.
  parts.push(box(w + 0.3, 0.2, d + 0.3, 0, 0.3 + floor - 0.1, 0, l.trim));
  parts.push(box(w + 0.5, 0.3, d + 0.5, 0, top - 0.1, 0, l.trim));
  parts.push(pyramid(w + 1.5, d + 1.5, 2.9, 0, top + 0.2, 0, l.roof, { bottom: 0.9, top: 1.1 }));
  const dx = w * 0.26;
  parts.push(...door(dx, front, 1.4, 2.5, l));
  const wc = { frame: l.trim, glass: l.glass, light: l.light, shutter: l.shutter };
  // The wide window and its awning.
  parts.push(...windowAt(-w * 0.2, 0.9, front, 2.9, 1.8, { ...wc, shutter: undefined }));
  parts.push(...awning(3.7, -w * 0.2, 3.0, front, l.awning, 1.7));
  // Three windows and a balcony upstairs.
  parts.push(...windowAt(-w * 0.32, 0.3 + floor + 0.5, front, 1.3, 1.7, { ...wc, bloom: l.bloom }));
  parts.push(...windowAt(w * 0.02, 0.3 + floor + 0.5, front, 1.3, 1.7, wc));
  parts.push(box(2.6, 0.2, 1.3, dx, 0.3 + floor + 0.1, front + 0.6, l.trim));
  parts.push(box(1.4, 2.0, 0.16, dx, 0.3 + floor + 0.3, front + 0.02, tone(l.door, 0.9)));
  for (let i = 0; i <= 6; i++) parts.push(box(0.07, 0.95, 0.07, dx - 1.2 + (2.4 * i) / 6, 0.3 + floor + 0.3, front + 1.15, l.trim));
  parts.push(box(2.6, 0.1, 0.1, dx, 0.3 + floor + 1.25, front + 1.15, l.trim));
  parts.push(box(0.1, 0.1, 1.1, dx - 1.25, 0.3 + floor + 1.25, front + 0.6, l.trim), box(0.1, 0.1, 1.1, dx + 1.25, 0.3 + floor + 1.25, front + 0.6, l.trim));
  parts.push(...onSide(windowAt(-1.2, 1.5, front, 1.3, 1.6, wc), 1, w / 2, d / 2), ...onSide(windowAt(1.2, 1.5, front, 1.3, 1.6, wc), 1, w / 2, d / 2));
  parts.push(...onSide(windowAt(0, 0.3 + floor + 0.6, front, 1.3, 1.6, wc), 3, w / 2, d / 2), ...onSide(windowAt(0, 1.5, front, 1.3, 1.6, wc), 3, w / 2, d / 2));
  parts.push(...chimney(w * 0.3, top + 0.6, top + 3.5, -d * 0.18, l));
  parts.push(...pots(-w * 0.45, front + 1.0, p, l, 3));
  return { parts, hx: w / 2 + 0.15, hz: d / 2 + 0.15, height: top + 3.6 };
}

/** A long low house with a slate roof carrying solar panels, a garage door and a veranda. */
function solar(p: ScenePalette, rand: () => number): HouseModel {
  const l = look(p, rand, [p.wallMauve, p.wallStone, p.wallMauve], [p.roofSlate, p.roofSlate, p.roofCoral]);
  const w = 10.4 + rand() * 1.6;
  const d = 6.8;
  const wh = 3.3;
  const rh = 3.0;
  const y0 = 0.3 + wh;
  const front = d / 2;
  const parts: Part[] = [box(w + 0.3, 0.46, d + 0.3, 0, 0, 0, l.stone), box(w, wh, d, 0, 0.3, 0, l.wall, { bottom: 0.78, top: 1.06 })];
  parts.push(gable(d, w, rh, 0, y0, 0, l.roof, l.wall, { ridgeX: true, overhang: 0.6 }));
  parts.push(...solarPanels(d, w, rh, 0, y0, 0, p.solar, { ridgeX: true, overhang: 0.6, cols: 5, rows: 2 }));
  // Garage: a wide ribbed door on the left, a front door and window on the right.
  parts.push(box(3.6, 2.7, 0.14, -w * 0.25, 0.3, front + 0.03, l.trim));
  for (let i = 0; i < 6; i++) parts.push(box(3.3, 0.36, 0.18, -w * 0.25, 0.4 + i * 0.43, front + 0.05, i % 2 ? tone(l.trim, 0.92) : tone(l.trim, 0.8)));
  parts.push(...door(w * 0.18, front, 1.3, 2.4, l));
  parts.push(...windowAt(w * 0.36, 1.35, front, 1.3, 1.5, { frame: l.trim, glass: l.glass, light: l.light, shutter: l.shutter }));
  parts.push(...onSide(windowAt(-1.2, 1.35, front, 1.3, 1.5, { frame: l.trim, glass: l.glass, light: l.light }), 1, w / 2, d / 2));
  parts.push(...onSide(windowAt(1.4, 1.35, front, 1.3, 1.5, { frame: l.trim, glass: l.glass, light: l.light }), 3, w / 2, d / 2));
  // A small veranda over the door: two posts and a flat roof.
  parts.push(box(3.0, 0.16, 1.6, w * 0.18, 3.0, front + 0.8, tone(l.roof, 1.1)));
  parts.push(box(0.14, 2.7, 0.14, w * 0.18 - 1.35, 0.3, front + 1.5, l.trim), box(0.14, 2.7, 0.14, w * 0.18 + 1.35, 0.3, front + 1.5, l.trim));
  parts.push(...pots(w * 0.18 + 2.0, front + 1.0, p, l, 2));
  return { parts, hx: w / 2 + 0.15, hz: d / 2 + 0.15, height: y0 + rh + 0.3 };
}

/** A shop on the corner: a flat roof behind a parapet, a striped awning, big windows, a signboard, crates, a barrel and a table under a parasol. */
function shop(p: ScenePalette, rand: () => number): HouseModel {
  const l = look(p, rand, [p.wallCream, p.wallStone, p.wallMauve], [p.roofCoral]);
  const w = 9.2;
  const d = 7.2;
  const wh = 4.3;
  const front = d / 2;
  const top = 0.3 + wh;
  const parts: Part[] = [box(w + 0.3, 0.46, d + 0.3, 0, 0, 0, l.stone), box(w, wh, d, 0, 0.3, 0, l.wall, { bottom: 0.78, top: 1.06 })];
  parts.push(box(w + 0.5, 0.35, d + 0.5, 0, top - 0.05, 0, l.trim), box(w - 0.2, 0.7, 0.4, 0, top + 0.3, front - 0.2, l.trim), box(w - 0.2, 0.7, 0.4, 0, top + 0.3, -front + 0.2, l.trim));
  parts.push(box(0.4, 0.7, d - 0.4, -w / 2 + 0.2, top + 0.3, 0, l.trim), box(0.4, 0.7, d - 0.4, w / 2 - 0.2, top + 0.3, 0, l.trim));
  parts.push(box(1.6, 0.9, 1.4, -w * 0.25, top + 0.3, -d * 0.2, p.concrete));
  const wc = { frame: l.trim, glass: l.glass, light: l.light };
  parts.push(...windowAt(-w * 0.28, 0.9, front, 2.6, 2.1, wc));
  parts.push(...windowAt(w * 0.3, 0.9, front, 2.6, 2.1, wc));
  parts.push(...door(0.1, front, 1.5, 2.5, l));
  // A signboard over the door and a striped awning across the front.
  parts.push(box(3.4, 0.9, 0.18, 0.1, 3.25, front + 0.1, tone(l.wood, 0.85)), box(2.8, 0.5, 0.2, 0.1, 3.45, front + 0.14, blend(p.flag, WHITE, 0.25)));
  const n = 10;
  for (let i = 0; i < n; i++) {
    const g = new THREE.BoxGeometry(w / n, 0.12, 1.5).rotateX(0.32).translate(-w / 2 + (w * (i + 0.5)) / n, 3.0 + 0.58, front + 0.7);
    parts.push(paint(g, i % 2 ? l.awning : blend(l.awning, WHITE, 0.78)));
  }
  parts.push(...onSide(windowAt(-1.2, 1.4, front, 1.5, 1.6, wc), 1, w / 2, d / 2), ...onSide(windowAt(1.4, 1.4, front, 1.5, 1.6, wc), 3, w / 2, d / 2));
  // Outside: crates of fruit, a barrel, a small table under a parasol.
  for (let i = 0; i < 3; i++) parts.push(box(0.95, 0.5, 0.7, w * 0.36 + i * 1.0, 0, front + 1.3 + (i % 2) * 0.15, l.wood));
  for (let i = 0; i < 3; i++) parts.push(ball(0.2, w * 0.36 + i * 1.0, 0.62, front + 1.3, [p.roofCoral, p.flag, p.tree][i], 0.8));
  parts.push(cyl(0.42, 0.36, 0.9, 8, -w * 0.42, 0, front + 1.4, tone(l.wood, 0.8)));
  parts.push(cyl(0.05, 0.05, 2.3, 5, -w * 0.18, 0, front + 2.6, tone(p.concrete, 0.9)), cyl(0.5, 0.5, 0.08, 10, -w * 0.18, 0.78, front + 2.6, l.trim));
  parts.push(cyl(0.02, 1.25, 0.55, 8, -w * 0.18, 2.1, front + 2.6, p.flag));
  return { parts, hx: w / 2 + 0.15, hz: d / 2 + 0.15, height: top + 1.3 };
}

/** A villa with a square tower under a pyramid roof, a gabled main house, a balcony and arched-looking windows. */
function villa(p: ScenePalette, rand: () => number): HouseModel {
  const l = look(p, rand, [p.wallMauve, p.wallCream], [p.roofSlate, p.roofRose]);
  const w = 9.6;
  const d = 7.0;
  const wh = 3.5;
  const front = d / 2;
  const y0 = 0.3 + wh;
  const parts: Part[] = [box(w + 0.3, 0.46, d + 0.3, 0, 0, 0, l.stone), box(w, wh, d, 0, 0.3, 0, l.wall, { bottom: 0.78, top: 1.06 })];
  parts.push(gable(d, w, 2.8, 0, y0, 0, l.roof, l.wall, { ridgeX: true, overhang: 0.5 }));
  // The tower rises at the right-hand front corner.
  const tw = 3.6;
  const tx = w / 2 - tw / 2 + 0.2;
  const tz = front - tw / 2 + 0.5;
  const th = 9.0;
  parts.push(box(tw, th, tw, tx, 0.3, tz, blend(l.wall, l.trim, 0.15), { bottom: 0.78, top: 1.08 }));
  parts.push(box(tw + 0.5, 0.3, tw + 0.5, tx, 0.3 + th - 0.2, tz, l.trim));
  parts.push(pyramid(tw + 1.4, tw + 1.4, 3.6, tx, 0.3 + th + 0.1, tz, blend(l.roof, p.roofCoral, 0.35), { bottom: 0.9, top: 1.1 }));
  parts.push(cyl(0.05, 0.05, 1.5, 4, tx, 0.3 + th + 3.6, tz, l.trim), box(0.9, 0.5, 0.05, tx + 0.45, 0.3 + th + 4.5, tz, p.flag));
  const wc = { frame: l.trim, glass: l.glass, light: l.light, shutter: l.shutter };
  parts.push(...windowAt(tx, 2.4, tz + tw / 2, 1.2, 1.9, wc), ...windowAt(tx, 5.6, tz + tw / 2, 1.2, 1.9, wc), ...windowAt(tx, 8.2 - 0.3, tz + tw / 2, 1.0, 1.0, { ...wc, shutter: undefined }));
  parts.push(...door(-w * 0.12, front, 1.5, 2.6, l));
  parts.push(...awning(2.8, -w * 0.12, 3.15, front, l.awning));
  parts.push(...windowAt(-w * 0.38, 1.4, front, 1.5, 1.6, { ...wc, bloom: l.bloom }));
  parts.push(...windowAt(w * 0.04, 1.4, front, 1.5, 1.6, wc));
  parts.push(...onSide(windowAt(0, 1.4, front, 1.5, 1.6, wc), 3, w / 2, d / 2));
  parts.push(...onSide(windowAt(-1.2, 1.4, front, 1.3, 1.6, wc), 2, w / 2, d / 2));
  parts.push(...pots(-w * 0.45, front + 1.0, p, l, 3));
  return { parts, hx: w / 2 + 0.15, hz: d / 2 + 0.15, height: 0.3 + th + 5.2 };
}

/** A garage or workshop: a small gable, a ribbed door, stacked firewood and a leaning bicycle. */
function shed(p: ScenePalette, rand: () => number): HouseModel {
  const l = look(p, rand, [p.wallStone, p.wallMauve], [p.roofCoral, p.roofSlate]);
  const w = 6.4;
  const d = 5.4;
  const wh = 2.9;
  const front = d / 2;
  const y0 = 0.3 + wh;
  const parts: Part[] = [box(w + 0.3, 0.4, d + 0.3, 0, 0, 0, l.stone), box(w, wh, d, 0, 0.3, 0, l.wall, { bottom: 0.78, top: 1.06 })];
  parts.push(gable(w, d, 1.9, 0, y0, 0, l.roof, l.wall, { overhang: 0.4 }));
  parts.push(box(3.4, 2.5, 0.14, -0.6, 0.3, front + 0.03, l.trim));
  for (let i = 0; i < 6; i++) parts.push(box(3.1, 0.34, 0.18, -0.6, 0.38 + i * 0.4, front + 0.05, i % 2 ? tone(l.trim, 0.9) : tone(l.trim, 0.78)));
  parts.push(...windowAt(2.0, 1.2, front, 0.9, 1.2, { frame: l.trim, glass: l.glass, light: l.light, shutter: l.shutter }));
  parts.push(...windowAt(0, y0 + 0.5, front, 0.8, 0.7, { frame: l.trim, glass: l.glass, light: l.light }));
  // Firewood.
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4 - r; c++) {
      const log = new THREE.CylinderGeometry(0.17, 0.17, 1.2, 6).rotateX(Math.PI / 2).translate(w / 2 - 0.4 - c * 0.36 - r * 0.18, 0.2 + r * 0.32, -d / 2 - 0.8);
      parts.push(paint(log, tone(l.wood, 0.8 + (c % 2) * 0.2)));
    }
  }
  // A bicycle against the wall: two wheels and a frame.
  const wheel = (x: number) => paint(new THREE.TorusGeometry(0.42, 0.04, 4, 10).translate(x, 0.45, front + 0.9).rotateY(0), tone(p.ink, 1.1));
  parts.push(wheel(w / 2 - 1.4), wheel(w / 2 - 0.3), bar(new THREE.Vector3(w / 2 - 1.4, 0.45, front + 0.9), new THREE.Vector3(w / 2 - 0.85, 0.95, front + 0.9), 0.05, p.roofCoral), bar(new THREE.Vector3(w / 2 - 0.85, 0.95, front + 0.9), new THREE.Vector3(w / 2 - 0.3, 0.45, front + 0.9), 0.05, p.roofCoral));
  return { parts, hx: w / 2 + 0.15, hz: d / 2 + 0.15, height: y0 + 2.2 };
}

const BUILDERS: Record<HouseKind, (p: ScenePalette, rand: () => number) => HouseModel> = { cottage, townhouse, solar, shop, villa, shed };

export function buildHouse(kind: HouseKind, p: ScenePalette, rand: () => number): HouseModel {
  return BUILDERS[kind](p, rand);
}
