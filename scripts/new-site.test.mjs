import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./manifest.mjs";
import { newSiteConfig, writeNewSite } from "./new-site.mjs";
import { validateSite } from "./validate-site.mjs";

function scratch() {
  const root = mkdtempSync(join(tmpdir(), "pm3d-new-site-"));
  cpSync(join(ROOT, "site"), join(root, "site"), { recursive: true });
  cpSync(join(ROOT, "package.json"), join(root, "package.json"));
  cpSync(join(ROOT, "src", "components", "bits.tsx"), join(root, "src", "components", "bits.tsx"));
  return root;
}

describe("new-site", () => {
  it("writes a site.json the validator accepts, with the answers in it", () => {
    const c = newSiteConfig({ name: "Acme Ventures", id: "acme-ventures", url: "https://map.acme.example/", company: "startup", companies: "startups" });
    expect(c.network.id).toBe("acme-ventures");
    expect(c.map.url).toBe("https://map.acme.example");
    expect(c.labels).toMatchObject({ company: "startup", companies: "startups", hub: "Acme Ventures" });
    expect(c.walk).toEqual({ world: "campus" });
    expect(newSiteConfig({ name: "Acme", id: "acme", url: "https://map.acme.example", world: "classic" }).walk).toEqual({ world: "classic" });
  });

  it("replaces the example: no companies, people, logos or brand files; the validator then asks for a company", () => {
    const root = scratch();
    writeNewSite(root, { name: "Acme Ventures", id: "acme-ventures", url: "https://map.acme.example" });
    expect(JSON.parse(readFileSync(join(root, "site", "data", "companies.json"), "utf8")).companies).toEqual([]);
    expect(readdirSync(join(root, "site", "logos"))).toEqual([]);
    expect(existsSync(join(root, "site", "brand", "logo.svg"))).toBe(false);
    const { errors } = validateSite(root);
    expect(errors).toContain("data/companies.json: add at least one company");
    expect(errors.filter((e) => !e.startsWith("data/companies.json"))).toEqual([]);
  });
});
