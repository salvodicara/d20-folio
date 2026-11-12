/**
 * The homebrew item form's effects, step 1 (Italian, dark; phone and desktop): the
 * empty form (only «Aggiungi effetto»), a +1 weapon that needs attunement, and a
 * 3-charge item back at dawn. Review shots land under REVIEW_SHOTS when set, else in
 * the test output dir.
 */
import { test, expect, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";

test.describe.configure({ timeout: 90_000 });

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

async function openForm(page: Page, size: "phone" | "desktop") {
  await page.setViewportSize(size === "phone" ? MOBILE : DESKTOP);
  await seedLang(page, "it");
  await seedUI(page, "dark", "play");
  await page.goto("/characters/mock-1?tab=inventory");
  await page.getByText("Lyra Voss").first().waitFor({ timeout: 45_000 });
  await freezeMotion(page);
  await page
    .getByRole("button", { name: /aggiungi oggetto/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Personalizzati" }).click();
  // An empty library opens straight on the form; a filled one lists it first.
  const effects = dialog.getByRole("button", { name: "Aggiungi effetto" });
  if (!(await effects.isVisible().catch(() => false)))
    await dialog
      .getByRole("button", { name: /crea equipaggiamento personalizzato/i })
      .first()
      .click();
  await expect(effects).toBeVisible();
  return dialog;
}

async function addEffect(dialog: ReturnType<Page["getByRole"]>, name: string) {
  await dialog.getByRole("button", { name: "Aggiungi effetto" }).click();
  await dialog
    .getByRole("group", { name: "Aggiungi effetto" })
    .getByRole("button", { name })
    .click();
}

for (const size of ["phone", "desktop"] as const) {
  test(`homebrew item effects (it, dark, ${size})`, async ({ page }) => {
    let dialog = await openForm(page, size);
    await dialog.getByRole("textbox").first().fill("Pietra d'Ambra");
    await page.screenshot({ path: shotPath(`homebrew-item-empty-${size}.png`) });

    // A +1 weapon that needs attunement.
    await dialog.getByRole("checkbox", { name: "Questa è un'arma", exact: true }).click();
    await addEffect(dialog, "Richiede sintonia");
    await addEffect(dialog, "Bonus magico");
    await dialog.getByRole("textbox").first().fill("Lama di Luna");
    await dialog.getByRole("group", { name: "Bonus magico" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: shotPath(`homebrew-item-weapon-${size}.png`) });

    // A 3-charge item, back at dawn: 1d3 of them.
    await page.keyboard.press("Escape");
    dialog = await openForm(page, size);
    await dialog.getByRole("textbox").first().fill("Pietra d'Ambra");
    await addEffect(dialog, "Cariche");
    const charges = dialog.getByRole("group", { name: "Cariche" });
    await charges.getByRole("spinbutton").fill("3");
    await charges.getByRole("textbox").fill("1d3");
    await charges.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shotPath(`homebrew-item-charges-${size}.png`) });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
