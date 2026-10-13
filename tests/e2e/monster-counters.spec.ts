/**
 * monster-counters — the DM's counters on a monster's statblock disclosure in REAL
 * Chromium (dev-bypass, the seeded `mock-1` encounter, Italian, dark): an adult red
 * dragon's legendary pips and Fire Breath recharge toggle, then a mage's per-day
 * spells, whose tap lands "Mago lancia …" in the Combat Chronicle. Desktop + phone.
 */

import { test, expect, type Locator, type Page } from "@playwright/test";
import { seedUI, seedLang } from "./surfaces";

const dialog = (page: Page) => page.getByRole("dialog");

async function addMonster(page: Page, query: string, name: RegExp): Promise<void> {
  await page
    .getByRole("button", { name: /aggiungi mostro/i })
    .first()
    .click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page)
    .getByPlaceholder(/cerca mostri/i)
    .fill(query);
  await dialog(page).getByRole("button", { name }).first().click();
  await dialog(page)
    .getByRole("button", { name: /aggiungi mostro/i })
    .click();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
}

/** Expand the combatant's DM disclosure and open its statblock modal. */
async function openStatblock(page: Page, name: string): Promise<Locator> {
  // By the card's own toggle name: a PC wizard's card also reads "Mago".
  const card = page
    .locator('li[data-combatant-id^="monster-"]')
    .filter({ has: page.getByRole("button", { name, exact: true }) })
    .first();
  const toggle = card.locator(".party-head-toggle").first();
  await toggle.scrollIntoViewIfNeeded();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await card.getByRole("button", { name: /blocco statistiche/i }).click();
  const modal = dialog(page);
  await expect(modal.locator(".mon-ref")).toBeVisible();
  return modal;
}

for (const leg of [
  { name: "desktop", viewport: null },
  { name: "mobile", viewport: { width: 390, height: 844 } },
] as const) {
  test(`the DM spends a monster's legendary actions, recharge and spells (${leg.name})`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    if (leg.viewport) await page.setViewportSize(leg.viewport);
    await seedUI(page, "dark", "play");
    await seedLang(page, "it");
    await page.addInitScript(() => window.localStorage.setItem("d20-dev-encounter", "1"));
    await page.goto("/campaigns/mock-1");
    await expect(
      page.getByRole("button", { name: /aggiungi mostro/i }).first()
    ).toBeVisible({ timeout: 60_000 });
    await addMonster(page, "drago rosso adulto", /drago rosso adulto/i);
    await addMonster(page, "mago", /^mago\b/i);
    // Let the "added" toasts go so they don't cover the screenshots.
    await expect(page.getByText(/aggiunto allo scontro/i)).toHaveCount(0, {
      timeout: 20_000,
    });

    // ── The dragon: legendary pool, Fire Breath, Legendary Resistance ──────────
    let modal = await openStatblock(page, "Drago rosso adulto");
    const legendary = modal.locator('[data-use="legendary"]');
    await expect(legendary.getByRole("button")).toHaveCount(3);
    await legendary.locator('[data-on="true"]').first().click();
    await legendary.locator('[data-on="true"]').first().click();
    await expect(legendary.locator('[data-on="true"]')).toHaveCount(1);

    const breath = modal.locator('[data-use="actions:fire-breath"]');
    await expect(breath).toHaveText("Ricarica 5–6: pronta");
    await breath.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath(`dragon-breath-ready-${leg.name}.png`),
    });
    await breath.click();
    await expect(breath).toHaveText("Ricarica 5–6: usata");
    await expect(breath).toHaveAttribute("aria-pressed", "true");

    const resistance = modal.locator('[data-use="traits:legendary-resistance"]');
    await expect(resistance.getByRole("button")).toHaveCount(3);
    await resistance.locator('[data-on="true"]').first().click();

    await resistance.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`dragon-top-${leg.name}.png`) });
    await breath.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath(`dragon-actions-${leg.name}.png`),
    });
    await legendary.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath(`dragon-legendary-${leg.name}.png`),
    });
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);

    // Reopening reads the spent counters back off the encounter.
    modal = await openStatblock(page, "Drago rosso adulto");
    await expect(modal.locator('[data-use="legendary"] [data-on="true"]')).toHaveCount(1);
    await expect(modal.locator('[data-use="actions:fire-breath"]')).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);

    // ── The mage: per-day spells, one tap casts and logs ───────────────────────
    modal = await openStatblock(page, "Mago");
    const fireball = modal.locator('[data-use="actions:spellcasting:fireball"]');
    await expect(fireball.getByRole("button")).toHaveCount(2);
    await fireball.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath(`mage-spells-${leg.name}.png`),
    });
    await fireball
      .getByRole("button", { name: /lancia palla di fuoco/i })
      .first()
      .click();
    await expect(fireball.locator('[data-on="true"]')).toHaveCount(1);
    await page.screenshot({
      path: test.info().outputPath(`mage-spells-spent-${leg.name}.png`),
    });

    // The spell's name opens its compendium entry.
    await modal.locator('[data-spell="fireball"]').first().click();
    await expect(page.getByRole("dialog", { name: /palla di fuoco/i })).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`mage-spell-detail-${leg.name}.png`),
    });
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);

    // The cast is in the Combat Chronicle.
    await expect(page.getByText(/mago lancia palla di fuoco/i).first()).toBeAttached();
  });
}
