/**
 * Jumps and Squeezing, Italian, dark theme, desktop and phone. Pippin (Halfling
 * Thief, STR 10, DEX 16, Boots of Striding and Springing): Second-Story Work jumps by
 * Dexterity, so the Long Jump reads 4,8 m (16 ft) and the High Jump 1,8 m (3 + 3 ft);
 * the Boots add the once-per-turn leap, 9 m for 3 m of movement. The Squeezing chip
 * lights and states the movement line the sheet cannot apply. Review shots land
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
  await page.goto("/characters/scn-boots-speed-floor?tab=play");
  await expect(page.getByRole("button", { name: /^tutti$/i })).toBeVisible({
    timeout: 45_000,
  });
  await freezeMotion(page);
}

/** The value cell of a Senses row, by its label. */
const row = (page: Page, label: string) =>
  page
    .locator("div.flex.items-center.justify-between", {
      has: page.locator("span", { hasText: new RegExp(`^${label}$`) }),
    })
    .first();

for (const size of ["desktop", "mobile"] as const) {
  test(`jump rows with their breakdown (it, dark, ${size})`, async ({ page }) => {
    await openSheet(page, size);
    const stats = page.getByRole("complementary", {
      name: "Statistiche del personaggio",
    });
    if (size === "mobile") {
      await stats.getByRole("button", { name: /Statistiche/ }).click();
    }
    const long = row(page, "Salto in Lungo");
    await expect(long).toContainText("4,8 m");
    await expect(row(page, "Salto in Alto")).toContainText("1,8 m");
    await expect(row(page, "Balzo, una volta per turno")).toContainText("9 m con 3 m");

    await long.getByRole("button").click();
    const tip = page.getByRole("dialog").last();
    await expect(tip).toContainText("DES");
    await expect(tip).toContainText("4,8 m");
    await long.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shotPath(`jump-rows-${size}.png`) });
  });

  test(`the Squeezing chip (it, dark, ${size})`, async ({ page }) => {
    await openSheet(page, size);
    const situations = page.getByRole("group", { name: "Situazione" });
    const chip = situations.getByRole("button", { name: "Spazio stretto" });
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByText(/ogni metro che percorri in quello spazio ti costa un metro in più/)
    ).toBeVisible();
    await situations.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shotPath(`squeezing-${size}.png`) });
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "false");
  });
}
