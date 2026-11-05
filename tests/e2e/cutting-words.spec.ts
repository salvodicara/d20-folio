/**
 * Cutting Words in a fight, Italian, dark theme, desktop and phone: the reaction asks
 * «Su chi?» (never me) and «Su quale tiro?», says the Bardic Inspiration die to roll
 * and subtract, and «Usa la Reazione» spends the Reaction and the use, with a toast
 * that names the die, the roll and the target. Review shots land under REVIEW_SHOTS
 * when set, else in the test output dir.
 */
import { test, expect, type Page } from "@playwright/test";
import {
  DESKTOP,
  MOBILE,
  freezeMotion,
  seedLang,
  seedUI,
  startSoloFight,
} from "./surfaces";

test.describe.configure({ timeout: 90_000 });

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

async function openSheet(page: Page, size: "desktop" | "mobile") {
  await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
  await seedLang(page, "it");
  await seedUI(page, "dark", "play");
  // The dev encounter: Goblin, Goblin Chief and Ogre to pick from.
  await page.addInitScript(() =>
    window.localStorage.setItem("d20-dev-combat-chronicle", "1")
  );
  await page.goto("/characters/scn-lore-bard-10?tab=play");
  const allChip = page.getByRole("button", { name: /^tutti$/i });
  await expect(allChip).toBeVisible({ timeout: 45_000 });
  await allChip.click();
  await freezeMotion(page);
  await startSoloFight(page);
}

for (const size of ["desktop", "mobile"] as const) {
  test(`Cutting Words cuts the Ogre's attack (it, dark, ${size})`, async ({ page }) => {
    await openSheet(page, size);
    const use = page.getByRole("button", { name: /^Reaz: Parole Taglienti$/i });
    await use.scrollIntoViewIfNeeded();
    const card = page.locator("article.uc", { has: use }).first();
    await card.screenshot({ path: shotPath(`cutting-words-card-${size}.png`) });

    await use.click();
    const dialog = page.getByRole("dialog", { name: "Parole Taglienti" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Su chi?")).toBeVisible();
    // Never me: the Bard is not among the picks.
    await expect(dialog.locator(".cl-target")).toHaveCount(3);
    await dialog
      .locator('.cl-target[data-side="enemy"]')
      .filter({ hasText: "Ogre" })
      .click();
    await dialog.getByRole("button", { name: "Tiro per colpire" }).click();
    await expect(
      dialog.getByText("Tira 1d10 e sottrailo da quel tiro.").first()
    ).toBeVisible();
    await page.screenshot({ path: shotPath(`cutting-words-dialog-${size}.png`) });

    await dialog.getByRole("button", { name: "Usa la Reazione" }).click();
    await expect(
      page.getByText(
        /Parole Taglienti su Ogre \(tiro per colpire\): tira 1d10 e sottrailo/i
      )
    ).toBeVisible();
    await page.screenshot({ path: shotPath(`cutting-words-used-${size}.png`) });
  });
}
