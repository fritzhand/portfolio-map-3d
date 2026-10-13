// @ts-nocheck
/* The island's palette texture: one row per ramp, read by the scene shader at
   x = half-lambert(N.L) x shadow, y = the row (materials.ts, glsl/fragment.glsl).

   Rows:
     0..99     unused (kept so every asset's rows stay where they are)
     100..     palette.json's ramps (white, glass, graphite...), in the order listed there
     200..     four rows per district, generated from its color: accent, glow, deep, tint
     480..483  the accent slots: an asset paints a face with 480 (accent), 481 (glow), 482 (deep) or
               483 (tint), and the shader swaps in the rows of the district it stands in

   One texture serves every material; switching the theme rewrites its pixels (day or night). Faces
   flagged as glow (colorInfo.y 3) are drawn unlit, so their row is their color in either theme. */
import { DataTexture, NearestFilter, RGBAFormat, UnsignedByteType } from 'three';
import PALETTE from './palette.json';

import { BASE_ROW, DISTRICT_ROW, MAX_DISTRICTS, RAMP_ROWS, ROWS_PER_DISTRICT, districtRamps, hex, type Stop, type Theme } from './ramps';
export { ACCENT_SLOT, MAX_DISTRICTS, RAMP_ROWS, rampRow, districtRamps, type Theme } from './ramps';

const WIDTH = 256;

const data = new Uint8Array(WIDTH * RAMP_ROWS * 4);
const texture = new DataTexture(data, WIDTH, RAMP_ROWS, RGBAFormat, UnsignedByteType);
texture.magFilter = NearestFilter;
texture.minFilter = NearestFilter;
texture.generateMipmaps = false;
texture.flipY = false;
(texture as any).encoding = 3001; // sRGB: the r148 renderer decodes it in the shader

let theme: Theme = 'day';
let districts: string[] = ['#4f86c6'];

function writeRow(row: number, stops: Stop[]) {
  const cols = stops.map(([u, h]) => [u, hex(h)] as const);
  for (let x = 0; x < WIDTH; x++) {
    const u = x / (WIDTH - 1);
    let c = cols[0][1];
    for (const [u0, cc] of cols) if (u >= u0) c = cc;
    const i = (row * WIDTH + x) * 4;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
    data[i + 3] = 255;
  }
}

function rebuild() {
  PALETTE.ramps.forEach((r, i) => writeRow(BASE_ROW + i, r[theme] as Stop[]));
  districts.forEach((color, k) => {
    districtRamps(color, theme).forEach((stops, j) => writeRow(DISTRICT_ROW + k * ROWS_PER_DISTRICT + j, stops));
  });
  texture.needsUpdate = true;
}

/** The palette texture every scene material reads (its pixels follow the theme). */
export function paletteTexture(): DataTexture {
  return texture;
}

/** The accent base of the plaza and anything that belongs to no district: the first district slot. */
export const NEUTRAL_ACCENT = DISTRICT_ROW;

/**
 * Give the plaza (`neutral`, slot 0) and each district its rows; returns each district's first row
 * (the shader's accent base), in order. Districts past the palette's room share the last slot.
 */
export function setDistrictColors(colors: string[], neutral = '#4f86c6'): number[] {
  districts = [neutral, ...colors].slice(0, MAX_DISTRICTS);
  rebuild();
  return colors.map((_, k) => DISTRICT_ROW + Math.min(k + 1, MAX_DISTRICTS - 1) * ROWS_PER_DISTRICT);
}

export function setPaletteTheme(next: Theme) {
  if (next === theme) return;
  theme = next;
  rebuild();
}

export function paletteTheme(): Theme {
  return theme;
}

rebuild();
