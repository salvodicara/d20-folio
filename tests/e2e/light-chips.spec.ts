/**
 * The light chips on the Play board, Italian, dark theme, desktop and phone. Vesper
 * (Human, no Darkvision): "Luce Fioca" says Disadvantage on Perception to see and
 * passive Perception −5; "Oscurità" replaces it and puts the Longsword at
 * Disadvantage (Blinded for sight). Vokka (Orc, Darkvision): "Oscurità" reads as
 * Dim Light and leaves the attacks alone. A second tap clears it. Review shots land
 * under REVIEW_SHOTS when set, else in the test output dir.
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

async function openSheet(page: Page, size: "desktop" | "mobile", id: string) {
  await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
  await seedLang(page, "it");
  await seedUI(page, "dark", "play");
  await page.goto(`/characters/${id}?tab=play`);
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
  test(`light without Darkvision (it, dark, ${size})`, async ({ page }) => {
    await openSheet(page, size, "scn-weapon-cards");
    await openSituations(page);
    const situations = page.getByRole("group", { name: "Situazione" });
    const dim = situations.getByRole("button", { name: "Luce Fioca" });
    const dark = situations.getByRole("button", { name: "Oscurità" });
    await expect(dim).toHaveAttribute("aria-pressed", "false");

    await dim.click();
    await expect(dim).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/Percezione passiva −5\.$/).first()).toBeVisible();
    await expect(gloss(page, "Spada Lunga")).not.toContainText("Svant.");
    await situations.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shotPath(`light-dim-${size}.png`) });

    await dark.click();
    await expect(dark).toHaveAttribute("aria-pressed", "true");
    await expect(dim).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText(/hai la condizione Accecato/).first()).toBeVisible();
    await expect(gloss(page, "Spada Lunga")).toContainText("Svant.");
    await situations.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shotPath(`light-darkness-${size}.png`) });

    await dark.click();
    await expect(dark).toHaveAttribute("aria-pressed", "false");
    await expect(gloss(page, "Spada Lunga")).not.toContainText("Svant.");
  });

  test(`darkness with Darkvision (it, dark, ${size})`, async ({ page }) => {
    await openSheet(page, size, "scn-barbarian-extra-attack");
    await openSituations(page);
    const situations = page.getByRole("group", { name: "Situazione" });
    await situations.getByRole("button", { name: "Oscurità" }).click();
    await expect(
      page.getByText(
        /Scurovisione 36 m: entro quel raggio l'Oscurità per te è Luce Fioca/
      )
    ).toBeVisible();
    await situations.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shotPath(`light-darkness-darkvision-${size}.png`) });
  });
}
