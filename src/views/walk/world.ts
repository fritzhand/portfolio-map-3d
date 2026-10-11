/* The static world, painted: the sky and its cumulus (sky.ts), the sea and its surf (sea.ts), the
   island with its beaches, the hub and the Nexus portal on the plaza, the roads, the industry
   districts with their landmarks and entry arches, the plants (foliage.ts) and the grass around the
   walker (grass.ts).

   Every lit prop is toon shaded (src/three/toon.ts): a soft two-tone terminator under a low sun,
   cool sky light in the shadows, cloud shadows drifting across the land, plants swaying in the
   wind. Badges, signs, medallions and the districts' rings stay unlit and keep their colors. The
   light theme is a warm afternoon; the dark theme is the same island by moonlight.

   Built imperatively once per mount (geometry comes only from
   src/data/layout.ts), merged into a handful of draw calls, and disposed
   on unmount. Plants are instanced per tile, so the cameras cull what is out of view. Districts
   group companies by industry; nothing here places a company at a physical location. The People
   area (see areas.ts) is built by the same district code, in the one person color. */
import * as THREE from "three";
import { plazaLamps, plazaSeats } from "../../data/hub";
import { CORE_RADIUS, PLAZA_RADIUS, ROAD_WIDTH, VILLAGE, decorPoints, onRoad, hashString, seededRandom, type AreaSlug, type WorldLayout } from "../../data/layout";
import { cpuCanvas, cpuContext } from "../../three/cpuCanvas";
import { labelTexture } from "../../three/logoTexture";
import { L } from "../../site";
import { cloudShadowTexture, createToonShared, toonDepthMaterial, toonMaterial, toonify, type ToonShared } from "../../three/toon";
import { FOLIAGE_BODY, FOLIAGE_KINDS, FOLIAGE_WIND, foliageFarGeometry, foliageGeometry, type FoliageKind } from "./foliage";
import { buildGrass, type GrassField } from "./grass";
import { buildHub, drawHubGround } from "./hub";
import { buildPortal } from "./portal";
import { buildRoads } from "./roads";
import { buildFinds, findSpots, type Finds } from "./finds";
import { buildLife } from "./life";
import { buildScenery } from "./scenery";
import { buildVillage } from "./village";
import { buildWayfinding } from "./wayfinding";
import { mix, type ScenePalette } from "./palette";
import { buildSea } from "./sea";
import { buildSky } from "./sky";
import { LAMP_HEIGHT, lampPost } from "./street";
import { SEA_LEVEL, type Terrain } from "./terrain";
import { canvasTexture, clamp, merge, paint, smoothstep, valueNoise2D, withNearFade } from "./util";

export interface Collider {
  x: number;
  z: number;
  r: number;
  /** Height of the obstacle, for keeping the follow camera's view over it. */
  h?: number;
}

export interface BoxCollider {
  x: number;
  z: number;
  hx: number;
  hz: number;
  /** Rotation about y (three.js rotation.y); absent for an axis-aligned box. */
  rot?: number;
  h?: number;
}

export interface World {
  root: THREE.Group;
  colliders: Collider[];
  /** Tall things the follow camera should look over (tree crowns, landmarks, the hub). Not walking obstacles. */
  blockers: Collider[];
  /** District entry arches, as foreground clutter for choosing fly-to views. */
  arches: Collider[];
  boxes: BoxCollider[];
  sun: THREE.DirectionalLight;
  /** Unit vector toward the sun (the light follows the walker along it). */
  sunDir: THREE.Vector3;
  hemi: THREE.HemisphereLight;
  /** The toon look's shared uniforms (cloud shadows, wind): the engine toon-shades the pins, avatars and car with them. */
  toon: ToonShared;
  /** The grass tufts around the walker (the engine moves them with the walker). */
  grass: GrassField;
  /** The keepsakes hidden around the island (finds.ts). */
  finds: Finds;
  /** View-distance range [gone, solid] over which props near the lens dissolve (set per frame by the engine). */
  nearFade: { value: THREE.Vector2 };
  /** Height of each district landmark's top, for label placement. */
  landmarkTop: number;
  /** Height of the hub's highest point (the top of its rooftop sign), for label placement. */
  hubTop: number;
  /** The hub's rooftop sign in world space: its pole's foot (x, z and height on the roof), width, bottom and top. Its face turns to the camera. */
  beacon: { x: number; z: number; foot: number; w: number; y0: number; y1: number };
  /** Walker head position and radius for the hub's see-through cutaway (w = 0: off). Set per frame by the engine. */
  hubOccluder: { value: THREE.Vector4 };
  /** Paint a district's (or the People area's) icon, an SVG string, onto its landmark emblem. */
  setDistrictIcon(slug: AreaSlug, svg: string): void;
  /** Replace static scenery in place while retaining the engine's root group and state. */
  setPalette(palette: ScenePalette): void;
  update(time: number, dt: number, reduced: boolean, cameraYaw: number, cameraAt: THREE.Vector3, walker?: { x: number; z: number }): void;
  dispose(): void;
}

const LANDMARK_TOP = 9.6;

/** Plants are instanced per square tile of this size, so the camera (and the sun's shadow camera) culls what is out of view. */
const DECOR_TILE = 120;
/** A plant tile farther than this from the camera (to its nearest edge) draws its plants' far versions. */
const FOLIAGE_FAR = 150;
/**
 * Toward the sun: a low afternoon sun in the south-west (about 37° up), so shadows fall long toward
 * the north-east and an arrival facing the hub sees its front lit.
 */
export const SUN_DIR = new THREE.Vector3(-0.62, 0.6, 0.5).normalize();

/** What the district code needs to know about each disc on the ring (a district or the People area). */
export interface AreaLook {
  slug: AreaSlug;
  short: string;
  color: string;
}

export function buildWorld(layout: WorldLayout, districts: readonly AreaLook[], terrain: Terrain, p: ScenePalette): World {
  // One cloud map and one set of toon uniforms for the life of the view: a theme change rebuilds the
  // scenery but keeps them, so the pins, avatars and car the engine toon-shaded keep working.
  const cloudMap = cloudShadowTexture();
  const toon = createToonShared(cloudMap);
  let current = buildWorldParts(layout, districts, terrain, p, toon);
  const root = current.root;
  const icons = new Map<AreaSlug, string>();
  const setDistrictIcon = (slug: AreaSlug, svg: string) => {
    icons.set(slug, svg);
    current.setDistrictIcon(slug, svg);
  };
  const dispose = () => {
    current.dispose();
    cloudMap.dispose();
  };
  const setPalette = (palette: ScenePalette) => {
    const next = buildWorldParts(layout, districts, terrain, palette, toon);
    const previous = current;
    root.clear();
    root.add(...next.root.children);
    current = next;
    Object.assign(world, next, { root, setPalette, setDistrictIcon, dispose });
    previous.dispose();
    for (const [slug, svg] of icons) current.setDistrictIcon(slug, svg);
  };
  const world: World = { ...current, root, setPalette, setDistrictIcon, dispose };
  return world;
}

function buildWorldParts(layout: WorldLayout, districts: readonly AreaLook[], terrain: Terrain, p: ScenePalette, toon: ToonShared): Omit<World, "setPalette"> {
  const root = new THREE.Group();
  root.name = "world";
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T) => {
    disposables.push(x);
    return x;
  };
  const colliders: Collider[] = [];
  const boxes: BoxCollider[] = [];
  const blockers: Collider[] = [];
  const arches: Collider[] = [];
  const districtBy = new Map(districts.map((d) => [d.slug, d]));
  const nearFade = { value: new THREE.Vector2(0, 0) };
  /** Vertex-colored, flat-shaded, toon-lit props that dissolve near the camera. */
  const propMaterial = () => own(toonMaterial({ vertexColors: true, flatShading: true }, { shared: toon, nearFade }));
  /** Lamp globes: frosted by day, lit (unlit material, its own color) by moonlight. */
  const glassMaterial = own(p.dark ? new THREE.MeshBasicMaterial({ color: p.lampGlass, toneMapped: false }) : toonMaterial({ color: p.lampGlass }, { shared: toon, nearFade }));
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

  /* ---------------- sky (it travels with the camera) and light ---------------- */
  const sunDir = SUN_DIR.clone();
  const sky = buildSky(p, sunDir);
  root.add(sky.mesh);

  // No tone mapping in this scene (the canvas is flat): by day a lit face shows about its own color,
  // a shadowed one about half of it, tinted by the cool sky. By moonlight the palette's colors are
  // already the night's (scene-theme.css), so the sky light is the moon's pale blue rather than the
  // dark sky's, which would darken them twice.
  const hemi = p.dark
    ? new THREE.HemisphereLight(mix(p.sun, p.glow, 0.3), mix(p.grass, p.sand, 0.45), 2.4)
    : new THREE.HemisphereLight(mix(p.skyMid, p.skyBottom, 0.45), mix(p.grass, p.sand, 0.45), 1.95);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(p.sun, p.dark ? 1.5 : 1.45);
  sun.castShadow = true;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  root.add(sun, sun.target);

  /* ---------------- island ground and the seabed around it ---------------- */
  {
    const R = layout.islandRadius;
    const size = 2 * (R + 84);
    const seg = 176;
    const g = own(new THREE.PlaneGeometry(size, size, seg, seg));
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const noise = valueNoise2D(hashString("walk-ground"));
    const c = new THREE.Color();
    const shallow = mix(p.sand, p.seaShallow, 0.55);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = terrain.heightAt(x, z);
      pos.setY(i, h);
      const depth = SEA_LEVEL - h;
      if (depth <= 0) {
        const r = Math.hypot(x, z);
        const a = Math.atan2(z, x);
        const m = noise(x * 0.035, z * 0.035) * 0.65 + noise(x * 0.14 + 9, z * 0.14 + 4) * 0.35;
        c.copy(p.grass).lerp(p.grassDark, clamp(m * 1.3 - 0.25, 0, 1));
        // Sun-dried patches and warmer hilltops, like a painted field.
        c.lerp(p.grassTip, 0.22 * smoothstep(0.55, 0.85, noise(x * 0.011 + 30, z * 0.011 + 11)) + clamp(h / 2.6, 0, 1) * 0.08);
        c.lerp(p.sand, terrain.sandAt(r, a));
      } else {
        // The seabed: wet sand, turquoise shallows, then blue, deep by the edge of the ground.
        c.copy(p.sand)
          .lerp(shallow, smoothstep(0, 0.9, depth))
          .lerp(p.seaShallow, smoothstep(0.6, 3, depth))
          .lerp(p.sea, smoothstep(2.6, 5.4, depth))
          .lerp(p.seaDeep, smoothstep(5, 7.2, depth));
      }
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    // Smooth normals: the hills shade softly through the toon terminator.
    g.computeVertexNormals();
    const ground = new THREE.Mesh(g, own(toonMaterial({ vertexColors: true }, { shared: toon })));
    ground.receiveShadow = true;
    ground.name = "ground";
    root.add(ground);

    const floor = new THREE.Mesh(own(new THREE.CircleGeometry(2600, 48)), own(new THREE.MeshBasicMaterial({ color: p.seaDeep })));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -7.9;
    root.add(floor);
  }

  /* ---------------- the sea and its surf (sea.ts) ---------------- */
  const sea = buildSea(p, sunDir, terrain);
  root.add(sea.group);

  /* ---------------- plaza ---------------- */
  {
    // The enlarged plaza needs more texels for crisp joints up close: 2048 on a desktop, 1024 on a
    // touch device (a 2048 canvas texture costs about 22 MB of GPU memory with its mipmaps).
    const S = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches ? 1024 : 2048;
    const [cv, ctx] = cpuCanvas(S, S);
    const k = S / (PLAZA_RADIUS * 2);
    const css = (c: THREE.Color) => `#${c.getHexString()}`;
    ctx.fillStyle = css(p.plaza);
    ctx.fillRect(0, 0, S, S);
    const rand = seededRandom(hashString("walk-plaza"));
    // Concentric paving courses with offset joints, each stone slightly varied.
    for (let r = 1.2; r < PLAZA_RADIUS; r += 1.25) {
      const n = Math.max(6, Math.round((2 * Math.PI * r) / 1.6));
      const off = rand() * Math.PI;
      for (let i = 0; i < n; i++) {
        const a0 = off + (i / n) * Math.PI * 2;
        const a1 = off + ((i + 1) / n) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(S / 2, S / 2, (r + 1.25) * k, a0, a1);
        ctx.arc(S / 2, S / 2, r * k, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = css(mix(p.plaza, rand() > 0.5 ? p.sand : p.rock, rand() * 0.16));
        ctx.fill();
        ctx.strokeStyle = css(mix(p.plaza, p.rock, 0.45));
        ctx.lineWidth = Math.max(1.2, 0.07 * k);
        ctx.stroke();
      }
    }
    // An inlay ring just inside the lamps.
    ctx.strokeStyle = css(mix(p.sand, p.trunk, 0.35));
    ctx.lineWidth = 0.16 * k;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, (PLAZA_RADIUS - 3.2) * k, 0, Math.PI * 2);
    ctx.stroke();
    // The hub's own ground: the paved forecourt and the path to the spawn (src/views/walk/hub.ts).
    ctx.save();
    ctx.setTransform(k, 0, 0, k, PLAZA_RADIUS * k, PLAZA_RADIUS * k);
    drawHubGround(ctx, p, k);
    ctx.restore();
    const tex = own(canvasTexture(cv));
    tex.anisotropy = 8;
    const plaza = new THREE.Mesh(own(new THREE.CircleGeometry(PLAZA_RADIUS, 96)), own(toonMaterial({ map: tex }, { shared: toon })));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.03;
    plaza.receiveShadow = true;
    root.add(plaza);
    const curb = new THREE.Mesh(
      own(new THREE.RingGeometry(PLAZA_RADIUS - 0.05, PLAZA_RADIUS + 0.6, 96)),
      own(toonMaterial({ color: mix(p.plaza, p.rock, 0.55) }, { shared: toon })),
    );
    curb.rotation.x = -Math.PI / 2;
    curb.position.y = 0.04;
    curb.receiveShadow = true;
    root.add(curb);
  }

  /* ---------------- roads (roads.ts): to every district, and the village's ring street ---------------- */
  root.add(buildRoads(layout, p, toon, own).group);

  /* ---------------- districts: ground patches, rings, landmarks, arches ---------------- */
  const emblems: { mesh: THREE.Group; base: number; phase: number; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; color: string }[] = [];
  const emblemBySlug = new Map<AreaSlug, (typeof emblems)[number]>();
  {
    const flat: THREE.BufferGeometry[] = [];
    const glowing: THREE.BufferGeometry[] = [];
    const solid: THREE.BufferGeometry[] = [];
    const flatAt = (g: THREE.BufferGeometry, x: number, y: number, z: number, color: THREE.Color, list = flat) => {
      g.rotateX(-Math.PI / 2);
      g.translate(x, y, z);
      list.push(paint(g, color));
    };
    const solidAt = (g: THREE.BufferGeometry, x: number, y: number, z: number, color: THREE.Color, rotY = 0) => {
      if (rotY) g.rotateY(rotY);
      g.translate(x, y, z);
      solid.push(paint(g, color));
    };
    const stone = mix(p.plaza, p.rock, 0.3);
    const stoneDark = mix(p.plaza, p.rock, 0.65);

    for (const disc of layout.discs) {
      const d = districtBy.get(disc.slug);
      if (!d) continue;
      const col = new THREE.Color(d.color);
      const tint = mix(p.grass, col, 0.2).lerp(p.plaza, 0.08);
      flatAt(new THREE.CircleGeometry(disc.r, 72), disc.x, 0.02, disc.z, tint);
      // The edge ring keeps the district's color in any light (unlit).
      flatAt(new THREE.RingGeometry(disc.r - 0.6, disc.r, 96), disc.x, 0.034, disc.z, col, glowing);
      flatAt(new THREE.RingGeometry(disc.r - 1.5, disc.r - 1.25, 96), disc.x, 0.034, disc.z, mix(tint, col, 0.45));
      flatAt(new THREE.CircleGeometry(CORE_RADIUS - 0.4, 48), disc.x, 0.038, disc.z, mix(p.plaza, col, 0.08));
      flatAt(new THREE.RingGeometry(CORE_RADIUS - 0.4, CORE_RADIUS, 48), disc.x, 0.04, disc.z, mix(col, p.plaza, 0.15));

      // Landmark: a six-sided gazebo on a stone plinth, slim cream posts and a railing (open
      // toward the road) under a pointed roof in the district color; the medallion floats above.
      const cream = mix(p.wallCream, p.plaza, 0.4);
      solidAt(new THREE.CylinderGeometry(3.3, 3.5, 0.3, 6), disc.x, 0.15, disc.z, stoneDark);
      solidAt(new THREE.CylinderGeometry(2.95, 3.1, 0.24, 6), disc.x, 0.42, disc.z, stone);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const px = disc.x + Math.cos(a) * 2.6;
        const pz = disc.z + Math.sin(a) * 2.6;
        solidAt(new THREE.CylinderGeometry(0.13, 0.16, 3.4, 6), px, 2.35, pz, cream);
        solidAt(new THREE.BoxGeometry(0.4, 0.2, 0.4), px, 0.66, pz, stoneDark);
        // A railing between the posts, with a gap on the road side.
        const a2 = a + Math.PI / 6;
        const rx = disc.x + Math.cos(a2) * 2.6;
        const rz = disc.z + Math.sin(a2) * 2.6;
        const toRoad = disc.angle + Math.PI;
        const open = Math.abs(Math.atan2(Math.sin(a2 - toRoad), Math.cos(a2 - toRoad))) < 0.35;
        if (!open) {
          solidAt(new THREE.BoxGeometry(2.6, 0.1, 0.1), rx, 1.35, rz, cream, -a2 - Math.PI / 2);
          solidAt(new THREE.BoxGeometry(2.6, 0.08, 0.08), rx, 0.9, rz, mix(cream, col, 0.3), -a2 - Math.PI / 2);
        }
        colliders.push({ x: px, z: pz, r: 0.32, h: 3.6 });
      }
      solidAt(new THREE.CylinderGeometry(3.15, 3.3, 0.3, 6), disc.x, 4.25, disc.z, mix(col, p.ink, 0.25));
      solidAt(new THREE.ConeGeometry(3.6, 2.0, 6), disc.x, 5.4, disc.z, col);
      solidAt(new THREE.CylinderGeometry(0.1, 0.18, 0.7, 6), disc.x, 6.65, disc.z, cream);
      solidAt(new THREE.SphereGeometry(0.26, 8, 6), disc.x, 7.1, disc.z, mix(col, p.plaza, 0.4));
      blockers.push({ x: disc.x, z: disc.z, r: 3.4, h: 7.2 });
      // Four bollards around the core.
      for (let i = 0; i < 4; i++) {
        const a = disc.angle + Math.PI / 4 + (i * Math.PI) / 2;
        const bx = disc.x + Math.cos(a) * (CORE_RADIUS - 0.9);
        const bz = disc.z + Math.sin(a) * (CORE_RADIUS - 0.9);
        solidAt(new THREE.CylinderGeometry(0.16, 0.2, 0.8, 6), bx, 0.4, bz, stone);
        solidAt(new THREE.SphereGeometry(0.2, 8, 6), bx, 0.9, bz, mix(col, p.plaza, 0.35));
        colliders.push({ x: bx, z: bz, r: 0.3, h: 1.1 });
      }

      // Entry arch where the road meets the district.
      const ux = Math.cos(disc.angle);
      const uz = Math.sin(disc.angle);
      const ar = Math.hypot(disc.x, disc.z) - disc.r + 0.2;
      const ax = ux * ar;
      const az = uz * ar;
      const sign = labelTexture(d.short, { color: p.css.ink, bg: "#ffffff", size: 56, weight: 700, padX: 30 });
      own(sign.texture); // cached as bytes; disposing frees this renderer's copy only
      const signH = 0.82;
      const signW = signH * sign.aspect;
      const span = Math.max(ROAD_WIDTH + 1.4, signW + 0.8);
      const yaw = -disc.angle + Math.PI / 2; // local +z points along the road, outward
      const px = -uz;
      const pz = ux;
      for (const side of [-1, 1]) {
        const qx = ax + px * (span / 2) * side;
        const qz = az + pz * (span / 2) * side;
        solidAt(new THREE.BoxGeometry(0.34, 4.3, 0.34), qx, 2.15, qz, col, yaw);
        solidAt(new THREE.BoxGeometry(0.56, 0.3, 0.56), qx, 0.15, qz, stoneDark, yaw);
        colliders.push({ x: qx, z: qz, r: 0.45, h: 4.6 });
      }
      // Fly-to views avoid parking the camera just behind an arch (its sign would fill the frame).
      // Not a follow-camera blocker: the gateway is open, and framing the walker through it looks right.
      arches.push({ x: ax, z: az, r: span / 2 + 0.4, h: 4.8 });
      solidAt(new THREE.BoxGeometry(span + 0.7, 0.36, 0.42), ax, 4.35, az, col, yaw);
      solidAt(new THREE.BoxGeometry(span + 0.2, 0.12, 0.3), ax, 3.62, az, mix(col, p.ink, 0.3), yaw);
      const signMat = own(withNearFade(new THREE.MeshBasicMaterial({ map: sign.texture, transparent: true, toneMapped: false }), nearFade));
      const signGeo = own(new THREE.PlaneGeometry(signW, signH));
      for (const flip of [0, Math.PI]) {
        const m = new THREE.Mesh(signGeo, signMat);
        m.position.set(ax, 3.95, az);
        // The road runs along the arch's normal; one face toward the plaza, one toward the district.
        m.rotation.y = Math.atan2(-ux, -uz) + flip;
        m.position.x += -ux * 0.23 * (flip ? -1 : 1);
        m.position.z += -uz * 0.23 * (flip ? -1 : 1);
        root.add(m);
      }

      // Emblem: a medallion floating above the obelisk, carrying the district icon.
      const [cv] = cpuCanvas(256, 256);
      const tex = own(canvasTexture(cv));
      const medallion = new THREE.Group();
      const faceMat = own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
      const face = new THREE.Mesh(own(new THREE.CircleGeometry(1.25, 40)), faceMat);
      face.position.z = 0.07;
      const back = new THREE.Mesh(face.geometry, faceMat);
      back.rotation.y = Math.PI;
      back.position.z = -0.07;
      const rim = new THREE.Mesh(own(new THREE.CylinderGeometry(1.33, 1.33, 0.12, 40)), own(new THREE.MeshBasicMaterial({ color: col, toneMapped: false })));
      rim.rotation.x = Math.PI / 2;
      medallion.add(rim, face, back);
      medallion.position.set(disc.x, 8.1, disc.z);
      root.add(medallion);
      const entry = { mesh: medallion, base: 8.1, phase: (hashString(d.slug) % 628) / 100, canvas: cv, tex, color: d.color };
      drawEmblem(entry.canvas, d.color, null);
      tex.needsUpdate = true;
      emblems.push(entry);
      emblemBySlug.set(d.slug, entry);
    }

    const flatGeo = own(merge(flat));
    const flatNrm = flatGeo.attributes.normal;
    for (let i = 0; i < flatNrm.count; i++) flatNrm.setXYZ(i, 0, 1, 0);
    const patches = new THREE.Mesh(
      flatGeo,
      own(toonMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }, { shared: toon })),
    );
    patches.receiveShadow = true;
    root.add(patches);
    // The edge rings keep their colors in any light (unlit).
    const rings = new THREE.Mesh(own(merge(glowing)), own(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })));
    rings.renderOrder = 1;
    root.add(rings);
    const landmarks = new THREE.Mesh(own(merge(solid)), propMaterial());
    landmarks.castShadow = true;
    landmarks.receiveShadow = true;
    root.add(landmarks);
  }

  /* ---------------- the hub (src/views/walk/hub.ts) and the Nexus portal beside it ---------------- */
  const hub = buildHub(p, own, nearFade);
  root.add(hub.group, hub.beaconHead);
  colliders.push(...hub.colliders);
  boxes.push(...hub.boxes);
  blockers.push(...hub.blockers);
  const portal = buildPortal(p, own, nearFade);
  root.add(portal.group);

  /* ---------------- the village: houses, street lamps and wires, bus shelters (village.ts) ---------------- */
  const village = buildVillage(layout, p, own, { prop: propMaterial, glass: glassMaterial });
  root.add(village.group);
  colliders.push(...village.colliders);
  boxes.push(...village.boxes);
  blockers.push(...village.blockers);

  /* ---------------- fingerposts at the road mouths and the "Walking times" board (wayfinding.ts) ---------------- */
  const wayfinding = buildWayfinding(layout, districts, L.hub, p, own, { prop: propMaterial, nearFade });
  root.add(wayfinding.group);
  colliders.push(...wayfinding.colliders);
  boxes.push(...wayfinding.boxes);

  /* ---------------- the set pieces out in the hills and on the coast (scenery.ts) ---------------- */
  const scenery = buildScenery(layout, terrain, p, own, {
    prop: propMaterial,
    glass: glassMaterial,
    lit: own(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })),
  });
  root.add(scenery.group);
  colliders.push(...scenery.colliders);
  boxes.push(...scenery.boxes);
  blockers.push(...scenery.blockers);

  /* ---------------- gulls, butterflies, motes, a balloon, a cat (life.ts) ---------------- */
  const life = buildLife(layout, terrain, p, own, toon, coarse);
  root.add(life.group);

  /* ---------------- plaza furniture: lamps, benches, planters ---------------- */
  {
    const lampSpots = plazaLamps(layout);
    const lampPost_ = lampPost(p, false);
    const lampGeo = own(merge(lampPost_.iron));
    const lampMat = propMaterial();
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampSpots.length);
    // The globes: frosted glass by day, lit (unlit material, its own color) by moonlight.
    const globeGeo = own(merge(lampPost_.glass));
    const globeMat = glassMaterial;
    const globes = new THREE.InstancedMesh(globeGeo, globeMat, lampSpots.length);
    const m4 = new THREE.Matrix4();
    lampSpots.forEach((l, i) => {
      // The arm reaches toward the plaza's center.
      m4.makeRotationY(Math.PI - Math.atan2(l.z, l.x)).setPosition(l.x, 0, l.z);
      lamps.setMatrixAt(i, m4);
      globes.setMatrixAt(i, m4);
      colliders.push({ x: l.x, z: l.z, r: 0.3, h: LAMP_HEIGHT });
    });
    lamps.castShadow = true;
    root.add(lamps, globes);
    own(lamps);
    own(globes);

    // Benches and planters alternate around a ring inside the lamps, clear of the roads, the spawn and the building.
    const benchParts = [
      paint(new THREE.BoxGeometry(2.0, 0.12, 0.6).translate(0, 0.5, 0), p.trunk),
      paint(new THREE.BoxGeometry(2.0, 0.5, 0.1).translate(0, 0.85, -0.28), p.trunk),
      paint(new THREE.BoxGeometry(0.12, 0.5, 0.55).translate(-0.85, 0.25, 0), p.ink),
      paint(new THREE.BoxGeometry(0.12, 0.5, 0.55).translate(0.85, 0.25, 0), p.ink),
    ];
    const benchGeo = own(merge(benchParts));
    const planterParts = [
      paint(new THREE.CylinderGeometry(1.0, 0.85, 0.7, 10).translate(0, 0.35, 0), mix(p.plaza, p.rock, 0.5)),
      paint(new THREE.IcosahedronGeometry(0.95, 1).scale(1, 0.7, 1).translate(0, 1.05, 0), p.tree),
    ];
    const planterGeo = own(merge(planterParts));
    const spots = plazaSeats(layout);
    const benches = new THREE.InstancedMesh(benchGeo, lampMat, Math.max(1, spots.filter((s) => s.kind === "bench").length));
    const planters = new THREE.InstancedMesh(planterGeo, lampMat, Math.max(1, spots.filter((s) => s.kind === "planter").length));
    let bi = 0;
    let pi = 0;
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const s of spots) {
      // Benches face the plaza center.
      q.setFromAxisAngle(up, Math.atan2(-s.x, -s.z));
      m4.compose(new THREE.Vector3(s.x, 0.03, s.z), q, new THREE.Vector3(1, 1, 1));
      if (s.kind === "bench") {
        benches.setMatrixAt(bi++, m4);
        colliders.push({ x: s.x, z: s.z, r: 1.0, h: 1.0 });
      } else {
        planters.setMatrixAt(pi++, m4);
        colliders.push({ x: s.x, z: s.z, r: 1.15, h: 1.8 });
      }
    }
    benches.count = bi;
    planters.count = pi;
    benches.castShadow = planters.castShadow = true;
    benches.receiveShadow = planters.receiveShadow = true;
    root.add(benches, planters);
    own(benches);
    own(planters);
  }

  /* ---------------- plants and rocks (foliage.ts), instanced per tile ---------------- */
  const plantTiles: { mesh: THREE.InstancedMesh; near: THREE.BufferGeometry; far: THREE.BufferGeometry; center: THREE.Vector3; radius: number }[] = [];
  {
    const items: { x: number; z: number; s: number; k: number; kind?: FoliageKind }[] = decorPoints(layout, coarse ? 620 : 760, hashString("walk-decor"));
    // The village's own plantings (between its houses, flanking the road mouths) join the scatter.
    for (const v of village.plants) items.push({ x: v.x, z: v.z, s: v.s, k: 0, kind: v.kind });
    type Spot = { x: number; z: number; s: number; y: number; rot: number; tint: number };
    const tiles = new Map<string, Record<FoliageKind, Spot[]>>();
    const rand = seededRandom(hashString("walk-decor-jitter"));
    for (const it of items) {
      const r = Math.hypot(it.x, it.z);
      const a = Math.atan2(it.z, it.x);
      const y = terrain.heightAt(it.x, it.z);
      if (y < SEA_LEVEL + 0.1) continue;
      // Palms along the coast; broad crowns more often than pines inside the ring of districts; some shrubs in bloom.
      const coastal = r > terrain.shoreAt(a) - 20;
      let kind: FoliageKind = it.kind ?? (it.k === 0 ? "oak" : it.k === 1 ? "pine" : it.k === 2 ? "shrub" : "rock");
      if (!it.kind) {
        if (coastal && (kind === "oak" || kind === "pine")) kind = "palm";
        else if (!coastal && r < layout.ringRadius && kind === "pine" && rand() < 0.5) kind = "oak";
        else if (!coastal && kind === "pine" && rand() < 0.4) kind = "cypress";
        if (kind === "shrub" && rand() < 0.35) kind = "flowers";
      }
      const key = `${Math.floor(it.x / DECOR_TILE)},${Math.floor(it.z / DECOR_TILE)}`;
      let tile = tiles.get(key);
      if (!tile) tiles.set(key, (tile = { oak: [], pine: [], palm: [], cypress: [], shrub: [], flowers: [], rock: [] }));
      tile[kind].push({ x: it.x, z: it.z, s: it.s, y, rot: rand() * Math.PI * 2, tint: rand() });
      const body = FOLIAGE_BODY[kind];
      // Canopies are wider than trunks: the camera clears the crown, the walker only bumps the trunk.
      colliders.push({ x: it.x, z: it.z, r: body.r * it.s, h: y + body.h * it.s });
      if (body.crown > 0) blockers.push({ x: it.x, z: it.z, r: body.crown * it.s, h: y + body.h * it.s });
    }
    const geos = {} as Record<FoliageKind, THREE.BufferGeometry>;
    const farGeos = {} as Record<FoliageKind, THREE.BufferGeometry>;
    const mats = {} as Record<FoliageKind, THREE.MeshLambertMaterial>;
    const depths = {} as Partial<Record<FoliageKind, THREE.MeshDepthMaterial>>;
    for (const kind of FOLIAGE_KINDS) {
      geos[kind] = own(foliageGeometry(kind, p));
      farGeos[kind] = own(foliageFarGeometry(kind, p));
      const o = { shared: toon, nearFade, wind: FOLIAGE_WIND[kind] };
      mats[kind] = own(toonMaterial({ vertexColors: true, flatShading: true }, o));
      if (o.wind > 0) depths[kind] = own(toonDepthMaterial(o));
    }
    const color = new THREE.Color();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const m4 = new THREE.Matrix4();
    const at = new THREE.Vector3();
    const scale = new THREE.Vector3();
    for (const tile of tiles.values()) {
      for (const kind of FOLIAGE_KINDS) {
        const list = tile[kind];
        if (!list.length) continue;
        const mesh = new THREE.InstancedMesh(geos[kind], mats[kind], list.length);
        list.forEach((it, i) => {
          q.setFromAxisAngle(up, it.rot);
          const sy = kind === "rock" ? it.s * 0.9 : it.s;
          m4.compose(at.set(it.x, it.y - 0.06, it.z), q, scale.set(it.s, sy, it.s));
          mesh.setMatrixAt(i, m4);
          const v = 0.9 + it.tint * 0.2;
          color.setRGB(v, v * (0.98 + it.tint * 0.04), v * 0.96);
          mesh.setColorAt(i, color);
        });
        // Bounds from the instances, so the main and shadow cameras cull whole tiles.
        mesh.computeBoundingSphere();
        plantTiles.push({ mesh, near: geos[kind], far: farGeos[kind], center: mesh.boundingSphere!.center.clone(), radius: mesh.boundingSphere!.radius });
        mesh.castShadow = kind !== "rock" && kind !== "shrub" && kind !== "flowers";
        mesh.receiveShadow = true;
        if (depths[kind]) mesh.customDepthMaterial = depths[kind];
        root.add(mesh);
        own(mesh);
      }
    }
  }

  /* ---------------- the grass around the walker (grass.ts; the engine moves it) ---------------- */
  const grass = buildGrass(layout, terrain, p, toon, coarse);
  root.add(grass.mesh);

  /* ---------------- the keepsakes, each in the open beside a set piece (finds.ts) ---------------- */
  const blockedAt = (x: number, z: number): boolean => {
    const r = Math.hypot(x, z);
    if (r < VILLAGE.outer + 2 || r > layout.islandRadius - 10) return true;
    if (terrain.heightAt(x, z) < SEA_LEVEL + 0.4) return true;
    if (onRoad(layout, x, z, 1.5)) return true;
    if (layout.discs.some((d) => Math.hypot(x - d.x, z - d.z) < d.r + 3)) return true;
    if (colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 1.4)) return true;
    for (const b of boxes) {
      const c = Math.cos(b.rot ?? 0);
      const s = Math.sin(b.rot ?? 0);
      const lx = (x - b.x) * c - (z - b.z) * s;
      const lz = (x - b.x) * s + (z - b.z) * c;
      if (Math.abs(lx) < b.hx + 1.4 && Math.abs(lz) < b.hz + 1.4) return true;
    }
    return false;
  };
  const finds = buildFinds(findSpots(layout, scenery.anchors, blockedAt), terrain, p);
  root.add(finds.group);

  // Every other lit prop (the hub, the portal's frame and plinth) takes the same toon light.
  toonify(root, toon);

  /* ---------------- emblem icons ---------------- */
  function setDistrictIcon(slug: AreaSlug, svg: string) {
    const e = emblemBySlug.get(slug);
    if (!e) return;
    const img = new Image();
    img.onload = () => {
      drawEmblem(e.canvas, e.color, img);
      e.tex.needsUpdate = true;
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  /* ---------------- per-frame ---------------- */
  const near = new THREE.Vector3();
  function update(time: number, dt: number, reduced: boolean, cameraYaw: number, cameraAt: THREE.Vector3, walker?: { x: number; z: number }) {
    // Under reduced motion the clouds, the water and the wind hold still.
    const t = reduced ? 0 : time;
    sky.update(t, cameraAt);
    sea.update(t);
    toon.windTime.value = t;
    toon.cloudOffset.value.set(0.13 + t * 0.0042, 0.57 - t * 0.0016);
    // A plant tile far from the camera draws its plants' far versions.
    for (const tile of plantTiles) {
      near.copy(tile.center).sub(cameraAt).setY(0);
      const geo = near.length() - tile.radius > FOLIAGE_FAR ? tile.far : tile.near;
      if (tile.mesh.geometry !== geo) tile.mesh.geometry = geo;
    }
    // The hub's rooftop sign turns to face the camera (a yaw, not motion: kept under reduced motion).
    hub.update(cameraYaw);
    portal.update(time, reduced);
    scenery.update(time, reduced);
    life.update(time, dt, reduced, walker ?? { x: cameraAt.x, z: cameraAt.z });
    for (const e of emblems) {
      e.mesh.rotation.y = cameraYaw;
      e.mesh.position.y = reduced ? e.base : e.base + Math.sin(time * 1.1 + e.phase) * 0.18;
    }
  }

  function dispose() {
    hub.dispose();
    portal.dispose();
    village.dispose();
    scenery.dispose();
    finds.dispose();
    life.dispose();
    sky.dispose();
    sea.dispose();
    grass.dispose();
    for (const d of disposables) d.dispose();
    sun.dispose();
  }

  return {
    root,
    colliders,
    blockers,
    arches,
    boxes,
    sun,
    sunDir,
    hemi,
    nearFade,
    landmarkTop: LANDMARK_TOP,
    hubTop: hub.hubTop,
    beacon: hub.beacon,
    hubOccluder: hub.occluder,
    toon,
    grass,
    finds,
    setDistrictIcon,
    update,
    dispose,
  };
}

/** A round medallion: white face, district-color ring, the icon in the district color. */
function drawEmblem(canvas: HTMLCanvasElement, color: string, icon: HTMLImageElement | null) {
  const ctx = cpuContext(canvas);
  const S = canvas.width;
  ctx.clearRect(0, 0, S, S);
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 18, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  if (icon) {
    const k = S * 0.52;
    ctx.drawImage(icon, (S - k) / 2, (S - k) / 2, k, k);
  }
}
