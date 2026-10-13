/**
 * monster-trait-facts — the DM's Troll card in REAL Chromium (dev-bypass, the begun
 * `mock-1` encounter, Italian, dark): the card shows its Regeneration as a chip with
 * the printed numbers, and at the Troll's turn start offers "Rigenera +15", which
 * heals 64 → 79 once and then goes away for the round. Desktop + phone.
 */

import { test, expect, type Page } from "@playwright/test";
import { seedUI, seedLang } from "./surfaces";

const dialog = (page: Page) => page.getByRole("dialog");

async function bootWithTroll(page: Page): Promise<void> {
  await seedUI(page, "dark", "play");
  await seedLang(page, "it");
  await page.addInitScript(() => window.localStorage.setItem("d20-dev-encounter", "1"));
  await page.goto("/campaigns/mock-1");
  await expect(
    page.getByRole("button", { name: /aggiungi mostro/i }).first()
  ).toBeVisible({
    timeout: 60_000,
  });

  await page
    .getByRole("button", { name: /aggiungi mostro/i })
    .first()
    .click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page)
    .getByPlaceholder(/cerca mostri/i)
    .fill("troll");
  await dialog(page)
    .getByRole("button", { name: /^troll\b/i })
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
  test(`the Troll's Regeneration is a chip and a one-tap turn-start heal (${leg.name})`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    if (leg.viewport) await page.setViewportSize(leg.viewport);
    await bootWithTroll(page);

    const card = page.locator("li.combatant-card", {
      has: page.getByRole("button", { name: /punti ferita di troll/i }),
    });
    await expect(
      card.getByText("Rigenera 15 a inizio turno, non dopo danni da Acido o Fuoco")
    ).toBeVisible();

    // Hurt it: 94 → 64.
    const hp = card.getByRole("button", { name: /punti ferita di troll/i });
    await hp.scrollIntoViewIfNeeded();
    await hp.click();
    const popover = page.getByRole("dialog", { name: /punti ferita di troll/i });
    await popover.getByLabel(/quantità di danni/i).fill("30");
    await popover.getByRole("button", { name: /^danno$/i }).click();
    await expect(hp).toContainText("64");
    const regenerate = card.getByRole("button", { name: "Rigenera +15" });
    await expect(regenerate).toHaveCount(0); // not its turn yet

    // Step the table to the Troll's turn (a reinforcement joins at the end).
    const next = page.getByRole("button", { name: /turno successivo/i }).first();
    for (let i = 0; i < 12 && (await card.getAttribute("aria-current")) !== "true"; i++) {
      await next.click();
    }
    await expect(card).toHaveAttribute("aria-current", "true");
    await expect(regenerate).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`troll-turn-${leg.name}.png`) });

    await regenerate.click();
    await expect(hp).toContainText("79");
    await expect(regenerate).toHaveCount(0);
    await page.screenshot({
      path: test.info().outputPath(`troll-regenerated-${leg.name}.png`),
    });
  });
}
