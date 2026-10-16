/**
 * The free object interaction among the base actions, Italian, dark theme,
 * desktop and phone: one tap uses it (free, logged), the card reads "Usata" and
 * says the next one takes the Utilize action; End Turn reopens it.
 * Review shots land under REVIEW_SHOTS when set, else in the test output dir.
 */
import { test, expect, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";
import { openBaseActions } from "./sheet-steps";

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
  await page.goto("/characters/scn-weapon-cards?tab=play");
  const allChip = page.getByRole("button", { name: /^tutti$/i });
  await expect(allChip).toBeVisible({ timeout: 45_000 });
  await allChip.click();
  await freezeMotion(page);
}

const NAME = "Interagisci con un oggetto";

for (const size of ["desktop", "mobile"] as const) {
  test(`free object interaction, once per turn (it, dark, ${size})`, async ({ page }) => {
    await openSheet(page, size);
    await openBaseActions(page);
    const use = page.getByRole("button", { name: `Usa: ${NAME}` });
    await use.scrollIntoViewIfNeeded();
    await expect(use).toBeEnabled();
    await page.screenshot({ path: shotPath(`object-interaction-open-${size}.png`) });

    await use.click();
    const used = page.getByRole("button", { name: `Usata: ${NAME}` });
    await expect(used).toBeDisabled();
    const hint = page.getByText("Poi: Utilizzo", { exact: true });
    await expect(hint).toBeVisible();
    await expect(page.getByRole("log", { name: "Registro Azioni" })).toContainText(NAME);
    await used.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shotPath(`object-interaction-used-${size}.png`) });

    await page
      .getByRole("button", { name: /^Fine Turno/ })
      .first()
      .click();
    await expect(page.getByRole("button", { name: `Usa: ${NAME}` })).toBeEnabled();
    await expect(hint).toHaveCount(0);
  });
}
