/**
 * The command palette's action labels wrap instead of being cut (bug sweep
 * 2026-10-13: on a phone in Italian "Segnala un problema o un'idea" read
 * "Segnala un problema o un'…"). A label names what the row does, so it is never
 * truncated (GOLDEN_RULES Gusto #11). Checked at the narrowest phone we support.
 */
import { test, expect } from "@playwright/test";
import { seedLang, seedUI } from "./surfaces";

for (const locale of ["it", "en"] as const) {
  test(`no palette label is cut on a 360px phone (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await seedUI(page, "dark", "play");
    await seedLang(page, locale);
    await page.goto("/characters/mock-1");
    await page
      .getByRole("button", { name: /search the folio|cerca nel folio/i })
      .first()
      .click();
    await expect(page.locator('[role="combobox"]')).toBeVisible();
    const cut = await page
      .locator(".palette-label")
      .evaluateAll((labels) =>
        labels
          .filter((el) => el.scrollWidth > el.clientWidth + 1)
          .map((el) => el.textContent)
      );
    expect(cut).toEqual([]);
  });
}
