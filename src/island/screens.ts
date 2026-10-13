// @ts-nocheck
/* The logos on the totems' screens: every company's badge (src/three/logoTexture.ts) copied into a
   few atlas pages, drawn as instanced quads, a page per draw call, unlit. A badge repaints when its
   logo or the web font arrives; its cell is copied again then. People's round badges go in an atlas
   of square cells.

   One page is 2048 px square: 128 company cells (256 x 128) or 256 person cells (128 x 128), each
   with a 4 px gutter that repeats its edge so mipmaps do not bleed between cells. */
import { DataTexture, InstancedBufferAttribute, InstancedMesh, LinearFilter, LinearMipmapLinearFilter, Matrix4, PlaneGeometry, RGBAFormat, ShaderMaterial, UnsignedByteType } from 'three';
import { onBadgeBaked } from '../three/logoTexture';

const PAGE = 2048;
const GUTTER = 4;

interface Source {
  /** The badge's byte texture (rows bottom-up, RGBA). */
  texture: { image: { width: number; height: number; data: Uint8Array } };
}

export interface ScreenAtlas {
  /** Cell for a badge; copy its pixels now and whenever it repaints. */
  add(key: string, badge: Source): { page: number; uv: [number, number, number, number] };
  pages: DataTexture[];
}

function makePage(): DataTexture {
  const t = new DataTexture(new Uint8Array(PAGE * PAGE * 4), PAGE, PAGE, RGBAFormat, UnsignedByteType);
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.flipY = false;
  (t as any).encoding = 3001;
  t.needsUpdate = true;
  return t;
}

/** An atlas of `cellW` x `cellH` cells. */
export function screenAtlas(cellW: number, cellH: number): ScreenAtlas {
  const cols = Math.floor(PAGE / cellW);
  const rows = Math.floor(PAGE / cellH);
  const perPage = cols * rows;
  const pages: DataTexture[] = [];
  const entries: Array<{ badge: Source; page: number; cx: number; cy: number; version: number }> = [];
  const dirty = new Set<number>();

  /** Copy a badge into its cell: bilinear downscale into the inner box, its edge repeated into the gutter. */
  const copy = (e: (typeof entries)[number]) => {
    const src = e.badge.texture.image;
    if (!src?.data) return;
    e.version = (e.badge.texture as any).version ?? 0;
    const dst = pages[e.page].image.data as Uint8Array;
    const iw = cellW - GUTTER * 2;
    const ih = cellH - GUTTER * 2;
    for (let y = 0; y < cellH; y++) {
      const ty = Math.min(ih - 1, Math.max(0, y - GUTTER));
      const sy = ((ty + 0.5) / ih) * src.height - 0.5;
      const y0 = Math.max(0, Math.floor(sy));
      const y1 = Math.min(src.height - 1, y0 + 1);
      const fy = Math.min(1, Math.max(0, sy - y0));
      for (let x = 0; x < cellW; x++) {
        const tx = Math.min(iw - 1, Math.max(0, x - GUTTER));
        const sx = ((tx + 0.5) / iw) * src.width - 0.5;
        const x0 = Math.max(0, Math.floor(sx));
        const x1 = Math.min(src.width - 1, x0 + 1);
        const fx = Math.min(1, Math.max(0, sx - x0));
        const o = ((e.cy + y) * PAGE + e.cx + x) * 4;
        for (let ch = 0; ch < 4; ch++) {
          const a = src.data[(y0 * src.width + x0) * 4 + ch];
          const b = src.data[(y0 * src.width + x1) * 4 + ch];
          const c = src.data[(y1 * src.width + x0) * 4 + ch];
          const d = src.data[(y1 * src.width + x1) * 4 + ch];
          dst[o + ch] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
        }
      }
    }
    dirty.add(e.page);
  };
  const flush = () => {
    for (const p of dirty) pages[p].needsUpdate = true;
    dirty.clear();
  };
  // A repaint bumps its texture's version: copy only the badges that changed, once a frame.
  let queued = false;
  onBadgeBaked(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      for (const e of entries) if (((e.badge.texture as any).version ?? 0) !== e.version) copy(e);
      flush();
    });
  });

  return {
    pages,
    add(_key, badge) {
      const i = entries.length;
      const page = Math.floor(i / perPage);
      while (pages.length <= page) pages.push(makePage());
      const k = i % perPage;
      const cx = (k % cols) * cellW;
      const cy = Math.floor(k / cols) * cellH;
      const e = { badge, page, cx, cy, version: -1 };
      entries.push(e);
      copy(e);
      flush();
      // The inner box, in uv (v up: the page's row 0 is its bottom, like the badge's).
      return { page, uv: [(cx + GUTTER) / PAGE, (cy + GUTTER) / PAGE, (cellW - GUTTER * 2) / PAGE, (cellH - GUTTER * 2) / PAGE] };
    },
  };
}

const vertexShader = /* glsl */ `
  attribute vec4 aCell;
  varying vec2 vUv;
  void main() {
    vUv = aCell.xy + uv * aCell.zw;
    vec4 p = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * p;
  }`;
const fragmentShader = /* glsl */ `
  uniform sampler2D map;
  uniform float uDim;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(map, vUv);
    if (c.a < 0.5) discard;
    gl_FragColor = vec4(c.rgb * uDim, 1.0);
    #include <encodings_fragment>
  }`;

export interface ScreenQuad {
  /** World transform of the quad's middle (its front faces +z). */
  matrix: Matrix4;
  w: number;
  h: number;
  page: number;
  uv: [number, number, number, number];
}

/** One instanced mesh per atlas page for these quads; `onPick` maps a hit back to the quad's index. */
export function screenMeshes(atlas: ScreenAtlas, quads: ScreenQuad[]): { meshes: InstancedMesh[]; quadOf: (mesh: InstancedMesh, instanceId: number) => number; setDim: (k: number) => void } {
  const meshes: InstancedMesh[] = [];
  const index = new Map<InstancedMesh, number[]>();
  const uniformsList: any[] = [];
  atlas.pages.forEach((page, p) => {
    const mine = quads.map((q, i) => ({ q, i })).filter(({ q }) => q.page === p);
    if (!mine.length) return;
    const geo = new PlaneGeometry(1, 1);
    const cells = new Float32Array(mine.length * 4);
    mine.forEach(({ q }, k) => cells.set(q.uv, k * 4));
    geo.setAttribute('aCell', new InstancedBufferAttribute(cells, 4));
    const uniforms = { map: { value: page }, uDim: { value: 1 } };
    uniformsList.push(uniforms);
    const mesh = new InstancedMesh(geo, new ShaderMaterial({ uniforms, vertexShader, fragmentShader }), mine.length);
    const m = new Matrix4();
    mine.forEach(({ q }, k) => {
      m.copy(q.matrix).multiply(new Matrix4().makeScale(q.w, q.h, 1));
      mesh.setMatrixAt(k, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere?.();
    mesh.frustumCulled = false;
    mesh.name = `screens-${p}`;
    meshes.push(mesh);
    index.set(mesh, mine.map(({ i }) => i));
  });
  return {
    meshes,
    quadOf: (mesh, id) => index.get(mesh)?.[id] ?? -1,
    setDim: (k) => uniformsList.forEach((u) => (u.uDim.value = k)),
  };
}
