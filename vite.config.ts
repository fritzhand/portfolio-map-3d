import react from "@vitejs/plugin-react";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { MANIFEST_FILE, NEXUS_META, NEXUS_URL, nexusHref } from "./federation/protocol.ts";
import { validateManifest } from "./federation/validate.ts";
import { buildManifest, readSite } from "./scripts/manifest.mjs";

const ROOT = process.cwd();

/**
 * What the production bundle keeps of the site's data files: the fields the app reads.
 * Provenance (every `sources` list, each description's and person's source, the files' _about
 * notes, the taxonomy's palette record and editors' notes) stays in site/ for the validator and
 * for maintenance, and is dropped here, so the public bundle does not show which facts came from
 * where (docs/data-contract.md: the live map shows no sources). A connection keeps only its
 * source's URL (graph.ts reads it). Dev and tests import the full files; scripts/check-bundle.mjs
 * fails the build if provenance ships.
 */
export function publicData(file: string, data: Record<string, unknown>): Record<string, unknown> {
  const { _about, _palette, $schema, ...rest } = data;
  void _about, void _palette, void $schema;
  const person = ({ source, ...p }: Record<string, unknown>) => (void source, p);
  if (file === "companies.json") {
    rest.companies = (rest.companies as Record<string, unknown>[]).map(({ sources, descriptionSource, ...m }) => {
      void sources, void descriptionSource;
      return {
        ...m,
        founders: (m.founders as Record<string, unknown>[]).map(person),
        leaders: (m.leaders as Record<string, unknown>[]).map(person),
        connections: (m.connections as { source: { url?: string } }[]).map((c) => ({ ...c, source: { url: c.source.url } })),
      };
    });
  }
  if (file === "people.json") rest.people = ((rest.people ?? []) as Record<string, unknown>[]).map(({ sources, ...c }) => (void sources, c));
  if (file === "taxonomy.json") rest.districts = (rest.districts as Record<string, unknown>[]).map(({ note, ...d }) => (void note, d));
  return rest;
}

function publicDataPlugin(): Plugin {
  const FILES = /[\\/]site[\\/](?:data[\\/])?(companies|people|taxonomy|site)\.json$/;
  return {
    name: "portfolio-map-public-data",
    apply: "build",
    enforce: "pre",
    transform(code, id) {
      const m = FILES.exec(id.split("?")[0]);
      if (!m) return null;
      return { code: JSON.stringify(publicData(`${m[1]}.json`, JSON.parse(code))), map: null };
    },
  };
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The files in site/brand/, which the build copies to /brand/ under stable names (the manifest and link previews name them). */
function brandFiles(): string[] {
  const dir = join(ROOT, "site", "brand");
  return existsSync(dir) ? readdirSync(dir).filter((f) => /\.(svg|png|webp|jpe?g|ico)$/i.test(f)) : [];
}

/**
 * The site plugin: everything index.html and dist/ need from site/.
 * - index.html: the title, description, link-preview tags, theme colors, favicon, the noscript
 *   note and the Nexus backlink (a meta tag a crawler can read without running the app).
 * - /portfolio-map.json: the manifest the Nexus reads (scripts/manifest.mjs), checked against the
 *   protocol on every build; a manifest that fails the check fails the build.
 * - /brand/*: the files of site/brand/, under their own names.
 * Paths respect Vite's `base`, so a map can live under a sub-path (sitePath() below).
 */
function sitePlugin(): Plugin {
  let base = "/";
  const manifest = () => {
    const m = buildManifest(readSite(ROOT));
    const problems = validateManifest(m);
    if (problems.length) throw new Error(`The network manifest (portfolio-map.json) is not valid:\n  ${problems.join("\n  ")}\nFix site/site.json or site/data/ (docs/network.md).`);
    return m;
  };
  return {
    name: "portfolio-map-site",
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml(html) {
      const { site } = readSite(ROOT);
      const origin = site.map.url.replace(/\/$/, "");
      const brand = brandFiles();
      const favicon = brand.find((f) => /^favicon\./i.test(f));
      const og = brand.find((f) => /^og\.(png|jpe?g)$/i.test(f));
      const t = site.theme;
      // Selectors one step more specific than tokens.css's (html:root…), so the site's theme wins
      // whichever stylesheet loads last. The scenes read the --brand-* tokens, which no theme changes.
      const light = `--brand-ink:${t.ink};--brand-accent:${t.accent};--brand-cta:${t.cta};--cta:${t.cta};--cta-hover:color-mix(in srgb, ${t.cta} 86%, white);--cta-text:${t.ctaText};--accent:${t.accent};--focus:${t.accent};--link:color-mix(in srgb, ${t.accent} 88%, black)`;
      const dark = `--accent:color-mix(in srgb, ${t.accent} 70%, white);--focus:color-mix(in srgb, ${t.accent} 60%, white);--link:color-mix(in srgb, ${t.accent} 55%, white)`;
      const vars = `html:root:root{${light}}@media (prefers-color-scheme: dark){html:root:not([data-theme="light"]){${dark}}}html:root[data-theme="dark"]{${dark}}`;
      const noscript = `This map needs JavaScript.${site.map.directoryUrl ? ` The full list is at ${site.map.directoryUrl}.` : ""} It is part of the Portfolio Map Network: ${NEXUS_URL}`;
      return html
        .replaceAll("__SITE_TITLE__", escapeHtml(site.map.title))
        .replaceAll("__SITE_DESCRIPTION__", escapeHtml(site.map.description))
        .replaceAll("__SITE_ORIGIN__", escapeHtml(origin))
        .replaceAll("__SITE_INK__", escapeHtml(t.ink))
        .replaceAll("__SITE_FAVICON__", favicon ? `${base}brand/${favicon}` : `${base}favicon.svg`)
        .replaceAll("__SITE_OG_IMAGE__", og ? `${escapeHtml(origin)}/brand/${og}` : "")
        .replace("<!--__SITE_THEME__-->", `<style>${vars}</style>`)
        .replace("<!--__SITE_NOSCRIPT__-->", escapeHtml(noscript))
        .replace("<!--__NEXUS_META__-->", `<meta name="${NEXUS_META}" content="${escapeHtml(nexusHref(site.network.id))}" />`)
        .replace(/\s*<meta property="og:image" content="" \/>/, "");
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0];
        if (path === `/${MANIFEST_FILE}`) {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(manifest(), null, 2));
          return;
        }
        const brand = path?.startsWith("/brand/") ? path.slice(7) : null;
        if (brand && brandFiles().includes(brand)) {
          const type = brand.endsWith(".svg") ? "image/svg+xml" : brand.endsWith(".png") ? "image/png" : brand.endsWith(".webp") ? "image/webp" : brand.endsWith(".ico") ? "image/x-icon" : "image/jpeg";
          res.setHeader("Content-Type", type);
          res.end(readFileSync(join(ROOT, "site", "brand", brand)));
          return;
        }
        next();
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: MANIFEST_FILE, source: `${JSON.stringify(manifest(), null, 2)}\n` });
      for (const f of brandFiles()) this.emitFile({ type: "asset", fileName: `brand/${f}`, source: readFileSync(join(ROOT, "site", "brand", f)) });
    },
  };
}

/** Fail the build on a Supabase key that must never reach a browser: a secret key, or a JWT whose role isn't anon. */
function assertPublishable(key: string, name: string) {
  if (key.startsWith("sb_secret_")) throw new Error(`Refusing to build: ${name} holds a Supabase SECRET key. Use the publishable key.`);
  const payload = key.split(".")[1];
  if (!payload) return;
  let role: unknown;
  try {
    role = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")).role;
  } catch {
    return;
  }
  if (role && role !== "anon") throw new Error(`Refusing to build: ${name} holds a Supabase key with role "${role}". Use the anon/publishable key.`);
}

/** Every variable name a live-explorer key may arrive under (by hand, or from the Vercel <> Supabase integration). */
const KEY_NAMES = ["VITE_SUPABASE_ANON_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"];

/**
 * Live-explorer config. Off unless site.json turns it on (`live.enabled`) and the build
 * environment names a Supabase project (a URL and its publishable key, docs/live-explorers.md).
 * Only a URL, a publishable/anon key and the channel name reach the bundle (as the define
 * constants below); a secret or service-role key under any of the whitelisted names fails the
 * build instead of shipping. Production deploys (VERCEL_ENV=production, or LIVE_ENV=production
 * on other hosts) join "<channel>-v1"; every other build joins "<channel>-preview", so testers
 * never appear to real visitors.
 */
function liveConfig(env: Record<string, string | undefined>) {
  const { site } = readSite(ROOT);
  const first = (...names: string[]) => names.map((n) => env[n]).find((v) => v && v.trim())?.trim() ?? "";
  for (const name of KEY_NAMES) {
    const v = env[name]?.trim();
    if (v) assertPublishable(v, name);
  }
  const base = site.live?.channel || `${site.network.id}-walk`;
  const production = env.VERCEL_ENV === "production" || env.LIVE_ENV === "production";
  const channel = `${base}-${production ? "v1" : "preview"}`;
  if (!site.live?.enabled) return { url: "", key: "", channel };
  const url = first("VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL").replace(/\/$/, "");
  const key = first(...KEY_NAMES);
  if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(url)) throw new Error(`Unexpected Supabase URL: ${url}`);
  return { url, key: url ? key : "", channel };
}

/**
 * Where the map lives under its origin, as Vite's `base`: BASE_PATH when set, else, for a build,
 * the path of site.json map.url ("https://you.github.io/my-map" -> "/my-map/"), so a map deployed
 * under a sub-path (GitHub Pages project sites) works without extra settings. The dev server
 * serves at "/"; `vite preview` at the build's base.
 */
/**
 * Whether the build links pages of the Nexus's own site (the Nexus and the example map published
 * with it) on the deployment that serves them rather than on the live site: on for Vercel preview
 * builds (VERCEL_ENV=preview) and when LINK_THIS_DEPLOYMENT=1, so a preview is self-contained; off
 * for production, so the live site and every fork keep the Nexus's own address
 * (federation/protocol.ts onThisDeployment).
 */
export function linkThisDeployment(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === "preview" || env.LINK_THIS_DEPLOYMENT === "1";
}

export function sitePath(command: "build" | "serve", env: Record<string, string | undefined> = process.env): string {
  const explicit = env.BASE_PATH?.trim();
  const raw = explicit || (command === "build" ? new URL(readSite(ROOT).site.map.url).pathname : "/");
  const path = `/${raw.replace(/^\/+|\/+$/g, "")}/`;
  return path === "//" ? "/" : path;
}

/**
 * The walk world's vendored scene (src/island) was written for three.js 0.148 and is not ported to
 * the newer three.js the rest of the app uses: its imports of "three" resolve to a second copy
 * (the "three-legacy" alias package). Only files under src/island are affected.
 */
function legacyThree(): Plugin {
  return {
    name: "island-legacy-three",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || !/[\\/]src[\\/]island[\\/]/.test(importer)) return null;
      if (source === "three") return this.resolve("three-legacy", importer, { ...options, skipSelf: true });
      if (source === "island-iroh-unused") return { id: "\0island-iroh-unused", moduleSideEffects: false };
      return null;
    },
    load(id) {
      return id === "\0island-iroh-unused" ? "export const IslandNode = class {};" : null;
    },
  };
}

export default defineConfig(({ mode, command, isPreview }) => {
  // Tests run the Supabase transport against a mocked client (src/live/session.test.ts): a stand-in
  // project, never a real one. Every other mode reads the site's settings and the environment.
  const live =
    mode === "test" ? { url: "https://test-project.supabase.co", key: "sb_publishable_test", channel: "test-walk-preview" } : liveConfig({ ...loadEnv(mode, ROOT, ""), ...process.env });
  return {
    // `vite preview` serves the build, so it takes the build's base.
    base: sitePath(isPreview ? "build" : command),
    plugins: [legacyThree(), publicDataPlugin(), react(), sitePlugin()],
    // No environment variable reaches the browser by prefix (Vite would otherwise expose every VITE_*
    // variable, all at once wherever code reads import.meta.env as an object). Nothing uses this prefix.
    envPrefix: "PORTFOLIO_MAP_CLIENT_ENV_DISABLED_",
    // The only build-time values in the bundle (read by src/live/presence.ts, src/network.ts and
    // nexus/src/hooks/useNetwork.ts under test).
    define: {
      __LIVE_URL__: JSON.stringify(live.url),
      __LIVE_KEY__: JSON.stringify(live.key),
      __LIVE_CHANNEL__: JSON.stringify(live.channel),
      __LINK_THIS_DEPLOYMENT__: JSON.stringify(mode !== "test" && linkThisDeployment()),
    },
    build: {
      target: "es2022",
      // three.js is one module of about 700 kB (minified) and loads only with the 3D views.
      chunkSizeWarningLimit: 800,
      rolldownOptions: {
        output: {
          // React gets a group of its own with the highest priority, so the shell (the List view
          // included) starts without waiting for three.js. three and r3f load with the 3D views,
          // supabase only when the walk view joins live explorers.
          codeSplitting: {
            groups: [
              { name: "react", test: /node_modules[\\/](react|react-dom|scheduler|zustand|use-sync-external-store)[\\/]/, priority: 30 },
              { name: "three", test: /node_modules[\\/]three[\\/]/, priority: 20 },
              { name: "r3f", test: /node_modules[\\/](@react-three|three-stdlib)[\\/]/, priority: 10 },
              { name: "supabase", test: /node_modules[\\/]@supabase[\\/]/, priority: 10 },
            ],
          },
        },
      },
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts", "scripts/**/*.test.mjs", "federation/**/*.test.ts", "nexus/src/**/*.test.ts", "mcp/**/*.test.mjs"],
    },
  };
});
