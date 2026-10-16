/**
 * The ×2 Difficult Terrain toggle on the movement meter, Italian, dark theme,
 * desktop and phone: with it on, 3 m marked costs 6 m of a 9 m Speed; End Turn
 * turns it off. Review shots land under REVIEW_SHOTS when set, else in the test
 * output dir.
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
  test(`×2 makes difficult terrain cost double (it, dark, ${size})`, async ({ page }) => {
    await openSheet(page, size);
    const slider = page.getByRole("slider", { name: /movimento/i }).first();
    await slider.scrollIntoViewIfNeeded();
    await expect(slider).toHaveAttribute("aria-valuenow", "30");

    const terrain = page.getByRole("button", {
      name: "Terreno difficile: il movimento costa il doppio",
    });
    await expect(terrain).toHaveAttribute("aria-pressed", "false");
    await terrain.click();
    await expect(terrain).toHaveAttribute("aria-pressed", "true");

    // Mark 3 m moved (9 → 6 remaining): through difficult terrain it costs 6 m.
    const field = page.getByRole("textbox", { name: "Movimento rimanente" });
    await field.fill("6");
    await field.blur();
    await expect(slider).toHaveAttribute("aria-valuenow", "10");
    await expect(field).toHaveValue("3");
    await page.screenshot({ path: shotPath(`difficult-terrain-${size}.png`) });

    // One 1,5 m step on the slider costs the last 3 m.
    await slider.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(slider).toHaveAttribute("aria-valuenow", "0");

    await page
      .getByRole("button", { name: /^Fine Turno/ })
      .first()
      .click();
    await expect(terrain).toHaveAttribute("aria-pressed", "false");
    await expect(slider).toHaveAttribute("aria-valuenow", "30");
  });
}
