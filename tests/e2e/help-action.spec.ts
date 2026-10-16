/**
 * The Help action in a shared encounter, Italian, dark theme, desktop and phone: the
 * card's detail states both SRD options; one tap asks "su chi?" (never me), picking
 * the Goblin says the allies' next attack on it has Advantage, and the use is logged.
 * Review shots land under REVIEW_SHOTS when set, else in the test output dir.
 */
import { test, expect, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";

// Cold dev-server compiles under parallel workers can exceed the default 30 s.
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
  await page.goto("/characters/scn-champion-6?tab=play");
  const allChip = page.getByRole("button", { name: /^tutti$/i });
  await expect(allChip).toBeVisible({ timeout: 45_000 });
  await allChip.click();
  await freezeMotion(page);
}

for (const size of ["desktop", "mobile"] as const) {
  test(`Help names the Goblin (it, dark, ${size})`, async ({ page }) => {
    await openSheet(page, size);
    const use = page.getByRole("button", { name: "Usa: Aiuto" });
    await use.scrollIntoViewIfNeeded();
    const card = page.locator("article.uc", { has: use }).first();
    await card.locator("button.uc-row-toggle").click();
    await expect(card.getByText(/^Aiutare una prova di caratteristica/)).toBeVisible();
    await card.screenshot({ path: shotPath(`help-card-${size}.png`) });

    await use.click();
    const picker = page.getByRole("dialog", { name: /Aiuto: su chi\?/i });
    await expect(picker).toBeVisible();
    // Never me: the Champion is not among the picks.
    await expect(picker.locator(".cl-target")).toHaveCount(3);
    await page.screenshot({ path: shotPath(`help-picker-${size}.png`) });

    await picker
      .locator('.cl-target[data-side="enemy"]')
      .filter({ hasText: /^.?Goblin$/ })
      .click();
    await expect(
      page.getByText(
        "Aiuto: il prossimo tiro per colpire di un alleato contro Goblin ha Vantaggio, fino all'inizio del tuo prossimo turno"
      )
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Usata: Aiuto" })).toBeDisabled();
    await page.screenshot({ path: shotPath(`help-used-${size}.png`) });
  });
}
