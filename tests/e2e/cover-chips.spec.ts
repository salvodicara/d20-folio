/**
 * Cover on the AC tile, Italian, dark theme, desktop and phone: one tap lights
 * Half Cover (+2 AC), a second tap Three-Quarters Cover (+5 AC), a third clears it;
 * the lit level also shows as a chip among the active states. Review shots land
 * under REVIEW_SHOTS when set, else in the test output dir.
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

const vitals = (page: Page) => page.getByRole("group", { name: "Statistiche vitali" });

for (const size of ["desktop", "mobile"] as const) {
  test(`cover cycles on the AC tile (it, dark, ${size})`, async ({ page }) => {
    await openSheet(page, size);
    const acTile = vitals(page)
      .locator(".vital", { has: page.locator(".v-acr", { hasText: /^CA$/ }) })
      .first();
    const before = Number(await acTile.locator(".v-val").innerText());
    await page.screenshot({ path: shotPath(`cover-off-${size}.png`) });

    await vitals(page)
      .getByRole("button", { name: /^Copertura: nessuna/ })
      .click();
    await expect(page.getByText("Mezza Copertura fino all'inizio")).toBeVisible();
    await expect(acTile.locator(".v-val")).toHaveText(String(before + 2));
    await page.screenshot({ path: shotPath(`cover-half-${size}.png`) });

    await vitals(page)
      .getByRole("button", { name: /^Mezza Copertura:/ })
      .click();
    await expect(acTile.locator(".v-val")).toHaveText(String(before + 5));
    if (size === "desktop") {
      // The rail's active states (folded away on a phone) show the lit level too.
      const chip = page
        .getByTestId("activatable-bar")
        .getByRole("button", { name: "Tre Quarti di Copertura" });
      await expect(chip).toHaveAttribute("aria-pressed", "true");
    }
    await page.screenshot({ path: shotPath(`cover-three-quarters-${size}.png`) });

    await vitals(page)
      .getByRole("button", { name: /^Tre Quarti di Copertura:/ })
      .click();
    await expect(acTile.locator(".v-val")).toHaveText(String(before));
  });
}
