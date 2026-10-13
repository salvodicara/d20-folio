/**
 * monster-damage-defenses — the DM's monster defenses in REAL Chromium (dev-bypass,
 * the seeded `mock-1` encounter, Italian, dark), desktop + phone:
 *   • damaging a fire-resistant monster: the HP popover offers the monster's
 *     defended types as chips, "Fuoco" previews 10 → 5 · Resistenza, Danno books 5;
 *   • the condition picker of a monster immune to Poisoned/Exhaustion (Zombi) does
 *     not offer those conditions at all (the Picker Doctrine: hidden, not greyed).
 */

import { test, expect, type Page } from "@playwright/test";
import { seedUI, seedLang } from "./surfaces";

const dialog = (page: Page) => page.getByRole("dialog");

/** Boot the dev encounter as its DM (IT, dark) and add one bestiary monster. */
async function bootWithMonster(page: Page, search: string, pick: RegExp): Promise<void> {
  await seedUI(page, "dark", "play");
  await seedLang(page, "it");
  await page.addInitScript(() => window.localStorage.setItem("d20-dev-encounter", "1"));
  await page.goto("/campaigns/mock-1");
  // Ready when the DM's "Aggiungi mostro" shows. A bare /coralino/ text match can
  // land on the phone's hidden turn pip ("Turno di Coralino…") first.
  await expect(
    page.getByRole("button", { name: /aggiungi mostro/i }).first()
  ).toBeVisible({ timeout: 60_000 });

  await page
    .getByRole("button", { name: /aggiungi mostro/i })
    .first()
    .click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page)
    .getByPlaceholder(/cerca mostri/i)
    .fill(search);
  await dialog(page).getByRole("button", { name: pick }).first().click();
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
    test.setTimeout(120_000);
    if (leg.viewport) await page.setViewportSize(leg.viewport);
    await bootWithMonster(page, "testuggine dragona", /testuggine dragona/i);

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

  test(`a monster's immune conditions are not offered by its condition picker (${leg.name})`, async ({
    page,
  }) => {
    if (leg.viewport) await page.setViewportSize(leg.viewport);
    await bootWithMonster(page, "zombi", /^zombi$/i);

    const card = page.locator('li[data-combatant-id^="monster-"]').filter({
      has: page.getByRole("button", { name: /^zombi$/i }),
    });
    await card.getByRole("button", { name: /^zombi$/i }).click();
    const add = card.getByRole("button", { name: /aggiungi condizione/i });
    await add.scrollIntoViewIfNeeded();
    await add.click();
    const picker = page.getByRole("listbox", { name: /aggiungi condizione/i });
    await expect(picker).toBeVisible();
    // Zombi: immune to Poisoned and Exhaustion — neither is offered; the rest are.
    await expect(picker.locator('[data-condition="poisoned"]')).toHaveCount(0);
    await expect(picker.locator('[data-condition="exhaustion"]')).toHaveCount(0);
    await expect(picker.locator('[data-condition="prone"]')).toBeVisible();
    await expect(picker.locator("[role=option]:disabled")).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath(`conditions-${leg.name}.png`) });
  });
}
