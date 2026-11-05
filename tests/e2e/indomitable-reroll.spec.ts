/**
 * A failed Concentration save offers Indomitable's reroll (+ Fighter level), Italian,
 * dark theme, desktop and phone: the dev Fighter 13 / Cleric 1 holds Bless, takes 30
 * damage (DC 15), enters a 2, and «Indomabile: ritira +13» asks the new roll; a 5 +
 * 13 keeps Bless, and the use and the save are one undo.
 */
import { test, expect } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";

test.describe.configure({ timeout: 90_000 });

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

for (const size of ["desktop", "mobile"] as const) {
  test(`a failed Concentration save offers Indomitable (it, dark, ${size})`, async ({
    page,
  }) => {
    await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
    await seedLang(page, "it");
    await seedUI(page, "dark", "play");
    await page.goto("/characters/scn-indomitable-fighter?tab=play", {
      waitUntil: "domcontentloaded",
    });
    await page.getByText("Brannoc, Fighter").first().waitFor({ timeout: 45_000 });
    await freezeMotion(page);
    await page
      .getByRole("button", { name: /punti ferita/i })
      .first()
      .click();
    const hp = page.getByRole("dialog");
    await hp.getByRole("spinbutton").first().fill("30");
    await hp.getByRole("button", { name: /^Danno$/i }).click();
    const roll = page.getByLabel(/TS di Concentrazione/i);
    await roll.fill("2");
    const offer = page.getByRole("button", { name: "Indomabile: ritira +13" });
    await expect(offer).toBeVisible();
    await page.screenshot({ path: shotPath(`indomitable-offer-${size}.png`) });
    await offer.click();
    await expect(page.getByText(/Ritiro con Indomabile \(\+13\)/)).toBeVisible();
    await page.getByLabel(/TS di Concentrazione/i).fill("5");
    await page.screenshot({ path: shotPath(`indomitable-reroll-${size}.png`) });
    await page
      .locator(".conc-banner")
      .getByRole("button", { name: /^Applica$/i })
      .click();
    await expect(
      page.getByText(/Indomabile: Concentrazione mantenuta \(totale \d+\)/)
    ).toBeVisible();
    await page.screenshot({ path: shotPath(`indomitable-kept-${size}.png`) });
  });
}
