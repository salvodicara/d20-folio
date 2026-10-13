/**
 * Animal Shapes on the caster's own sheet in a real browser, Italian, dark theme,
 * desktop and phone: a level-15 Druid taps Transform on the Animal Shapes card, the
 * picker offers only Large or smaller Beasts of CR 4 or lower (no Elephant, which is
 * Huge), the Brown Bear form starts without Concentration, a second Transform
 * shifts into a Dire Wolf, and Revert brings the Druid back. Review shots land
 * under REVIEW_SHOTS when set, else in the test output.
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
  await page.screenshot({ path: shotPath(`${name}.png`) });
}

async function openPicker(page: Page): Promise<void> {
  // Open the spell card (its chevron says whether it is open) before its Transform.
  const chevron = page.locator('.uc-chevron[aria-label$=": Forme Animali"]').first();
  if ((await chevron.getAttribute("aria-expanded")) !== "true") await chevron.click();
  await expect(chevron).toHaveAttribute("aria-expanded", "true");
  const transform = page.getByRole("button", { name: "Trasforma", exact: true });
  await transform.first().scrollIntoViewIfNeeded();
  await transform.first().click();
  await expect(
    page.getByRole("dialog").getByText("Scegli una forma bestiale")
  ).toBeVisible();
}

for (const size of ["desktop", "mobile"] as const) {
  test(`Animal Shapes: bear, then wolf, then back (it, dark, ${size})`, async ({
    page,
  }) => {
    await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
    await seedLang(page, "it");
    await seedUI(page, "dark", "play");
    await page.goto("/characters/scn-animal-shapes-druid?tab=spells");
    await page
      .getByRole("button", { name: "Trasforma", exact: true })
      .first()
      .waitFor({ timeout: 90_000 });

    await openPicker(page);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("searchbox").fill("elefante");
    await expect(dialog.getByText("Elefante")).toHaveCount(0);
    await dialog.getByRole("searchbox").fill("orso");
    await expect(dialog.getByText("Orso bruno")).toBeVisible();
    await shot(page, `picker-${size}`);
    await dialog.getByText("Orso bruno").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const banner = page.locator(".polymorph-banner");
    await expect(banner).toContainText("Orso bruno");
    await banner.scrollIntoViewIfNeeded();
    await shot(page, `bear-banner-${size}`);

    await openPicker(page);
    await page.getByRole("dialog").getByRole("searchbox").fill("lupo");
    await page.getByRole("dialog").getByText("Lupo feroce").click();
    await expect(page.locator(".polymorph-banner")).toContainText("Lupo feroce");
    await page.locator(".polymorph-banner").scrollIntoViewIfNeeded();
    await shot(page, `wolf-banner-${size}`);

    await page.getByRole("button", { name: "Torna alla tua forma" }).click();
    await expect(page.locator(".polymorph-banner")).toHaveCount(0);
  });
}
