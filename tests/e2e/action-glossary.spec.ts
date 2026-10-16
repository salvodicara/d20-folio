/**
 * Beginner glossary on the base action cards, Italian, dark theme, desktop and phone:
 * the card's name is a GlossaryTip, so tapping "Schivata" opens its plain-language
 * line. The Use button beside it stays its own control: the tap spends nothing.
 * Before/after shots land under REVIEW_SHOTS when set, else in the test output dir.
 */
import { test, expect } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";
import itGlossary from "../../src/i18n/it/ui/glossary.json" with { type: "json" };

test.describe.configure({ timeout: 90_000 });

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

for (const size of ["desktop", "mobile"] as const) {
  test(`tapping Dodge's name explains it (it, dark, ${size})`, async ({ page }) => {
    await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
    await seedLang(page, "it");
    await seedUI(page, "dark", "play");
    await page.goto("/characters/scn-champion-6?tab=play");
    const allChip = page.getByRole("button", { name: /^tutti$/i });
    await expect(allChip).toBeVisible({ timeout: 45_000 });
    await allChip.click();
    await freezeMotion(page);

    const tip = page.getByRole("button", { name: "Scopri cosa significa Schivata" });
    await tip.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shotPath(`action-glossary-before-${size}.png`) });

    await tip.click();
    const pop = page.locator(".glossary-pop");
    await expect(pop).toBeVisible();
    await expect(pop).toContainText("Schivata");
    await expect(pop).toContainText(itGlossary.glossary.term["base-dodge"]);
    await page.screenshot({ path: shotPath(`action-glossary-after-${size}.png`) });

    // Reading the line spends nothing: the Use button is still live.
    await page.keyboard.press("Escape");
    await expect(pop).toBeHidden();
    await expect(page.getByRole("button", { name: "Usa: Schivata" })).toBeEnabled();
  });
}
