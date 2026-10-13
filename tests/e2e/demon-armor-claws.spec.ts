/**
 * Demon Armor's claws in a real browser, Italian, dark theme, desktop and phone:
 * worn and attuned, the Unarmed Strike on the Play board deals 1d8 + STR Slashing
 * instead of 1 + STR Bludgeoning. Review shots land under REVIEW_SHOTS when set,
 * else in the test output.
 */
import { test, expect } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";

test.describe.configure({ timeout: 90_000 });

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

for (const size of ["desktop", "mobile"] as const) {
  test(`Demon Armor claws on the Unarmed Strike (it, dark, ${size})`, async ({
    page,
  }) => {
    await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
    await seedLang(page, "it");
    await seedUI(page, "dark", "play");
    await page.goto("/characters/scn-demon-armor?tab=play");
    const unarmed = page.getByText("Colpo Senz'armi").first();
    await unarmed.waitFor({ timeout: 60_000 });
    await unarmed.scrollIntoViewIfNeeded();
    await expect(page.getByText(/1d8\+3/).first()).toBeVisible();
    await freezeMotion(page);
    await page.screenshot({ path: shotPath(`unarmed-${size}.png`) });
  });
}
