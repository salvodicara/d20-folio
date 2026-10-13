/**
 * monster-speed — a bestiary monster's walking speed on its encounter card in REAL
 * Chromium (dev-bypass, the `mock-1` encounter, Italian, dark): a Goblin Warrior
 * added from the picker shows its stat block's Speed chip next to AC and HP.
 * Desktop + phone.
 */

import { test, expect, type Page } from "@playwright/test";
import { seedUI, seedLang } from "./surfaces";

const dialog = (page: Page) => page.getByRole("dialog");

async function bootWithGoblin(page: Page): Promise<void> {
  await seedUI(page, "dark", "play");
  await seedLang(page, "it");
  await page.addInitScript(() => window.localStorage.setItem("d20-dev-encounter", "1"));
  await page.goto("/campaigns/mock-1");
  const add = page.getByRole("button", { name: /aggiungi mostro/i }).first();
  await expect(add).toBeVisible({ timeout: 60_000 });
  await add.click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page)
    .getByPlaceholder(/cerca mostri/i)
    .fill("goblin");
  await dialog(page)
    .getByRole("button", { name: /^goblin guerriero\b/i })
    .first()
    .click();
  await dialog(page)
    .getByRole("button", { name: /aggiungi mostro/i })
    .click();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
}

for (const leg of [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
] as const) {
  test(`a bestiary monster's card shows its stat-block speed (${leg.name})`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(leg.viewport);
    await bootWithGoblin(page);

    const card = page.locator("li.combatant-card", {
      has: page.getByRole("button", { name: /punti ferita di goblin guerriero/i }),
    });
    // SRD Goblin Warrior: Speed 30 ft, shown in metres in Italian.
    const speed = card.getByLabel(/^velocità/i);
    await expect(speed).toBeVisible();
    await expect(speed).toContainText("9");
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath(`goblin-speed-${leg.name}.png`),
    });
  });
}
