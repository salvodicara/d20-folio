/**
 * Alter Self in a real browser, Italian, dark theme, desktop and phone: a level-5
 * Wizard casts it, the state lights under Concentration on the Active rail, the
 * rail picks Aquatic Adaptation (a swim speed appears) and then Natural Weapons
 * (the Unarmed Strike becomes 1d6 + INT). Review shots land under REVIEW_SHOTS when
 * set, else in the test output.
 */
import { test, expect, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";

test.describe.configure({ timeout: 120_000 });

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

async function shot(page: Page, name: string): Promise<void> {
  await freezeMotion(page);
  await page.screenshot({
    path: shotPath(`${name}.png`),
    fullPage: name.startsWith("aquatic-desktop"),
  });
}

for (const size of ["desktop", "mobile"] as const) {
  test(`Alter Self: cast, pick an option, change it (it, dark, ${size})`, async ({
    page,
  }) => {
    await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
    await seedLang(page, "it");
    await seedUI(page, "dark", "play");
    await page.goto("/characters/scn-alter-self-wizard?tab=spells");
    const chevron = page
      .locator('.uc-chevron[aria-label$=": Alterare Se Stesso"]')
      .first();
    await chevron.waitFor({ timeout: 90_000 });
    await chevron.click();
    await page
      .getByRole("region", { name: "Alterare Se Stesso", exact: true })
      .getByRole("button", { name: /^Lancia/ })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    if (await dialog.count()) {
      await dialog
        .getByRole("button", { name: /Slot di livello 2/ })
        .first()
        .click();
    }
    await expect(page.getByRole("dialog")).toHaveCount(0);

    if (size === "mobile") {
      await page.getByRole("button", { name: "Risorse" }).first().click();
    }
    const pick = page.getByRole("button", { name: "Adattamento acquatico" }).first();
    await pick.scrollIntoViewIfNeeded();
    await shot(page, `rail-lit-${size}`);
    await pick.click();
    if (size === "desktop") {
      // Swim at the walking Speed: 30 ft reads 9 m on the Senses rail.
      await expect(page.getByText("Nuoto").first()).toBeVisible();
      await page.getByText("Nuoto").first().scrollIntoViewIfNeeded();
    } else {
      await pick.scrollIntoViewIfNeeded();
    }
    await shot(page, `aquatic-${size}`);

    await page.getByRole("button", { name: "Armi naturali" }).first().click();
    await page.getByRole("tab", { name: "Combattimento" }).click();
    const unarmed = page.getByText("Colpo Senz'armi").first();
    await unarmed.scrollIntoViewIfNeeded();
    await expect(page.getByText(/1d6\+4/).first()).toBeVisible();
    await shot(page, `natural-weapons-${size}`);
  });
}
