/**
 * Situational attack chips on the Play board, Italian, dark theme, desktop and
 * phone (Vesper: Longsword, Dagger, Light Crossbow). "Gittata lunga" puts the
 * crossbow at Disadvantage and the thrown Dagger "if thrown", leaving the Longsword
 * alone; "Sott'acqua" adds the Longsword (Slashing, no Swim Speed) and its
 * rule line; a second tap clears each. Review shots land under REVIEW_SHOTS when
 * set, else in the test output dir.
 */
import { test, expect, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";
import { openSituations } from "./sheet-steps";

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

/** The gloss line of the first card with this exact name. */
const gloss = (page: Page, name: string) =>
  page
    .locator(".uc-head", {
      has: page.locator(".uc-name", { hasText: new RegExp(`^${name}$`) }),
    })
    .first()
    .locator(".uc-gloss");

for (const size of ["desktop", "mobile"] as const) {
  test(`situation chips net into the attack cards (it, dark, ${size})`, async ({
    page,
  }) => {
    await openSheet(page, size);
    await openSituations(page);
    const situations = page.getByRole("group", { name: "Situazione" });
    const longRange = situations.getByRole("button", { name: "Gittata lunga" });
    const underwater = situations.getByRole("button", { name: "Sott'acqua" });
    await expect(longRange).toHaveAttribute("aria-pressed", "false");
    await expect(gloss(page, "Balestra Leggera")).not.toContainText("Svant.");
    await situations.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shotPath(`situations-off-${size}.png`) });

    await longRange.click();
    await expect(longRange).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByText("Gittata lunga fino alla fine del tuo turno")
    ).toBeVisible();
    await expect(gloss(page, "Balestra Leggera")).toContainText("Svant.");
    await expect(gloss(page, "Pugnale")).toContainText("Svant. se la lanci");
    await expect(gloss(page, "Spada Lunga")).not.toContainText("Svant.");

    await underwater.click();
    await expect(page.getByText("Sott'acqua fino alla fine dello scontro")).toBeVisible();
    await expect(gloss(page, "Spada Lunga")).toContainText("Svant.");
    // An Unarmed Strike is no weapon: Underwater's weapon rule passes it by.
    await expect(gloss(page, "Colpo Senz'armi")).not.toContainText("Svant.");
    await expect(
      page.getByText(/^Sott'acqua: Un tiro per colpire a distanza con un'arma manca/)
    ).toBeVisible();
    await situations.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shotPath(`situations-lit-${size}.png`) });

    // End Turn ends the turn fact; Underwater holds for the whole fight.
    await page
      .getByRole("button", { name: /^Fine Turno/ })
      .first()
      .click();
    await expect(longRange).toHaveAttribute("aria-pressed", "false");
    await expect(underwater).toHaveAttribute("aria-pressed", "true");
    await expect(gloss(page, "Spada Lunga")).toContainText("Svant.");

    // A tap clears it; lit again, the end of the encounter clears it too.
    await underwater.click();
    await expect(underwater).toHaveAttribute("aria-pressed", "false");
    await expect(gloss(page, "Spada Lunga")).not.toContainText("Svant.");
    await underwater.click();
    await expect(underwater).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("button", { name: /^Fine Combattimento/ })
      .first()
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Fine Combattimento|Termina/ })
      .click();
    await expect(underwater).toHaveAttribute("aria-pressed", "false");
    await expect(gloss(page, "Balestra Leggera")).not.toContainText("Svant.");
  });
}
