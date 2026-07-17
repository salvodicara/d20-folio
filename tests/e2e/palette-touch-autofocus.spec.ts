/**
 * E2E: opening "Ask the Folio" (⌘K) must not RESIZE the page on touch (owner:
 * "opening the command palette resizes the page, mainly on mobile").
 *
 * Root cause split by device:
 *  • DESKTOP is already fixed — `html { scrollbar-gutter: stable }` keeps the
 *    scrollbar's space reserved, so Radix's modal scroll-lock removes nothing and
 *    the centred page can't shift sideways.
 *  • MOBILE is a DIFFERENT phenomenon — the scrollbars are zero-width overlays (no
 *    reflow to compensate). What the owner sees is the SOFT KEYBOARD popping because
 *    the palette auto-focused its search input on open, which shrinks the visual
 *    viewport and visibly resizes the page underneath.
 *
 * The fix guards the open auto-focus on a COARSE pointer: on touch the palette opens
 * WITHOUT stealing focus (the user taps the field to type — the standard mobile
 * pattern), so no keyboard, no resize. On a fine pointer (desktop) the field still
 * grabs focus immediately so type / ↑↓ / ↵ works at once — unchanged.
 *
 * The single spec runs under BOTH the desktop (`chromium`) and touch (`mobile`)
 * projects and asserts the pointer-appropriate behaviour, pinning the emulation
 * contract so the test proves the real mechanism (not a tautology).
 */

import { test, expect, type Page } from "@playwright/test";

async function openPalette(page: Page) {
  await page.goto("/characters/mock-1");
  await expect(page.getByText("Lyra Voss").first()).toBeVisible();
  await page.keyboard.press("Meta+k");
  await expect(page.locator('[role="combobox"]')).toBeVisible();
}

const activeId = (page: Page) => page.evaluate(() => document.activeElement?.id ?? null);

test("auto-focuses the search on a fine pointer but not on a coarse (touch) pointer", async ({
  page,
}, testInfo) => {
  await openPalette(page);

  const coarse = await page.evaluate(
    () => window.matchMedia("(pointer: coarse)").matches
  );
  // Pin the emulation contract: the `mobile` project presents as a coarse-pointer
  // (touch) device and every other project as a fine one. The fix keys off exactly
  // this media query, so if the emulation ever drifts the fix's trigger drifts with
  // it — pinning it here keeps the assertion below meaningful rather than a tautology.
  expect(coarse).toBe(testInfo.project.name === "mobile");

  if (coarse) {
    // Touch: the search field must NOT hold focus → the soft keyboard never pops →
    // the viewport isn't shrunk → the page doesn't resize under the palette. Give any
    // stray focus a beat to (fail to) land before asserting.
    await page.waitForTimeout(150);
    expect(await activeId(page)).not.toBe("palette-search-input");
  } else {
    // Desktop: focus lands on the field deterministically (unchanged behaviour).
    await expect.poll(() => activeId(page)).toBe("palette-search-input");
  }
});
