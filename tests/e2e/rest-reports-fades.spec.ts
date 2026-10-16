/**
 * A Long Rest says what it faded, in a real browser (Italian, dark, desktop and
 * phone): Lyra carries Raise Dead's −4 and a Hit Point maximum reduced by 10; after
 * the rest the summary shows "Penalità di Rianimare Morti: −4 → −3" and "PF massimi
 * ripristinati: 52 → 62", and the action log records both. Review shots land under
 * REVIEW_SHOTS when set, else in the test output.
 */
import { test, expect } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";

test.describe.configure({ timeout: 120_000 });

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

for (const size of ["desktop", "mobile"] as const) {
  test(`Long Rest reports the penalty step and the restored maximum (it, dark, ${size})`, async ({
    page,
  }) => {
    await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
    await seedLang(page, "it");
    await seedUI(page, "dark", "play");
    await page.goto("/characters/mock-1?tab=play");

    // A Hit Point maximum reduced by 10.
    const hp = page.locator("button.vital-hp").first();
    await hp.waitFor({ timeout: 90_000 });
    await hp.click();
    await page
      .getByRole("spinbutton", { name: "Quantità di danni, cura o PF temporanei" })
      .fill("10");
    await page.getByRole("button", { name: "PF max −" }).click();
    await page.keyboard.press("Escape");

    // Raise Dead's fading penalty, from the conditions picker.
    if (size === "mobile") {
      await page.getByRole("button", { name: "Risorse" }).first().click();
    }
    await page.getByRole("button", { name: "Aggiungi condizione" }).first().click();
    await page
      .getByRole("option", { name: /Rianimare Morti \(−4 ai tiri d20\)/ })
      .click();
    await page.keyboard.press("Escape");
    if (size === "mobile") await page.keyboard.press("Escape");

    await page
      .getByRole("button", { name: /^riposo$/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /riposo lungo/i }).click();
    await dialog.getByRole("button", { name: "Completa riposo" }).click();
    await expect(dialog.getByText("Riposo Lungo Completato")).toBeVisible();

    const row = (label: string) =>
      dialog.locator(".rest-summary-row").filter({ hasText: label });
    await expect(row("Penalità di Rianimare Morti")).toContainText("−4 → −3");
    await expect(row("PF massimi ripristinati")).toContainText("52 → 62");
    await row("PF massimi ripristinati").scrollIntoViewIfNeeded();
    await freezeMotion(page);
    await page.screenshot({ path: shotPath(`summary-${size}.png`) });

    await dialog.getByRole("button", { name: "Fatto" }).click();
    const log = page.getByRole("log", { name: "Registro Azioni" });
    await expect(log).toContainText("Rianimare Morti: −3 ai tiri d20");
    await expect(log).toContainText("PF massimi ripristinati (62)");
  });
}
