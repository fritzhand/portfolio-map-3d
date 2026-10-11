# The walk world

The walk world is an island built from your data: your hub on a central plaza, a village around it,
one neighborhood per district on a ring with a pin for every company, roads out to them, and beyond
them hills rolling down to a beach, with set pieces to wander to. Nothing in it is a model, texture
or sound file: every building, prop and animal is made of painted, faceted shapes in code, the sky
and sea are shaders, and the sound is synthesized. So it costs nothing to host, looks the same on
every visit, and changes with your data.

This guide covers what you can switch in `site/site.json`, how the island is laid out, and how to
add your own pieces.

## Turning parts on and off

Every optional part is on unless `site/site.json` turns it off:

```json
"walk": {
  "village": true,
  "setPieces": ["lighthouse", "pier", "beach", "windmill", "orchard"],
  "keepsakes": true,
  "wildlife": false,
  "sound": true
}
```

| Field | What it does |
|---|---|
| `village` | The houses, street lamps, wire and bunting around the plaza, with the plaza's fountain, market stalls, ice-cream cart, kiosk and bike rack. `false` leaves the plaza and the roads. |
| `setPieces` | The set pieces on the coast and the hills: `true` for every kind, `false` for none, or a list of the kinds to use (below). |
| `keepsakes` | Keepsakes hidden by the set pieces for visitors to find, and their counter in the top bar. What a visitor finds stays in their browser. |
| `wildlife` | Gulls, butterflies, motes of light, a hot-air balloon and a cat. |
| `sound` | The sound button: a breeze, insects by day and crickets by moonlight, the sea near the coast, footsteps. Off until a visitor turns it on. |

The hub, the districts and their pins, the roads, the fingerposts and the Walking times board, and
the portal to the Nexus are always there. The builder (`update_site`, [mcp.md](./mcp.md)) changes
these fields too.

**The set-piece kinds.** On the coast: `lighthouse`, `pier` (with a rowboat and a sailboat),
`beach` (parasols and a sandcastle), `huts` (beach huts and a lifeguard tower), `boathouse`. Inland,
on the hills: `windmill`, `farm`, `camp`, `tower` (a water tower), `orchard`, `observatory`,
`greenhouse`. See every one at `/?kit`.

## Seeing the models: the kit gallery

Open your map with `?kit` (`http://localhost:5173/?kit` in development) to see every model the world
is built from, one at a time on a turntable, lit the way the island lights it, in the light or the
dark theme. Each names the file and function that builds it; `?kit=greenhouse` opens one. Change a
model in its file and the gallery shows the change at once.

In development, `?view=walk&at=x,z,heading,distance` starts the walker anywhere on the island (world
units; heading in radians, 0 facing +z) to look at a corner of it in place.

## How the island is laid out

Everything is placed by pure functions of your data, each tested, so the island is the same on every
visit and a new company or district reshapes it without anyone placing anything:

| What | Where it comes from |
|---|---|
| The plaza, the ring of districts, the roads, the spawn | `layoutWorld()` in `src/data/layout.ts`: each district a disc sized by its company count, a pin per company on a sunflower spiral |
| The ground | `src/views/walk/terrain.ts`: flat under the plaza, village, roads and districts; hills between; a level, sandy cove at the coast in each wedge between districts |
| The houses | `lotsFor()` in `village.ts`: around the ring street, leaving the road mouths open |
| The plaza's props | `plazaProps()` in `village.ts`: each takes the first of its spots that is clear of the building, the roads, the walks from the spawn and everything else on the plaza |
| The set pieces | `anchorsFor()` in `scenery.ts`: one on the coast and one in the hills in each wedge between districts, in the order of `PIECES` (each kind once, then the kinds that may repeat, by turns) |
| The keepsakes | `findSpots()` in `finds.ts`: each beside its own set piece, or the hint says where it really is |
| The signs | `fingerposts()` and `directoryFor()` in `wayfinding.ts`: a fingerpost where each road leaves the plaza, the Walking times board ahead of the arrival |

## The kit

`src/views/walk/kit.ts` has the shapes everything is made of: `box`, `cyl`, `ball`, `pyramid`,
`tri`, `bar` (a beam between two points), `gable` (a roof), `solarPanels`, `windowAt`, `hull` (a
boat), `inside` (a part seen from within), and `tone`/`blend` for colors. Each returns a *part*: a
small geometry with its color painted into its vertices. A model is a list of parts in its own
frame: y up, standing on y = 0, its front toward +z. The world merges a whole area's parts into a
few meshes, so a hundred houses cost a few draw calls.

Colors come from the scene palette (`p.wallCream`, `p.roofCoral`, `p.window`, …), which reads the
`--scene-*` tokens in `src/styles/tokens.css` (the afternoon) and `src/views/walk/scene-theme.css`
(moonlight). Use the palette, never a color literal, and a model works in both themes: windows the
palette makes dark by day glow at night.

## Adding a set piece

1. In `src/views/walk/pieces.ts`, write a function that returns a `PieceModel`:

   ```ts
   /** A bandstand: a round stone platform, six posts and a cone roof. */
   function bandstand(p: ScenePalette): PieceModel {
     const parts: Part[] = [cyl(3.2, 3.4, 0.6, 12, 0, 0, 0, p.wallStone)];
     for (let i = 0; i < 6; i++) {
       const a = (i / 6) * Math.PI * 2;
       parts.push(cyl(0.1, 0.1, 2.6, 6, Math.cos(a) * 2.8, 0.6, Math.sin(a) * 2.8, p.wallCream));
     }
     parts.push(cyl(0, 3.6, 1.4, 12, 0, 3.2, 0, p.roofCoral));
     return { parts, colliders: [{ x: 0, z: 0, r: 3.4, h: 4.6 }], blockers: [{ x: 0, z: 0, r: 3.6, h: 4.6 }] };
   }
   ```

2. Add its kind to `PieceKind` and an entry to `PIECES`: `coast` (on the shore facing the sea, or
   inland facing the plaza), `once` (a landmark: one at most), `ring` (inland: how far outside or
   inside the ring of districts), `title` and `build`. Its place in `PIECES` is its place in the
   order the island hands kinds out.
3. Add the kind to `SET_PIECE_KINDS` in `scripts/validate-site.mjs` and to the `setPieces` list in
   `schema/site.schema.json`, so `site.json` may name it (a test fails until the lists match).
4. Look at it at `/?kit=<kind>`, then run `npm test`: every model is checked (its parts merge, what
   the walker bumps into is where something is drawn, a coastal piece leaves the beach in front of
   it walkable).

What a `PieceModel` can hold, all in the piece's frame:

| Field | For |
|---|---|
| `parts` | Lit parts, standing level where the piece stands. |
| `glass` | Lamp glass: frosted by day, glowing by moonlight. |
| `panes` | Glazing you can see through. |
| `lit` | Unlit parts in their own colors (flames). |
| `loose` | Small things that each settle on the ground where they are (trees, crates, tents), for pieces on a hillside. |
| `turn` | Parts that turn slowly about a vertical axis (`y`) or the axis the piece faces (`z`): a windmill's sails, an observatory's dome. Still under reduced motion. |
| `afloat` | Boats that ride the swell at sea level. |
| `colliders`, `boxes` | What the walker bumps into: circles, and boxes that turn with the piece. Heights are above the piece's ground. |
| `blockers` | Circles the follow camera keeps its view over. |

A coastal piece stands in its cove on level sand at y = 0; an inland one on the hills, so give a
rigid building a footing that reaches below y = 0 (the windmill's, the greenhouse's) and make small
things `loose`. Trees and rocks are kept off the ground a piece covers.

## Adding a house or a street prop

A house is a function in `houses.ts` (add its kind to `HOUSE_KINDS` and its footprint to
`HOUSE_LOT` in `village.ts`); a street prop is a function in `street.ts` that returns parts, placed
in `village.ts`. Add either to `src/views/kit/models.ts` to see it in the gallery.

## The rules

- **Procedural only.** No model, texture or sound file, nothing fetched at runtime.
- **Deterministic.** Placement is a pure function of the layout, using `seededRandom` and
  `hashString`, never `Math.random`; test it like `scenery.test.ts` and `village.test.ts` do.
- **From the palette.** Scene colors come from the `--scene-*` tokens, in both themes.
- **Cheap to draw.** Merge parts; give a moving part its own small mesh; instance what repeats
  (the lamps, the plants); keep colliders to circles and boxes.
- **Kind to every visitor.** Honor reduced motion (a turning part rests, boats keep still), and
  never make the 3D view the only way to reach something: every company and person is also in the
  list.
- **Districts are groupings, never places.** Nothing in the world claims to show where a company
  is.
