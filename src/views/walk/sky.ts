/* The walk world's sky. A dome that travels with the camera carries a deep blue zenith over a pale
   horizon, the low sun's glow, and a band of cumulus with warm undersides, painted once on a
   CPU-backed canvas as a panorama that wraps around the horizon and drifts slowly (still under
   reduced motion). One texture lookup per pixel and no transparent layers. By moonlight (the dark
   theme) the same clouds are dim and fixed stars come out above them. */
import * as THREE from "three";
import { hashString, seededRandom } from "../../data/layout";
import { cpuCanvas } from "../../three/cpuCanvas";
import type { ScenePalette } from "./palette";

/** The panorama's size. Its width spans the whole horizon, its height the horizon up to CLOUD_TOP. */
const PANO_W = 2048;
const PANO_H = 256;
/** The sine of the highest elevation the panorama reaches (about 30°). */
export const CLOUD_TOP = 0.62;
/**
 * A panorama pixel spans more of the sky across than up (360° over its width, about 30° over its
 * height): puffs are painted this much narrower than tall, so they look round in the sky.
 */
export const PUFF_SQUEEZE = ((Math.asin(CLOUD_TOP) * 180) / Math.PI / PANO_H) / (360 / PANO_W);

export interface Cumulus {
  /** Center along the horizon, 0..1 of the panorama's width. */
  u: number;
  /** Base height above the horizon, 0..1 of the panorama's height. */
  base: number;
  /** Width and height, 0..1 of the panorama's width and height. */
  w: number;
  h: number;
  /** The puffs that make it up, relative to its base center (x across 0..1 of w, y up, r in px). */
  puffs: { x: number; y: number; r: number }[];
}

/**
 * Where the clouds stand around the horizon: big cumulus low on the horizon, smaller and fewer
 * higher up, a gap here and there so the sky shows through. Deterministic. Pure (sky.test.ts).
 */
export function cumulusField(seed = "walk-cumulus", count = 16): Cumulus[] {
  const rand = seededRandom(hashString(seed));
  const out: Cumulus[] = [];
  for (let i = 0; i < count; i++) {
    // Spread around the horizon with jitter, so no two pile up.
    const u = (i + 0.15 + rand() * 0.7) / count;
    const low = rand() < 0.72;
    const base = low ? 0.02 + rand() * 0.1 : 0.22 + rand() * 0.3;
    const w = low ? 0.045 + rand() * 0.055 : 0.03 + rand() * 0.035;
    const h = w * (PANO_W / PANO_H) * (low ? 0.5 + rand() * 0.25 : 0.38 + rand() * 0.18);
    // A cloud's domes stand about 1.3 times its nominal height: keep the top inside the panorama.
    const top = Math.min(base, 0.96 - h * 1.3);
    const n = low ? 9 + Math.floor(rand() * 7) : 8 + Math.floor(rand() * 5);
    const puffs: Cumulus["puffs"] = [];
    for (let k = 0; k < n; k++) {
      const x = (k + 0.5) / n - 0.5 + (rand() - 0.5) * 0.08;
      // A dome: the middle puffs are the biggest and stand highest.
      const mid = 1 - Math.min(1, Math.abs(x) * 2);
      const r = (0.32 + 0.68 * Math.pow(mid, 0.6)) * h * PANO_H * (0.42 + rand() * 0.18);
      const y = r * (0.55 + rand() * 0.35) + mid * h * PANO_H * 0.12;
      puffs.push({ x, y, r });
    }
    out.push({ u, base: Math.max(0.02, top), w, h, puffs });
  }
  return out;
}

const css = (c: THREE.Color, a = 1) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;

/** Paint the cumulus panorama (transparent sky, clouds with shaded undersides and flat-ish bottoms). */
function paintClouds(p: ScenePalette): HTMLCanvasElement {
  const [cv, ctx] = cpuCanvas(PANO_W, PANO_H);
  ctx.clearRect(0, 0, PANO_W, PANO_H);
  const lit = p.cloud;
  const shade = p.cloudShade;
  const deep = p.cloudShade.clone().lerp(p.skyMid, 0.28);
  // A round puff in the sky: an ellipse here, narrower than tall (PUFF_SQUEEZE), soft only at its rim.
  const puff = (x: number, y: number, r: number, inner: string, outer: string) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(PUFF_SQUEEZE, 1);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, inner);
    g.addColorStop(0.74, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  for (const c of cumulusField()) {
    for (const wrap of [-1, 0, 1]) {
      const cx = (c.u + wrap) * PANO_W;
      const baseY = PANO_H * (1 - c.base);
      const width = c.w * PANO_W;
      if (cx + width < -10 || cx - width > PANO_W + 10) continue;
      ctx.save();
      // Flat-ish bottoms: nothing below the cloud's base.
      ctx.beginPath();
      ctx.rect(cx - width, 0, width * 2, baseY + 2);
      ctx.clip();
      // The shaded body first, a little lower; then the sunlit tops over it, a little higher.
      for (const q of c.puffs) puff(cx + q.x * width, baseY - q.y + q.r * 0.2, q.r * 1.02, css(deep, 0.9), css(deep, 0));
      for (const q of c.puffs) puff(cx + q.x * width, baseY - q.y + q.r * 0.06, q.r * 0.97, css(shade, 0.96), css(shade, 0));
      for (const q of c.puffs) puff(cx + q.x * width - q.r * 0.1 * PUFF_SQUEEZE, baseY - q.y - q.r * 0.14, q.r * 0.84, css(lit, 1), css(lit, 0));
      ctx.restore();
    }
  }
  return cv;
}

export interface Sky {
  mesh: THREE.Mesh;
  /** Drift the clouds and follow the camera (seconds; pass a fixed time under reduced motion). */
  update(time: number, cameraAt: THREE.Vector3): void;
  dispose(): void;
}

export function buildSky(p: ScenePalette, sunDir: THREE.Vector3): Sky {
  const tex = new THREE.CanvasTexture(paintClouds(p));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 2;
  const geo = new THREE.SphereGeometry(1500, 40, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: p.skyTop.clone() },
      uMid: { value: p.skyMid.clone() },
      uHorizon: { value: p.skyBottom.clone() },
      uHaze: { value: p.fog.clone() },
      uGlow: { value: p.glow.clone() },
      uSunDir: { value: sunDir.clone() },
      uClouds: { value: tex },
      uDrift: { value: 0 },
      uCloudTop: { value: CLOUD_TOP },
      uNight: { value: p.dark ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uMid;
      uniform vec3 uHorizon;
      uniform vec3 uHaze;
      uniform vec3 uGlow;
      uniform vec3 uSunDir;
      uniform sampler2D uClouds;
      uniform float uDrift;
      uniform float uCloudTop;
      uniform float uNight;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        // Horizon to zenith, blue within a few degrees of the horizon (a quadratic ease in and
        // out), so the follow camera's view down still shows blue sky.
        float t = clamp((h + 0.05) / 0.4, 0.0, 1.0);
        t = t < 0.5 ? 2.0 * t * t : 1.0 - 2.0 * (1.0 - t) * (1.0 - t);
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.55, t));
        col = mix(col, uZenith, smoothstep(0.4, 1.0, t));
        // The low sun (or the moon): a broad glow and a brighter core.
        float s = max(dot(d, uSunDir), 0.0);
        col = mix(col, uGlow, pow(s, 6.0) * 0.38 + pow(s, 48.0) * 0.45);
        // Fixed stars by moonlight, above the clouds' band.
        if (uNight > 0.5) {
          vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(h, -1.0, 1.0)) * 0.31830989 + 0.5);
          vec2 cell = uv * vec2(960.0, 480.0);
          float seed = fract(sin(dot(floor(cell), vec2(12.9898, 78.233))) * 43758.5453);
          float star = step(0.9985, seed) * (1.0 - smoothstep(0.0, 0.18, length(fract(cell) - 0.5)));
          col += vec3(0.4) * star * smoothstep(0.12, 0.4, h);
        }
        // Cumulus, from the panorama (u around the horizon, v up to uCloudTop).
        float u = atan(d.z, d.x) * 0.15915494 + 0.5 + uDrift;
        float v = h / uCloudTop;
        if (v > -0.02 && v < 1.0) {
          vec4 c = texture2D(uClouds, vec2(u, clamp(v, 0.0, 1.0)));
          // Clouds on the sun's side catch more of its warmth.
          vec3 cc = mix(c.rgb, uGlow, pow(s, 3.0) * 0.35);
          col = mix(col, cc, c.a * smoothstep(-0.02, 0.012, v));
        }
        // A thin pale band at the far horizon, the haze the land fades into.
        col = mix(col, uHaze, clamp((0.05 - h) / 0.08, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "sky";
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return {
    mesh,
    update(time, cameraAt) {
      mesh.position.copy(cameraAt);
      mat.uniforms.uDrift.value = (time * 0.0011) % 1;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}
