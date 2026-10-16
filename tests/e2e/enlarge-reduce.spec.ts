/**
 * Enlarge/Reduce in play, Italian, dark theme, desktop and phone: casting it on
 * yourself lights the concentration state; the Active rail then offers Enlarge
 * or Reduce. Enlarge adds a +1d4 rider to weapon and Unarmed Strike attacks;
 * Reduce takes it away (its 1d4-less damage is a note). The pick holds for that
 * cast across a reload; a new cast asks again. Review shots land under
 * REVIEW_SHOTS when set, else in the test output dir.
 */
import { test, expect, type Page } from "@playwright/test";
import { DESKTOP, MOBILE, freezeMotion, seedLang, seedUI } from "./surfaces";

test.describe.configure({ timeout: 90_000 });

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

async function castOnSelf(page: Page, size: "desktop" | "mobile") {
  await page.setViewportSize(size === "desktop" ? DESKTOP : MOBILE);
  await seedLang(page, "it");
  await seedUI(page, "dark", "play");
  await page.goto("/characters/scn-enlarge-reduce?tab=spells");
  await castAgain(page);
}

async function castAgain(page: Page) {
  const expand = page.getByRole("button", { name: /^Espandi: Ingrandire\/Ridurre/ });
  await expect(expand).toBeVisible({ timeout: 45_000 });
  await freezeMotion(page);
  if ((await expand.getAttribute("aria-expanded")) !== "true") await expand.click();
  await page
    .getByRole("region", { name: "Ingrandire/Ridurre", exact: true })
    .getByRole("button", { name: /^Lancia/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /^Io\b/ }).first().click();
  await expect(dialog).toBeHidden();
}

for (const size of ["desktop", "mobile"] as const) {
  test(`Enlarge/Reduce lights on the caster with its choice (it, dark, ${size})`, async ({
    page,
  }) => {
    await castOnSelf(page, size);
    // The phone keeps the Active rail behind the Resources drawer.
    const rail = page.getByRole("button", { name: /^Risorse$/ });
    if (size === "mobile") await rail.click();
    const enlarge = page.getByRole("button", { name: /^Ingrandire$/ }).first();
    await enlarge.scrollIntoViewIfNeeded();
    await enlarge.click();
    await page.screenshot({ path: shotPath(`enlarge-chosen-${size}.png`) });

    // Enlarge: the Dagger card gains the +1d4 rider chip.
    if (size === "mobile") await rail.click();
    await page
      .getByRole("tab", { name: /Combattimento/ })
      .first()
      .click();
    const dagger = page
      .locator(".uc", { has: page.locator(".uc-name", { hasText: /^Pugnale$/ }) })
      .first();
    await expect(dagger.getByText(/^\+1d4$/)).toBeVisible();
    await page.screenshot({
      path: shotPath(`enlarge-rider-${size}.png`),
      fullPage: true,
    });

    // Reduce: the rider goes away.
    if (size === "mobile") await rail.click();
    const reduce = page.getByRole("button", { name: /^Ridurre$/ }).first();
    await reduce.scrollIntoViewIfNeeded();
    await reduce.click();
    if (size === "mobile") await rail.click();
    await expect(dagger.getByText(/^\+1d4$/)).toHaveCount(0);
    await page.screenshot({ path: shotPath(`reduce-${size}.png`), fullPage: true });
  });
}

test("each new cast asks Enlarge or Reduce again; the same cast keeps its pick", async ({
  page,
}) => {
  await castOnSelf(page, "desktop");
  const enlarge = page.getByRole("button", { name: /^Ingrandire$/ }).first();
  const reduce = page.getByRole("button", { name: /^Ridurre$/ }).first();
  await enlarge.click();
  await expect(enlarge).toHaveAttribute("aria-pressed", "true");

  // The same active cast keeps its choice across a reload.
  await page.reload();
  await expect(enlarge).toHaveAttribute("aria-pressed", "true", { timeout: 45_000 });

  // A new cast starts with no option chosen: the rail asks again.
  await castAgain(page);
  await expect(enlarge).toHaveAttribute("aria-pressed", "false");
  await expect(reduce).toHaveAttribute("aria-pressed", "false");
});
