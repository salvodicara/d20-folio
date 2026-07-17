/**
 * E2E: the keyboard-shortcuts affordances must not present on a touch device (owner:
 * "shortcuts don't make much sense on mobile").
 *
 * The `?` shortcuts sheet is a keyboard feature — on a coarse-pointer device with no
 * keyboard, the UI that ADVERTISES it is noise. Both palette entry points route
 * through the shared `useCoarsePointer()` seam (`src/hooks/useCoarsePointer.ts`, the
 * same `(pointer: coarse)` query that hides the topbar ⌘K chip):
 *   • the palette footer `? Shortcuts` chip, and
 *   • the palette's "Keyboard shortcuts" action.
 *
 * The single spec runs under BOTH the desktop (`chromium`, fine pointer) and touch
 * (`mobile`, coarse pointer) projects and asserts the pointer-appropriate presence,
 * pinning the emulation contract so the assertion proves the real mechanism.
 */

import { test, expect, type Page } from "@playwright/test";

async function openPalette(page: Page) {
  await page.goto("/characters/mock-1");
  await expect(page.getByText("Lyra Voss").first()).toBeVisible();
  await page.keyboard.press("Meta+k");
  await expect(page.locator('[role="combobox"]')).toBeVisible();
}

test("hides the `?` shortcuts entry points on a coarse (touch) pointer, shows them on a fine one", async ({
  page,
}, testInfo) => {
  await openPalette(page);

  const coarse = await page.evaluate(
    () => window.matchMedia("(pointer: coarse)").matches
  );
  // Pin the emulation contract: the `mobile` project presents as coarse, every other
  // project as fine. The gate keys off exactly this query, so if the emulation drifts
  // the gate's trigger drifts with it — pinning it keeps the assertions meaningful.
  expect(coarse).toBe(testInfo.project.name === "mobile");

  const footChip = page.locator(".palette-foot-chip");
  const shortcutsAction = page.getByRole("option", { name: /keyboard shortcuts/i });

  // Reveal the shortcuts action (it fans out on type — not curated into the empty
  // launcher). `fill` sets the value without needing focus (coarse skips auto-focus).
  await page.locator("#palette-search-input").fill("shortcuts");

  if (coarse) {
    await expect(footChip).toHaveCount(0);
    await expect(shortcutsAction).toHaveCount(0);
  } else {
    await expect(footChip).toBeVisible();
    await expect(shortcutsAction).toBeVisible();
  }
});
