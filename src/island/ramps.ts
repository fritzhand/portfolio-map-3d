/* The island palette's rows as data: palette.json's named ramps and the ramps generated for each
   district from its color. Pure (no three.js, no DOM), so it is tested on its own; palette.ts paints
   these rows into the texture the scene shader reads. */
import PALETTE from './palette.json';

export type Theme = 'day' | 'night';
export type Stop = [number, string];

export const RAMP_ROWS: number = PALETTE.rows;
export const ACCENT_SLOT: number = PALETTE.accentSlot;
export const BASE_ROW: number = PALETTE.baseRow;
export const DISTRICT_ROW: number = PALETTE.districtRow;
export const ROWS_PER_DISTRICT = 4;
/** Districts the palette has room for (rows 200..479). */
export const MAX_DISTRICTS = Math.floor((ACCENT_SLOT - DISTRICT_ROW) / ROWS_PER_DISTRICT);

/** The row of a named ramp in palette.json. */
const ROW_OF = new Map<string, number>(PALETTE.ramps.map((r, i) => [r.name, BASE_ROW + i]));
export function rampRow(name: string): number {
  const row = ROW_OF.get(name);
  if (row === undefined) throw new Error(`palette.json has no ramp "${name}"`);
  return row;
}

export const hex = (h: string): [number, number, number] => {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
const toHex = (c: number[]) => '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
const scale = (c: number[], k: number) => c.map((v) => v * k);
const toward = (c: number[], t: number[], k: number) => c.map((v, i) => v + (t[i] - v) * k);

/** A district's four ramps from its color, in either theme. Pure; tested. */
export function districtRamps(color: string, theme: Theme): Stop[][] {
  const c = hex(color);
  const white = [255, 255, 255];
  if (theme === 'day') {
    return [
      [[0, toHex(scale(c, 0.62))], [0.22, toHex(c)], [0.86, toHex(toward(c, white, 0.25))]],
      [[0, toHex(toward(c, white, 0.3))]],
      [[0, toHex(scale(c, 0.3))], [0.22, toHex(scale(c, 0.45))], [0.86, toHex(scale(c, 0.6))]],
      [[0, toHex(toward(scale(c, 0.8), white, 0.55))], [0.22, toHex(toward(c, white, 0.72))], [0.86, toHex(toward(c, white, 0.86))]],
    ];
  }
  const dusk = hex('#2c3647');
  return [
    [[0, toHex(scale(c, 0.22))], [0.22, toHex(scale(c, 0.38))], [0.86, toHex(scale(c, 0.52))]],
    [[0, toHex(toward(c, white, 0.35))]],
    [[0, toHex(scale(c, 0.12))], [0.22, toHex(scale(c, 0.18))], [0.86, toHex(scale(c, 0.25))]],
    [[0, toHex(toward(scale(c, 0.3), dusk, 0.6))], [0.22, toHex(toward(scale(c, 0.45), dusk, 0.6))], [0.86, toHex(toward(scale(c, 0.6), dusk, 0.6))]],
  ];
}

