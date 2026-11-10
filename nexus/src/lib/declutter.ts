/* Which labels show, and where: no two labels overlap on screen, none sits under the HUD (or, on
   the landing page, under the headline), and none covers a world other than its own. Labels are
   placed in priority order (the world in view first, then the nearest). A label takes the first
   of its places that is free: above its world, then the other sides, then (for a world) its logo
   alone; one with no free place is hidden until the camera moves. Pure, unit-tested. */

export interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** A world (or the core) as it appears on screen. */
export interface Disc {
  x: number;
  y: number;
  r: number;
}

export interface LabelBox {
  rect: Rect;
  /** Lower first. */
  priority: number;
  /** Always shown at `rect` (the world in view): it still claims its space. */
  pinned?: boolean;
  /** Other places the label may take when `rect` is not free, in order of preference. */
  alternates?: readonly Rect[];
  /** The disc the label belongs to (an index into `discs`), which it may touch. */
  own?: number;
}

export interface PlaceOptions {
  /** The gap kept between two labels. */
  pad?: number;
  /** What no label may cover, except its own. */
  discs?: readonly Disc[];
  /** Rectangles no label may enter (the landing page's headline). */
  blocked?: readonly Rect[];
}

export function overlaps(a: Rect, b: Rect, pad = 0): boolean {
  return a.l < b.r + pad && b.l < a.r + pad && a.t < b.b + pad && b.t < a.b + pad;
}

export function inside(a: Rect, area: Rect): boolean {
  return a.l >= area.l && a.r <= area.r && a.t >= area.t && a.b <= area.b;
}

/** Does the rectangle come within `pad` of the disc? */
export function touchesDisc(rect: Rect, disc: Disc, pad = 0): boolean {
  const dx = disc.x - Math.max(rect.l, Math.min(disc.x, rect.r));
  const dy = disc.y - Math.max(rect.t, Math.min(disc.y, rect.b));
  return dx * dx + dy * dy < (disc.r + pad) ** 2;
}

/** For each box (in input order): the place it takes (0 for `rect`, k for `alternates[k - 1]`), or -1 when it is hidden. */
export function place(boxes: readonly LabelBox[], area: Rect, options: PlaceOptions = {}): number[] {
  const { pad = 6, discs = [], blocked = [] } = options;
  const order = boxes.map((_, i) => i).sort((a, b) => Number(!!boxes[b].pinned) - Number(!!boxes[a].pinned) || boxes[a].priority - boxes[b].priority);
  const placed: Rect[] = [];
  const taken = boxes.map(() => -1);
  for (const i of order) {
    const { rect, pinned, alternates = [], own } = boxes[i];
    const free = (r: Rect) => inside(r, area) && !placed.some((p) => overlaps(r, p, pad)) && !blocked.some((b) => overlaps(r, b)) && !discs.some((d, k) => k !== own && touchesDisc(r, d, 2));
    const at = pinned ? 0 : [rect, ...alternates].findIndex(free);
    if (at < 0) continue;
    placed.push(at ? alternates[at - 1] : rect);
    taken[i] = at;
  }
  return taken;
}
