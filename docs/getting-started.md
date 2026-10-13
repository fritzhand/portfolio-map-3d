# Getting started

From the example to your own map in an afternoon. You need Node 22.18 or later and a list of your
companies (a spreadsheet is fine).

## 1. Get the code and see the example

```bash
npx degit fritzhand/portfolio-map-3d my-map    # or "Use this template" on GitHub, then clone it
cd my-map
npm install
npm run dev
```

Open http://localhost:5173. The example is **Example Collective**, a fictional organization with 29
companies in six districts and six coaches. Try the globe, the walk world (the portal on the plaza
leads to the Nexus), the list and **Find a provider**.

If you started with `degit`, run `git init`; to pull framework updates later, add this repository
as a remote: `git remote add upstream https://github.com/fritzhand/portfolio-map-3d`.

## 2. Make `site/` yours

```bash
npm run new-site -- --name "Acme Ventures" --id acme-ventures --url https://map.acme.vc --website https://acme.vc --world campus
```

This rewrites `site/site.json` with your names, empties `site/data/`, and removes the example's
logos and brand files.

`--world` picks the walk world. `campus` (the default) is the tech campus whose models are built in
Blender; `classic` is the village built entirely in code, with live explorers, and the cheaper one
to restyle. You can change it later in `site.json` (`"walk": { "world": "classic" }`);
[configuration.md](./configuration.md#the-walk-world) compares them. Then, in `site/`:

1. **`site.json`**: what your map calls things (`labels`: "startups" and "tracks" instead of
   "companies" and "districts", say), your colors (`theme`), your logo (`org.logo`, a file in
   `site/brand/`). Every field is in [configuration.md](./configuration.md); your editor
   autocompletes them from `schema/site.schema.json`.
2. **`taxonomy.json`**: your districts, the groups the globe's regions and the walk world's
   neighborhoods are made of. Each has a slug, a label, a short label, a color, an icon and the
   industries its companies belong to. Keep the services and industries lists or edit them.
3. **`data/companies.json`**: your companies. Import them from a spreadsheet
   ([importing.md](./importing.md)) or write them by hand ([data-contract.md](./data-contract.md)).
   Every record keeps its source.
4. **`logos/`**: one file per company, named by its slug (`acme-robotics.png`). PNG, WebP, SVG or
   JPEG; transparent PNG or SVG look best. The map measures each logo and picks its plate (white,
   ink, or the logo's own background) in the browser. A company without a logo shows its initials.
5. **`data/people.json`** and **`people/`** (optional): coaches, mentors or advisors, with headshots
   named by slug. Leave the list empty and every people control disappears.
6. **`brand/`**: your logo (`logo.svg`, and a light version for dark mode), an optional
   `favicon.svg|png` and `og.png` (1200 × 630, the link-preview image).
7. **The walk world** (optional): it builds itself from your districts and companies. To leave a
   part out (the village, some set pieces, the keepsakes, the animals, the sound), add a `walk`
   block to `site.json`; to add a set piece of your own, see [walk-world.md](./walk-world.md).
   Open `/?kit` to see every model it is made of.

`npm run validate` tells you, in plain words, anything that breaks the contract.

## 3. Build and deploy

```bash
npm run build
```

The build validates `site/`, type-checks, builds `dist/`, and checks the bundle: no secret keys, no
provenance, and the link into the network. Deploy `dist/` anywhere static
([deploying.md](./deploying.md)). Set `map.url` in `site.json` to the address you deploy at.

## 4. Join the network

```bash
npm run join-check -- https://map.acme.vc
```

It checks the linking handshake against your live map (your manifest, the link to the Nexus, and
that your organization's website vouches for the map: deploying on your own domain or a subdomain
of it does that by itself) and prints your registry file. Add it as
`registry/instances/<your-id>.json` by pull request ([network.md](./network.md#joining)); a
maintainer reviews and merges it, and your map is a world in the Nexus.

## 5. Keep it current

- New companies: run the import again with `--merge`, or edit the JSON. `npm run validate`.
- Framework updates: `git pull upstream main`. Your changes are all in `site/`, so they don't
  conflict.
