import { lazy, Suspense, useEffect } from "react";
import DetailSheet from "./components/DetailSheet";
import ListView from "./components/ListView";
import NexusArrival from "./components/NexusArrival";
import Panels from "./components/Panels";
import TopBar from "./components/TopBar";
import { DEBUG } from "./debug/registry";
import { SITE, L } from "./site";
import { useStore } from "./state/store";

const MindMapView = lazy(() => import("./views/mindmap/MindMapView"));
const WalkView = lazy(() => import("./views/walk/WalkView"));
const DiagView = lazy(() => import("./views/diag/DiagView"));
const KitView = lazy(() => import("./views/kit/KitView"));
/** ?debug adds a probe panel that measures the live 3D scene (why logos are or aren't showing). */
const DebugProbe = DEBUG ? lazy(() => import("./debug/DebugProbe")) : null;
const query = new URLSearchParams(window.location.search);
/** ?diag opens the graphics check (for devices where the 3D logos don't show). */
const DIAG = query.has("diag");
/** ?kit opens the gallery of the walk world's models (src/views/kit). */
const KIT = query.has("kit");

export default function App() {
  if (DIAG)
    return (
      <Suspense fallback={<div className="view-loading">Loading the graphics check…</div>}>
        <DiagView />
      </Suspense>
    );
  if (KIT)
    return (
      <Suspense fallback={<div className="view-loading">Loading the kit…</div>}>
        <KitView />
      </Suspense>
    );
  return <MapApp />;
}

function MapApp() {
  const view = useStore((s) => s.view);
  const roster = useStore((s) => s.roster);
  const panel = useStore((s) => s.panel);

  useEffect(() => {
    const people = roster === "people";
    document.title = `${{ mindmap: people ? `${L.People} globe` : "Globe", walk: "Walk", list: people ? L.People : "List" }[view]} · ${SITE.map.title}`;
  }, [view, roster]);

  return (
    <div className={`app view-${view} ${panel ? "has-panel" : ""}`}>
      <a
        className="skip-link"
        href="#main"
        onClick={() => {
          useStore.getState().setView("list");
          useStore.getState().setRoster("companies");
        }}
      >
        Skip to the {L.company} list
      </a>
      <TopBar />
      <main className="stage" id="main">
        <Suspense fallback={<div className="view-loading">Loading the map…</div>}>
          {view === "mindmap" && <MindMapView />}
          {view === "walk" && <WalkView />}
          {view === "list" && <ListView />}
        </Suspense>
        <Panels />
        <NexusArrival />
      </main>
      <DetailSheet />
      {DebugProbe && (
        <Suspense fallback={null}>
          <DebugProbe />
        </Suspense>
      )}
    </div>
  );
}
