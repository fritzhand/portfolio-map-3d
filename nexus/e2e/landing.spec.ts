import { expect, expectAccessible, picture, sceneReady, test } from "./fixtures.ts";

test.describe("the landing page", () => {
  test("shows the headline, the 3D hero and the way into the world", async ({ page }, info) => {
    await page.goto("/?sample");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await sceneReady(page);
    await picture(page, info, "landing");
    await page.getByRole("button", { name: /Browse maps/ }).click();
    await expect(page).toHaveURL(/\?world&sample$/);
    await expect(page.getByRole("search")).toBeVisible();
  });

  test("has no accessibility problem axe can find", async ({ page }) => {
    await page.goto("/?sample");
    await sceneReady(page);
    await expectAccessible(page);
  });
});
