/* The Nexus scene: one renderer and canvas, shared by the interactive landing universe
   and the world mode (orbit, zoom, pick, fly).

   What it draws, all procedural (no network assets): a nebula sky and a starfield, the core
   (a crystalline form with rings), a world per instance (its surface painted on a canvas:
   district bands and a light per company, a rim in its accent), a label over each, and a light
   bridge from every world to the core with particles flowing into it: the link every map
   makes to the Nexus. No line joins two worlds: the Nexus implies no relationship between
   organizations.

   Rendering is on demand. The loop runs while something moves (drift, flow, a flight, damping)
   and stops when the scene is still, when it is off screen, or when the page is hidden. Under
   reduced motion nothing moves by itself: no drift, no flow, no spin, and camera moves are
   instant. React never re-renders per frame; it calls the methods below on events only.

   Lifecycle: textures are painted on CPU canvases and repainted after a context restore; if the
   context is not restored, hooks.onGiveUp asks the owner for a new engine. dispose() frees every
   GPU resource. */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { place, type Disc, type LabelBox, type Rect } from "../lib/declutter.ts";
import { seeded } from "../lib/hash.ts";
import { LAYOUT, extent, type Placement } from "../lib/layout.ts";
import type { SurfaceCompany, SurfaceDistrict } from "../lib/surface.ts";
import { watchContext } from "./contextWatch.ts";
import { cpuCanvas } from "./cpuCanvas.ts";
import { FONT_FAMILY, HEADING_FONT_FAMILY, labelSize, paintGlow, paintLabel, paintSurface, paintTheme, type LabelContent } from "./paint.ts";
import { moonLayout, type MoonPlacement } from "./moonLayout.ts";
import { MoonLabels, type MoonAnchor } from "./moonLabels.ts";
import { createAuroraMaterial, paintAurora } from "./aurora.ts";

export interface EngineWorld {
  id: string;
  placement: Placement;
  accent: string;
  /** Unreachable at the last check: muted surface, faint bridge, no flow. */
  dim: boolean;
  title: string;
  subtitle: string;
  initials: string;
  /** A same-origin image URL, or null. */
  logoUrl: string | null;
  districts: (SurfaceDistrict & { label: string })[];
  companies: SurfaceCompany[];
  companyLabels: { one: string; many: string };
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface EngineHooks {
  /** A world (its id), the core ("core"), or nothing (null) was clicked or tapped. */
  onPick(id: string | null, district?: string): void;
  /** The WebGL context was lost and never restored: the owner should build a new engine. */
  onGiveUp(): void;
}

type View = { kind: "hero" } | { kind: "overview" } | { kind: "world"; id: string };

interface WorldObject {
  spec: EngineWorld;
  pos: THREE.Vector3;
  radius: number;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  surface: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture };
  label: LabelObject;
  /** The world's logo alone, shown where its whole label does not fit. */
  chip: LabelObject;
  logo: HTMLImageElement | null;
}

interface LabelObject {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  aspect: number;
  content: LabelContent;
  scale: number;
  /** The opacity shown now (it eases toward its target as labels make room for each other). */
  opacity: number;
  /** The place it last took around its world (lib/declutter.ts place), or -1 before it was shown. */
  side: number;
}

interface MoonSystem {
  worldId: string;
  mesh: THREE.InstancedMesh;
  placements: MoonPlacement[];
  labels: MoonLabels;
  hover: number | null;
  selected: string | null;
}

interface Flight {
  fromPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  to: () => { pos: THREE.Vector3; target: THREE.Vector3 };
  start: number;
  duration: number;
  ease: (t: number) => number;
  /** Lift the path by this share of its length at the middle. */
  arc: number;
}

const FOV = 50;
const CORE_COLOR = new THREE.Color("#3be8ff");
const VIOLET = new THREE.Color("#9d7bff");
const WORLD_ELEVATION = 0.36;
const IDLE_BEFORE_DRIFT_MS = 7000;
const GLOW_STOPS: [number, string][] = [
  [0, "rgba(220, 250, 255, 0.95)"],
  [0.12, "rgba(110, 230, 255, 0.55)"],
  [0.38, "rgba(120, 90, 255, 0.16)"],
  [1, "rgba(0, 0, 0, 0)"],
];

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/* ---------- Shaders ---------- */

const WORLD_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vP;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const WORLD_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uRim;
uniform float uDim;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vP;
void main() {
  vec3 base = texture2D(uMap, vUv).rgb;
  vec3 n = normalize(vN);
  // A broad overhead key gives shape; the core adds light on the inward-facing side.
  vec3 key = normalize(vec3(-0.35, 0.8, 0.45));
  float keyLight = max(dot(n, key), 0.0);
  float coreLight = max(dot(n, normalize(-vP)), 0.0);
  vec3 v = normalize(cameraPosition - vP);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.4);
  float sheen = pow(max(dot(n, normalize(key + v)), 0.0), 30.0);
  vec3 col = base * (0.16 + 0.78 * keyLight + 0.32 * coreLight);
  col += vec3(0.95, 0.97, 1.0) * sheen * 0.16 + uRim * rim * 0.2;
  gl_FragColor = vec4(col * uDim, 1.0);
  #include <colorspace_fragment>
}`;

const MOON_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vP;
varying vec3 vLocal;
varying vec3 vColor;
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  vLocal = position;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vColor = instanceColor;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const MOON_FRAG = /* glsl */ `
varying vec3 vN;
varying vec3 vP;
varying vec3 vLocal;
varying vec3 vColor;
void main() {
  vec3 n = normalize(vN);
  vec3 key = normalize(vec3(-0.35, 0.8, 0.45));
  float light = max(dot(n, key), 0.0);
  float core = max(dot(n, normalize(-vP)), 0.0);
  float grain = 0.86 + 0.14 * sin(vLocal.x * 29.0) * sin(vLocal.y * 23.0) * sin(vLocal.z * 31.0);
  vec3 col = vColor * grain * (0.2 + light * 0.85 + core * 0.25);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const ATMO_VERT = /* glsl */ `
attribute float aStrength;
varying float vI;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  float d = dot(n, normalize(-mv.xyz));
  vI = pow(smoothstep(0.0, 0.62, -d), 1.6) * aStrength;
  #ifdef USE_INSTANCING_COLOR
    vColor = instanceColor;
  #else
    vColor = vec3(1.0);
  #endif
  gl_Position = projectionMatrix * mv;
}`;

const ATMO_FRAG = /* glsl */ `
varying float vI;
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor * vI, vI);
  #include <colorspace_fragment>
}`;

const FLOW_VERT = /* glsl */ `
attribute vec3 aP0;
attribute vec3 aP1;
attribute vec3 aP2;
attribute float aPhase;
attribute float aSpeed;
attribute vec3 aColor;
uniform float uTime;
uniform float uPixelRatio;
uniform float uSize;
varying float vAlpha;
varying vec3 vColor;
void main() {
  float t = fract(aPhase + uTime * aSpeed);
  float s = 1.0 - t;
  vec3 p = s * s * aP0 + 2.0 * s * t * aP1 + t * t * aP2;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * uPixelRatio * 60.0 / -mv.z, 1.5 * uPixelRatio, 7.0 * uPixelRatio);
  vAlpha = sin(3.14159 * t);
  vColor = mix(aColor, vec3(0.75, 0.97, 1.0), t);
}`;

const FLOW_FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
  #include <colorspace_fragment>
}`;

const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
uniform float uPixelRatio;
varying vec3 vColor;
void main() {
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelRatio;
}`;

const STAR_FRAG = /* glsl */ `
varying vec3 vColor;
uniform float uDark;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.1, d);
  vec3 col = mix(vec3(0.16, 0.16, 0.18), vColor, uDark);
  gl_FragColor = vec4(mix(col, col * a, uDark), a);
  #include <colorspace_fragment>
}`;

const CRYSTAL_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const CRYSTAL_FRAG = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uBright;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
  vec3 col = mix(uDeep, uBright, 0.25 + 0.75 * f);
  gl_FragColor = vec4(col, 0.92);
  #include <colorspace_fragment>
}`;

/* ---------- The engine ---------- */

export class NexusEngine {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 5000);
  private readonly controls: OrbitControls;
  private readonly hooks: EngineHooks;

  private host: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private size = { w: 1, h: 1 };
  private active = true;
  private disposed = false;
  private reduced: boolean;
  private raf = 0;
  private running = false;
  private dirty = false;
  private last = 0;
  private time = 0;
  private stopWatch: () => void;
  private stopThemeWatch: () => void;
  private controlsConnected = false;
  private interacting = false;
  private idleUntil = 0;

  private view: View = { kind: "hero" };
  /** An arrival asked for before its world was loaded. */
  private pendingArrival: "none" | "link" | "portal" | null = null;
  /** The visitor moved the camera since the view was last framed. */
  private userMoved = false;
  private flight: Flight | null = null;
  private insetsNow: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private insetsGoal: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private insetProjection = { w: 0, h: 0, x: NaN, y: NaN };
  private heroOverlay: Rect | null = null;
  private keepOut: Rect[] = [];

  private specs: EngineWorld[] = [];
  private coreSubtitle = "";
  private worlds = new Map<string, WorldObject>();
  private readonly worldGroup = new THREE.Group();
  private readonly sphere = new THREE.SphereGeometry(1, 48, 32);
  private readonly overviewSphere = new THREE.SphereGeometry(1, 32, 24);
  private environmentFocus: string | null | undefined;
  private moons: MoonSystem | null = null;
  private surfaceFocus: string | null = null;
  private atmosphere: THREE.InstancedMesh | null = null;
  private bridges: THREE.LineSegments | null = null;
  private flow: THREE.Points | null = null;
  private readonly flowMaterial: THREE.ShaderMaterial;
  private hoverId: string | null = null;

  private readonly core = new THREE.Group();
  private readonly coreSpin: THREE.Object3D[] = [];
  private readonly rings: THREE.Mesh[] = [];
  private coreLabel: LabelObject | null = null;
  private readonly selectRing = new THREE.Group();
  private readonly hoverRing: THREE.Mesh;

  private readonly sky: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture };
  private readonly skyMaterial: THREE.ShaderMaterial;
  private readonly glow: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture };
  private readonly starMaterial: THREE.ShaderMaterial;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly pickSphere = new THREE.Sphere();
  private readonly pickPoint = new THREE.Vector3();
  private readonly pickCenter = new THREE.Vector3();
  private down: { x: number; y: number; t: number } | null = null;
  private hoverQueued = false;
  private lastMove: PointerEvent | null = null;
  private readonly labelCamera = new THREE.Matrix4();
  private readonly labelProjection = new THREE.Matrix4();
  private labelsNeedLayout = true;
  private labelsFading = true;
  private pickedDistrict: string | undefined;

  constructor(hooks: EngineHooks, reduced: boolean) {
    this.hooks = hooks;
    this.reduced = reduced;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "nexus-canvas";
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setClearColor(paintTheme().background, 1);

    this.camera.position.set(0, 18, 60);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.disconnect();
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.62;
    this.controls.rotateSpeed = 0.6;
    this.controls.zoomSpeed = 0.9;
    this.controls.dampingFactor = 0.08;
    this.controls.addEventListener("change", () => this.invalidate());
    this.controls.addEventListener("start", () => {
      this.interacting = true;
      this.userMoved = true;
      this.flight = null;
      this.idleUntil = Number.POSITIVE_INFINITY;
    });
    this.controls.addEventListener("end", () => {
      this.interacting = false;
      this.idleUntil = performance.now() + IDLE_BEFORE_DRIFT_MS;
      this.invalidate();
    });

    // Sky.
    const [skyCanvas, skyCtx] = cpuCanvas(2048, 1024);
    paintAurora(skyCtx, 2048, 1024);
    const skyTexture = this.canvasTexture(skyCanvas);
    this.sky = { canvas: skyCanvas, ctx: skyCtx, texture: skyTexture };
    const theme = paintTheme();
    this.skyMaterial = createAuroraMaterial(skyTexture, theme.dark, theme.background);
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(2400, 24, 12), this.skyMaterial);
    skyMesh.renderOrder = -10;
    this.scene.add(skyMesh);

    // Stars.
    this.starMaterial = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      uniforms: { uPixelRatio: { value: this.renderer.getPixelRatio() }, uDark: { value: paintTheme().dark ? 1 : 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.scene.add(this.buildStars());

    // Core glow (shared by the core sprite).
    const [glowCanvas, glowCtx] = cpuCanvas(256, 256);
    paintGlow(glowCtx, 256, GLOW_STOPS);
    this.glow = { canvas: glowCanvas, ctx: glowCtx, texture: this.canvasTexture(glowCanvas) };
    this.buildCore();
    this.scene.add(this.core);

    this.flowMaterial = new THREE.ShaderMaterial({
      vertexShader: FLOW_VERT,
      fragmentShader: FLOW_FRAG,
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: this.renderer.getPixelRatio() }, uSize: { value: 2.6 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.scene.add(this.worldGroup);

    // Rings marking the world in view, and the one under the pointer.
    const ringGeo = new THREE.TorusGeometry(1, 0.009, 4, 96);
    const ringA = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    ringA.rotation.x = Math.PI / 2;
    const ringB = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    ringB.rotation.x = Math.PI / 2;
    ringB.scale.setScalar(1.14);
    this.selectRing.add(ringA, ringB);
    this.selectRing.visible = false;
    this.scene.add(this.selectRing);
    this.hoverRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.hoverRing.rotation.x = Math.PI / 2;
    this.hoverRing.visible = false;
    this.scene.add(this.hoverRing);

    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerCancel);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
    document.addEventListener("visibilitychange", this.onVisibilityChange);

    this.stopWatch = watchContext(this.canvas, {
      restored: () => {
        this.repaintAll();
        this.invalidate();
      },
      giveUp: () => this.hooks.onGiveUp(),
    });

    // Labels are painted at once with whatever font is ready, and again with the page's font.
    const fonts = document.fonts;
    if (fonts) {
      Promise.all([fonts.load(`500 32px ${HEADING_FONT_FAMILY}`), fonts.load(`400 23px ${FONT_FAMILY}`), fonts.load(`600 24px ${FONT_FAMILY}`)])
        .catch(() => undefined)
        .then(() => fonts.ready)
        .then(() => {
          if (!this.disposed) {
            this.repaintLabels();
            this.invalidate();
          }
        });
    }
    this.applyControls();
    let themeKey = "";
    const refreshTheme = () => {
      const theme = paintTheme();
      const key = JSON.stringify(theme);
      if (key === themeKey || this.disposed) return;
      themeKey = key;
      this.renderer.setClearColor(theme.background, 1);
      this.skyMaterial.uniforms.uDark.value = theme.dark ? 1 : 0;
      this.skyMaterial.uniforms.uBackground.value.set(theme.background);
      this.starMaterial.uniforms.uDark.value = theme.dark ? 1 : 0;
      this.starMaterial.blending = theme.dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      this.starMaterial.needsUpdate = true;
      // A theme changes text and sky colors; planet artwork already stays readable.
      this.repaintLabels();
      this.invalidate();
    };
    const themeObserver = new MutationObserver(refreshTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
    const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
    themeMedia.addEventListener("change", refreshTheme);
    this.stopThemeWatch = () => {
      themeObserver.disconnect();
      themeMedia.removeEventListener("change", refreshTheme);
    };
    refreshTheme();
  }

  /* ---------- Public API ---------- */

  /** Puts the canvas into `host` and sizes it to the host. */
  attach(host: HTMLElement): void {
    if (this.disposed) return;
    if (this.host && this.host !== host) this.detach(this.host);
    this.host = host;
    host.appendChild(this.canvas);
    if (this.moons) host.appendChild(this.moons.labels.root);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.invalidate();
  }

  detach(host: HTMLElement): void {
    if (this.host !== host) return;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.canvas.parentElement === host) host.removeChild(this.canvas);
    this.moons?.labels.root.remove();
    this.host = null;
    this.stop();
  }

  /** False while the canvas is off screen: nothing renders. */
  setActive(on: boolean): void {
    this.active = on;
    if (on) this.invalidate();
    else this.stop();
  }

  setReducedMotion(reduced: boolean): void {
    if (this.reduced === reduced) return;
    this.reduced = reduced;
    if (reduced && this.flight) this.finishFlight();
    this.applyControls();
    this.invalidate();
  }

  /** Replaces the worlds. The view (hero, overview or a world) is kept and re-framed. */
  setWorlds(list: EngineWorld[], coreSubtitle: string): void {
    this.clearWorlds();
    this.specs = list;
    this.coreSubtitle = coreSubtitle;
    const surfaceSize = this.surfaceSize();
    const labelScale = list.length > 40 ? 1.5 : 3;
    for (const spec of list) {
      const p = spec.placement;
      const pos = new THREE.Vector3(p.x, p.y, p.z);
      const [sc, sctx] = cpuCanvas(...surfaceSize);
      paintSurface(sctx, sc.width, sc.height, { id: spec.id, accent: spec.accent, districts: spec.districts, companies: spec.companies, dim: spec.dim });
      const texture = this.canvasTexture(sc);
      texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      const material = new THREE.ShaderMaterial({
        vertexShader: WORLD_VERT,
        fragmentShader: WORLD_FRAG,
        uniforms: { uMap: { value: texture }, uRim: { value: new THREE.Color(spec.accent) }, uDim: { value: spec.dim ? 0.6 : 1 } },
      });
      const mesh = new THREE.Mesh(this.overviewSphere, material);
      mesh.position.copy(pos);
      mesh.scale.setScalar(p.radius);
      mesh.rotation.y = (p.slot * 1.7) % (Math.PI * 2);
      mesh.userData.worldId = spec.id;
      this.worldGroup.add(mesh);
      const content: LabelContent = { title: spec.title, subtitle: spec.subtitle, accent: spec.accent, initials: spec.initials, logo: null, dim: spec.dim };
      const label = this.makeLabel(content, labelScale);
      const chip = this.makeLabel({ ...content, chip: true }, labelScale);
      for (const l of [label, chip]) {
        l.sprite.userData.worldId = spec.id;
        l.sprite.position.set(pos.x, pos.y + p.radius + 0.5, pos.z);
        this.worldGroup.add(l.sprite);
      }
      const obj: WorldObject = { spec, pos, radius: p.radius, mesh, material, surface: { canvas: sc, ctx: sctx, texture }, label, chip, logo: null };
      this.worlds.set(spec.id, obj);
      if (spec.logoUrl) this.loadLogo(obj, spec.logoUrl);
    }
    this.buildBridges();
    this.updateCoreLabel();
    if (this.view.kind === "world" && !this.worlds.has(this.view.id)) this.view = { kind: "overview" };
    this.syncMoons();
    this.applyControls();
    if (this.view.kind === "world" && this.pendingArrival) this.showWorld(this.view.id, this.pendingArrival);
    else this.frameView();
    this.invalidate();
  }

  /** The screen edges the HUD covers, in CSS pixels; the scene frames the space left between them. */
  setInsets(insets: Insets): void {
    const g = this.insetsGoal;
    if (g.top === insets.top && g.right === insets.right && g.bottom === insets.bottom && g.left === insets.left) return;
    this.insetsGoal = { ...insets };
    if (this.reduced) this.applyInsets(1);
    if (!this.flight && !this.interacting && !this.userMoved) this.frameView();
    this.invalidate();
  }

  /** Keep labels clear of the landing copy without squeezing the whole universe beside it. */
  setHeroOverlay(rect: Rect): void {
    this.heroOverlay = rect;
    this.labelsNeedLayout = true;
    this.invalidate();
  }

  /** Pieces of the HUD that float over the scene (the music button): no label goes under them. */
  setKeepOut(rects: readonly Rect[]): void {
    this.keepOut = rects.map((r) => ({ ...r }));
    this.labelsNeedLayout = true;
    this.invalidate();
  }

  /** Keep the selected district's moon and label in sync with the directory filter. */
  setDistrict(district: string | null): void {
    if (!this.moons || this.moons.selected === district) return;
    this.moons.selected = district;
    this.updateMoonLabel();
    this.labelsNeedLayout = true;
    this.invalidate();
  }

  /** Zoom controls for the hero, where the wheel and vertical swipes scroll the page. */
  zoom(factor: number): void {
    this.flight = null;
    this.userMoved = true;
    this.idleUntil = performance.now() + IDLE_BEFORE_DRIFT_MS;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const distance = THREE.MathUtils.clamp(offset.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(offset.setLength(distance));
    this.syncControls();
    this.invalidate();
  }

  /** Turns the camera around what it looks at, in radians: `azimuth` sideways, `polar` up or down (the arrow keys). */
  orbit(azimuth: number, polar: number): void {
    this.flight = null;
    this.userMoved = true;
    this.idleUntil = performance.now() + IDLE_BEFORE_DRIFT_MS;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const at = new THREE.Spherical().setFromVector3(offset);
    at.theta += azimuth;
    at.phi = THREE.MathUtils.clamp(at.phi + polar, this.controls.minPolarAngle, this.controls.maxPolarAngle);
    this.camera.position.copy(this.controls.target).add(offset.setFromSpherical(at));
    this.syncControls();
    this.invalidate();
  }

  /** The landing universe supports orbiting and picking, with an idle drift. */
  showHero(): void {
    this.view = { kind: "hero" };
    this.labelsNeedLayout = true;
    this.syncMoons();
    this.pendingArrival = null;
    this.idleUntil = 0;
    this.applyControls();
    const az = this.azimuth();
    this.flyTo(() => this.heroFraming(az), { duration: 1.6 });
  }

  /** The world mode's overview of every world. */
  showOverview(): void {
    this.view = { kind: "overview" };
    this.labelsNeedLayout = true;
    this.syncMoons();
    this.pendingArrival = null;
    this.applyControls();
    const az = this.azimuth();
    this.flyTo(() => this.overviewFraming(az), { duration: 1.5 });
  }

  /**
   * Turns to a world. `arrival` "portal" starts the camera at the world's surface and pulls back
   * (the visitor came through a map's portal); "link" flies in from wherever the camera is.
   */
  showWorld(id: string, arrival: "none" | "link" | "portal" = "none"): void {
    const same = this.view.kind === "world" && this.view.id === id && !this.pendingArrival;
    this.view = { kind: "world", id };
    if (!this.worlds.has(id)) {
      // Framed once setWorlds() brings it.
      this.pendingArrival = arrival;
      return;
    }
    this.pendingArrival = null;
    this.syncMoons();
    this.labelsNeedLayout = true;
    this.applyControls();
    if (same && arrival === "none") return;
    if (arrival === "portal" && !this.reduced) {
      const end = this.worldFraming(id);
      const w = this.worlds.get(id)!;
      const dir = end.pos.clone().sub(w.pos).normalize();
      this.camera.position.copy(w.pos).addScaledVector(dir, w.radius * 1.18);
      this.controls.target.copy(w.pos);
      this.camera.lookAt(w.pos);
      this.flyTo(() => this.worldFraming(id), { duration: 2.6, ease: easeOut, arc: 0, fixed: true });
      return;
    }
    this.flyTo(() => this.worldFraming(id), { duration: arrival === "link" ? 2 : 1.4 });
  }

  /** Repaints every label (the page's font has loaded). */
  repaintLabels(): void {
    for (const w of this.worlds.values()) {
      this.paintLabelObject(w.label);
      this.paintLabelObject(w.chip);
    }
    if (this.coreLabel) this.paintLabelObject(this.coreLabel);
    this.moons?.labels.remeasure();
    this.labelsNeedLayout = true;
    this.invalidate();
  }

  /** Asks for a frame. */
  invalidate = (): void => {
    if (this.disposed || !this.host || !this.active || document.hidden) return;
    this.dirty = true;
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.stopWatch();
    this.stopThemeWatch();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerCancel);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.controls.dispose();
    this.moons?.labels.dispose();
    this.resizeObserver?.disconnect();
    for (const w of this.worlds.values()) if (w.logo) w.logo.onload = null;
    const textures = new Set<THREE.Texture>();
    this.scene.traverse((o) => {
      const any = o as THREE.Mesh;
      any.geometry?.dispose();
      const mats = Array.isArray(any.material) ? any.material : any.material ? [any.material] : [];
      for (const m of mats) {
        for (const v of Object.values(m)) if (v instanceof THREE.Texture) textures.add(v);
        const u = (m as THREE.ShaderMaterial).uniforms;
        if (u) for (const x of Object.values(u)) if (x.value instanceof THREE.Texture) textures.add(x.value);
        m.dispose();
      }
    });
    for (const t of textures) t.dispose();
    this.sphere.dispose();
    this.overviewSphere.dispose();
    this.flowMaterial.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
    this.worlds.clear();
  }

  /* ---------- Building ---------- */

  private canvasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private buildStars(): THREE.Points {
    const n = 2600;
    const rand = seeded(7);
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const color = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const u = rand() * 2 - 1;
      const a = rand() * Math.PI * 2;
      const r = 1300 + rand() * 700;
      const s = Math.sqrt(1 - u * u);
      pos.set([r * s * Math.cos(a), r * u, r * s * Math.sin(a)], i * 3);
      const big = rand() < 0.06;
      size[i] = big ? 2.6 + rand() * 1.6 : 1.1 + rand() * 1.3;
      const k = rand();
      c.set(k < 0.7 ? "#dfe8ff" : k < 0.88 ? "#a9d8ff" : "#ffe2c4").multiplyScalar(0.55 + rand() * 0.45);
      color.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
    const points = new THREE.Points(g, this.starMaterial);
    points.frustumCulled = false;
    points.renderOrder = -9;
    return points;
  }

  /** The core: a dark crystal, two cages, a glow and three rings. */
  private buildCore(): void {
    const R = LAYOUT.coreRadius;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow.texture, color: "#ffffff", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(R * 9);
    this.core.add(glow);

    const crystal = new THREE.Mesh(
      new THREE.IcosahedronGeometry(R * 0.62, 0),
      new THREE.ShaderMaterial({
        vertexShader: CRYSTAL_VERT,
        fragmentShader: CRYSTAL_FRAG,
        uniforms: { uDeep: { value: new THREE.Color("#0a1a46") }, uBright: { value: new THREE.Color("#7ff3ff") } },
        transparent: true,
      }),
    );
    this.core.add(crystal);
    this.coreSpin.push(crystal);

    const lineMat = (color: THREE.Color, opacity: number) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    const inner = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(R * 0.78, 0)), lineMat(CORE_COLOR, 0.95));
    const cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(R * 1.05, 1), 1), lineMat(VIOLET, 0.5));
    this.core.add(inner, cage);
    this.coreSpin.push(inner, cage);

    const ringSpecs: [number, number, number, THREE.Color, number][] = [
      [R * 1.7, 1.2, 0.3, CORE_COLOR, 0.55],
      [R * 2.15, 1.75, -0.5, VIOLET, 0.42],
      [R * 2.6, 1.45, 1.1, new THREE.Color("#ffffff"), 0.22],
    ];
    for (const [radius, rx, rz, color, opacity] of ringSpecs) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.035, 6, 112), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.set(rx, 0, rz);
      this.core.add(ring);
      this.rings.push(ring);
    }

  }

  private makeLabel(content: LabelContent, scale: number): LabelObject {
    const [canvas, ctx] = cpuCanvas(4, 4);
    const texture = this.canvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.center.set(0.5, 0);
    sprite.renderOrder = 5;
    material.opacity = 0;
    sprite.visible = false;
    const label: LabelObject = { sprite, material, canvas, ctx, texture, aspect: 1, content, scale, opacity: 0, side: -1 };
    this.paintLabelObject(label);
    return label;
  }

  /** Paints a label; a label that needs another size gets a fresh canvas and texture. */
  private paintLabelObject(label: LabelObject): void {
    const need = labelSize(label.ctx, label.content, label.scale);
    if (need.w !== label.canvas.width || need.h !== label.canvas.height) {
      const [canvas, ctx] = cpuCanvas(need.w, need.h);
      const texture = this.canvasTexture(canvas);
      label.texture.dispose();
      label.canvas = canvas;
      label.ctx = ctx;
      label.texture = texture;
      label.material.map = texture;
      label.material.needsUpdate = true;
    }
    paintLabel(label.ctx, label.canvas.width, label.canvas.height, label.content, label.scale);
    label.texture.needsUpdate = true;
    label.aspect = label.canvas.width / label.canvas.height;
    this.labelsNeedLayout = true;
  }

  private updateCoreLabel(): void {
    const content: LabelContent = { title: "Nexus", subtitle: this.coreSubtitle, accent: "#3be8ff", initials: "", logo: null, dim: false, mark: true };
    if (!this.coreLabel) {
      this.coreLabel = this.makeLabel(content, 2);
      this.coreLabel.sprite.userData.worldId = "core";
      this.coreLabel.sprite.position.set(0, LAYOUT.coreRadius * 2.9, 0);
      this.core.add(this.coreLabel.sprite);
    } else {
      this.coreLabel.content = content;
      this.paintLabelObject(this.coreLabel);
    }
  }

  private loadLogo(obj: WorldObject, url: string): void {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (this.disposed || this.worlds.get(obj.spec.id) !== obj) return;
      obj.logo = img;
      for (const l of [obj.label, obj.chip]) {
        l.content = { ...l.content, logo: img };
        this.paintLabelObject(l);
      }
      this.invalidate();
    };
    img.src = url;
  }

  private buildAtmosphere(): void {
    if (this.atmosphere) {
      this.atmosphere.removeFromParent();
      this.atmosphere.geometry.dispose();
      (this.atmosphere.material as THREE.Material).dispose();
      this.atmosphere.dispose();
      this.atmosphere = null;
    }
    const list = [...this.worlds.values()].filter((w) => this.view.kind !== "world" || w.spec.id === this.view.id);
    if (!list.length) return;
    // Atmosphere only provides a smooth rim; it needs fewer vertices than a planet.
    const geometry = new THREE.SphereGeometry(1, 24, 16);
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.ShaderMaterial({ vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending }),
      list.length,
    );
    const strength = new Float32Array(list.length);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    list.forEach((w, i) => {
      m.compose(w.pos, new THREE.Quaternion(), new THREE.Vector3().setScalar(w.radius * 1.13));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(w.spec.accent));
      strength[i] = w.spec.dim ? 0.2 : 0.55;
    });
    geometry.setAttribute("aStrength", new THREE.InstancedBufferAttribute(strength, 1));
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.atmosphere = mesh;
    this.worldGroup.add(mesh);
  }

  /** A curved bridge of light from each world to the core, and the particles that flow along it. */
  private buildBridges(): void {
    const list = [...this.worlds.values()];
    if (!list.length) return;
    const SEG = 40;
    const linePos = new Float32Array(list.length * SEG * 2 * 3);
    const lineCol = new Float32Array(list.length * SEG * 2 * 4);
    const flowCount = list.reduce((n, w) => n + (w.spec.dim ? 0 : 5), 0);
    const p0s = new Float32Array(flowCount * 3);
    const p1s = new Float32Array(flowCount * 3);
    const p2s = new Float32Array(flowCount * 3);
    const phases = new Float32Array(flowCount);
    const speeds = new Float32Array(flowCount);
    const colors = new Float32Array(flowCount * 3);
    const accent = new THREE.Color();
    const core = CORE_COLOR.clone();
    const tmp = new THREE.Color();
    let li = 0;
    let fi = 0;
    for (const w of list) {
      const dir = w.pos.clone().normalize();
      const p0 = w.pos.clone().addScaledVector(dir, -w.radius * 1.02);
      const p2 = dir.clone().multiplyScalar(LAYOUT.coreRadius * 1.15);
      const p1 = p0.clone().add(p2).multiplyScalar(0.5).add(new THREE.Vector3(0, p0.distanceTo(p2) * 0.2, 0));
      const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
      const pts = curve.getPoints(SEG);
      accent.set(w.spec.accent);
      const dim = w.spec.dim ? 0.3 : 1;
      for (let s = 0; s < SEG; s++) {
        for (const k of [s, s + 1]) {
          const t = k / SEG;
          linePos.set([pts[k].x, pts[k].y, pts[k].z], li * 3);
          tmp.copy(accent).lerp(core, t);
          lineCol.set([tmp.r, tmp.g, tmp.b, (0.16 + 0.34 * Math.abs(1 - 2 * t) ** 2) * dim], li * 4);
          li++;
        }
      }
      if (!w.spec.dim) {
        for (let k = 0; k < 5; k++) {
          p0s.set([p0.x, p0.y, p0.z], fi * 3);
          p1s.set([p1.x, p1.y, p1.z], fi * 3);
          p2s.set([p2.x, p2.y, p2.z], fi * 3);
          phases[fi] = k / 5 + (w.spec.placement.slot * 0.137) % 1;
          speeds[fi] = 0.09 + ((w.spec.placement.slot * 0.07) % 0.05);
          colors.set([accent.r, accent.g, accent.b], fi * 3);
          fi++;
        }
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
    lg.setAttribute("color", new THREE.BufferAttribute(lineCol, 4));
    this.bridges = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.bridges.renderOrder = 1;
    this.worldGroup.add(this.bridges);

    if (flowCount) {
      const fg = new THREE.BufferGeometry();
      fg.setAttribute("position", new THREE.BufferAttribute(p1s.slice(), 3));
      fg.setAttribute("aP0", new THREE.BufferAttribute(p0s, 3));
      fg.setAttribute("aP1", new THREE.BufferAttribute(p1s, 3));
      fg.setAttribute("aP2", new THREE.BufferAttribute(p2s, 3));
      fg.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
      fg.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
      fg.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
      this.flow = new THREE.Points(fg, this.flowMaterial);
      this.flow.frustumCulled = false;
      this.flow.renderOrder = 3;
      this.worldGroup.add(this.flow);
    }
  }

  private clearWorlds(): void {
    this.clearMoons();
    this.surfaceFocus = null;
    this.environmentFocus = undefined;
    this.labelsNeedLayout = true;
    for (const w of this.worlds.values()) {
      if (w.logo) w.logo.onload = null;
      w.material.dispose();
      w.surface.texture.dispose();
      for (const l of [w.label, w.chip]) {
        l.material.dispose();
        l.texture.dispose();
      }
    }
    this.worlds.clear();
    if (this.atmosphere) {
      this.atmosphere.geometry.dispose();
      (this.atmosphere.material as THREE.Material).dispose();
      this.atmosphere.dispose();
    }
    if (this.bridges) {
      this.bridges.geometry.dispose();
      (this.bridges.material as THREE.Material).dispose();
    }
    this.flow?.geometry.dispose();
    this.atmosphere = null;
    this.bridges = null;
    this.flow = null;
    this.worldGroup.clear();
    this.hoverId = null;
  }

  /** Focused inspection keeps only the selected planet's geometry and atmosphere. */
  private applySceneFocus(id: string | null): void {
    if (this.environmentFocus === id) return;
    this.environmentFocus = id;
    for (const w of this.worlds.values()) {
      w.mesh.visible = !id || w.spec.id === id;
      w.mesh.geometry = w.spec.id === id ? this.sphere : this.overviewSphere;
      for (const l of id ? (w.spec.id !== id || w.spec.districts.length > 14 ? [w.label, w.chip] : [w.chip]) : []) {
        l.sprite.visible = false;l.opacity = 0;l.material.opacity = 0;
      }
    }
    this.core.visible = !id;
    if (this.coreLabel && id) {this.coreLabel.sprite.visible = false;this.coreLabel.opacity = 0;}
    if (this.bridges) this.bridges.visible = !id;
    if (this.flow) this.flow.visible = !id;
    this.hoverId = null;
    this.hoverRing.visible = false;
    this.buildAtmosphere();
  }

  /** Only the selected planet has moons, so the overview stays easy to read. */
  private syncMoons(): void {
    const id = this.view.kind === "world" ? this.view.id : null;
    this.applySceneFocus(id);
    if (this.surfaceFocus !== id) {
      const previous = this.surfaceFocus ? this.worlds.get(this.surfaceFocus) : undefined;
      if (previous) this.resizeSurface(previous, ...this.surfaceSize());
      const next = id ? this.worlds.get(id) : undefined;
      if (next) this.resizeSurface(next, 2048, 1024);
      this.surfaceFocus = next ? id : null;
    }
    if (id && this.moons?.worldId === id) return;
    this.clearMoons();
    const w = id ? this.worlds.get(id) : undefined;
    if (!w || !w.spec.districts.length) return;
    const placements = moonLayout(w.spec.id, w.radius, w.spec.districts);
    const material = new THREE.ShaderMaterial({ vertexShader: MOON_VERT, fragmentShader: MOON_FRAG });
    const dense = placements.length > 14;
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, dense ? 16 : 20, dense ? 10 : 12), material, placements.length);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    placements.forEach((p, i) => {
      position.copy(w.pos).add(new THREE.Vector3(p.x, p.y, p.z));
      matrix.compose(position, rotation, scale.setScalar(p.radius));
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, color.set(w.spec.districts[i].color).lerp(new THREE.Color("#a1a1aa"), 0.22));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.userData.worldId = w.spec.id;
    this.worldGroup.add(mesh);
    const labels = new MoonLabels(w.spec.districts.map((d) => ({ slug: d.slug, name: d.label, count: d.count, unit: d.count === 1 ? w.spec.companyLabels.one : w.spec.companyLabels.many })),
      (slug) => {this.setDistrict(slug);this.hooks.onPick(w.spec.id, slug);},
      (slug) => {
        const moons = this.moons;
        if (!moons || moons.worldId !== w.spec.id) return;
        const index = slug ? placements.findIndex((p) => p.slug === slug) : -1;
        const hover = index < 0 ? null : index;
        if (moons.hover === hover) return;
        moons.hover = hover;this.updateMoonLabel();this.invalidate();
      }, this.canvas);
    if (this.host) this.host.appendChild(labels.root);
    this.moons = { worldId: w.spec.id, mesh, placements, labels, hover: null, selected: null };
    this.labelsNeedLayout = true;
  }

  private clearMoons(): void {
    if (!this.moons) return;
    const { mesh, labels } = this.moons;
    mesh.removeFromParent();
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    mesh.dispose();
    labels.dispose();
    this.moons = null;
    this.labelsNeedLayout = true;
  }

  private surfaceSize(): [number, number] {
    return this.specs.length <= 20 ? [1024, 512] : this.specs.length <= 80 ? [512, 256] : [256, 128];
  }

  /** Spend texture detail on the planet being inspected; release it when the view moves on. */
  private resizeSurface(world: WorldObject, width: number, height: number): void {
    if (world.surface.canvas.width === width && world.surface.canvas.height === height) return;
    const [canvas, ctx] = cpuCanvas(width, height);
    paintSurface(ctx, width, height, { id: world.spec.id, accent: world.spec.accent, districts: world.spec.districts, companies: world.spec.companies, dim: world.spec.dim });
    const texture = this.canvasTexture(canvas);
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const previous = world.surface.texture;
    world.surface = { canvas, ctx, texture };
    world.material.uniforms.uMap.value = texture;
    previous.dispose();
  }

  private updateMoonLabel(): void {
    const moons = this.moons;
    if (!moons) return;
    const w = this.worlds.get(moons.worldId);
    if (w) {
      const color = new THREE.Color();
      const neutral = new THREE.Color("#a1a1aa");
      const white = new THREE.Color("#ffffff");
      moons.placements.forEach((p, i) => {
        color.set(w.spec.districts[i].color).lerp(neutral, 0.22);
        if (p.slug === moons.selected) color.lerp(white, 0.78);
        else if (i === moons.hover) color.lerp(white, 0.3);
        moons.mesh.setColorAt(i, color);
      });
      if (moons.mesh.instanceColor) moons.mesh.instanceColor.needsUpdate = true;
    }
    moons.labels.setSelected(moons.selected);
    moons.labels.setHovered(moons.hover === null ? null : moons.placements[moons.hover].slug);
  }

  /** After a context restore: every canvas is painted again and uploaded. */
  private repaintAll(): void {
    paintAurora(this.sky.ctx, this.sky.canvas.width, this.sky.canvas.height);
    this.sky.texture.needsUpdate = true;
    paintGlow(this.glow.ctx, this.glow.canvas.width, GLOW_STOPS);
    this.glow.texture.needsUpdate = true;
    for (const w of this.worlds.values()) {
      paintSurface(w.surface.ctx, w.surface.canvas.width, w.surface.canvas.height, { id: w.spec.id, accent: w.spec.accent, districts: w.spec.districts, companies: w.spec.companies, dim: w.spec.dim });
      w.surface.texture.needsUpdate = true;
    }
    this.repaintLabels();
  }

  /* ---------- Framing ---------- */

  private visible(): { vw: number; vh: number; tan: number } {
    const { w, h } = this.size;
    const g = this.insetsGoal;
    return { vw: Math.max(140, w - g.left - g.right), vh: Math.max(140, h - g.top - g.bottom), tan: Math.tan(THREE.MathUtils.degToRad(FOV / 2)) };
  }

  /** How far the camera stands to fit the whole disc in the visible part of the screen. */
  private fitDistance(elevation: number): number {
    const R = extent(this.specs.map((s) => s.placement));
    const { vw, vh, tan } = this.visible();
    const h = this.size.h;
    const tanH = (tan * vw) / h;
    const tanV = (tan * vh) / h;
    const dH = (R * 1.08) / tanH;
    // The disc seen from `elevation`, plus room for the labels above the worlds.
    const dV = (R * (Math.sin(elevation) + 0.5)) / tanV;
    return Math.max(dH, dV, 30) + R * 0.25;
  }

  /** How high the camera looks down on the disc: more from above on a tall, narrow screen, where the disc then fills the width. */
  private elevation(kind: "hero" | "overview"): number {
    const { vw, vh } = this.visible();
    const portrait = vw / vh < 0.9;
    if (kind === "hero") return portrait ? 0.8 : 0.42;
    return portrait ? 0.95 : 0.55;
  }

  /** A label's height on screen in CSS pixels, while the camera is near enough. */
  private labelPx(): number {
    if (this.view.kind === "hero") {
      const scale = Math.min(1.5, Math.max(1, this.size.w / (2048 / 1.5)));
      return this.size.w < 720 ? 36 : 42 * scale;
    }
    return this.size.w < 720 ? 42 : 50;
  }

  private azimuth(): number {
    const v = this.camera.position.clone().sub(this.controls.target);
    return Math.atan2(v.x, v.z);
  }

  private orbitAt(distance: number, elevation: number, azimuth: number): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)).multiplyScalar(distance);
  }

  private heroFraming(azimuth: number) {
    const el = this.elevation("hero");
    const scale = this.size.w >= 900 ? 0.8 : 0.95;
    return { pos: this.orbitAt(this.fitDistance(el) * scale, el, azimuth), target: new THREE.Vector3() };
  }

  private overviewFraming(azimuth: number) {
    const el = this.elevation("overview");
    return { pos: this.orbitAt(this.fitDistance(el), el, azimuth), target: new THREE.Vector3() };
  }

  private worldFraming(id: string) {
    const w = this.worlds.get(id);
    if (!w) return this.overviewFraming(this.azimuth());
    const out = new THREE.Vector3(w.pos.x, 0, w.pos.z);
    if (out.lengthSq() < 1e-6) out.set(0, 0, 1);
    out.normalize();
    const side = new THREE.Vector3(-out.z, 0, out.x);
    // Mostly from the side, a little outward: the lit half and the core both in view.
    const dir = out.multiplyScalar(0.5).addScaledVector(side, 0.87).normalize();
    const { vw, vh, tan } = this.visible();
    const moonExtent = this.moons?.worldId === id ? Math.max(w.radius, ...this.moons.placements.map((p) => p.orbit + p.radius)) : w.radius;
    const d = Math.max(w.radius * 2.6, (w.radius * this.size.h) / (tan * 0.36 * Math.min(vw, vh)), (moonExtent * this.size.h) / (tan * 0.82 * Math.min(vw, vh)));
    const pos = w.pos
      .clone()
      .addScaledVector(dir, d * Math.cos(WORLD_ELEVATION))
      .add(new THREE.Vector3(0, d * Math.sin(WORLD_ELEVATION), 0));
    return { pos, target: w.pos.clone() };
  }

  private framing() {
    const az = this.azimuth();
    if (this.view.kind === "hero") return this.heroFraming(az);
    if (this.view.kind === "world") return this.worldFraming(this.view.id);
    return this.overviewFraming(az);
  }

  /** Puts the camera where the current view frames it, at once (the worlds or the screen changed). */
  private frameView(): void {
    this.flight = null;
    this.userMoved = false;
    const f = this.framing();
    this.camera.position.copy(f.pos);
    this.controls.target.copy(f.target);
    this.syncControls();
    this.placeRings();
  }

  private flyTo(to: () => { pos: THREE.Vector3; target: THREE.Vector3 }, opts: { duration: number; ease?: (t: number) => number; arc?: number; fixed?: boolean }): void {
    this.placeRings();
    this.userMoved = false;
    if (this.reduced || !this.host) {
      this.flight = null;
      if (this.reduced) this.applyInsets(1);
      const f = to();
      this.camera.position.copy(f.pos);
      this.controls.target.copy(f.target);
      this.syncControls();
      this.invalidate();
      return;
    }
    const from = this.camera.position.clone();
    const end = to();
    const length = from.distanceTo(end.pos);
    this.flight = {
      fromPos: from,
      fromTarget: this.controls.target.clone(),
      to,
      start: performance.now(),
      duration: opts.duration * 1000 * (opts.fixed ? 1 : Math.min(1.4, Math.max(0.7, length / 80))),
      ease: opts.ease ?? easeInOut,
      arc: opts.arc ?? 0.12,
    };
    this.invalidate();
  }

  private finishFlight(): void {
    if (!this.flight) return;
    const f = this.flight.to();
    this.flight = null;
    this.camera.position.copy(f.pos);
    this.controls.target.copy(f.target);
    this.syncControls();
  }

  private syncControls(): void {
    this.camera.lookAt(this.controls.target);
    const auto = this.controls.autoRotate;
    const damping = this.controls.enableDamping;
    this.controls.autoRotate = false;
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.autoRotate = auto;
    this.controls.enableDamping = damping;
  }

  /** Input, drift and distance limits for the current view and motion preference. */
  private applyControls(): void {
    if (!this.controlsConnected) {
      this.controls.connect(this.canvas);
      this.controlsConnected = true;
    }
    const hero = this.view.kind === "hero";
    this.controls.enableZoom = !hero;
    this.canvas.style.touchAction = hero ? "pan-y pinch-zoom" : "none";
    this.canvas.style.cursor = "grab";
    this.controls.enableDamping = !this.reduced;
    this.controls.autoRotateSpeed = this.view.kind === "hero" ? 0.35 : 0.22;
    const fit = this.fitDistance(this.elevation("overview"));
    if (this.view.kind === "world" && this.worlds.has(this.view.id)) {
      this.controls.minDistance = this.worlds.get(this.view.id)!.radius * 1.6;
    } else {
      this.controls.minDistance = LAYOUT.coreRadius * 2.5;
    }
    this.controls.maxDistance = fit * 1.8;
  }

  private placeRings(): void {
    const id = this.view.kind === "world" ? this.view.id : null;
    const w = id ? this.worlds.get(id) : undefined;
    this.selectRing.visible = !!w;
    if (w) {
      this.selectRing.position.copy(w.pos);
      this.selectRing.scale.setScalar(w.radius * 1.5);
      const c = new THREE.Color(w.spec.accent);
      for (const r of this.selectRing.children as THREE.Mesh[]) (r.material as THREE.MeshBasicMaterial).color.copy(c).lerp(new THREE.Color("#ffffff"), 0.35);
    }
    const h = this.hoverId && this.hoverId !== id ? this.worlds.get(this.hoverId) : undefined;
    this.hoverRing.visible = !!h;
    if (h) {
      this.hoverRing.position.copy(h.pos);
      this.hoverRing.scale.setScalar(h.radius * 1.4);
    }
  }

  /* ---------- Frame loop ---------- */

  private resize(): void {
    if (!this.host) return;
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    if (w === this.size.w && h === this.size.h) return;
    this.size = { w, h };
    // Preserve native pixels and use a bounded retina budget for fine surface and label detail.
    const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2.5, Math.sqrt(8_000_000 / (w * h))));
    this.renderer.setPixelRatio(ratio);
    this.starMaterial.uniforms.uPixelRatio.value = ratio;
    this.flowMaterial.uniforms.uPixelRatio.value = ratio;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.applyInsets(1);
    this.applyControls();
    // Keep the visitor's own camera; re-frame only a view they have not moved.
    if (!this.flight && !this.interacting && !this.userMoved) this.frameView();
    this.invalidate();
  }

  private applyInsets(t: number): boolean {
    const now = this.insetsNow;
    const goal = this.insetsGoal;
    let moving = false;
    for (const k of ["top", "right", "bottom", "left"] as const) {
      const d = goal[k] - now[k];
      if (Math.abs(d) < 0.5 || t >= 1) now[k] = goal[k];
      else {
        now[k] += d * t;
        moving = true;
      }
    }
    const { w, h } = this.size;
    let ox = (now.right - now.left) / 2;
    let oy = (now.bottom - now.top) / 2;
    const centered = Math.abs(ox) < 0.5 && Math.abs(oy) < 0.5;
    if (centered) { ox = 0;oy = 0; }
    const previous = this.insetProjection;
    if (previous.w !== w || previous.h !== h || previous.x !== ox || previous.y !== oy) {
      if (centered) this.camera.clearViewOffset();
      else this.camera.setViewOffset(w, h, ox, oy, w, h);
      previous.w = w;previous.h = h;previous.x = ox;previous.y = oy;
    }
    return moving;
  }

  private stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.running = false;
  }

  private onVisibilityChange = (): void => {
    if (document.hidden) this.stop();
    else this.invalidate();
  };

  private tick = (now: number): void => {
    this.raf = 0;
    if (this.disposed || !this.host || !this.active || document.hidden) {
      this.running = false;
      return;
    }
    // Input and camera damping use a 60 Hz ceiling; quiet ambient motion uses 24 Hz.
    const interval = this.interacting || this.flight || now < this.idleUntil ? 1000 / 60 : 1000 / 24;
    if (now - this.last < interval - 1) {
      this.raf = requestAnimationFrame(this.tick);
      return;
    }
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.dirty = false;
    const busy = this.update(dt, now);
    this.renderer.render(this.scene, this.camera);
    if (busy || this.dirty) this.raf = requestAnimationFrame(this.tick);
    else this.running = false;
  };

  /** Advances everything by dt seconds. Returns true while anything still moves. */
  private update(dt: number, now: number): boolean {
    let busy = false;
    const animate = !this.reduced && this.view.kind !== "world";
    if (animate) {
      this.time += dt;
      this.flowMaterial.uniforms.uTime.value = this.time;
      this.skyMaterial.uniforms.uTime.value = this.time;
      const [crystal, inner, cage] = this.coreSpin;
      crystal.rotation.y += dt * 0.25;
      crystal.rotation.x += dt * 0.08;
      inner.rotation.y -= dt * 0.18;
      cage.rotation.y += dt * 0.07;
      cage.rotation.z += dt * 0.03;
      this.rings.forEach((r, i) => (r.rotation.z += dt * (0.05 + i * 0.03) * (i % 2 ? -1 : 1)));
      busy = true;
    }
    if (this.reduced) this.skyMaterial.uniforms.uTime.value = 0;

    if (this.applyInsets(this.reduced ? 1 : 1 - Math.exp(-dt * 7))) busy = true;

    if (this.flight) {
      const f = this.flight;
      const t = Math.min(1, (now - f.start) / f.duration);
      const e = f.ease(t);
      const end = f.to();
      const pos = f.fromPos.clone().lerp(end.pos, e);
      pos.y += Math.sin(Math.PI * e) * f.fromPos.distanceTo(end.pos) * f.arc;
      this.camera.position.copy(pos);
      this.controls.target.copy(f.fromTarget.clone().lerp(end.target, e));
      this.camera.lookAt(this.controls.target);
      if (t >= 1) {
        this.flight = null;
        this.syncControls();
        this.applyControls();
      }
      busy = true;
    } else {
      const drift = animate && !this.interacting && now > this.idleUntil && (this.view.kind === "hero" || this.view.kind === "overview");
      this.controls.autoRotate = drift;
      if (this.controls.update(dt)) busy = true;
    }

    if (this.updateLabels(dt)) busy = true;
    return busy;
  }

  /**
   * Labels keep a steady size on screen up to a distance, then shrink, then fade out. They never
   * overlap one another, sit under the HUD or cover another world (lib/declutter.ts): the world
   * in view keeps its label, then the nearest win. A world's label stands above it, or on another
   * side when that is taken; one with no room shows its logo alone. Returns true while a label is
   * still fading.
   */
  private updateLabels(dt: number): boolean {
    const { w: W, h: H } = this.size;
    this.camera.updateMatrixWorld();
    if (!this.labelsNeedLayout && !this.labelsFading && this.labelCamera.equals(this.camera.matrixWorld) && this.labelProjection.equals(this.camera.projectionMatrix)) return false;
    this.labelsNeedLayout = false;
    this.labelCamera.copy(this.camera.matrixWorld);
    this.labelProjection.copy(this.camera.projectionMatrix);
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const k = (this.labelPx() / H) * 2 * tan;
    const hero = this.view.kind === "hero";
    // On narrow screens the fitted camera can stand beyond 150 units. Keep its labels legible.
    const near = hero ? this.fitDistance(this.elevation("overview")) * 1.08 : Math.min(this.fitDistance(this.elevation("overview")) * 1.08, 150);
    const focus = this.view.kind === "world" ? this.view.id : null;
    const moons = this.moons;
    const ins = this.insetsGoal;
    const area = { l: ins.left + 4, t: ins.top + 4, r: W - ins.right - 4, b: H - ins.bottom - 4 };
    const inverse = this.camera.matrixWorldInverse;
    const v = new THREE.Vector3();
    /** A point's place on screen, and how far in front of the camera it is (what a sprite's size follows). */
    const onScreen = (p: THREE.Vector3) => {
      const depth = -v.copy(p).applyMatrix4(inverse).z;
      v.copy(p).project(this.camera);
      return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H, depth, behind: v.z > 1 || depth <= 0 };
    };
    const GAP = 6;
    const items: { label: LabelObject; chip: LabelObject | null; base: number; box: LabelBox; x: number; y: number; px: number }[] = [];
    const discs: Disc[] = [];
    const add = (id: string, label: LabelObject, chip: LabelObject | null, center: THREE.Vector3, radius: number, lift: number, solid: boolean) => {
      const body = onScreen(center);
      const depth = Math.max(0.001, body.depth);
      const height = k * Math.min(depth, near);
      label.sprite.scale.set(height * label.aspect, height, 1);
      label.sprite.position.y = center.y + lift + height * 0.08;
      const px = (height / (2 * tan * depth)) * H;
      const { x, y, behind } = onScreen(label.sprite.position);
      const pw = px * label.aspect;
      const focused = id === focus;
      label.sprite.renderOrder = focused ? 7 : 5;
      const disc = { x: body.x, y: body.y, r: (radius * H) / (2 * tan * depth) };
      // Above the world; near a screen edge the label shifts along it, so an edge planet keeps its label on screen.
      const cx = THREE.MathUtils.clamp(x, area.l + pw / 2, Math.max(area.l + pw / 2, area.r - pw / 2));
      const cy = THREE.MathUtils.clamp(y, area.t + px, area.b);
      // The other places: below the world, right of it, left of it; then the same four for its logo alone.
      const reach = disc.r + GAP;
      const around = (w: number): Rect[] => [
        { l: disc.x - w / 2, r: disc.x + w / 2, t: disc.y + reach, b: disc.y + reach + px },
        { l: disc.x + reach, r: disc.x + reach + w, t: disc.y - px / 2, b: disc.y + px / 2 },
        { l: disc.x - reach - w, r: disc.x - reach, t: disc.y - px / 2, b: disc.y + px / 2 },
      ];
      const alternates: Rect[] = focus ? [] : around(pw);
      if (chip && !focus) {
        chip.sprite.scale.set(height * chip.aspect, height, 1);
        chip.sprite.position.y = label.sprite.position.y;
        const cw = px * chip.aspect;
        alternates.push({ l: x - cw / 2, r: x + cw / 2, t: y - px, b: y }, ...around(cw));
      }
      let own: number | undefined;
      if (solid && !body.behind) {
        own = discs.length;
        discs.push(disc);
      }
      items.push({
        label,
        chip,
        x,
        y,
        px,
        base: behind || x < -pw / 2 || x > W + pw / 2 || y < -px || y > H + px || px < 28 || (focus && (!focused || (moons?.placements.length ?? 0) > 14)) ? 0 : 1,
        box: { rect: { l: cx - pw / 2, r: cx + pw / 2, t: cy - px, b: cy }, alternates, own, priority: this.camera.position.distanceTo(center), pinned: !behind && focused && !moons?.selected },
      });
    };
    for (const w of this.worlds.values()) add(w.spec.id, w.label, w.chip, w.pos, w.radius, w.radius + 0.35, w.mesh.visible);
    // The core counts with its inner rings: labels keep clear of them.
    if (this.coreLabel) add("core", this.coreLabel, null, this.core.position, LAYOUT.coreRadius * 1.5, LAYOUT.coreRadius * 2.3, this.core.visible);
    const candidates = items.filter((it) => it.base > 0);
    const taken = place(candidates.map((it) => it.box), area, { discs, blocked: hero && this.heroOverlay ? [...this.keepOut, this.heroOverlay] : this.keepOut });
    // Which place each label or logo takes now: the label's four sides come first, then the logo's.
    const sides = new Map<LabelObject, number>();
    const shown: Rect[] = [];
    candidates.forEach((it, i) => {
      const at = taken[i];
      if (at < 0) return;
      const sprite = it.chip && at >= 4 ? it.chip : it.label;
      const rect = at ? it.box.alternates![at - 1] : it.box.rect;
      // Sprite centers shift the label alone: its anchor stays above its world.
      sprite.sprite.center.set(0.5 + (it.x - (rect.l + rect.r) / 2) / Math.max(1, rect.r - rect.l), (rect.b - it.y) / Math.max(1, it.px));
      sides.set(sprite, at);
      shown.push(rect);
    });
    if (moons) {
      const w = this.worlds.get(moons.worldId);
      if (w) {
        const body = onScreen(w.pos);
        const planet = body.behind ? undefined : { x: body.x, y: body.y, r: (w.radius * H) / (2 * tan * body.depth) };
        const anchors: MoonAnchor[] = [];
        const at = new THREE.Vector3();
        for (const p of moons.placements) {
          const moon = onScreen(at.set(w.pos.x + p.x, w.pos.y + p.y, w.pos.z + p.z));
          const hidden = !!planet && moon.depth > body.depth && Math.hypot(moon.x - planet.x, moon.y - planet.y) < planet.r;
          anchors.push({ slug: p.slug, x: moon.x, y: moon.y, radius: (p.radius * H) / (2 * tan * Math.max(0.001, moon.depth)), hidden });
        }
        moons.labels.update(anchors, area, [...shown, ...this.keepOut], planet);
      }
    }

    let fading = false;
    const ease = this.reduced ? 1 : 1 - Math.exp(-dt * 10);
    const fade = (label: LabelObject, base: number) => {
      const at = sides.get(label) ?? -1;
      const target = at < 0 ? 0 : base;
      // A label that changes sides fades in at its new place.
      if (at >= 0 && label.side >= 0 && at !== label.side) label.opacity = 0;
      if (at >= 0) label.side = at;
      let next = label.opacity + (target - label.opacity) * ease;
      if (Math.abs(next - target) < 0.01) next = target;
      else fading = true;
      label.opacity = next;
      label.material.opacity = next;
      label.sprite.visible = next > 0.01;
    };
    for (const it of items) {
      fade(it.label, it.base);
      if (it.chip) fade(it.chip, it.base);
    }
    this.labelsFading = fading;
    return fading;
  }

  /* ---------- Picking ---------- */

  private pick(clientX: number, clientY: number): string | null {
    this.pickedDistrict = undefined;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const labels: THREE.Object3D[] = [];
    let nearest = Infinity;
    let picked: string | null = null;
    const sphere = this.pickSphere, hitPoint = this.pickPoint;
    const hitSphere = (center: THREE.Vector3, radius: number, id: string, district?: string) => {
      sphere.center.copy(center);sphere.radius = radius;
      if (!this.raycaster.ray.intersectSphere(sphere, hitPoint)) return;
      const distance = this.raycaster.ray.origin.distanceToSquared(hitPoint);
      if (distance >= nearest) return;
      nearest = distance;picked = id;this.pickedDistrict = district;
    };
    if (this.core.visible) hitSphere(this.core.position, LAYOUT.coreRadius * 1.1, "core");
    for (const w of this.worlds.values()) {
      if (w.mesh.visible) hitSphere(w.pos, w.radius, w.spec.id);
      if (w.label.sprite.visible) labels.push(w.label.sprite);
      if (w.chip.sprite.visible) labels.push(w.chip.sprite);
    }
    if (this.coreLabel?.sprite.visible) labels.push(this.coreLabel.sprite);
    if (this.moons) {
      const w = this.worlds.get(this.moons.worldId);
      if (w) {
        const center = this.pickCenter;
        for (const p of this.moons.placements) {
          center.set(w.pos.x + p.x, w.pos.y + p.y, w.pos.z + p.z);
          hitSphere(center, p.radius, w.spec.id, p.slug);
        }
      }
    }
    const hit = this.raycaster.intersectObjects(labels, false)[0];
    if (hit && hit.distance ** 2 < nearest) {
      this.pickedDistrict = undefined;
      picked = (hit.object.userData.worldId as string | undefined) ?? null;
    }
    return picked;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  private onPointerUp = (e: PointerEvent): void => {
    const d = this.down;
    this.down = null;
    if (!d || e.button !== 0) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 600) return;
    const id = this.pick(e.clientX, e.clientY);
    if (this.pickedDistrict) this.setDistrict(this.pickedDistrict);
    this.hooks.onPick(id, this.pickedDistrict);
  };

  private onPointerCancel = (): void => {
    this.down = null;
    this.onPointerLeave();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType !== "mouse" || e.buttons) return;
    this.lastMove = e;
    if (this.hoverQueued) return;
    this.hoverQueued = true;
    requestAnimationFrame(() => {
      this.hoverQueued = false;
      const m = this.lastMove;
      if (!m || this.disposed) return;
      const id = this.pick(m.clientX, m.clientY);
      if (this.moons) {
        const index = this.pickedDistrict ? this.moons.placements.findIndex((p) => p.slug === this.pickedDistrict) : -1;
        const hover = index < 0 ? null : index;
        if (this.moons.hover !== hover) {
          this.moons.hover = hover;
          this.updateMoonLabel();
          this.invalidate();
        }
      }
      const world = id && id !== "core" ? id : null;
      this.canvas.style.cursor = id ? "pointer" : "grab";
      if (world !== this.hoverId) {
        this.hoverId = world;
        this.placeRings();
        this.invalidate();
      }
    });
  };

  private onPointerLeave = (): void => {
    this.lastMove = null;
    if (this.moons && this.moons.hover !== null) {
      this.moons.hover = null;
      this.updateMoonLabel();
      this.invalidate();
    }
    if (this.hoverId) {
      this.hoverId = null;
      this.placeRings();
      this.invalidate();
    }
  };
}
