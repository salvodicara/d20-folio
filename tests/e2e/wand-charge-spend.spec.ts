/**
 * Wand of Lightning Bolts on the Resources rail, Italian, dark theme, desktop and
 * phone (sweep 2026-10-16). Added from the Inventory and attuned but not yet
 * equipped, its row used to show a greyed spend with no reason. Now the row
 * names the missing step ("Da equipaggiare") and offers no dead control; once
 * equipped, one tap spends a charge (7 -> 6) with an Undo toast. The count reads
 * "7/7 cariche" as one run, with no flex gap after the current value.
 * Shots land in the test output dir.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";

test.describe.configure({ timeout: 120_000 });

const WAND = "Bacchetta dei Fulmini";

async function railRow(page: Page): Promise<Locator> {
  const toggle = page.getByRole("button", { name: /^risorse$/i });
  if (await toggle.isVisible().catch(() => false)) {
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  }
  const row = page.locator(".trk", { hasText: WAND });
  await row.scrollIntoViewIfNeeded();
  return row;
}

/** Horizontal space between the bold current value and the "/7" that follows. */
async function countGap(row: Locator): Promise<number> {
  return row.locator(".trk-pool").evaluate((pool) => {
    const bold = pool.querySelector("b");
    const text = bold?.nextSibling;
    if (!bold || !text) throw new Error("count markup missing");
    const range = document.createRange();
    range.selectNodeContents(text);
    return range.getBoundingClientRect().left - bold.getBoundingClientRect().right;
  });
}

for (const size of ["desktop", "mobile"] as const) {
  test(`attuned wand: names the missing step, then spends a charge once equipped (it, dark, ${size})`, async ({
    page,
  }) => {
    await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
    await seedLang(page, "it");
    await seedUI(page, "dark", "play");
    await page.goto("/characters/mock-1?tab=inventory");
    await page.getByText("Lyra Voss").first().waitFor({ timeout: 60_000 });
    await freezeMotion(page);

    // Inventory -> Add item -> Wand of Lightning Bolts, as the player does it.
    await page
      .getByRole("button", { name: /aggiungi oggetto/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("searchbox").fill(WAND);
    await dialog
      .getByRole("button", { name: new RegExp(`^${WAND}`) })
      .first()
      .click();
    await dialog.getByRole("button", { name: "Aggiungi al Personaggio" }).click();
    await dialog.getByRole("button", { name: "Chiudi" }).first().click();
    await expect(dialog).toBeHidden();

    // Attune from the inventory card: attunement works for a Bard.
    const card = page.locator("article.uc", { hasText: WAND }).last();
    await card.getByRole("button", { name: "Sintonizza" }).click();
    await expect(card.getByRole("button", { name: "Sintonizzato" })).toBeVisible();

    // Attuned but not held: the row names the step and offers no dead control.
    let row = await railRow(page);
    await page.screenshot({ path: test.info().outputPath(`wand-blocked-${size}.png`) });
    await row.screenshot({
      path: test.info().outputPath(`wand-row-blocked-${size}.png`),
    });
    await expect(row).toContainText("Da equipaggiare");
    await expect(row.getByRole("button")).toHaveCount(0);
    await expect(row.locator(".trk-pool")).toHaveText("7/7 cariche");
    expect(await countGap(row)).toBeLessThan(1);

    // Equip from the card, then spend one charge from the rail.
    await card.getByRole("button", { name: "Equipaggia" }).click();
    row = await railRow(page);
    await expect(row).not.toContainText("Da equipaggiare");
    const spend = row.getByRole("button", { name: /^Usa / });
    await expect(spend).toBeEnabled();
    await row.screenshot({ path: test.info().outputPath(`wand-row-ready-${size}.png`) });
    await spend.click();
    await expect(row.locator(".trk-pool")).toHaveText("6/7 cariche");
    await expect(page.getByRole("button", { name: "Annulla" }).first()).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`wand-spent-${size}.png`) });
    await row.screenshot({ path: test.info().outputPath(`wand-row-spent-${size}.png`) });
  });
}
