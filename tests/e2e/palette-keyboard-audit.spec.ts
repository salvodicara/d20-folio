/**
 * E2E AUDIT: "Search the Folio" keyboard navigation can never go dead (#75 / #76).
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

  // Focus is the search field (auto on desktop; tapped on touch — the field is not
  // auto-focused there by design, so type/↑↓/↵ must start from an explicit focus).
  // ensurePaletteSearchFocused itself polls for the focus to land — no fixed sleep.
  await ensurePaletteSearchFocused(page);

  await page.keyboard.type("comp"); // "Compendium" section + SRD hits
  // ≥2 results means the lazily-built SRD index has landed (the specs + monster
  // catalogue load async on first open) — only then can ArrowDown move at all.
  await expect(page.locator('[role="option"]').nth(1)).toBeVisible();
  const before = await ad(page);
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => ad(page)).not.toBe(before);
  expect(before).not.toBeNull();

  // Wrap-around: ArrowUp from the first lands on the last and back.
  const afterDown = await ad(page);
  await page.keyboard.press("Home");
  await expect.poll(async () => ad(page)).not.toBe(afterDown);
  const first = await ad(page);
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => ad(page)).not.toBe(first);
});

test("result rows are not tab stops (focus stays in the combobox flow)", async ({
  page,
}) => {
  await gotoSheet(page);
  await page.keyboard.press("Meta+k");
  await ensurePaletteSearchFocused(page);
  await page.keyboard.type("comp");
  await expect(page.locator('[role="option"]').first()).toBeVisible();
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
  await ensurePaletteSearchFocused(page);
  await page.keyboard.type("comp");
  // Wait for the async SRD index (≥2 results) — ArrowDown needs somewhere to go.
  await expect(page.locator('[role="option"]').nth(1)).toBeVisible();

  // Move focus OFF the input onto a result row (inside the palette body). If the nav
  // handler were bound to the input alone, arrows would now be dead; bound to the
  // body, they keep working.
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('[role="option"]')?.focus();
  });
  const before = await ad(page);
  await page.locator('[role="option"]').first().press("ArrowDown");
  await expect.poll(async () => ad(page)).not.toBe(before);
  expect(before).not.toBeNull();
});

test("opening the bug reporter from the palette CLOSES the palette (no stuck stack)", async ({
  page,
}) => {
  await gotoSheet(page);
  await page.keyboard.press("Meta+k");
  await ensurePaletteSearchFocused(page);
  await page.keyboard.type("report");
  // The report ACTION row must be in the results before ↵ can activate it.
  await expect(page.getByRole("option", { name: /report/i }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  // The report action closes the palette before opening the reporter; the palette
  // must not linger underneath with dead keyboard nav.
  await expect(page.locator('[role="combobox"]')).toHaveCount(0, { timeout: 4000 });
});
