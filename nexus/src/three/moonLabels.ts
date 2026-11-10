import { overlaps, touchesDisc, type Disc, type Rect } from "../lib/declutter.ts";
import { cpuCanvas } from "./cpuCanvas.ts";
import { fontFamily } from "./paint.ts";

export interface MoonAnchor {
  slug: string;
  x: number;
  y: number;
  radius: number;
  /** The width its whole name takes, in CSS pixels (MOON_LABEL.want when it was not measured). */
  want?: number;
  /** Behind the planet: its leader line starts at the planet's edge. */
  hidden?: boolean;
}

export interface MoonLabelPosition {
  slug: string;
  x: number;
  y: number;
  width: number;
  /** Where the name stands by its moon (0 right, 1 left, 2 and up above or below), or -1 for a place in the grid. */
  side: number;
}

export interface MoonLabelOptions {
  /** The planet on screen: no name covers it, and names prefer the side of their moon away from it. */
  planet?: Disc;
  /** The side each name took last time, which it keeps when it can. */
  previous?: ReadonlyMap<string, number>;
}

export const MOON_LABEL = {
  /** A name's box: its height, the pitch of stacked rows, and the least width worth showing. */
  height: 16,
  row: 18,
  min: 56,
  /** The width assumed for a name that was not measured. */
  want: 108,
  /** The gap between a moon and its name. */
  gap: 5,
  /** A moon's touch target when the names are hidden. */
  target: 44,
  /** The screen area one name needs, counting the room its planet and moons take. */
  room: 13000,
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));
const bounds = (x: number, y: number, width: number): Rect => ({ l: x - width / 2, r: x + width / 2, t: y - MOON_LABEL.height / 2, b: y + MOON_LABEL.height / 2 });

/** Where a leader line leaves its moon for the point (nx, ny) on its name: the moon's edge, or the
 *  planet's edge for a moon behind the planet. Null when the name stands right by it. */
export function leaderStart(a: MoonAnchor, nx: number, ny: number, planet?: Disc): { x: number; y: number } | null {
  const dx = nx - a.x, dy = ny - a.y;
  const length = Math.hypot(dx, dy);
  let t = length ? a.radius / length : 1;
  if (a.hidden && planet && length) {
    const fx = a.x - planet.x, fy = a.y - planet.y;
    const b = 2 * (fx * dx + fy * dy);
    const root = b * b - 4 * length * length * (fx * fx + fy * fy - planet.r ** 2);
    if (root > 0) t = Math.max(t, (-b + Math.sqrt(root)) / (2 * length * length));
  }
  return (1 - t) * length > 9 ? { x: a.x + dx * t, y: a.y + dy * t } : null;
}

/** A scene too small to name every moon legibly names only the chosen one; the directory lists them all. */
export function moonLabelsCompact(count: number, area: Rect): boolean {
  return count * MOON_LABEL.room > Math.max(0, area.r - area.l) * Math.max(0, area.b - area.t);
}

/** A grid of places over the scene, with room for `count` names in cells about `cell` wide. */
function gridSlots(count: number, area: Rect, cell: number, widest: number): { slots: { x: number; y: number }[]; width: number } {
  const width = Math.max(44, area.r - area.l);
  const height = Math.max(MOON_LABEL.row, area.b - area.t);
  const maxRows = Math.max(1, Math.floor(height / MOON_LABEL.row));
  const columns = Math.max(Math.ceil(count / maxRows), Math.floor(width / cell), 1);
  const cellWidth = width / columns;
  const rows = Math.min(maxRows, Math.max(1, Math.ceil((count + Math.min(8, count)) / columns)));
  const cellHeight = height / rows;
  const slots: { x: number; y: number }[] = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) slots.push({ x: area.l + cellWidth * (col + 0.5), y: area.t + cellHeight * (row + 0.5) });
  return { slots, width: Math.max(40, Math.min(widest, cellWidth - 6)) };
}

/** Every name in a grid cell of one width, on a leader line: the layout that always fits. */
function inGrid(anchors: readonly MoonAnchor[], area: Rect, obstacles: readonly Rect[], planet?: Disc): MoonLabelPosition[] {
  const narrow = area.r - area.l < 500;
  const { slots, width } = gridSlots(anchors.length, area, narrow ? 88 : 116, narrow ? 82 : 108);
  const occupied = [...obstacles];
  const result: MoonLabelPosition[] = [];
  const order = [...anchors].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const a of order) {
    const candidates = anchors.length <= 14 ? [{ x: a.x, y: a.y - a.radius - 14 }, { x: a.x, y: a.y + a.radius + 14 }, ...slots] : slots;
    const valid = candidates.filter((p) => {
      const r = bounds(p.x, p.y, width);
      return r.l >= area.l && r.r <= area.r && r.t >= area.t && r.b <= area.b && !occupied.some((other) => overlaps(r, other, 2));
    });
    valid.sort((p, q) => (p.x - a.x) ** 2 + (p.y - a.y) ** 2 - (q.x - a.x) ** 2 - (q.y - a.y) ** 2);
    // Off the planet when a free place allows it.
    let p = (planet && valid.find((c) => !touchesDisc(bounds(c.x, c.y, width), planet, 2))) || valid[0];
    // Tiny screens can leave no room around a large publisher pill. Keep all moon
    // names available; the publisher stamp has lower priority in that situation.
    if (!p) p = slots.filter((s) => !result.some((r) => Math.abs(r.x - s.x) < width && Math.abs(r.y - s.y) < MOON_LABEL.row))[0];
    if (!p) continue;
    result.push({ slug: a.slug, x: p.x, y: p.y, width, side: -1 });
    occupied.push(bounds(p.x, p.y, width));
  }
  return result;
}

/** Each name at its own width beside its moon, off the planet and the other moons; null when one does not fit. */
function besideMoons(anchors: readonly MoonAnchor[], area: Rect, obstacles: readonly Rect[], { planet, previous }: MoonLabelOptions): MoonLabelPosition[] | null {
  const { height: H, row: ROW, gap: G, min: MIN } = MOON_LABEL;
  const span = area.r - area.l;
  const grid = gridSlots(anchors.length, area, 208, 200);
  const occupied: Rect[] = [...obstacles, ...anchors.map((a) => ({ l: a.x - a.radius, r: a.x + a.radius, t: a.y - a.radius, b: a.y + a.radius }))];
  const middle = planet ?? { x: (area.l + area.r) / 2, y: (area.t + area.b) / 2 };
  // The moons farthest above and below the planet choose first; those beside it take what is left at their height.
  const order = [...anchors].sort((a, b) => Math.abs(b.y - middle.y) - Math.abs(a.y - middle.y) || a.x - b.x);
  const result: MoonLabelPosition[] = [];
  for (const a of order) {
    const want = clamp(a.want ?? MOON_LABEL.want, MIN, span);
    let best: MoonLabelPosition | null = null;
    let bestCost = Infinity;
    const consider = (side: number, x: number, y: number, width: number, extra = 0) => {
      if (width < MIN) return;
      const r = bounds(x, y, width);
      if (r.l < area.l || r.r > area.r || r.t < area.t || r.b > area.b) return;
      const dx = a.x - clamp(a.x, r.l, r.r);
      const dy = a.y - clamp(a.y, r.t, r.b);
      const inward = (x - a.x) * (a.x - middle.x) + (y - a.y) * (a.y - middle.y) < 0;
      const cost = Math.hypot(dx, dy) + (want - width) * 3 + (inward ? 40 : 0) + extra - (previous?.get(a.slug) === side ? 10 : 0);
      if (cost >= bestCost || occupied.some((o) => overlaps(r, o, 3)) || (planet && touchesDisc(r, planet, 4))) return;
      best = { slug: a.slug, x, y, width, side };
      bestCost = cost;
    };
    const right = Math.min(want, area.r - (a.x + a.radius + G));
    consider(0, a.x + a.radius + G + right / 2, a.y, right);
    const left = Math.min(want, a.x - a.radius - G - area.l);
    consider(1, a.x - a.radius - G - left / 2, a.y, left);
    // Above and below the moon, up to six rows away: centered, or starting or ending at it.
    for (let row = 0; row < 6; row++) {
      for (const up of [true, false]) {
        const y = a.y + (up ? -1 : 1) * (a.radius + G + H / 2 + row * ROW);
        const side = 2 + row * 6 + (up ? 0 : 3);
        consider(side, clamp(a.x, area.l + want / 2, area.r - want / 2), y, want);
        consider(side + 1, clamp(a.x - 8 + want / 2, area.l + want / 2, area.r - want / 2), y, want, 4);
        consider(side + 2, clamp(a.x + 8 - want / 2, area.l + want / 2, area.r - want / 2), y, want, 4);
      }
    }
    // Or a free place in the grid, on a leader line.
    const width = Math.min(want, grid.width);
    for (const s of grid.slots) consider(-1, s.x, s.y, width, 24);
    if (!best) return null;
    const chosen: MoonLabelPosition = best;
    result.push(chosen);
    occupied.push(bounds(chosen.x, chosen.y, chosen.width));
  }
  return result;
}

/** Place every name in the scene: beside its moon at its own width where that fits, in a compact
 *  grid of leader lines where it does not. Text never overlaps another name. */
export function layoutMoonLabels(anchors: readonly MoonAnchor[], area: Rect, obstacles: readonly Rect[] = [], options: MoonLabelOptions = {}): MoonLabelPosition[] {
  if (!anchors.length) return [];
  return besideMoons(anchors, area, obstacles, options) ?? inGrid(anchors, area, obstacles, options.planet);
}

interface MoonName { slug: string; name: string; count: number; unit: string; }

/** Keep names steady during subpixel camera damping. Repack after a visible move
 *  or a changed HUD, while the lightweight leader endpoints keep tracking moons. */
export class MoonLabelLayout {
  private anchors: MoonAnchor[] = [];
  private area: Rect | null = null;
  private obstacles: Rect[] = [];
  private planet: Disc | undefined;
  private positions: MoonLabelPosition[] = [];

  update(anchors: readonly MoonAnchor[], area: Rect, obstacles: readonly Rect[], planet?: Disc): MoonLabelPosition[] {
    const sameRect = (a: Rect, b: Rect) => a.l === b.l && a.r === b.r && a.t === b.t && a.b === b.b;
    // Names in the grid stand still until their moons have moved well away; names beside a moon follow it.
    const threshold = this.positions.every((p) => p.side < 0) ? 8 : 3;
    const moved = (a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 >= threshold ** 2;
    const samePlanet = planet && this.planet ? !moved(planet, this.planet) && Math.abs(planet.r - this.planet.r) < 1 : planet === this.planet;
    const unchanged = this.area && sameRect(area, this.area) && samePlanet && anchors.length === this.anchors.length && obstacles.length === this.obstacles.length &&
      obstacles.every((r, i) => sameRect(r, this.obstacles[i])) && anchors.every((a, i) => {
        const p = this.anchors[i];
        return a.slug === p.slug && a.want === p.want && Math.abs(a.radius - p.radius) < 1 && !moved(a, p);
      });
    if (unchanged) return this.positions;
    const previous = new Map(this.positions.map((p) => [p.slug, p.side]));
    this.area = { ...area };
    this.anchors = anchors.map((a) => ({ ...a }));
    this.obstacles = obstacles.map((r) => ({ ...r }));
    this.planet = planet ? { ...planet } : undefined;
    this.positions = layoutMoonLabels(anchors, area, obstacles, { planet, previous });
    return this.positions;
  }
}

const STYLE = `
.moon-annotation{position:absolute;display:flex;align-items:center;justify-content:center;gap:4px;height:44px;min-width:44px;padding:0 3px;border:0;border-radius:6px;background:none;color:var(--text-muted,#a1a1aa);font:400 12px/16px var(--font,"DM Sans",sans-serif);pointer-events:auto;cursor:pointer;touch-action:none;white-space:nowrap;transform:translate(-50%,-50%)}
.moon-annotation[hidden]{display:none}
.moon-annotation span{overflow:hidden;text-overflow:ellipsis;min-width:0;text-shadow:0 1px 4px var(--bg,#090909),0 -1px 4px var(--bg,#090909)}
.moon-annotation small{font-size:11px;opacity:.7;font-variant-numeric:tabular-nums}
.moon-annotation i,.is-compact .moon-annotation>*{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.moon-annotation:hover,.moon-annotation[aria-pressed=true]{color:var(--text,#f4f4f5)}
.moon-annotation:focus-visible{outline:1px solid var(--text,#f4f4f5);outline-offset:-5px;background:var(--surface,#18181b)}
.is-compact .moon-annotation{border-radius:50%}
.is-compact .moon-annotation:focus-visible{background:none}
.moon-callout{position:absolute;box-sizing:border-box;padding:3px 10px;border:1px solid var(--border-strong,rgba(161,161,170,.32));border-radius:999px;background:var(--surface,#18181b);color:var(--text,#f4f4f5);font:500 12px/16px var(--font,"DM Sans",sans-serif);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;transform:translate(-50%,-50%)}
.moon-callout small{margin-left:6px;font-size:11px;opacity:.7;font-variant-numeric:tabular-nums}`;

/** Native text stays sharp without a texture, and 44px targets remain keyboard accessible.
 *  Where the names do not fit (moonLabelsCompact), each moon keeps its target and only the
 *  chosen moon, and the one under the pointer or the keyboard focus, shows its name. */
export class MoonLabels {
  readonly root = document.createElement("div");
  private readonly lines = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  private readonly names = new Map<string, MoonName>();
  private readonly wants = new Map<string, number>();
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly paths = new Map<string, SVGPathElement>();
  private readonly pathData = new Map<string, string>();
  private readonly layout = new MoonLabelLayout();
  private readonly bySlug = new Map<string, MoonAnchor>();
  private readonly selectedCallout = this.callout();
  private readonly hoverCallout = this.callout();
  private positions: MoonLabelPosition[] = [];
  private area: Rect | null = null;
  private compact = false;
  private selected: string | null = null;
  private hovered: string | null = null;
  private down: { x: number; y: number; pointerId: number } | null = null;
  private dragged = false;

  constructor(names: readonly MoonName[], private readonly pick: (slug: string) => void, private readonly hover: (slug: string | null) => void, canvas: HTMLCanvasElement) {
    this.root.className = "moon-annotations";
    this.root.style.cssText = "position:absolute;inset:0;z-index:4;pointer-events:none;overflow:hidden";
    this.lines.style.cssText = "position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none";
    this.lines.setAttribute("aria-hidden", "true");
    this.root.append(this.lines);
    const style = document.createElement("style");
    style.textContent = STYLE;
    this.root.append(style);
    for (const name of names) {
      this.names.set(name.slug, name);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "moon-annotation";
      button.dataset.moon = name.slug;
      button.setAttribute("aria-pressed", "false");
      button.title = `${name.name} · ${name.count} ${name.unit}`;
      // The button's name is its text: the district, its count, and the unit for screen readers.
      const text = document.createElement("span"); text.textContent = name.name;
      const count = document.createElement("small"); count.textContent = String(name.count);
      const unit = document.createElement("i"); unit.textContent = ` ${name.unit}`;
      count.append(unit);
      button.append(text, count);
      button.addEventListener("click", (e) => {
        // Invisible touch targets may overlap in a dense map: select the name
        // nearest the pointer, while keyboard activation uses the focused button.
        if (e.detail && this.dragged) return;
        const slug = e.detail ? this.nearest(e.clientX, e.clientY) ?? name.slug : name.slug;
        this.pick(slug);
      });
      button.addEventListener("focus", () => this.hover(name.slug));
      button.addEventListener("blur", () => this.hover(null));
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("fill", "none");path.setAttribute("stroke", "currentColor");path.setAttribute("stroke-width", ".7");
      path.style.cssText = "color:var(--text-muted,#a1a1aa);opacity:.3";
      this.paths.set(name.slug, path);this.lines.append(path);
      this.buttons.set(name.slug, button);this.root.append(button);
    }
    this.root.append(this.selectedCallout, this.hoverCallout);
    this.remeasure();
    // An annotation can start an orbit gesture too. Transfer the captured pointer
    // to the canvas after the tap threshold; tiny names never block the scene.
    this.root.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !(e.target instanceof Element)) return;
      this.dragged = false;
      this.down = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
      e.target.closest("button")?.setPointerCapture(e.pointerId);
    });
    this.root.addEventListener("pointermove", (e) => {
      const d = this.down;
      if (d && d.pointerId === e.pointerId && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) {
        this.down = null;this.dragged = true;this.hover(null);
        const init = { pointerId: e.pointerId, pointerType: e.pointerType, isPrimary: e.isPrimary, button: 0, buttons: e.buttons, clientX: d.x, clientY: d.y, cancelable: true };
        canvas.dispatchEvent(new PointerEvent("pointerdown", init));
        canvas.dispatchEvent(new PointerEvent("pointermove", { ...init, clientX: e.clientX, clientY: e.clientY }));
      } else if (!e.buttons) this.hover(this.nearest(e.clientX, e.clientY));
    });
    this.root.addEventListener("pointerup", () => { this.down = null; });
    this.root.addEventListener("pointercancel", () => { this.down = null; });
    this.root.addEventListener("wheel", (e) => {
      e.preventDefault();
      canvas.dispatchEvent(new WheelEvent("wheel", { deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode, clientX: e.clientX, clientY: e.clientY, ctrlKey: e.ctrlKey, cancelable: true }));
    }, { passive: false });
    this.root.addEventListener("pointerleave", () => this.hover(null));
  }

  private callout(): HTMLDivElement {
    const el = document.createElement("div");
    el.className = "moon-callout";
    el.setAttribute("aria-hidden", "true");
    el.hidden = true;
    el.append(document.createElement("span"), document.createElement("small"));
    return el;
  }

  private nearest(clientX: number, clientY: number): string | null {
    const rect = this.root.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    let distance = Infinity, slug: string | null = null;
    for (const p of this.positions) {
      if (Math.abs(x - p.x) > Math.max(22, p.width / 2) || Math.abs(y - p.y) > 22) continue;
      const d = (x - p.x) ** 2 + (y - p.y) ** 2;
      if (d < distance) {distance = d;slug = p.slug;}
    }
    return slug;
  }

  /** Measures every name in the page's font (again once that font has loaded). */
  remeasure(): void {
    const [, ctx] = cpuCanvas(1, 1);
    const family = fontFamily();
    for (const name of this.names.values()) {
      ctx.font = `400 12px ${family}`;
      const text = ctx.measureText(name.name).width;
      ctx.font = `400 11px ${family}`;
      // The name, the gap, the count, the button's padding, and a pixel for rounding.
      this.wants.set(name.slug, Math.ceil(text + 4 + ctx.measureText(String(name.count)).width + 6 + 1));
    }
  }

  setSelected(slug: string | null): void {
    if (this.selected === slug) return;
    this.selected = slug;
    for (const [key, button] of this.buttons) button.setAttribute("aria-pressed", String(key === slug));
    this.placeCallouts();
  }

  /** The moon under the pointer or the keyboard focus. */
  setHovered(slug: string | null): void {
    if (this.hovered === slug) return;
    this.hovered = slug;
    this.placeCallouts();
  }

  update(anchors: readonly MoonAnchor[], area: Rect, obstacles: readonly Rect[], planet?: Disc): void {
    const compact = moonLabelsCompact(anchors.length, area);
    if (compact !== this.compact) {
      this.compact = compact;
      this.root.classList.toggle("is-compact", compact);
      this.positions = [];
    }
    this.area = area;
    for (const a of anchors) this.bySlug.set(a.slug, a);
    const positions = compact
      ? anchors.map((a) => ({ slug: a.slug, x: a.x, y: a.y, width: MOON_LABEL.target, side: -1 }))
      : this.layout.update(anchors.map((a) => ({ ...a, want: this.wants.get(a.slug) })), area, obstacles, planet);
    const moved = this.positions !== positions;
    this.positions = positions;
    const placed = new Set<string>();
    for (const p of positions) {
      placed.add(p.slug);
      const x = Math.round(p.x), y = Math.round(p.y);
      if (moved) {
        const button = this.buttons.get(p.slug)!;
        button.hidden = false;button.style.left = `${x}px`;button.style.top = `${y}px`;button.style.width = `${p.width}px`;
      }
      // A leader line from the moon to its name, when the name stands away from it.
      const a = this.bySlug.get(p.slug)!;
      let d = "";
      if (!compact) {
        const nx = clamp(a.x, p.x - p.width / 2, p.x + p.width / 2), ny = clamp(a.y, p.y - MOON_LABEL.height / 2, p.y + MOON_LABEL.height / 2);
        const from = leaderStart(a, nx, ny, planet);
        if (from) d = `M${Math.round(from.x)},${Math.round(from.y)}L${Math.round(nx)},${Math.round(ny)}`;
      }
      if (this.pathData.get(p.slug) !== d) { this.pathData.set(p.slug, d);this.paths.get(p.slug)!.setAttribute("d", d); }
    }
    if (moved) {
      for (const [slug, button] of this.buttons) {
        if (placed.has(slug)) continue;
        button.hidden = true;
        if (this.pathData.get(slug)) { this.pathData.set(slug, "");this.paths.get(slug)!.setAttribute("d", ""); }
      }
    }
    this.placeCallouts();
  }

  private placeCallouts(): void {
    this.placeCallout(this.selectedCallout, this.selected);
    this.placeCallout(this.hoverCallout, this.hovered === this.selected ? null : this.hovered);
  }

  /** The chosen moon's whole name, above it (below when there is no room above), kept inside the scene. */
  private placeCallout(el: HTMLDivElement, slug: string | null): void {
    const name = slug ? this.names.get(slug) : undefined;
    const a = slug ? this.bySlug.get(slug) : undefined;
    const area = this.area;
    if (!this.compact || !name || !a || !area) {
      el.hidden = true;
      return;
    }
    if (el.dataset.moon !== name.slug) {
      el.dataset.moon = name.slug;
      el.firstElementChild!.textContent = name.name;
      el.lastElementChild!.textContent = String(name.count);
    }
    const width = Math.min((this.wants.get(name.slug) ?? MOON_LABEL.want) + 24, area.r - area.l);
    const above = a.y - a.radius - 18;
    el.style.left = `${Math.round(clamp(a.x, area.l + width / 2, area.r - width / 2))}px`;
    el.style.top = `${Math.round(above - 12 >= area.t ? above : a.y + a.radius + 18)}px`;
    el.style.maxWidth = `${width}px`;
    el.hidden = false;
  }

  dispose(): void {this.root.remove();}
}
