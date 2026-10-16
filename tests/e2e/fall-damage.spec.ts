/**
 * The fall preset in the HP popover, Italian, dark theme, desktop and phone: the
 * metres fallen name the dice ("3d6 contundenti", 1d6 per 3 m, at most 20d6), the
 * rolled total applies as damage, and you land Prono; the log records both.
 * Review shots land under REVIEW_SHOTS when set, else in the test output dir.
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

for (const size of ["desktop", "mobile"] as const) {
  test(`Caduta applies the rolled fall and lands Prono (it, dark, ${size})`, async ({
    page,
  }) => {
    await openSheet(page, size);
    const hpButton = page.getByRole("button", { name: /punti ferita: apri/i }).first();
    const before = await hpButton.getAttribute("aria-label");
    const current = Number(before?.match(/^(\d+) su/)?.[1]);
    await hpButton.click();
    const dialog = page.getByRole("dialog", { name: /punti ferita/i });
    await dialog.getByRole("button", { name: "Caduta", exact: true }).click();

    const distance = dialog.getByRole("spinbutton", {
      name: "Distanza della caduta (m)",
    });
    await distance.fill("2");
    await expect(dialog).toContainText("Nessun danno");
    await distance.fill("9");
    await expect(dialog).toContainText("3d6 contundenti");
    await distance.fill("90");
    await expect(dialog).toContainText("20d6 contundenti");
    await distance.fill("9");

    const total = dialog.getByRole("spinbutton", { name: "Totale di 3d6" });
    const apply = dialog.getByRole("button", { name: "Applica caduta" });
    await total.fill("19");
    await expect(apply).toBeDisabled();
    await total.fill("11");
    await expect(dialog.getByRole("button", { name: "Atterri Prono" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await page.screenshot({ path: shotPath(`fall-damage-entry-${size}.png`) });

    await apply.click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: new RegExp(`^${current - 11} su`) }).first()
    ).toBeVisible();
    const log = page.getByRole("log", { name: "Registro Azioni" });
    await expect(log).toContainText("Subiti 11 danni");
    await expect(log).toContainText("Prono");
    await expect(
      page.getByRole("group", { name: "Effetti attivi" }).getByRole("button", {
        name: "Prono",
      })
    ).toBeVisible();
    await page.screenshot({ path: shotPath(`fall-damage-applied-${size}.png`) });
  });
}
