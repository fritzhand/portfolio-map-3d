/* The roads: the straight roads from the plaza to every district and the village's ring street, laid
   as asphalt strips with a sandy shoulder on each side. The asphalt is one small repeating canvas
   texture, painted on the CPU: a blue-gray surface worn into patches, thin cracks, two pale wheel
   tracks, cream edge lines and a long dashed center line. Everything sits a hair above the ground
   (the land under a road is flat, see terrain.ts) and takes the toon light. */
import * as THREE from "three";
import { PLAZA_RADIUS, ROAD_WIDTH, VILLAGE, hashString, seededRandom, type WorldLayout } from "../../data/layout";
import { cpuCanvas } from "../../three/cpuCanvas";
import { toonMaterial, type ToonShared } from "../../three/toon";
import { mix, type ScenePalette } from "./palette";
import { canvasTexture } from "./util";

/** Length of road one texture tile covers: a long dash and a long gap. */
const TILE = 12;

interface StripPoint {
  x: number;
  z: number;
  /** Unit direction along the road. */
  tx: number;
  tz: number;
  /** Distance along the road. */
  s: number;
}

function asphaltTexture(p: ScenePalette): THREE.CanvasTexture {
  const W = 128;
  const H = 512;
  const [cv, ctx] = cpuCanvas(W, H);
  const css = (c: THREE.Color) => `#${c.getHexString()}`;
  ctx.fillStyle = css(p.road);
  ctx.fillRect(0, 0, W, H);
  const rand = seededRandom(hashString("walk-asphalt"));
  // Patches of repaired and weathered asphalt.
  for (let i = 0; i < 90; i++) {
    ctx.globalAlpha = 0.16 + rand() * 0.16;
    ctx.fillStyle = css(mix(p.road, rand() > 0.5 ? p.sand : p.rock, 0.3 + rand() * 0.3));
    const w = 8 + rand() * 40;
    const h = 8 + rand() * 60;
    ctx.fillRect(rand() * W - w / 2, rand() * H - h / 2, w, h);
  }
  // Fine grit.
  for (let i = 0; i < 700; i++) {
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = css(mix(p.road, rand() > 0.5 ? p.sand : p.ink, 0.22 + rand() * 0.18));
    ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 2.4, 1 + rand() * 2.4);
  }
  // Pale wheel tracks, a quarter and three quarters of the way across.
  ctx.globalAlpha = 0.09;
  ctx.fillStyle = css(p.roadLine);
  ctx.fillRect(W * 0.2, 0, W * 0.1, H);
  ctx.fillRect(W * 0.7, 0, W * 0.1, H);
  // Cracks.
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = css(mix(p.road, p.ink, 0.5));
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 7; i++) {
    let x = 14 + rand() * (W - 28);
    let y = rand() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (rand() - 0.5) * 12;
      y += 5 + rand() * 12;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Cream edge lines and a dashed center line.
  ctx.fillStyle = css(p.roadLine);
  ctx.fillRect(W * 0.045, 0, W * 0.04, H);
  ctx.fillRect(W * 0.915, 0, W * 0.04, H);
  ctx.fillRect(W * 0.485, 40, W * 0.03, 150);
  const tex = canvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** A strip along a path, `halfW` to each side, at height y. UV: u across, v along in tiles. */
function strip(points: StripPoint[], halfW: number, y: number, tile: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  points.forEach((q, i) => {
    const nx = -q.tz * halfW;
    const nz = q.tx * halfW;
    pos.push(q.x - nx, y, q.z - nz, q.x + nx, y, q.z + nz);
    const v = q.s / tile;
    uv.push(0, v, 1, v);
    if (i < points.length - 1) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const normals = new Float32Array(pos.length);
  for (let i = 0; i < normals.length; i += 3) normals[i + 1] = 1;
  g.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  return g;
}

export interface Roads {
  group: THREE.Group;
}

export function buildRoads(layout: WorldLayout, p: ScenePalette, toon: ToonShared, own: <T extends { dispose(): void }>(x: T) => T): Roads {
  const group = new THREE.Group();
  group.name = "roads";
  const tex = own(asphaltTexture(p));
  const asphalt = own(
    toonMaterial({ map: tex, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -3 }, { shared: toon }),
  );
  const shoulderMat = own(
    toonMaterial({ color: mix(p.sand, p.grass, 0.12), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }, { shared: toon }),
  );
  const add = (g: THREE.BufferGeometry, m: THREE.Material, y: number) => {
    const mesh = new THREE.Mesh(own(g), m);
    mesh.position.y = y;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  const radial: StripPoint[][] = [];
  for (const disc of layout.discs) {
    const ux = Math.cos(disc.angle);
    const uz = Math.sin(disc.angle);
    const r0 = PLAZA_RADIUS - 0.4;
    const r1 = Math.hypot(disc.x, disc.z) - disc.r + 0.4;
    const steps = Math.max(1, Math.ceil((r1 - r0) / 6));
    const pts: StripPoint[] = [];
    for (let k = 0; k <= steps; k++) {
      const r = r0 + ((r1 - r0) * k) / steps;
      pts.push({ x: ux * r, z: uz * r, tx: ux, tz: uz, s: r - r0 });
    }
    radial.push(pts);
  }
  // The ring street: a closed loop, its tiles fitted so the dashes meet at the seam.
  const R = VILLAGE.streetR;
  const n = 160;
  const ring: StripPoint[] = [];
  const tiles = Math.max(1, Math.round((Math.PI * 2 * R) / TILE));
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    ring.push({ x: Math.cos(a) * R, z: Math.sin(a) * R, tx: -Math.sin(a), tz: Math.cos(a), s: (i / n) * Math.PI * 2 * R });
  }
  const ringTile = (Math.PI * 2 * R) / tiles;

  for (const pts of radial) {
    add(strip(pts, ROAD_WIDTH / 2 + 1.4, 0.04, TILE), shoulderMat, 0);
    add(strip(pts, ROAD_WIDTH / 2, 0.045, TILE), asphalt, 0);
  }
  add(strip(ring, VILLAGE.streetWidth / 2 + 1.4, 0.041, ringTile), shoulderMat, 0);
  add(strip(ring, VILLAGE.streetWidth / 2, 0.05, ringTile), asphalt, 0);
  return { group };
}
