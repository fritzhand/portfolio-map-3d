# AGENTS.md

The operating manual for any coding agent in this repository is [CLAUDE.md](./CLAUDE.md). Read it
before changing anything. The points agents need most often:

- A map's content lives in `site/` and the app reads it only through `src/data/catalog.ts`. Every
  fact keeps its source; nothing is invented.
- There are two walk worlds, chosen by `walk.world` in `site/site.json`:
  - `campus` (the default): `src/island`, with its models built in Blender from code in `art/`.
    Restyling it takes Blender 5 and more time.
  - `classic`: `src/views/walk`, built entirely in TypeScript, with live explorers. It is the
    cheaper base to customize.
- Check which walk world a site uses before changing it, and keep both worlds building.
- Every map links to the Nexus. Never remove the portal, the top bar's Nexus link, the About panel's
  network section, the meta tag or the manifest.
- Before a commit, run `npm run validate && npm test && npm run build`.
