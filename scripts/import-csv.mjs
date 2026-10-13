#!/usr/bin/env node
/* ============================================================
   import-csv.mjs — companies from a spreadsheet export into
   site/data/companies.json (docs/importing.md).

   npm run import -- companies.csv --source-title "Acme portfolio page"
       --source-url https://acme.vc/portfolio --retrieved 2026-10-09
   npm run import -- companies.csv --org-records "Acme's portfolio
       records, exported 2026-10-09"           (no public page)
   add --merge to update companies already in the file by slug,
   keeping every field the CSV leaves empty.

   Columns, by header name (case and spaces ignored; anything else
   is ignored, with a warning, and never copied):
     name (required), district (required: a district's slug or label),
     slug, website, description, location, linkedin, tags,
     founders ("Ana Ruiz (CEO and Co-Founder); Li Wei (CTO)"),
     services, serves (industries served), keywords, business model
   Lists are separated by semicolons. services and serves take the
   taxonomy's slugs or labels.

   Every record gets the source the command names: the map keeps
   the provenance of every fact (docs/data-contract.md). Cells are
   copied as written (whitespace runs become one space). Fail-closed:
   an email address or phone number in any copied cell, an unknown
   district, service or industry, or a duplicate slug stops the import
   and names the row, before anything is written.

   companiesFromRows() does the work for the CSV and for the builder's
   import_companies tool (mcp/tools.mjs), which takes rows that an AI
   assistant read from another app: the same fields, the same checks.
   ============================================================ */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EMAIL, PHONE } from "./contract-patterns.mjs";
import { parseCsv, recordsOf } from "./csv.mjs";
import { ROOT } from "./manifest.mjs";

const COLUMNS = {
  name: "name",
  slug: "slug",
  district: "district",
  website: "website",
  description: "description",
  location: "location",
  linkedin: "linkedin",
  tags: "tags",
  founders: "founders",
  services: "services",
  serves: "serves",
  servesindustries: "serves",
  industriesserved: "serves",
  keywords: "keywords",
  businessmodel: "businessModel",
};
const MODELS = ["B2B", "B2C", "B2B2C", "B2G", "Nonprofit", "Unknown"];

/** "Café Señor, Inc." -> "cafe-senor-inc". */
export function slugify(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}

const clean = (s) => s.replace(/\s+/g, " ").trim();
const list = (s) => clean(s).split(/\s*;\s*/).filter(Boolean);

/** The fields a row can hold, by their names in a record (the COLUMNS a CSV header maps to). */
export const ROW_FIELDS = [...new Set(Object.values(COLUMNS))];
/** The fields that hold lists: separated by semicolons in a cell, or given as arrays. */
export const LIST_FIELDS = ["tags", "founders", "services", "serves", "keywords"];

/**
 * Companies from rows of fields (ROW_FIELDS: strings; a list field as a semicolon-separated string
 * or an array of strings). `taxonomy` is site/taxonomy.json; `source` the source every record gets.
 * `where(i)` and `label(field)` name a row and a field in problems ("row 2", "Description").
 * Returns the companies, or throws with every problem listed.
 */
export function companiesFromRows(rows, taxonomy, source, { where = (i) => `rows[${i}]`, label = (field) => field, blank = () => false } = {}) {
  const problems = [];
  const byLabel = (vocab) => {
    const m = new Map();
    for (const v of vocab) {
      m.set(v.slug.toLowerCase(), v.slug);
      m.set(v.label.toLowerCase(), v.slug);
      if (v.short) m.set(v.short.toLowerCase(), v.slug);
    }
    return m;
  };
  const districts = byLabel(taxonomy.districts);
  const services = byLabel(taxonomy.services);
  const industries = byLabel(taxonomy.industriesServed);
  const slugs = new Set();
  const companies = [];
  rows.forEach((r, i) => {
    const row = where(i);
    const has = (k) => r[k] !== undefined && r[k] !== null;
    const cell = (k) => (!has(k) ? "" : Array.isArray(r[k]) ? r[k].map((v) => clean(String(v))).filter(Boolean).join("; ") : clean(String(r[k])));
    const items = (k) => (!has(k) ? [] : Array.isArray(r[k]) ? r[k].map((v) => clean(String(v))).filter(Boolean) : list(String(r[k])));
    for (const k of Object.keys(r)) {
      if (k === "website" || k === "linkedin" || !has(k)) continue;
      const values = LIST_FIELDS.includes(k) ? [cell(k), ...items(k)] : [cell(k)];
      if (values.some((v) => EMAIL.test(v))) problems.push(`${row}, ${label(k)}: holds an email address (never imported)`);
      if (values.some((v) => PHONE.test(v))) problems.push(`${row}, ${label(k)}: holds a phone number (never imported)`);
    }
    const name = cell("name");
    if (!name) {
      if (blank(i)) return; // a blank line at the end of a sheet
      problems.push(`${row}: no name`);
      return;
    }
    const slug = cell("slug") || slugify(name);
    if (!slug || slug.length < 2) problems.push(`${row}: cannot make a slug from "${name}"; add a slug column`);
    if (slugs.has(slug)) problems.push(`${row}: slug "${slug}" twice (add a slug column to tell them apart)`);
    slugs.add(slug);
    const district = districts.get(cell("district").toLowerCase());
    if (!district) problems.push(`${row}: district "${cell("district")}" is not in site/taxonomy.json`);
    const vocabList = (k, m, what) =>
      items(k).map((v) => {
        const s = m.get(v.toLowerCase());
        if (!s) problems.push(`${row}, ${label(k)}: "${v}" is not in taxonomy.json ${what}`);
        return s;
      });
    const founders = items("founders").map((f) => {
      const m = /^(.*?)\s*\(([^)]+)\)$/.exec(f);
      return { name: m ? m[1] : f, title: m ? m[2] : "Founder", source };
    });
    const website = cell("website");
    const model = cell("businessModel");
    if (model && !MODELS.includes(model)) problems.push(`${row}: business model "${model}" is not one of ${MODELS.join(", ")}`);
    const description = cell("description") || null;
    companies.push({
      slug,
      name,
      district: district ?? "",
      secondaryDistricts: [],
      tags: items("tags"),
      website: website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : null,
      description,
      descriptionSource: description ? source : null,
      location: cell("location") || null,
      linkedin: cell("linkedin") || null,
      founders,
      leaders: [],
      services: vocabList("services", services, "services").filter(Boolean),
      servesIndustries: vocabList("serves", industries, "industriesServed").filter(Boolean),
      businessModel: model || "Unknown",
      keywords: items("keywords"),
      providerPitch: null,
      connections: [],
      sources: [source],
    });
  });
  if (problems.length) throw new Error(`import: ${problems.length} problem(s), nothing written\n  ${problems.join("\n  ")}`);
  return companies;
}

/**
 * Companies from CSV text. `taxonomy` is site/taxonomy.json; `source` the source every record
 * gets. Returns { companies, warnings } or throws with every problem listed.
 */
export function importCompanies(text, taxonomy, source) {
  const { header, records } = recordsOf(parseCsv(text));
  const warnings = [];
  const columns = new Map();
  for (const h of header) {
    const key = COLUMNS[h.toLowerCase().replace(/[\s_-]+/g, "")];
    if (key) columns.set(key, h);
    else warnings.push(`column "${h}" is not one the import reads; it is ignored and not copied`);
  }
  for (const need of ["name", "district"]) if (!columns.has(need)) throw new Error(`import: the CSV needs a "${need}" column (it has: ${header.join(", ")})`);
  const rows = records.map((r) => Object.fromEntries([...columns].map(([k, h]) => [k, r[h] ?? ""])));
  const companies = companiesFromRows(rows, taxonomy, source, {
    where: (i) => `row ${i + 2}`,
    label: (k) => columns.get(k),
    blank: (i) => Object.values(records[i]).every((v) => !v.trim()),
  });
  return { companies, warnings };
}

/** Update `existing` with `incoming` by slug: an empty imported field keeps what the record had. */
export function mergeCompanies(existing, incoming) {
  const out = new Map(existing.map((c) => [c.slug, c]));
  for (const c of incoming) {
    const old = out.get(c.slug);
    if (!old) {
      out.set(c.slug, c);
      continue;
    }
    const merged = { ...old };
    for (const [k, v] of Object.entries(c)) {
      const empty = v === null || (Array.isArray(v) && v.length === 0) || v === "Unknown";
      if (k === "sources") merged.sources = [...old.sources, ...v.filter((s) => !old.sources.some((o) => JSON.stringify(o) === JSON.stringify(s)))];
      else if (!empty) merged[k] = v;
    }
    out.set(c.slug, merged);
  }
  return [...out.values()];
}

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const file = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
  const title = flag(args, "--source-title");
  const url = flag(args, "--source-url");
  const org = flag(args, "--org-records");
  const retrieved = flag(args, "--retrieved") ?? new Date().toISOString().slice(0, 10);
  if (!file || (!org && !(title && url))) {
    console.error('Usage: npm run import -- companies.csv (--source-title "…" --source-url https://… | --org-records "…") [--retrieved YYYY-MM-DD] [--merge]\nEvery record keeps where it came from: name the page the list is published on, or say whose records it is.');
    process.exit(2);
  }
  const source = org ? { kind: "org-records", title: org, retrieved } : { url, title, retrieved };
  const taxonomy = JSON.parse(readFileSync(join(ROOT, "site", "taxonomy.json"), "utf8"));
  const target = join(ROOT, "site", "data", "companies.json");
  try {
    const { companies, warnings } = importCompanies(readFileSync(file, "utf8"), taxonomy, source);
    for (const w of warnings) console.warn(`import: ${w}`);
    const current = JSON.parse(readFileSync(target, "utf8"));
    const next = args.includes("--merge") ? mergeCompanies(current.companies, companies) : companies;
    writeFileSync(target, `${JSON.stringify({ ...current, companies: next }, null, 2)}\n`);
    console.log(`import: ${companies.length} companies from ${file} → site/data/companies.json${args.includes("--merge") ? " (merged)" : ""}. Next: npm run validate`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
