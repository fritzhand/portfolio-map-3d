# Configuration

A map is configured by the files in `site/`, never by editing `src/`. `npm run validate` (and every
build) checks them.

## `site/site.json`

| Field | What it does |
|---|---|
| `network.id` | Your map's id in the network: lowercase letters, digits and hyphens. Your registry file is `registry/instances/<id>.json`. |
| `network.shareDescriptions` | `true` shares company descriptions in your public manifest, so the Nexus's search across the network finds them. `false` shares names, districts, websites and keywords only. |
| `org.name` | Who publishes the map. Shown in the top bar (when there is no logo), the About panel, the walk world's hub sign. |
| `org.website` | Your website (https); the top bar's logo links there. The network checks that it vouches for your map: deploy the map on this domain or a subdomain, or link to the map from its homepage, or add a DNS record ([network.md](./network.md#the-publishers-proof)). |
| `org.logo`, `org.logoOnDark` | Files in `site/brand/` (`"brand/logo.svg"`). The light-ground version also goes on the globe's core and the hub's rooftop sign; the dark one is for the dark theme. `null` shows your name in type. |
| `map.title` | The page title and link-preview title ("Acme Ventures Map"). |
| `map.tagline` | One line (160 characters at most) the Nexus shows under your name. |
| `map.description` | For search engines and link previews. |
| `map.url` | The https address you deploy at, without a trailing slash. Link previews, the manifest and the registry use it. |
| `map.directoryUrl` | Where your full list lives without JavaScript, for the noscript note; or `null`. |
| `map.notice` | A one-line notice above the list and in the About panel ("Example data"), or `null`. |
| `labels.*` | What the interface calls things: `company`/`companies` ("startup"/"startups", "member"/"members"), `district`/`districts` ("track", "sector", "program"), `person`/`people` ("coach", "mentor", "advisor"), and `hub`, the name on the walk world's hub building. Lowercase; the interface capitalizes where needed. |
| `theme.accent` | Links, focus rings, the globe's documented connections, the hub's band. 4.5:1 or more on white. |
| `theme.cta`, `theme.ctaText` | The call-to-action fill (Find a provider) and its text: 4.5:1 or more against each other. |
| `theme.ink` | Your dark ink: label text, the dark plate for white-on-transparent logos. 7:1 or more on white. |
| `walk.world` | The walk world: `"campus"` (the default when `walk` is left out) or `"classic"` ([below](#the-walk-world)). |
| `live.enabled`, `live.channel` | Live explorers in the classic walk world ([live-explorers.md](./live-explorers.md)). |

The validator checks every contrast it names and explains how to fix one that fails.

## `site/taxonomy.json`

**Districts** are the groups everything else is built from: a region of the globe each, a
neighborhood of the walk world each, a filter in the list. Keep them to about 4–15.

```json
{ "slug": "health", "label": "Health & Life Sciences", "short": "Health", "color": "#e34948", "icon": "heart-pulse", "industries": ["healthcare", "life-sciences"] }
```

- `short`: what the globe's region labels and the walk world's arches show.
- `color`: districts are told apart by color, an icon and a label (color is never the only cue).
  Pick colors that work as a set: run `validate_palette.js` (the dataviz skill bundled with Claude
  Code) on them in this order with the first repeated at the end, and record the result in
  `_palette`.
- `icon`: one of the names in `DISTRICT_ICONS` in `src/components/bits.tsx` (lucide icons:
  `heart-pulse`, `sparkles`, `leaf`, `landmark`, `cpu`, `shopping-bag`, `rocket`, `globe`,
  `building-2`, …). The validator lists them if you pick one that isn't there.
- `industries`: which `industriesServed` values the district's companies belong to as customers.
  The provider finder matches these against the industries other companies serve.
- `note` (optional): a note for editors on what belongs here; not shipped.
- The slug `people` is reserved (the walk world's people area).

**Services**, **industries served** and **connection kinds** are the vocabularies for the provider
finder and for documented connections. The example's lists are a general-purpose starting set.

## Logos, headshots and brand files

| Folder | Files | Notes |
|---|---|---|
| `site/logos/` | `<company-slug>.svg|png|webp|jpg` | Measured in the browser: transparent margins trimmed; a white-on-transparent logo gets an ink plate; an opaque logo keeps its own background. Override a wrong guess with `"logoPlate": "light" | "dark" | "self"` on the company. Give SVGs `width` and `height` attributes. |
| `site/people/` | `<person-slug>.webp|png|jpg` | Square headshots, about 320 px. No photo: initials, never a stock face. |
| `site/brand/` | your logo files, `favicon.svg|png`, `og.png` | Copied to `/brand/` under their own names. |

A file whose name matches no slug fails validation (it would ship unused).

## The walk world

A map has one of two walk worlds, chosen in `site.json`:

```json
"walk": { "world": "campus" }
```

Both come with the framework, and a visit loads only the chosen one. They read the same data
(districts, companies, people, labels, theme) and keep the same rules: districts are groupings,
never addresses, and nothing in either world claims to show where a company is. Both have the
portal to the Nexus on the plaza. In development, `?world=classic` or `?world=campus` on the walk
view tries the other one without changing `site.json`.

| | `campus` (default) | `classic` |
|---|---|---|
| Built from | Blender build scripts ([`art/`](../art/README.md)) exported as compressed models, placed by `src/island` | TypeScript only (`src/views/walk`): no model files, no Blender |
| To restyle | Edit the Blender scripts, rebuild with `npm run art` (Blender 5), check them side by side with `art/preview.py` | Edit the TypeScript |
| Effort | More: the richer look takes Blender, time, and more tokens when an AI assistant does it | Less: code edits only, fewer steps and tokens |
| Live explorers | Not yet | Yes ([live-explorers.md](./live-explorers.md)) |

### The campus

An island laid out as a campus. The organization's monument stands at the middle of the plaza with
its name on a plaque, and the portal to the Nexus beside it. A road runs out to each district,
through a gateway with the district's name; a pylon behind it carries the name across the island.
Every district has a landmark at its heart and a screen totem for each company, with the company's
logo on both screens; the people area has a pavilion and a post for each person.

A district's landmark follows its theme: `greenhouse`, `garden`, `workshop`, `lab`, `market`,
`bank`, `harbor`, `studio` or `school`. Set one in `site/taxonomy.json`:

```json
{ "slug": "climate", "label": "Climate & Energy", "short": "Climate", "color": "#7a9a01", "icon": "leaf", "theme": "greenhouse", "industries": [] }
```

A district without one gets the theme its icon suggests (`leaf` a greenhouse, `cpu` a workshop,
`landmark` a bank...; the list is in `src/island/themes.json`), or one its neighbors are not using.
The classic world ignores `theme`.

Between the districts stand homes, parks and courts, a shuttle loops the ring street, and round the
rim stand a marina you can walk out on, a beacon, a wind turbine, a vertical farm, a solar field, a
data center and an observatory. All of it is decoration: no data reads it and nothing in it points
at a company. The campus follows the site's theme: daylight in the light theme, the campus at night
in the dark one.

### The classic world

A village on an island, built entirely in code. The hub at the center of the plaza is a pavilion
that carries your logo on a rooftop sign and `labels.hub` over its entrance; the portal to the
Nexus stands beside it. To model your own building, replace `src/data/hub.ts` and
`src/views/walk/hub.ts` together, keeping their exports (the collision, camera and minimap code
reads them).

A ring street with houses runs around the plaza, and the districts stand on a ring beyond it, each
sized by its company count and crowned by a gazebo in its color, with a drop pin and logo badge for
every company. On the coast and in the hills stand a lighthouse, a pier, beaches, a windmill, a
farm, a campsite and a water tower, and five keepsakes hide beside them for visitors to find. The
sound (a breeze, cicadas, the sea, footsteps) is synthesized in the browser. Each explorer gets a
generated hat and gear ("New look" draws another), can summon a car, and with live explorers on see everyone else walking the map. An
afternoon in the light theme, moonlight in the dark one.

