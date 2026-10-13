# The island's art

Every 3D asset in the campus walk world (`"walk": { "world": "campus" }`, the default) is built
here, from code, with Blender running headless. The classic world needs none of this: it is built
in TypeScript (`src/views/walk`). The
`.bin` files the engine loads (`public/island/geometries/`) are generated from these sources and
committed, so building a map does not need Blender.

```bash
npm run art                        # build every asset into public/island/geometries/
npm run art -- totem gateway       # build some of them
blender -b --factory-startup --python-exit-code 1 --python art/preview.py -- sheet           # art/out/sheet.png
blender -b --factory-startup --python-exit-code 1 --python art/preview.py -- sheet --night   # the dark theme
```

`BLENDER=/path/to/blender` picks a Blender other than the one on the `PATH` (5.x).

The walker is the one asset not built from parts: `npm run art:walker` (`scripts/build-walker.mjs`)
redraws the skinned figure in `source/` with the palette's rows and adds the headset from
`assets/walker.py`, keeping the figure's skeleton and clips.

Moving parts are assets of their own with their origin at their pivot (the turbine's rotor, the
observatory's dome, the marina's launches); the engine turns them (`src/island/pieces/models.ts`).

## How an asset is made

- `kit.py` builds an asset from parts: `box` (with rounded edges), `cyl`, `ball`, `plate`, `slab`,
  `bar`, `ring`. Units are world units: the walker is 1.55 tall. The origin is the middle of the
  footprint on the ground; the front faces -Y in Blender (+Z in the game).
- Every face names a palette ramp from `src/island/palette.json` (`color="white"`), or an accent slot
  (`ACCENT`, `ACCENT_GLOW`, `ACCENT_DEEP`, `ACCENT_TINT`) that takes the color of the district the
  asset stands in. `flag=GLOW` draws a face unlit (light strips, lamps); `flag` between 0 and 1 is how
  much a face sways in the wind (foliage).
- `anchor()` names a spot the game dresses at runtime: a screen for a company's logo, a board for a
  district's name.
- Each module in `assets/` lists its builders in `ASSETS`. Randomness is seeded per asset, so a build
  is the same every time.

## The look

A daylight tech campus, clean and minimal: white bodies with rounded edges, glass, graphite screens,
thin light lines in the district's color, soft campus trees. The game shades every face by reading its
palette row at the sun's angle (a shade band, a body, a narrow highlight), so assets need no textures.
In the dark theme the same rows switch to their night colors and glow faces stay lit.
