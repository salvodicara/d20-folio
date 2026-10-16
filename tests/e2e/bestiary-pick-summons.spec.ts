/**
 * Bestiary-pick summons in a real browser: a Cleric with Planar Ally prepared
 * chooses the ally from the bestiary (only Celestials, Elementals and Fiends are
 * offered), the Planetar takes its place on the Companions rail with its own HP,
 * and Release sends it away. Screenshots land in the test's own output directory.
 */
import { test, expect, type Page } from "@playwright/test";
import { seedUI, seedLang, freezeMotion, DESKTOP, MOBILE } from "./surfaces";

async function shot(page: Page, name: string): Promise<void> {
  await freezeMotion(page);
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: false });
}

test.describe("bestiary-pick summons", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "chromium only");
  test.setTimeout(180_000);

  for (const size of ["desktop", "mobile"] as const) {
    test(`Planar Ally: choose a Planetar, track it, release it (${size})`, async ({
      page,
    }) => {
      await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
      await seedUI(page, "dark", "play");
      await seedLang(page, "it");
      await page.goto("/characters/scn-planar-ally-cleric?tab=play");
      if (size === "mobile") {
        await page.getByRole("button", { name: "Risorse" }).first().click();
      }
      const choose = page.getByRole("button", { name: "Scegli una creatura" });
      await choose.waitFor({ timeout: 90_000 });
      await choose.scrollIntoViewIfNeeded();
      await shot(page, `rail-unpicked-${size}`);

      await choose.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("Alleato Planare").first()).toBeVisible();
      // Only the three types the spell names are on the type facet.
      await dialog.getByRole("button", { name: "Filtri" }).click();
      await expect(dialog.getByRole("button", { name: "Celestiale" })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Bestia" })).toHaveCount(0);
      await shot(page, `picker-${size}`);

      await dialog.getByRole("searchbox").fill("Planetar");
      await dialog.getByText("Planetar", { exact: true }).first().click();
      await shot(page, `picker-detail-${size}`);
      await dialog.getByRole("button", { name: "Scegli questa creatura" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);

      const row = page.getByRole("button", { name: /^Planetar/ });
      await expect(row).toBeVisible();
      await page.getByRole("button", { name: "−1 PF Planetar" }).click();
      await row.scrollIntoViewIfNeeded();
      await shot(page, `rail-picked-${size}`);

      await row.click();
      const stat = page.getByRole("dialog");
      await expect(stat.getByRole("button", { name: "Cambia creatura" })).toBeVisible();
      await shot(page, `statblock-${size}`);
      await stat.getByRole("button", { name: "Congeda" }).click();
      await expect(
        page.getByRole("button", { name: "Scegli una creatura" })
      ).toBeVisible();
    });
  }
});
