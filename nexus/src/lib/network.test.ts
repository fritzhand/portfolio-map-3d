import { describe, expect, it } from "vitest";
import { NEXUS_URL, PROTOCOL, type Manifest, type NetworkInstance } from "../../../federation/protocol.ts";
import { SnapshotError, buildNetwork, safeLogoPath, servedFrom, statusText } from "./network.ts";

function manifest(id: string, n: number, over: Partial<Manifest> = {}): Manifest {
  return {
    protocol: PROTOCOL,
    id,
    name: `Test ${id}`,
    publisher: { name: `Test ${id}`, website: `https://${id}.example.org` },
    url: `https://${id}.example.org`,
    tagline: null,
    logo: null,
    accent: "#3366ff",
    nexus: NEXUS_URL,
    framework: { name: "portfolio-map-3d", version: "1.0.0" },
    labels: { company: "company", companies: "companies", district: "district", districts: "districts", people: null },
    counts: { companies: n, people: 0, districts: 1 },
    districts: [{ slug: "all", label: "All", color: "#ff0000", count: n }],
    companies: Array.from({ length: n }, (_, i) => ({ slug: `c-${i}`, name: `Company ${i}`, district: "all", description: null, website: null, keywords: [] })),
    updated: "2026-10-01",
    ...over,
  };
}

function instance(id: string, status: NetworkInstance["status"], m: Manifest | null, extra: Partial<NetworkInstance> = {}): NetworkInstance {
  return {
    entry: { id, name: `Test ${id}`, url: `https://${id}.example.org`, joined: "2026-09-01", maintainer: "someone" },
    status,
    checked: m ? "2026-10-01" : null,
    manifest: m,
    logoFile: null,
    proof: status === "verified" ? "domain" : null,
    problems: [],
    ...extra,
  };
}

const snap = (instances: unknown[]) => ({ protocol: PROTOCOL, generated: "2026-10-09", instances });

describe("buildNetwork", () => {
  it("rejects anything that is not a snapshot of this protocol", () => {
    expect(() => buildNetwork(null)).toThrow(SnapshotError);
    expect(() => buildNetwork({ protocol: "portfolio-map/2", instances: [] })).toThrow(SnapshotError);
    expect(() => buildNetwork({ protocol: PROTOCOL })).toThrow(SnapshotError);
  });

  it("reads the empty snapshot", () => {
    const m = buildNetwork(snap([]));
    expect(m).toMatchObject({ generated: "2026-10-09", worlds: [], listed: [], companies: 0 });
  });

  it("shows verified instances and unreachable ones with a manifest as worlds, and nothing else", () => {
    const m = buildNetwork(
      snap([
        instance("alpha", "verified", manifest("alpha", 3)),
        instance("beta", "unreachable", manifest("beta", 2), { problems: ["timed out"] }),
        instance("gamma", "unreachable", null, { problems: ["timed out"] }),
        instance("delta", "no-backlink", manifest("delta", 2, { nexus: "https://elsewhere.example.org" }), { problems: ["links elsewhere"] }),
        instance("eps", "invalid", null, { problems: ["bad json"] }),
      ]),
    );
    expect(m.worlds.map((w) => [w.id, w.status])).toEqual([
      ["alpha", "verified"],
      ["beta", "unreachable"],
    ]);
    expect(m.companies).toBe(5);
    expect(m.listed.map((l) => [l.id, l.status, !!l.world])).toEqual([
      ["alpha", "verified", true],
      ["beta", "unreachable", true],
      ["delta", "no-backlink", false],
      ["eps", "invalid", false],
      ["gamma", "unreachable", false],
    ]);
    expect(m.listed.find((l) => l.id === "eps")!.problems).toEqual(["bad json"]);
  });

  it("re-checks manifests with the protocol: a 'verified' one that fails is not a world", () => {
    const m = buildNetwork(
      snap([
        instance("alpha", "verified", manifest("alpha", 2, { nexus: "https://elsewhere.example.org" })),
        instance("beta", "verified", { ...manifest("beta", 2), counts: { companies: 9, people: 0, districts: 1 } }),
        instance("gamma", "verified", manifest("someone-else", 1)),
        instance("delta", "verified", { ...manifest("delta", 1), email: "x" } as unknown as Manifest),
      ]),
    );
    expect(m.worlds).toEqual([]);
    expect(Object.fromEntries(m.listed.map((l) => [l.id, l.status]))).toEqual({ alpha: "no-backlink", beta: "invalid", gamma: "invalid", delta: "invalid" });
    for (const l of m.listed) expect(l.problems.length).toBeGreaterThan(0);
  });

  it("never shows an instance its publisher has not confirmed, and reads the proof", () => {
    const m = buildNetwork(
      snap([
        instance("alpha", "unconfirmed", manifest("alpha", 1), { problems: ["no proof"] }),
        instance("beta", "verified", manifest("beta", 1), { proof: "link" }),
        instance("gamma", "verified", manifest("gamma", 1), { proof: "made-up" as never }),
        { ...instance("delta", "verified", manifest("delta", 1)), proof: undefined },
      ]),
    );
    expect(m.worlds.map((w) => [w.id, w.proof])).toEqual([
      ["beta", "link"],
      ["delta", null],
      ["gamma", null],
    ]);
    expect(m.listed.find((l) => l.id === "alpha")).toMatchObject({ status: "unconfirmed", world: null, problems: ["no proof"] });
    expect(statusText("unconfirmed")).toMatch(/publisher has not confirmed/);
  });

  it("skips malformed and duplicate registry entries", () => {
    const good = instance("alpha", "verified", manifest("alpha", 1));
    const m = buildNetwork(snap([good, { ...good }, { entry: { id: "Bad Id" }, status: "verified" }, "nonsense", null]));
    expect(m.listed).toHaveLength(1);
  });

  it("gives every world a placement and keeps slots for hidden instances", () => {
    const m = buildNetwork(
      snap([
        instance("alpha", "verified", manifest("alpha", 1)),
        { ...instance("beta", "invalid", null), entry: { id: "beta", name: "Beta", url: "https://beta.example.org", joined: "2026-09-02", maintainer: "x" } },
        { ...instance("gamma", "verified", manifest("gamma", 1)), entry: { id: "gamma", name: "Gamma", url: "https://gamma.example.org", joined: "2026-09-03", maintainer: "x" } },
      ]),
    );
    expect(m.byId.get("alpha")!.placement.slot).toBe(0);
    expect(m.byId.get("gamma")!.placement.slot).toBe(2);
  });

  it("keeps only safe logo paths", () => {
    const m = buildNetwork(snap([instance("alpha", "verified", manifest("alpha", 1), { logoFile: "https://evil.example.org/x.png" })]));
    expect(m.worlds[0].logo).toBeNull();
    const ok = buildNetwork(snap([instance("alpha", "verified", manifest("alpha", 1), { logoFile: "instances/alpha.png" })]));
    expect(ok.worlds[0].logo).toBe("instances/alpha.png");
  });
});

describe("safeLogoPath", () => {
  it("accepts same-origin image paths only", () => {
    expect(safeLogoPath("instances/acme.png")).toBe("instances/acme.png");
    expect(safeLogoPath("instances/acme-logo.webp")).toBe("instances/acme-logo.webp");
    for (const bad of ["/instances/acme.png", "//evil.example.org/a.png", "https://x.org/a.png", "javascript:alert(1)", "../secret.png", "instances/../../a.png", "instances/a.html", "data:image/png;base64,AAAA", null, 3, "a\\b.png"]) {
      expect(safeLogoPath(bad)).toBeNull();
    }
  });
});

describe("statusText", () => {
  it("says each status in plain words", () => {
    expect(statusText("unreachable")).toBe("Not reachable at last check");
    expect(statusText("no-backlink")).toMatch(/does not link to the Nexus/);
  });
});

describe("servedFrom", () => {
  const onNexus = (id: string, status: NetworkInstance["status"]) => {
    const url = `${NEXUS_URL}/${id}`;
    return instance(id, status, status === "verified" ? manifest(id, 2, { url, publisher: { name: id, website: null } }) : null, { entry: { id, name: id, url, joined: "2026-09-01", maintainer: "fritzhand" } });
  };
  const model = buildNetwork(snap([onNexus("example", "verified"), instance("alpha", "verified", manifest("alpha", 3)), onNexus("gone", "invalid")]));
  const preview = "https://portfolio-map-3d-abc123.vercel.app/?world";

  it("links the maps published on the Nexus's own site on the deployment it is served from, and no others", () => {
    const m = servedFrom(model, preview);
    expect(m.byId.get("example")!.url).toBe("https://portfolio-map-3d-abc123.vercel.app/example");
    expect(m.byId.get("alpha")!.url).toBe("https://alpha.example.org");
    expect(m.listed.find((l) => l.id === "gone")!.url).toBe("https://portfolio-map-3d-abc123.vercel.app/gone");
    // One world object per world: the list, the index and the worlds agree.
    for (const l of m.listed) if (l.world) expect(m.byId.get(l.id)).toBe(l.world);
    expect(m.worlds.map((w) => w.id)).toEqual(model.worlds.map((w) => w.id));
    // The manifest is the map's own, untouched.
    expect(m.byId.get("example")!.manifest.url).toBe(`${NEXUS_URL}/example`);
  });

  it("changes nothing seen from the Nexus's own site, and leaves the model it was given alone", () => {
    const m = servedFrom(model, `${NEXUS_URL}/?world`);
    expect(m.worlds.map((w) => w.url)).toEqual(model.worlds.map((w) => w.url));
    servedFrom(model, preview);
    expect(model.byId.get("example")!.url).toBe(`${NEXUS_URL}/example`);
  });
});
