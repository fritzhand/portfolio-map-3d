#!/usr/bin/env node
/* ============================================================
   validate-site.mjs — the content contract (docs/data-contract.md),
   run before every build (npm prebuild), by `npm run validate`, and
   by the tests. It fails the build when site/ breaks a rule:

   - site.json: every field present and well formed, colors that
     pass their contrast checks, files it names that exist;
   - taxonomy.json: districts, services, industries and connection
     kinds with unique slugs, district colors and known icons;
   - companies and people: a strict key whitelist per record,
     vocabularies, links, sources on every record, no email
     addresses, phone numbers or home addresses in any string;
   - logos and headshots: named by a slug that exists, in a format
     browsers draw;
   - the network manifest built from all of it
     (federation/validate.ts).

   Usage: node scripts/validate-site.mjs [site dir's parent]
   ============================================================ */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HEX_COLOR, ID_PATTERN, normalizeUrl } from "../federation/protocol.ts";
import { validateManifest } from "../federation/validate.ts";
import { EMAIL, HOME_ADDRESS, PHONE } from "./contract-patterns.mjs";
import { ROOT, buildManifest } from "./manifest.mjs";

/** The people area's slug in the walk world (src/data/layout.ts): no district may take it. */
export const RESERVED_DISTRICT_SLUGS = ["people"];
/** The walk world's set-piece kinds (PIECE_KINDS in src/views/walk/pieces.ts; pieces.test.ts keeps the two lists the same). */
export const SET_PIECE_KINDS = ["lighthouse", "pier", "beach", "huts", "boathouse", "windmill", "farm", "camp", "tower", "orchard", "observatory", "greenhouse"];
/** The walk world's parts a site can turn off (site.json walk; each is on unless set to false). */
const WALK_SWITCHES = ["village", "keepsakes", "wildlife", "sound"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOGO_EXT = [".svg", ".png", ".webp", ".jpg", ".jpeg"];
const HEADSHOT_EXT = [".webp", ".png", ".jpg", ".jpeg"];
const BRAND_EXT = [".svg", ".png", ".webp", ".jpg", ".jpeg", ".ico"];
const BUSINESS_MODELS = ["B2B", "B2C", "B2B2C", "B2G", "Nonprofit", "Unknown"];
const SOURCE_KINDS = ["company-supplied", "org-records"];
const LINKEDIN = /^https:\/\/(www\.)?linkedin\.com\/(in|company|school)\/[A-Za-z0-9_%.-]+\/?$/;

const COMPANY_KEYS = ["slug", "name", "district", "secondaryDistricts", "tags", "website", "description", "descriptionSource", "location", "linkedin", "founders", "leaders", "services", "servesIndustries", "businessModel", "keywords", "providerPitch", "connections", "sources"];
const COMPANY_OPTIONAL = ["logoPlate"];
const PERSON_KEYS = ["slug", "name", "title", "summary", "bio", "linkedin", "focusAreas", "sources"];
const TEAM_KEYS = ["name", "title", "source"];
const TEAM_OPTIONAL = ["linkedin"];
const CONNECTION_KEYS = ["with", "kind", "summary", "source"];
const DISTRICT_KEYS = ["slug", "label", "short", "color", "icon", "industries"];
const DISTRICT_OPTIONAL = ["note"];

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v) => typeof v === "string" && v.trim().length > 0;

export function isWebUrl(v) {
  if (typeof v !== "string") return false;
  try {
    const u = new URL(v);
    return (u.protocol === "https:" || u.protocol === "http:") && !u.username && !/\s/.test(v);
  } catch {
    return false;
  }
}

/** WCAG contrast ratio between two "#rrggbb" colors. */
export function contrast(a, b) {
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** The icon names DISTRICT_ICONS accepts (src/components/bits.tsx), read from the source. */
export function districtIcons(root = ROOT) {
  const src = readFileSync(join(root, "src", "components", "bits.tsx"), "utf8");
  const block = src.slice(src.indexOf("export const DISTRICT_ICONS"), src.indexOf("};", src.indexOf("export const DISTRICT_ICONS")));
  return new Set([...block.matchAll(/"([a-z0-9-]+)":\s*[A-Z]/g)].map((m) => m[1]));
}

/** Every string inside a value, with its path, for the personal-data scan. */
function* strings(v, path) {
  if (typeof v === "string") yield [path, v];
  else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) yield* strings(v[i], `${path}[${i}]`);
  else if (isObj(v)) for (const [k, x] of Object.entries(v)) yield* strings(x, `${path}.${k}`);
}

/** Run every check on the site under `root` (the folder holding site/). */
export function validateSite(root = ROOT) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const siteDir = join(root, "site");
  const read = (rel) => {
    try {
      return readJson(join(siteDir, rel));
    } catch (e) {
      err(`site/${rel}: ${e.code === "ENOENT" ? "missing" : `not valid JSON (${e.message})`}`);
      return null;
    }
  };
  const site = read("site.json");
  const taxonomy = read("taxonomy.json");
  const companiesFile = read("data/companies.json");
  const peopleFile = existsSync(join(siteDir, "data", "people.json")) ? read("data/people.json") : { people: [] };
  if (!site || !taxonomy || !companiesFile || !peopleFile) return { errors, warnings };

  const keysOnly = (o, required, optional, where) => {
    if (!isObj(o)) return void err(`${where}: expected an object`);
    for (const k of Object.keys(o)) if (!required.includes(k) && !optional.includes(k)) err(`${where}: unexpected field "${k}"`);
    for (const k of required) if (!(k in o)) err(`${where}: missing field "${k}"`);
  };
  const text = (v, where, { nullable = false, max = 2000 } = {}) => {
    if (v === null && nullable) return;
    if (!isText(v)) return void err(`${where}: expected ${nullable ? "text or null" : "text"}`);
    if (v.length > max) err(`${where}: longer than ${max} characters`);
  };
  const color = (v, where) => {
    if (typeof v !== "string" || !HEX_COLOR.test(v)) err(`${where}: expected a color like "#3366ff"`);
  };
  const siteFileExists = (rel, where) => {
    if (rel === null) return;
    if (!isText(rel) || rel.includes("..") || rel.startsWith("/")) return void err(`${where}: expected a path inside site/, like "brand/logo.svg"`);
    if (!rel.startsWith("brand/")) err(`${where}: brand files live in site/brand/`);
    else if (!BRAND_EXT.includes(extname(rel).toLowerCase())) err(`${where}: use an .svg, .png, .webp or .jpg file`);
    if (!existsSync(join(siteDir, rel))) err(`${where}: site/${rel} does not exist`);
  };

  /* ---------------- site.json ---------------- */
  keysOnly(site, ["network", "org", "map", "labels", "theme", "live"], ["$schema", "walk"], "site.json");
  if (isObj(site.network)) {
    keysOnly(site.network, ["id", "shareDescriptions"], [], "site.json network");
    if (typeof site.network.id !== "string" || !ID_PATTERN.test(site.network.id)) err('site.json network.id: lowercase letters, digits and hyphens, 2 to 48 characters (e.g. "acme-ventures")');
    if (typeof site.network.shareDescriptions !== "boolean") err("site.json network.shareDescriptions: expected true or false");
  }
  if (isObj(site.org)) {
    keysOnly(site.org, ["name", "website", "logo", "logoOnDark"], [], "site.json org");
    text(site.org.name, "site.json org.name", { max: 80 });
    if (site.org.website !== null && !isWebUrl(site.org.website)) err("site.json org.website: expected a web address or null");
    else if (site.org.website === null || !String(site.org.website).startsWith("https://")) warnings.push("site.json org.website: set it to your organization's https website to join the network: the Nexus checks that your website vouches for the map (docs/network.md)");
    siteFileExists(site.org.logo, "site.json org.logo");
    siteFileExists(site.org.logoOnDark, "site.json org.logoOnDark");
  }
  if (isObj(site.map)) {
    keysOnly(site.map, ["title", "tagline", "description", "url", "directoryUrl", "notice"], [], "site.json map");
    text(site.map.title, "site.json map.title", { max: 80 });
    text(site.map.tagline, "site.json map.tagline", { nullable: true, max: 160 });
    text(site.map.description, "site.json map.description", { max: 300 });
    if (typeof site.map.url !== "string" || !site.map.url.startsWith("https://") || !isWebUrl(site.map.url)) err("site.json map.url: expected the https address the map is deployed at");
    else if (normalizeUrl(site.map.url) !== site.map.url) err(`site.json map.url: write it as "${normalizeUrl(site.map.url)}" (no trailing slash, query or hash)`);
    if (site.map.directoryUrl !== null && !isWebUrl(site.map.directoryUrl)) err("site.json map.directoryUrl: expected a web address or null");
    text(site.map.notice, "site.json map.notice", { nullable: true, max: 160 });
  }
  if (isObj(site.labels)) {
    const L = ["company", "companies", "district", "districts", "person", "people", "hub"];
    keysOnly(site.labels, L, [], "site.json labels");
    for (const k of L) text(site.labels[k], `site.json labels.${k}`, { max: 40 });
  }
  if (isObj(site.theme)) {
    keysOnly(site.theme, ["accent", "cta", "ctaText", "ink"], [], "site.json theme");
    for (const k of ["accent", "cta", "ctaText", "ink"]) color(site.theme[k], `site.json theme.${k}`);
    const t = site.theme;
    if ([t.accent, t.cta, t.ctaText, t.ink].every((c) => HEX_COLOR.test(c ?? ""))) {
      const cta = contrast(t.cta, t.ctaText);
      if (cta < 4.5) err(`site.json theme: ctaText on cta is ${cta.toFixed(2)}:1; calls to action need 4.5:1 or more`);
      const link = contrast(t.accent, "#ffffff");
      if (link < 4.5) err(`site.json theme.accent: ${link.toFixed(2)}:1 on white; links and focus rings need 4.5:1 or more (use a darker shade)`);
      const ink = contrast(t.ink, "#ffffff");
      if (ink < 7) err(`site.json theme.ink: ${ink.toFixed(2)}:1 on white; label text needs 7:1 or more (use a darker ink)`);
    }
  }
  if (isObj(site.live)) {
    keysOnly(site.live, ["enabled", "channel"], [], "site.json live");
    if (typeof site.live.enabled !== "boolean") err("site.json live.enabled: expected true or false");
    if (typeof site.live.channel !== "string" || !ID_PATTERN.test(site.live.channel)) err("site.json live.channel: lowercase letters, digits and hyphens");
  }
  if ("walk" in site) {
    keysOnly(site.walk, [], [...WALK_SWITCHES, "setPieces"], "site.json walk");
    if (isObj(site.walk)) {
      for (const k of WALK_SWITCHES) if (k in site.walk && typeof site.walk[k] !== "boolean") err(`site.json walk.${k}: expected true or false`);
      const pieces = site.walk.setPieces;
      if (pieces !== undefined && typeof pieces !== "boolean") {
        if (!Array.isArray(pieces)) err('site.json walk.setPieces: expected true, false or a list of kinds, like ["lighthouse", "orchard"]');
        else {
          for (const k of pieces) if (!SET_PIECE_KINDS.includes(k)) err(`site.json walk.setPieces: unknown kind ${JSON.stringify(k)}; the kinds are ${SET_PIECE_KINDS.join(", ")}`);
          if (new Set(pieces).size !== pieces.length) err("site.json walk.setPieces: a kind is listed twice");
        }
      }
    }
  }

  /* ---------------- taxonomy.json ---------------- */
  keysOnly(taxonomy, ["districts", "services", "industriesServed", "connectionKinds"], ["_about", "_palette"], "taxonomy.json");
  const vocab = (list, name) => {
    const slugs = new Set();
    if (!Array.isArray(list)) {
      err(`taxonomy.json ${name}: expected a list`);
      return slugs;
    }
    list.forEach((v, i) => {
      const where = `taxonomy.json ${name}[${i}]`;
      if (name !== "districts") keysOnly(v, ["slug", "label"], [], where);
      if (!isObj(v) || typeof v.slug !== "string" || !ID_PATTERN.test(v.slug)) return void err(`${where}: slug must be lowercase letters, digits and hyphens`);
      if (slugs.has(v.slug)) err(`${where}: slug "${v.slug}" twice`);
      slugs.add(v.slug);
      text(v.label, `${where}.label`, { max: 80 });
    });
    return slugs;
  };
  const services = vocab(taxonomy.services, "services");
  const industries = vocab(taxonomy.industriesServed, "industriesServed");
  const kinds = vocab(taxonomy.connectionKinds, "connectionKinds");
  const districts = vocab(taxonomy.districts, "districts");
  if (Array.isArray(taxonomy.districts)) {
    if (!taxonomy.districts.length) err("taxonomy.json districts: add at least one district");
    if (taxonomy.districts.length > 24) warnings.push(`taxonomy.json districts: ${taxonomy.districts.length} districts; past about 15 the globe's regions and the walk world's ring get crowded`);
    const icons = districtIcons(root);
    const colors = new Set();
    taxonomy.districts.forEach((d, i) => {
      const where = `taxonomy.json districts[${i}]`;
      keysOnly(d, DISTRICT_KEYS, DISTRICT_OPTIONAL, where);
      if (RESERVED_DISTRICT_SLUGS.includes(d.slug)) err(`${where}: "${d.slug}" is reserved (the walk world's people area)`);
      text(d.short, `${where}.short`, { max: 24 });
      color(d.color, `${where}.color`);
      if (colors.has(d.color?.toLowerCase())) err(`${where}.color: ${d.color} is already another district's color`);
      colors.add(d.color?.toLowerCase());
      if (!icons.has(d.icon)) err(`${where}.icon: "${d.icon}" is not in DISTRICT_ICONS (src/components/bits.tsx); pick one of ${[...icons].join(", ")}`);
      if (!Array.isArray(d.industries)) err(`${where}.industries: expected a list of industriesServed slugs`);
      else for (const s of d.industries) if (!industries.has(s)) err(`${where}.industries: "${s}" is not in industriesServed`);
    });
  }

  /* ---------------- sources ---------------- */
  const source = (s, where) => {
    keysOnly(s, ["title"], ["url", "retrieved", "kind"], where);
    if (!isObj(s)) return;
    text(s.title, `${where}.title`, { max: 300 });
    if (s.kind !== undefined && !SOURCE_KINDS.includes(s.kind)) err(`${where}.kind: expected ${SOURCE_KINDS.join(" or ")}`);
    if (s.url !== undefined && !isWebUrl(s.url)) err(`${where}.url: expected a web address`);
    if (s.url === undefined && s.kind === undefined) err(`${where}: a source needs a url, or a kind (company-supplied, org-records) that says why it has none`);
    if (s.retrieved !== undefined && !DATE.test(s.retrieved)) err(`${where}.retrieved: expected YYYY-MM-DD`);
  };
  const sourceList = (list, where) => {
    if (!Array.isArray(list) || !list.length) return void err(`${where}: every record needs at least one source`);
    list.forEach((s, i) => source(s, `${where}[${i}]`));
  };
  const slugList = (list, allowed, where, vocabName) => {
    if (!Array.isArray(list)) return void err(`${where}: expected a list`);
    for (const s of list) if (!allowed.has(s)) err(`${where}: "${s}" is not in taxonomy.json ${vocabName}`);
    if (new Set(list).size !== list.length) err(`${where}: lists a value twice`);
  };
  const textList = (list, where, max = 80) => {
    if (!Array.isArray(list)) return void err(`${where}: expected a list of text`);
    list.forEach((t, i) => text(t, `${where}[${i}]`, { max }));
  };

  /* ---------------- companies ---------------- */
  keysOnly(companiesFile, ["companies"], ["_about"], "data/companies.json");
  const companies = Array.isArray(companiesFile.companies) ? companiesFile.companies : [];
  if (!companies.length) err("data/companies.json: add at least one company");
  const companySlugs = new Set();
  for (const c of companies) {
    if (isObj(c) && typeof c.slug === "string") {
      if (companySlugs.has(c.slug)) err(`data/companies.json: slug "${c.slug}" twice`);
      companySlugs.add(c.slug);
    }
  }
  companies.forEach((c, i) => {
    const where = `company ${isObj(c) && c.slug ? `"${c.slug}"` : `#${i}`}`;
    keysOnly(c, COMPANY_KEYS, COMPANY_OPTIONAL, where);
    if (!isObj(c)) return;
    if (typeof c.slug !== "string" || !ID_PATTERN.test(c.slug)) err(`${where}: slug must be lowercase letters, digits and hyphens (2-48)`);
    text(c.name, `${where}.name`, { max: 80 });
    if (!districts.has(c.district)) err(`${where}.district: "${c.district}" is not a district in taxonomy.json`);
    slugList(c.secondaryDistricts, districts, `${where}.secondaryDistricts`, "districts");
    if (Array.isArray(c.secondaryDistricts) && c.secondaryDistricts.includes(c.district)) err(`${where}.secondaryDistricts: repeats its primary district`);
    textList(c.tags, `${where}.tags`, 60);
    if (c.website !== null && !isWebUrl(c.website)) err(`${where}.website: expected a web address or null`);
    text(c.description, `${where}.description`, { nullable: true, max: 600 });
    if (c.description !== null && c.description !== undefined) {
      if (c.descriptionSource === null) err(`${where}.descriptionSource: a description needs its source`);
      else source(c.descriptionSource, `${where}.descriptionSource`);
    } else if (c.descriptionSource !== null) err(`${where}.descriptionSource: set it to null when there is no description`);
    text(c.location, `${where}.location`, { nullable: true, max: 80 });
    if (c.linkedin !== null && !LINKEDIN.test(c.linkedin ?? "")) err(`${where}.linkedin: expected a linkedin.com/company/... address or null`);
    for (const role of ["founders", "leaders"]) {
      if (!Array.isArray(c[role])) {
        err(`${where}.${role}: expected a list`);
        continue;
      }
      c[role].forEach((p, j) => {
        const w = `${where}.${role}[${j}]`;
        keysOnly(p, TEAM_KEYS, TEAM_OPTIONAL, w);
        if (!isObj(p)) return;
        text(p.name, `${w}.name`, { max: 80 });
        text(p.title, `${w}.title`, { max: 120 });
        source(p.source, `${w}.source`);
        if (p.linkedin !== undefined && !LINKEDIN.test(p.linkedin)) err(`${w}.linkedin: expected a linkedin.com/in/... address`);
      });
    }
    slugList(c.services, services, `${where}.services`, "services");
    slugList(c.servesIndustries, industries, `${where}.servesIndustries`, "industriesServed");
    if (!BUSINESS_MODELS.includes(c.businessModel)) err(`${where}.businessModel: expected one of ${BUSINESS_MODELS.join(", ")}`);
    textList(c.keywords, `${where}.keywords`, 60);
    text(c.providerPitch, `${where}.providerPitch`, { nullable: true, max: 300 });
    if (c.logoPlate !== undefined && c.logoPlate !== null && !["light", "dark", "self"].includes(c.logoPlate)) err(`${where}.logoPlate: expected "light", "dark", "self" or null`);
    if (!Array.isArray(c.connections)) err(`${where}.connections: expected a list`);
    else
      c.connections.forEach((k, j) => {
        const w = `${where}.connections[${j}]`;
        keysOnly(k, CONNECTION_KEYS, [], w);
        if (!isObj(k)) return;
        if (!companySlugs.has(k.with)) err(`${w}.with: "${k.with}" is not a company on the map`);
        if (k.with === c.slug) err(`${w}.with: a company cannot connect to itself`);
        if (!kinds.has(k.kind)) err(`${w}.kind: "${k.kind}" is not in taxonomy.json connectionKinds`);
        text(k.summary, `${w}.summary`, { max: 300 });
        source(k.source, `${w}.source`);
      });
    sourceList(c.sources, `${where}.sources`);
  });

  /* ---------------- people ---------------- */
  keysOnly(peopleFile, ["people"], ["_about"], "data/people.json");
  const people = Array.isArray(peopleFile.people) ? peopleFile.people : [];
  const personSlugs = new Set();
  people.forEach((p, i) => {
    const where = `person ${isObj(p) && p.slug ? `"${p.slug}"` : `#${i}`}`;
    keysOnly(p, PERSON_KEYS, [], where);
    if (!isObj(p)) return;
    if (typeof p.slug !== "string" || !ID_PATTERN.test(p.slug)) err(`${where}: slug must be lowercase letters, digits and hyphens (2-48)`);
    else if (personSlugs.has(p.slug)) err(`${where}: slug twice`);
    else if (companySlugs.has(p.slug)) err(`${where}: slug "${p.slug}" is also a company's (pins and links are keyed by slug)`);
    personSlugs.add(p.slug);
    text(p.name, `${where}.name`, { max: 80 });
    text(p.title, `${where}.title`, { max: 120 });
    text(p.summary, `${where}.summary`, { nullable: true, max: 600 });
    textList(p.bio, `${where}.bio`, 3000);
    if (p.linkedin !== null && !LINKEDIN.test(p.linkedin ?? "")) err(`${where}.linkedin: expected a linkedin.com/in/... address or null`);
    slugList(p.focusAreas, services, `${where}.focusAreas`, "services");
    sourceList(p.sources, `${where}.sources`);
  });

  /* ---------------- personal data, in every string ---------------- */
  for (const [file, value] of [["site.json", site], ["taxonomy.json", taxonomy], ["data/companies.json", companiesFile], ["data/people.json", peopleFile]]) {
    for (const [path, s] of strings(value, file)) {
      // Source URLs and titles may legitimately carry digits; the patterns are for what the map shows.
      if (/\.(url|website|linkedin)$/.test(path)) continue;
      if (EMAIL.test(s)) err(`${path}: looks like it holds an email address (never shipped)`);
      if (PHONE.test(s)) err(`${path}: looks like it holds a phone number (never shipped)`);
      if (HOME_ADDRESS.test(s)) err(`${path}: looks like a street address with a unit number (never shipped)`);
    }
  }

  /* ---------------- files ---------------- */
  const files = (dir, exts, owners, what) => {
    const d = join(siteDir, dir);
    if (!existsSync(d)) return;
    for (const f of readdirSync(d)) {
      if (f.startsWith(".") || f === "README.md") continue;
      const ext = extname(f).toLowerCase();
      const slug = f.slice(0, f.length - ext.length);
      if (!exts.includes(ext)) err(`site/${dir}/${f}: use ${exts.join(", ")}`);
      else if (!owners.has(slug)) err(`site/${dir}/${f}: no ${what} has the slug "${slug}" (the file would ship unused)`);
      const kb = statSync(join(d, f)).size / 1024;
      if (kb > 1024) err(`site/${dir}/${f}: ${Math.round(kb)} KB; keep it under 1 MB (300 KB or less loads well on phones)`);
      else if (kb > 300) warnings.push(`site/${dir}/${f}: ${Math.round(kb)} KB; 300 KB or less loads well on phones`);
      if (ext === ".svg") {
        const svg = readFileSync(join(d, f), "utf8");
        if (/<script\b|\son\w+\s*=/i.test(svg)) err(`site/${dir}/${f}: an SVG with scripts or event handlers`);
        if (!/<svg[^>]*\swidth=/.test(svg) || !/<svg[^>]*\sheight=/.test(svg)) warnings.push(`site/${dir}/${f}: give the <svg> width and height attributes, or some browsers draw it at the wrong size`);
      }
    }
    const seen = new Map();
    for (const f of readdirSync(d)) {
      const slug = f.replace(/\.[^.]+$/, "");
      if (seen.has(slug) && !f.startsWith(".")) err(`site/${dir}/: two files for "${slug}" (${seen.get(slug)} and ${f})`);
      seen.set(slug, f);
    }
  };
  files("logos", LOGO_EXT, companySlugs, "company");
  files("people", HEADSHOT_EXT, personSlugs, "person");

  /* ---------------- the network manifest ---------------- */
  if (!errors.length) {
    const pkg = readJson(join(root, "package.json"));
    for (const p of validateManifest(buildManifest({ site, taxonomy, companies, people, version: pkg.version }))) err(`network manifest: ${p}`);
  }
  return { errors, warnings };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = process.argv[2] ?? ROOT;
  const { errors, warnings } = validateSite(root);
  for (const w of warnings) console.warn(`validate: warning: ${w}`);
  if (errors.length) {
    console.error(`validate: ${errors.length} problem(s) in site/ (docs/data-contract.md)\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  const companies = readJson(join(root, "site", "data", "companies.json")).companies.length;
  console.log(`validate: OK — site/ keeps the content contract (${companies} companies).`);
}
