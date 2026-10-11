/* The walkable company world, with live explorers.

   An island: the publisher's hub on a central plaza with the Nexus portal
   beside it, roads out to one neighborhood per district, and a drop pin with
   a logo badge for every company. Walk with WASD/arrows, a touch thumbstick or
   the D-pad; other visitors walking the world right now appear as their own
   avatars. Walking through the portal opens the Nexus, the Portfolio Map
   Network's shared world (src/network.ts).

   Districts group companies. They are not locations. The people roster (when
   the site has one) has one more area on the ring, with a headshot pin for
   each person; it is not a district and links them to no company or industry.

   The scene is imperative (engine.ts, built once per mount, driven from
   useFrame). React renders only the HUD and the projected label buttons;
   the engine positions those buttons itself every frame. The canvas draws
   without tone mapping (the toon light sets the colors), at a pixel ratio
   held to a budget and lowered while the device cannot keep up
   (src/three/adaptiveDpr.ts). */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ChevronUp, Car, CircleHelp, LocateFixed, Map as MapIcon, Minus, Orbit, Plus, Shuffle, Sparkles, UserRound, Users, Volume2, VolumeX, X } from "lucide-react";
import { Component, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from "react";
import type { PerspectiveCamera } from "three";
import { COMPANIES, PEOPLE, SITE, companyBySlug, districtBySlug, personBySlug } from "../../data/catalog";
import { ARRIVED_FROM_NEXUS, NETWORK_NAME, NEXUS_HREF, PORTAL_HREF } from "../../network";
import { L, WALK } from "../../site";
import type { AreaSlug } from "../../data/layout";
import type { DistrictSlug } from "../../data/types";
import { getVisitor, onVisitorChange, rerollVisitor, type AvatarSpec, type Visitor } from "../../live/identity";
import { startLive, type LiveSession, type LiveState } from "../../live/presence";
import { registerScene } from "../../debug/registry";
import { finderActive, usePersonHighlight, useHighlight, useStore } from "../../state/store";
import { PersonThumb, DistrictIcon } from "../../components/bits";
import SearchChip from "../../components/SearchChip";
import { AdaptiveDpr, budgetDpr } from "../../three/adaptiveDpr";
import { watchContext } from "../../three/contextWatch";
import { areaBySlug, countLabel, isPeopleArea, walkAreas } from "./areas";
import type { FindProgress } from "./finds";
import { WalkEngine, isTextField, type Overlay, type PortalState } from "./engine";
import { arrivalFly } from "./nav";
import { prefersReducedMotion } from "./util";
import "./walk.css";

const INTRO_KEY = "portfolio-map-walk-intro";
const SHOW_OTHERS_KEY = "portfolio-map-walk-show-others";
const SOUND_KEY = "portfolio-map-walk-sound";
/** How long the portal's departure shows before the Nexus opens (time to cancel). */
const PORTAL_DELAY_MS = 1600;
/** The HUD's controls and cards that projected labels keep clear of (src/views/walk/engine.ts setHud). */
const HUD_ITEMS =
  ".walk-hud-tl .walk-pill, .walk-hud-tl .walk-icon-btn, .walk-intro, .walk-pop, .walk-focus-chip, .walk-minimap, .walk-cam-btns, .walk-travel-controls .walk-pill, .walk-pad, .walk-prompt, .walk-toast";
/** The pixel ratio's ceiling and the drawing buffer's pixel budget (src/three/adaptiveDpr.ts budgetDpr). */
const DPR_CAP = 2;
const PIXEL_BUDGET = 4_200_000;

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    if (!gl) return false;
    // Release the probe's context now rather than at garbage collection: browsers cap how many
    // WebGL contexts a page may hold, and every walk visit runs this check.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function readFlag(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the choice lasts for this visit */
  }
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      return;
    }
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Fresh WebGL contexts to try, per visit to the walk, when the browser never restores a lost one. */
const MAX_FRESH_CONTEXTS = 2;

export default function WalkView() {
  const [webgl] = useState(hasWebGL);
  // Bumped when the WebGL context was lost and never restored: the world starts over with a new
  // context, since a lost context draws nothing but the DOM name labels.
  const [generation, setGeneration] = useState(0);
  const freshContext = useCallback(() => {
    console.warn("Walk: the WebGL context was lost and not restored; starting over with a new one.");
    setGeneration((g) => g + 1);
  }, []);
  if (!webgl || generation > MAX_FRESH_CONTEXTS) return <WalkFallback />;
  return (
    <WalkBoundary>
      <WalkWorld key={generation} onContextGiveUp={freshContext} />
    </WalkBoundary>
  );
}

/** A world that fails to start (no WebGL context, say) shows the fallback instead of taking the page down. */
class WalkBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error("Walkable world failed to start:", err);
  }
  render() {
    return this.state.failed ? <WalkFallback /> : this.props.children;
  }
}

function WalkFallback() {
  const setView = useStore((s) => s.setView);
  return (
    <div className="view walk-view walk-fallback">
      <div className="walk-card walk-fallback-card">
        <h2>The walkable world needs WebGL</h2>
        <p>This browser or device can't draw the 3D world. Every company and every person is in the list view, with the same details.</p>
        <button type="button" className="btn btn-primary" onClick={() => setView("list")}>
          Open the company list
        </button>
      </div>
    </div>
  );
}

/* ---------------- the scene bridge (inside <Canvas>) ---------------- */

function SceneBridge({
  engine,
  viewRef,
  onContextGiveUp,
  onDpr,
}: {
  engine: WalkEngine;
  viewRef: RefObject<HTMLDivElement | null>;
  onContextGiveUp: () => void;
  /** The pixel ratio to draw at changed (the Canvas's dpr prop holds it: R3F re-applies that prop on every render). */
  onDpr: (dpr: number) => void;
}) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  // The pixel ratio: the device's within the budget, times what the adaptive controller allows.
  const adaptive = useRef<AdaptiveDpr | null>(null);
  adaptive.current ??= new AdaptiveDpr();
  const base = useRef(1);
  useEffect(() => {
    base.current = budgetDpr(window.devicePixelRatio, size.width, size.height, DPR_CAP, PIXEL_BUDGET);
    onDpr(base.current * adaptive.current!.value);
  }, [size.width, size.height, onDpr]);
  // A lost WebGL context that the browser never restores: start over with a fresh one. (A restore
  // needs nothing here: this canvas draws every frame, and three.js re-uploads what it needs.)
  useEffect(() => watchContext(gl.domElement, { restored: () => {}, giveUp: onContextGiveUp }), [gl, onContextGiveUp]);
  useEffect(() => {
    engine.attach(scene, camera as PerspectiveCamera);
    // Compile every program now, so walking into a new area or summoning the car never stalls a
    // frame on a shader compile.
    const carShown = engine.car.root.visible;
    engine.car.root.visible = true;
    gl.compile(scene, camera);
    engine.car.root.visible = carShown;
    const view = viewRef.current;
    const detach = view ? engine.attachInput(gl.domElement, view) : () => {};
    // Development only: the renderer, for QA scripts that read renderer.info. Stripped from production builds.
    if (import.meta.env.DEV) (window as unknown as { __walkGl?: unknown }).__walkGl = gl;
    return () => {
      if (import.meta.env.DEV) delete (window as unknown as { __walkGl?: unknown }).__walkGl;
      detach();
    };
  }, [engine, scene, camera, gl, viewRef]);
  // ?debug: show the live scene to the diagnostic probe (does nothing otherwise).
  useEffect(
    () => registerScene({ view: "walk", renderer: gl, scene, camera: camera as PerspectiveCamera, badges: engine.pins.badges, controller: engine }),
    [engine, scene, camera, gl],
  );
  useFrame((_, dt) => {
    engine.frame(dt);
    // A step at most every few seconds, so this state update is never per frame.
    const k = adaptive.current!.sample(dt);
    if (k !== null) onDpr(base.current * k);
  });
  return null;
}

/* ---------------- live HUD state ---------------- */

interface LiveSummary {
  transport: LiveState["transport"];
  status: LiveState["status"];
  reason: string | null;
  others: { id: string; name: string; avatar: AvatarSpec }[];
}

const summarize = (s: LiveState): LiveSummary => ({
  transport: s.transport,
  status: s.status,
  reason: s.reason,
  others: s.others.map((o) => ({ id: o.id, name: o.name, avatar: o.avatar })),
});

const HAT_LABEL: Record<AvatarSpec["hat"], string> = { cap: "Cap", straw: "Straw hat", beanie: "Beanie", bucket: "Bucket hat", visor: "Visor", none: "No hat" };
const GEAR_LABEL: Record<AvatarSpec["gear"], string> = { backpack: "backpack", satchel: "satchel", scarf: "scarf", none: "" };
const outfit = (a: AvatarSpec) => [HAT_LABEL[a.hat], GEAR_LABEL[a.gear]].filter(Boolean).join(" · ");

/** Join the live explorers: one session per mount, wired to the engine and the HUD. Returns the teardown. */
function runLive(engine: WalkEngine, sessionRef: RefObject<LiveSession | null>, setLive: (s: LiveSummary) => void, setMe: (v: Visitor) => void): () => void {
  const session = startLive(getVisitor());
  sessionRef.current = session;
  engine.setSession(session);
  const unsub = session.subscribe((s) => {
    engine.syncLive(s);
    setLive(summarize(s));
  });
  // Poses go out from the frame loop. The session stays quiet while this explorer stands still or
  // the tab is hidden, and re-announces it when the tab is shown again.
  // "New look": rebuild this explorer and tell everyone else.
  const offVisitor = onVisitorChange((v) => {
    engine.setAvatar(v.avatar);
    session.updateVisitor(v);
    setMe(v);
  });
  return () => {
    unsub();
    offVisitor();
    engine.setSession(null);
    session.close();
    sessionRef.current = null;
  };
}

/**
 * Pins to emphasize in the walk world: the companies useHighlight() picks, plus the people whose
 * name or specialty matches the search. The provider finder and a district focus emphasize
 * companies only, so every person fades back then. null: show everything normally.
 */
function useWalkHighlight(): Set<string> | null {
  const companies = useHighlight();
  const people = usePersonHighlight();
  const panel = useStore((s) => s.panel);
  const finder = useStore((s) => s.finder);
  return useMemo(() => {
    if (!companies) return null;
    if ((panel === "finder" && finderActive(finder)) || !people) return companies;
    return new Set([...companies, ...people]);
  }, [companies, people, panel, finder]);
}

/** A district's icon, or the people area's (the same person glyph as the person sheet's chip). */
function AreaIcon({ slug, size }: { slug: AreaSlug; size: number }) {
  return isPeopleArea(slug) ? <UserRound size={size} aria-hidden="true" strokeWidth={2.2} /> : <DistrictIcon slug={slug as DistrictSlug} size={size} />;
}

/* ---------------- the world ---------------- */

function WalkWorld({ onContextGiveUp }: { onContextGiveUp: () => void }) {
  const reduced = useReducedMotion();
  const viewRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<WalkEngine | null>(null);
  const [dpr, setDpr] = useState(() => budgetDpr(window.devicePixelRatio, window.innerWidth, window.innerHeight, DPR_CAP, PIXEL_BUDGET));
  const [carAction, setCarAction] = useState<"summon" | "enter" | "exit">("summon");
  const [travelMessage, setTravelMessage] = useState<string | null>(null);
  const [near, setNear] = useState<string | null>(null);
  const [portal, setPortal] = useState<PortalState>("far");
  const [leaving, setLeaving] = useState(false);
  const [banner, setBanner] = useState<{ slug: AreaSlug; key: number } | null>(null);
  const [nudge, setNudge] = useState(0);
  const [intro, setIntro] = useState(() => readFlag(INTRO_KEY) !== "1");
  const [me, setMe] = useState<Visitor>(getVisitor);
  const [live, setLive] = useState<LiveSummary>({ transport: "off", status: "connecting", reason: null, others: [] });
  const [showOthers, setShowOthers] = useState(() => readFlag(SHOW_OTHERS_KEY) !== "0");
  const [narrow, setNarrow] = useState(() => {
    try {
      return window.matchMedia("(max-width: 760px)").matches;
    } catch {
      return false;
    }
  });
  const [mapOpen, setMapOpen] = useState(!narrow);
  const [sound, setSound] = useState(() => WALK.sound && readFlag(SOUND_KEY) === "1");
  const [keeps, setKeeps] = useState<FindProgress>({ total: 0, found: [], hidden: [] });
  const [keepsOpen, setKeepsOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const keepsId = useId();
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const resize = () => {
      setNarrow(mq.matches);
      setMapOpen(!mq.matches);
    };
    mq.addEventListener("change", resize);
    return () => mq.removeEventListener("change", resize);
  }, []);
  const mapVisible = mapOpen && !intro;
  const MINIMAP_SIZE = narrow ? 140 : 180;
  const sessionRef = useRef<LiveSession | null>(null);

  const selected = useStore((s) => s.selected);
  const person = useStore((s) => s.person);
  const focusDistrict = useStore((s) => s.focusDistrict);
  const query = useStore((s) => s.query);
  const highlight = useWalkHighlight();

  // Build the engine once per mount (a tick late, so StrictMode's throwaway mount builds nothing).
  useEffect(() => {
    let bannerKey = 0;
    let toastKey = 0;
    let e: WalkEngine | null = null;
    const timer = window.setTimeout(() => {
      e = new WalkEngine(
        {
          onNear: (slug) => setNear(slug),
          onCar: setCarAction,
          onTravelMessage: setTravelMessage,
          onDistrict: (slug) => {
            if (slug) setBanner({ slug, key: ++bannerKey });
          },
          onPausedNudge: () => setNudge((n) => n + 1),
          onPortal: (state) => {
            setPortal(state);
            // Stepping into the ring starts the way through; walking away from the portal cancels it.
            if (state === "inside") setLeaving(true);
            else if (state === "far") setLeaving(false);
          },
          onPortalEnter: () => setLeaving(true),
          onFind: (kind, progress) => {
            setKeeps(progress);
            const all = progress.found.length >= progress.total;
            setToast({
              text: all ? `You found all ${progress.total} keepsakes. Thank you for wandering.` : `You found ${kind.name}. (${progress.found.length}/${progress.total})`,
              key: ++toastKey,
            });
          },
        },
        getVisitor().avatar,
        prefersReducedMotion(),
        getVisitor().id,
      );
      setKeeps(e.world.finds.progress());
      setEngine(e);
      // Development only: a handle for QA scripts. Stripped from production builds.
      if (import.meta.env.DEV) (window as unknown as { __walk?: WalkEngine }).__walk = e;
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (import.meta.env.DEV) delete (window as unknown as { __walk?: WalkEngine }).__walk;
      e?.dispose();
      setEngine(null);
    };
  }, []);

  useEffect(() => engine?.setReduced(reduced), [engine, reduced]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  // Sound is off until the visitor asks for it. A remembered "on" starts again at the first click or key press (a browser's rule).
  useEffect(() => {
    if (!engine || !sound) return;
    const resume = () => engine.setSound(true);
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
  }, [engine, sound]);
  useEffect(() => engine?.setHighlight(highlight), [engine, highlight]);
  // The store holds at most one of a company and a person; either one's pin gets the selection ring.
  useEffect(() => engine?.setSelected(selected ?? person), [engine, selected, person]);

  // Fly requests: act on whatever is pending at mount, then on every new nonce.
  useEffect(() => {
    if (!engine) return;
    const s = useStore.getState();
    // The open company or person wins over an older district or Overview fly (see arrivalFly).
    engine.fly(arrivalFly(s.selected, s.fly, s.person));
    return useStore.subscribe((st, prev) => {
      if (st.fly && st.fly !== prev.fly) engine.fly(st.fly);
    });
  }, [engine]);

  // Live explorers. Started a tick late so a mount that is immediately undone (React StrictMode,
  // a quick view switch) never opens a session whose goodbye could race the next one's hello.
  useEffect(() => {
    if (!engine) return;
    let stop = () => {};
    const timer = window.setTimeout(() => {
      stop = runLive(engine, sessionRef, setLive, setMe);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, [engine]);

  useEffect(() => {
    engine?.explorers.setShown(showOthers);
    writeFlag(SHOW_OTHERS_KEY, showOthers ? "1" : "0");
  }, [engine, showOthers]);

  // Size of the stage, for projecting labels.
  useLayoutEffect(() => {
    const el = viewRef.current;
    if (!el || !engine) return;
    const set = () => engine.setSize(el.clientWidth, el.clientHeight);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [engine]);

  // Projected label buttons: the engine positions and shows/hides them.
  const districtButtons = useRef(new Map<string, HTMLButtonElement>());
  const pinButtons = useRef(new Map<string, HTMLButtonElement>());
  const tagLayerRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const padRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!engine || !tagLayerRef.current || !fadeRef.current || !stickRef.current || !knobRef.current) return;
    const overlay: Overlay = {
      districtButtons: districtButtons.current,
      pinButtons: pinButtons.current,
      tagLayer: tagLayerRef.current,
      fade: fadeRef.current,
      stick: stickRef.current,
      stickKnob: knobRef.current,
      pad: padRef.current,
      camBtns: camRef.current,
    };
    engine.setOverlay(overlay);
    // The HUD's controls, measured whenever its layout changes (a card opens, the map folds, the
    // window resizes), never per frame: names stay off them and area labels slide out from under them.
    const view = viewRef.current;
    let measured = 0;
    const measure = () => {
      measured = 0;
      if (!view) return;
      const v = view.getBoundingClientRect();
      const rects = [...view.querySelectorAll<HTMLElement>(HUD_ITEMS)]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ x: r.left - v.left, y: r.top - v.top, w: r.width, h: r.height }));
      engine.setHud(rects);
    };
    const soon = () => {
      if (!measured) measured = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(soon);
    // Only the HUD's own containers are watched (the labels the engine moves every frame are not in them).
    const watch = () => {
      changes.disconnect();
      if (!view) return;
      resize.observe(view);
      changes.observe(view, { childList: true });
      for (const el of view.querySelectorAll<HTMLElement>(".walk-hud")) {
        resize.observe(el);
        changes.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden", "open"] });
      }
    };
    const changes = new MutationObserver(() => {
      watch();
      soon();
    });
    watch();
    soon();
    // Paint each district's (and the People area's) icon onto its landmark medallion, from the same lucide glyph as its label.
    const serializer = new XMLSerializer();
    for (const a of walkAreas()) {
      const svg = districtButtons.current.get(a.slug)?.querySelector("svg");
      if (!svg) continue;
      const clone = svg.cloneNode(true) as SVGElement;
      clone.setAttribute("width", "96");
      clone.setAttribute("height", "96");
      clone.setAttribute("stroke", a.color);
      engine.setDistrictIcon(a.slug, serializer.serializeToString(clone));
    }
    return () => {
      resize.disconnect();
      changes.disconnect();
      if (measured) cancelAnimationFrame(measured);
      engine.setOverlay(null);
    };
  }, [engine]);

  const minimapRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!engine) return;
    engine.setMinimap(mapVisible ? minimapRef.current : null, MINIMAP_SIZE);
    engine.hudChanged();
    return () => engine.setMinimap(null, MINIMAP_SIZE);
  }, [engine, mapVisible, MINIMAP_SIZE]);

  const select = useStore((s) => s.select);
  const selectPerson = useStore((s) => s.selectPerson);
  const focusOn = useStore((s) => s.focusOn);
  // A district label or map entry focuses that district (the store flies there). The People area is
  // not a district: the walker goes straight there, and no district stays highlighted (people would fade).
  const goToArea = useCallback(
    (slug: AreaSlug) => {
      if (!isPeopleArea(slug)) return focusOn(slug as DistrictSlug);
      if (useStore.getState().focusDistrict) focusOn(null, { fly: false });
      engine?.goTo(slug);
    },
    [engine, focusOn],
  );
  const dismissIntro = useCallback(() => {
    setIntro(false);
    writeFlag(INTRO_KEY, "1");
    viewRef.current?.focus({ preventScroll: true });
  }, []);
  // Stable, so the banner's timer is not restarted by every re-render (passing pins, live updates).
  const clearBanner = useCallback(() => setBanner(null), []);

  // Arriving puts keyboard focus in the world (walk keys, Enter to meet) instead of leaving it on the
  // view switch that was clicked, unless the visitor is typing or reading the details sheet or a panel.
  useEffect(() => {
    const ae = document.activeElement;
    if (isTextField(ae) || ae?.closest(".sheet, .panel, .walk-intro")) return;
    viewRef.current?.focus({ preventScroll: true });
  }, []);
  // Chrome leaves focus on a clicked button, where Enter would press it again instead of meeting the
  // company in front of you. A click or tap on a HUD control hands focus back to the world; keyboard
  // activation (detail 0) keeps it on the control.
  const backToWorld = useCallback((e: ReactMouseEvent) => {
    if (e.detail > 0) viewRef.current?.focus({ preventScroll: true });
  }, []);

  const toggleSound = useCallback(
    (e: ReactMouseEvent) => {
      const next = !sound;
      setSound(next);
      writeFlag(SOUND_KEY, next ? "1" : "0");
      engine?.setSound(next);
      backToWorld(e);
    },
    [sound, engine, backToWorld],
  );

  const areas = walkAreas();
  const nearCompany = near ? companyBySlug.get(near) ?? null : null;
  const nearPerson = near ? personBySlug.get(near) ?? null : null;
  const layout = engine?.layout;

  return (
    <div className="view walk-view" ref={viewRef} tabIndex={-1} role="region" aria-label={`Walkable ${L.company} world`}>
      {engine && (
        <Canvas
          className="walk-canvas"
          shadows="soft"
          flat
          dpr={dpr}
          camera={{ fov: 50, near: 0.3, far: 2600, position: [0, 20, 40] }}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          aria-hidden="true"
        >
          <SceneBridge engine={engine} viewRef={viewRef} onContextGiveUp={onContextGiveUp} onDpr={setDpr} />
        </Canvas>
      )}

      {/* Top left: intro, live explorers, focus chip. */}
      <div className="walk-hud walk-hud-tl">
        {intro && <IntroCard onClose={dismissIntro} />}
        <div className="walk-row">
          <LivePill live={live} me={me} sessionRef={sessionRef} showOthers={showOthers} setShowOthers={setShowOthers} />
          {!intro && ARRIVED_FROM_NEXUS && <NexusReturnLink />}
          {!intro && (
            <button type="button" className="walk-icon-btn" onClick={() => setIntro(true)} aria-label="How to explore" title="How to explore">
              <CircleHelp size={18} aria-hidden="true" />
            </button>
          )}
          {!intro && WALK.sound && (
            <button type="button" className="walk-icon-btn" aria-pressed={sound} onClick={toggleSound} aria-label={sound ? "Turn the sound off" : "Turn the sound on"} title={sound ? "Sound on" : "Sound off"}>
              {sound ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
            </button>
          )}
          {!intro && keeps.total > 0 && (
            <button
              type="button"
              className="walk-pill walk-keepsakes"
              aria-expanded={keepsOpen}
              aria-controls={keepsOpen ? keepsId : undefined}
              onClick={(e) => {
                setKeepsOpen((o) => !o);
                backToWorld(e);
              }}
              title="Keepsakes found"
            >
              <Sparkles size={16} aria-hidden="true" />
              <span>
                {keeps.found.length}/{keeps.total}
              </span>
              <span className="sr-only">keepsakes found</span>
            </button>
          )}
        </div>
        {keepsOpen && !intro && keeps.total > 0 && (
          <section className="walk-card walk-pop walk-keeps-pop" id={keepsId} aria-label="Keepsakes">
            <h3 className="walk-pop-h">Keepsakes hidden around the island</h3>
            <ul className="walk-keeps-list">
              {keeps.hidden.map((k) => {
                const got = keeps.found.includes(k.id);
                return (
                  <li key={k.id} className={got ? "is-found" : undefined}>
                    <span className="walk-keeps-mark" aria-hidden="true">{got ? "\u2713" : "?"}</span>
                    <span>{got ? <>You found <strong>{k.name}</strong>.</> : k.hint}</span>
                  </li>
                );
              })}
            </ul>
            <p className="walk-pop-note">Wander out to the coast and the hills. What you find is kept in this browser only.</p>
          </section>
        )}
        {/* A search outranks the district in the highlight, so its chip replaces the district's. */}
        <SearchChip />
        {focusDistrict && !query.trim() && (
          <div className="walk-focus-chip">
            <span className="walk-dot" style={{ background: districtBySlug.get(focusDistrict)?.color }} aria-hidden="true" />
            <span>
              Highlighting <strong>{districtBySlug.get(focusDistrict)?.short}</strong>
            </span>
            <button type="button" className="walk-chip-x" onClick={() => focusOn(null, { fly: false })} aria-label={`Clear the ${L.district} highlight`}>
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* Projected labels (positioned by the engine each frame). */}
      <div className="walk-labels">
        {areas.map((a) => {
          const people = isPeopleArea(a.slug);
          return (
            <button
              key={a.slug}
              type="button"
              hidden
              className={`walk-district-label${people ? " is-people" : ""}`}
              style={people ? undefined : { ["--d" as string]: a.color }}
              ref={(el) => {
                if (el) districtButtons.current.set(a.slug, el);
                else districtButtons.current.delete(a.slug);
              }}
              onClick={(e) => {
                goToArea(a.slug);
                backToWorld(e);
              }}
              aria-label={`${a.label}, ${countLabel(a)}. Go to this ${people ? "area" : L.district}`}
            >
              <span className="walk-district-icon" aria-hidden="true">
                <AreaIcon slug={a.slug} size={17} />
              </span>
              <span className="walk-district-text">
                <strong>{a.label}</strong>
                <span>{countLabel(a)}</span>
              </span>
            </button>
          );
        })}
        {COMPANIES.map((m) => (
          <button
            key={m.slug}
            type="button"
            hidden
            className="walk-company-label"
            style={{ ["--d" as string]: districtBySlug.get(m.district)?.color }}
            ref={(el) => {
              if (el) pinButtons.current.set(m.slug, el);
              else pinButtons.current.delete(m.slug);
            }}
            onClick={() => select(m.slug, { fly: false })}
            title={`Open ${m.name}`}
          >
            {m.name}
          </button>
        ))}
        {PEOPLE.map((c) => (
          <button
            key={c.slug}
            type="button"
            hidden
            className="walk-company-label walk-person-label"
            ref={(el) => {
              if (el) pinButtons.current.set(c.slug, el);
              else pinButtons.current.delete(c.slug);
            }}
            onClick={() => selectPerson(c.slug, { fly: false })}
            aria-label={`${c.name}, ${c.title}`}
            title={`Open ${c.name}`}
          >
            {c.name}
          </button>
        ))}
        <div className="walk-tag-layer" ref={tagLayerRef} />
      </div>

      <div className="walk-stick" ref={stickRef} hidden aria-hidden="true">
        <div className="walk-stick-knob" ref={knobRef} />
      </div>
      <div className="walk-fade" ref={fadeRef} aria-hidden="true" />

      {/* Top right: minimap and camera controls. */}
      <div className="walk-hud walk-hud-tr">
        <section className={`walk-minimap ${mapVisible ? "is-open" : ""}`} aria-label="Island map">
          <button
            type="button"
            className="walk-minimap-toggle"
            aria-expanded={mapVisible}
            onClick={(e) => {
              if (intro) {
                dismissIntro();
                setMapOpen(true);
              } else setMapOpen((o) => !o);
              backToWorld(e);
            }}
          >
            <MapIcon size={16} aria-hidden="true" />
            <span>Map</span>
            {mapVisible ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
          </button>
          {mapVisible && layout && (
            <div className="walk-minimap-body" style={{ width: MINIMAP_SIZE, height: MINIMAP_SIZE }}>
              <canvas ref={minimapRef} style={{ width: MINIMAP_SIZE, height: MINIMAP_SIZE }} aria-hidden="true" />
              {layout.discs.map((disc) => {
                const a = areaBySlug(disc.slug);
                if (!a) return null;
                const ext = layout.islandRadius + 10;
                const h = MINIMAP_SIZE / 2;
                const r = Math.max(9, (disc.r / ext) * h);
                return (
                  <button
                    key={disc.slug}
                    type="button"
                    className="walk-minimap-hit"
                    style={{ left: h + (disc.x / ext) * h - r, top: h + (disc.z / ext) * h - r, width: r * 2, height: r * 2 }}
                    onClick={(e) => {
                      goToArea(disc.slug);
                      backToWorld(e);
                    }}
                    aria-label={`Go to ${a.label}`}
                    title={a.label}
                  />
                );
              })}
            </div>
          )}
        </section>
        <div className="walk-cam-btns" ref={camRef}>
          <button
            type="button"
            className="walk-icon-btn"
            onClick={(e) => {
              engine?.zoomBy(0.8);
              backToWorld(e);
            }}
            aria-label="Zoom in"
            title="Zoom in"
          >
            <Plus size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="walk-icon-btn"
            onClick={(e) => {
              engine?.zoomBy(1.25);
              backToWorld(e);
            }}
            aria-label="Zoom out"
            title="Zoom out"
          >
            <Minus size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="walk-icon-btn"
            onClick={(e) => {
              engine?.recenter();
              backToWorld(e);
            }}
            aria-label="Recenter the camera behind you"
            title="Recenter"
          >
            <LocateFixed size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Transient: district banner, paused hint. */}
      {banner && (
        <DistrictBanner key={banner.key} slug={banner.slug} reduced={reduced} engine={engine} onDone={clearBanner} />
      )}
      {nudge > 0 && <PausedHint key={nudge} />}
      {toast && (
        <div className="walk-toast" key={toast.key} role="status">
          <Sparkles size={16} aria-hidden="true" />
          <span>{toast.text}</span>
        </div>
      )}

      {!intro && <div className="walk-hud walk-travel-controls">
        <button type="button" className="walk-pill" onClick={(e) => { engine?.jump(); backToWorld(e); }} disabled={carAction === "exit"} title="Long jump (Space)">
          <ArrowUp size={16} aria-hidden="true" /> Jump <kbd>Space</kbd>
        </button>
        <button type="button" className="walk-pill" onClick={(e) => { engine?.useCar(); backToWorld(e); }} title="Car (F)">
          <Car size={16} aria-hidden="true" /> {carAction === "exit" ? "Exit car" : carAction === "enter" ? "Enter car" : "Summon car"}
        </button>
        {travelMessage && <span className="walk-travel-message" role="status">{travelMessage}</span>}
      </div>}

      {/* Bottom: proximity prompt and D-pad. */}
      <div className="walk-hud walk-hud-bottom">
        {nearCompany && nearCompany.slug !== selected && (
          <button type="button" className="walk-prompt" onClick={() => select(nearCompany.slug, { fly: false })}>
            <span className="walk-dot" style={{ background: districtBySlug.get(nearCompany.district)?.color }} aria-hidden="true" />
            <span>
              Meet <strong>{nearCompany.name}</strong>
            </span>
            <kbd>Enter</kbd>
          </button>
        )}
        {/* Beside the portal, with no pin in meeting range: the way to the Nexus. */}
        {portal !== "far" && !nearCompany && !nearPerson && !leaving && (
          <a className="walk-prompt walk-portal-prompt" href={PORTAL_HREF} onClick={(e) => { e.preventDefault(); setLeaving(true); }}>
            <Orbit size={18} aria-hidden="true" />
            <span>
              Step through to <strong>the Nexus</strong>
            </span>
            <kbd>Enter</kbd>
          </a>
        )}
        {/* Not over another person's open sheet: the prompt would name one person above another's details. */}
        {nearPerson && !person && (
          <button type="button" className="walk-prompt" onClick={() => selectPerson(nearPerson.slug, { fly: false })}>
            <PersonThumb person={nearPerson} size={26} />
            <span>
              Meet <strong>{nearPerson.name}</strong>
            </span>
            <kbd>Enter</kbd>
          </button>
        )}
      </div>
      {engine && <DPad engine={engine} padRef={padRef} />}
      {leaving && <PortalDeparture reduced={reduced} onCancel={() => { setLeaving(false); viewRef.current?.focus({ preventScroll: true }); }} />}
    </div>
  );
}

/**
 * Going through the Nexus portal: a short flash of the network's colors and a line saying where the
 * visitor is going, then the Nexus opens at this map's world. Cancel (or Esc) stays here.
 */
function PortalDeparture({ reduced, onCancel }: { reduced: boolean; onCancel: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const t = window.setTimeout(() => window.location.assign(PORTAL_HREF), reduced ? PORTAL_DELAY_MS + 600 : PORTAL_DELAY_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    cancelRef.current?.focus({ preventScroll: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [reduced, onCancel]);
  return (
    <div className={`walk-portal-departure${reduced ? " is-still" : ""}`} role="alertdialog" aria-labelledby="portal-go" aria-describedby="portal-what">
      <div className="walk-portal-card">
        <Orbit size={28} aria-hidden="true" />
        <p id="portal-go">
          <strong>Through the portal to the Nexus…</strong>
        </p>
        <p id="portal-what" className="walk-portal-what">
          The shared world of every map in the {NETWORK_NAME}. You will arrive at {SITE.org.name}'s world there, with a way back.
        </p>
        <div className="walk-portal-actions">
          <a className="btn btn-primary" href={PORTAL_HREF}>
            Go now
          </a>
          <button type="button" className="btn btn-quiet" ref={cancelRef} onClick={onCancel}>
            Stay here
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- HUD pieces ---------------- */

function IntroCard({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus({ preventScroll: true }); }, []);
  return (
    <section className="walk-card walk-intro" aria-labelledby={titleId} onKeyDownCapture={(e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    }}>
      <button type="button" className="walk-card-x" onClick={onClose} aria-label="Close the introduction">
        <X size={16} aria-hidden="true" />
      </button>
      <h2 id={titleId} ref={title} tabIndex={-1}>Explore on foot</h2>
      <p>{L.Companies} are grouped by {L.districts}, not location. Select a logo for details.</p>
      <details className="walk-controls" onKeyDown={(e) => e.stopPropagation()}>
        <summary>Controls <ChevronDown size={16} aria-hidden="true" /></summary>
        <dl className="walk-keyboard-controls">
          <div><dt>Walk</dt><dd><kbd>WASD</kbd> or arrows</dd></div>
          <div><dt>Run</dt><dd><kbd>Shift</kbd></dd></div>
          <div><dt>Long jump</dt><dd><kbd>Space</kbd></dd></div>
          <div><dt>Car</dt><dd><kbd>F</kbd> to summon, enter or exit</dd></div>
          <div><dt>Turn</dt><dd>Drag or <kbd>Q</kbd> / <kbd>E</kbd></dd></div>
          <div><dt>Zoom</dt><dd>Scroll or <kbd>+</kbd> / <kbd>-</kbd></dd></div>
          <div><dt>Open nearby</dt><dd><kbd>Enter</kbd></dd></div>
          {WALK.keepsakes && <div><dt>Keepsakes</dt><dd>A few are hidden: find them by wandering</dd></div>}
        </dl>
        <dl className="walk-touch-controls">
          <div><dt>Walk</dt><dd>Drag or hold arrows</dd></div>
          <div><dt>Travel</dt><dd>Use Jump or Summon car</dd></div>
          <div><dt>Turn</dt><dd>Two-finger drag</dd></div>
          <div><dt>Zoom</dt><dd>Pinch</dd></div>
          <div><dt>Open</dt><dd>Tap a logo</dd></div>
        </dl>
      </details>
      {ARRIVED_FROM_NEXUS && <NexusReturnLink />}
    </section>
  );
}

function NexusReturnLink() {
  return <a className="walk-nexus-return" href={NEXUS_HREF}><Orbit size={16} aria-hidden="true" /> Back to Nexus</a>;
}

function LivePill({
  live,
  me,
  sessionRef,
  showOthers,
  setShowOthers,
}: {
  live: LiveSummary;
  me: Visitor;
  sessionRef: RefObject<LiveSession | null>;
  showOthers: boolean;
  setShowOthers: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const popId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  // A dialog takes focus when it opens (so it is announced and Tab starts inside it).
  useEffect(() => {
    if (open) popRef.current?.focus({ preventScroll: true });
  }, [open]);
  const n = live.others.length;
  const tone = live.status === "live" ? "live" : live.status === "off" ? "off" : "pending";
  const label =
    live.status === "live"
      ? n > 0
        ? `${n} explorer${n === 1 ? "" : "s"} here now`
        : "Live · just you right now"
      : live.status === "connecting"
        ? "Connecting…"
        : live.status === "error"
          ? "Live explorers unavailable"
          : "Exploring solo";

  // Where the others are (refreshed while the popover is open; not per frame).
  const [whereabouts, setWhereabouts] = useState<Map<string, string | null>>(new Map());
  useEffect(() => {
    if (!open) return;
    const read = () => {
      const s = sessionRef.current?.getState();
      setWhereabouts(new Map((s?.others ?? []).map((o) => [o.id, o.pose?.district ?? null])));
    };
    read();
    const t = window.setInterval(read, 1000);
    return () => window.clearInterval(t);
  }, [open, sessionRef]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        pillRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div className="walk-live" ref={wrapRef}>
      <button
        type="button"
        ref={pillRef}
        className={`walk-pill is-${tone}`}
        aria-expanded={open}
        aria-controls={popId}
        onClick={() => setOpen((o) => !o)}
        title={live.status === "off" || live.status === "error" ? live.reason ?? undefined : "Live explorers"}
      >
        <span className="walk-pill-dot" aria-hidden="true" />
        <Users size={15} aria-hidden="true" />
        <span>{label}</span>
      </button>
      {open && (
        <div className="walk-card walk-pop" id={popId} role="dialog" aria-label="Live explorers" tabIndex={-1} ref={popRef}>
          <div className="walk-pop-me">
            <Swatch avatar={me.avatar} />
            <div>
              <div>
                You are <strong>{me.name}</strong>
              </div>
              <div className="walk-muted">{outfit(me.avatar)}</div>
            </div>
            <button type="button" className="btn walk-pop-reroll" onClick={() => rerollVisitor()}>
              <Shuffle size={15} aria-hidden="true" /> New look
            </button>
          </div>
          {(live.status === "off" || live.status === "error") && live.reason && <p className="walk-pop-reason">{live.reason}</p>}
          {live.status === "connecting" && <p className="walk-pop-reason">Connecting to other explorers…</p>}
          {live.status === "live" && (
            <>
              <h3 className="walk-pop-h">{n ? `Exploring now (${n})` : "No one else is here right now"}</h3>
              {n > 0 && (
                <ul className="walk-pop-list">
                  {live.others.slice(0, 30).map((o) => {
                    const where = whereabouts.get(o.id);
                    const d = areaBySlug(where);
                    return (
                      <li key={o.id}>
                        <Swatch avatar={o.avatar} small />
                        <span className="walk-pop-name">{o.name}</span>
                        <span className="walk-muted">{d ? `In ${d.label}` : "Out exploring"}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <label className="walk-check">
                <input type="checkbox" checked={showOthers} onChange={(e) => setShowOthers(e.target.checked)} />
                Show other explorers
              </label>
            </>
          )}
          <p className="walk-pop-note">
            Other explorers see your generated name, your avatar, your position in this world and the area you are in (an industry district or People). Your name stays the same between visits in this browser until you choose New look.
          </p>
        </div>
      )}
    </div>
  );
}

function Swatch({ avatar, small = false }: { avatar: AvatarSpec; small?: boolean }) {
  return (
    <span className={`walk-swatch ${small ? "is-small" : ""}`} style={{ background: avatar.body, borderColor: avatar.accent }} aria-hidden="true">
      <span style={{ background: avatar.skin }} />
    </span>
  );
}

function DistrictBanner({ slug, reduced, engine, onDone }: { slug: AreaSlug; reduced: boolean; engine: WalkEngine | null; onDone: () => void }) {
  const d = areaBySlug(slug);
  const people = isPeopleArea(slug);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = window.setTimeout(onDone, reduced ? 3200 : 2600);
    return () => window.clearTimeout(t);
  }, [onDone, reduced]);
  // While it shows, the district's own floating label (same words) stands aside instead of piling under it.
  useLayoutEffect(() => {
    const el = ref.current;
    const view = el?.offsetParent as HTMLElement | null;
    if (!el || !view || !engine) return;
    const r = el.getBoundingClientRect();
    const v = view.getBoundingClientRect();
    engine.reserve({ x: r.left - v.left, y: r.top - v.top, w: r.width, h: r.height + 8 });
    return () => engine.reserve(null);
  }, [engine]);
  if (!d) return null;
  return (
    <div className={`walk-banner${people ? " is-people" : ""}`} role="status" ref={ref} style={people ? undefined : { ["--d" as string]: d.color }}>
      <span className="walk-district-icon" aria-hidden="true">
        <AreaIcon slug={slug} size={18} />
      </span>
      <span>
        <strong>{d.label}</strong> · {countLabel(d)}
        <small>{people ? `${SITE.org.name}'s ${L.people}` : `Grouped by ${L.district}, not location`}</small>
      </span>
    </div>
  );
}

function PausedHint() {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setShown(false), 2600);
    return () => window.clearTimeout(t);
  }, []);
  if (!shown) return null;
  return (
    <div className="walk-hint" role="status">
      Keyboard walking is paused while you type. Click the world or press Esc to keep exploring.
    </div>
  );
}

type Dir = "f" | "b" | "l" | "r";

function DPad({ engine, padRef }: { engine: WalkEngine; padRef: RefObject<HTMLDivElement | null> }) {
  const btn = (dir: Dir, label: string, icon: ReactNode, cls: string) => {
    const set = (v: boolean) => {
      engine.pad[dir] = v;
    };
    return (
      <button
        type="button"
        className={`walk-pad-btn ${cls}`}
        aria-label={label}
        title={label}
        onPointerDown={(e) => {
          e.preventDefault();
          // Pressing the pad means "walk": hand keyboard focus back from the details sheet.
          const ae = document.activeElement as HTMLElement | null;
          if (ae?.closest(".sheet")) ae.blur();
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          set(true);
        }}
        onPointerUp={() => set(false)}
        onPointerCancel={() => set(false)}
        onLostPointerCapture={() => set(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            set(true);
          }
        }}
        onKeyUp={(e) => {
          if (e.key === "Enter" || e.key === " ") set(false);
        }}
        onBlur={() => set(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {icon}
      </button>
    );
  };
  return (
    <div className="walk-hud walk-pad" ref={padRef} role="group" aria-label="Walk (press and hold)">
      {btn("f", "Walk forward", <ArrowUp size={18} aria-hidden="true" />, "is-up")}
      {btn("l", "Walk left", <ArrowLeft size={18} aria-hidden="true" />, "is-left")}
      {btn("b", "Walk back", <ArrowDown size={18} aria-hidden="true" />, "is-down")}
      {btn("r", "Walk right", <ArrowRight size={18} aria-hidden="true" />, "is-right")}
    </div>
  );
}
