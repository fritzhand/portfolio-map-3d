/* The minimap: a north-up (-z up) plan of the island. The static layer —
   shore, plaza, roads, district discs in their colors (the People area in
   the person color), a dot per company and per person —
   is drawn once; the live layer (your arrow and view wedge, other explorers
   as dots in their outfit color) is redrawn a few times a second. */
import { hubBeacon, hubFootprints } from "../../data/hub";
import { PLAZA_RADIUS, ROAD_WIDTH, VILLAGE, type WorldLayout } from "../../data/layout";
import { HOUSE_LOT, lotsFor } from "./village";
import { cpuCanvas, cpuContext } from "../../three/cpuCanvas";
import type { ScenePalette } from "./palette";
import type { Terrain } from "./terrain";

export interface MapPoint {
  x: number;
  z: number;
}

export class Minimap {
  private readonly bg: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly extent: number;
  private readonly dpr: number;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly size: number,
    private readonly layout: WorldLayout,
    private readonly terrain: Terrain,
    private readonly districts: readonly { slug: string; color: string }[],
    private readonly pins: { xs: Float32Array; zs: Float32Array; colorOf: (i: number) => string },
    p: ScenePalette,
  ) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.extent = layout.islandRadius + 10;
    canvas.width = canvas.height = Math.round(size * this.dpr);
    this.ctx = canvas.getContext("2d")!;
    // The static layer is drawn once and copied every redraw; CPU-backed so a GPU loss cannot blank it.
    [this.bg] = cpuCanvas(canvas.width, canvas.width);
    this.drawStatic(layout, terrain, districts, pins, p);
  }

  /** World (x, z) to minimap CSS pixels. */
  toMap(x: number, z: number): [number, number] {
    const h = this.size / 2;
    return [h + (x / this.extent) * h, h + (z / this.extent) * h];
  }

  /** Minimap CSS pixels to world (x, z). */
  toWorld(px: number, py: number): MapPoint {
    const h = this.size / 2;
    return { x: ((px - h) / h) * this.extent, z: ((py - h) / h) * this.extent };
  }

  get scale(): number {
    return this.size / 2 / this.extent;
  }

  setPalette(palette: ScenePalette): void {
    this.drawStatic(this.layout, this.terrain, this.districts, this.pins, palette);
  }

  private drawStatic(layout: WorldLayout, terrain: Terrain, districts: readonly { slug: string; color: string }[], pins: { xs: Float32Array; zs: Float32Array; colorOf: (i: number) => string }, p: ScenePalette) {
    const c = cpuContext(this.bg);
    c.setTransform(1, 0, 0, 1, 0, 0);
    const k = this.dpr;
    c.scale(k, k);
    const S = this.size;
    const css = p.css;
    c.fillStyle = css.sea;
    c.fillRect(0, 0, S, S);

    // Island: sand ring, then grass inside the beach.
    const shore = (inset: number) => {
      c.beginPath();
      for (let i = 0; i <= 120; i++) {
        const a = (i / 120) * Math.PI * 2;
        const r = terrain.shoreAt(a) - inset;
        const [x, y] = this.toMap(Math.cos(a) * r, Math.sin(a) * r);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.closePath();
    };
    shore(-2);
    c.fillStyle = css.seaDeep;
    c.globalAlpha = 0.35;
    c.fill();
    c.globalAlpha = 1;
    shore(1);
    c.fillStyle = css.sand;
    c.fill();
    shore(9);
    c.fillStyle = css.grass;
    c.fill();

    const s = this.scale;
    // Roads.
    c.strokeStyle = css.road;
    c.lineWidth = Math.max(1.6, ROAD_WIDTH * s);
    c.lineCap = "round";
    for (const d of layout.discs) {
      const ux = Math.cos(d.angle);
      const uz = Math.sin(d.angle);
      const [x0, y0] = this.toMap(ux * PLAZA_RADIUS, uz * PLAZA_RADIUS);
      const [x1, y1] = this.toMap(d.x, d.z);
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
    }
    // The village's ring street, and its houses along the outside.
    {
      const [cx, cy] = this.toMap(0, 0);
      c.beginPath();
      c.arc(cx, cy, VILLAGE.streetR * s, 0, Math.PI * 2);
      c.lineWidth = Math.max(1.4, VILLAGE.streetWidth * s);
      c.strokeStyle = css.road;
      c.stroke();
      c.fillStyle = css.wallCream;
      for (const lot of lotsFor(layout).lots) {
        const [hx, hy] = this.toMap(lot.x, lot.z);
        const w = Math.max(1.6, HOUSE_LOT[lot.kind].w * s * 0.8);
        c.save();
        c.translate(hx, hy);
        c.rotate(-lot.rot);
        c.fillRect(-w / 2, -w * 0.3, w, w * 0.6);
        c.restore();
      }
    }
    // Districts.
    const byslug = new Map(districts.map((d) => [d.slug, d]));
    for (const d of layout.discs) {
      const color = byslug.get(d.slug)?.color ?? "#888888";
      const [x, y] = this.toMap(d.x, d.z);
      c.beginPath();
      c.arc(x, y, d.r * s, 0, Math.PI * 2);
      c.fillStyle = color;
      c.globalAlpha = 0.32;
      c.fill();
      c.globalAlpha = 1;
      c.lineWidth = 1.5;
      c.strokeStyle = color;
      c.stroke();
    }
    // Plaza and hub.
    const [px, py] = this.toMap(0, 0);
    c.beginPath();
    c.arc(px, py, PLAZA_RADIUS * s, 0, Math.PI * 2);
    c.fillStyle = css.plaza;
    c.fill();
    c.lineWidth = 1;
    c.strokeStyle = css.rock;
    c.stroke();
    // The hub as seen from above: the hall's roof, the upper volume and the entrance canopy.
    const fill: Record<string, string> = { hall: css.membrane, upper: css.roofWhite, canopy: css.fascia };
    for (const f of hubFootprints()) {
      c.beginPath();
      f.pts.forEach((q, i) => {
        const [x, y] = this.toMap(q.x, q.z);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      });
      c.closePath();
      c.fillStyle = fill[f.kind];
      c.fill();
      c.lineWidth = 0.75;
      c.strokeStyle = css.ink;
      c.globalAlpha = 0.45;
      c.stroke();
      c.globalAlpha = 1;
    }
    const b = hubBeacon();
    const [bx, by] = this.toMap(b.x, b.z);
    c.beginPath();
    c.arc(bx, by, 1.6, 0, Math.PI * 2);
    c.fillStyle = css.ink;
    c.fill();
    // Companies and people.
    for (let i = 0; i < pins.xs.length; i++) {
      const [x, y] = this.toMap(pins.xs[i], pins.zs[i]);
      c.beginPath();
      c.arc(x, y, 1.6, 0, Math.PI * 2);
      c.fillStyle = "#ffffff";
      c.fill();
      c.beginPath();
      c.arc(x, y, 1.05, 0, Math.PI * 2);
      c.fillStyle = pins.colorOf(i);
      c.fill();
    }
  }

  /** Redraw: static layer, then explorers and you. `heading` is rotation.y; `cameraYaw` the follow camera's orbit angle. */
  draw(me: { x: number; z: number; heading: number }, cameraYaw: number, others: { x: number; z: number; color: string }[], ink: string) {
    const c = this.ctx;
    const k = this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.drawImage(this.bg, 0, 0);
    c.setTransform(k, 0, 0, k, 0, 0);

    for (const o of others) {
      const [x, y] = this.toMap(o.x, o.z);
      c.beginPath();
      c.arc(x, y, 4.6, 0, Math.PI * 2);
      c.fillStyle = "#ffffff";
      c.fill();
      c.beginPath();
      c.arc(x, y, 3.3, 0, Math.PI * 2);
      c.fillStyle = o.color;
      c.fill();
    }

    const [mx, my] = this.toMap(me.x, me.z);
    // View wedge: where the camera looks.
    const look = Math.atan2(-Math.cos(cameraYaw), -Math.sin(cameraYaw));
    c.beginPath();
    c.moveTo(mx, my);
    c.arc(mx, my, 22, look - 0.5, look + 0.5);
    c.closePath();
    c.fillStyle = "rgba(255,255,255,0.35)";
    c.fill();
    // Arrow pointing along the heading (heading 0 faces +z, which is "down" on the map).
    const a = Math.atan2(Math.cos(me.heading), Math.sin(me.heading));
    c.save();
    c.translate(mx, my);
    c.rotate(a);
    c.beginPath();
    c.moveTo(7.5, 0);
    c.lineTo(-5, 5);
    c.lineTo(-2.5, 0);
    c.lineTo(-5, -5);
    c.closePath();
    c.fillStyle = ink;
    c.strokeStyle = "#ffffff";
    c.lineWidth = 2;
    c.lineJoin = "round";
    c.stroke();
    c.fill();
    c.restore();
  }
}
