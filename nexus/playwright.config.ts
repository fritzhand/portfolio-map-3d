/* Browser tests for the Nexus (nexus/e2e): the built site, served by `vite preview`, in headless
   Chromium at a desktop and a phone size. The 3D scene renders in software (SwiftShader), so the
   tests need no GPU. Every test reads the fictional sample network (&sample), never network.json.

   Run them from the repository root with `npm run nexus:e2e` (it builds first; the first time,
   `npx playwright install chromium` fetches the browser). Each test saves a picture of what it
   saw under test-results/nexus. NEXUS_E2E_CHROMIUM names a Chromium already on the machine, for
   one that cannot download Playwright's. */
import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const PORT = 4180;
const CI = !!process.env.CI;
const chromium = process.env.NEXUS_E2E_CHROMIUM;

export default defineConfig({
  testDir: "e2e",
  outputDir: "../test-results/nexus",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Camera moves are instant under reduced motion, so a test sees a settled scene.
    contextOptions: { reducedMotion: "reduce" },
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"], ...(chromium ? { executablePath: chromium } : {}) },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `npx vite preview --config nexus/vite.config.ts --port ${PORT} --strictPort`,
    cwd: repo,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
  },
});
