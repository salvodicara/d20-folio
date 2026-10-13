/**
 * A priced material component after a cast, Italian, dark theme, desktop and
 * phone: casting Rinascita (Revivify, a 300 gp diamond the spell consumes) offers
 * "−300 mo" in a note beside the cast's toast; paying it takes 300 gp from the purse
 * and logs it. Casting Presagio (Augury, 25 gp tokens it keeps) only reminds. Review
 * shots land under REVIEW_SHOTS when set, else in the test output dir.
 */
import { test, expect, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";

// Cold dev-server compiles under parallel workers can exceed the default 30 s.
test.describe.configure({ timeout: 90_000 });

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

/** The gold pieces the inventory's purse shows. */
async function gold(page: Page): Promise<string> {
  await page.goto("/characters/scn-material-cost?tab=inventory");
  const token = page.locator('.cur-tok[data-metal="gp"] .cur-amt').first();
  await expect(token).toBeVisible({ timeout: 45_000 });
  return token.innerText();
}

async function openSheet(page: Page, size: "desktop" | "mobile") {
  await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
  await seedLang(page, "it");
  await seedUI(page, "dark", "play");
  await page.goto("/characters/scn-material-cost?tab=spells");
  await expect(
    page.getByRole("button", { name: /^Espandi: Rinascita/i }).first()
  ).toBeVisible({ timeout: 45_000 });
  await freezeMotion(page);
}

async function cast(page: Page, spell: string, slot?: RegExp) {
  await page
    .getByRole("button", { name: new RegExp(`^Espandi: ${spell}`, "i") })
    .first()
    .click();
  await page
    .getByRole("region", { name: spell, exact: true })
    .getByRole("button", { name: /^Lancia/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  if (slot) await dialog.getByRole("button", { name: slot }).click();
  await expect(page.getByText(`Hai usato ${spell}`)).toBeVisible();
}

for (const size of ["desktop", "mobile"] as const) {
  test(`material cost after a cast (it, dark, ${size})`, async ({ page }) => {
    expect(await gold(page)).toBe("340");
    await openSheet(page, size);
    const note = page.locator(".toast", { hasText: "Rinascita consuma" });

    await cast(page, "Rinascita");
    await expect(note).toContainText("Rinascita consuma un componente da 300 mo");
    await page.screenshot({ path: shotPath(`material-offer-${size}.png`) });

    await note.getByRole("button", { name: "−300 mo" }).click();
    await expect(page.getByText("−300 mo per Rinascita")).toBeVisible();
    await expect(note).toHaveCount(0);
    await page.screenshot({ path: shotPath(`material-paid-${size}.png`) });
    expect(await gold(page)).toBe("40");
    await page.goto("/characters/scn-material-cost?tab=play");
    await expect(page.getByText("300 mo speso su Rinascita").first()).toBeAttached({
      timeout: 45_000,
    });
  });

  test(`a kept component is only a reminder (it, dark, ${size})`, async ({ page }) => {
    await openSheet(page, size);
    await cast(page, "Presagio", /Slot di livello 2/);
    const note = page.locator(".toast", { hasText: "Presagio richiede" });
    await expect(note).toContainText(
      "Presagio richiede un componente da 25 mo (non consumato)"
    );
    await expect(note.getByRole("button", { name: /mo$/ })).toHaveCount(0);
    await page.screenshot({ path: shotPath(`material-reminder-${size}.png`) });
  });
}
