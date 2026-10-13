/* Where the district chips go on screen, so they never stack, and the short marks and ink the
   minimap draws for each district. Pure (no DOM, no three.js): mapLabels.test.ts checks it.

   Each frame the overlay projects every chip's anchor (just above its district's mast) and calls
   placeChips(). Nearest districts are placed first: right above the anchor if that spot is free,
   else a step higher, beside the anchor, or below it; a chip with no free spot is left out for that
   frame (the minimap still shows every district). Free means inside the view, off the HUD's
   controls and every chip already placed, and not over a landmark (the monument, the portal) that
   stands nearer the camera than the chip's district. A chip keeps last frame's spot while it still
   fits and its first choice does not, so chips do not flicker between spots as the kid walks. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ChipInput {
  id: string;
  /** The anchor on screen (CSS pixels): the chip's bottom middle when it stands right above it. */
  x: number;
  y: number;
  /** How far the anchor is from the camera (world units): nearer chips are placed first. */
  depth: number;
  /** False when the anchor is behind the camera or off the view, or the chip is not wanted this frame. */
  onScreen: boolean;
  w: number;
  h: number;
}

/** A landmark's box on screen and its distance from the camera. */
export interface Occluder extends Rect {
  depth: number;
}

/** A placed chip: its top-left corner and which of slotsFor()'s spots it took. */
export interface ChipSpot {
  id: string;
  x: number;
  y: number;
  slot: number;
}

export interface PlaceOptions {
  view: { w: number; h: number };
  /** The HUD's controls: no chip covers them. */
  reserved: readonly Rect[];
  /** Landmarks: no chip of a district behind one covers it. */
  occluders: readonly Occluder[];
  /** Last frame's slot for each chip that was shown. */
  previous?: ReadonlyMap<string, number>;
  /** Room kept between a chip and anything else (CSS pixels). */
  gap?: number;
  /** Room kept from the view's edges. */
  margin?: number;
}

export const CHIP_GAP = 6;
export const VIEW_MARGIN = 8;
/** A chip shown last frame is placed as if this much nearer, so two districts at about the same distance do not trade places. */
const SHOWN_BIAS = 0.85;

export const overlaps = (a: Rect, b: Rect, gap = 0): boolean =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/** The spots slotsFor() offers, by name. */
export const SLOT = { above: 0, aboveLeft: 1, aboveRight: 2, higher: 3, higherStill: 4, right: 5, left: 6, below: 7 } as const;

/**
 * The spots a chip may take, in order of preference: above its anchor (centered, then reaching left
 * or right of it with a corner over it), a step and two steps higher, to its right, to its left,
 * below it.
 */
export function slotsFor(c: ChipInput, gap: number = CHIP_GAP): Array<{ x: number; y: number }> {
  const left = c.x - c.w / 2;
  const top = c.y - c.h;
  const reach = Math.min(18, c.w / 4);
  return [
    { x: left, y: top },
    { x: c.x - c.w + reach, y: top },
    { x: c.x - reach, y: top },
    { x: left, y: top - (c.h + gap) },
    { x: left, y: top - 2 * (c.h + gap) },
    { x: c.x + gap * 2, y: c.y - c.h / 2 },
    { x: c.x - c.w - gap * 2, y: c.y - c.h / 2 },
    { x: left, y: c.y + gap },
  ];
}

/** Every chip that fits gets a spot; none overlaps another, the HUD or a nearer landmark, and all stay inside the view. */
export function placeChips(chips: readonly ChipInput[], opts: PlaceOptions): ChipSpot[] {
  const gap = opts.gap ?? CHIP_GAP;
  const margin = opts.margin ?? VIEW_MARGIN;
  const { w: vw, h: vh } = opts.view;
  const prev = opts.previous;
  const weight = (c: ChipInput) => c.depth * (prev?.has(c.id) ? SHOWN_BIAS : 1);
  const order = chips.filter((c) => c.onScreen).sort((a, b) => weight(a) - weight(b) || (a.id < b.id ? -1 : 1));
  const placed: Rect[] = [];
  const out: ChipSpot[] = [];
  for (const c of order) {
    const slots = slotsFor(c, gap);
    const last = prev?.get(c.id);
    const tries = [0, ...(last != null && last > 0 && last < slots.length ? [last] : []), ...slots.keys()];
    const seen = new Set<number>();
    for (const k of tries) {
      if (seen.has(k)) continue;
      seen.add(k);
      // The spots centered over or under the anchor slide sideways to stay inside the view.
      const vertical = k === SLOT.above || k === SLOT.higher || k === SLOT.higherStill || k === SLOT.below;
      const x = vertical ? Math.min(Math.max(slots[k].x, margin), vw - margin - c.w) : slots[k].x;
      const r: Rect = { x, y: slots[k].y, w: c.w, h: c.h };
      if (r.x < margin || r.y < margin || r.x + r.w > vw - margin || r.y + r.h > vh - margin) continue;
      if (opts.reserved.some((q) => overlaps(r, q, gap))) continue;
      if (opts.occluders.some((o) => o.depth < c.depth && overlaps(r, o, gap))) continue;
      if (placed.some((q) => overlaps(r, q, gap))) continue;
      placed.push(r);
      out.push({ id: c.id, x: r.x, y: r.y, slot: k });
      break;
    }
  }
  return out;
}

/** The screen box of a set of projected points (CSS pixels), or null when none is in front of the camera. */
export function screenBox(points: ReadonlyArray<{ x: number; y: number; front: boolean }>): Rect | null {
  const front = points.filter((p) => p.front);
  if (!front.length) return null;
  const xs = front.map((p) => p.x);
  const ys = front.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/* ---------------- the minimap's marks ---------------- */

/**
 * A short mark for each district on the minimap: the first letter of its short name, or the
 * first two when another district starts with the same letter (then three, and so on), so that
 * no two marks are the same.
 */
export function mapMarks(names: readonly string[]): string[] {
  const clean = names.map((n) => n.replace(/[^\p{L}\p{N}]/gu, "").toUpperCase() || "?");
  const marks = clean.map((n) => n.slice(0, 1));
  for (let len = 2; len <= 4; len++) {
    const counts = new Map<string, number>();
    for (const m of marks) counts.set(m, (counts.get(m) ?? 0) + 1);
    if ([...counts.values()].every((v) => v === 1)) break;
    marks.forEach((m, i) => {
      if ((counts.get(m) ?? 0) > 1) marks[i] = clean[i].slice(0, len);
    });
  }
  return marks;
}

/** sRGB channel (0..1) to linear light. */
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Relative luminance of a #rrggbb color. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1, 7), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => toLinear(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};

/** White or a dark ink (black unless given) on a district's color, whichever reads better. */
export function inkOn(color: string, dark = "#000000"): string {
  return contrast("#ffffff", color) >= contrast(dark, color) ? "#ffffff" : dark;
}
