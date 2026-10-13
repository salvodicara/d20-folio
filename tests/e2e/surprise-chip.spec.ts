/**
 * Surprise by the turn meter's initiative entry, Italian, dark theme, desktop and
 * phone: one tap lights "Sorpreso" and the header's Init tile shows Disadvantage;
 * a second tap clears it. Review shots land under REVIEW_SHOTS when set, else in
 * the test output dir.
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
  await page.goto("/characters/scn-weapon-mastery-numbers?tab=play");
  await expect(page.getByRole("button", { name: /^tutti$/i })).toBeVisible({
    timeout: 45_000,
  });
  await freezeMotion(page);
}

for (const size of ["desktop", "mobile"] as const) {
  test(`Surprise chip by the initiative roll (it, dark, ${size})`, async ({ page }) => {
    await openSheet(page, size);
    const meter = page.locator(".turn .init");
    const chip = meter.getByRole("button", { name: "Sorpreso" });
    const disMark = page.locator('.v-adv[data-adv="dis"]');
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await expect(disMark).toHaveCount(0);
    await meter.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shotPath(`surprise-off-${size}.png`) });

    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Sorpreso: Svantaggio all'Iniziativa")).toBeVisible();
    await expect(disMark).toBeVisible();
    await page.screenshot({ path: shotPath(`surprise-on-${size}.png`) });

    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await expect(disMark).toHaveCount(0);
  });
}
