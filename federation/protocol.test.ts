import { describe, expect, it } from "vitest";
import { ACCEPTED_NEXUS_URLS, ID_PATTERN, SHARED_HOSTS, canVouch, MAINTAINERS, MANIFEST_FILE, NEXUS_URL, OWNER_DNS_LABEL, arrivalFrom, bareHost, cameFromNexus, instanceHref, manifestUrl, nexusHref, normalizeUrl, onPublisherDomain, onThisDeployment, ownerTxtValue, pageLinksTo } from "./protocol.ts";

describe("the protocol's constants", () => {
  it("names the Nexus as an https base URL (a path allowed, no trailing slash), and accepts it", () => {
    expect(normalizeUrl(NEXUS_URL)).toBe(NEXUS_URL);
    expect(NEXUS_URL.startsWith("https://")).toBe(true);
    expect(ACCEPTED_NEXUS_URLS).toContain(NEXUS_URL);
  });

  it("takes ids of lowercase letters, digits and single hyphens, 2 to 48 characters", () => {
    for (const ok of ["ab", "example-collective", "a1-b2-c3", "x".repeat(48)]) expect(ID_PATTERN.test(ok), ok).toBe(true);
    for (const bad of ["a", "x".repeat(49), "Acme", "acme_ventures", "-acme", "acme-", "acme--ventures", "acme ventures", ""]) expect(ID_PATTERN.test(bad), bad).toBe(false);
  });
});

describe("nexusHref", () => {
  it("opens the Nexus's world view, turned to the instance the visitor came from", () => {
    expect(nexusHref("example-collective")).toBe(`${NEXUS_URL}/?world&from=example-collective`);
    expect(nexusHref("example-collective", "portal")).toBe(`${NEXUS_URL}/?world&from=example-collective&via=portal`);
    expect(nexusHref(null)).toBe(`${NEXUS_URL}/?world`);
  });

  it("drops an id that is not one, rather than escaping it", () => {
    expect(nexusHref("Bad Id&x=1")).toBe(`${NEXUS_URL}/?world`);
    expect(nexusHref("")).toBe(`${NEXUS_URL}/?world`);
  });

  it("takes another base URL, keeping its path but not its query", () => {
    expect(nexusHref("acme", "link", "https://nexus.example/some/path/?x=1")).toBe("https://nexus.example/some/path/?world&from=acme");
    expect(nexusHref("acme", "link", "https://nexus.example")).toBe("https://nexus.example/?world&from=acme");
  });
});

describe("instanceHref", () => {
  it("links into an instance from the Nexus, optionally to one of its companies", () => {
    expect(instanceHref("https://map.example.org")).toBe("https://map.example.org/?from=nexus");
    expect(instanceHref("https://map.example.org/", "signalforge")).toBe("https://map.example.org/?from=nexus&company=signalforge");
    expect(instanceHref("https://example.org/map", "signalforge")).toBe("https://example.org/map/?from=nexus&company=signalforge");
  });

  it("leaves out a company slug that is not an id", () => {
    expect(instanceHref("https://map.example.org", "<script>")).toBe("https://map.example.org/?from=nexus");
    expect(instanceHref("https://map.example.org", null)).toBe("https://map.example.org/?from=nexus");
  });
});

describe("manifestUrl", () => {
  it("puts the manifest next to the map's index.html, with or without a trailing slash or a path", () => {
    expect(manifestUrl("https://map.example.org")).toBe(`https://map.example.org/${MANIFEST_FILE}`);
    expect(manifestUrl("https://map.example.org/")).toBe(`https://map.example.org/${MANIFEST_FILE}`);
    expect(manifestUrl("https://example.org/map")).toBe(`https://example.org/map/${MANIFEST_FILE}`);
    expect(MANIFEST_FILE).toBe("portfolio-map.json");
  });
});

describe("normalizeUrl", () => {
  it("drops a trailing slash, the query and the hash", () => {
    expect(normalizeUrl("https://x.org/map/?a=1#b")).toBe("https://x.org/map");
    expect(normalizeUrl("https://x.org/")).toBe("https://x.org");
    expect(normalizeUrl("https://x.org")).toBe("https://x.org");
    expect(normalizeUrl("https://X.org//")).toBe("https://x.org");
  });

  it("is idempotent", () => {
    for (const u of ["https://x.org/map/?a=1#b", "https://x.org", "https://x.org:8443/a/b/"]) expect(normalizeUrl(normalizeUrl(u))).toBe(normalizeUrl(u));
  });

  it("throws on something that is not an address", () => {
    expect(() => normalizeUrl("not a url")).toThrow();
  });
});

describe("arrivals", () => {
  it("reads the instance a Nexus visitor came from, or null", () => {
    expect(arrivalFrom("?world&from=example-collective&via=portal")).toBe("example-collective");
    expect(arrivalFrom("?world")).toBeNull();
    expect(arrivalFrom("?from=Not%20An%20Id")).toBeNull();
    expect(arrivalFrom("")).toBeNull();
  });

  it("knows when a visitor arrived at an instance from the Nexus", () => {
    expect(cameFromNexus("?from=nexus")).toBe(true);
    expect(cameFromNexus("?company=signalforge&from=nexus")).toBe(true);
    expect(cameFromNexus("?from=elsewhere")).toBe(false);
    expect(cameFromNexus("")).toBe(false);
  });

  it("round-trips: the link out of an instance names it, and the link back says Nexus", () => {
    expect(arrivalFrom(new URL(nexusHref("example-collective", "portal")).search)).toBe("example-collective");
    expect(cameFromNexus(new URL(instanceHref("https://map.example.org", "signalforge")).search)).toBe(true);
  });
});

describe("the publisher's proof (OwnerProof)", () => {
  it("knows a map on the publisher's domain or a subdomain of it, www or not", () => {
    expect(onPublisherDomain("https://map.acme.example", "https://www.acme.example")).toBe(true);
    expect(onPublisherDomain("https://acme.example/map", "https://acme.example/")).toBe(true);
    expect(onPublisherDomain("https://community.acme.example", "https://acme.example")).toBe(true);
    expect(onPublisherDomain("https://acme-map.vercel.example", "https://acme.example")).toBe(false);
    expect(onPublisherDomain("https://notacme.example", "https://acme.example")).toBe(false);
    expect(onPublisherDomain("https://map.acme.example", null)).toBe(false);
  });

  it("finds a homepage link to the map, and not to a look-alike", () => {
    const map = "https://acme-map.vercel.example";
    expect(pageLinksTo(`<a href="https://acme-map.vercel.example/">Map</a>`, map)).toBe(true);
    expect(pageLinksTo(`<a href='https://www.acme-map.vercel.example/?view=walk'>Map</a>`, map)).toBe(true);
    expect(pageLinksTo(`<a href="https://acme-map.vercel.example.evil.example/">x</a>`, map)).toBe(false);
    expect(pageLinksTo(`<a href="/acme-map.vercel.example">x</a><p>acme-map.vercel.example</p>`, map)).toBe(false);
    expect(pageLinksTo(`<a href="https://acme.example/map/">Map</a>`, "https://acme.example/map")).toBe(true);
    expect(pageLinksTo(`<a href="https://acme.example/mapping">x</a>`, "https://acme.example/map")).toBe(false);
  });

  it("names the DNS record's value by the map's id", () => {
    expect(ownerTxtValue("acme-ventures")).toBe("portfolio-map-verification=acme-ventures");
    expect(OWNER_DNS_LABEL).toBe("_portfolio-map");
    expect(bareHost("https://WWW.Acme.Example/x")).toBe("acme.example");
    expect(MAINTAINERS.length).toBeGreaterThan(0);
  });
});

describe("shared hosting domains", () => {
  it("never vouch for a map, though a site on one is its owner's", () => {
    expect(canVouch("https://github.io")).toBe(false);
    expect(canVouch("https://www.vercel.app")).toBe(false);
    expect(canVouch(null)).toBe(false);
    expect(canVouch("https://acme.github.io")).toBe(true);
    expect(onPublisherDomain("https://someone.github.io/map", "https://github.io")).toBe(false);
    expect(onPublisherDomain("https://acme.github.io/map", "https://acme.github.io")).toBe(true);
    expect(SHARED_HOSTS).toContain("github.io");
  });
});

describe("onThisDeployment", () => {
  const preview = "https://portfolio-map-3d-abc123.vercel.app";

  it("moves an address on the Nexus's own site to the deployment it is seen from, path, query and hash kept", () => {
    expect(onThisDeployment(`${NEXUS_URL}/example`, preview)).toBe(`${preview}/example`);
    expect(onThisDeployment(`${NEXUS_URL}/example/?from=nexus&view=walk#x`, `${preview}/some/page?q=1`)).toBe(`${preview}/example/?from=nexus&view=walk#x`);
    expect(onThisDeployment(`${NEXUS_URL}/?world&from=example-collective`, "http://localhost:4173")).toBe("http://localhost:4173/?world&from=example-collective");
    for (const nexus of ACCEPTED_NEXUS_URLS) expect(onThisDeployment(`${nexus}/example`, preview)).toBe(`${preview}/example`);
  });

  it("leaves every address alone when seen from the Nexus's own site", () => {
    for (const nexus of ACCEPTED_NEXUS_URLS) expect(onThisDeployment(`${NEXUS_URL}/example`, `${nexus}/?world`)).toBe(`${NEXUS_URL}/example`);
  });

  it("leaves another site's address alone, wherever it is seen from", () => {
    for (const other of ["https://example.org/map", "https://wearenexus.xyz.example/example", "http://wearenexus.xyz/example"]) expect(onThisDeployment(other, preview)).toBe(other);
  });
});
