/**
 * A floor on Hit Point Die faces in the Short Rest: the dev Fighter's homebrew feature
 * makes a 1 or 2 count as a 3, so the rest asks the faces («Facce dei dadi») one per
 * die and shows what counts.
 */
import { test, expect } from "@playwright/test";
import { freezeMotion, seedLang, seedUI } from "./surfaces";

test.describe.configure({ timeout: 90_000 });

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

for (const size of ["desktop", "mobile"] as const) {
  test(`the Short Rest asks the faces under a floor (${size})`, async ({ page }) => {
    await page.setViewportSize(
      size === "desktop" ? { width: 1440, height: 1000 } : { width: 390, height: 844 }
    );
    await seedLang(page, "it");
    await seedUI(page, "dark", "play");
    await page.goto("/characters/scn-hearty-fighter");
    const rest = page.getByRole("button", { name: "Riposo", exact: true }).first();
    await expect(rest).toBeVisible({ timeout: 45_000 });
    await freezeMotion(page);
    await rest.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /riposo breve/i }).click();
    const add = dialog.getByRole("button", { name: "Usa un dado vita in più" });
    await add.click();
    await add.click();
    const faces = dialog.getByRole("textbox", { name: "Facce dei dadi" });
    await faces.fill("1+5");
    await expect(dialog.getByText("Contano: 3 + 5 = 8")).toBeVisible();
    await page.screenshot({ path: shotPath(`hit-die-floor-${size}.png`) });
  });
}
