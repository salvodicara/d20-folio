/**
 * monster-chip-outside-commit — the DM types a monster's AC or initiative and taps
 * elsewhere (the usual way to close a phone keyboard): the typed value is kept, exactly
 * like the PC initiative chip. Escape still cancels. Real Chromium, dev campaign,
 * Italian, desktop and phone.
 */

import { test, expect, type Page } from "@playwright/test";
import { seedUI, seedLang } from "./surfaces";

async function boot(page: Page, mode: "1" | "gathering"): Promise<void> {
  await seedUI(page, "dark", "play");
  await seedLang(page, "it");
  await page.addInitScript(
    (m) => window.localStorage.setItem("d20-dev-encounter", m),
    mode
  );
  await page.goto("/campaigns/DEVCAMPAIGN24");
  await expect(
    page.getByRole("button", { name: /aggiungi mostro/i }).first()
  ).toBeVisible({ timeout: 60_000 });
}

/** A tap on the page's empty left margin — outside every card and popover. */
const tapOutside = (page: Page) => page.mouse.click(4, 300);

for (const leg of [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
] as const) {
  test(`a typed monster AC survives a tap outside; Escape cancels (${leg.name})`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(leg.viewport);
    await boot(page, "1");
    const ac = page.getByRole("button", { name: /^ca di goblin$/i });
    const input = page.getByRole("textbox", { name: /^ca di goblin$/i });
    await ac.scrollIntoViewIfNeeded();

    await ac.click();
    await input.fill("11");
    await tapOutside(page);
    await expect(input).toHaveCount(0);
    await expect(ac).toContainText("11");
    await expect(
      page.locator(".encounter-feed-line").filter({ hasText: "Goblin: CA 13 → 11" })
    ).toHaveCount(1);
    await page.screenshot({ path: test.info().outputPath(`ac-outside-${leg.name}.png`) });

    await ac.click();
    await input.fill("19");
    await input.press("Escape");
    await expect(input).toHaveCount(0);
    await expect(ac).toContainText("11");
  });

  test(`a typed monster initiative survives a tap outside (${leg.name})`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(leg.viewport);
    await boot(page, "gathering");
    const init = page.getByRole("button", { name: /^iniziativa di goblin chief$/i });
    const input = page.getByRole("textbox", { name: /^iniziativa di goblin chief$/i });
    await init.scrollIntoViewIfNeeded();
    await init.click();
    await input.fill("12");
    await tapOutside(page);
    await expect(input).toHaveCount(0);
    await expect(init).toContainText("12");
    await page.screenshot({
      path: test.info().outputPath(`init-outside-${leg.name}.png`),
    });
  });
}
