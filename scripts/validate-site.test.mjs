import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { DISTRICT_ICONS } from "../src/components/bits.tsx";
import { contrast, districtIcons, isWebUrl, validateSite } from "./validate-site.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = mkdtempSync(join(tmpdir(), "validate-site-"));
afterAll(() => rmSync(base, { recursive: true, force: true }));

let n = 0;
/** A fresh copy of what the validator reads (site/, package.json, bits.tsx), returning its root. */
function copy() {
  const root = join(base, String(n++));
  cpSync(join(ROOT, "site"), join(root, "site"), { recursive: true });
  cpSync(join(ROOT, "package.json"), join(root, "package.json"));
  mkdirSync(join(root, "src", "components"), { recursive: true });
  cpSync(join(ROOT, "src", "components", "bits.tsx"), join(root, "src", "components", "bits.tsx"));
  return root;
}

/** Edit one JSON file under the copy's site/. */
function edit(root, file, change) {
  const p = join(root, "site", file);
  const data = JSON.parse(readFileSync(p, "utf8"));
  change(data);
  writeFileSync(p, JSON.stringify(data, null, 2));
}

/** The validator's errors after one change to a fresh copy of the example site. */
function errorsAfter(file, change) {
  const root = copy();
  edit(root, file, change);
  return validateSite(root).errors;
}

const company = (data, slug) => data.companies.find((c) => c.slug === slug);

describe("validateSite", () => {
  it("passes the example site, and a copy of it, with no errors or warnings", () => {
    expect(validateSite()).toEqual({ errors: [], warnings: [] });
    expect(validateSite(copy())).toEqual({ errors: [], warnings: [] });
  });

  it("takes the walk world's switches, and only the set-piece kinds it knows", () => {
    expect(errorsAfter("site.json", (d) => (d.walk = { village: false, setPieces: ["lighthouse", "orchard"], keepsakes: false, wildlife: true, sound: false }))).toEqual([]);
    expect(errorsAfter("site.json", (d) => (d.walk = { setPieces: false }))).toEqual([]);
    expect(errorsAfter("site.json", (d) => (d.walk = { setPieces: ["castle"] }))).toEqual([expect.stringMatching(/^site\.json walk\.setPieces: unknown kind "castle"/)]);
    expect(errorsAfter("site.json", (d) => (d.walk = { setPieces: ["pier", "pier"] }))).toEqual(["site.json walk.setPieces: a kind is listed twice"]);
    expect(errorsAfter("site.json", (d) => (d.walk = { setPieces: "pier" }))).toEqual(['site.json walk.setPieces: expected true, false or a list of kinds, like ["lighthouse", "orchard"]']);
    expect(errorsAfter("site.json", (d) => (d.walk = { sound: "off" }))).toEqual(["site.json walk.sound: expected true or false"]);
    expect(errorsAfter("site.json", (d) => (d.walk = { weather: "rain" }))).toEqual(['site.json walk: unexpected field "weather"']);
  });

  it("fails an email address in a description", () => {
    const errors = errorsAfter("data/companies.json", (d) => (company(d, "signalforge").description = "Signalforge answers at hello@signalforge.example."));
    expect(errors).toEqual(['data/companies.json.companies[5].description: looks like it holds an email address (never shipped)']);
  });

  it("fails a phone number or a home address in any string", () => {
    expect(errorsAfter("data/people.json", (d) => (d.people[0].bio = ["Call me at (813) 555-0100."]))).toEqual(["data/people.json.people[0].bio[0]: looks like it holds a phone number (never shipped)"]);
    expect(errorsAfter("data/companies.json", (d) => (company(d, "ledgerly").location = "545 Main St Unit 2210"))).toEqual([
      "data/companies.json.companies[19].location: looks like a street address with a unit number (never shipped)",
    ]);
  });

  it("fails a company in a district the taxonomy does not have", () => {
    expect(errorsAfter("data/companies.json", (d) => (company(d, "quietmind").district = "space"))).toEqual(['company "quietmind".district: "space" is not a district in taxonomy.json']);
  });

  it("fails a connection to a company that is not on the map", () => {
    const errors = errorsAfter("data/companies.json", (d) => (company(d, "signalforge").connections[0].with = "ghost-co"));
    expect(errors).toEqual(['company "signalforge".connections[0].with: "ghost-co" is not a company on the map']);
  });

  it("fails a record without a source, and a source without a url or a kind", () => {
    expect(errorsAfter("data/companies.json", (d) => (company(d, "ampshare").sources = []))).toEqual(['company "ampshare".sources: every record needs at least one source']);
    expect(errorsAfter("data/companies.json", (d) => (company(d, "ampshare").descriptionSource = null))).toEqual(['company "ampshare".descriptionSource: a description needs its source']);
    expect(errorsAfter("data/people.json", (d) => delete d.people[0].sources[0].kind)).toEqual([
      'person "ada-lindqvist".sources[0]: a source needs a url, or a kind (company-supplied, org-records) that says why it has none',
    ]);
  });

  it("fails a person whose slug is also a company's", () => {
    expect(errorsAfter("data/people.json", (d) => (d.people[0].slug = "signalforge"))).toEqual(['person "signalforge": slug "signalforge" is also a company\'s (pins and links are keyed by slug)']);
  });

  it("keeps the people area's slug off the district list", () => {
    const errors = errorsAfter("taxonomy.json", (t) => t.districts.push({ slug: "people", label: "People", short: "People", color: "#5b6b7a", icon: "users", industries: [] }));
    expect(errors).toEqual(['taxonomy.json districts[6]: "people" is reserved (the walk world\'s people area)']);
  });

  it("fails a call to action whose text is too faint on its fill", () => {
    const errors = errorsAfter("site.json", (s) => (s.theme.ctaText = "#ffffff"));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^site\.json theme: ctaText on cta is \d\.\d\d:1; calls to action need 4\.5:1 or more$/);
  });

  it("fails a logo file no company owns", () => {
    const root = copy();
    cpSync(join(root, "site", "logos", "signalforge.svg"), join(root, "site", "logos", "ghost-co.svg"));
    expect(validateSite(root).errors).toEqual(['site/logos/ghost-co.svg: no company has the slug "ghost-co" (the file would ship unused)']);
  });

  it("fails two logo files for one company, and a logo in a format browsers may not draw", () => {
    const root = copy();
    cpSync(join(root, "site", "logos", "signalforge.svg"), join(root, "site", "logos", "signalforge.webp"));
    writeFileSync(join(root, "site", "logos", "quietmind.gif"), "GIF89a");
    const errors = validateSite(root).errors;
    expect(errors).toContain("site/logos/quietmind.gif: use .svg, .png, .webp, .jpg, .jpeg");
    expect(errors.some((e) => e.startsWith('site/logos/: two files for "signalforge"'))).toBe(true);
  });

  it("fails an icon DISTRICT_ICONS does not have", () => {
    const errors = errorsAfter("taxonomy.json", (t) => (t.districts[0].icon = "not-an-icon"));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^taxonomy\.json districts\[0\]\.icon: "not-an-icon" is not in DISTRICT_ICONS \(src\/components\/bits\.tsx\)/);
  });

  it("fails an unexpected field, a duplicate slug and an unknown service", () => {
    expect(errorsAfter("data/companies.json", (d) => (company(d, "ledgerly").revenue = "1M"))).toEqual(['company "ledgerly": unexpected field "revenue"']);
    expect(errorsAfter("data/companies.json", (d) => (company(d, "ledgerly").services = ["mind-reading"]))).toEqual(['company "ledgerly".services: "mind-reading" is not in taxonomy.json services']);
    expect(errorsAfter("data/companies.json", (d) => d.companies.push(structuredClone(company(d, "ledgerly"))))).toContain('data/companies.json: slug "ledgerly" twice');
  });

  it("fails a map address that is not a bare https address", () => {
    expect(errorsAfter("site.json", (s) => (s.map.url = "http://wearenexus.xyz/example"))).toEqual(["site.json map.url: expected the https address the map is deployed at"]);
    expect(errorsAfter("site.json", (s) => (s.map.url = "https://wearenexus.xyz/example/"))).toEqual([
      'site.json map.url: write it as "https://wearenexus.xyz/example" (no trailing slash, query or hash)',
    ]);
  });
});

describe("validate-site helpers", () => {
  it("measures WCAG contrast", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1);
    expect(contrast("#ff3a61", "#1d1f24")).toBe(contrast("#1d1f24", "#ff3a61"));
  });

  it("reads the icon names DISTRICT_ICONS accepts from bits.tsx, every one of them", () => {
    const icons = districtIcons(ROOT);
    expect([...icons].sort()).toEqual(Object.keys(DISTRICT_ICONS).sort());
    expect(icons.has("heart-pulse")).toBe(true);
    expect(icons.has("not-an-icon")).toBe(false);
  });

  it("takes http and https addresses only", () => {
    expect(isWebUrl("https://example.org")).toBe(true);
    expect(isWebUrl("http://example.org")).toBe(true);
    for (const bad of ["ftp://example.org", "example.org", "https://user@example.org", null]) expect(isWebUrl(bad)).toBe(false);
  });
});
