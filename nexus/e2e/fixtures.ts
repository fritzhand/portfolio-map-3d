/* Shared by every browser test: a test fails when the page throws, the accessibility check
   (axe-core, WCAG 2 A and AA), and the picture each test leaves behind. */
import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page, type TestInfo } from "@playwright/test";

export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await use(errors);
      expect(errors, "the page threw").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export const isPhone = (info: TestInfo) => info.project.name === "phone";

/** The 3D scene is on the page and the sample network has loaded. */
export async function sceneReady(page: Page): Promise<void> {
  await expect(page.locator("canvas.nexus-canvas")).toBeVisible();
  await expect(page.getByText("Sample data").first()).toBeVisible();
}

/** The list of worlds: always open on a wide screen, a sheet behind the Maps button on a phone. */
export async function openWorldList(page: Page, info: TestInfo): Promise<void> {
  if (isPhone(info)) await page.getByRole("button", { name: /^Maps/ }).click();
  await expect(page.getByRole("navigation", { name: /^Maps/ })).toBeVisible();
}

/** No WCAG 2 A or AA problem that axe-core can find. The 3D canvas is a picture; its label is on its host. */
export async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

/** Saves what the test saw: test-results/nexus/<test>/<name>.png. */
export async function picture(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: info.outputPath(`${name}.png`) });
}
