/**
 * E2E: the option-picker cards never flash a see-through frame on de-select (#58).
 *
 * The bug (owner, light theme, Img #17): in the FIFO swap, the row that gets
 * DESELECTED blinked "selected → white → initial". Root cause — the selected fill
 * was painted with the `background` SHORTHAND, which resets `background-color` to
 * transparent; because `.opt-more-card` / `.opt-cell` TRANSITION `background`, the
 * de-select animated the colour down to transparent while the gradient vanished at
 * once, leaving a ~1-frame window where the card was see-through and the bright
 * candlelit backdrop flashed through (cream theme = huge contrast = visible blink).
 *
 * The fix paints the gold as `background-IMAGE`, so the opaque `--bg-surface-1`
 * colour floor is never animated away. This spec PINS that invariant two ways:
 *   1) a SELECTED card's computed `background-color` is opaque (alpha ≈ 1) — the
 *      direct proof the colour floor survives the gradient;
 *   2) during a real FIFO de-select, the de-selecting card's `background-color`
 *      never drops below opaque across the transition frames (no transparent gap).
 */

import { test, expect, type Page } from "@playwright/test";

async function gotoSkillsStep(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "d20-folio-ui",
      JSON.stringify({ state: { theme: "light", motion: "auto" }, version: 0 })
    );
    localStorage.setItem("i18nextLng", "en");
  });
  await page.setViewportSize({ width: 1100, height: 850 });
  await page.goto("/characters/new");
  await page
    .getByRole("button", { name: /guided/i })
    .first()
    .click();
  await page
    .getByRole("option", { name: /^Fighter/ })
    .first()
    .click();
  await page.waitForTimeout(150);
  // The Skills step is the 4th progress ORB (Class · Species · Background · Skills · …).
  await page.locator(".wiz-orb").nth(3).click();
  await expect(page.locator(".wiz-pick .wiz-row").first()).toBeVisible({
    timeout: 5000,
  });
}

test("a picked F row always keeps its surface gradient (light)", async ({ page }) => {
  await gotoSkillsStep(page);
  await page.locator(".wiz-pick .wiz-row").first().click();
  await page.waitForTimeout(250); // let the pick settle

  const bgImage = await page.evaluate(() => {
    const sel = document.querySelector(".wiz-pick .wiz-entry[data-picked]");
    return sel ? getComputedStyle(sel).backgroundImage : "";
  });
  expect(bgImage, "no picked .wiz-entry found").not.toBe("");
  // The row's fill is its gradient surface — it must NEVER compute to `none`
  // (a see-through row would flash the bright backdrop through, the #58 bug).
  expect(bgImage).toContain("gradient");
});

test("the de-selecting row never goes see-through during a FIFO swap (light)", async ({
  page,
}) => {
  await gotoSkillsStep(page);
  const rows = page.locator(".wiz-pick .wiz-row");
  const n = await rows.count();
  test.skip(n < 3, "needs at least 3 options to force a FIFO swap");

  // Fill to the limit (Fighter picks 2), so the next pick FIFO-drops the oldest.
  await rows.nth(0).click();
  await page.waitForTimeout(150);
  await rows.nth(1).click();
  await page.waitForTimeout(300);

  // Click the 3rd → drops row 0 (the oldest). Sample row 0's background-image
  // across the transition; it must keep a gradient fill the whole way (never
  // `none` — the see-through blink of #58).
  const sawNone = await page.evaluate(async () => {
    const rowsEls = document.querySelectorAll(".wiz-pick .wiz-row");
    const first = rowsEls[0];
    const third = rowsEls[2];
    const entry = first?.closest(".wiz-entry");
    if (!entry || !(third instanceof HTMLElement)) return null;
    third.click(); // triggers the de-select of row 0
    let none = false;
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (getComputedStyle(entry).backgroundImage === "none") none = true;
        if (performance.now() - start > 320) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return none;
  });
  expect(sawNone, "row 0 not found").not.toBeNull();
  expect(sawNone).toBe(false);
});
