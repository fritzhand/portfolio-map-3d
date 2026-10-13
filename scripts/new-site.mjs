#!/usr/bin/env node
/* ============================================================
   new-site.mjs — start your own map: replaces the example's
   site/ with a blank one for your organization (docs/getting-started.md).

   npm run new-site -- --name "Acme Ventures" --id acme-ventures
       --url https://map.acme.vc [--website https://acme.vc]
       [--company startup --companies startups]
       [--world campus|classic] [--yes]

   Asks for anything missing when run in a terminal. It writes
   site/site.json with your names, empties site/data/ (no companies,
   no people), removes the example's logos and brand files, and keeps
   site/taxonomy.json's services and industries lists (edit the
   districts there). Nothing else in the repository changes, so
   framework updates still merge cleanly.
   ============================================================ */
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { ID_PATTERN, normalizeUrl } from "../federation/protocol.ts";
import { slugify } from "./import-csv.mjs";
import { ROOT } from "./manifest.mjs";

const flag = (args, name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

/** The new site.json for these answers. */
export function newSiteConfig({ name, id, url, website = null, company = "company", companies = "companies", world = "campus" }) {
  return {
    $schema: "../schema/site.schema.json",
    network: { id, shareDescriptions: true },
    org: { name, website, logo: null, logoOnDark: null },
    map: {
      title: `${name} Map`,
      tagline: null,
      description: `The ${companies} of ${name} on a rotating globe, in a walkable world and in a searchable directory.`,
      url: normalizeUrl(url),
      directoryUrl: null,
      notice: null,
    },
    labels: { company, companies, district: "district", districts: "districts", person: "coach", people: "coaches", hub: name },
    theme: { accent: "#0c7a8c", cta: "#ff3a61", ctaText: "#1d1f24", ink: "#1d1f24" },
    walk: { world },
    live: { enabled: false, channel: `${id}-walk` },
  };
}

/** Replace site/ under `root` with a blank site for these answers. */
export function writeNewSite(root, answers) {
  const site = join(root, "site");
  writeFileSync(join(site, "site.json"), `${JSON.stringify(newSiteConfig(answers), null, 2)}\n`);
  writeFileSync(
    join(site, "data", "companies.json"),
    `${JSON.stringify({ _about: "The companies on the map (docs/data-contract.md). Add records by hand or with `npm run import -- companies.csv`; every record keeps its sources.", companies: [] }, null, 2)}\n`,
  );
  writeFileSync(
    join(site, "data", "people.json"),
    `${JSON.stringify({ _about: "The people on the organization's own roster (site.json labels.people), or none. A person has no link to any company, district or industry on the map.", people: [] }, null, 2)}\n`,
  );
  for (const dir of ["logos", "people", "brand"]) {
    const d = join(site, dir);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) if (f !== "README.md" && !f.startsWith(".")) rmSync(join(d, f));
  }
  const taxPath = join(site, "taxonomy.json");
  const tax = JSON.parse(readFileSync(taxPath, "utf8"));
  tax._palette = "Pending: check the district colors as a set (docs/configuration.md) and record the result here.";
  writeFileSync(taxPath, `${JSON.stringify(tax, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const rl = process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  const ask = async (q, fallback) => (rl ? (await rl.question(`${q}${fallback ? ` (${fallback})` : ""}: `)).trim() || fallback : fallback);
  const name = flag(args, "--name") ?? (await ask("Your organization's name", undefined));
  const id = flag(args, "--id") ?? (await ask("Its id in the network (lowercase, hyphens)", name ? slugify(name) : undefined));
  const url = flag(args, "--url") ?? (await ask("Where the map will live (https://…)", undefined));
  const website = flag(args, "--website") ?? (await ask("Your organization's website (optional)", "")) ?? "";
  const company = flag(args, "--company") ?? "company";
  const companies = flag(args, "--companies") ?? (company === "company" ? "companies" : `${company}s`);
  const world =
    flag(args, "--world") ??
    (await ask("Walk world: campus (built in Blender, the richer look) or classic (built in code, lighter to customize)", "campus"));
  const problems = [];
  if (!name) problems.push("--name is required");
  if (!id || !ID_PATTERN.test(id)) problems.push("--id: lowercase letters, digits and hyphens, 2 to 48 characters");
  if (!url || !/^https:\/\//.test(url)) problems.push("--url: the https address the map will be deployed at");
  if (world !== "campus" && world !== "classic") problems.push("--world: campus or classic");
  if (problems.length) {
    rl?.close();
    console.error(`new-site: ${problems.join("; ")}`);
    process.exit(2);
  }
  const yes = args.includes("--yes") || (rl ? /^y/i.test((await ask("This replaces the example in site/. Continue? (y/N)", "n")) ?? "") : false);
  rl?.close();
  if (!yes) {
    console.error("new-site: nothing changed (pass --yes to run without asking).");
    process.exit(1);
  }
  writeNewSite(ROOT, { name, id, url, website: website || null, company, companies, world });
  console.log(`new-site: site/ is ready for ${name}. Next:
  1. Edit the districts in site/taxonomy.json.
  2. Add companies: npm run import -- companies.csv --org-records "…"  (or edit site/data/companies.json)
  3. Drop logos into site/logos/<slug>.png|svg|webp|jpg and your logo into site/brand/ (set org.logo in site/site.json).
  4. npm run dev, then npm run build, and deploy dist/ anywhere static.
  5. Join the network: add registry/instances/${id}.json by pull request (docs/network.md).`);
}
