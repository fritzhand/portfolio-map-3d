/* The Portfolio Map Network protocol, version 1.

   Every map built on this framework is an *instance*. An instance joins the network through a
   short handshake (docs/network.md), most of which the framework does for it:

     1. Publish. It publishes a manifest at <its address>/portfolio-map.json: who it is, who
        publishes it, its districts, and a light public index of its companies (types below). The
        map's build writes it from the same data the map shows (scripts/manifest.mjs).
     2. Link. It links to the Nexus: a portal in its walk world, a link in its top bar and About
        panel, NEXUS_URL in its manifest (`nexus`) and the NEXUS_META tag in its page. That
        link is the network's one requirement (NETWORK.md).
     3. Prove. Its publisher vouches for it, in one of the ways OwnerProof lists: the map lives on
        the publisher's own domain, the publisher's homepage links to it, or a DNS record says so.
     4. Review. A maintainer approves its registry entry (registry/instances/<id>.json, by pull
        request) against the criteria in NETWORK.md.

   The Nexus (nexus/) reads the registry, fetches each manifest, checks the backlink and the
   publisher's proof, and shows every verified instance as a world in one shared 3D space. Nothing
   else can put a map there: a link to the Nexus from an unlisted site only opens the Nexus.

   This file is plain, erasable TypeScript with no imports, so the map (Vite), the Nexus (Vite)
   and the Node scripts (Node 22.18+ strips the types) all read the same constants. */

/** The protocol id every manifest carries. A breaking change makes it "portfolio-map/2". */
export const PROTOCOL = "portfolio-map/1";

export const FRAMEWORK = "portfolio-map-3d";
export const FRAMEWORK_REPO = "https://github.com/fritzhand/portfolio-map-3d";

/**
 * The Nexus: the landing page of the framework and the shared world every instance links to, at
 * wearenexus.xyz (deployed by Vercel from main, nexus/vercel.json). A base URL:
 * https, a path allowed, no trailing slash. Change it here, in one place: every instance built
 * from a copy of this file links to the address it was built with. A move keeps the old address
 * in ACCEPTED_NEXUS_URLS (and a redirect), so older instances stay verified.
 */
export const NEXUS_URL = "https://wearenexus.xyz";

/**
 * Nexus addresses a manifest's `nexus` field may name and still count as linking back: the Nexus
 * and its www form (which redirects to it).
 */
export const ACCEPTED_NEXUS_URLS: readonly string[] = [NEXUS_URL, "https://www.wearenexus.xyz"];

/** @deprecated Use NEXUS_URL (the Nexus may live under a path). Kept while nexus/ moves over. */
export const NEXUS_ORIGIN = NEXUS_URL;

/** The manifest's file name, served next to the map's index.html. */
export const MANIFEST_FILE = "portfolio-map.json";

/** The meta tag the map's index.html carries, so a crawler sees the backlink without running the app. */
export const NEXUS_META = "portfolio-map:nexus";

/** Ids: lowercase letters, digits and single hyphens, 2 to 48 characters. Used for instance ids and slugs. */
export const ID_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,47}$/;
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * The network's maintainers (GitHub handles): who reviews registry entries (.github/CODEOWNERS)
 * and may confirm a publisher by other means (RegistryEntry.ownerConfirmedBy).
 */
export const MAINTAINERS: readonly string[] = ["fritzhand"];

/**
 * DNS proof of ownership: a TXT record at `_portfolio-map.<publisher's domain>` whose value is
 * ownerTxtValue(id). For organizations whose map lives on another domain and whose homepage
 * cannot link to it.
 */
export const OWNER_DNS_LABEL = "_portfolio-map";
export function ownerTxtValue(id: string): string {
  return `portfolio-map-verification=${id}`;
}

/**
 * How a map's publisher vouched for it, strongest first:
 * - "domain": the map lives on the publisher's website's domain or a subdomain of it;
 * - "dns": the publisher's domain has the TXT record above;
 * - "link": the publisher's homepage links to the map;
 * - "maintainer": a maintainer confirmed it by other means (RegistryEntry.ownerConfirmedBy).
 */
export type OwnerProof = "domain" | "dns" | "link" | "maintainer";

/** Upper bounds that keep a manifest small enough for the Nexus to fetch hundreds of them. */
export const LIMITS = {
  name: 80,
  tagline: 160,
  label: 40,
  description: 400,
  keywords: 12,
  keyword: 40,
  districts: 40,
  companies: 2000,
} as const;

export interface ManifestDistrict {
  slug: string;
  label: string;
  /** "#rrggbb". */
  color: string;
  /** Companies whose primary district this is. */
  count: number;
}

/** One company in the public index: enough for the Nexus to show and search it, and link to it. */
export interface ManifestCompany {
  slug: string;
  name: string;
  /** A district slug from `districts`. */
  district: string;
  /** Verbatim, as the map shows it; null when the instance shares none (network.shareDescriptions: false). */
  description: string | null;
  /** https only; null when unknown. */
  website: string | null;
  keywords: string[];
}

export interface Manifest {
  protocol: typeof PROTOCOL;
  /** The instance's network id (registry/instances/<id>.json). */
  id: string;
  /** What the map shows: an organization, a program, a cohort ("Ambition Accelerated"). */
  name: string;
  /**
   * Who publishes the map, and their own website: the Nexus checks that this website vouches for
   * the map (OwnerProof). Often the same organization as `name`; a program's map may be published
   * by its platform partner.
   */
  publisher: { name: string; website: string | null };
  /** The map's public address (https, no query or hash), e.g. "https://map.example.org". */
  url: string;
  tagline: string | null;
  /** Absolute https URL of a logo the Nexus may show for this instance, or null. */
  logo: string | null;
  /** The instance's accent ("#rrggbb"): its world's color in the Nexus. */
  accent: string;
  /** The Nexus this instance links to (its base URL). Must be one of ACCEPTED_NEXUS_URLS to be verified. */
  nexus: string;
  framework: { name: string; version: string };
  /** What the instance calls things, so the Nexus speaks its language ("12 startups in 4 tracks"). */
  labels: { company: string; companies: string; district: string; districts: string; people: string | null };
  counts: { companies: number; people: number; districts: number };
  districts: ManifestDistrict[];
  companies: ManifestCompany[];
  /** Build date, YYYY-MM-DD. */
  updated: string;
}

/** registry/instances/<id>.json: one file per instance, added by pull request. */
export interface RegistryEntry {
  id: string;
  name: string;
  /** The map's public address; its manifest is at manifestUrl(url). */
  url: string;
  /** The day the entry was merged, YYYY-MM-DD. */
  joined: string;
  /** GitHub handle of whoever maintains the instance (no email addresses in the registry). */
  maintainer: string;
  /**
   * Set only by a maintainer (one of MAINTAINERS), when they confirmed the publisher by other means
   * because none of the automatic proofs fits: their GitHub handle.
   */
  ownerConfirmedBy?: string;
}

/**
 * verified: shown as a world. unreachable: could not be read (its last good world stays, marked).
 * invalid: the manifest breaks the protocol or names another id or address. no-backlink: it does
 * not link to the Nexus. unconfirmed: its publisher has not vouched for it (OwnerProof).
 */
export type InstanceStatus = "verified" | "unreachable" | "invalid" | "no-backlink" | "unconfirmed";

/** One instance as the Nexus knows it (nexus/public/network.json). */
export interface NetworkInstance {
  entry: RegistryEntry;
  status: InstanceStatus;
  /** When the manifest was last fetched successfully, YYYY-MM-DD, or null if never. */
  checked: string | null;
  /** The last good manifest, or null if none was ever read. */
  manifest: Manifest | null;
  /** The instance's logo, copied into the Nexus at build time (a path under the Nexus, e.g. "instances/acme.png"), or null. */
  logoFile: string | null;
  /** How its publisher vouched for it (verified instances), or null. */
  proof: OwnerProof | null;
  /** Why the instance is not verified, in plain words. Empty when verified. */
  problems: string[];
}

export interface NetworkSnapshot {
  protocol: typeof PROTOCOL;
  /** When the snapshot was built, YYYY-MM-DD. */
  generated: string;
  instances: NetworkInstance[];
}

/** A host without a leading "www." ("www.acme.vc" -> "acme.vc"), lowercase. */
export function bareHost(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}

/**
 * Hosting domains shared by many owners: none of them can vouch for a map, because whoever names
 * one as their website would vouch for every site under it ("https://github.io" for every
 * *.github.io map). A site on one of them (acme.github.io) is fine: it is its owner's host.
 */
export const SHARED_HOSTS: readonly string[] = [
  "github.io", "gitlab.io", "vercel.app", "netlify.app", "pages.dev", "web.app", "firebaseapp.com", "herokuapp.com", "onrender.com",
  "fly.dev", "railway.app", "surge.sh", "glitch.me", "azurestaticapps.net", "azurewebsites.net", "cloudfront.net", "amazonaws.com",
  "appspot.com", "blogspot.com", "wordpress.com", "wixsite.com", "squarespace.com", "webflow.io", "framer.website", "carrd.co",
];

/** Can this website vouch for a map? Not when it is a shared hosting domain itself (SHARED_HOSTS). */
export function canVouch(website: string | null): website is string {
  if (!website) return false;
  try {
    return !SHARED_HOSTS.includes(bareHost(website));
  } catch {
    return false;
  }
}

/**
 * Does the map at `mapUrl` live on the publisher's own domain (`website`'s host, or a subdomain of
 * it)? "https://map.acme.vc" and "https://acme.vc/map" are on "https://www.acme.vc". A shared
 * hosting domain (SHARED_HOSTS) is nobody's own.
 */
export function onPublisherDomain(mapUrl: string, website: string | null): boolean {
  if (!canVouch(website)) return false;
  const site = bareHost(website);
  const map = bareHost(mapUrl);
  return map === site || map.endsWith(`.${site}`);
}

/**
 * Does this page (the publisher's homepage) link to the map? A link is an href naming the map's
 * address (its host, and its path when it has one), with or without "www." and a trailing slash.
 */
export function pageLinksTo(html: string, mapUrl: string): boolean {
  const u = new URL(mapUrl);
  const target = `${bareHost(mapUrl)}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  for (const m of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const h = new URL(m[1]);
      if (h.protocol !== "https:" && h.protocol !== "http:") continue;
      const got = `${bareHost(h.toString())}${h.pathname.replace(/\/+$/, "")}`.toLowerCase();
      if (got === target || got.startsWith(`${target}/`)) return true;
    } catch {
      /* a relative link points at the publisher's own site, not the map */
    }
  }
  return false;
}

/** The manifest's address for a map at `url`. */
export function manifestUrl(url: string): string {
  return new URL(MANIFEST_FILE, url.endsWith("/") ? url : `${url}/`).toString();
}

/** A map's address without a trailing slash, query or hash ("https://x.org/map/?a#b" -> "https://x.org/map"). */
export function normalizeUrl(url: string): string {
  const u = new URL(url);
  return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
}

/**
 * The link from an instance into the Nexus. `from` is the instance's id: the Nexus opens its world
 * view turned to that instance, so the visitor arrives where they came from. `via` says what they
 * used (the walk world's portal or a link), for the arrival message only; nothing is stored.
 */
export function nexusHref(from: string | null, via: "portal" | "link" = "link", base: string = NEXUS_URL): string {
  // Ids match ID_PATTERN, so they need no escaping.
  const params = ["world"];
  if (from && ID_PATTERN.test(from)) params.push(`from=${from}`);
  if (via === "portal") params.push("via=portal");
  return `${normalizeUrl(base)}/?${params.join("&")}`;
}

/** The link from the Nexus into an instance (and optionally to one of its companies). */
export function instanceHref(url: string, company?: string | null): string {
  const u = new URL(url.endsWith("/") ? url : `${url}/`);
  u.searchParams.set("from", "nexus");
  if (company && ID_PATTERN.test(company)) u.searchParams.set("company", company);
  return u.toString();
}

/**
 * An address on the Nexus's own site (the Nexus, or a map published with it, like the example map),
 * as seen from a deployment of that site somewhere else (a preview, or a local build): the same path
 * on `here`, so the deployment links to itself rather than to the live site. Any other address, and
 * every address seen from the Nexus's own site, comes back as it is.
 */
export function onThisDeployment(url: string, here: string): string {
  const u = new URL(url);
  const h = new URL(here);
  if (!ACCEPTED_NEXUS_URLS.includes(u.origin) || ACCEPTED_NEXUS_URLS.includes(h.origin)) return url;
  return `${h.origin}${u.pathname}${u.search}${u.hash}`;
}

/** Did the visitor arrive from the Nexus? (`?from=nexus` on an instance's URL.) */
export function cameFromNexus(search: string): boolean {
  return new URLSearchParams(search).get("from") === "nexus";
}

/** The instance id in a Nexus URL's `?from=`, or null when absent or malformed. */
export function arrivalFrom(search: string): string | null {
  const from = new URLSearchParams(search).get("from");
  return from && ID_PATTERN.test(from) ? from : null;
}
