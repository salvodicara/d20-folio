/**
 * Gem of Seeing in play, Italian, dark theme, desktop and phone: its Magic action
 * spends 1 of 3 charges and lights Truesight 120 ft (36 m) on the Senses rail for
 * 10 minutes. Review shots land under REVIEW_SHOTS when set, else in the test
 * output dir.
 */
import { test, expect, type Page } from "@playwright/test";
import {
  DESKTOP,
  MOBILE,
  freezeMotion,
  seedLang,
  seedUI,
  startSoloFight,
} from "./surfaces";

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
  await page.goto("/characters/scn-gem-of-seeing?tab=play");
  await expect(page.getByRole("button", { name: /^tutti$/i })).toBeVisible({
    timeout: 45_000,
  });
  await freezeMotion(page);
  // The per-turn gates hold inside a fight; outside one the economy only logs.
  await startSoloFight(page);
}

for (const size of ["desktop", "mobile"] as const) {
  test(`Gem of Seeing lights Truesight for 10 minutes (it, dark, ${size})`, async ({
    page,
  }) => {
    await openSheet(page, size);
    await page.getByRole("button", { name: /^tutti$/i }).click();
    await page
      .getByRole("button", { name: /^Usa: Vista Pura/ })
      .first()
      .click();
    // One charge spent, the state lit with its 100-round countdown, a log line.
    await expect(page.getByText("Usato Vista Pura", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Usa: Vista Pura/ })).toHaveCount(0);
    if (size === "desktop") {
      // Truesight 120 ft reads 36 m on the Senses rail while the gem is lit.
      await expect(
        page
          .locator(".panel, section, aside", { hasText: "Sensi" })
          .getByText("36 m")
          .first()
      ).toBeVisible();
    }
    await page.getByText("Usato Vista Pura", { exact: true }).scrollIntoViewIfNeeded();
    await page
      .getByRole("button", { name: /Vista Pura/ })
      .first()
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: shotPath(`gem-lit-${size}.png`) });
  });
}
