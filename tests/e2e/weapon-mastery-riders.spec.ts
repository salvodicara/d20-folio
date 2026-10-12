/**
 * Weapon-Mastery riders on a Fighter's attack cards, Italian, dark theme, desktop
 * and phone: the mastered Quarterstaff shows "Rovesciamento: TS COS CD 14 → Prono"
 * and the Glaive "Colpo di Striscio: danni 3 se manchi" (STR 16, PB 3); tapping a
 * row declares it with an undo toast. Review shots land under REVIEW_SHOTS when
 * set, else in the test output dir.
 */
import { test, expect, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";

// Cold dev-server compiles under parallel workers can exceed the default 30 s.
test.describe.configure({ timeout: 90_000 });

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

async function openFighter(page: Page, size: "desktop" | "mobile") {
  await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
  await seedLang(page, "it");
  await seedUI(page, "dark", "play");
  await page.goto("/characters/scn-weapon-mastery-numbers?tab=play");
  const allChip = page.getByRole("button", { name: /^tutti$/i });
  await expect(allChip).toBeVisible({ timeout: 45_000 });
  await allChip.click();
  await freezeMotion(page);
}

/** Expand a weapon card by its title and return its detail region. */
async function expandCard(page: Page, title: string) {
  await page
    .getByRole("button", { name: new RegExp(`^Espandi: ${title}`, "i") })
    .first()
    .click();
  return page.getByRole("region", { name: title, exact: true }).first();
}

async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const size of ["desktop", "mobile"] as const) {
  test(`Topple and Graze rider rows (it, dark, ${size})`, async ({ page }) => {
    await openFighter(page, size);

    const staff = await expandCard(page, "Bastone Ferrato");
    const topple = staff.getByRole("button", {
      name: "Rovesciamento: TS COS CD 14 → Prono",
    });
    await expect(topple).toBeVisible();
    await expectNoSideScroll(page);
    await topple.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shotPath(`topple-${size}.png`) });

    await topple.click();
    await expect(
      page.getByText(/^Rovesciamento: TS COS CD 14 → Prono applicato a Bastone Ferrato$/)
    ).toBeVisible();

    const glaive = await expandCard(page, "Falcione");
    const graze = glaive.getByRole("button", {
      name: "Colpo di Striscio: danni 3 se manchi",
    });
    await expect(graze).toBeVisible();
    await expectNoSideScroll(page);
    await graze.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shotPath(`graze-${size}.png`) });
  });
}

test("Topple: the damage tray offers Prone on a hit (it, dark, desktop)", async ({
  page,
}) => {
  await page.addInitScript(() =>
    window.localStorage.setItem("d20-dev-combat-chronicle", "1")
  );
  await openFighter(page, "desktop");
  await page.getByRole("button", { name: "Attacca: Bastone Ferrato" }).first().click();
  const picker = page.getByRole("dialog", { name: /su chi\?/i });
  await picker.locator('.cl-target[data-side="enemy"]').first().click();
  const tray = page.getByTestId("damage-tray");
  await expect(tray).toBeVisible();
  // Topple needs a hit and a failed save: the Prone chip is offered, off.
  const prone = tray.getByRole("button", { name: "Prono" });
  await expect(prone).toHaveAttribute("aria-pressed", "false");
  await prone.click();
  await expect(prone).toHaveAttribute("aria-pressed", "true");
  await tray.getByRole("textbox", { name: "Totale tirato" }).fill("4+3");
  await page.screenshot({ path: shotPath("topple-tray-desktop.png") });
  await tray.getByRole("button", { name: "Applica" }).click();
  await expect(tray).toBeHidden();
});
