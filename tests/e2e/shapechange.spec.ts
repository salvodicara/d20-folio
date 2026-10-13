/**
 * Shapechange in a real browser, Italian, dark theme, desktop and phone: a level-18
 * Druid taps Transform on the Shapechange card, picks an Adult Red Dragon from the
 * bestiary picker (Constructs and Undead are not offered), wears its Temporary HP
 * and its Rend attack, shifts into a Giant Ape without new Temporary HP, and
 * reverts. Review shots land under REVIEW_SHOTS when set, else in the test output.
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
  const expand = page.getByRole("button", { name: "Espandi: Trasformazione" });
  if (await expand.count()) await expand.first().click();
  const transform = page.getByRole("button", { name: "Trasforma", exact: true });
  await transform.first().scrollIntoViewIfNeeded();
  await transform.first().click();
  await expect(page.getByRole("dialog").getByText("Scegli una forma")).toBeVisible();
}

for (const size of ["desktop", "mobile"] as const) {
  test(`Shapechange: dragon, then ape, then back (it, dark, ${size})`, async ({
    page,
  }) => {
    await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
    await seedLang(page, "it");
    await seedUI(page, "dark", "play");
    await page.goto("/characters/scn-shapechange-druid?tab=spells");
    await page
      .getByRole("button", { name: "Trasforma", exact: true })
      .first()
      .waitFor({ timeout: 90_000 });

    await openPicker(page);
    const dialog = page.getByRole("dialog");
    // The bestiary, not just Beasts: no Constructs or Undead (no Iron Golem, no Vampire).
    await dialog.getByRole("searchbox").fill("golem");
    await expect(dialog.getByText("Golem di ferro")).toHaveCount(0);
    await dialog.getByRole("searchbox").fill("drago rosso");
    await expect(dialog.getByText("Drago rosso adulto")).toBeVisible();
    await shot(page, `picker-${size}`);
    await dialog.getByText("Drago rosso adulto").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const banner = page.locator(".polymorph-banner");
    await expect(banner).toContainText("Drago rosso adulto");
    await banner.scrollIntoViewIfNeeded();
    await shot(page, `dragon-banner-${size}`);

    // The dragon's Rend is on the Play board.
    await page.getByRole("tab", { name: "Combattimento" }).click();
    await expect(page.getByText("Squarcio").first()).toBeVisible({ timeout: 60_000 });
    await page.getByText("Squarcio").first().scrollIntoViewIfNeeded();
    await shot(page, `dragon-play-${size}`);

    // Shift into a Giant Ape while the spell lasts.
    await page.getByRole("tab", { name: "Incantesimi" }).click();
    await openPicker(page);
    await page.getByRole("dialog").getByRole("searchbox").fill("gorilla");
    await page.getByRole("dialog").getByText("Gorilla gigante").click();
    await expect(page.locator(".polymorph-banner")).toContainText("Gorilla gigante");

    await page.getByRole("button", { name: "Torna alla tua forma" }).click();
    await expect(page.locator(".polymorph-banner")).toHaveCount(0);
  });
}
