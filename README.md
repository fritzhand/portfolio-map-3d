# portfolio-map-3d

An open source framework for publishing an organization's companies (an accelerator's cohort, an
incubator's members, a fund's portfolio, a community's startups, an event's exhibitors) as a 3D map
with three ways in:

| View | What it's for |
|---|---|
| **Globe** | A slowly turning globe of logos. Each district (a sector, a track, a program) owns a region of the sphere; arcs show documented connections. Select a logo to see the company, its connections and its potential fits among the others. An optional second globe shows the organization's people (coaches, mentors, advisors). |
| **Walk** | Your own explorer, a kid in shorts and a straw hat, in a painted summer afternoon: the organization's hub on a central plaza, a village street of houses with lamp posts and bunting around it, a gazebo-crowned neighborhood per district, a drop pin and badge for every company, and a coast and hills with a lighthouse, a pier, a windmill and a farm to wander to. Walk up to a pin and its details slide up. Other visitors can walk there with you, live. A portal on the plaza leads to the Nexus. |
| **List** | The same records as a searchable, filterable directory. No 3D required; every record is reachable here. |

In Walk, use WASD or the arrow keys to move, Shift to run, and Space for a long jump.
Press F or use the car button to summon a vehicle, get in, or get out. Touch controls provide
the same travel actions. The renderer follows the map's light or dark theme. Five keepsakes are hidden
around the island (the counter by the sound button); the sound (breeze, cicadas, the sea, footsteps)
is made in the browser and stays off until you turn it on.

Plus a **provider finder** ("is there a company here that can do this for me?"), search, deep
links for everything, and a strict, provenance-first data contract.

It is the generalized version of two production maps: the
[Embarc Member Map](https://community.embarccollective.com) and the
[Ambition Accelerated Community Map](https://ambition.embarccollective.com).

## The Portfolio Map Network and the Nexus

Every map built with this framework is one world in a shared network. **The one requirement**:
your map links to **the Nexus**, a 3D world where every map in the network is a world of its own,
so anyone visiting one map can see and travel to all the others.

Linking is open to every map; **appearing in the Nexus takes a short handshake**, so not just
anybody can put a world there:

1. **Publish.** `npm run build` writes `/portfolio-map.json`: who you are, who publishes the map,
   your districts and a light public index of your companies, from the same data the map shows.
2. **Link.** A portal on the walk world's plaza, a **Nexus** button in the top bar, a section in the
   About panel, and a meta tag in `index.html`. `npm run build` fails if they are gone.
3. **Prove.** Your organization vouches for the map: the map lives on your own domain (nothing to
   do), or your homepage links to it, or a DNS TXT record says so.
4. **Review.** A maintainer approves the one-file pull request that adds you to
   [`registry/instances/`](./registry).

`npm run join-check -- https://your-map` checks the first three against your live map before you
apply. The Nexus ([`nexus/`](./nexus), live at **https://wearenexus.xyz**) is also
this project's landing page. Every time it is built it re-checks every map, and shows each one that
passes as a world you can fly to, search across and step into; a map that stops linking or loses
its proof drops out. [NETWORK.md](./NETWORK.md) has the terms and the review criteria;
[docs/network.md](./docs/network.md) the protocol.

**Rather have it built for you?** The maintainers offer a paid white-glove service: setup, a
custom walk world, and ongoing care. See "Services" on the
[landing page](https://wearenexus.xyz/#built-for-you), or request a setup by email at
[jeremy@embarccollective.com](mailto:jeremy@embarccollective.com?subject=Setup%20request).

## Start your own map

Node 22.18 or later.

```bash
npx degit fritzhand/portfolio-map-3d my-map      # or "Use this template" on GitHub
cd my-map
npm install
npm run dev                                      # http://localhost:5173, with the example data
```

The example (`site/`) is a fictional organization, **Example Collective**, so you can see every
feature before you change anything. It is also live, beside the Nexus:
https://wearenexus.xyz/example/. Then:

```bash
npm run new-site -- --name "Acme Ventures" --id acme-ventures --url https://map.acme.vc
# edit the districts in site/taxonomy.json
npm run import -- companies.csv --source-title "Acme portfolio" --source-url https://acme.vc/portfolio
# drop logos into site/logos/<slug>.png|svg|webp|jpg and your logo into site/brand/
npm run dev
npm run build                                    # validates, type-checks, builds dist/, checks the bundle
```

Deploy `dist/` to any static host ([docs/deploying.md](./docs/deploying.md)), then add
`registry/instances/<your-id>.json` by pull request to join the network
([docs/network.md](./docs/network.md#joining)).

**Your content lives in `site/`, and only there.** Everything else is the framework, so you can
pull framework updates (`git pull upstream main`) without conflicts.

| | |
|---|---|
| [docs/getting-started.md](./docs/getting-started.md) | From the example to your own map, step by step |
| [docs/configuration.md](./docs/configuration.md) | `site/site.json`, the taxonomy, labels, theme, logos |
| [docs/data-contract.md](./docs/data-contract.md) | The records, their sources, what never ships |
| [docs/importing.md](./docs/importing.md) | Companies from a spreadsheet |
| [docs/network.md](./docs/network.md) | The manifest, the registry, the Nexus, joining |
| [docs/deploying.md](./docs/deploying.md) | Vercel, Netlify, GitHub Pages, any static host |
| [docs/live-explorers.md](./docs/live-explorers.md) | Multiplayer in the walk world (optional, Supabase Realtime) |
| [docs/mcp.md](./docs/mcp.md) | Build a map with an AI assistant (MCP), and the sites' tools for agents (WebMCP) |
| [docs/architecture.md](./docs/architecture.md) | How the code is laid out, and why |

## What's in the repository

```
site/              YOUR map: site.json, taxonomy.json, data/, logos/, people/, brand/  (the example)
src/               the map app (Vite + React 19 + TypeScript + three.js / React Three Fiber)
scripts/           validate-site, manifest, import-csv, new-site, check-bundle, build-network, check-registry
federation/        the network protocol: types, links, manifest and registry checks (shared by all); agent tools
mcp/               the builder: a local MCP server that builds site/ through the content contract
nexus/             the Nexus: the landing page and the shared world (deployed by the network)
registry/          one JSON file per map in the network
schema/            site.schema.json, for editor autocompletion
docs/              guides
```

## Commands

```bash
npm run dev            # the map, with the example or your site/
npm run validate       # the content contract on site/
npm test               # unit tests: data contract, layouts, provider matching, live explorers, the protocol
npm run build          # validate + type-check + build dist/ + check the bundle (keys, provenance, the Nexus link)
npm run manifest       # print the network manifest your build will publish
npm run import         # companies from a CSV (docs/importing.md)
npm run new-site       # replace the example with a blank site for your organization
npm run join-check -- https://your-map   # the linking handshake against your live map, before you apply
npm run mcp -- --list  # the builder's tools; MCP clients start node mcp/server.mjs (docs/mcp.md)
npm run registry:check # the registry's entries (CI runs it)
npm run nexus:dev      # the Nexus, locally (add ?sample for sample worlds)
npm run nexus:build    # fetch the network (scripts/build-network.mjs) and build the Nexus
```

## Principles

- **Provenance first.** Every fact keeps its source in the data (`sources`, `descriptionSource`,
  each founder's `source`); the validator fails a record without one. Nothing is invented: unknown
  stays `null` and the interface leaves it out. The live map does not display sources; the
  production build drops them from the bundle.
- **No personal contact data.** Email addresses, phone numbers and home addresses are rejected in
  every string, at import, at validation and in the network manifest.
- **Documented vs derived.** A *known connection* needs a source naming both companies. A
  *potential fit* is derived from services and industries and is always labeled as a suggestion.
- **People are not linked to companies.** The people roster has no connections, highlights or
  suggestions to companies.
- **Static and serverless.** No database, no secrets; host `dist/` anywhere. The only optional
  service is Supabase Realtime for live explorers.
- **Accessible.** Every record is reachable without 3D; keyboard and screen reader routes;
  reduced motion is honored; contrast is checked.

## License

[MIT](./LICENSE) for the framework's code. The example data in `site/` is fictional. A map's own
data (names, logos, descriptions, photos) belongs to whoever publishes it. That includes the
network snapshot the Nexus ships (`nexus/public/network.json`, `nexus/public/instances/`) and its
link-preview image (`nexus/public/og.png`): they carry the registered maps' public manifests and
logos, which their publishers own and which the MIT license does not cover.
