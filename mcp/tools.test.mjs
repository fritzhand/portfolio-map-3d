import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ToolInputError, callTool } from "../federation/agent.ts";
import { ROOT } from "../scripts/manifest.mjs";
import { guardedWrite } from "./site.mjs";
import { builderTools } from "./tools.mjs";

let root;
let tools;
const tool = (name) => tools.find((t) => t.name === name);
const call = (name, input) => callTool(tool(name), input);
const companies = () => JSON.parse(readFileSync(join(root, "site", "data", "companies.json"), "utf8")).companies;
const companyFile = () => readFileSync(join(root, "site", "data", "companies.json"), "utf8");
const today = new Date().toISOString().slice(0, 10);
const PAGE = { url: "https://acme.example/about", title: "Acme: About" };

beforeEach(() => {
  // A copy of what the tools read and write: site/, the district icons and package.json.
  root = mkdtempSync(join(tmpdir(), "builder-test-"));
  cpSync(join(ROOT, "site"), join(root, "site"), { recursive: true });
  mkdirSync(join(root, "src", "components"), { recursive: true });
  copyFileSync(join(ROOT, "src", "components", "bits.tsx"), join(root, "src", "components", "bits.tsx"));
  copyFileSync(join(ROOT, "package.json"), join(root, "package.json"));
  tools = builderTools(root);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("the builder's tools", () => {
  it("are named for MCP and WebMCP alike, with a schema and hints each", () => {
    expect(tools.length).toBeGreaterThanOrEqual(14);
    for (const t of tools) {
      expect(t.name).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
      expect(t.inputSchema.type).toBe("object");
      expect(t.description.length).toBeGreaterThan(40);
    }
    expect(tools.filter((t) => t.hints.destructive).map((t) => t.name)).toEqual(["create_site", "remove_company"]);
  });

  it("get_status reports the example, its counts and what to do next", async () => {
    const s = await call("get_status", {});
    expect(s.example).toBe(true);
    expect(s.counts).toMatchObject({ districts: 6, companies: 29 });
    expect(s.validation.ok).toBe(true);
    expect(s.next[0]).toMatch(/create_site/);
    expect(s.walkWorld).toBe("campus");
  });
});

describe("upsert_company", () => {
  it("adds a company with its sources, filling unknown fields with null or []", async () => {
    const r = await call("upsert_company", { name: "Acme Robotics", district: "hardware", website: "acme.example", sources: [PAGE] });
    expect(r).toMatchObject({ written: true, slug: "acme-robotics", created: true });
    const c = companies().find((x) => x.slug === "acme-robotics");
    expect(Object.keys(c)).toEqual(["slug", "name", "district", "secondaryDistricts", "tags", "website", "description", "descriptionSource", "location", "linkedin", "founders", "leaders", "services", "servesIndustries", "businessModel", "keywords", "providerPitch", "connections", "sources"]);
    expect(c).toMatchObject({ website: "https://acme.example", description: null, founders: [], businessModel: "Unknown", sources: [{ ...PAGE, retrieved: today }] });
  });

  it("refuses a new company without a source, and writes nothing", async () => {
    const before = companyFile();
    await expect(call("upsert_company", { name: "Acme Robotics", district: "hardware" })).rejects.toThrow(/needs sources/);
    expect(companyFile()).toBe(before);
  });

  it("refuses an email address or phone number anywhere in the record", async () => {
    const before = companyFile();
    const description = "Write to hello@acme.example or call 813-555-0100.";
    await expect(call("upsert_company", { name: "Acme Robotics", district: "hardware", description, descriptionSource: PAGE, sources: [PAGE] })).rejects.toThrow(/email address[\s\S]*phone number|phone number[\s\S]*email address/);
    expect(companyFile()).toBe(before);
  });

  it("refuses a district the taxonomy does not have", async () => {
    await expect(call("upsert_company", { name: "Acme Robotics", district: "space", sources: [PAGE] })).rejects.toThrow(/"space" is not a district/);
  });

  it("updates given fields, adds sources, and wants a new description's source", async () => {
    const slug = companies()[0].slug;
    await expect(call("upsert_company", { slug, description: "A new description." })).rejects.toThrow(/descriptionSource/);
    const r = await call("upsert_company", { slug, description: "A new description.", descriptionSource: PAGE, sources: [PAGE] });
    expect(r).toMatchObject({ written: true, created: false });
    const c = companies().find((x) => x.slug === slug);
    expect(c.description).toBe("A new description.");
    expect(c.descriptionSource).toEqual({ ...PAGE, retrieved: today });
    expect(c.sources.length).toBe(2);
    // The same call again changes nothing: the source is already there.
    await call("upsert_company", { slug, description: "A new description.", descriptionSource: PAGE, sources: [PAGE] });
    expect(companies().find((x) => x.slug === slug).sources.length).toBe(2);
  });

  it("takes only the record's fields", async () => {
    await expect(call("upsert_company", { name: "Acme", district: "hardware", sources: [PAGE], email: "x" })).rejects.toBeInstanceOf(ToolInputError);
  });
});

describe("set_districts", () => {
  const current = () => JSON.parse(readFileSync(join(root, "site", "taxonomy.json"), "utf8")).districts;

  it("refuses to drop a district companies still use", async () => {
    await expect(call("set_districts", { districts: current().slice(1) })).rejects.toThrow(/is not a district in taxonomy\.json/);
    expect(current().length).toBe(6);
  });

  it("adds a district and marks the palette as needing a check", async () => {
    const space = { slug: "space", label: "Space", short: "Space", color: "#4a148c", icon: "rocket", industries: ["technology"] };
    const r = await call("set_districts", { districts: [...current(), space] });
    expect(r.districts).toContain("space");
    expect(JSON.parse(readFileSync(join(root, "site", "taxonomy.json"), "utf8"))._palette).toMatch(/^Pending/);
  });

  it("refuses an icon the map does not have", async () => {
    const bad = { slug: "space", label: "Space", short: "Space", color: "#4a148c", icon: "not-an-icon", industries: [] };
    await expect(call("set_districts", { districts: [...current(), bad] })).rejects.toThrow(/not in DISTRICT_ICONS/);
  });
});

describe("remove_company", () => {
  it("needs confirm: true", async () => {
    await expect(call("remove_company", { slug: companies()[0].slug })).rejects.toBeInstanceOf(ToolInputError);
  });

  it("removes the record, its logo and the connections to it", async () => {
    const target = companies().find((c) => companies().some((o) => o.connections.some((k) => k.with === c.slug)));
    const logo = readdirSync(join(root, "site", "logos")).find((f) => f.startsWith(`${target?.slug}.`));
    const r = await call("remove_company", { slug: target.slug, confirm: true });
    expect(r.removed).toBe(target.slug);
    expect(r.connectionsRemovedFrom.length).toBeGreaterThan(0);
    expect(companies().some((c) => c.slug === target.slug || c.connections.some((k) => k.with === target.slug))).toBe(false);
    if (logo) expect(existsSync(join(root, "site", "logos", logo))).toBe(false);
  });
});

describe("import_companies_csv", () => {
  const csv = (text) => {
    const p = join(root, "list.csv");
    writeFileSync(p, text);
    return p;
  };

  it("merges new and existing companies, each with the import's source", async () => {
    const first = companies()[0];
    const path = csv(`name,district,website\n${first.name},${first.district},${first.website ?? ""}\nNorthwind Labs,hardware,northwind.example\n`);
    const r = await call("import_companies_csv", { path, source: { kind: "org-records", title: "Acme's records, exported 2026-10-10" } });
    expect(r).toMatchObject({ imported: 2, created: ["northwind-labs"], updated: [first.slug] });
    expect(companies().find((c) => c.slug === "northwind-labs").sources[0]).toEqual({ kind: "org-records", title: "Acme's records, exported 2026-10-10", retrieved: today });
    expect(companies().length).toBe(30);
  });

  it("stops at a phone number, naming the row, and writes nothing", async () => {
    const before = companyFile();
    const path = csv("name,district,description\nNorthwind Labs,hardware,Call 813-555-0100\n");
    await expect(call("import_companies_csv", { path, source: PAGE })).rejects.toThrow(/row 2[\s\S]*phone number/);
    expect(companyFile()).toBe(before);
  });

  it("replaces every company only with confirm: true", async () => {
    const path = csv("name,district\nNorthwind Labs,hardware\n");
    await expect(call("import_companies_csv", { path, source: PAGE, mode: "replace" })).rejects.toThrow(/confirm/);
  });

  it("previews with dryRun and writes nothing", async () => {
    const before = companyFile();
    const path = csv("name,district,Emails\nNorthwind Labs,hardware,\n");
    const r = await call("import_companies_csv", { path, source: PAGE, dryRun: true });
    expect(r).toMatchObject({ dryRun: true, written: false, created: ["northwind-labs"] });
    expect(r.ignoredColumns.join(" ")).toContain('"Emails"');
    expect(companyFile()).toBe(before);
  });
});

describe("import_companies", () => {
  const SOURCE = { kind: "org-records", title: "HubSpot: Show on map, read for Example Collective on 2026-10-13" };

  it("imports rows read from another app, by district label, with the one source", async () => {
    const rows = [{ name: "Northwind Labs", district: "Hardware & Robotics", website: "northwind.example", founders: ["Ana Ruiz (CEO and Co-Founder)", "Li Wei"], tags: "robots; farms", location: null }];
    const r = await call("import_companies", { rows, source: SOURCE });
    expect(r).toMatchObject({ dryRun: false, written: true, imported: 1, created: ["northwind-labs"], counts: { created: 1, updated: 0 } });
    const c = companies().find((x) => x.slug === "northwind-labs");
    expect(c).toMatchObject({ district: "hardware", website: "https://northwind.example", tags: ["robots", "farms"], location: null, sources: [{ ...SOURCE, retrieved: today }] });
    expect(c.founders.map((f) => [f.name, f.title])).toEqual([["Ana Ruiz", "CEO and Co-Founder"], ["Li Wei", "Founder"]]);
    expect(companies().length).toBe(30);
  });

  it("previews with dryRun: what it would create and change, and writes nothing", async () => {
    const before = companyFile();
    const first = companies()[0];
    const rows = [{ name: "Northwind Labs", district: "hardware" }, { name: first.name, district: first.district, location: "Tampa, Florida" }];
    const r = await call("import_companies", { rows, source: SOURCE, dryRun: true });
    expect(r).toMatchObject({ dryRun: true, written: false, imported: 2, created: ["northwind-labs"], updated: [first.slug], counts: { created: 1, updated: 1, unchanged: 0, removed: 0 } });
    expect(r.changes[first.slug]).toEqual(expect.arrayContaining(["location", "sources"]));
    expect(r.sample.map((c) => c.slug)).toEqual(["northwind-labs", first.slug]);
    expect(r.next).toMatch(/Nothing was written/);
    expect(companyFile()).toBe(before);
  });

  it("refuses a field the map does not show, so contact data never arrives", async () => {
    const before = companyFile();
    const rows = [{ name: "Northwind Labs", district: "hardware", email: "ana@northwind.example", owner: "Jane" }];
    const err = await call("import_companies", { rows, source: SOURCE, dryRun: true }).catch((e) => e);
    expect(err).toBeInstanceOf(ToolInputError);
    expect(err.message).toMatch(/rows\[0\]\.email: not a field this tool takes/);
    expect(err.message).toMatch(/rows\[0\]\.owner: not a field this tool takes/);
    expect(companyFile()).toBe(before);
  });

  it("stops at an email address or phone number in a field it copies, naming the row, even in a preview", async () => {
    const before = companyFile();
    const rows = [{ name: "Northwind Labs", district: "hardware" }, { name: "Beta Pay", district: "fintech", description: "Write to ana@beta.example", tags: ["Call 813-555-0100"] }];
    for (const dryRun of [true, false]) {
      await expect(call("import_companies", { rows, source: SOURCE, dryRun })).rejects.toThrow(/rows\[1\], description: holds an email address[\s\S]*rows\[1\], tags: holds a phone number/);
    }
    expect(companyFile()).toBe(before);
  });

  it("stops at a district the map does not have", async () => {
    await expect(call("import_companies", { rows: [{ name: "Northwind Labs", district: "Space" }], source: SOURCE })).rejects.toThrow(/rows\[0\]: district "Space" is not in site\/taxonomy\.json/);
  });

  it("previews a replace without confirm, and writes one only with it", async () => {
    const before = companyFile();
    // Keep the companies that have logos: a replace that drops them would leave their files unused.
    const withLogos = new Set(readdirSync(join(root, "site", "logos")).map((f) => f.replace(/\.[^.]+$/, "")));
    const kept = companies().filter((c) => withLogos.has(c.slug)).map((c) => ({ slug: c.slug, name: c.name, district: c.district }));
    const rows = [...kept, { name: "Northwind Labs", district: "hardware" }];
    const r = await call("import_companies", { rows, source: SOURCE, mode: "replace", dryRun: true });
    expect(r.counts).toMatchObject({ created: 1, removed: 29 - kept.length });
    expect(r.removed.length).toBe(29 - kept.length);
    expect(companyFile()).toBe(before);
    await expect(call("import_companies", { rows, source: SOURCE, mode: "replace" })).rejects.toThrow(/confirm/);
  });
});

describe("add_logo", () => {
  const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082", "hex");
  const file = (name, data) => {
    const p = join(root, name);
    writeFileSync(p, data);
    return p;
  };

  it("saves a PNG as the company's logo, replacing the one it had", async () => {
    const slug = companies()[0].slug;
    const r = await call("add_logo", { slug, path: file("logo.png", PNG) });
    expect(r.saved).toBe(`site/logos/${slug}.png`);
    expect(readdirSync(join(root, "site", "logos")).filter((f) => f.startsWith(`${slug}.`))).toEqual([`${slug}.png`]);
  });

  it("refuses an SVG with a script", async () => {
    const slug = companies()[0].slug;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>';
    await expect(call("add_logo", { slug, path: file("logo.svg", svg) })).rejects.toThrow(/scripts or event handlers/);
  });

  it("refuses a file that is not the image it claims to be", async () => {
    const slug = companies()[0].slug;
    await expect(call("add_logo", { slug, path: file("logo.png", "<html>Not found</html>") })).rejects.toThrow(/not the PNG image/);
  });

  it("fetches only from public https addresses", async () => {
    const slug = companies()[0].slug;
    await expect(call("add_logo", { slug, url: "http://acme.example/logo.png" })).rejects.toThrow(/public https/);
    await expect(call("add_logo", { slug, url: "https://localhost/logo.png" })).rejects.toThrow(/public https/);
    await expect(call("add_logo", { slug, url: "https://192.168.1.2/logo.png" })).rejects.toThrow(/public https/);
  });
});

describe("site settings", () => {
  it("update_site refuses an accent too light for links", async () => {
    await expect(call("update_site", { theme: { accent: "#9fe8ff" } })).rejects.toThrow(/theme\.accent/);
  });

  it("update_site changes what it is given and keeps the rest", async () => {
    const r = await call("update_site", { map: { tagline: "Our companies, in 3D." }, labels: { company: "startup", companies: "startups" } });
    expect(r.site.map.tagline).toBe("Our companies, in 3D.");
    const site = JSON.parse(readFileSync(join(root, "site", "site.json"), "utf8"));
    expect(site.labels).toMatchObject({ company: "startup", companies: "startups", district: "district" });
    expect(site.org.name).toBe("Example Collective");
  });

  it("update_site switches the walk world, and refuses one that does not exist", async () => {
    const r = await call("update_site", { walk: { world: "classic" } });
    expect(r.site.walk).toEqual({ world: "classic" });
    expect(JSON.parse(readFileSync(join(root, "site", "site.json"), "utf8")).walk).toEqual({ world: "classic" });
    expect((await call("get_status", {})).walkWorld).toBe("classic");
    await expect(call("update_site", { walk: { world: "village" } })).rejects.toBeInstanceOf(ToolInputError);
    await call("update_site", { walk: { world: "campus" } });
  });

  it("update_site repairs a walk value written by hand as a string", async () => {
    const path = join(root, "site", "site.json");
    const broken = JSON.parse(readFileSync(path, "utf8"));
    broken.walk = "classic";
    writeFileSync(path, JSON.stringify(broken, null, 2));
    await call("update_site", { walk: { world: "classic" } });
    expect(JSON.parse(readFileSync(path, "utf8")).walk).toEqual({ world: "classic" });
    await call("update_site", { walk: { world: "campus" } });
  });

  it("update_site turns the walk world's parts on and off, and keeps to the known set pieces", async () => {
    const r = await call("update_site", { walk: { wildlife: false, setPieces: ["lighthouse", "orchard"] } });
    expect(r.site.walk).toEqual({ world: "campus", wildlife: false, setPieces: ["lighthouse", "orchard"] });
    await call("update_site", { walk: { sound: false } });
    const site = JSON.parse(readFileSync(join(root, "site", "site.json"), "utf8"));
    expect(site.walk).toEqual({ world: "campus", wildlife: false, setPieces: ["lighthouse", "orchard"], sound: false });
    await expect(call("update_site", { walk: { setPieces: ["castle"] } })).rejects.toThrow(/walk\.setPieces: unknown kind "castle"/);
  });

  it("update_site keeps the classic world's parts when it switches the world, and the world when it changes a part", async () => {
    await call("update_site", { walk: { world: "classic", keepsakes: false } });
    await call("update_site", { walk: { village: false } });
    await call("update_site", { walk: { world: "campus" } });
    expect(JSON.parse(readFileSync(join(root, "site", "site.json"), "utf8")).walk).toEqual({ world: "campus", keepsakes: false, village: false });
    expect((await call("get_status", {})).validation.errors).toEqual([]);
  });

  it("create_site needs confirm, replaces the example, and protects a real map", async () => {
    await expect(call("create_site", { name: "Acme Ventures", url: "https://map.acme.vc" })).rejects.toBeInstanceOf(ToolInputError);
    const r = await call("create_site", { name: "Acme Ventures", url: "https://map.acme.vc/", website: "https://acme.vc", company: "startup", world: "classic", confirm: true });
    expect(r).toMatchObject({ created: true, id: "acme-ventures" });
    expect(r.status.walkWorld).toBe("classic");
    expect(r.status.counts.companies).toBe(0);
    expect(JSON.parse(readFileSync(join(root, "site", "site.json"), "utf8")).map.url).toBe("https://map.acme.vc");
    await call("upsert_company", { name: "Northwind Labs", district: "hardware", sources: [PAGE] });
    await expect(call("create_site", { name: "Other", url: "https://other.example", confirm: true })).rejects.toThrow(/replaceExisting/);
  });

  it("a session from scratch ends with a site the build accepts", async () => {
    await call("create_site", { name: "Acme Ventures", url: "https://map.acme.vc", website: "https://acme.vc", confirm: true });
    expect((await call("get_status", {})).validation.ok).toBe(false); // no companies yet
    await call("upsert_company", {
      name: "Northwind Labs",
      district: "hardware",
      website: "https://northwind.example",
      description: "Northwind Labs builds inspection robots for pipelines.",
      descriptionSource: { url: "https://northwind.example/about", title: "Northwind Labs: About" },
      sources: [{ url: "https://acme.vc/portfolio", title: "Acme Ventures: Portfolio" }],
    });
    const s = await call("get_status", {});
    expect(s.validation).toMatchObject({ ok: true, errors: [] });
    expect(s.example).toBe(false);
    expect(s.next.join(" ")).toMatch(/Add logos/);
  });

  it("draft_registry_entry builds the entry from site.json", async () => {
    const r = await call("draft_registry_entry", { maintainer: "octocat" });
    expect(r.entry).toEqual({ id: "example-collective", name: "Example Collective", url: "https://wearenexus.xyz/example", joined: today, maintainer: "octocat" });
    expect(r.problems).toEqual([]);
  });
});

describe("guardedWrite", () => {
  it("writes only inside site/", () => {
    expect(() => guardedWrite(root, { write: new Map([["package.json", {}]]) })).toThrow(/only writes inside site/);
    expect(() => guardedWrite(root, { remove: ["site/../package.json"] })).toThrow(/only writes inside site/);
  });
});
