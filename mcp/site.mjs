/* ============================================================
   site.mjs — how the builder's tools (mcp/tools.mjs) change site/:
   never directly. A change is made first on a copy of what the
   validator reads, checked with validateSite() (the same check every
   build runs), and written to site/ only when it adds no problem.
   A change that adds one is refused, with the problems, and nothing
   is written. Problems the site already had do not block a change,
   so a site can be fixed one record at a time.
   ============================================================ */
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { validateSite } from "../scripts/validate-site.mjs";

/** site/'s folders of images; a change to one copies it, the others are linked. */
const IMAGE_DIRS = ["logos", "people", "brand"];
const DATA_FILES = ["site/site.json", "site/taxonomy.json", "site/data/companies.json", "site/data/people.json"];

export const readJson = (root, rel) => JSON.parse(readFileSync(join(root, rel), "utf8"));

/** JSON as the repository writes it: two-space indents and a final line break. */
export const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** A change refused because it would add problems; nothing was written. */
export class Refused extends Error {
  constructor(message, problems) {
    super(`${message}; nothing was written.\n  ${problems.join("\n  ")}`);
    this.name = "Refused";
    this.problems = problems;
  }
}

/** A problem's text without list positions, so moving a record does not make an old problem look new. */
const problemKey = (p) => p.replace(/\[\d+\]/g, "[]");

/**
 * The problems in `after` that `before` did not have, counted by their text with positions left
 * out. Network manifest problems are left aside: the validator checks the manifest only once
 * nothing else is wrong, so they appear as other problems are fixed.
 */
export function addedProblems(before, after) {
  const seen = new Map();
  for (const p of before) seen.set(problemKey(p), (seen.get(problemKey(p)) ?? 0) + 1);
  const added = [];
  for (const p of after) {
    if (p.startsWith("network manifest:")) continue;
    const n = seen.get(problemKey(p)) ?? 0;
    if (n > 0) seen.set(problemKey(p), n - 1);
    else added.push(p);
  }
  return added;
}

/** A copy of everything validateSite() reads under `root`; image folders named in `copyDirs` are copied, the rest linked. */
function stage(root, copyDirs) {
  const tmp = mkdtempSync(join(tmpdir(), "portfolio-map-"));
  mkdirSync(join(tmp, "site", "data"), { recursive: true });
  for (const rel of DATA_FILES) if (existsSync(join(root, rel))) copyFileSync(join(root, rel), join(tmp, rel));
  for (const d of IMAGE_DIRS) {
    const from = join(root, "site", d);
    if (!existsSync(from)) continue;
    if (copyDirs.has(d)) cpSync(from, join(tmp, "site", d), { recursive: true });
    else symlinkSync(from, join(tmp, "site", d), "junction");
  }
  mkdirSync(join(tmp, "src", "components"), { recursive: true });
  copyFileSync(join(root, "src", "components", "bits.tsx"), join(tmp, "src", "components", "bits.tsx"));
  copyFileSync(join(root, "package.json"), join(tmp, "package.json"));
  return tmp;
}

function apply(root, write, remove) {
  for (const rel of remove) rmSync(join(root, rel), { force: true });
  for (const [rel, value] of write) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), Buffer.isBuffer(value) ? value : jsonText(value));
  }
}

/**
 * Makes a change to site/ under `root` only if it adds no problem: `write` maps paths (from the
 * root, like "site/data/companies.json") to JSON values or Buffers; `remove` lists paths to delete.
 * Throws Refused when the change adds a problem; otherwise writes it and returns the problems and
 * warnings the site still has. With `dryRun`, it checks the change the same way and writes nothing:
 * the result is what the site would have.
 */
export function guardedWrite(root, { write = new Map(), remove = [] }, what = "the change", { dryRun = false } = {}) {
  for (const rel of [...write.keys(), ...remove]) {
    if (!rel.startsWith("site/") || rel.split("/").includes("..")) throw new Error(`${rel}: the builder only writes inside site/`);
  }
  const before = validateSite(root);
  const touched = new Set([...write.keys(), ...remove].map((rel) => rel.split("/")[1]).filter((d) => IMAGE_DIRS.includes(d)));
  const tmp = stage(root, touched);
  try {
    apply(tmp, write, remove);
    const after = validateSite(tmp);
    const added = addedProblems(before.errors, after.errors);
    if (added.length) throw new Refused(`${what} would break the content contract (docs/data-contract.md)`, added);
    if (!dryRun) apply(root, write, remove);
    return { errors: after.errors, warnings: after.warnings };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
