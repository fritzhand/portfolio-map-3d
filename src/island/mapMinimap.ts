/* The minimap: a north-up (-z up) plan of the island in the top-right corner, drawn once from the
   plan (the island, its hills, the town, the roads, each district in its color with a short mark,
   and the Nexus portal), with your arrow moved over it every frame. A click or tap hops to the
   place nearest it (a district, the portal or the plaza), if one is close, and the place under the
   pointer is ringed; on a small map the portal's and the plaza's marks nearly touch, so the pointer
   goes by distance, not by whose button is on top. Each place also has a button for the keyboard
   and screen readers. The map folds away with its toggle, and remembers that. */
import { cpuContext } from "../three/cpuCanvas";
import { GROUND_COLORS, coveSand, islandHeight, townRadius } from "./mapGround";
import { inkOn, mapMarks } from "./mapLabels";
import { MONUMENT_PAD, NEXUS_COLORS, PORTAL_R, ROAD_W, arrowTurn, mapFrame, nearestHop, type HopTarget, type MapFrame, type MapPlan } from "./mapLayout";

export interface Minimap {
  el: HTMLElement;
  /** Where the kid is, and which way it faces (its theta). */
  update(x: number, z: number, theta: number): void;
  /** Ring the district (or other hop target) the kid is in, or none. */
  setCurrent(id: string | null): void;
}

const OPEN_KEY = "island-minimap-open";
const NARROW = "(max-width: 760px)";

function remembered(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

function remember(open: boolean) {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    /* private window or blocked storage: the map just opens next time */
  }
}

function drawIsland(ctx: CanvasRenderingContext2D, plan: MapPlan, frame: MapFrame, marks: Map<string, string>) {
  const S = frame.size;
  const s = S / 2 / frame.extent;
  const [cx, cy] = frame.toMap(0, 0);
  const disc = (x: number, z: number, r: number) => {
    const [px, py] = frame.toMap(x, z);
    ctx.beginPath();
    ctx.arc(px, py, Math.max(0.5, r * s), 0, Math.PI * 2);
  };
  ctx.fillStyle = GROUND_COLORS.sea;
  ctx.fillRect(0, 0, S, S);
  disc(0, 0, plan.island.water + 2);
  ctx.fillStyle = GROUND_COLORS.sand;
  ctx.fill();
  disc(0, 0, plan.island.land);
  ctx.fillStyle = GROUND_COLORS.grass;
  ctx.fill();

  // Hills, darker the higher the ground, and the coves' sand, sampled every 3 pixels.
  const cell = 3;
  for (let py = 0; py < S; py += cell) {
    for (let px = 0; px < S; px += cell) {
      const w = frame.toWorld(px + cell / 2, py + cell / 2);
      if (Math.hypot(w.x, w.z) > plan.island.land - 1) continue;
      const sand = coveSand(plan, w.x, w.z);
      if (sand > 0.3) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = GROUND_COLORS.sand;
        ctx.fillRect(px, py, cell, cell);
        continue;
      }
      const h = islandHeight(plan, w.x, w.z);
      if (h < 1.6) continue;
      ctx.globalAlpha = Math.min(0.55, (h - 1.6) / 9);
      ctx.fillStyle = GROUND_COLORS.hill;
      ctx.fillRect(px, py, cell, cell);
    }
  }
  ctx.globalAlpha = 1;

  // The ring street and the roads, then the plaza and the monument.
  ctx.strokeStyle = GROUND_COLORS.road;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1.5, plan.street.width * s);
  ctx.beginPath();
  ctx.arc(cx, cy, plan.street.r * s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = Math.max(1.5, ROAD_W * s);
  for (const r of plan.spokes) {
    const [ax, ay] = frame.toMap(r.ax, r.az);
    const [bx, by] = frame.toMap(r.bx, r.bz);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  disc(0, 0, plan.plaza.r);
  ctx.fillStyle = GROUND_COLORS.plaza;
  ctx.fill();
  disc(0, 0, townRadius(plan));
  ctx.lineWidth = 0.75;
  ctx.strokeStyle = GROUND_COLORS.plazaLine;
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
  disc(0, 0, MONUMENT_PAD * 0.45);
  ctx.fillStyle = GROUND_COLORS.stone;
  ctx.fill();

  // Districts: a disc in its color, ringed in white, with its mark.
  const fontPx = Math.max(8, Math.round(S / 19));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const c of plan.clusters) {
    disc(c.cx, c.cz, c.r + 3);
    ctx.fillStyle = c.color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    const mark = marks.get(c.slug) ?? "";
    const [px, py] = frame.toMap(c.cx, c.cz);
    ctx.font = `700 ${mark.length > 2 ? fontPx - 2 : fontPx}px "Instrument Sans", system-ui, sans-serif`;
    ctx.fillStyle = inkOn(c.color);
    ctx.fillText(mark, px, py + 0.5);
  }

  // The Nexus portal: a ring in the network's colors.
  const [qx, qy] = frame.toMap(plan.portal.x, plan.portal.z);
  const qr = Math.max(3.2, PORTAL_R * s + 1);
  ctx.beginPath();
  ctx.arc(qx, qy, qr, 0, Math.PI * 2);
  ctx.fillStyle = NEXUS_COLORS.violet;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = NEXUS_COLORS.cyan;
  ctx.stroke();
}

export function buildMinimap(plan: MapPlan, targets: readonly HopTarget[], opts: { title: string; hopLabel: (t: HopTarget) => string; onHop: (t: HopTarget) => void }): Minimap {
  const el = document.createElement("section");
  el.className = "walk-minimap island-minimap";
  el.setAttribute("aria-label", opts.title);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "walk-minimap-toggle";
  toggle.innerHTML = `<span></span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
  toggle.querySelector("span")!.textContent = opts.title;
  const body = document.createElement("div");
  body.className = "walk-minimap-body";
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  const arrow = document.createElement("div");
  arrow.className = "island-minimap-you";
  arrow.innerHTML = `<svg viewBox="-8 -8 16 16" width="16" height="16" aria-hidden="true"><path d="M0 -6.5 L5 5.5 L0 3 L-5 5.5 Z"/></svg>`;
  body.append(canvas);
  el.append(toggle, body);

  const markList = mapMarks(plan.clusters.map((c) => c.short));
  const marks = new Map(plan.clusters.map((c, i) => [c.slug, markList[i]]));
  let frame: MapFrame = mapFrame(plan, 172);
  let hits: Array<{ target: HopTarget; button: HTMLButtonElement }> = [];
  let current: string | null = null;

  const setOpen = (open: boolean) => {
    body.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    el.classList.toggle("is-closed", !open);
  };
  toggle.addEventListener("click", () => {
    const open = body.hidden;
    setOpen(open);
    remember(open);
  });
  setOpen(remembered());

  const layout = () => {
    const size = window.matchMedia?.(NARROW).matches ? 120 : 172;
    frame = mapFrame(plan, size);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = canvas.height = Math.round(size * dpr);
    canvas.style.width = canvas.style.height = `${size}px`;
    const ctx = cpuContext(canvas);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawIsland(ctx, plan, frame, marks);
    for (const h of hits) h.button.remove();
    const s = size / 2 / frame.extent;
    // Smaller targets last, so they sit on top where two overlap.
    hits = targets
      .slice()
      .sort((a, b) => b.r - a.r)
      .map((target) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `walk-minimap-hit island-minimap-hit is-${target.kind}`;
        const label = opts.hopLabel(target);
        button.setAttribute("aria-label", label);
        button.title = label;
        const d = Math.max(target.kind === "district" ? 22 : 16, (target.kind === "district" ? target.r + 3 : target.r) * 2 * s + 4);
        const [px, py] = frame.toMap(target.x, target.z);
        button.style.width = button.style.height = `${d}px`;
        button.style.left = `${px - d / 2}px`;
        button.style.top = `${py - d / 2}px`;
        button.style.setProperty("--d", target.color);
        button.classList.toggle("is-current", target.id === current);
        // Keyboard activation; pointer clicks pass through to the map (island.css) and go by distance.
        button.addEventListener("click", (e) => {
          e.stopPropagation();
          opts.onHop(target);
        });
        body.append(button);
        return { target, button };
      });
    body.append(arrow);
  };
  layout();
  window.matchMedia?.(NARROW).addEventListener?.("change", layout);

  // The pointer goes by distance: the nearest place under it is ringed, and a click hops there.
  const under = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    const w = frame.toWorld(e.clientX - r.left, e.clientY - r.top);
    return nearestHop(targets, w.x, w.z, 14);
  };
  let hover: HTMLButtonElement | null = null;
  const setHover = (t: HopTarget | null) => {
    const b = t ? (hits.find((h) => h.target === t)?.button ?? null) : null;
    if (b === hover) return;
    hover?.classList.remove("is-hover");
    b?.classList.add("is-hover");
    hover = b;
  };
  body.addEventListener("pointermove", (e) => setHover(under(e)));
  body.addEventListener("pointerleave", () => setHover(null));
  body.addEventListener("click", (e) => {
    const t = under(e);
    if (t) opts.onHop(t);
  });

  let last = "";
  return {
    el,
    update(x, z, theta) {
      if (body.hidden) return;
      const [px, py] = frame.toMap(x, z);
      const turn = (arrowTurn(theta) * 180) / Math.PI;
      const key = `${px.toFixed(1)},${py.toFixed(1)},${turn.toFixed(0)}`;
      if (key === last) return;
      last = key;
      arrow.style.transform = `translate(${(px - 8).toFixed(1)}px,${(py - 8).toFixed(1)}px) rotate(${turn.toFixed(1)}deg)`;
    },
    setCurrent(id) {
      if (id === current) return;
      current = id;
      for (const h of hits) h.button.classList.toggle("is-current", h.target.id === id);
    },
  };
}
