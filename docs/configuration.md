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
| `live.enabled`, `live.channel` | Live explorers in the walk world ([live-explorers.md](./live-explorers.md)). |
| `walk` (optional) | The walk world's optional parts, each on unless set to `false`: `village` (the houses and street furniture around the plaza), `setPieces` (`true`, `false` or a list of kinds, like `["lighthouse", "orchard"]`), `keepsakes`, `wildlife`, `sound`. See [walk-world.md](./walk-world.md). |

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

The hub at the center of the plaza is a generic pavilion that carries your logo on a rooftop sign
and `labels.hub` over its entrance; the portal to the Nexus stands beside it. To model your own
building, replace `src/data/hub.ts` and `src/views/walk/hub.ts` together, keeping their exports
(the collision, camera and minimap code reads them). The districts stand on a ring around the
plaza, each sized by its company count; nothing in the walk world claims to show where a company
is.

Around the plaza runs a ring street with houses on its outer side (`src/views/walk/village.ts`);
the roads to the districts cross it through gaps the houses leave open. Every district is crowned
by a gazebo in its color. Between the districts, on the coast and in the hills, stand a lighthouse,
a pier, a beach, a windmill, a farm, a campsite and a water tower (`scenery.ts`), one or two per
wedge, and five keepsakes are hidden beside them (`finds.ts`; what a visitor found stays in their
browser). All of it is decoration: no data reads it and nothing in it points at a company.
