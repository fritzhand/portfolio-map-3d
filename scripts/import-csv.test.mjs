import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { companiesFromRows, importCompanies, mergeCompanies, slugify } from "./import-csv.mjs";

const taxonomy = JSON.parse(readFileSync(new URL("../site/taxonomy.json", import.meta.url), "utf8"));
const source = { kind: "org-records", title: "Test export", retrieved: "2026-10-09" };

describe("slugify", () => {
  it("makes lowercase, hyphenated, accent-free slugs", () => {
    expect(slugify("Café Señor, Inc.")).toBe("cafe-senor-inc");
    expect(slugify("R&D Labs")).toBe("r-and-d-labs");
    expect(slugify("  --Hello   World--  ")).toBe("hello-world");
  });
});

describe("importCompanies", () => {
  const csv = [
    "Name,District,Website,Description,Founders,Services,Serves,Keywords,Business Model,Emails",
    'Acme Robotics,hardware,acme.example,"Acme builds robots   for farms.","Ana Ruiz (CEO and Co-Founder); Li Wei",Hardware & IoT,Agriculture,robots; farms,B2B,',
    "Beta Pay,Fintech,https://beta.example,,,,,,,",
    ",,,,,,,,,",
  ].join("\n");

  it("reads the columns it knows, by slug or label, and gives every record the source", () => {
    const { companies, warnings } = importCompanies(csv, { ...taxonomy, services: [...taxonomy.services, { slug: "hardware-iot", label: "Hardware & IoT" }] }, source);
    expect(companies).toHaveLength(2);
    const [a, b] = companies;
    expect(a).toMatchObject({ slug: "acme-robotics", district: "hardware", website: "https://acme.example", description: "Acme builds robots for farms.", descriptionSource: source, businessModel: "B2B", keywords: ["robots", "farms"], sources: [source] });
    expect(a.founders).toEqual([{ name: "Ana Ruiz", title: "CEO and Co-Founder", source }, { name: "Li Wei", title: "Founder", source }]);
    expect(a.servesIndustries).toEqual(["agriculture"]);
    expect(b).toMatchObject({ slug: "beta-pay", district: "fintech", description: null, descriptionSource: null, businessModel: "Unknown" });
    // The Emails column is never copied.
    expect(warnings.join(" ")).toContain('"Emails"');
    expect(JSON.stringify(companies)).not.toContain("Emails");
  });

  it("stops on an email address or phone number in a copied cell, naming the row", () => {
    expect(() => importCompanies("Name,District,Description\nX Co,health,Write to ana@x.example", taxonomy, source)).toThrow(/row 2, Description: holds an email address/);
    expect(() => importCompanies("Name,District,Location\nX Co,health,Call 813-555-0100", taxonomy, source)).toThrow(/phone number/);
  });

  it("stops on an unknown district, service or duplicate slug", () => {
    expect(() => importCompanies("Name,District\nX Co,Space", taxonomy, source)).toThrow(/district "Space"/);
    expect(() => importCompanies("Name,District,Services\nX Co,health,Juggling", taxonomy, source)).toThrow(/"Juggling" is not in taxonomy.json services/);
    expect(() => importCompanies("Name,District\nX Co,health\nX-Co,health", taxonomy, source)).toThrow(/slug "x-co" twice/);
  });

  it("needs a name and a district column", () => {
    expect(() => importCompanies("Company,Track\nX,health", taxonomy, source)).toThrow(/needs a "name" column/);
  });
});

describe("companiesFromRows", () => {
  it("takes lists as arrays or as semicolon-separated text, and checks every item", () => {
    const [c] = companiesFromRows([{ name: "Acme Robotics", district: "Hardware", founders: ["Ana Ruiz (CEO)", "Li Wei"], keywords: "robots; farms", tags: null }], taxonomy, source);
    expect(c).toMatchObject({ slug: "acme-robotics", district: "hardware", keywords: ["robots", "farms"], tags: [] });
    expect(c.founders).toEqual([{ name: "Ana Ruiz", title: "CEO", source }, { name: "Li Wei", title: "Founder", source }]);
    expect(() => companiesFromRows([{ name: "X Co", district: "health", keywords: ["fine", "ana@x.example"] }], taxonomy, source)).toThrow(/rows\[0\], keywords: holds an email address/);
  });

  it("names rows and fields the way its caller does", () => {
    const opts = { where: (i) => `record ${i + 1}`, label: (k) => k.toUpperCase() };
    expect(() => companiesFromRows([{ name: "X Co", district: "health", location: "Call 813-555-0100" }], taxonomy, source, opts)).toThrow(/record 1, LOCATION: holds a phone number/);
    expect(() => companiesFromRows([{ name: "", district: "health" }], taxonomy, source)).toThrow(/rows\[0\]: no name/);
  });
});

describe("mergeCompanies", () => {
  it("keeps fields the import leaves empty and adds new companies", () => {
    const old = [{ slug: "a", name: "A", services: ["ai-automation"], description: "Old.", sources: [{ url: "https://a.example", title: "A" }] }];
    const merged = mergeCompanies(old, [
      { slug: "a", name: "A Inc", services: [], description: null, sources: [source] },
      { slug: "b", name: "B", services: [], description: null, sources: [source] },
    ]);
    expect(merged[0]).toMatchObject({ name: "A Inc", services: ["ai-automation"], description: "Old." });
    expect(merged[0].sources).toHaveLength(2);
    expect(merged[1].slug).toBe("b");
  });
});
