/**
 * A failed Concentration save offers the Reaction spell that turns the d20 into a 20
 * (`failedD20Becomes`): the dev seer holds Bless, takes 30 damage (DC 15), enters a 2,
 * and «Omen of Twenty: the d20 becomes 20» keeps Bless.
 */
import { test, expect } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";

test.describe.configure({ timeout: 90_000 });

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

for (const size of ["desktop", "mobile"] as const) {
  test(`a failed Concentration save offers the 20 (${size})`, async ({ page }) => {
    await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
    await seedLang(page, "en");
    await seedUI(page, "dark", "play");
    await page.goto("/characters/scn-omen-seer?tab=play", {
      waitUntil: "domcontentloaded",
    });
    await page.getByText("Ilka, Omen Seer").first().waitFor({ timeout: 45_000 });
    await freezeMotion(page);
    await page
      .getByRole("button", { name: /hit points/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: /hit points/i });
    await dialog.getByRole("spinbutton", { name: /amount/i }).fill("30");
    await dialog.getByRole("button", { name: /^Damage$/i }).click();
    const roll = page.getByLabel(/concentration-save d20 result/i);
    await roll.fill("2");
    const use = page.getByRole("button", {
      name: /^Omen of Twenty: the d20 becomes 20$/i,
    });
    await expect(use).toBeVisible();
    await page.screenshot({ path: shotPath(`failed-d20-${size}.png`) });
    await use.click();
    await expect(use).toBeHidden();
    await expect(page.getByLabel(/concentration-save d20 result/i)).toBeHidden();
  });
}
