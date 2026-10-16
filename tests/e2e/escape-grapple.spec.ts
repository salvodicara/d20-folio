/**
 * Escape a grapple, Italian, dark theme, desktop and phone: while Grappled the
 * base actions offer "Liberati" with a d20 entry (better of Atletica/Acrobazia)
 * against the escape DC the DM states. A miss leaves Grappled on; a hit drops it
 * and logs the lost condition. Review shots land under REVIEW_SHOTS when set,
 * else in the test output dir.
 */
import { test, expect, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";
import { addCondition } from "./sheet-steps";

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
  const allChip = page.getByRole("button", { name: /^tutti$/i });
  await expect(allChip).toBeVisible({ timeout: 45_000 });
  await allChip.click();
  await freezeMotion(page);
}

for (const size of ["desktop", "mobile"] as const) {
  test(`Liberati escapes a grapple (it, dark, ${size})`, async ({ page }) => {
    await openSheet(page, size);
    const expand = page.getByRole("button", { name: /^Espandi: Liberati/ });
    await expect(expand).toHaveCount(0);

    await addCondition(page, "Afferrato");
    await expand.first().scrollIntoViewIfNeeded();
    await expand.first().click();
    const card = page.getByRole("region", { name: "Liberati", exact: true }).first();
    await expect(card).toContainText(/Tira 1d20: (Atletica|Acrobazia) [+−-]\d/);
    const face = card.getByRole("spinbutton", { name: "Il tuo tiro di d20" });
    const dc = card.getByRole("spinbutton", { name: "CD di fuga" });
    await expect(dc).toHaveValue("13");

    // A miss: d20 1 against DC 30 leaves the condition on.
    await face.fill("1");
    await dc.fill("30");
    await card.getByRole("button", { name: "Applica" }).click();
    await expect(page.getByText(/^Ancora Afferrato: \d+ contro CD 30$/)).toBeVisible();
    await expect(expand.first()).toBeVisible();

    // A hit: a natural 20 against DC 10 drops Grappled and logs it.
    await face.fill("20");
    await dc.fill("10");
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shotPath(`escape-grapple-entry-${size}.png`) });
    await card.getByRole("button", { name: "Applica" }).click();
    await expect(page.getByText(/^Libero: \d+ contro CD 10/)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Espandi: Liberati/ })).toHaveCount(0);
    await expect(page.getByRole("log", { name: "Registro Azioni" })).toContainText(
      "Persa condizione Afferrato"
    );
    await page.screenshot({ path: shotPath(`escape-grapple-free-${size}.png`) });
  });
}
