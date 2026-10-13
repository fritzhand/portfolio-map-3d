/* The data contract. Mirrors site/data/companies.json, site/data/people.json and
   site/taxonomy.json, which scripts/validate-site.mjs enforces before every build
   (docs/data-contract.md). Every record keeps its sources in the data; the live map does not
   display them, and the production build drops them (publicData() in vite.config.ts). */

/** A district slug from site/taxonomy.json. Districts group companies; they are never addresses. */
export type DistrictSlug = string;

export type BusinessModel = "B2B" | "B2C" | "B2B2C" | "B2G" | "Nonprofit" | "Unknown";

/**
 * Where a fact comes from. A public page has a `url`. Two kinds need none:
 * "company-supplied" (the company's own words, sent or approved by it: who and how in `title`,
 * when in `retrieved`) and "org-records" (the organization's own records about its companies,
 * which it chooses to publish: say which in `title`).
 */
export interface Source {
  url?: string;
  title: string;
  /** YYYY-MM-DD. */
  retrieved?: string;
  kind?: "company-supplied" | "org-records";
}

/** A founder or leader of a company. */
export interface CompanyPerson {
  name: string;
  title: string;
  source: Source;
  /** A public LinkedIn profile URL, only when a source gives it. */
  linkedin?: string;
}

export interface Connection {
  /** The other company's slug. */
  with: string;
  /** A connection kind from site/taxonomy.json. */
  kind: string;
  summary: string;
  /** A documented connection needs a source naming both companies. */
  source: Source;
}

/** How a logo is drawn on its badge plate (measured in the browser by src/three/logoInfo.ts unless the company sets `logoPlate`). */
export interface LogoInfo {
  w: number;
  h: number;
  /** "light": a white plate. "dark": an ink plate (light-on-transparent logos). "self": an opaque logo, on its own background. */
  plate: "light" | "dark" | "self";
  /** The plate color behind a "self" logo (its corner color). */
  bg: string | null;
  /** The part of the image the artwork covers (empty margins trimmed), in image pixels. */
  crop: { x: number; y: number; w: number; h: number };
}

export interface Company {
  slug: string;
  name: string;
  district: DistrictSlug;
  secondaryDistricts: DistrictSlug[];
  /** Tags as the organization publishes them (its own directory's labels), verbatim. */
  tags: string[];
  website: string | null;
  /** The logo's URL (from site/logos/<slug>.<svg|png|webp|jpg>), filled in by the catalog; null when there is none. */
  logo: string | null;
  /** Overrides the measured plate when the measurement picks the wrong one; usually absent. */
  logoPlate?: LogoInfo["plate"] | null;
  /** One verbatim description; null when no source gives one. Never written by the map's editors. */
  description: string | null;
  descriptionSource: Source | null;
  /** Where the company says it is based ("Austin, TX"), verbatim; null when unknown. */
  location: string | null;
  linkedin: string | null;
  founders: CompanyPerson[];
  leaders: CompanyPerson[];
  /** Services the company sells to other companies (site/taxonomy.json "services"): the provider finder's input. */
  services: string[];
  /** Industries it sells to (site/taxonomy.json "industriesServed"). */
  servesIndustries: string[];
  businessModel: BusinessModel;
  keywords: string[];
  /** One sentence on what it offers other companies, from its own words; null when none. */
  providerPitch: string | null;
  connections: Connection[];
  sources: Source[];
}

export interface District {
  slug: DistrictSlug;
  label: string;
  /** The short name globe regions and walk-world signs show. */
  short: string;
  /** "#rrggbb", checked with the other districts as a categorical set (docs/configuration.md). */
  color: string;
  /** A lucide icon name from DISTRICT_ICONS (src/components/bits.tsx). */
  icon: string;
  /** Industries (site/taxonomy.json "industriesServed") its companies belong to as customers: the provider finder's other input. */
  industries: string[];
  /** Plain-language note on what belongs here, for editors; optional. */
  note?: string;
  /** The landmark at its heart in the walk world (src/island/themes.json); optional, its icon suggests one. */
  theme?: string;
}

export interface Vocab {
  slug: string;
  label: string;
}

/**
 * A person on the organization's own roster (coaches, mentors, advisors: site.json labels.people).
 * The record describes the person only: it has no company, district or industry field, because
 * the map shows no link between this roster and the companies (docs/data-contract.md).
 */
export interface Person {
  slug: string;
  /** As the source spells it. */
  name: string;
  /** Their title or specialty, e.g. "Fundraising Strategist". */
  title: string;
  /** A short summary; null when there is none. */
  summary: string | null;
  /** The full bio, one string per paragraph; may be empty. */
  bio: string[];
  /** The headshot's URL (from site/people/<slug>.<webp|jpg|png>), filled in by the catalog; null draws initials, never a stock face. */
  headshot: string | null;
  linkedin: string | null;
  /** Service slugs (site/taxonomy.json "services") their own text supports; often empty. */
  focusAreas: string[];
  sources: Source[];
}
