// @ts-nocheck
/* What the plaza's screens show: the Walking times display (a row per district: the way to turn, its
   name on its color, the time on foot to its heart) and a signpost's blade. Painted once on CPU-backed
   canvases (src/three/cpuCanvas.ts), drawn unlit so they read as lit screens day and night. */
import { CanvasTexture, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { cpuCanvas } from '../three/cpuCanvas';
import { inkOn } from './mapLabels';
import type { BoardRow } from './mapLayout';

const FONT = '"Instrument Sans", system-ui, sans-serif';

function texture(canvas: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(canvas);
  (t as any).encoding = 3001;
  t.anisotropy = 4;
  return t;
}

/** An arrow pointing `bearing` radians right of straight on, centered at (x, y). */
function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, bearing: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(bearing);
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(s * 0.62, -s * 0.2);
  ctx.lineTo(s * 0.22, -s * 0.2);
  ctx.lineTo(s * 0.22, s);
  ctx.lineTo(-s * 0.22, s);
  ctx.lineTo(-s * 0.22, -s * 0.2);
  ctx.lineTo(-s * 0.62, -s * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** The Walking times screen as a plane w x h placed by `matrix`. */
export function walkingTimesMesh(title: string, rows: BoardRow[], matrix: Matrix4, w: number, h: number): Mesh {
  const W = 1024;
  const H = Math.round((W * h) / w);
  const [canvas, ctx] = cpuCanvas(W, H);
  ctx.fillStyle = '#111923';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.font = `650 46px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 40, 50);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(40, 88, W - 80, 2);
  const cols = rows.length > 6 ? 2 : 1;
  const perCol = Math.ceil(rows.length / cols);
  const rowH = Math.min(64, (H - 120) / Math.max(1, perCol));
  rows.forEach((r, i) => {
    const col = Math.floor(i / perCol);
    const x0 = 40 + col * ((W - 80) / cols);
    const y = 120 + rowH * (i % perCol) + rowH / 2;
    ctx.fillStyle = '#ffffff';
    arrow(ctx, x0 + 18, y, rowH * 0.3, r.bearing);
    ctx.font = `600 ${Math.round(rowH * 0.5)}px ${FONT}`;
    const name = r.text;
    const nw = Math.min(ctx.measureText(name).width, (W - 80) / cols - 190);
    ctx.fillStyle = r.color;
    const pillH = rowH * 0.72;
    ctx.beginPath();
    ctx.roundRect?.(x0 + 46, y - pillH / 2, nw + 28, pillH, pillH / 2);
    ctx.fill();
    ctx.fillStyle = inkOn(r.color);
    ctx.fillText(name, x0 + 60, y + 1, nw);
    ctx.fillStyle = '#cfd8e3';
    ctx.font = `500 ${Math.round(rowH * 0.46)}px ${FONT}`;
    ctx.fillText(`${r.seconds}s`, x0 + 46 + nw + 44, y + 1);
  });
  const mesh = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: texture(canvas), toneMapped: false }));
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(matrix);
  mesh.matrixWorldNeedsUpdate = true;
  return mesh;
}

/** A signpost's blade text (white on the screen), fitted into w x h. */
export function bladeMesh(text: string, matrix: Matrix4, w: number, h: number): Mesh {
  const H = 96;
  const [m0, mctx] = cpuCanvas(8, 8);
  void m0;
  mctx.font = `600 60px ${FONT}`;
  const W = Math.min(1024, Math.ceil(mctx.measureText(text).width + 40));
  const [canvas, ctx] = cpuCanvas(W, H);
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 60px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, W / 2, H / 2 + 2);
  const aspect = W / H;
  const fw = Math.min(w, h * aspect);
  const mesh = new Mesh(new PlaneGeometry(fw, fw / aspect), new MeshBasicMaterial({ map: texture(canvas), transparent: true, toneMapped: false }));
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(matrix);
  mesh.matrixWorldNeedsUpdate = true;
  return mesh;
}
