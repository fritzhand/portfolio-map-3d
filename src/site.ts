/* The site config (site/site.json): who publishes the map and what it calls things. Every
   organization-specific word the interface shows comes from here, so a map is configured by
   editing site/, never src/ (docs/configuration.md). scripts/validate-site.mjs checks the file
   before every build. */
import siteFile from "../site/site.json";

export interface SiteConfig {
  network: {
    /** The map's id in the Portfolio Map Network (registry/instances/<id>.json). */
    id: string;
    /** Share company descriptions in the public manifest the Nexus reads (default true). */
    shareDescriptions: boolean;
  };
  org: {
    /** The organization that publishes the map, e.g. "Example Collective". */
    name: string;
    /** Its website; the top bar's logo links there. */
    website: string | null;
    /** Its logo for light grounds, a path under site/ (e.g. "brand/logo.svg"); null shows the name in type. */
    logo: string | null;
    /** Its logo for dark grounds (dark theme); falls back to `logo`. */
    logoOnDark: string | null;
  };
  map: {
    /** The map's name: the page title and the link-preview title. */
    title: string;
    /** One short line (160 characters at most) the Nexus shows under the map's name. */
    tagline: string | null;
    /** One or two sentences for search engines and link previews. */
    description: string;
    /** The public address it is deployed at (https, no trailing slash). */
    url: string;
    /** Where the full list lives without JavaScript (the noscript note); null to say nothing more. */
    directoryUrl: string | null;
    /** A one-line notice the About panel and the top of the list show (e.g. "Example data"); null for none. */
    notice: string | null;
  };
  labels: {
    company: string;
    companies: string;
    district: string;
    districts: string;
    /** One person on the roster, e.g. "coach"; ignored when there are no people. */
    person: string;
    people: string;
    /** The name on the hub building at the center of the walk world. */
    hub: string;
  };
  theme: {
    /** Links, focus rings and the second accent. */
    accent: string;
    /** Call-to-action fill, and the text on it (4.5:1 or better: the validator checks). */
    cta: string;
    ctaText: string;
    /** The brand's dark ink: text on light plates, the dark badge plate. */
    ink: string;
  };
  /** The walk world (optional; the default is the campus). */
  walk?: {
    /** "campus": the Blender-built tech campus. "classic": the code-built village, with live explorers. */
    world: WalkWorldName;
  };
  live: {
    /** Live explorers in the walk world (Supabase Realtime; the classic world only). Off unless the site turns it on. */
    enabled: boolean;
    /** The Realtime channel's base name; production joins "<channel>-v1", every other build "<channel>-preview". */
    channel: string;
  };
}

/** The two walk worlds a site can choose between (src/views/walk/WalkView.tsx). */
export type WalkWorldName = "campus" | "classic";
export const WALK_WORLDS: readonly WalkWorldName[] = ["campus", "classic"];

export const SITE = siteFile as SiteConfig;

/** The walk world this site uses. */
export const WALK_WORLD: WalkWorldName = SITE.walk?.world === "classic" ? "classic" : "campus";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What the map calls things, lowercase and capitalized ("company", "Company", "companies", "Companies"). */
export const L = {
  company: SITE.labels.company,
  Company: cap(SITE.labels.company),
  companies: SITE.labels.companies,
  Companies: cap(SITE.labels.companies),
  district: SITE.labels.district,
  District: cap(SITE.labels.district),
  districts: SITE.labels.districts,
  Districts: cap(SITE.labels.districts),
  person: SITE.labels.person,
  Person: cap(SITE.labels.person),
  people: SITE.labels.people,
  People: cap(SITE.labels.people),
  hub: SITE.labels.hub,
  org: SITE.org.name,
};

/** "1 company", "12 companies". */
export function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "a company" / "an investor". */
export function article(word: string): string {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`;
}
