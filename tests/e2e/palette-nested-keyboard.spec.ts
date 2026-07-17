/**
 * E2E: "Ask the Folio" keeps full keyboard control when opened OVER another modal (#75).
 *
 * The bug (owner): open the palette on top of a modal (e.g. the weapon-mastery /
 * level-up dialog) and arrow-key navigation was dead. Root cause — initial focus
 * landed on the palette's own close ✕ (the first focusable in the content), not the
 * search field: a bare `autoFocus` on the input only wins the focus race when the
 * palette is the SOLE dialog; with a second Radix FocusScope already mounted (the
 * underlying modal) the close ✕ won instead, so the input never held focus and
 * type / ↑↓ / ↵ did nothing.
 *
 * The fix steers the dialog's `onOpenAutoFocus` to the field deterministically. This
 * spec proves the keyboard flow works WITH a modal already open: focus lands on the
 * search field, typing filters, ↑↓ moves the roving highlight, and ↵ activates.
 */

import { test, expect, type Page } from "@playwright/test";
import { ensurePaletteSearchFocused } from "./ready";

async function openLevelUpModal(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "d20-folio-ui",
      JSON.stringify({ state: { theme: "dark", motion: "auto" }, version: 0 })
    );
    localStorage.setItem("i18nextLng", "en");
  });
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("/characters/mock-1");
  await expect(page.getByText("Lyra Voss").first()).toBeVisible();
  await page
    .getByRole("button", { name: /level up|livello/i })
    .first()
    .click();
  await expect(page.getByText(/9 → 10/).first()).toBeVisible();
  await page.waitForTimeout(250);
}

test("arrow nav + type work in the palette opened over a modal", async ({ page }) => {
  await openLevelUpModal(page);

  // Open the palette ON TOP of the modal via ⌘K.
  await page.keyboard.press("Meta+k");
  await expect(page.locator('[role="combobox"]')).toBeVisible();
  await page.waitForTimeout(200);

  // The SEARCH FIELD must hold focus (not the close ✕) so typing/arrows reach it —
  // deterministically won by `onOpenAutoFocus` on desktop even stacked over a modal;
  // on touch the field is not auto-focused by design, so tap it (the real gesture).
  await ensurePaletteSearchFocused(page);

  // Typing filters the results.
  await page.keyboard.type("char");
  await page.waitForTimeout(200);
  await expect(page.locator('[role="combobox"]')).toHaveValue("char");

  // ↑↓ moves the roving highlight (aria-activedescendant).
  const ad = () =>
    page.evaluate(
      () =>
        document
          .querySelector('[role="combobox"]')
          ?.getAttribute("aria-activedescendant") ?? null
    );
  const before = await ad();
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(120);
  const after = await ad();
  expect(before).not.toBeNull();
  expect(after).not.toBe(before);

  // ↵ activates the highlighted hit → navigates away (palette closes).
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  await expect(page.locator('[role="combobox"]')).toHaveCount(0);
});
