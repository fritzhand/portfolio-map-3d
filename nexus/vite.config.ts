/* The Nexus: the framework's landing page and the shared world every map links to.
   A separate Vite app rooted here (nexus/), built to nexus/dist. It reads the protocol from
   ../federation, so the dev server may serve files from the whole repository.

   It is served at the root of its domain (NEXUS_URL, https://wearenexus.xyz), but it may also live
   under a path: set NEXUS_BASE to that path ("/some/path/"); the default is "/". Every URL the app
   builds goes through import.meta.env.BASE_URL, so either works. */
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { NEXUS_URL } from "../federation/protocol.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("..", import.meta.url));

/** The path the Nexus is served under: "/" or "/some/path/" (leading and trailing slash). */
function basePath(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v || v === "/") return "/";
  if (!/^\/[A-Za-z0-9._~\-/]*$/.test(v) || v.includes("..")) throw new Error(`NEXUS_BASE must be a path like "/some/path/", not ${JSON.stringify(v)}`);
  return `/${v.replace(/^\/+|\/+$/g, "")}/`;
}

/** index.html writes its absolute URLs as __NEXUS_URL__/…; this fills in the protocol's address. */
function nexusUrlPlugin(): Plugin {
  return {
    name: "nexus-url",
    transformIndexHtml: (html) => html.replaceAll("__NEXUS_URL__", NEXUS_URL.replace(/\/+$/, "")),
  };
}

export default defineConfig({
  root: here,
  base: basePath(process.env.NEXUS_BASE),
  publicDir: "public",
  plugins: [react(), nexusUrlPlugin()],
  // No environment variable reaches the browser by prefix: the Nexus needs none.
  envPrefix: "NEXUS_CLIENT_ENV_DISABLED_",
  // The one build-time value: link the maps published with the Nexus on this deployment
  // (previews only; ../vite.config.ts linkThisDeployment).
  define: { __LINK_THIS_DEPLOYMENT__: JSON.stringify(process.env.VERCEL_ENV === "preview" || process.env.LINK_THIS_DEPLOYMENT === "1") },
  server: {
    port: 5180,
    // ../federation (the protocol) and ../node_modules live outside the Vite root.
    fs: { allow: [repo] },
  },
  preview: { port: 4180 },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    // three.js is one module of about 700 kB (minified); it loads after the landing text.
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30 },
            { name: "three", test: /node_modules[\\/]three[\\/]/, priority: 20 },
          ],
        },
      },
    },
  },
  test: {
    root: here,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
