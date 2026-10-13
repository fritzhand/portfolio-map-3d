// @ts-nocheck
// The map's world: an island generated from the map's own data.
//
// One plan (mapLayout.ts, worked out from src/data/layout.ts and the walker's scale) says where
// everything stands; mapGround.ts gives the ground's height there. This file builds it: the terrain
// mesh and its painted ground, the sea around it, the campus models from art/ (campus.ts places them:
// trees, shrubs, stones and palms; each district's gateway, pylon, landmark, totems and dressing; the
// founding plaza and its wayfinding), the homes, parks and play areas between the districts
// (mapVignettes.ts), the shuttle (shuttle.ts), the set pieces round the rim (mapPieces.ts), a BVH
// collider (terrain + prop boxes), the walker with its controls, camera and sound, and the map
// overlay (mapOverlay.ts: pins, HUD, minimap).

import {
  AnimationMixer,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  HemisphereLight,
  InstancedBufferAttribute,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  Spherical,
  Vector3,
} from 'three';
import { gsap } from 'gsap';
import { islandCatalog } from './catalogFor';
import { layoutWorld, seededRandom } from '../data/layout';
import { L } from '../site';
import { GROUND_COLORS, SEA_Y, beachSpots, coveSand, hillSide, islandHeight, scatter, seaSound } from './mapGround';
import { CAMERA, DISTRICT_PAVING, MONUMENT_PAD, ROAD_W, dressingFor, faceToward, kidTheta, planFromLayout, plazaDressing, type DressingPlan, type MapPlan } from './mapLayout';
import { bladeMesh, walkingTimesMesh } from './displays';
import { anchorMatrix, anchorsOf, placeModel, ringBoxes, type Placement } from './campus';
import { NEUTRAL_ACCENT, setDistrictColors } from './palette';
import { boardMesh } from './boards';
import { watchTheme } from './theme';
import { addShuttle } from './shuttle';
import { inVignette, vignettesFor, type Vignette } from './mapVignettes';
import { screenAtlas, screenMeshes, type ScreenQuad } from './screens';
import { companyBadge, personBadge } from '../three/logoTexture';
import { client } from './core/client';
import { events } from './core/events';
import { clock } from './engine/clock';
import { AudioController } from './engine/audio';
import { Characters } from './engine/characters';
import { BaseScene } from './engine/scene';
import { FollowSunLight } from './engine/sunlight';
import { geometryLoader } from './engine/loaders/geometries';
import { createInstancedGeometry } from './engine/loaders/instancing';
import { depthCharsMaterial, phongMaterial } from './scene/materials';
import { makeInstanced } from './scene/helpers';
import { Sky } from './scene/sky';
import { Sea } from './scene/sea';
import { buildMapOverlay } from './mapOverlay';
import { buildPieces } from './mapPieces';
import { onMarina } from './pieces/models';
import { cpuCanvas } from '../three/cpuCanvas';

/** The people area's color on the island and in the HUD (never a district's). */
export const PEOPLE_COLOR = '#8a8f98';
const TEX = 2048;

/**
 * Paint the island's ground: sea bed, sand, grass and hills, the plaza and its paths, the ring street,
 * the roads, the district pavings. `glow` gets the lines of light alone (on black), which the ground
 * adds at night.
 */
function paintGround(plan: MapPlan, extent: number): { canvas: HTMLCanvasElement; glow: HTMLCanvasElement } {
  const [canvas, ctx] = cpuCanvas(TEX, TEX);
  const [glow, gctx] = cpuCanvas(TEX / 2, TEX / 2);
  gctx.fillStyle = '#000000';
  gctx.fillRect(0, 0, TEX / 2, TEX / 2);
  gctx.scale(0.5, 0.5);
  const px = TEX / (extent * 2);
  const w = (v: number) => (v + extent) * px;
  const C = GROUND_COLORS;
  const rand = seededRandom(7);
  const disc = (x: number, z: number, r: number) => {
    ctx.beginPath();
    ctx.arc(w(x), w(z), Math.max(0, r * px), 0, Math.PI * 2);
  };
  const { land, water } = plan.island;
  ctx.fillStyle = C.seabed;
  ctx.fillRect(0, 0, TEX, TEX);
  disc(0, 0, water + 4);
  ctx.fillStyle = C.sand;
  ctx.fill();
  ctx.strokeStyle = C.wetSand;
  ctx.lineWidth = 4 * px;
  disc(0, 0, water - 1);
  ctx.stroke();
  disc(0, 0, land);
  ctx.fillStyle = C.grass;
  ctx.fill();
  // A lawn, faintly mowed in patches, inside the shore.
  ctx.save();
  disc(0, 0, land - 1);
  ctx.clip();
  for (let i = 0; i < 420; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(155,208,124,0.18)' : 'rgba(127,184,98,0.18)';
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * land;
    ctx.beginPath();
    ctx.ellipse(w(Math.cos(a) * r), w(Math.sin(a) * r), (4 + rand() * 16) * px, (3 + rand() * 10) * px, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Hills a deeper green, the higher the darker; the coves' floors sandy toward the beach.
  const cell = 2.5;
  for (let z = -land; z < land; z += cell) {
    for (let x = -land; x < land; x += cell) {
      const sand = coveSand(plan, x + cell / 2, z + cell / 2);
      if (sand > 0.02) {
        ctx.fillStyle = C.sand;
        ctx.globalAlpha = Math.min(1, sand * 1.2);
        ctx.fillRect(w(x), w(z), cell * px + 1, cell * px + 1);
        continue;
      }
      const h = islandHeight(plan, x + cell / 2, z + cell / 2);
      if (h < 1.8) continue;
      ctx.fillStyle = C.hill;
      ctx.globalAlpha = Math.min(0.5, (h - 1.8) / 10);
      ctx.fillRect(w(x), w(z), cell * px + 1, cell * px + 1);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // A grid of joints across a paved disc (the campus's large slabs), clipped to it.
  const joints = (cx: number, cz: number, r: number, pitch: number) => {
    ctx.save();
    disc(cx, cz, r);
    ctx.clip();
    ctx.strokeStyle = C.pavingJoint;
    ctx.lineWidth = Math.max(1, 0.09 * px);
    ctx.beginPath();
    for (let v = -r; v <= r; v += pitch) {
      ctx.moveTo(w(cx + v), w(cz - r));
      ctx.lineTo(w(cx + v), w(cz + r));
      ctx.moveTo(w(cx - r), w(cz + v));
      ctx.lineTo(w(cx + r), w(cz + v));
    }
    ctx.stroke();
    ctx.restore();
  };
  // District pavings: pale slabs, a white kerb, a thin line of light in the district's color.
  for (const c of plan.clusters) {
    const R = c.r + DISTRICT_PAVING;
    disc(c.cx, c.cz, R);
    ctx.fillStyle = C.paving;
    ctx.fill();
    joints(c.cx, c.cz, R, 2.4);
    ctx.strokeStyle = C.kerb;
    ctx.lineWidth = 0.7 * px;
    disc(c.cx, c.cz, R - 0.35);
    ctx.stroke();
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 0.24 * px;
    disc(c.cx, c.cz, R - 1.2);
    ctx.stroke();
    disc(c.cx, c.cz, 7.2);
    ctx.stroke();
    // The same lines, glowing at night.
    gctx.strokeStyle = c.color;
    gctx.lineWidth = 0.5 * px;
    for (const r of [R - 1.2, 7.2]) {
      gctx.beginPath();
      gctx.arc(w(c.cx), w(c.cz), r * px, 0, Math.PI * 2);
      gctx.stroke();
    }
  }
  // Roads: concrete, a line of light in their district's color along each edge, a white line down the middle.
  ctx.lineCap = 'round';
  for (const s of plan.spokes) {
    ctx.strokeStyle = C.road;
    ctx.lineWidth = ROAD_W * px;
    ctx.beginPath();
    ctx.moveTo(w(s.ax), w(s.az));
    ctx.lineTo(w(s.bx), w(s.bz));
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  for (const s of plan.spokes) {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    const ux = (s.bx - s.ax) / len;
    const uz = (s.bz - s.az) / len;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 0.22 * px;
    gctx.strokeStyle = s.color;
    gctx.lineWidth = 0.5 * px;
    for (const side of [-1, 1]) {
      const o = (ROAD_W / 2 - 0.35) * side;
      for (const c2 of [ctx, gctx]) {
        c2.beginPath();
        c2.moveTo(w(s.ax - uz * o), w(s.az + ux * o));
        c2.lineTo(w(s.bx - uz * o), w(s.bz + ux * o));
        c2.stroke();
      }
    }
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = C.roadLine;
    ctx.lineWidth = 0.16 * px;
    ctx.setLineDash([3 * px, 2 * px]);
    ctx.beginPath();
    ctx.moveTo(w(s.ax), w(s.az));
    ctx.lineTo(w(s.bx), w(s.bz));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  // The ring street.
  ctx.strokeStyle = C.road;
  ctx.lineWidth = plan.street.width * px;
  disc(0, 0, plan.street.r);
  ctx.stroke();
  ctx.strokeStyle = C.roadLine;
  ctx.lineWidth = 0.32 * px;
  ctx.setLineDash([2.2 * px, 2.2 * px]);
  disc(0, 0, plan.street.r);
  ctx.stroke();
  ctx.setLineDash([]);
  // The plaza: slabs, two rings, and a path from the monument to each road in that road's colors.
  disc(0, 0, plan.plaza.r);
  ctx.fillStyle = C.plaza;
  ctx.fill();
  joints(0, 0, plan.plaza.r, 3);
  ctx.strokeStyle = C.plazaLine;
  ctx.lineWidth = 0.35 * px;
  for (const r of [plan.plaza.r - 1.2, MONUMENT_PAD + 6]) {
    disc(0, 0, r);
    ctx.stroke();
  }
  // Each path is the plaza's paving tinted with its road's color, fading in from the monument.
  ctx.lineCap = 'round';
  for (const c of plan.clusters) {
    const ux = Math.cos(c.angle);
    const uz = Math.sin(c.angle);
    const a = MONUMENT_PAD + 1;
    const b = plan.plaza.r + 0.5;
    const grad = ctx.createLinearGradient(w(ux * a), w(uz * a), w(ux * b), w(uz * b));
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.35, c.color);
    grad.addColorStop(1, c.color);
    ctx.strokeStyle = grad;
    ctx.globalAlpha = 0.2;
    ctx.lineWidth = 3.6 * px;
    ctx.beginPath();
    ctx.moveTo(w(ux * a), w(uz * a));
    ctx.lineTo(w(ux * b), w(uz * b));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.lineCap = 'butt';
  return { canvas, glow };
}

export interface BoxCollider {
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  ry: number;
}

export class MapScene extends BaseScene {
  declare audioController: AudioController;
  declare sky: Sky;
  declare sea: Sea;
  declare terrainMesh: Mesh;
  declare characters: { mesh: any };
  declare overlay: ReturnType<typeof buildMapOverlay>;
  plan: MapPlan;
  /** Each district's accent base row in the palette (palette.setDistrictColors). */
  accent: Map<string, number>;
  /** What stands in each district (mapLayout.dressingFor), in plan.clusters' order. */
  dressing: DressingPlan[];
  /** The homes, parks and play areas between the districts (mapVignettes.ts). */
  vignettes: Vignette[];
  /** Reduced motion: no swaying cloth. */
  readonly still: boolean;
  colliderBoxes: BoxCollider[] = [];
  /** Meshes a click stops at (buildings, gateways, pylons, trees), so it never reaches a totem behind them. */
  blockers: any[] = [];
  private propUpdates: Array<(time: number, camX: number, camZ: number) => void> = [];
  private shiftDown = false;

  constructor() {
    super();
    const { districts: DISTRICTS, companies: COMPANIES, people: PEOPLE } = islandCatalog();
    const layout = layoutWorld(DISTRICTS.map((d) => d.slug), COMPANIES, PEOPLE);
    this.plan = planFromLayout(
      layout,
      DISTRICTS.map((d) => ({ slug: d.slug, label: d.label, short: d.short, color: d.color, icon: d.icon, theme: d.theme })),
      { label: L.People, color: PEOPLE_COLOR },
    );
    // The vignettes between the districts; from here on the ground levels a pad for each.
    this.vignettes = vignettesFor(this.plan);
    this.plan.vignettes = this.vignettes;
    // Each district's rows in the palette; its assets take them through their accent slots.
    const bases = setDistrictColors(this.plan.clusters.map((c) => c.color));
    this.accent = new Map(this.plan.clusters.map((c, i) => [c.slug, bases[i]]));
    this.dressing = this.plan.clusters.map((c) => dressingFor(c));
    this.still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    void this.init();
  }

  /** The ground's height at (x, z): the ground truth every placement reads. */
  groundY(x: number, z: number): number {
    return islandHeight(this.plan, x, z);
  }

  private async init() {
    this.setupCamera();
    this.audioController = new AudioController(this, 0.25);
    this.audioController.beachBlend = (x: number, z: number) => seaSound(this.plan, x, z);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.shiftDown = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.shiftDown = false;
    });
    window.addEventListener('blur', () => {
      this.shiftDown = false;
    });
    const sky = new Sky(this as any);
    const sea = new Sea(this as any);
    await Promise.all([sky.ready, sea.ready]);
    this.sky = sky;
    this.sea = sea;
    this.surroundWithSea();
    this.buildTerrain();
    await this.scatterProps();
    // The overlay's hub pieces (monument, pylons, portal posts) collide.
    const overlay = buildMapOverlay(this as any);
    this.overlay = overlay;
    for (const b of overlay.colliders) this.colliderBoxes.push({ ...b, y: this.groundY(b.x, b.z) });
    await this.addCharacters();
    this.setupLights();
    (this.sea.mesh as any).addReflectedObject(this.sky.mesh);
    watchTheme(this);
    this.ready.resolve();
  }

  private setupCamera() {
    this.camera.shake.set(0.08, 0.08, 0.02);
    this.camera.shakeSpeed.setScalar(0.2);
    this.camera.near = 1;
    this.camera.far = 500;
    this.camera.updateProjectionMatrix();
    if (client.device === 'mobile') {
      this.camera.displacement.position.y = 0;
    }
  }

  /** The town's sea covers only its east; ours rings the island, out past the camera's far plane from any shore. */
  private surroundWithSea() {
    const mesh = this.sea.mesh as Mesh;
    const size = 2 * (this.plan.island.extent + this.camera.far);
    const geo = new PlaneGeometry(size, size);
    // Keep the town's ripple size: its 500-unit plane mapped the normal texture once.
    const uv = geo.attributes.uv as BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (size / 500), uv.getY(i) * (size / 500));
    mesh.geometry.dispose();
    mesh.geometry = geo;
    mesh.position.set(0, SEA_Y, 0);
    mesh.updateMatrixWorld(true);
  }

  private setupLights() {
    const hemi = new HemisphereLight('#33434f', '#737575', 0.7);
    this.add(hemi);
    const sun = new FollowSunLight({
      scene: this,
      positionOffset: new Spherical(100, Math.PI * 0.2, Math.PI * -1.75),
      forwardOffset: 6,
      castShadow: true,
      shadowMapSize: 2048,
      shadowSize: 12,
      csm: true,
      csmBoundingSphere: (this.characters.mesh._collisionPhysics as any)._colliderMesh?.geometry?.boundingSphere,
      csmNear: 50,
      // One cascade: the island has no level-of-detail objects, so further levels were never sampled.
      csmLODLevel: 1,
      skipCSMMeshes: [this.characters.mesh, this.sky.mesh, this.sea.mesh],
    });
    sun.shadow.normalBias = 0.07;
    this.add(sun);
  }

  private buildTerrain(): void {
    const EXTENT = this.plan.island.extent;
    const NR = 84;
    const NS = 160;
    const positions: number[] = [];
    const uvs: number[] = [];
    const index: number[] = [];
    for (let ri = 0; ri <= NR; ri++) {
      // Power distribution: denser near the plaza, and no degenerate ring at
      // the center (the r<1 hole hides under the monument's pad).
      const r = Math.pow((ri + 1) / (NR + 1), 1.2) * EXTENT;
      for (let si = 0; si <= NS; si++) {
        const a = (si / NS) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        positions.push(x, this.groundY(x, z), z);
        uvs.push((x + EXTENT) / (EXTENT * 2), (z + EXTENT) / (EXTENT * 2));
      }
    }
    for (let ri = 0; ri < NR; ri++) {
      for (let si = 0; si < NS; si++) {
        // Wound so faces point up (radial × tangential is down).
        const a = ri * (NS + 1) + si;
        const b = a + NS + 1;
        index.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    const painted = paintGround(this.plan, EXTENT);
    const tex = new CanvasTexture(painted.canvas);
    tex.anisotropy = 4;
    // flipY=false: canvas row 0 is v=0, matching the planar UV mapping above.
    tex.flipY = false;
    (tex as any).encoding = 3001;
    const glow = new CanvasTexture(painted.glow);
    glow.flipY = false;
    (glow as any).encoding = 3001;
    const mesh = new Mesh(geo, phongMaterial({ paintedGround: tex, groundGlow: glow }));
    mesh.name = 'island';
    mesh.receiveShadow = true;
    mesh.updateMatrixWorld(true);
    mesh.matrixWorldAutoUpdate = false;
    this.add(mesh);
    this.terrainMesh = mesh;
    (this as any).terrain = { mesh };
  }

  private makeColliderGeometry(): BufferGeometry {
    const t = this.terrainMesh.geometry.index ? this.terrainMesh.geometry.toNonIndexed() : this.terrainMesh.geometry;
    const pos: number[] = [...(t.attributes.position.array as Float32Array)];
    const nor: number[] = [...(t.attributes.normal.array as Float32Array)];
    for (const b of this.colliderBoxes) {
      const g = new BoxGeometry(b.w, b.h, b.d);
      g.rotateY(b.ry);
      g.translate(b.x, b.y + b.h / 2, b.z);
      const part = g.toNonIndexed();
      pos.push(...(part.attributes.position.array as Float32Array));
      nor.push(...(part.attributes.normal.array as Float32Array));
      g.dispose();
      part.dispose();
    }
    const geo = new BufferGeometry();
    const count = pos.length / 3;
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
    // The physics worker and the BVH raycast expect an indexed geometry
    // (the town's collider.bin is indexed); identity-index the soup.
    const index = new Uint32Array(count);
    for (let i = 0; i < count; i++) index[i] = i;
    geo.setIndex(new BufferAttribute(index, 1));
    return geo;
  }

  /** Stand a prop at (x, z) on the ground, turned `ry`; its colliders join the collider. */
  private placeProp(build: { group: any; colliders: Array<{ w: number; h: number; d: number; x: number; z: number; ry: number }>; update?: (t: number, cx: number, cz: number) => void }, x: number, z: number, ry = 0) {
    const gy = this.groundY(x, z);
    build.group.position.set(x, gy, z);
    build.group.rotation.y = ry;
    this.add(build.group);
    const cos = Math.cos(ry);
    const sin = Math.sin(ry);
    for (const c of build.colliders) {
      this.colliderBoxes.push({ w: c.w, h: c.h, d: c.d, x: x + c.x * cos + c.z * sin, y: gy, z: z - c.x * sin + c.z * cos, ry: ry + c.ry });
    }
    if (build.update) this.propUpdates.push(build.update);
  }

  private async scatterProps(): Promise<void> {
    const plan = this.plan;
    const rand = seededRandom(1234);
    // Campus trees gather on the hills and dot the lawns; shrubs all round; stones on the hills and
    // round the lawns; palms along the beach.
    const hilly = (x: number, z: number) => hillSide(x, z) > 0.4 && this.groundY(x, z) > 1.2;
    const gy = (x: number, z: number) => this.groundY(x, z);
    const boxes = this.colliderBoxes;
    const treeKinds = ['tree_capsule', 'tree_round', 'tree_cone'];
    const open = (x: number, z: number) => !inVignette(this.vignettes, x, z, 2.5);
    const treeSpots = scatter(rand, plan, 95, 2, (x, z) => open(x, z) && (hilly(x, z) || rand() < 0.22));
    const trees: Placement[][] = treeKinds.map(() => []);
    treeSpots.forEach(([x, z], i) => trees[i % 3].push({ x, z, facing: rand() * Math.PI * 2, accent: NEUTRAL_ACCENT, scale: 0.85 + rand() * 0.4 }));
    const shrubs: Placement[] = scatter(rand, plan, 85, 1, open).map(([x, z]) => ({ x, z, facing: rand() * Math.PI * 2, accent: NEUTRAL_ACCENT, scale: 0.8 + rand() * 0.6 }));
    const stonesA: Placement[] = scatter(rand, plan, 16, 1, (x, z) => open(x, z) && hilly(x, z)).map(([x, z]) => ({ x, z, facing: rand() * Math.PI * 2, accent: NEUTRAL_ACCENT, scale: 0.9 + rand() * 0.7 }));
    const stonesB: Placement[] = scatter(rand, plan, 20, 1, open).map(([x, z]) => ({ x, z, facing: rand() * Math.PI * 2, accent: NEUTRAL_ACCENT, scale: 0.9 + rand() * 0.6 }));
    const palms: Placement[] = beachSpots(rand, plan, 18, plan.beach, 5).map(([x, z]) => ({ x, z, facing: rand() * Math.PI * 2, accent: NEUTRAL_ACCENT, scale: 0.9 + rand() * 0.35 }));

    // Each district: its gateway on the road in, its pylon behind it, its landmark at the heart, and
    // its dressing (planters, benches, poles, trees).
    const at = (slug: string) => this.accent.get(slug) ?? NEUTRAL_ACCENT;
    const gateways: Placement[] = [];
    const pylons: Placement[] = [];
    const landmarks = new Map<string, Placement[]>();
    const planters: Placement[] = [];
    const benches: Placement[] = [];
    const poles: Placement[] = [];
    plan.clusters.forEach((c, i) => {
      const d = this.dressing[i];
      const a = at(c.slug);
      gateways.push({ x: c.sign.x, z: c.sign.z, facing: c.sign.facing, accent: a });
      pylons.push({ x: c.mast.x, z: c.mast.z, facing: c.mast.facing, accent: a });
      const kind = `lm_${c.theme}`;
      if (!landmarks.has(kind)) landmarks.set(kind, []);
      landmarks.get(kind).push({ ...d.landmark, accent: a });
      for (const p of d.planters) planters.push({ ...p, accent: a });
      for (const b of d.benches) benches.push({ ...b, accent: a });
      for (const p of d.poles) poles.push({ ...p, accent: a });
      d.trees.forEach((t, k) => trees[(i + k) % 3].push({ ...t, facing: (k * 2.39996) % (Math.PI * 2), accent: a, scale: 0.9 }));
    });
    // Street lights: round the plaza's edge and the ring street in the plaza's colors, along each road in its district's.
    const nearestRoad = (x: number, z: number) => plan.clusters.reduce((b, c) => (Math.abs(Math.atan2(Math.sin(Math.atan2(z, x) - c.angle), Math.cos(Math.atan2(z, x) - c.angle))) < Math.abs(Math.atan2(Math.sin(Math.atan2(z, x) - b.angle), Math.cos(Math.atan2(z, x) - b.angle))) ? c : b), plan.clusters[0]);
    for (const l of [...plan.lamps.plaza, ...plan.lamps.street]) poles.push({ x: l.x, z: l.z, facing: Math.atan2(-l.x, -l.z), accent: NEUTRAL_ACCENT });
    for (const l of plan.lamps.roads) poles.push({ x: l.x, z: l.z, facing: Math.atan2(-l.x, -l.z), accent: at(nearestRoad(l.x, l.z).slug) });

    const sway = { isTree: true };
    const block = (p: any) => {
      if (p?.mesh) this.blockers.push(p.mesh);
      return p;
    };
    await Promise.all([
      ...treeKinds.map((k, i) => placeModel(this, k, trees[i], gy, boxes, sway).then(block)),
      placeModel(this, 'shrub', shrubs, gy, null, sway),
      placeModel(this, 'stone_a', stonesA, gy, boxes),
      placeModel(this, 'stone_b', stonesB, gy, boxes),
      placeModel(this, 'palm', palms, gy, boxes, sway).then(block),
      placeModel(this, 'planter', planters, gy, boxes, sway),
      placeModel(this, 'bench', benches, gy, boxes),
      placeModel(this, 'light_pole', poles, gy, boxes),
    ]);
    const [gatewayPlaced, pylonPlaced] = await Promise.all([placeModel(this, 'gateway', gateways, gy, boxes).then(block), placeModel(this, 'pylon', pylons, gy, boxes).then(block)]);
    const landmarkPlaced = new Map();
    for (const [kind, list] of landmarks) {
      const placed = block(await placeModel(this, kind, list, gy, null));
      landmarkPlaced.set(kind, placed);
      // A landmark's walls collide round its footprint (its door, facing the plaza, stays open).
      for (const p of list) {
        for (const b of ringBoxes(kind === 'lm_garden' || kind === 'lm_people' ? 3.8 : 3.6, 3.2, 10, 0.6, kind === 'lm_garden' || kind === 'lm_people' ? 0.5 : undefined)) {
          const c = Math.cos(p.facing);
          const sn = Math.sin(p.facing);
          boxes.push({ ...b, x: p.x + b.x * c + b.z * sn, y: gy(p.x, p.z), z: p.z - b.x * sn + b.z * c, ry: p.facing + b.ry });
        }
      }
    }
    // Names on the boards: each gateway, each pylon's screen, each landmark's fascia.
    const boardsOf = (placed: any, list: Placement[], text: (i: number) => string) => {
      const a = placed && anchorsOf(placed.geometry).board;
      if (!a) return;
      list.forEach((p, i) => this.add(boardMesh(text(i), anchorMatrix(p, a, gy), a.w, a.h)));
    };
    boardsOf(gatewayPlaced, gateways, (i) => plan.clusters[i].label);
    boardsOf(pylonPlaced, pylons, (i) => plan.clusters[i].short);
    for (const [kind, list] of landmarks) {
      const owners = plan.clusters.filter((c) => `lm_${c.theme}` === kind);
      boardsOf(landmarkPlaced.get(kind), list, (i) => owners[i].label);
    }

    await this.buildVignettes();
    await this.buildSpots();
    await addShuttle(this, plan, gy, this.still);
    if (landmarks.has('lm_studio')) this.cycleScreens(landmarkPlaced.get('lm_studio'), landmarks.get('lm_studio'), plan.clusters.filter((c) => c.theme === 'studio'));

    await this.buildPlaza();
    // The set pieces round the island: one on the shore and one in the hills of each wedge.
    {
      const pieces = await buildPieces(this, plan, gy, (x, z) => this.accentNear(x, z), this.still);
      this.blockers.push(...pieces.meshes);
      this.colliderBoxes.push(...pieces.colliders);
      this.propUpdates.push((t) => pieces.update(t));
    }
    this.beforeRenderCbs.push(() => {
      const t = clock.time;
      const cx = this.camera.position.x;
      const cz = this.camera.position.z;
      for (const u of this.propUpdates) u(t, cx, cz);
    });
  }

  /** Where each company and person stands: their totems and posts, and the logos on their screens. */
  spots: {
    list: Array<{ slug: string; district: string; isPerson: boolean; x: number; z: number; facing: number; color: string }>;
    pickables: any[];
    /** The spot a raycast hit belongs to (its index in list), or -1. */
    pick(hit: { object: any; instanceId?: number }): number;
  };

  /**
   * The founding plaza and its wayfinding: the monument with the organization's name, the hub's
   * pylons, the Walking times display, a signpost at each road's mouth, kiosks on the ring street,
   * the portal's frame, and round planters and benches in the plaza's open gaps.
   */
  private async buildPlaza(): Promise<void> {
    const plan = this.plan;
    const gy = (x: number, z: number) => this.groundY(x, z);
    const boxes = this.colliderBoxes;
    const N = NEUTRAL_ACCENT;
    const at = (slug: string) => this.accent.get(slug) ?? N;
    const byColor = (color: string) => {
      const c = plan.clusters.find((k) => k.color === color);
      return c ? at(c.slug) : N;
    };
    const m = plan.monument;
    const monument = [{ x: m.x, z: m.z, facing: m.facing, accent: N }];
    const pylons = plan.pylons.map((p) => ({ x: p.x, z: p.z, facing: faceToward(p.x, p.z, plan.spawn.x, plan.spawn.z), accent: N }));
    const display = [{ x: plan.board.x, z: plan.board.z, facing: plan.board.facing, accent: N }];
    const posts = plan.posts.map((p) => ({ x: p.x, z: p.z, facing: p.facing, accent: at(p.slug) }));
    const kiosks = plan.stalls.map((s) => ({ x: s.x, z: s.z, facing: s.ry, accent: byColor(s.color) }));
    const portal = [{ x: plan.portal.x, z: plan.portal.z, facing: plan.portal.facing, accent: N }];
    const dress = plazaDressing(plan);
    const sway = { isTree: true };
    const block = (p: any) => {
      if (p?.mesh) this.blockers.push(p.mesh);
      return p;
    };
    const [mon, , disp, sign, , frame] = await Promise.all([
      placeModel(this, 'monument', monument, gy, boxes).then(block),
      placeModel(this, 'hub_pylon', pylons, gy, boxes).then(block),
      placeModel(this, 'info_display', display, gy, boxes).then(block),
      placeModel(this, 'signpost', posts, gy, boxes),
      placeModel(this, 'kiosk', kiosks, gy, boxes).then(block),
      placeModel(this, 'portal_frame', portal, gy, boxes).then(block),
      placeModel(this, 'planter_round', dress.planters.map((p) => ({ ...p, accent: N })), gy, boxes, sway).then(block),
      placeModel(this, 'plaza_bench', dress.benches.map((p) => ({ ...p, accent: N })), gy, boxes),
    ]);
    const plaque = mon && anchorsOf(mon.geometry).plaque;
    if (plaque) this.add(boardMesh(L.org, anchorMatrix(monument[0], plaque, gy), plaque.w, plaque.h));
    const plate = frame && anchorsOf(frame.geometry).plate;
    if (plate) this.add(boardMesh('Nexus', anchorMatrix(portal[0], plate, gy), plate.w, plate.h));
    const screen = disp && anchorsOf(disp.geometry).screen;
    if (screen) {
      // The display's screen is tilted back 10 degrees about its own width.
      const matrix = anchorMatrix(display[0], screen, gy, 0.02).multiply(new Matrix4().makeRotationX(-0.1745));
      this.add(walkingTimesMesh('Walking times', plan.board.rows, matrix, screen.w, screen.h));
    }
    const blade = sign && anchorsOf(sign.geometry).blade;
    if (blade) posts.forEach((p, i) => this.add(bladeMesh(plan.posts[i].text, anchorMatrix(p, blade, gy, 0.01), blade.w, blade.h)));
  }

  /** The accent rows of the district whose bearing from the monument is nearest (x, z)'s. */
  private accentNear(x: number, z: number): number {
    const a = Math.atan2(z, x);
    let best = this.plan.clusters[0];
    let bd = Infinity;
    for (const c of this.plan.clusters) {
      const d = Math.abs(Math.atan2(Math.sin(a - c.angle), Math.cos(a - c.angle)));
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return this.accent.get(best?.slug) ?? NEUTRAL_ACCENT;
  }

  /** The homes, parks and play areas between the districts, each piece in its nearest district's colors. */
  private async buildVignettes(): Promise<void> {
    const gy = (x: number, z: number) => this.groundY(x, z);
    const byModel = new Map<string, Placement[]>();
    for (const v of this.vignettes) {
      const accent = this.accentNear(v.x, v.z);
      for (const p of v.pieces) {
        if (!byModel.has(p.model)) byModel.set(p.model, []);
        byModel.get(p.model).push({ x: p.x, z: p.z, facing: p.facing, accent });
      }
    }
    const sway = new Set(['tree_round', 'tree_capsule', 'tree_cone', 'house_a', 'house_b', 'house_c']);
    const solid = new Set(['house_a', 'house_b', 'house_c', 'playground', 'tree_round', 'tree_capsule', 'tree_cone']);
    await Promise.all(
      [...byModel].map(([model, list]) =>
        placeModel(this, model, list, gy, this.colliderBoxes, sway.has(model) ? { isTree: true } : {}).then((p) => {
          if (p?.mesh && solid.has(model)) this.blockers.push(p.mesh);
        }),
      ),
    );
  }

  /** The companies' logo atlas and each company's cell in it (the studios' big screens show them too). */
  logoAtlas: ReturnType<typeof screenAtlas> | null = null;
  logoCells = new Map<string, { page: number; uv: [number, number, number, number] }>();

  /**
   * A studio landmark's big screen shows its district's companies' logos in turn, a few seconds each
   * (held on the first under reduced motion).
   */
  private cycleScreens(placed: any, list: Placement[], owners: Array<{ slug: string }>): void {
    const a = placed && anchorsOf(placed.geometry).screen;
    if (!a || !this.logoAtlas) return;
    const gy = (x: number, z: number) => this.groundY(x, z);
    list.forEach((p, i) => {
      const slugs = this.dressing.find((d) => d.slug === owners[i].slug)?.spots.map((s) => s.slug).filter((s) => this.logoCells.has(s)) ?? [];
      if (!slugs.length) return;
      const quads: ScreenQuad[] = [];
      const first = this.logoCells.get(slugs[0]);
      const h = Math.min(a.h, a.w / 2);
      quads.push({ matrix: anchorMatrix(p, a, gy), w: h * 2, h, page: first.page, uv: first.uv });
      const built = screenMeshes(this.logoAtlas, quads);
      for (const m of built.meshes) this.add(m);
      if (this.still || slugs.length < 2) return;
      const mesh = built.meshes[0];
      let k = 0;
      let at = clock.time;
      this.beforeRenderCbs.push(() => {
        if (clock.time - at < 4) return;
        at = clock.time;
        k = (k + 1) % slugs.length;
        const cell = this.logoCells.get(slugs[k]);
        // Each page is its own mesh; a logo on another page waits for its turn on this one.
        if (!cell || mesh.material.uniforms.map.value !== this.logoAtlas.pages[cell.page]) return;
        const attr = mesh.geometry.attributes.aCell;
        attr.setXYZW(0, cell.uv[0], cell.uv[1], cell.uv[2], cell.uv[3]);
        attr.needsUpdate = true;
      });
    });
  }

  private async buildSpots(): Promise<void> {
    const plan = this.plan;
    const gy = (x: number, z: number) => this.groundY(x, z);
    const { companies: COMPANIES, people: PEOPLE } = islandCatalog();
    const companies = new Map(COMPANIES.map((c) => [c.slug, c]));
    const people = new Map(PEOPLE.map((p) => [p.slug, p]));
    const list: MapScene['spots']['list'] = [];
    const totems: Placement[] = [];
    const posts: Placement[] = [];
    const totemOf: number[] = [];
    const postOf: number[] = [];
    plan.clusters.forEach((c, i) => {
      const a = this.accent.get(c.slug) ?? NEUTRAL_ACCENT;
      for (const s of this.dressing[i].spots) {
        const k = list.length;
        list.push({ slug: s.slug, district: c.slug, isPerson: c.isPeople, x: s.x, z: s.z, facing: s.facing, color: c.color });
        if (c.isPeople) {
          posts.push({ x: s.x, z: s.z, facing: s.facing, accent: a });
          postOf.push(k);
        } else {
          totems.push({ x: s.x, z: s.z, facing: s.facing, accent: a });
          totemOf.push(k);
        }
      }
    });
    // Totems drawn per district, so a district out of view is culled whole.
    const byDistrict = new Map<string, number[]>();
    totems.forEach((t, j) => {
      const d = list[totemOf[j]].district;
      if (!byDistrict.has(d)) byDistrict.set(d, []);
      byDistrict.get(d).push(j);
    });
    const totemGroups = await Promise.all(
      [...byDistrict.values()].map(async (js) => ({ js, placed: await placeModel(this, 'totem', js.map((j) => totems[j]), gy, this.colliderBoxes) })),
    );
    const totemPlaced = totemGroups[0]?.placed ?? null;
    const postPlaced = await placeModel(this, 'person_post', posts, gy, this.colliderBoxes);
    // Logos: a company's badge on both of its totem's screens; a person's on their post's.
    const pickables: any[] = [];
    const owner = new Map<any, (id: number) => number>();
    const addScreens = (atlas: ReturnType<typeof screenAtlas>, quads: ScreenQuad[], spotOfQuad: number[]) => {
      const built = screenMeshes(atlas, quads);
      for (const m of built.meshes) {
        this.add(m);
        pickables.push(m);
        owner.set(m, (id) => spotOfQuad[built.quadOf(m, id)] ?? -1);
      }
    };
    if (totemPlaced) {
      const an = anchorsOf(totemPlaced.geometry);
      const atlas = screenAtlas(256, 128);
      this.logoAtlas = atlas;
      const quads: ScreenQuad[] = [];
      const spotOfQuad: number[] = [];
      totems.forEach((t, j) => {
        const spot = list[totemOf[j]];
        const cell = atlas.add(spot.slug, companyBadge(companies.get(spot.slug), false));
        this.logoCells.set(spot.slug, cell);
        for (const name of ['screen_front', 'screen_back']) {
          const a = an[name];
          if (!a) continue;
          // The badge is 2:1; fit it across the screen.
          quads.push({ matrix: anchorMatrix(t, a, gy), w: a.w, h: Math.min(a.h, a.w / 2), page: cell.page, uv: cell.uv });
          spotOfQuad.push(totemOf[j]);
        }
      });
      addScreens(atlas, quads, spotOfQuad);
      for (const g of totemGroups) {
        if (!g.placed) continue;
        pickables.push(g.placed.mesh);
        owner.set(g.placed.mesh, (id) => totemOf[g.js[id]] ?? -1);
      }
    }
    if (postPlaced) {
      const a = anchorsOf(postPlaced.geometry).screen;
      const atlas = screenAtlas(128, 128);
      const quads: ScreenQuad[] = [];
      const spotOfQuad: number[] = [];
      posts.forEach((p, j) => {
        const spot = list[postOf[j]];
        const cell = atlas.add(spot.slug, personBadge(people.get(spot.slug)));
        if (a) quads.push({ matrix: anchorMatrix(p, { ...a, at: [a.at[0], a.at[1], a.at[2]] }, gy).multiply(new Matrix4().makeRotationX(-0.32)), w: a.w, h: a.h, page: cell.page, uv: cell.uv });
        spotOfQuad.push(postOf[j]);
      });
      addScreens(atlas, quads, spotOfQuad);
      pickables.push(postPlaced.mesh);
      owner.set(postPlaced.mesh, (id) => postOf[id] ?? -1);
    }
    this.spots = {
      list,
      pickables,
      pick: (hit) => (hit && owner.has(hit.object) && hit.instanceId !== undefined ? owner.get(hit.object)(hit.instanceId) : -1),
    };
  }

  private async addCharacters(): Promise<void> {
    const [skinned, clips] = await Promise.all([
      geometryLoader.skin('walker.bin', 'walker-bones.bin'),
      Promise.all(['walker-idle.bin', 'walker-run.bin', 'walker-air.bin', 'walker-bored.bin'].map((c) => geometryLoader.skinAnimation(c))),
    ]);
    (skinned as any).geometry.setAttribute('instanceSeed', new InstancedBufferAttribute(new Float32Array(128), 1));
    (skinned as any).material = phongMaterial({ isCharacters: true });
    (skinned as any).customDepthMaterial = depthCharsMaterial();
    const colliderMesh = new Mesh(this.makeColliderGeometry());
    const spawn = this.plan.spawn;
    // The camera rides behind the kid, so the arrival opens on the view the plan framed.
    const back = new Vector3(-Math.sin(spawn.facing) * CAMERA.back, 1.2, -Math.cos(spawn.facing) * CAMERA.back);
    const mesh = new Characters(skinned as any, clips as any, {
      animationsOptions: [{ speed: 1 }, { speed: 1.1 }, { speed: 1 }, { speed: 1 }],
      colliderMesh,
      radiusPercentage: 0.2,
      floorDetectInclination: 0.8,
      positionForce: 0.02,
      damp: 0.92,
      initialPosition: [spawn.x, this.groundY(spawn.x, spawn.z) + 0.5, spawn.z],
      initialRadius: 0,
      camera: this.camera,
      relativeCameraPosition: back,
      lookatMeshOffset: new Vector3(0, 1.1, -0.5),
      initialData: { seed: 0 },
      customAttribUpdate: (local: any, _clientId: string, instanceId: number) => {
        (mesh as any).geometry.attributes.instanceSeed.setX(instanceId, local.userData.seed);
      },
    });
    (this as any).characters = { mesh };
    this.add(mesh as any);
    this.add((mesh as any)._controls.circles);
    // The kid starts out facing the way the camera looks.
    const theta = kidTheta(spawn.facing);
    (mesh as any)._localObject.spherical.theta = theta;
    (mesh as any)._localObject.targetSpherical.theta = theta;
    const walkR = this.plan.island.walk;
    this.beforeRenderCbs.push(() => {
      (mesh as any).geometry.attributes.instanceSeed.needsUpdate = true;
      // Hold Shift to run (ignored while typing in the page).
      const ae = document.activeElement as HTMLElement | null;
      const typing = !!ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
      (mesh as any)._collisionPhysics._positionForce = this.shiftDown && !typing ? 0.036 : 0.02;
      (mesh as any).update();
      this.audioController?.updatePlayerPosition(
        (mesh as any)._localObject.position.toArray(),
        (mesh as any)._localObject.velocityHorizontal,
        (mesh as any)._localObject.userData.a === 0,
      );
      // Stay on the island (the sea is scenery), or on the marina's deck.
      const p = (mesh as any)._localObject.position;
      const r = Math.hypot(p.x, p.z);
      if (r > walkR && !onMarina(this.plan.pieces, p.x, p.z)) {
        p.x *= walkR / r;
        p.z *= walkR / r;
      }
    });
    events.on('webgl_character_controls_enable', (enabled: boolean) => {
      if (enabled) (mesh as any)._controls.enable();
      else (mesh as any)._controls.disable();
    });
  }

  playIntroAnimation() {
    this.camera.followSphericalZoom = this.still ? 0 : 12;
    this.camera.updateCamera();
    this.camera.spherical.copy(this.camera.sphericalTarget);
    if (!this.still) gsap.to(this.camera, { followSphericalZoom: 0, delay: 0, ease: 'inOut3', duration: 6 });
    this.camera.touchAmount = 0;
    gsap.to(this.camera, { touchAmount: 1, delay: this.still ? 0 : 4, duration: this.still ? 0.01 : 4 });
    gsap.delayedCall(this.still ? 0.2 : 1.5, () => {
      events.emit('webgl_character_controls_enable', true);
      this.audioController.canPlaySound.resolve();
    });
  }
}
