import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NEXUS_META, NEXUS_URL, nexusHref } from "../federation/protocol.ts";
import config, { linkThisDeployment } from "../vite.config.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const site = JSON.parse(readFileSync(join(root, "site", "site.json"), "utf8"));
const meta = (page, attr, key) => page.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1];

/** index.html as the site plugin (vite.config.ts) fills it in. */
function filled() {
  const plugin = config({ mode: "test", command: "build" }).plugins.flat().find((p) => p && p.name === "portfolio-map-site");
  return plugin.transformIndexHtml(html);
}

describe("index.html (a template the site plugin fills from site/site.json)", () => {
  it("carries a marker for every site value", () => {
    expect(html).toMatch(/<title>__SITE_TITLE__<\/title>/);
    expect(meta(html, "name", "description")).toBe("__SITE_DESCRIPTION__");
    expect(meta(html, "name", "theme-color")).toBe("__SITE_INK__");
    expect(meta(html, "property", "og:title")).toBe("__SITE_TITLE__");
    expect(meta(html, "property", "og:description")).toBe("__SITE_DESCRIPTION__");
    expect(meta(html, "property", "og:url")).toBe("__SITE_ORIGIN__/");
    expect(meta(html, "property", "og:image")).toBe("__SITE_OG_IMAGE__");
    expect(meta(html, "name", "twitter:card")).toBe("summary_large_image");
    expect(html).toContain('<link rel="icon" href="__SITE_FAVICON__" />');
    for (const marker of ["<!--__NEXUS_META__-->", "<!--__SITE_THEME__-->", "<!--__SITE_NOSCRIPT__-->"]) expect(html).toContain(marker);
  });

  it("names no organization of its own: every name comes from site.json", () => {
    for (const name of [site.org.name, site.map.title, site.map.url, site.network.id]) expect(html).not.toContain(name);
  });
});

describe("the site plugin's index.html", () => {
  const page = filled();

  it("fills in every marker", () => {
    expect(page).not.toMatch(/__SITE_[A-Z_]+__|__NEXUS_META__/);
    expect(page).toContain(`<title>${site.map.title}</title>`);
    expect(meta(page, "name", "description")).toBe(site.map.description);
    expect(meta(page, "property", "og:url")).toBe(`${site.map.url}/`);
    expect(meta(page, "name", "theme-color")).toBe(site.theme.ink);
  });

  it("carries the Nexus backlink a crawler can read", () => {
    // Escaped for the attribute: "&" is written "&amp;".
    expect(meta(page, "name", NEXUS_META)).toBe(nexusHref(site.network.id).replaceAll("&", "&amp;"));
    expect(page).toContain(`It is part of the Portfolio Map Network: ${NEXUS_URL}`);
  });

  it("applies the site's theme", () => {
    const style = page.match(/<style>(html:root:root\{[^<]*)<\/style>/)?.[1] ?? "";
    for (const v of [`--brand-ink:${site.theme.ink}`, `--brand-accent:${site.theme.accent}`, `--cta:${site.theme.cta}`, `--cta-text:${site.theme.ctaText}`]) expect(style).toContain(v);
  });

  it("uses the site's brand files when it has them, and the defaults when not", () => {
    const brand = existsSync(join(root, "site", "brand")) ? readdirSync(join(root, "site", "brand")) : [];
    const favicon = brand.find((f) => /^favicon\./i.test(f));
    const og = brand.find((f) => /^og\.(png|jpe?g)$/i.test(f));
    expect(page).toContain(`<link rel="icon" href="${favicon ? `/brand/${favicon}` : "/favicon.svg"}" />`);
    if (!favicon) expect(existsSync(join(root, "public", "favicon.svg"))).toBe(true);
    if (og) expect(meta(page, "property", "og:image")).toBe(`${site.map.url}/brand/${og}`);
    // Without an image the tag goes, rather than shipping an empty og:image.
    else expect(meta(page, "property", "og:image")).toBeUndefined();
  });
});

describe("vercel.json", () => {
  const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));

  it("builds with the validator and the bundle check, into dist/", () => {
    expect(vercel).toMatchObject({ framework: "vite", installCommand: "npm ci", buildCommand: "npm run build", outputDirectory: "dist" });
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.scripts.prebuild).toMatch(/validate-site\.mjs/);
    expect(pkg.scripts.postbuild).toMatch(/check-bundle\.mjs/);
  });

  it("sends the security headers on every page and caches the hashed assets", () => {
    const all = vercel.headers.find((h) => h.source === "/(.*)");
    expect(Object.fromEntries(all.headers.map((h) => [h.key, h.value]))).toMatchObject({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" });
    expect(vercel.headers.find((h) => h.source === "/assets/(.*)").headers[0].value).toMatch(/immutable/);
  });

  it("redirects to no host but the map's own", () => {
    for (const r of vercel.redirects ?? []) expect(new URL(r.destination.replace("$1", "")).origin).toBe(new URL(site.map.url).origin);
  });
});

describe("links on a preview deployment", () => {
  it("links the Nexus's own site on the serving deployment in preview builds only, never in production", () => {
    expect(linkThisDeployment({ VERCEL_ENV: "preview" })).toBe(true);
    expect(linkThisDeployment({ LINK_THIS_DEPLOYMENT: "1" })).toBe(true);
    expect(linkThisDeployment({ VERCEL_ENV: "production" })).toBe(false);
    expect(linkThisDeployment({ VERCEL_ENV: "development" })).toBe(false);
    expect(linkThisDeployment({})).toBe(false);
  });
});
