# Architecture

A static single-page app (Vite 8 + React 19 + TypeScript), two three.js views (the globe in React
Three Fiber, and the walk world: the campus on its own engine, or the classic world in React Three
Fiber, as the site chooses), a zustand store mirrored into the URL, and one optional realtime
service.
Built from the Embarc Member Map and the Ambition Accelerated Community Map, whose hard-won fixes
for real devices it keeps.

## Code map

```
src/site.ts        the site config (site/site.json) and the labels helper L
src/network.ts     the map's link into the network: NEXUS_HREF, PORTAL_HREF, arrival from the Nexus
src/agent.ts       the map's tools for AI agents in the browser (WebMCP), loaded only where it exists
src/data/          catalog (the one reader of site/), types, graph (connections, provider finder),
                   search (companies, people), labels, layout (the walk world's geometry), hub (the
                   hub's and the portal's footprints), tests
src/state/         zustand store + URL deep-link sync
src/three/         badge and label textures shared by both views (baked to byte arrays), logo
                   measurement (logoInfo), CPU-backed canvases, the WebGL context-loss watch
src/live/          live explorers: anonymous identity, presence (Supabase Realtime or BroadcastChannel)
src/components/    the shell: TopBar, DetailSheet, PersonDetail, Panels (finder, districts, about),
                   ListView, NexusArrival, shared bits (district icons, logo thumbnails)
src/views/         mindmap/ (both globes: controller, globeContent, globeLayout, personLayout),
                   walk/ (WalkView picks the site's walk world, site.json walk.world: ClassicWalk,
                   the classic world built in code, or IslandWalk, the host of the campus; each is
                   its own chunk), diag/ (the /?diag graphics check)
src/island/        the campus walk world: the plan (mapLayout: plaza, districts, their dressing, roads, set
                   pieces), the ground (mapGround), the vignettes between districts (mapVignettes),
                   the world builder (mapWorld), the HUD and picking (mapOverlay, mapMinimap,
                   mapLabels), assets placed from art/ (campus.ts), logo screens (screens.ts), boards
                   and displays, the palette (palette.json, ramps.ts, palette.ts), day and night
                   (theme.ts), the shuttle, the set pieces (mapPieces; pieces/: their kinds, models,
                   colliders and motion); engine/ and scene/ are its renderer, camera, physics,
                   characters, sky, sea and scene material
art/               the island's models, built in Blender from code (art/README.md); npm run art
                   writes them to public/island/geometries/; art/source/ holds the figure the walker
                   is drawn from (npm run art:walker)
src/debug/         the ?debug scene probe
federation/        the network protocol (plain TypeScript, read by the map, the Nexus and Node), and
                   agent.ts: tools for AI agents, defined once for MCP and WebMCP
mcp/               the builder: a local MCP server whose writes to site/ go through validateSite()
scripts/           validate-site, manifest, import-csv (+ csv), new-site, check-bundle,
                   build-network, check-registry, contract-patterns
nexus/             the Nexus app (landing page + shared world)
```

## Data flow

```
site/site.json ─┐
site/taxonomy.json ─┤                         ┌─▶ the app (src/data/catalog.ts; the build drops sources)
site/data/*.json ───┼─ scripts/validate-site ─┤
site/logos/, people/, brand/ ─┘               └─▶ dist/portfolio-map.json (scripts/manifest.mjs) ─▶ the Nexus
```

`src/data/catalog.ts` is the only module that imports `site/`. Logos and headshots are found by
file name (`import.meta.glob`), so adding one is dropping a file. `publicData()` in
`vite.config.ts` keeps only the fields the app reads in the production bundle.

## Why it is built this way

- **Static.** The data is small (tens to a few thousand records), public, and changes when the
  organization's list changes. A static build is the cheapest thing to host and the simplest to
  keep honest. three.js and React Three Fiber load only with a 3D view; the List never downloads
  them.
- **Deterministic layouts.** The globe's regions (`globeLayout.ts`) and the walk world's ring
  (`layout.ts`) are hand-written and come out the same on every visit, sized by company counts.
- **Badges as bytes.** Every badge is painted on one shared canvas and copied into a `DataTexture`.
  Chrome for Android can evict or wipe 2D canvases it holds, and a cached canvas texture then
  uploads blank in the next view; bytes in ordinary memory cannot be wiped. Every other canvas that
  backs a texture is CPU-backed (`cpuCanvas`), because a GPU process loss wipes GPU-backed
  canvases. Each view redraws after a context restore and starts over if none comes.
- **A painted look, drawn cheaply.** The globe and the classic world light their surfaces with a
  soft two-tone terminator and drifting cloud shadows (`src/three/toon.ts`), drawn without tone
  mapping, so the colors are the theme's tokens; they draw at a pixel ratio held to a budget
  (`src/three/adaptiveDpr.ts`).
- **The classic world: built from parts, in code.** Its village (houses, street furniture, lamp
  posts and wire, the set pieces on the coast and in the hills, the animals) is built from faceted,
  vertex-colored parts (`src/views/walk/kit.ts`) merged into a few draw calls; no model, texture or
  sound file is fetched, and where things stand comes from the layout alone. Restyling it is a code
  change, which is why it is the lighter base to customize.
- **The campus: models from code, shaded by a palette.** Every model in the campus is a Blender
  build script (`art/assets/`), exported and Draco-compressed into a small `.bin`; every face names
  a palette ramp, which the scene material reads at the sun's angle (a shade band, a body, a narrow
  highlight), so no model needs a texture. A district's color reaches its assets through accent
  slots (one model serves every district); copies of a model are one instanced mesh, per district
  where that lets a district out of view be culled. Each company's logo is copied into an atlas page
  and drawn on its totem's screens, a draw call per page. Where everything stands comes from the plan
  (`src/island/mapLayout.ts`, pure and tested), so the campus is the same on every load. Restyling
  its models takes Blender 5 and the art pipeline (`art/README.md`).
- **Logos measured in the browser.** `src/three/logoInfo.ts` reads a small copy of each logo once:
  opaque corners → the logo's own background; light artwork → an ink plate; otherwise white; empty
  margins trimmed. No image pipeline to install.
- **One engine per view, no per-frame React state.** The globe runs on one `GlobeController` with a
  `GlobeContent` per globe; the classic world on `WalkEngine` (`src/views/walk/engine.ts`), the campus
  on the island's engine (`src/island/engine`). React renders the HUD and real buttons
  for labels; the engines position them.
- **Accessibility.** Every record is reachable without 3D; labels in the 3D views are real buttons;
  Esc closes one layer at a time; reduced motion turns off auto-rotation, drop-ins and easing.

## Extending

- A district icon: add the lucide icon to `DISTRICT_ICONS` in `src/components/bits.tsx`.
- The walk world: `walk.world` in `site/site.json`, `campus` or `classic`
  ([configuration.md](./configuration.md#the-walk-world)).
- A district's landmark (campus): set `theme` on it in `site/taxonomy.json` (`src/island/themes.json`
  lists them); a new kind of landmark is a builder in `art/assets/landmarks.py` and an entry in themes.json.
- A new asset in the campus: a builder in `art/assets/`, `npm run art`, then place it from the plan.
- The classic world's look: its parts and builders in `src/views/walk/` (`kit.ts`, `village.ts`,
  `houses.ts`, `scenery.ts`), placed by the pure functions their tests cover.
- A field the UI should read: add it to `types.ts`, the validator's whitelist, and check that
  `publicData()` keeps it.
- Never remove the portal, the Nexus link, the meta tag or the manifest
  ([NETWORK.md](../NETWORK.md)).
