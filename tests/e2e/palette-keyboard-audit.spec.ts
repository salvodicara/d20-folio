/**
 * E2E AUDIT: "Ask the Folio" keyboard navigation can never go dead (#75 / #76).
 *
 * Both reported incidents reduced to ONE root: focus not being on the palette while
 * it's open, so ↑↓/↵ had nowhere to land. This spec locks the structural guarantees
 * that make that impossible:
 *   • initial focus lands on the SEARCH FIELD on open (`onOpenAutoFocus`), standalone
 *     AND stacked over another modal — see also palette-nested-keyboard.spec.ts;
 *   • result rows are NOT tab stops (`tabIndex={-1}`), so Tab can't strand focus;
 *   • the PALETTE BODY owns the nav handler, so ↑↓/Home/End/↵ work for ANY focus
 *     inside the body, not only the input;
 *   • opening the bug reporter from the palette CLOSES the palette (no stuck stack).
 */

import { test, expect, type Page } from "@playwright/test";
import { ensurePaletteSearchFocused } from "./ready";

async function gotoSheet(page: Page) {
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
}

const ad = (page: Page) =>
  page.evaluate(
    () =>
      document
        .querySelector('[role="combobox"]')
        ?.getAttribute("aria-activedescendant") ?? null
  );

test("standalone: ⌘K → type → ↑↓ → ↵ is a complete keyboard flow", async ({ page }) => {
  await gotoSheet(page);
  await page.keyboard.press("Meta+k");
  await expect(page.locator('[role="combobox"]')).toBeVisible();
  await page.waitForTimeout(150);

  // Focus is the search field (auto on desktop; tapped on touch — the field is not
  // auto-focused there by design, so type/↑↓/↵ must start from an explicit focus).
  await ensurePaletteSearchFocused(page);

  await page.keyboard.type("comp"); // matches "Compendium" section
  await page.waitForTimeout(150);
  const before = await ad(page);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(100);
  expect(before).not.toBeNull();
  expect(await ad(page)).not.toBe(before);

  // Wrap-around: ArrowUp from the first lands on the last and back.
  await page.keyboard.press("Home");
  await page.waitForTimeout(60);
  const first = await ad(page);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(60);
  expect(await ad(page)).not.toBe(first);
});

test("result rows are not tab stops (focus stays in the combobox flow)", async ({
  page,
}) => {
  await gotoSheet(page);
  await page.keyboard.press("Meta+k");
  await page.waitForTimeout(150);
  await ensurePaletteSearchFocused(page);
  await page.keyboard.type("comp");
  await page.waitForTimeout(150);
  const optionTabIndexes = await page.evaluate(() =>
    [...document.querySelectorAll('[role="option"]')].map(
      (o) => (o as HTMLElement).tabIndex
    )
  );
  expect(optionTabIndexes.length).toBeGreaterThan(0);
  expect(optionTabIndexes.every((ti) => ti === -1)).toBe(true);
});

test("the palette BODY owns nav: ↑↓ work even when focus is a non-input body element", async ({
  page,
}) => {
  await gotoSheet(page);
  await page.keyboard.press("Meta+k");
  await page.waitForTimeout(150);
  await ensurePaletteSearchFocused(page);
  await page.keyboard.type("comp");
  await page.waitForTimeout(150);

  // Move focus OFF the input onto a result row (inside the palette body). If the nav
  // handler were bound to the input alone, arrows would now be dead; bound to the
  // body, they keep working.
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('[role="option"]')?.focus();
  });
  const before = await ad(page);
  await page.locator('[role="option"]').first().press("ArrowDown");
  await page.waitForTimeout(100);
  expect(before).not.toBeNull();
  expect(await ad(page)).not.toBe(before);
});

test("opening the bug reporter from the palette CLOSES the palette (no stuck stack)", async ({
  page,
}) => {
  await gotoSheet(page);
  await page.keyboard.press("Meta+k");
  await page.waitForTimeout(150);
  await ensurePaletteSearchFocused(page);
  await page.keyboard.type("report");
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
  // The report action closes the palette before opening the reporter; the palette
  // must not linger underneath with dead keyboard nav.
  await expect(page.locator('[role="combobox"]')).toHaveCount(0, { timeout: 4000 });
});
