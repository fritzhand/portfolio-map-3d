/* Everything the 3D scene shows as a picture is painted here, on CPU-backed canvases
   (cpuCanvas.ts): each world's surface, the labels, the core's glow and the nebula behind
   everything. No image, font or model is fetched for the scene; labels use the page's own
   font once it has loaded (falling back to system-ui), and a world's logo only from the
   Nexus's own origin. */
import { inkOn, mix, muted } from "../lib/color.ts";
import { fnv1a, seeded } from "../lib/hash.ts";
import { MARK, type Point } from "../lib/mark.ts";
import { planBands, planDots, type SurfaceCompany, type SurfaceDistrict } from "../lib/surface.ts";

export const FONT_FAMILY = '"DM Sans", system-ui, sans-serif';
export const HEADING_FONT_FAMILY = '"Instrument Sans", system-ui, sans-serif';

export function fontFamily(heading = false): string {
  if (typeof document === "undefined") return heading ? HEADING_FONT_FAMILY : FONT_FAMILY;
  const css = getComputedStyle(document.documentElement);
  return (heading ? css.getPropertyValue("--font-heading") || css.getPropertyValue("--heading") : css.getPropertyValue("--font")).trim() || (heading ? HEADING_FONT_FAMILY : FONT_FAMILY);
}

export interface PaintTheme {
  dark: boolean;
  background: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
}

export function paintTheme(): PaintTheme {
  const fallback = { dark: true, background: "#090909", surface: "#18181b", border: "rgba(161,161,170,.32)", text: "#f4f4f5", muted: "#a1a1aa" };
  if (typeof document === "undefined") return fallback;
  const css = getComputedStyle(document.documentElement);
  const token = (name: string, value: string) => css.getPropertyValue(name).trim() || value;
  const dark = css.colorScheme.includes("dark");
  return {
    dark,
    background: dark ? token("--bg-deep", token("--bg", fallback.background)) : token("--bg", "#fafafa"),
    surface: token("--surface", fallback.surface),
    border: token("--border-strong", fallback.border),
    text: token("--text", fallback.text),
    muted: token("--text-muted", fallback.muted),
  };
}

const SPACE = "#09090b";

/* ---------- World surfaces ---------- */

export interface SurfaceInput {
  id: string;
  accent: string;
  districts: SurfaceDistrict[];
  companies: SurfaceCompany[];
  /** Unreachable at the last check: muted colors. */
  dim: boolean;
}

/**
 * A world's surface, equirectangular: its districts as wavy bands proportional to their
 * company counts (surface.ts), faint streaks, and a light dot for every company in its
 * district's band.
 */
export function paintSurface(ctx: CanvasRenderingContext2D, w: number, h: number, input: SurfaceInput): void {
  const rand = seeded(fnv1a(`surface:${input.id}`));
  const tone = (c: string) => (input.dim ? muted(c, 0.7, 0.55) : c);
  const bands = planBands(input.districts);

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = tone(mix(input.accent, SPACE, 0.55));
  ctx.fillRect(0, 0, w, h);

  // Band edges wave gently; the waves repeat a whole number of times around, so the seam is invisible.
  const thickness = bands.map((b) => (b.v1 - b.v0) * h);
  const waves = bands.map((_, i) => {
    const room = Math.min(thickness[i - 1] ?? Infinity, thickness[i] ?? Infinity);
    return { k: 2 + Math.floor(rand() * 3), phase: rand() * Math.PI * 2, amp: Math.min(h * (0.008 + rand() * 0.012), room * 0.3) };
  });
  const edge = (i: number, x: number) => {
    if (i <= 0) return -1;
    if (i >= bands.length) return h + 1;
    const wv = waves[i];
    return bands[i].v0 * h + wv.amp * Math.sin((x / w) * Math.PI * 2 * wv.k + wv.phase);
  };
  const step = w / 96;
  bands.forEach((b, i) => {
    ctx.beginPath();
    ctx.moveTo(0, edge(i, 0));
    for (let x = step; x <= w + 0.01; x += step) ctx.lineTo(x, edge(i, x));
    for (let x = w; x >= -0.01; x -= step) ctx.lineTo(x, edge(i + 1, x));
    ctx.closePath();
    ctx.fillStyle = tone(b.color);
    ctx.fill();
  });

  // Streaks: thin light and dark currents across the bands.
  const lineScale = h / 256;
  for (let s = 0; s < 34; s++) {
    const y0 = rand() * h;
    const k = 1 + Math.floor(rand() * 3);
    const phase = rand() * Math.PI * 2;
    const amp = (1 + rand() * 4) * lineScale;
    ctx.beginPath();
    for (let x = 0; x <= w + 0.01; x += step) {
      const y = y0 + amp * Math.sin((x / w) * Math.PI * 2 * k + phase);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rand() < 0.55 ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.16)";
    ctx.lineWidth = (0.6 + rand() * 2.6) * lineScale;
    ctx.stroke();
  }

  // Poles darken a little, so the texture's pinch there does not draw the eye.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "rgba(9,9,11,0.45)");
  g.addColorStop(0.16, "rgba(9,9,11,0)");
  g.addColorStop(0.84, "rgba(9,9,11,0)");
  g.addColorStop(1, "rgba(9,9,11,0.45)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // A light for each company, round on the sphere (stretched across the texture near the poles).
  const r = Math.max(1.1, h / 115);
  const core = input.dim ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.95)";
  const halo = input.dim ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.22)";
  for (const d of planDots(input.companies, bands)) {
    const x = d.u * w;
    const y = d.v * h;
    const stretch = Math.min(4, 1 / Math.max(0.25, Math.sin(Math.PI * d.v)));
    for (const dx of x < r * 8 ? [0, w] : x > w - r * 8 ? [0, -w] : [0]) {
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.ellipse(x + dx, y, r * 2.4 * stretch, r * 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.ellipse(x + dx, y, r * stretch, r, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/* ---------- Labels ---------- */

export interface LabelContent {
  title: string;
  subtitle: string;
  accent: string;
  initials: string;
  logo: HTMLImageElement | null;
  /** Unreachable at the last check: the subtitle says so, in amber. */
  dim: boolean;
  /** Draw the Nexus mark instead of initials (the core's label). */
  mark?: boolean;
  /** The badge alone on a round plate: what a world shows where its whole label does not fit. */
  chip?: boolean;
}

/** A label's layout in logical pixels (the canvas is `scale` times larger). */
export const LABEL = { height: 96, pad: 16, badge: 62, gap: 14, title: 32, subtitle: 23, maxText: 440 } as const;

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid).trimEnd()}…`).width <= max) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo).trimEnd()}…`;
}

const titleFont = (s: number) => `600 ${LABEL.title * s}px ${fontFamily(true)}`;
const subtitleFont = (s: number) => `400 ${LABEL.subtitle * s}px ${fontFamily()}`;

/** The canvas size a label needs at `scale`. */
export function labelSize(ctx: CanvasRenderingContext2D, c: LabelContent, scale: number): { w: number; h: number } {
  const h = Math.ceil((LABEL.height * scale) / 4) * 4;
  if (c.chip) return { w: h, h };
  ctx.font = titleFont(scale);
  const tw = ctx.measureText(fitText(ctx, c.title, LABEL.maxText * scale)).width;
  ctx.font = subtitleFont(scale);
  const sw = ctx.measureText(fitText(ctx, c.subtitle, LABEL.maxText * scale)).width;
  const w = (LABEL.pad + LABEL.badge + LABEL.gap + LABEL.pad * 1.3) * scale + Math.max(tw, sw);
  // Whole multiples of 4 keep texture rows aligned.
  return { w: Math.ceil(w / 4) * 4, h };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The Nexus mark (lib/mark.ts, the drawing of Icons.tsx Mark): the core as an icon, centered
    at (cx, cy), `r` half its width. */
export function drawMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const k = r / 32;
  const trace = (points: readonly Point[]) => {
    ctx.beginPath();
    for (const [x, y] of points) ctx.lineTo(cx + (x - 32) * k, cy + (y - 32) * k);
    ctx.closePath();
  };
  const { rx, ry, tilt } = MARK.ring;
  // The ring from its right end clockwise: to Math.PI is its near half, to 2 * Math.PI all of it.
  const ring = (end: number) => {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * k, ry * k, (tilt * Math.PI) / 180, 0, end);
    ctx.strokeStyle = "#3be8ff";
    ctx.lineWidth = 3 * k;
    ctx.stroke();
  };
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  glow.addColorStop(0, "rgba(138, 242, 255, 0.6)");
  glow.addColorStop(0.45, "rgba(59, 232, 255, 0.16)");
  glow.addColorStop(0.8, "rgba(157, 123, 255, 0.07)");
  glow.addColorStop(1, "rgba(157, 123, 255, 0)");
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  // The whole ring, the cage, the crystal over them, then the ring's near half again.
  ring(Math.PI * 2);
  ctx.strokeStyle = "rgba(157, 123, 255, 0.85)";
  ctx.lineWidth = 1.8 * k;
  trace(MARK.cage);
  ctx.stroke();
  trace(MARK.struts);
  ctx.stroke();
  const crystal = ctx.createLinearGradient(cx, cy - 14 * k, cx, cy + 14 * k);
  crystal.addColorStop(0, "rgba(127, 243, 255, 0.9)");
  crystal.addColorStop(1, "rgba(10, 26, 70, 0.95)");
  trace(MARK.crystal);
  ctx.fillStyle = crystal;
  ctx.fill();
  ctx.strokeStyle = "#3be8ff";
  ctx.lineWidth = 3 * k;
  ctx.stroke();
  trace(MARK.facet);
  ctx.strokeStyle = "#dcfaff";
  ctx.lineWidth = 2.2 * k;
  ctx.stroke();
  ring(Math.PI);
  ctx.restore();
}

/** Paints a label on a canvas already sized by labelSize(). */
export function paintLabel(ctx: CanvasRenderingContext2D, w: number, h: number, c: LabelContent, scale: number): void {
  const s = scale;
  const theme = paintTheme();
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  const inset = 2 * s;
  roundRect(ctx, inset, inset, w - inset * 2, h - inset * 2, (h - inset * 2) / 2);
  ctx.fillStyle = theme.surface;
  ctx.fill();
  ctx.lineWidth = 1.5 * s;
  ctx.strokeStyle = c.dim ? "rgba(255, 210, 127, 0.35)" : theme.border;
  ctx.stroke();

  // The badge: the logo on a light plate, the Nexus mark, or initials on the accent.
  const br = (LABEL.badge * s) / 2;
  const bx = c.chip ? w / 2 : LABEL.pad * s + br;
  const by = h / 2;
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  if (c.mark) {
    ctx.fillStyle = "#0b1636";
    ctx.fill();
    drawMark(ctx, bx, by, br * 0.92);
  } else if (c.logo && c.logo.naturalWidth > 0) {
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.save();
    ctx.clip();
    const box = br * 1.42;
    const k = Math.min(box / c.logo.naturalWidth, box / c.logo.naturalHeight);
    const lw = c.logo.naturalWidth * k;
    const lh = c.logo.naturalHeight * k;
    ctx.drawImage(c.logo, bx - lw / 2, by - lh / 2, lw, lh);
    ctx.restore();
  } else {
    ctx.fillStyle = c.dim ? muted(c.accent, 0.6, 0.7) : c.accent;
    ctx.fill();
    ctx.fillStyle = inkOn(c.dim ? muted(c.accent, 0.6, 0.7) : c.accent);
    ctx.font = `700 ${(c.initials.length > 1 ? 24 : 28) * s}px ${FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(c.initials, bx, by + 1 * s);
  }
  if (c.chip) {
    ctx.restore();
    return;
  }

  // Name and counts.
  const tx = (LABEL.pad + LABEL.badge + LABEL.gap) * s;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = titleFont(s);
  ctx.fillStyle = theme.text;
  ctx.fillText(fitText(ctx, c.title, LABEL.maxText * s), tx, h / 2 + (c.subtitle ? -2 : 11) * s);
  ctx.font = subtitleFont(s);
  ctx.fillStyle = c.dim ? "#ffd27f" : theme.muted;
  ctx.fillText(fitText(ctx, c.subtitle, LABEL.maxText * s), tx, h / 2 + 26 * s);
  ctx.restore();
}

/* ---------- Light and space ---------- */

/** A soft radial glow (white center into the given colors), for additive sprites. */
export function paintGlow(ctx: CanvasRenderingContext2D, size: number, stops: [number, string][]): void {
  ctx.clearRect(0, 0, size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

/**
 * The sky behind everything, equirectangular: deep space with soft violet, blue and teal
 * clouds, and a faint band of light across it. Seeded, so it is the same on every visit.
 */
export function paintNebula(ctx: CanvasRenderingContext2D, w: number, h: number, theme = paintTheme()): void {
  const rand = seeded(20261009);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, w, h);
  const blob = (x: number, y: number, r: number, color: string) => {
    for (const dx of [-w, 0, w]) {
      const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x + dx - r, y - r, r * 2, r * 2);
    }
  };
  const hues = ["rgba(110, 110, 118, A)", "rgba(90, 90, 98, A)", "rgba(100, 100, 104, A)", "rgba(120, 120, 128, A)"];
  ctx.globalCompositeOperation = theme.dark ? "lighter" : "multiply";
  // The band: many soft clouds along a gentle wave.
  for (let i = 0; i < 70; i++) {
    const u = rand();
    const y = h * (0.5 + 0.16 * Math.sin(u * Math.PI * 2 + 0.7)) + (rand() - 0.5) * h * 0.12;
    blob(u * w, y, h * (0.05 + rand() * 0.12), hues[Math.floor(rand() * hues.length)].replace("A", (0.06 + rand() * 0.08).toFixed(3)));
  }
  // Larger, fainter clouds anywhere.
  for (let i = 0; i < 14; i++) {
    blob(rand() * w, h * (0.15 + rand() * 0.7), h * (0.18 + rand() * 0.25), hues[Math.floor(rand() * hues.length)].replace("A", (0.05 + rand() * 0.07).toFixed(3)));
  }
  // Faint far stars, painted into the sky for depth.
  for (let i = 0; i < 900; i++) {
    const y = h * (0.06 + rand() * 0.88);
    ctx.fillStyle = theme.dark ? `rgba(220, 230, 255, ${(0.08 + rand() * 0.32).toFixed(2)})` : `rgba(63, 63, 70, ${(0.04 + rand() * 0.15).toFixed(2)})`;
    ctx.fillRect(rand() * w, y, 1, 1);
  }
  ctx.globalCompositeOperation = "source-over";
}
