/* The walk view: one of the two walk worlds, as site.json chooses (walk.world, docs/configuration.md).

   - "campus" (the default, IslandWalk.tsx and src/island): a tech campus on an island, every model
     built in Blender from code (art/). The richer look; customizing its models takes Blender.
   - "classic" (ClassicWalk.tsx): a village world built entirely in TypeScript, with live explorers.
     No model files and no Blender, so it is the cheaper one to restyle.

   Each world is its own chunk: a visit loads only the chosen one. In development, ?world=classic or
   ?world=campus overrides the site's choice. */
import { lazy, Suspense, useState } from "react";
import { WALK_WORLD, type WalkWorldName } from "../../site";
import { WalkBoundary, WalkFallback, hasWebGL } from "./fallback";
import "./walk.css";

const IslandWalk = lazy(() => import("./IslandWalk"));
const ClassicWalk = lazy(() => import("./ClassicWalk"));

function chosenWorld(): WalkWorldName {
  if (import.meta.env.DEV && typeof location !== "undefined") {
    const w = new URLSearchParams(location.search).get("world");
    if (w === "classic" || w === "campus") return w;
  }
  return WALK_WORLD;
}

export default function WalkView() {
  const [webgl] = useState(hasWebGL);
  const [world] = useState(chosenWorld);
  if (!webgl) return <WalkFallback />;
  return (
    <WalkBoundary>
      <Suspense fallback={<div className="view-loading">Loading the walkable world…</div>}>{world === "classic" ? <ClassicWalk /> : <IslandWalk />}</Suspense>
    </WalkBoundary>
  );
}
