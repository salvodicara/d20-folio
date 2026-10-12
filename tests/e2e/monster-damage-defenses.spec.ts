/**
 * monster-damage-defenses — the DM damages a fire-resistant monster from its HP
 * popover in REAL Chromium (dev-bypass, the seeded `mock-1` encounter, Italian,
 * dark): the popover offers the monster's defended types as chips, picking
 * "Fuoco" previews 10 → 5 · Resistenza, and Danno books 5. Desktop + phone.
 */

import { test, expect, type Page } from "@playwright/test";
import { seedUI, seedLang } from "./surfaces";

const dialog = (page: Page) => page.getByRole("dialog");

async function bootWithDragonTurtle(page: Page): Promise<void> {
  await seedUI(page, "dark", "play");
  await seedLang(page, "it");
  await page.addInitScript(() => window.localStorage.setItem("d20-dev-encounter", "1"));
  await page.goto("/campaigns/mock-1");
  await expect(page.getByText(/coralino/i).first()).toBeVisible({ timeout: 20_000 });

  await page
    .getByRole("button", { name: /aggiungi mostro/i })
    .first()
    .click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page)
    .getByPlaceholder(/cerca mostri/i)
    .fill("testuggine dragona");
  await dialog(page)
    .getByRole("button", { name: /testuggine dragona/i })
    .first()
    .click();
  await dialog(page)
    .getByRole("button", { name: /aggiungi mostro/i })
    .click();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
}

for (const leg of [
  { name: "desktop", viewport: null },
  { name: "mobile", viewport: { width: 390, height: 844 } },
] as const) {
  test(`the DM's fire damage on a fire-resistant monster is halved (${leg.name})`, async ({
    page,
  }) => {
    if (leg.viewport) await page.setViewportSize(leg.viewport);
    await bootWithDragonTurtle(page);

    const hp = page.getByRole("button", { name: /punti ferita di testuggine dragona/i });
    await hp.scrollIntoViewIfNeeded();
    await hp.click();
    const popover = page.getByRole("dialog", { name: /punti ferita di testuggine/i });
    await expect(popover).toBeVisible();
    await popover.getByLabel(/quantità di danni/i).fill("10");
    const types = popover.getByRole("group", { name: /tipo di danno/i });
    await types.getByRole("button", { name: "Fuoco" }).click();
    await expect(popover.getByText("10 → 5 · Resistenza")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`popover-${leg.name}.png`) });

    await popover.getByRole("button", { name: /^danno$/i }).click();
    await expect(hp).toContainText("351");
    await page.screenshot({ path: test.info().outputPath(`applied-${leg.name}.png`) });
  });
}
