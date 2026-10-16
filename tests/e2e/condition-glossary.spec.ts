/**
 * Beginner glossary on the condition chip, Italian, dark theme, desktop and phone:
 * the chip's name is a GlossaryTip, so a tap opens the plain-language line
 * ("Mentre sei Prono sei a terra…"). The × beside it still removes the condition.
 * Before/after shots land under REVIEW_SHOTS when set, else in the test output dir.
 */
import { test, expect } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";
import { addCondition } from "./sheet-steps";
import itGlossary from "../../src/i18n/it/ui/glossary.json" with { type: "json" };

test.describe.configure({ timeout: 90_000 });

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

for (const size of ["desktop", "mobile"] as const) {
  test(`tapping a condition chip explains it (it, dark, ${size})`, async ({ page }) => {
    await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
    await seedLang(page, "it");
    await seedUI(page, "dark", "play");
    await page.goto("/characters/scn-weapon-mastery-numbers?tab=play");
    await expect(page.getByRole("button", { name: /^tutti$/i })).toBeVisible({
      timeout: 45_000,
    });
    await freezeMotion(page);
    await addCondition(page, "Prono");

    // The condition is a badge under the name; tapping it explains it in plain words.
    const badge = page
      .getByRole("group", { name: "Effetti attivi" })
      .getByRole("button", { name: "Prono" });
    await badge.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shotPath(`condition-glossary-before-${size}.png`) });

    await badge.click();
    const pop = page.locator(".status-pop", { hasText: itGlossary.glossary.term.prone });
    await expect(pop).toBeVisible();
    await expect(pop).toContainText("Prono");
    await page.screenshot({ path: shotPath(`condition-glossary-after-${size}.png`) });

    // Its popover also ends it: the condition stays until that is used.
    await expect(pop.getByRole("button", { name: "Rimuovi Prono" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(pop).toBeHidden();
    await expect(badge).toBeVisible();
  });
}
