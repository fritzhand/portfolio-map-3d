import { expect, expectAccessible, isPhone, openWorldList, picture, sceneReady, test } from "./fixtures.ts";

test.describe("the world", () => {
  test("lists every world and opens one from the list", async ({ page }, info) => {
    await page.goto("/?world&sample");
    await sceneReady(page);
    await picture(page, info, "overview");
    await openWorldList(page, info);
    const list = page.getByRole("navigation", { name: /^Maps/ });
    await expect(list.getByRole("listitem")).toHaveCount(8);
    await list.getByRole("button", { name: /Sample Harbor Ventures/ }).click();
    await expect(page).toHaveURL(/\?world=sample-harbor&sample$/);
    await expect(page.getByRole("heading", { level: 2, name: /Sample Harbor Ventures/ })).toBeVisible();
    await expect(page).toHaveTitle(/Sample Harbor Ventures/);
    await picture(page, info, "world-from-list");
  });

  test("opens a shared address on its world, with a button for every district", async ({ page }, info) => {
    await page.goto("/?world=sample-foundry&sample");
    await sceneReady(page);
    await expect(page.getByRole("heading", { level: 2, name: /Sample Foundry Collective/ })).toBeVisible();
    await expect(page.locator(".moon-annotation")).toHaveCount(12);
    await picture(page, info, "world-shared");
  });

  test("search finds a company and opens its world", async ({ page }, info) => {
    await page.goto("/?world&sample");
    await sceneReady(page);
    await page.getByRole("searchbox", { name: /Search companies and maps/ }).fill("robotics");
    const first = page.locator(".sr-company-main").first();
    await expect(first).toBeVisible();
    await picture(page, info, "search");
    await first.click();
    await expect(page).toHaveURL(/\?world=sample-[a-z]+&sample$/);
    await expect(page.locator(".co.is-hl")).toBeVisible();
  });

  test("welcomes an arrival from a map and offers the way back", async ({ page }, info) => {
    await page.goto("/?world&from=sample-harbor&sample");
    await sceneReady(page);
    await expect(page.getByText("You came from Sample Harbor Ventures.")).toBeVisible();
    await expect(page.getByRole("link", { name: /Back to Sample Harbor Ventures/ })).toBeVisible();
    await picture(page, info, "arrival");
  });

  test("gives a neutral note to an arrival from a map that is not a world here", async ({ page }) => {
    await page.goto("/?world&from=not-in-the-network&sample");
    await sceneReady(page);
    await expect(page.getByText("This map hasn't joined the network yet.")).toBeVisible();
    await expect(page).toHaveURL(/\?world&sample$/);
  });

  test("names every district in full beside its moon on a wide screen", async ({ page }, info) => {
    test.skip(isPhone(info), "a phone names only the chosen district");
    await page.goto("/?world=sample-foundry&sample");
    await sceneReady(page);
    const names = page.locator(".moon-annotation");
    await expect(names).toHaveCount(12);
    await expect(names.first()).toBeVisible();
    const boxes = await names.locator("span").evaluateAll((spans) =>
      spans.map((s) => {
        const r = s.getBoundingClientRect();
        return { l: r.left, t: r.top, r: r.right, b: r.bottom, cut: s.scrollWidth > s.clientWidth };
      }),
    );
    expect(boxes.filter((b) => b.cut)).toEqual([]);
    for (const a of boxes) for (const b of boxes) if (a !== b) expect(a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b, "two names overlap").toBe(false);
    await picture(page, info, "district-names");
  });

  test("keeps the district names clear of the music button", async ({ page }) => {
    // A world with few enough districts to name them all, on a phone too.
    await page.goto("/?world=sample-harbor&sample");
    await sceneReady(page);
    const names = page.locator(".moon-annotation span:visible");
    await expect(names).toHaveCount(4);
    const button = await page.getByRole("button", { name: "Music" }).boundingBox();
    expect(button).not.toBeNull();
    for (const name of await names.all()) {
      const box = await name.boundingBox();
      if (!box || !button) continue;
      const apart = box.x >= button.x + button.width || button.x >= box.x + box.width || box.y >= button.y + button.height || button.y >= box.y + box.height;
      expect(apart, "a district name sits under the music button").toBe(true);
    }
  });

  test("names only the chosen district on a phone", async ({ page }, info) => {
    test.skip(!isPhone(info), "a wide screen names every district");
    await page.goto("/?world=sample-foundry&sample");
    await sceneReady(page);
    await expect(page.locator(".moon-annotations.is-compact")).toBeAttached();
    await expect(page.locator(".moon-callout:visible")).toHaveCount(0);
    await page.locator(".district-picker-summary").click();
    const district = page.locator(".district-filter").nth(2);
    const label = (await district.getAttribute("title")) ?? "";
    await district.click();
    await expect(page.locator(".moon-callout:visible")).toHaveCount(1);
    await expect(page.locator(".moon-callout:visible span")).toHaveText(label);
    await expect(page.locator('.moon-annotation[aria-pressed="true"]')).toHaveCount(1);
    await picture(page, info, "district-chosen");
  });

  test("a moon's own target chooses its district on a phone", async ({ page }, info) => {
    test.skip(!isPhone(info), "a wide screen names every district");
    await page.goto("/?world=sample-foundry&sample");
    await sceneReady(page);
    await page.locator(".moon-annotation").first().tap();
    await expect(page.locator(".moon-callout:visible")).toHaveCount(1);
    await expect(page.locator(".district-clear")).toBeVisible();
  });

  test("the keyboard closes, searches, steps through the maps, turns and zooms", async ({ page }, info) => {
    test.skip(isPhone(info), "keyboard shortcuts are for screens with a keyboard");
    await page.goto("/?world=sample-harbor&sample");
    await sceneReady(page);
    await expect(page.getByRole("heading", { level: 2, name: /Sample Harbor Ventures/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\?world&sample$/);

    // ] and [ follow the order of the list, around its ends; 0 returns to the overview.
    const list = page.getByRole("navigation", { name: /^Maps/ });
    const first = (await list.locator(".world-pill-name").first().textContent()) ?? "";
    const last = (await list.locator(".world-pill-name").last().textContent()) ?? "";
    await page.keyboard.press("]");
    await expect(page.locator(".panel").getByRole("heading", { level: 2 })).toContainText(first);
    await page.keyboard.press("[");
    await expect(page.locator(".panel").getByRole("heading", { level: 2 })).toContainText(last);
    await page.keyboard.press("0");
    await expect(page).toHaveURL(/\?world&sample$/);

    for (const key of ["ArrowLeft", "ArrowLeft", "ArrowUp", "ArrowDown", "ArrowRight", "+", "+", "-"]) await page.keyboard.press(key);
    await picture(page, info, "after-keys");

    await page.keyboard.press("/");
    const search = page.getByRole("searchbox", { name: /Search companies and maps/ });
    await expect(search).toBeFocused();
    // A key typed into a field is text, not a shortcut.
    await page.keyboard.type("0]");
    await expect(search).toHaveValue("0]");
    await expect(page).toHaveURL(/\?world&sample$/);
  });

  test("? lists the keyboard shortcuts, and Esc hides the list", async ({ page }, info) => {
    test.skip(isPhone(info), "keyboard shortcuts are for screens with a keyboard");
    await page.goto("/?world&sample");
    await sceneReady(page);
    const card = page.getByRole("region", { name: "Keyboard" });
    await expect(card).toBeHidden();
    await page.keyboard.press("?");
    await expect(card).toBeVisible();
    await expect(card.getByText("Previous or next map")).toBeVisible();
    await expectAccessible(page);
    await picture(page, info, "keyboard-list");
    await page.keyboard.press("Escape");
    await expect(card).toBeHidden();
    await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
    await expect(card).toBeVisible();
  });

  test("has no accessibility problem axe can find, in the overview and with a world open", async ({ page }) => {
    await page.goto("/?world&sample");
    await sceneReady(page);
    await expectAccessible(page);
    await page.goto("/?world=sample-foundry&sample");
    await sceneReady(page);
    await expect(page.getByRole("heading", { level: 2, name: /Sample Foundry Collective/ })).toBeVisible();
    await expectAccessible(page);
  });
});

test.describe("with motion", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("flies to a world and back to the overview", async ({ page }, info) => {
    await page.goto("/?world&sample");
    await sceneReady(page);
    await openWorldList(page, info);
    await page.getByRole("navigation", { name: /^Maps/ }).getByRole("button", { name: /Sample Coastline Fund/ }).click();
    await expect(page.getByRole("heading", { level: 2, name: /Sample Coastline Fund/ })).toBeVisible();
    // Nothing on the page marks the end of a flight. The wait is only for the picture, so that it
    // shows the view the flight ends on; no assertion depends on it.
    await page.waitForTimeout(2500);
    await picture(page, info, "world-after-flight");
    await page.getByRole("button", { name: /Overview/ }).click();
    await expect(page).toHaveURL(/\?world&sample$/);
  });
});
