/**
 * True Polymorph in a real browser, Italian, dark theme, desktop and phone: a
 * level-17 Wizard taps Transform, the picker offers any creature up to CR 17
 * (an Iron Golem, a Construct Shapechange never offers), "Another creature" shows
 * its stat block named from the bestiary, "Myself" turns the Wizard into it, and
 * Revert brings the Wizard back. Review shots land under REVIEW_SHOTS when set,
 * else in the test output.
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

for (const size of ["desktop", "mobile"] as const) {
  test(`True Polymorph: an Iron Golem, as reference then as you (it, dark, ${size})`, async ({
    page,
  }) => {
    await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
    await seedLang(page, "it");
    await seedUI(page, "dark", "play");
    await page.goto("/characters/scn-true-polymorph-wizard?tab=spells");
    const chevron = page.locator('.uc-chevron[aria-label$=": Metamorfosi pura"]').first();
    await chevron.waitFor({ timeout: 90_000 });
    if ((await chevron.getAttribute("aria-expanded")) !== "true") await chevron.click();
    const transform = page.getByRole("button", { name: "Trasforma", exact: true });
    await transform.first().scrollIntoViewIfNeeded();
    await transform.first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Scegli una forma")).toBeVisible();
    await dialog.getByRole("button", { name: "Un'altra creatura" }).click();
    await dialog.getByRole("searchbox").fill("golem di ferro");
    await dialog.getByText("Golem di ferro", { exact: true }).first().click();
    await expect(dialog.getByText("Braccio affilato").first()).toBeVisible();
    await shot(page, `reference-${size}`);

    await dialog.getByRole("button", { name: "Me stesso" }).click();
    await dialog.getByText("Golem di ferro", { exact: true }).first().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const banner = page.locator(".polymorph-banner");
    await expect(banner).toContainText("Golem di ferro");
    await banner.scrollIntoViewIfNeeded();
    await shot(page, `golem-banner-${size}`);

    await page.getByRole("button", { name: "Torna alla tua forma" }).click();
    await expect(page.locator(".polymorph-banner")).toHaveCount(0);
  });
}
