/**
 * monster-ac-log — the DM's in-place AC change lands in the fight's chronicle in REAL
 * Chromium (dev-bypass, the begun `mock-1` encounter, Italian, dark): the Goblin's
 * AC 13 becomes 11 on its card and the feed gains its line. Desktop + phone.
 */

import { test, expect, type Page } from "@playwright/test";
import { seedUI, seedLang } from "./surfaces";

const feed = (page: Page) =>
  page.locator("section", { hasText: "Cronaca dello scontro" }).first();

for (const leg of [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
] as const) {
  test(`the DM's AC change is logged in the chronicle (${leg.name})`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(leg.viewport);
    await seedUI(page, "dark", "play");
    await seedLang(page, "it");
    await page.addInitScript(() => window.localStorage.setItem("d20-dev-encounter", "1"));
    await page.goto("/campaigns/mock-1");

    const ac = page.getByRole("button", { name: /^ca di goblin$/i });
    await expect(ac).toBeVisible({ timeout: 60_000 });
    await expect(ac).toContainText("13");
    await ac.click();
    const input = page.getByRole("textbox", { name: /^ca di goblin$/i });
    await expect(input).toBeFocused();
    await input.fill("11");
    await input.press("Enter");
    await expect(input).toHaveCount(0);
    await expect(ac).toContainText("11");

    const line = feed(page)
      .locator(".encounter-feed-line")
      .filter({ hasText: /goblin/i })
      .filter({ hasText: "CA 13" })
      .filter({ hasText: "11" });
    await expect(line).toHaveCount(1);
    await line.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.screenshot({ path: test.info().outputPath(`ac-log-${leg.name}.png`) });
  });
}
