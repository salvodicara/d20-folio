/**
 * Charmed and Deafened on the turn meter's status ledge, Italian, dark theme,
 * desktop and phone: each condition is a badge whose popover states its rule
 * ("Non puoi attaccare l'incantatore…", "…prove di caratteristica che richiedono
 * l'udito"). Review shots land under REVIEW_SHOTS when set, else in the test
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

async function addCondition(page: Page, label: string) {
  const add = page.getByRole("button", { name: /aggiungi condizione/i }).first();
  if (!(await add.isVisible())) {
    await page
      .getByRole("button", { name: /^risorse$/i })
      .first()
      .click();
  }
  await add.click();
  const listbox = page.getByRole("listbox", { name: /aggiungi condizione/i });
  await listbox.getByRole("option", { name: label, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(listbox).toBeHidden();
}

for (const size of ["desktop", "mobile"] as const) {
  test(`Charmed and Deafened state their rules (it, dark, ${size})`, async ({ page }) => {
    await openSheet(page, size);
    await addCondition(page, "Affascinato");
    await addCondition(page, "Assordato");

    const ledge = page.getByRole("group", { name: "Effetti attivi" });
    const charmed = ledge.getByRole("button", { name: "Affascinato" });
    const deafened = ledge.getByRole("button", { name: "Assordato" });
    await charmed.scrollIntoViewIfNeeded();

    await charmed.click();
    const charmedPop = page.locator(".status-pop", { hasText: "incantatore" });
    await expect(charmedPop).toContainText(
      "Non puoi attaccare l'incantatore né prenderlo di mira con capacità dannose o effetti magici"
    );
    await expect(charmedPop).toContainText(
      "L'incantatore ha Vantaggio sulle prove di caratteristica per interagire socialmente con te"
    );
    await page.screenshot({ path: shotPath(`charmed-${size}.png`) });
    await page.keyboard.press("Escape");

    await deafened.click();
    await expect(page.locator(".status-pop", { hasText: "udito" })).toContainText(
      "Fallisci automaticamente le prove di caratteristica che richiedono l'udito"
    );
    await page.screenshot({ path: shotPath(`deafened-${size}.png`) });
  });
}
