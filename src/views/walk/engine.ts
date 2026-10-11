/* The walk world's imperative core: builds the scene once per mount, owns
   the avatar, the follow camera, input, live explorers and the projected
   DOM labels, and runs once per frame from useFrame. React only renders the
   HUD; nothing here sets React state per frame — it calls the hooks below
   only when a value actually changes.

   People walk the same machinery as companies: their pins are in the same
   pin system (in the People area on the ring), their name labels in the
   same label pass, and a person fly request lands the walker at their pin
   the way a company request does. Meeting a person opens the person sheet;
   nothing here links a person to any company or district. */
import * as THREE from "three";
import { PEOPLE, DISTRICTS, COMPANIES } from "../../data/catalog";
import { PORTAL, hubRoofAt, segmentHitsHub } from "../../data/hub";
import { PEOPLE_AREA, PLAZA_RADIUS, RUN_MULTIPLIER, WALK_SPEED, districtAt, hashString, layoutWorld, onRoad, type AreaSlug, type WorldLayout } from "../../data/layout";
import type { AvatarSpec } from "../../live/identity";
import type { LiveSession, LiveState } from "../../live/presence";
import type { FlyRequest } from "../../state/store";
import { useStore } from "../../state/store";
import { toonify } from "../../three/toon";
import { buildCar, CAR_SPEED, CAR_SPRINT_SPEED, CAR_COLLISION_RADIUS, canEnterCar, findCarSpawn, findCarExit } from "./car";
import { LEAP_DURATION, LEAP_SPEED, LEAP_RUN_SPEED, leapHeight } from "./leap";
import { Ambience } from "./ambience";
import { buildAvatar, type Avatar } from "./avatar";
import type { FindKind, FindProgress } from "./finds";
import { Explorers, type ExplorerDot } from "./explorers";
import { Minimap } from "./minimap";
import { AVATAR_RADIUS, ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, cameraRelative, clearPitch, districtEntrance, lookLift, pitchFor, resolveCollisions, standNear, type Circle } from "./nav";
import { readScenePalette, watchScenePalette, type ScenePalette } from "./palette";
import { walkAreas } from "./areas";
import { FADED, buildPins, type PinSystem } from "./pins";
import { createTerrain, type Terrain } from "./terrain";
import { clamp, damp, lerpAngle } from "./util";
import { buildWorld, type World } from "./world";

const LABEL_RANGE = 16;
const LABEL_MAX = 10;
const MEET_RANGE = 4.5;
const DISTRICT_LABEL_Y = 10.9;
const DISTRICT_LABEL_RANGE = 340;
/** Camera swing off the walker's back after flying to a company (radians). */
const FLY_SHOULDER = 0.45;
/** Extra camera pitch after flying to a company, to look over nearby treetops (radians). */
const FLY_TILT = 0.08;

/** Where the walker is relative to the Nexus portal: away from it, beside it, or stepping through its ring. */
export type PortalState = "far" | "near" | "inside";
/** Within this distance of the portal's center, the walker is beside it (the HUD offers the way through). */
const PORTAL_NEAR = 7.5;

/** The walker's place relative to the portal at (x, z): through its ring (in the ring's plane, between the posts), beside it, or away. Pure. */
export function portalStateAt(x: number, z: number): PortalState {
  const dx = x - PORTAL.x;
  const dz = z - PORTAL.z;
  const along = dx * Math.sin(PORTAL.facing) + dz * Math.cos(PORTAL.facing);
  const across = dx * Math.cos(PORTAL.facing) - dz * Math.sin(PORTAL.facing);
  if (Math.abs(along) < 0.75 && Math.abs(across) < PORTAL.r - 0.9) return "inside";
  return Math.hypot(dx, dz) < PORTAL_NEAR ? "near" : "far";
}

export interface EngineHooks {
  /** The walker came beside the Nexus portal, stepped through its ring, or walked away. */
  onPortal(state: PortalState): void;
  /** Enter pressed beside the portal with no pin in meeting range: go through. */
  onPortalEnter(): void;
  /** The company or person within meeting range changed. */
  onNear(slug: string | null): void;
  /** The avatar walked into (or out of) a district or the People area. */
  onDistrict(slug: AreaSlug | null): void;
  /** Movement was attempted while controls are paused (sheet/panel focused). */
  onPausedNudge(): void;
  onTravelMessage?(message: string | null): void;
  onCar?(action: "summon" | "enter" | "exit"): void;
  /** The walker picked up a keepsake (finds.ts); the progress says what has been found so far. */
  onFind?(kind: FindKind, progress: FindProgress): void;
}

export interface Overlay {
  /** One label per disc on the ring, by area slug (the districts and the People area). */
  districtButtons: Map<string, HTMLButtonElement>;
  /** One name label per pin, by company or person slug. */
  pinButtons: Map<string, HTMLButtonElement>;
  tagLayer: HTMLElement;
  fade: HTMLElement;
  stick: HTMLElement;
  stickKnob: HTMLElement;
  /** The D-pad and the camera buttons: the pad tucks away when the details sheet pushes it into them. */
  pad?: HTMLElement | null;
  camBtns?: HTMLElement | null;
}

type Dir = "f" | "b" | "l" | "r";

const KEYMAP: Record<string, Dir> = {
  KeyW: "f",
  ArrowUp: "f",
  KeyS: "b",
  ArrowDown: "b",
  KeyA: "l",
  ArrowLeft: "l",
  KeyD: "r",
  ArrowRight: "r",
};

/** Does the screen rect (x, y, w, h) come within `pad` of the rect r ([x, y, w, h]; w <= 0 means none)? */
function touches(r: number[], x: number, y: number, w: number, h: number, pad: number): boolean {
  if (r[2] <= 0 || r[3] <= 0) return false;
  return x < r[0] + r[2] + pad && x + w + pad > r[0] && y < r[1] + r[3] + pad && y + h + pad > r[1];
}

export function isTextField(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return !["button", "checkbox", "radio", "range", "submit", "reset", "color"].includes(type);
  }
  return (el as HTMLElement).isContentEditable === true;
}

/** Widgets that use the arrow keys themselves: walking keys pressed there belong to them. */
const ARROW_WIDGETS = "[role='listbox'], [role='combobox'], [role='menu'], [role='menubar'], [role='slider'], [role='tablist'], [role='radiogroup'], [role='tree'], [role='grid'], select";

/** Controls that act on Enter themselves (a heading or the world region does not). */
const ENTER_CONTROLS = "button, a[href], input, select, textarea, summary, [role='button'], [role='link'], [role='checkbox'], [role='switch'], [role='tab'], [role='menuitem'], [role='option']";

export class WalkEngine {
  readonly layout: WorldLayout;
  readonly palette: ScenePalette;
  readonly terrain: Terrain;
  readonly world: World;
  readonly pins: PinSystem;
  readonly explorers: Explorers;
  readonly tagLayer: HTMLDivElement;
  avatar: Avatar;

  private camera: THREE.PerspectiveCamera | null = null;
  private scene: THREE.Scene | null = null;
  private overlay: Overlay | null = null;
  private minimap: Minimap | null = null;
  private session: LiveSession | null = null;
  private hooks: EngineHooks;
  private colliders: Circle[];
  private flyBlockers: Circle[];

  // Avatar state.
  x: number;
  z: number;
  heading: number;
  private leap: { elapsed: number; x: number; z: number; speed: number } | null = null;
  private lift = 0;
  readonly car = buildCar();
  /** The world's sound (ambience.ts): off until the visitor turns it on. */
  readonly ambience = new Ambience();
  private driving = false;
  private carAction: "summon" | "enter" | "exit" = "summon";
  private carMoving = 0;
  private walkDistance = ZOOM_DEFAULT;
  private speed01 = 0;
  private running = false;
  private district: AreaSlug | null = null;
  private near: string | null = null;
  private portal: PortalState = "far";

  // Camera rig.
  yaw: number;
  private yawTarget: number;
  /** When the visitor last turned the view by hand (the follow camera leaves it alone for a moment). */
  private lookedAt = -10;
  private dist = ZOOM_DEFAULT;
  private distTarget = ZOOM_DEFAULT;
  private pitchOff = 0;
  private camTarget = new THREE.Vector3();
  private shadowHalf = 0;

  // Input.
  private keys = new Set<Dir>();
  readonly pad: Record<Dir, boolean> = { f: false, b: false, l: false, r: false };
  private rotate = { q: false, e: false };
  private shift = false;
  /** Touch joystick. `live` turns on once the finger has dragged past a few pixels, so a quick tap still picks a pin. */
  private stick = { id: -1, x: 0, y: 0, ox: 0, oy: 0, live: false, t: 0 };
  /** Active touch points (touch input only; mouse/pen use `drags`). */
  private touches = new Map<number, { x: number; y: number }>();
  private twoFinger: { mx: number; my: number; dist: number } | null = null;
  private drags = new Map<number, { x: number; y: number; sx: number; sy: number; t: number; moved: boolean }>();
  private pinch = 0;
  private nudged = 0;

  // Misc.
  reduced: boolean;
  private time = 0;
  private started = false;
  private frames = 0;
  private dropped = false;
  private lastFly = 0;
  private fadeTimer = 0;
  private miniTimer = 0;
  private dots: ExplorerDot[] = [];
  private width = 1;
  private height = 1;
  private v = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private hoverAt = 0;
  private labelOrder: { i: number; d: number }[] = [];
  private shownLabels = new Set<string>();
  private shownDistricts = new Set<string>();
  private sizes = new WeakMap<HTMLElement, { w: number; h: number }>();
  private rects: number[] = [];
  private wantLabels = new Set<string>();
  private discOrder: { disc: WorldLayout["discs"][number]; d: number }[] = [];
  private viewShift = 0;
  private pitchLift = 0;
  /** The follow camera's floor over the hub's roofs: it rises at once and settles back gently. */
  private roofFloor = 0;
  private appliedShift = 0;
  private appliedSize = "";
  private disposed = false;
  private stopPaletteWatch: () => void;
  private viewEl: HTMLElement | null = null;
  private sheetPx = 0;
  private padKey = "";
  private padEpoch = 0;
  /** Screen rects (x, y, w, h in view pixels) that projected labels keep clear of, e.g. the district banner. */
  private reserved: number[] = [];
  /** The HUD's controls and cards (x, y, w, h in view pixels): names never cover them; area labels slide out from under them. */
  private hud: number[] = [];
  /** Screen rect of the hub's rooftop sign this frame (x, y, w, h), or w < 0 when it is off screen. */
  private beaconRect = [0, 0, -1, 0];
  /** Screen rect of the sign's pole, from the sign down to the roof. */
  private poleRect = [0, 0, -1, 0];

  /** Where this explorer arrives: the layout's spawn, nudged sideways per visitor so two arrivals don't overlap. */
  private readonly spawn: { x: number; z: number; facing: number };

  constructor(hooks: EngineHooks, avatarSpec: AvatarSpec, reduced: boolean, visitorId = "") {
    this.hooks = hooks;
    this.reduced = reduced;
    this.layout = layoutWorld(
      DISTRICTS.map((d) => d.slug),
      COMPANIES,
      PEOPLE,
    );
    this.palette = readScenePalette();
    this.terrain = createTerrain(this.layout);
    this.world = buildWorld(this.layout, walkAreas(), this.terrain, this.palette);
    this.pins = buildPins(this.layout, COMPANIES, PEOPLE);
    this.colliders = [...this.world.colliders, ...this.pins.colliders];
    // For choosing a fly-to view only: logo and headshot badges crowd the foreground like tree crowns do.
    this.flyBlockers = [...this.world.blockers, ...this.world.arches, ...this.pins.blockers];
    this.tagLayer = document.createElement("div");
    this.tagLayer.className = "walk-tags";
    // The pins' posts and heads, every explorer and the car take the world's toon light too.
    const toon = this.world.toon;
    toonify(this.pins.root, toon);
    this.explorers = new Explorers(this.tagLayer, (x, z) => this.groundAt(x, z), (root) => toonify(root, toon));
    this.avatar = buildAvatar(avatarSpec);
    toonify(this.avatar.root, toon);
    toonify(this.car.root, toon);
    this.car.root.visible = false;
    const base = this.layout.spawn;
    const side = visitorId ? ((hashString(visitorId) % 1001) / 1000 - 0.5) * 5 : 0;
    const at = resolveCollisions(this.layout, base.x + side, base.z, this.colliders, this.world.boxes);
    const spawn = (this.spawn = { x: at.x, z: at.z, facing: base.facing });
    this.x = spawn.x;
    this.z = spawn.z;
    this.heading = spawn.facing;
    this.yaw = this.yawTarget = spawn.facing + Math.PI;
    if (import.meta.env.DEV) {
      // Development only: ?at=x,z[,heading[,distance]] starts the walker somewhere, to look at a corner of the world.
      const at = new URLSearchParams(location.search).get("at")?.split(",").map(Number);
      if (at && at.length >= 2 && at.every(Number.isFinite)) {
        this.x = at[0];
        this.z = at[1];
        if (at.length > 2) this.heading = at[2];
        this.yaw = this.yawTarget = this.heading + Math.PI;
        if (at.length > 3) this.dist = this.distTarget = at[3];
      }
    }
    this.stopPaletteWatch = watchScenePalette((palette) => this.setPalette(palette));
  }

  /* ---------------- lifecycle ---------------- */

  private setPalette(palette: ScenePalette): void {
    if (this.disposed) return;
    this.world.setPalette(palette);
    Object.assign(this.palette, palette);
    if (this.scene) {
      this.scene.background = palette.skyBottom.clone();
      const fog = this.scene.fog;
      if (fog instanceof THREE.Fog) fog.color.copy(palette.fog);
    }
    this.minimap?.setPalette(palette);
    this.drawMinimap();
    this.shadowHalf = 0;
  }

  attach(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.scene = scene;
    this.camera = camera;
    const p = this.palette;
    scene.background = p.skyBottom.clone();
    // Aerial perspective: distant land fades into the horizon's haze.
    scene.fog = new THREE.Fog(p.fog.clone(), 100, 480);
    scene.add(this.world.root, this.pins.root, this.avatar.root, this.explorers.root, this.car.root);
    this.placeAvatar();
    this.setSize(this.width, this.height);
    this.updateCamera(1, true);
  }

  setOverlay(o: Overlay | null): void {
    this.overlay = o;
    this.padKey = "";
    if (o && !this.tagLayer.isConnected) o.tagLayer.appendChild(this.tagLayer);
  }

  setMinimap(canvas: HTMLCanvasElement | null, size: number): void {
    if (!canvas) {
      this.minimap = null;
      return;
    }
    const pins = this.pins;
    this.minimap = new Minimap(canvas, size, this.layout, this.terrain, walkAreas(), { xs: pins.xs, zs: pins.zs, colorOf: (i) => pins.colorOf(i) }, this.palette);
    this.drawMinimap();
  }

  setSession(s: LiveSession | null): void {
    this.session = s;
  }

  syncLive(state: LiveState): void {
    this.explorers.sync(state);
  }

  setSize(w: number, h: number): void {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    // Portrait screens get a taller field of view so the world isn't seen through a keyhole.
    const aspect = this.width / this.height;
    const fov = aspect >= 1 ? 46 : Math.min(64, 46 + (1 - aspect) * 30);
    if (this.camera && Math.abs(this.camera.fov - fov) > 0.1) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  setReduced(r: boolean): void {
    this.reduced = r;
  }

  setAvatar(spec: AvatarSpec): void {
    const old = this.avatar;
    this.avatar = buildAvatar(spec);
    toonify(this.avatar.root, this.world.toon);
    this.avatar.root.visible = !this.driving;
    if (this.scene) {
      this.scene.remove(old.root);
      this.scene.add(this.avatar.root);
    }
    old.dispose();
    this.placeAvatar();
  }

  dispose(): void {
    this.disposed = true;
    this.ambience.dispose();
    this.stopPaletteWatch();
    window.clearTimeout(this.fadeTimer);
    if (this.scene) this.scene.remove(this.world.root, this.pins.root, this.avatar.root, this.explorers.root, this.car.root);
    if (this.scene) this.scene.fog = null;
    this.world.dispose();
    this.pins.dispose();
    this.avatar.dispose();
    this.car.dispose();
    this.explorers.dispose();
    this.tagLayer.remove();
  }

  /* ---------------- store-driven ---------------- */

  setHighlight(h: Set<string> | null): void {
    this.pins.setHighlight(h);
  }

  setSelected(slug: string | null): void {
    this.pins.setSelected(slug);
  }

  setDistrictIcon(slug: AreaSlug, svg: string): void {
    this.world.setDistrictIcon(slug, svg);
  }

  /** Act on a fly request once (by nonce). */
  fly(req: FlyRequest | null): void {
    if (!req || req.nonce === this.lastFly) return;
    this.lastFly = req.nonce;
    if (req.kind === "home") {
      const s = this.spawn;
      this.teleport(s.x, s.z, s.facing);
    } else if (req.kind === "district" && req.slug) {
      this.goTo(req.slug as AreaSlug);
    } else if ((req.kind === "company" || req.kind === "person") && req.slug) {
      const pin = this.layout.pins.get(req.slug);
      // A company request lands only at a company's pin, a person request only at a person's.
      if (!pin || (pin.district === PEOPLE_AREA) !== (req.kind === "person")) return;
      const disc = this.layout.discs.find((d) => d.slug === pin.district) ?? null;
      const dist = Math.min(this.distTarget, 16);
      // Look over the walker's shoulder, so the pin stands beside them on screen rather than behind their head.
      const yawOffset = FLY_SHOULDER;
      const s = standNear(this.layout, pin, disc, this.colliders, this.world.boxes, { blockers: this.flyBlockers, cameraDistance: dist, yawOffset, tilt: FLY_TILT });
      this.teleport(s.x, s.z, s.heading, dist, yawOffset, FLY_TILT);
    }
  }

  /**
   * Go to a district's (or the People area's) road entrance. District fly requests come here; the
   * People area's label and map entry call it directly, since the People area is not a district
   * the store can focus.
   */
  goTo(slug: AreaSlug): void {
    const disc = this.layout.discs.find((d) => d.slug === slug);
    if (!disc) return;
    const e = districtEntrance(disc);
    this.teleport(e.x, e.z, e.heading);
  }

  private teleport(x: number, z: number, heading: number, dist?: number, yawOffset = 0, tilt = 0): void {
    const go = () => {
      this.leap = null;
      this.lift = 0;
      this.driving = false;
      this.avatar.root.visible = true;
      this.syncCarAction();
      this.x = x;
      this.z = z;
      this.heading = heading;
      if (dist !== undefined) this.dist = this.distTarget = dist;
      this.yaw = this.yawTarget = heading + Math.PI + yawOffset;
      this.pitchOff = tilt;
      this.placeAvatar();
      this.updateCamera(1, true);
      this.trackPlace();
    };
    window.clearTimeout(this.fadeTimer);
    const fade = this.overlay?.fade;
    if (this.reduced || !fade || !this.started) {
      go();
      return;
    }
    fade.classList.add("is-on");
    this.fadeTimer = window.setTimeout(() => {
      if (this.disposed) return;
      go();
      this.fadeTimer = window.setTimeout(() => fade.classList.remove("is-on"), 40);
    }, 190);
  }

  /** Swing the camera back behind the walker and level the orbit (zoom is kept). */
  recenter(): void {
    this.yawTarget = this.heading + Math.PI;
    this.pitchOff = 0;
    if (this.reduced) this.yaw = this.yawTarget;
  }

  zoomBy(factor: number): void {
    this.distTarget = clamp(this.distTarget * factor, ZOOM_MIN, ZOOM_MAX);
    if (this.reduced) this.dist = this.distTarget;
  }

  /** The HUD around the D-pad moved (e.g. the minimap opened): check again whether the pad fits. */
  hudChanged(): void {
    this.padEpoch++;
  }

  /** The HUD's controls and cards, measured by the view when its layout changes (never per frame). */
  setHud(rects: readonly { x: number; y: number; w: number; h: number }[]): void {
    this.hud = rects.flatMap((r) => [r.x, r.y, r.w, r.h]);
  }

  /** Keep projected labels out of a HUD element's area (or release it with null). */
  reserve(rect: { x: number; y: number; w: number; h: number } | null): void {
    this.reserved = rect ? [rect.x, rect.y, rect.w, rect.h] : [];
  }

  /** Nearest company or person within meeting range, if any. */
  get nearCompany(): string | null {
    return this.near;
  }

  /** Open a pin's sheet: the company's, or the person's for a person pin. */
  private meet(slug: string): void {
    const i = this.pins.indexOf.get(slug);
    if (i === undefined) return;
    const s = useStore.getState();
    if (this.pins.isPerson(i)) s.selectPerson(slug, { fly: false });
    else s.select(slug, { fly: false });
  }

  /* ---------------- input ---------------- */

  /** Attach keyboard (window) and pointer (canvas) input. Returns a detach function. */
  attachInput(canvas: HTMLElement, viewEl: HTMLElement): () => void {
    this.viewEl = viewEl;
    // The element that took focus from a click or tap (Chrome leaves focus on a clicked button). It
    // was not chosen with the keyboard, so Enter there still meets the company in front of you; a
    // control reached with Tab keeps its own Enter.
    let pointerLast = false;
    let clickFocused: Element | null = null;
    const onAnyPointer = () => {
      pointerLast = true;
    };
    const onAnyKey = () => {
      pointerLast = false;
    };
    const onFocusIn = (e: FocusEvent) => {
      clickFocused = pointerLast ? (e.target as Element | null) : null;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as Element | null;
      if (isTextField(t)) return;
      // Keys typed anywhere else on the page (a top-bar button just clicked, say) still walk,
      // unless the focused widget uses arrows itself.
      if (t && t !== document.body && !viewEl.contains(t) && t.closest(ARROW_WIDGETS)) return;
      const dir = KEYMAP[e.code];
      if (dir) {
        const inSheet = !!t?.closest(".sheet");
        const arrow = e.code.startsWith("Arrow");
        // Arrows inside the details sheet scroll it; never hijack them there.
        if (inSheet && arrow) return;
        this.keys.add(dir);
        const paused = this.keysPaused();
        if (arrow && !paused) e.preventDefault();
        if (paused) this.nudge();
        return;
      }
      if (e.key === "Shift") this.shift = true;
      else if (e.code === "Space") {
        if (!t || !viewEl.contains(t)) return;
        if (t?.closest(ENTER_CONTROLS) || t?.closest(".walk-intro, .sheet, .panel")) return;
        e.preventDefault();
        if (!e.repeat) this.jump();
      }
      else if (e.code === "KeyF") {
        if (!t || !viewEl.contains(t)) return;
        if (t?.closest(ENTER_CONTROLS) || t?.closest(".walk-intro, .sheet, .panel")) return;
        e.preventDefault();
        if (!e.repeat) this.useCar();
      }
      else if (e.code === "KeyQ") this.rotate.q = true;
      else if (e.code === "KeyE") this.rotate.e = true;
      else if (e.key === "Enter") {
        // A control reached with the keyboard handles its own Enter. The world, the sheet's title and
        // a button that only kept focus after a click all mean "meet".
        if (t && t !== clickFocused && t.closest(ENTER_CONTROLS)) return;
        if (this.near && !this.keysPaused()) {
          e.preventDefault();
          this.meet(this.near);
        } else if (this.portal !== "far" && !this.keysPaused() && !this.leap && !this.driving) {
          e.preventDefault();
          this.hooks.onPortalEnter();
        }
      } else if (e.key === "+" || e.key === "=") this.zoomBy(0.85);
      else if (e.key === "-" || e.key === "_") this.zoomBy(1 / 0.85);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const dir = KEYMAP[e.code];
      if (dir) this.keys.delete(dir);
      if (e.key === "Shift") this.shift = false;
      if (e.code === "KeyQ") this.rotate.q = false;
      if (e.code === "KeyE") this.rotate.e = false;
    };
    const clear = () => this.clearInput();
    const onVis = () => {
      if (document.visibilityState !== "visible") this.clearInput();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      // Return keyboard focus to the world (blurs the sheet / search).
      const ae = document.activeElement as HTMLElement | null;
      if (ae && ae !== document.body && !viewEl.contains(ae)) ae.blur();
      if (document.activeElement !== viewEl) viewEl.focus({ preventScroll: true });
      // Focus is back in the world: drop any input lock the sheet or search left behind.
      if (useStore.getState().inputLocked) useStore.getState().setInputLocked(false);
      const rect = canvas.getBoundingClientRect();
      const lx = e.clientX - rect.left;
      const ly = e.clientY - rect.top;
      if (e.pointerType === "touch") {
        // Touch: one finger anywhere is a floating joystick; a second finger turns it into
        // pinch-to-zoom + two-finger turn (and cancels the stick).
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.touches.size === 1) {
          this.stick = { id: e.pointerId, x: 0, y: 0, ox: lx, oy: ly, live: false, t: performance.now() };
        } else if (this.touches.size === 2) {
          this.resetStick();
          this.twoFinger = this.twoFingerState();
        }
      } else {
        this.drags.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false });
        if (this.drags.size === 2) this.pinch = this.pinchDistance();
      }
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        const t = this.touches.get(e.pointerId);
        if (!t) return;
        t.x = e.clientX;
        t.y = e.clientY;
        if (this.touches.size >= 2) {
          const now = this.twoFingerState();
          const prev = this.twoFinger;
          if (prev && now) {
            if (prev.dist > 0 && now.dist > 0) this.zoomBy(prev.dist / now.dist);
            this.yawTarget -= (now.mx - prev.mx) * 0.0065;
            this.lookedAt = this.time;
            this.pitchOff = clamp(this.pitchOff + (now.my - prev.my) * 0.0035, -0.22, 0.38);
            if (this.reduced) this.yaw = this.yawTarget;
          }
          this.twoFinger = now;
          return;
        }
        if (e.pointerId !== this.stick.id) return;
        const rect = canvas.getBoundingClientRect();
        const dx = e.clientX - rect.left - this.stick.ox;
        const dy = e.clientY - rect.top - this.stick.oy;
        const len = Math.hypot(dx, dy);
        if (!this.stick.live) {
          if (len < 8) return; // still a tap
          this.stick.live = true;
          const o = this.overlay;
          if (o) {
            o.stick.hidden = false;
            o.stick.style.transform = `translate3d(${this.stick.ox}px, ${this.stick.oy}px, 0)`;
          }
        }
        const max = 56;
        const k = len > max ? max / len : 1;
        this.stick.x = (dx * k) / max;
        this.stick.y = (-dy * k) / max;
        if (this.overlay) this.overlay.stickKnob.style.transform = `translate3d(${(dx * k).toFixed(1)}px, ${(dy * k).toFixed(1)}px, 0)`;
        return;
      }
      const d = this.drags.get(e.pointerId);
      if (!d) {
        if (e.pointerType === "mouse") this.hover(e, canvas);
        return;
      }
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) d.moved = true;
      if (this.drags.size >= 2) {
        const now = this.pinchDistance();
        if (this.pinch > 0 && now > 0) this.zoomBy(this.pinch / now);
        this.pinch = now;
        return;
      }
      if (!d.moved) return;
      this.yawTarget -= dx * 0.0065;
      this.lookedAt = this.time;
      this.pitchOff = clamp(this.pitchOff + dy * 0.0035, -0.22, 0.38);
      if (this.reduced) this.yaw = this.yawTarget;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        const had = this.touches.delete(e.pointerId);
        if (this.touches.size < 2) this.twoFinger = null;
        if (e.pointerId === this.stick.id) {
          const tap = !this.stick.live && e.type === "pointerup" && performance.now() - this.stick.t < 600;
          this.resetStick();
          if (tap) this.pick(e.clientX, e.clientY, canvas);
        } else if (had && this.touches.size === 0) {
          this.resetStick();
        }
        return;
      }
      const d = this.drags.get(e.pointerId);
      this.drags.delete(e.pointerId);
      if (this.drags.size < 2) this.pinch = 0;
      if (d && !d.moved && e.type === "pointerup" && performance.now() - d.t < 600) this.pick(e.clientX, e.clientY, canvas);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      this.zoomBy(Math.exp(clamp(delta, -200, 200) * 0.0012));
    };
    const onLeave = () => {
      canvas.style.cursor = "";
    };

    window.addEventListener("pointerdown", onAnyPointer, true);
    window.addEventListener("keydown", onAnyKey, true);
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", onVis);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("pointerdown", onAnyPointer, true);
      window.removeEventListener("keydown", onAnyKey, true);
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
    };
  }

  clearInput(): void {
    this.keys.clear();
    this.pad.f = this.pad.b = this.pad.l = this.pad.r = false;
    this.rotate.q = this.rotate.e = false;
    this.shift = false;
    this.resetStick();
    this.touches.clear();
    this.twoFinger = null;
    this.drags.clear();
    this.pinch = 0;
  }

  private resetStick() {
    this.stick = { id: -1, x: 0, y: 0, ox: 0, oy: 0, live: false, t: 0 };
    if (this.overlay) this.overlay.stick.hidden = true;
  }

  /** Midpoint and spread of the first two touches. */
  private twoFingerState(): { mx: number; my: number; dist: number } | null {
    const pts = [...this.touches.values()];
    if (pts.length < 2) return null;
    const [a, b] = pts;
    return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  private pinchDistance(): number {
    const pts = [...this.drags.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  private nudge() {
    const now = performance.now();
    if (now - this.nudged < 2500) return;
    this.nudged = now;
    this.hooks.onPausedNudge();
  }

  /**
   * Only the KEYBOARD ever pauses, and only while the visitor is typing (search, finder fields):
   * then W/A/S/D are letters, not steps. Touch, the joystick and the arrow buttons always move —
   * an open sheet or panel, or focus left on a button in it (iOS doesn't move focus on tap),
   * must never freeze the walker.
   */
  private keysPaused(): boolean {
    return isTextField(document.activeElement);
  }

  private castFrom(clientX: number, clientY: number, canvas: HTMLElement): string | null {
    if (!this.camera) return null;
    const rect = canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    // The raycaster ignores `visible`: drop badges still waiting in the air to drop in.
    const hits = this.raycaster.intersectObjects(this.pins.pickables, false).filter((h) => h.object.visible);
    // Prefer a highlighted pin over a dimmed one in front of it.
    for (const h of hits) {
      const slug = this.pins.slugOf(h);
      if (slug && this.pins.opacityOf(this.pins.indexOf.get(slug) ?? 0) > (1 + FADED) / 2) return slug;
    }
    return hits.length ? this.pins.slugOf(hits[0]) : null;
  }

  private pick(clientX: number, clientY: number, canvas: HTMLElement) {
    const slug = this.castFrom(clientX, clientY, canvas);
    if (slug) this.meet(slug);
  }

  private hover(e: PointerEvent, canvas: HTMLElement) {
    const now = performance.now();
    if (now - this.hoverAt < 70) return;
    this.hoverAt = now;
    canvas.style.cursor = this.castFrom(e.clientX, e.clientY, canvas) ? "pointer" : "";
  }

  /* ---------------- per frame ---------------- */

  frame(dtRaw: number): void {
    if (!this.camera || this.disposed) return;
    // Slow devices still walk at full speed (sub-stepped below); a stalled tab doesn't teleport.
    const dt = Math.min(0.1, Math.max(0, dtRaw));
    const now = performance.now();
    this.time += dt;
    this.started = true;
    // Pins wait in the air until the first frames (and their shader compile stall) are past, then drop in.
    this.frames++;
    if (!this.dropped && (this.reduced || this.frames >= 3)) {
      this.dropped = true;
      this.pins.drop(now / 1000, this.x, this.z, !this.reduced);
    }

    this.step(dt);
    const portal = this.leap || this.driving ? "far" : portalStateAt(this.x, this.z);
    if (portal !== this.portal) {
      this.portal = portal;
      this.hooks.onPortal(portal);
    }
    this.updateCamera(dt, false);
    this.world.update(this.time, dt, this.reduced, this.yaw, this.camera.position, this);
    const find = this.world.finds.update(this.time, dt, this.reduced, { x: this.x, z: this.z, y: this.groundAt(this.x, this.z) + this.lift });
    if (find) this.hooks.onFind?.(find, this.world.finds.progress());
    this.updateSound(dt);
    this.pins.update(now / 1000, dt, this.time, this.reduced, this.camera, this.camera.position.distanceTo(this.camTarget));
    this.avatar.animate(dt, this.time, this.leap ? 0 : this.speed01, this.reduced);
    this.car.animate(dt, this.carMoving);
    this.syncCarAction();
    this.world.grass.update(this.x, this.z, this.reduced ? 0 : this.time);
    this.explorers.update(now, dt, this.time, this.reduced, this.camera, this.width, this.height, this);
    this.followSun();
    this.updateLabels();
    this.trackPlace();
    this.tuckPad();

    this.publish();

    this.miniTimer += dt;
    if (this.miniTimer > 0.1) {
      this.miniTimer = 0;
      this.drawMinimap();
    }
  }

  /** Turn the world's sound on or off (from a click or key press: a browser's rule). */
  setSound(on: boolean): void {
    this.ambience.setNight(this.palette.dark);
    this.ambience.setEnabled(on);
  }

  /** Nudge the sound to where the walker is: footsteps by the ground, the sea by the coast. */
  private updateSound(dt: number): void {
    if (!this.ambience.playing) return;
    const r = Math.hypot(this.x, this.z);
    const edge = this.terrain.waterlineAt(Math.atan2(this.z, this.x)) - r;
    const shore = clamp(1 - edge / 42, 0, 1);
    this.ambience.update(dt, {
      stepping: this.speed01 > 0.2 && !this.leap && !this.driving,
      running: this.running,
      road: r < PLAZA_RADIUS + 0.5 || onRoad(this.layout, this.x, this.z, 0),
      shore,
      wind: clamp(0.3 + shore * 0.5 + this.groundAt(this.x, this.z) * 0.08, 0, 1),
    });
  }

  /** Share this explorer's pose, every frame (the session throttles, deduplicates and stays quiet while hidden). */
  publish(): void {
    const moving = this.speed01 > 0.05 && document.visibilityState === "visible";
    this.session?.publish({ x: this.x, z: this.z, heading: this.heading, moving, running: moving && this.running, district: this.district });
  }

  private step(dt: number) {
    let f = 0;
    let r = 0;
    const keysOn = !this.keysPaused();
    if ((keysOn && this.keys.has("f")) || this.pad.f) f += 1;
    if ((keysOn && this.keys.has("b")) || this.pad.b) f -= 1;
    if ((keysOn && this.keys.has("r")) || this.pad.r) r += 1;
    if ((keysOn && this.keys.has("l")) || this.pad.l) r -= 1;
    if (this.stick.live) {
      f += this.stick.y;
      r += this.stick.x;
    }
    const rot = keysOn ? (this.rotate.q ? 1 : 0) - (this.rotate.e ? 1 : 0) : 0;
    if (rot) {
      this.yawTarget += rot * 1.9 * dt;
      this.lookedAt = this.time;
      if (this.reduced) this.yaw = this.yawTarget;
    }
    const mag = Math.min(1, Math.hypot(f, r));
    // A follow camera: after a turn, the view eases back behind the walker (never while the visitor
    // is looking around, strafing or standing still, and not at all under reduced motion).
    if (!this.reduced && !this.leap && f > 0.25 && Math.abs(r) < f && this.time - this.lookedAt > 1.4) {
      this.yawTarget = lerpAngle(this.yawTarget, this.heading + Math.PI, damp(0.5, dt));
    }
    this.running = this.shift;
    const motionDt = this.leap ? Math.min(dt, LEAP_DURATION - this.leap.elapsed) : dt;
    if (this.leap) {
      this.leap.elapsed = Math.min(LEAP_DURATION, this.leap.elapsed + dt);
      this.lift = leapHeight(this.leap.elapsed);
    }
    if (mag < 0.05 && !this.leap) {
      this.speed01 += (0 - this.speed01) * damp(14, dt);
      this.carMoving = 0;
      if (this.speed01 < 0.01) this.speed01 = 0;
      this.placeAvatar();
      return;
    }
    const dir = this.leap ? { x: this.leap.x, z: this.leap.z } : cameraRelative(f, r, this.yaw);
    const speed = this.leap ? this.leap.speed : this.driving
      ? (this.running ? CAR_SPRINT_SPEED : CAR_SPEED) * mag
      : WALK_SPEED * (this.running ? RUN_MULTIPLIER : 1) * mag;
    const travel = speed * motionDt;
    const steps = Math.max(1, Math.ceil(travel / 0.35));
    const x0 = this.x;
    const z0 = this.z;
    const obstacles = this.driving || !this.car.root.visible ? this.colliders
      : [...this.colliders, { x: this.car.root.position.x, z: this.car.root.position.z, r: CAR_COLLISION_RADIUS }];
    for (let k = 0; k < steps; k++) {
      const p = resolveCollisions(this.layout, this.x + (dir.x * travel) / steps,
        this.z + (dir.z * travel) / steps, obstacles, this.world.boxes,
        this.driving ? CAR_COLLISION_RADIUS : undefined);
      this.x = p.x;
      this.z = p.z;
    }
    const moved = Math.hypot(this.x - x0, this.z - z0);
    const want = Math.atan2(dir.x, dir.z);
    this.heading = this.reduced ? want : lerpAngle(this.heading, want, damp(this.driving ? 8 : 14, dt));
    this.carMoving = this.driving && dt > 0 ? moved / dt : 0;
    const actual = dt > 0 ? moved / dt / WALK_SPEED : 0;
    this.speed01 += (Math.min(RUN_MULTIPLIER, actual) - this.speed01) * damp(16, dt);
    if (this.leap && this.leap.elapsed >= LEAP_DURATION) {
      this.leap = null;
      this.lift = 0;
    }
    this.placeAvatar();
  }

  jump(): void {
    if (this.leap || this.driving || this.keysPaused() || document.activeElement?.closest(".walk-intro")) return;
    let f = Number(this.keys.has("f") || this.pad.f) - Number(this.keys.has("b") || this.pad.b);
    let r = Number(this.keys.has("r") || this.pad.r) - Number(this.keys.has("l") || this.pad.l);
    if (this.stick.live) { f += this.stick.y; r += this.stick.x; }
    const dir = cameraRelative(f || r ? f : 1, r, this.yaw);
    this.leap = { elapsed: 0, x: dir.x, z: dir.z, speed: this.shift ? LEAP_RUN_SPEED : LEAP_SPEED };
  }

  private canPark = (point: { x: number; y: number }, radius: number): boolean => {
    const p = resolveCollisions(this.layout, point.x, point.y, this.colliders, this.world.boxes, radius);
    return Math.hypot(p.x - point.x, p.z - point.y) < 0.01;
  };

  private syncCarAction(): void {
    const next = this.driving ? "exit" : this.car.root.visible && canEnterCar(
      { x: this.x, y: this.z }, { x: this.car.root.position.x, y: this.car.root.position.z }) ? "enter" : "summon";
    if (next !== this.carAction) { this.carAction = next; this.hooks.onCar?.(next); }
  }

  useCar(): void {
    if (this.leap || this.keysPaused()) return;
    this.clearInput();
    this.hooks.onTravelMessage?.(null);
    if (this.driving) {
      const spot = findCarExit({ x: this.x, y: this.z }, this.heading, this.canPark, AVATAR_RADIUS);
      if (!spot) { this.hooks.onTravelMessage?.("Move to open ground to exit."); return; }
      this.x = spot.x; this.z = spot.y;
      this.driving = false;
      this.avatar.root.visible = true;
      this.distTarget = this.walkDistance;
    } else if (this.car.root.visible && canEnterCar({ x: this.x, y: this.z },
      { x: this.car.root.position.x, y: this.car.root.position.z })) {
      this.x = this.car.root.position.x; this.z = this.car.root.position.z;
      this.heading = this.car.root.rotation.y;
      this.driving = true;
      this.avatar.root.visible = false;
      this.walkDistance = this.distTarget;
      this.distTarget = Math.max(24, this.distTarget);
    } else {
      const spot = findCarSpawn({ x: this.x, y: this.z }, this.heading, this.canPark);
      if (!spot) { this.hooks.onTravelMessage?.("Move to open ground to summon a car."); return; }
      this.car.root.position.set(spot.x, this.groundAt(spot.x, spot.y), spot.y);
      this.car.root.rotation.y = this.heading;
      this.car.root.visible = true;
    }
    this.placeAvatar();
    this.syncCarAction();
  }

  private groundAt(x: number, z: number): number {
    return Math.max(0, this.terrain.heightAt(x, z));
  }

  private placeAvatar() {
    this.avatar.root.position.set(this.x, this.groundAt(this.x, this.z) + this.lift, this.z);
    this.avatar.root.rotation.y = this.heading;
    const shadow = this.avatar.root.getObjectByName("avatar-shadow");
    if (shadow) shadow.position.y = 0.035 - this.lift;
    if (this.driving) {
      this.car.root.position.set(this.x, this.groundAt(this.x, this.z), this.z);
      this.car.root.rotation.y = this.heading;
    }
  }

  private updateCamera(dt: number, snap: boolean) {
    const cam = this.camera;
    if (!cam) return;
    const instant = snap || this.reduced;
    this.yaw = instant ? this.yawTarget : lerpAngle(this.yaw, this.yawTarget, damp(12, dt));
    this.dist = instant ? this.distTarget : this.dist + (this.distTarget - this.dist) * damp(9, dt);
    const basePitch = clamp(pitchFor(this.dist) + this.pitchOff, 0.1, 1.32);
    const gy = this.groundAt(this.x, this.z);
    // Rise over trees, landmarks and the hub when they would hide the walker (quick up, slow down).
    const need = Math.min(0.5, clearPitch(this.x, gy + 1.2, this.z, this.yaw, basePitch, this.dist, this.world.blockers) - basePitch);
    this.pitchLift = instant ? need : this.pitchLift + (need - this.pitchLift) * damp(need > this.pitchLift ? 6 : 1.6, dt);
    const pitch = basePitch + this.pitchLift;
    const tx = this.x;
    const ty = gy + 1.35 + this.lift * 0.65;
    const tz = this.z;
    if (instant) this.camTarget.set(tx, ty, tz);
    else {
      const k = damp(11, dt);
      this.camTarget.x += (tx - this.camTarget.x) * k;
      this.camTarget.y += (ty - this.camTarget.y) * k;
      this.camTarget.z += (tz - this.camTarget.z) * k;
    }
    const h = Math.cos(pitch) * this.dist;
    let cx = this.camTarget.x + Math.sin(this.yaw) * h;
    let cz = this.camTarget.z + Math.cos(this.yaw) * h;
    let cy = this.camTarget.y + Math.sin(pitch) * this.dist;
    // Never below ground: check the camera spot and halfway back to the avatar.
    const floor = Math.max(this.terrain.heightAt(cx, cz), this.terrain.heightAt((cx + tx) / 2, (cz + tz) / 2)) + 1.1;
    if (cy < floor) cy = floor;
    // Never inside the hub: over its roofs (and just past their edges) the camera keeps above them.
    // The pitch lift above is capped, so at close zoom this is what keeps the lens out of the building.
    // The floor rises at once (so the lens never enters a wall) and eases back down, so stepping off
    // a high roof does not drop the camera in one frame.
    const roof = hubRoofAt(cx, cz);
    this.roofFloor = instant || roof >= this.roofFloor ? roof : this.roofFloor + (roof - this.roofFloor) * damp(3, dt);
    if (cy < this.roofFloor) cy = this.roofFloor;
    cx = Number.isFinite(cx) ? cx : tx;
    cz = Number.isFinite(cz) ? cz : tz + this.dist;
    cam.position.set(cx, cy, cz);
    // When the hub hides the walker (head or feet), dither a window through it along the line of sight.
    const occ = this.world.hubOccluder.value;
    if (segmentHitsHub(cx, cy, cz, tx, ty, tz) || segmentHitsHub(cx, cy, cz, tx, gy + 0.3, tz)) occ.set(tx, ty, tz, 2.6);
    else occ.w = 0;
    this.shiftForSheet(cam, dt, instant);
    cam.lookAt(this.camTarget.x, this.camTarget.y + 0.25 + lookLift(this.dist), this.camTarget.z);
    // Trees and props right beside the lens dissolve; the band scales with zoom so the walker's surroundings never do.
    const fadeEnd = clamp(this.dist * 0.45, 3.4, 9);
    this.world.nearFade.value.set(fadeEnd * 0.4, fadeEnd);
    const fog = this.scene?.fog as THREE.Fog | null;
    if (fog) {
      fog.near = 100 + this.dist * 1.8;
      fog.far = 440 + this.dist * 5;
    }
  }

  /**
   * Lift the picture by half the detail sheet's height so the avatar and the selected pin stay in view above it.
   * setViewOffset also sets the camera's aspect to fullWidth / fullHeight, so it gets the view's real size:
   * a square "full view" squeezed the whole scene sideways on a phone (and stretched it on a desktop)
   * whenever a sheet was open, and kept it so after the sheet closed.
   */
  private shiftForSheet(cam: THREE.PerspectiveCamera, dt: number, instant: boolean) {
    const sheet = parseFloat(document.documentElement.style.getPropertyValue("--sheet-h")) || 0;
    this.sheetPx = sheet;
    const want = Math.min(sheet, this.height * 0.6) * 0.5;
    this.viewShift = instant ? want : this.viewShift + (want - this.viewShift) * damp(7, dt);
    const size = `${this.width}x${this.height}`;
    if (Math.abs(this.viewShift - this.appliedShift) < 0.5 && size === this.appliedSize) return;
    this.appliedShift = this.viewShift;
    this.appliedSize = size;
    if (this.viewShift < 0.5) cam.clearViewOffset();
    else cam.setViewOffset(this.width, this.height, 0, this.viewShift, this.width, this.height);
  }

  private followSun() {
    const sun = this.world.sun;
    const d = this.world.sunDir;
    sun.position.set(this.x + d.x * 100, d.y * 100, this.z + d.z * 100);
    sun.target.position.set(this.x, 0, this.z);
    sun.target.updateMatrixWorld();
    const half = Math.round(clamp(14 + this.dist * 0.85, 22, 66));
    if (half !== this.shadowHalf) {
      this.shadowHalf = half;
      const c = sun.shadow.camera;
      c.left = c.bottom = -half;
      c.right = c.top = half;
      c.updateProjectionMatrix();
    }
  }

  /**
   * The D-pad rides up with the details sheet; on a short window that can push it into the camera
   * buttons. Then it tucks away (keyboard and touch-stick walking still work). Measured only when the
   * sheet height, the view size or the HUD changes — never as a per-frame layout read.
   */
  private tuckPad() {
    const o = this.overlay;
    if (!o?.pad || !o.camBtns) return;
    const key = `${Math.round(this.sheetPx)}|${this.width}|${this.height}|${this.padEpoch}`;
    if (key === this.padKey) return;
    this.padKey = key;
    o.pad.classList.remove("is-tucked");
    const a = o.pad.getBoundingClientRect();
    const b = o.camBtns.getBoundingClientRect();
    const top = this.viewEl?.getBoundingClientRect().top ?? 0;
    const hits = a.left < b.right + 6 && a.right > b.left - 6 && a.top < b.bottom + 8 && a.bottom > b.top - 8;
    const tucked = hits || a.top < top + 8;
    o.pad.classList.toggle("is-tucked", tucked);
    if (tucked) this.pad.f = this.pad.b = this.pad.l = this.pad.r = false;
  }

  /** Screen position of a world point; `ok` when it is in front of the camera and the label (drawn above it) would fit on screen. */
  private project(x: number, y: number, z: number, top = 36): { sx: number; sy: number; ok: boolean } {
    this.v.set(x, y, z).project(this.camera!);
    const sx = (this.v.x * 0.5 + 0.5) * this.width;
    const sy = (-this.v.y * 0.5 + 0.5) * this.height;
    const ok = this.v.z < 1 && sx > -80 && sx < this.width + 80 && sy > top && sy < this.height + 10;
    return { sx, sy, ok };
  }

  /** Cached layout size of a label button (content never changes, so measure once). */
  private sizeOf(el: HTMLElement): { w: number; h: number } | null {
    let sz = this.sizes.get(el);
    if (!sz) {
      if (el.hidden) return null;
      sz = { w: el.offsetWidth, h: el.offsetHeight };
      if (!sz.w) return null;
      this.sizes.set(el, sz);
    }
    return sz;
  }

  /**
   * A label's place, slid out from under the HUD: as it is when it covers no HUD control, otherwise
   * the nearest place beside or below the control it covers that is in view and clear of every
   * control (null when there is none).
   */
  private clearOfHud(x: number, y: number, w: number, h: number, pad = 6): { x: number; y: number } | null {
    const hud = this.hud;
    const hits = (cx: number, cy: number) => {
      for (let k = 0; k < hud.length; k += 4) {
        if (cx < hud[k] + hud[k + 2] + pad && cx + w + pad > hud[k] && cy < hud[k + 1] + hud[k + 3] + pad && cy + h + pad > hud[k + 1]) return k;
      }
      return -1;
    };
    const k = hits(x, y);
    if (k < 0) return { x, y };
    const inView = (cx: number, cy: number) => cx >= 4 && cy >= 4 && cx + w <= this.width - 4 && cy + h <= this.height - 4;
    const tries = [
      { x: hud[k] - pad - w, y },
      { x: hud[k] + hud[k + 2] + pad, y },
      { x, y: hud[k + 1] + hud[k + 3] + pad },
      { x, y: hud[k + 1] - pad - h },
    ].sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    for (const t of tries) if (inView(t.x, t.y) && hits(t.x, t.y) < 0) return t;
    return null;
  }

  /** Greedy declutter: claim a screen rect unless it overlaps one already claimed. */
  private claim(x: number, y: number, w: number, h: number, pad = 4): boolean {
    const r = this.rects;
    for (let k = 0; k < r.length; k += 4) {
      if (x < r[k] + r[k + 2] + pad && x + w + pad > r[k] && y < r[k + 1] + r[k + 3] + pad && y + h + pad > r[k + 1]) return false;
    }
    r.push(x, y, w, h);
    return true;
  }

  private updateLabels() {
    const o = this.overlay;
    if (!o || !this.camera) return;
    const focused = document.activeElement;
    this.rects.length = 0;
    for (const v of this.reserved) this.rects.push(v);
    for (const v of this.hud) this.rects.push(v);
    this.reservePortalLabelSpace();

    // Companies and people first (nearest first): name buttons for the closest pins.
    const pins = this.pins;
    this.labelOrder.length = 0;
    let nearest = -1;
    let nearestD = MEET_RANGE;
    for (let i = 0; i < pins.slugs.length; i++) {
      const d = Math.hypot(pins.xs[i] - this.x, pins.zs[i] - this.z);
      if (d < LABEL_RANGE) this.labelOrder.push({ i, d });
      if (d < nearestD) {
        nearestD = d;
        nearest = i;
      }
    }
    this.labelOrder.sort((a, b) => a.d - b.d);
    const want = this.wantLabels;
    want.clear();
    for (let k = 0; k < this.labelOrder.length; k++) {
      const i = this.labelOrder[k].i;
      const el = o.pinButtons.get(pins.slugs[i]);
      // The nearest LABEL_MAX names, plus a focused one wherever it ranks.
      if (!el || (want.size >= LABEL_MAX && el !== focused)) continue;
      // No name over a pin still waiting in the air to drop in: a label never shows without its logo.
      if (!pins.isShown(i) && el !== focused) continue;
      pins.labelAnchor(i, this.v);
      const p = this.project(this.v.x, this.v.y, this.v.z);
      if (!p.ok) continue;
      const sz = this.sizeOf(el);
      if (sz && !this.claim(p.sx - sz.w / 2, p.sy - sz.h, sz.w, sz.h) && el !== focused && i !== nearest) continue;
      want.add(pins.slugs[i]);
      el.style.transform = `translate3d(${p.sx.toFixed(1)}px, ${p.sy.toFixed(1)}px, 0) translate(-50%, -100%)`;
      // A dimmed pin's name dims with its logo (never clearer than the logo it names).
      const op = pins.opacityOf(i);
      el.style.opacity = op < 0.98 ? op.toFixed(2) : "";
      el.classList.toggle("is-near", i === nearest);
    }
    for (const [slug, el] of o.pinButtons) {
      if (el === focused && !want.has(slug)) this.releaseFocus(el);
      this.toggle(el, want.has(slug), this.shownLabels, slug);
    }

    // Districts: one label per landmark, readable from afar, nearest first, never piled up.
    // Labels are not depth tested, so the hub's rooftop sign decides: a label nearer than the sign may
    // sit over it unless it would hide a good part of it; a label behind the sign or its pole moves up
    // over the sign (or, with no room above, just under it, beside the pole) instead of covering it.
    const cam = this.camera.position;
    const beacon = this.world.beacon;
    const beaconD = Math.hypot(beacon.x - cam.x, beacon.z - cam.z);
    const beaconSeen = this.projectBeacon();
    let behind = false;
    const order = this.discOrder;
    order.length = 0;
    for (const disc of this.layout.discs) order.push({ disc, d: Math.hypot(disc.x - cam.x, disc.z - cam.z) });
    order.sort((a, b) => a.d - b.d);
    for (const { disc, d } of order) {
      if (beaconSeen && !behind && d > beaconD) {
        behind = true;
        const b = this.beaconRect;
        this.rects.push(b[0], b[1], b[2], b[3]);
      }
      const el = o.districtButtons.get(disc.slug);
      if (!el) continue;
      const p = this.project(disc.x, DISTRICT_LABEL_Y, disc.z, 52);
      let show = p.ok && d < DISTRICT_LABEL_RANGE;
      if (!show && el === focused) this.releaseFocus(el);
      let sx = p.sx;
      let sy = p.sy;
      if (show) {
        const s = clamp(1.12 - d / 330, 0.62, 1);
        const sz = this.sizeOf(el);
        if (sz && el !== focused) {
          const lw = sz.w * s;
          const lh = sz.h * s;
          // Out from under the HUD's controls first: beside them, or below.
          const clear = this.clearOfHud(p.sx - lw / 2, sy - lh, lw, lh);
          if (clear) {
            sx = clear.x + lw / 2;
            sy = clear.y + lh;
          }
          const lx = sx - lw / 2;
          if (!clear) show = false;
          else if (beaconSeen && !behind) {
            if (this.beaconCover(lx, sy - lh, lw, lh) > 0.3 || !this.claim(lx, sy - lh, lw, lh, 6)) show = false;
          } else if (beaconSeen && this.hitsBeacon(lx, sy - lh, lw, lh)) {
            const b = this.beaconRect;
            const above = b[1] - 6;
            const below = b[1] + b[3] + 6 + lh;
            if (above - lh >= 4 && this.claim(lx, above - lh, lw, lh, 6)) sy = above;
            else if (below <= this.height - 4) {
              // Just under the sign, slid sideways off the pole, so the pole still reads as the sign's mast.
              const q = this.poleRect;
              const slid = clamp(p.sx < q[0] + q[2] / 2 ? Math.min(lx, q[0] - 6 - lw) : Math.max(lx, q[0] + q[2] + 6), 4, this.width - 4 - lw);
              if (this.claim(slid, below - lh, lw, lh, 6)) {
                sx = slid + lw / 2;
                sy = below;
              } else show = false;
            } else show = false;
          } else if (!this.claim(lx, sy - lh, lw, lh, 6)) show = false;
        }
        if (show) {
          el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%) scale(${s.toFixed(3)})`;
          el.style.zIndex = String(1000 - Math.round(d));
        }
      }
      this.toggle(el, show, this.shownDistricts, disc.slug);
    }

    const near = nearest >= 0 ? pins.slugs[nearest] : null;
    if (near !== this.near) {
      this.near = near;
      this.hooks.onNear(near);
    }
  }

  /** Keep projected names out of the portal's opening while it is nearby. */
  private reservePortalLabelSpace(): void {
    if (Math.hypot(this.x - PORTAL.x, this.z - PORTAL.z) > 35) return;
    const acrossX = Math.cos(PORTAL.facing) * (PORTAL.r + 0.3);
    const acrossZ = -Math.sin(PORTAL.facing) * (PORTAL.r + 0.3);
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const side of [-1, 1]) {
      for (const y of [0, PORTAL.r * 2 + 1.3]) {
        this.v.set(PORTAL.x + side * acrossX, y, PORTAL.z + side * acrossZ).project(this.camera!);
        if (this.v.z < -1 || this.v.z > 1) return;
        const x = (this.v.x * 0.5 + 0.5) * this.width;
        const sy = (-this.v.y * 0.5 + 0.5) * this.height;
        left = Math.min(left, x);right = Math.max(right, x);
        top = Math.min(top, sy);bottom = Math.max(bottom, sy);
      }
    }
    if (right < 0 || left > this.width || bottom < 0 || top > this.height) return;
    this.rects.push(left, top, right - left, bottom - top);
  }

  /** Does a screen rect touch the rooftop sign or its pole (with a little room around them)? */
  private hitsBeacon(x: number, y: number, w: number, h: number): boolean {
    return touches(this.beaconRect, x, y, w, h, 4) || touches(this.poleRect, x, y, w, h, 4);
  }

  /** Share of the rooftop sign's screen rect that a rect would cover (0..1). */
  private beaconCover(x: number, y: number, w: number, h: number): number {
    const b = this.beaconRect;
    if (b[2] <= 0 || b[3] <= 0) return 0;
    const ox = Math.min(x + w, b[0] + b[2]) - Math.max(x, b[0]);
    const oy = Math.min(y + h, b[1] + b[3]) - Math.max(y, b[1]);
    return ox > 0 && oy > 0 ? (ox * oy) / (b[2] * b[3]) : 0;
  }

  /** Project the rooftop sign (it faces the camera) to a screen rect in beaconRect, and its pole to poleRect; false when the sign is not in view. */
  private projectBeacon(): boolean {
    const b = this.world.beacon;
    const r = this.beaconRect;
    const cx = Math.cos(this.yaw) * (b.w / 2 + 0.3);
    const cz = -Math.sin(this.yaw) * (b.w / 2 + 0.3);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let s = -1; s <= 1; s += 2) {
      for (let k = 0; k < 2; k++) {
        const y = k ? b.y1 + 0.3 : b.y0 - 0.2;
        this.v.set(b.x + cx * s, y, b.z + cz * s).project(this.camera!);
        if (this.v.z > 1) {
          r[2] = -1;
          return false;
        }
        const sx = (this.v.x * 0.5 + 0.5) * this.width;
        const sy = (-this.v.y * 0.5 + 0.5) * this.height;
        x0 = Math.min(x0, sx);
        x1 = Math.max(x1, sx);
        y0 = Math.min(y0, sy);
        y1 = Math.max(y1, sy);
      }
    }
    if (x1 < 0 || x0 > this.width || y1 < 0 || y0 > this.height) {
      r[2] = -1;
      return false;
    }
    r[0] = x0;
    r[1] = y0;
    r[2] = x1 - x0;
    r[3] = y1 - y0;
    // The pole: a narrow strip under the sign's middle, down to its foot on the roof (clipped to the view).
    const q = this.poleRect;
    this.v.set(b.x, b.foot, b.z).project(this.camera!);
    const footY = this.v.z > 1 ? this.height : Math.min(this.height, (-this.v.y * 0.5 + 0.5) * this.height);
    const half = Math.max(6, (r[2] * 1.4) / b.w / 2);
    q[0] = (x0 + x1) / 2 - half;
    q[1] = y1;
    q[2] = half * 2;
    q[3] = Math.max(0, footY - y1);
    return true;
  }

  /**
   * A focused label that went behind the camera, off screen or out of range has nowhere true to be
   * drawn (a behind-camera projection lands mirrored on screen). It hides, and keyboard focus goes
   * back to the world rather than to the page body.
   */
  private releaseFocus(el: HTMLElement) {
    if (this.viewEl?.isConnected) this.viewEl.focus({ preventScroll: true });
    else el.blur();
  }

  private toggle(el: HTMLElement, show: boolean, set: Set<string>, key: string) {
    if (show && !set.has(key)) {
      set.add(key);
      el.hidden = false;
    } else if (!show && set.has(key)) {
      set.delete(key);
      el.hidden = true;
    }
  }

  /** Which district the walker stands in; tells the HUD when it changes. */
  private trackPlace() {
    const d = districtAt(this.layout, this.x, this.z);
    const slug = d ? d.slug : null;
    if (slug === this.district) return;
    this.district = slug;
    this.hooks.onDistrict(slug);
  }

  private drawMinimap() {
    if (!this.minimap) return;
    this.explorers.dots(this.dots);
    this.minimap.draw({ x: this.x, z: this.z, heading: this.heading }, this.yaw, this.dots, this.palette.css.ink);
  }

}
