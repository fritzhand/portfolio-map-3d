/* The world mode (?world): the Nexus full screen, with a HUD over it. Every world is reachable
   three ways: by pointing at it, from the list of worlds, and from search. The open world lives
   in the address (?world=<id>), so it can be shared; an arrival from a map (?world&from=<id>)
   starts framed on that map's world, with a welcome. */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { instanceHref } from "../../../federation/protocol.ts";
import { MUSIC } from "../config.ts";
import { HUD, hudInsets, isPhone, musicButtonRect, panelWidth } from "../lib/hud.ts";
import { keyAction, SHORTCUTS, stepWorld } from "../lib/keys.ts";
import { planetEntryHref } from "../lib/entry.ts";
import type { World } from "../lib/network.ts";
import { LANDING, namesArrival, sameRoute, type Route } from "../lib/route.ts";
import { buildIndex } from "../lib/search.ts";
import type { EngineStatus } from "../hooks/useEngine.ts";
import { useViewport } from "../hooks/useMedia.ts";
import type { NetworkState } from "../hooks/useNetwork.ts";
import { navigate, routeHref } from "../hooks/useRoute.ts";
import type { NexusEngine } from "../three/engine.ts";
import { ArrowLeft, ArrowRight, Close, Keyboard, ListIcon, Mark, Orbit } from "./Icons.tsx";
import { MusicButton } from "./MusicButton.tsx";
import { EmptyNetwork, NetworkList } from "./NetworkList.tsx";
import { NetworkSearch } from "./NetworkSearch.tsx";
import { SceneHost } from "./SceneHost.tsx";
import { WorldList } from "./WorldList.tsx";
import { WorldPanel } from "./WorldPanel.tsx";

interface Props {
  route: Route;
  net: NetworkState;
  engine: NexusEngine | null;
  gl: EngineStatus;
  reduced: boolean;
  pickRef: RefObject<((id: string | null, district?: string) => void) | null>;
  onRetry: () => void;
}

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** The arrival note: a welcome from a map in the network, or a neutral note for any other `from`. */
type Arrival = { kind: "welcome"; world: World } | { kind: "unknown" };

function Toast({ arrival, onClose }: { arrival: Arrival; onClose: () => void }) {
  const dismiss = (
    <button type="button" className="icon-btn icon-btn-small" onClick={onClose} aria-label="Dismiss">
      <Close size={16} />
    </button>
  );
  if (arrival.kind === "unknown") {
    return (
      <div className="toast toast-neutral">
        <div className="toast-row">
          <p>This map hasn't joined the network yet.</p>
          {dismiss}
        </div>
      </div>
    );
  }
  const world = arrival.world;
  return (
    <div className="toast">
      <p>
        You came from <strong>{world.name}</strong>.
      </p>
      <div className="toast-actions">
        <a className="text-link" href={instanceHref(world.url)}>
          <ArrowLeft size={16} /> Back to {world.name}
        </a>
        {dismiss}
      </div>
    </div>
  );
}

export function WorldMode({ route, net, engine, gl, reduced, pickRef, onRetry }: Props) {
  const model = net.status === "ready" ? net.model : null;
  const index = useMemo(() => (model ? buildIndex(model.worlds) : []), [model]);
  const indexById = useMemo(() => new Map(index.map((iw) => [iw.world.id, iw])), [index]);
  const viewport = useViewport();
  const phone = isPhone(viewport.w);
  const [railOpen, setRailOpen] = useState(() => window.innerWidth >= HUD.railFrom);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [panelFilter, setPanelFilter] = useState("");
  const [panelDistrict, setPanelDistrict] = useState<string | undefined>();
  const [panelNonce, setPanelNonce] = useState(0);
  const [toast, setToast] = useState<Arrival | null>(null);
  const [portal, setPortal] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const arrival = useRef(route.from ? { from: route.from, via: route.via } : null);
  // Any from= in the address, well formed or not (a malformed id is never echoed back).
  const namedArrival = useRef(namesArrival(window.location.search));
  const welcomed = useRef(false);
  const startedFor = useRef<NexusEngine | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const selected = route.world && model?.byId.has(route.world) ? route.world : null;
  const iw = selected ? indexById.get(selected) : undefined;
  const listShown = phone ? sheetOpen : railOpen;
  const worldCount = model?.worlds.length ?? 0;

  useEffect(() => {
    document.title = iw ? `${iw.world.name} · The Nexus` : "The Nexus · company maps";
  }, [iw]);

  useEffect(() => {
    document.documentElement.classList.add("in-world");
    window.scrollTo(0, 0);
    return () => document.documentElement.classList.remove("in-world");
  }, []);

  const go = useCallback((world: string | null) => navigate({ mode: "world", world, from: null, via: null, sample: route.sample }, { replace: true }), [route.sample]);

  const openWorld = useCallback(
    (id: string, opts: { highlight?: string; filter?: string; district?: string } = {}) => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body && !active.closest(".panel")) returnFocus.current = active;
      setHighlight(opts.highlight ?? null);
      setPanelFilter(opts.filter ?? "");
      setPanelDistrict(opts.district);
      setPanelNonce((n) => n + 1);
      setSheetOpen(false);
      go(id);
    },
    [go],
  );

  const closePanel = useCallback(() => {
    go(null);
    setHighlight(null);
    const back = returnFocus.current;
    returnFocus.current = null;
    if (back && document.contains(back)) back.focus({ preventScroll: true });
  }, [go]);

  const overview = useCallback(() => {
    go(null);
    setHighlight(null);
    setSheetOpen(false);
    engine?.showOverview();
  }, [engine, go]);

  const leave = useCallback(() => navigate({ ...LANDING, sample: route.sample }), [route.sample]);

  // The 3D scene reports what was clicked: a world opens, the core returns to the overview.
  useEffect(() => {
    pickRef.current = (id, district) => {
      if (id === "core") overview();
      else if (id) openWorld(id, { district });
    };
    return () => {
      pickRef.current = null;
    };
  }, [pickRef, openWorld, overview]);

  // The scene frames the space the HUD leaves (set before the view below, which frames with it).
  const insets = hudInsets(viewport, { panel: !!iw, rail: railOpen && !phone, sheet: phone && sheetOpen });
  useEffect(() => {
    engine?.setInsets(insets);
    engine?.setKeepOut(MUSIC ? [musicButtonRect(viewport, insets)] : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, viewport.w, viewport.h, insets.top, insets.right, insets.bottom, insets.left]);
  useEffect(() => () => engine?.setKeepOut([]), [engine]);

  // The arrival note, once the network is known: a welcome only for a map that is a world here;
  // any other from= (not in the network, not verified, malformed) gets the neutral note.
  useEffect(() => {
    if (!model || welcomed.current) return;
    welcomed.current = true;
    const a = arrival.current;
    const from = a ? model.byId.get(a.from) : undefined;
    if (from) setToast({ kind: "welcome", world: from });
    else if (namedArrival.current) setToast({ kind: "unknown" });
    // Tidy the address: no replayed portal on reload, no unknown ids, no world that is not here.
    const next: Route = { ...route, via: null, from: from ? route.from : null, world: route.world && model.byId.has(route.world) ? route.world : null };
    if (!sameRoute(next, route) || (namedArrival.current && !from)) navigate(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // What the camera shows: the arrival, the open world, or the overview.
  useEffect(() => {
    if (!engine || !model) return;
    if (startedFor.current !== engine) {
      startedFor.current = engine;
      const a = arrival.current;
      arrival.current = null;
      const from = a ? model.byId.get(a.from) : undefined;
      if (selected) engine.showWorld(selected);
      else if (from) {
        const portalArrival = a?.via === "portal" && !reduced;
        engine.showWorld(from.id, portalArrival ? "portal" : "link");
        // The ring of light plays as the camera pulls back out of the world.
        if (portalArrival) {
          setPortal(true);
          // Normally removed when its flash ends (onAnimationEnd below); this is the fallback.
          window.setTimeout(() => setPortal(false), 5000);
        }
      } else engine.showOverview();
      return;
    }
    if (selected) engine.showWorld(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, model, selected]);

  useEffect(() => {
    if (selected) engine?.setDistrict(panelDistrict ?? null);
  }, [engine, selected, panelDistrict, panelNonce]);

  // The keyboard (lib/keys.ts): Esc closes what is open; the other keys turn, zoom and step the view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") {
        if (keysOpen) setKeysOpen(false);
        else if (phone && sheetOpen) setSheetOpen(false);
        else if (iw) closePanel();
        return;
      }
      const action = keyAction(e);
      if (!action || isTyping(e.target) || gl === "unavailable") return;
      // In the lists and the panel the arrow keys scroll, as they do anywhere else.
      if (action.kind === "orbit" && e.target instanceof Element && e.target.closest(".panel, .rail, .search, .keys-card")) return;
      e.preventDefault();
      if (action.kind === "orbit") engine?.orbit(action.azimuth, action.polar);
      else if (action.kind === "zoom") engine?.zoom(action.factor);
      else if (action.kind === "overview") overview();
      else if (action.kind === "search") searchInput.current?.focus();
      else if (action.kind === "help") setKeysOpen((open) => !open);
      else {
        const next = stepWorld(model?.worlds.map((w) => w.id) ?? [], selected, action.by);
        if (next) openWorld(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phone, sheetOpen, keysOpen, iw, closePanel, engine, gl, model, selected, openWorld, overview]);

  const toastRegion = (
    <div className="toast-region" role="status" aria-live="polite">
      {toast ? <Toast arrival={toast} onClose={() => setToast(null)} /> : null}
    </div>
  );

  if (gl === "unavailable") {
    return (
      <div className="world-fallback">
        <header className="fallback-head">
          <a className="hud-brand" href={routeHref({ ...LANDING, sample: route.sample })} onClick={(event) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); leave(); } }}>
            <Mark size={28} className="brand-mark" />
            <span className="hud-brand-name"><span className="sr-only">The </span>Nexus</span>
            {route.sample ? <span className="sample-badge">Sample data</span> : null}
            <span className="sr-only">, home</span>
          </a>
          <button type="button" className="btn btn-outline btn-small" onClick={leave}>
            <ArrowLeft size={16} /> Home
          </button>
        </header>
        <main className="container fallback-main">
          {toastRegion}
          <h1>The network</h1>
          <p className="note">3D is unavailable. Browse the maps below.</p>
          {net.status === "loading" ? <p className="muted">Loading maps...</p> : null}
          {net.status === "error" ? <p className="status status-problem">{net.message}</p> : null}
          {model ? <NetworkList model={model} headingLevel={2} joinHref={routeHref({ ...LANDING, sample: route.sample }, "#how")} /> : null}
        </main>
        <MusicButton />
      </div>
    );
  }

  const style = {
    "--top-h": `${phone ? HUD.topPhone : HUD.topDesktop}px`,
    "--rail-w": `${HUD.rail}px`,
    "--panel-w": `${panelWidth(viewport.w)}px`,
    "--sheet-h": `${Math.round(viewport.h * HUD.sheet)}px`,
    "--gap": `${HUD.gap}px`,
    "--inset-t": `${insets.top}px`,
    "--inset-l": `${insets.left}px`,
    "--inset-r": `${insets.right}px`,
    "--inset-b": `${insets.bottom}px`,
  } as CSSProperties;

  return (
    <div className={`world${phone ? " is-phone" : ""}${listShown ? " has-list" : ""}${iw ? " has-panel" : ""}`} style={style}>
      <a className="skip-link" href="#world-list" onClick={() => (phone ? setSheetOpen(true) : setRailOpen(true))}>
        Skip to maps
      </a>
      <main className="world-main" aria-label="The Nexus">
        <SceneHost
          engine={engine}
          className="world-scene"
          interactive
          label={`The Nexus in 3D: ${worldCount} ${worldCount === 1 ? "world" : "worlds"} around the core. Every world is also in the list of worlds and in search.`}
        />
        {portal ? (
          <div className="portal" aria-hidden="true" onAnimationEnd={(e) => e.animationName === "portal-flash" && setPortal(false)}>
            <span className="portal-ring" />
            <span className="portal-ring portal-ring-2" />
          </div>
        ) : null}
        {net.status === "loading" ? <p className="world-note">Loading maps...</p> : null}
        {net.status === "error" ? (
          <div className="world-card">
            <p className="status status-problem">{net.message}</p>
            <button type="button" className="btn btn-outline btn-small" onClick={onRetry}>
              Try again
            </button>
          </div>
        ) : null}
        {model && !model.worlds.length ? (
          <div className="world-card world-empty">
            <EmptyNetwork />
            <button type="button" className="btn btn-primary btn-small" onClick={() => navigate({ ...LANDING, sample: route.sample }, { hash: "#how" })}>
              How to join <ArrowRight size={16} />
            </button>
          </div>
        ) : null}
      </main>

      <header className="hud-top">
        <a className="hud-brand" href={routeHref({ ...LANDING, sample: route.sample })} onClick={(event) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); leave(); } }}>
          <Mark size={28} className="brand-mark" />
          <span className="hud-brand-name"><span className="sr-only">The </span>Nexus</span>
          {route.sample ? <span className="sample-badge">Sample data</span> : null}
          <span className="sr-only">, home</span>
        </a>
        <NetworkSearch index={index} onWorld={(id, filter) => openWorld(id, { filter })} onCompany={(id, slug) => openWorld(id, { highlight: slug })} inputRef={searchInput} />
        <div className="hud-actions">
          <button type="button" className="hud-btn" aria-expanded={listShown} aria-controls="world-list" onClick={() => (phone ? setSheetOpen(!sheetOpen) : setRailOpen(!railOpen))}>
            <ListIcon size={20} />
            <span className="hud-btn-text">Maps</span>
            <span className="hud-count">{worldCount}</span>
          </button>
          <button type="button" className="hud-btn" onClick={overview}>
            <Orbit size={20} />
            <span className="hud-btn-text">Overview</span>
          </button>
          <button type="button" className="hud-btn" onClick={leave}>
            <ArrowLeft size={20} />
            <span className="hud-btn-text">Home</span>
          </button>
          {phone ? null : (
            <button type="button" className="hud-btn hud-btn-icon" aria-expanded={keysOpen} aria-controls="keys-card" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => setKeysOpen(!keysOpen)}>
              <Keyboard size={20} />
            </button>
          )}
        </div>
      </header>

      <section id="keys-card" className="keys-card" aria-labelledby="keys-title" hidden={!keysOpen}>
        <div className="keys-head">
          <h2 id="keys-title">Keyboard</h2>
          <button type="button" className="icon-btn icon-btn-small" onClick={() => setKeysOpen(false)} aria-label="Hide the keyboard shortcuts">
            <Close size={18} />
          </button>
        </div>
        <dl className="keys-list">
          {SHORTCUTS.map((s) => (
            <div key={s.does}>
              <dt>
                {s.keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </dt>
              <dd>{s.does}</dd>
            </div>
          ))}
        </dl>
      </section>

      <nav id="world-list" className="rail" aria-labelledby="world-list-title" hidden={!listShown}>
        <div className="rail-head">
          <h2 id="world-list-title">
            Maps <span className="hud-count">{worldCount}</span>
          </h2>
          <button type="button" className="icon-btn icon-btn-small" onClick={() => (phone ? setSheetOpen(false) : setRailOpen(false))} aria-label="Hide the list of worlds">
            <Close size={18} />
          </button>
        </div>
        {model ? <WorldList model={model} current={selected} onSelect={(id) => openWorld(id)} /> : null}
      </nav>

      {iw ? <WorldPanel key={`${iw.world.id}:${panelNonce}`} iw={iw} highlight={highlight} initialFilter={panelFilter} initialDistrict={panelDistrict} enterHref={planetEntryHref(iw.world)} onDistrictChange={(district) => setPanelDistrict(district ?? undefined)} onClose={closePanel} /> : null}

      {toastRegion}
      <MusicButton />
    </div>
  );
}
