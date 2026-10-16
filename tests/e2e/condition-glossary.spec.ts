/**
 * Beginner glossary on the condition chip, Italian, dark theme, desktop and phone:
 * the chip's name is a GlossaryTip, so a tap opens the plain-language line
 * ("Mentre sei Prono sei a terra…"). The × beside it still removes the condition.
 * Before/after shots land under REVIEW_SHOTS when set, else in the test output dir.
 */
import { test, expect, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";
import itGlossary from "../../src/i18n/it/ui/glossary.json" with { type: "json" };

test.describe.configure({ timeout: 90_000 });

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

async function addCondition(page: Page, label: string) {
  const add = page.getByRole("button", { name: /aggiungi condizione/i }).first();
  if (!(await add.isVisible())) {
    await page
      .getByRole("button", { name: /^risorse$/i })
      .first()
      .click();
  }
  await add.click();
  const listbox = page.getByRole("listbox", { name: /aggiungi condizione/i });
  await listbox.getByRole("option", { name: label, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(listbox).toBeHidden();
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

    const tip = page.getByRole("button", { name: "Scopri cosa significa Prono" });
    await tip.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shotPath(`condition-glossary-before-${size}.png`) });

    await tip.click();
    const pop = page.locator(".glossary-pop");
    await expect(pop).toBeVisible();
    await expect(pop).toContainText("Prono");
    await expect(pop).toContainText(itGlossary.glossary.term.prone);
    await page.screenshot({ path: shotPath(`condition-glossary-after-${size}.png`) });

    // The chip's × is still its own control: the condition stays until it is used.
    await page.keyboard.press("Escape");
    await expect(pop).toBeHidden();
    await expect(page.getByRole("button", { name: "Rimuovi Prono" })).toBeVisible();
  });
}
