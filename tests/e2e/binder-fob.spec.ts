/**
 * E2E: THE BINDER'S FOB — the desktop management home (owner-ratified).
 *
 * On fine-pointer ≥768px viewports the sheet's management chrome is the fixed
 * bottom-right coin chain (✎ standing · ⋯ above it · ⟲ ⟳ mounting with
 * history), completely off the masthead — the masthead is pure identity +
 * vitals. This spec pins the invariants jsdom cannot see:
 *
 *  1. NO-REFLOW edit toggle — the ✎ coin lights amber in place (activation, not
 *     wording); entering/leaving edit never shifts the layout, and the coin's
 *     own box never changes.
 *  2. Always-reachable by construction — deep-scrolled, the lit coin is still
 *     on-screen and exits edit (the fixed coin IS the exit — no floating Done).
 *  3. Undo acts on a REAL out-of-combat act (a spell cast) through the same
 *     seam as ⌘Z — the ⟲ coin mounts with history and reverses the cast, and
 *     mounting the pair never moves the standing coins.
 *  4. The toast lane yields to the fob column — a live toast never overlaps.
 *  5. axe-clean on the play tab (both themes) with the chain fully populated.
 */

import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { seedUI, seedLang, freezeMotion, type Theme } from "./surfaces";
import { waitForStableLayout } from "./ready";

type Rect = { x: number; y: number; w: number; h: number };

async function rectOf(page: Page, selector: string): Promise<Rect | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return {
      x: Math.round(b.x),
      y: Math.round(b.y),
      w: Math.round(b.width),
      h: Math.round(b.height),
    };
  }, selector);
}

async function loadCockpit(page: Page, theme: Theme = "dark"): Promise<void> {
  await seedUI(page, theme, "play");
  await seedLang(page, "en");
  await page.goto("/characters/mock-1", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
  await freezeMotion(page);
  await waitForStableLayout(page);
}

/** Cast Healing Word on the spells tab — a real out-of-combat undoable act. */
async function castHealingWord(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Expand: Healing Word/i }).click();
  const detail = page.getByRole("region", { name: /Healing Word/i });
  await detail.getByRole("button", { name: /cast/i }).first().click();
  // A leveled spell may open the slot-level picker — pick the first slot option.
  const modal = page.getByRole("dialog");
  if (await modal.isVisible({ timeout: 1500 }).catch(() => false)) {
    await modal.locator(".cl-slot").first().click();
  }
}

test("no-reflow: the ✎ coin toggles edit by lighting in place; the masthead is pure identity + vitals", async ({
  page,
}) => {
  test.skip(
    test.info().project.name === "mobile",
    "the fob is the desktop home — runs once under chromium"
  );
  await page.setViewportSize({ width: 1440, height: 960 });
  await loadCockpit(page);

  // The desktop home: the fob stands and the masthead carries no management row —
  // the right deck is the vitals strip alone, aligned against the name.
  await expect(page.locator(".fob")).toBeVisible();
  await expect(page.getByRole("button", { name: /^edit$/i })).toHaveCount(1);

  const tablistPlay = await rectOf(page, '[role="tablist"]');
  const contentPlay = await rectOf(page, ".content");
  const vitalsPlay = await rectOf(page, ".hdr-vitals");
  const coinPlay = await rectOf(page, ".fob-edit");
  expect(tablistPlay, "the tab strip renders").not.toBeNull();
  expect(contentPlay, "the content column renders").not.toBeNull();
  expect(coinPlay, "the ✎ coin renders").not.toBeNull();

  // Enter edit via the coin — it lights (data-editing + pressed) IN PLACE.
  const coin = page.locator(".fob-edit");
  await coin.click();
  await expect(page.locator('.content[data-mode="edit"]')).toBeVisible();
  await expect(coin).toHaveAttribute("data-editing", "");
  await expect(coin).toHaveAttribute("aria-pressed", "true");
  await waitForStableLayout(page);

  // Zero reflow: the tab strip, the vitals band's vertical box, the content
  // column's position, AND the coin's own box are all byte-identical.
  expect(await rectOf(page, '[role="tablist"]')).toEqual(tablistPlay);
  const vBox = (r: Rect | null) => r && { y: r.y, h: r.h };
  expect(vBox(await rectOf(page, ".hdr-vitals"))).toEqual(vBox(vitalsPlay));
  const pos = (r: Rect | null) => r && { x: r.x, y: r.y, w: r.w };
  expect(pos(await rectOf(page, ".content"))).toEqual(pos(contentPlay));
  expect(await rectOf(page, ".fob-edit")).toEqual(coinPlay);

  // Leaving edit unlights the coin — same box again.
  await coin.click();
  await expect(page.locator('.content[data-mode="edit"]')).toHaveCount(0);
  await expect(coin).not.toHaveAttribute("data-editing");
  expect(await rectOf(page, ".fob-edit")).toEqual(coinPlay);
});

test("always reachable: deep-scrolled the fixed lit coin exits edit (no floating Done)", async ({
  page,
}) => {
  test.skip(
    test.info().project.name === "mobile",
    "the fob is the desktop home — runs once under chromium"
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadCockpit(page);

  const coin = page.locator(".fob-edit");

  // Enter edit at the top, then scroll deep — the fixed coin is still on-screen
  // (in the viewport), so it IS the always-reachable exit at any depth.
  await coin.click();
  await expect(page.locator('.content[data-mode="edit"]')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 1200));
  await expect(coin).toBeInViewport();
  await expect(coin).toHaveAttribute("data-editing", "");

  // The lit coin exits edit from down here — no scroll-back needed.
  await coin.click();
  await expect(page.locator('.content[data-mode="edit"]')).toHaveCount(0);
  await expect(coin).not.toHaveAttribute("data-editing");
});

test("undo acts on a real out-of-combat act — a spell cast — through the ⟲ coin", async ({
  page,
}) => {
  test.skip(
    test.info().project.name === "mobile",
    "the fob is the desktop home — runs once under chromium"
  );
  await page.setViewportSize({ width: 1440, height: 960 });
  await seedUI(page, "dark", "play");
  await seedLang(page, "en");
  await page.goto("/characters/mock-1?tab=spells", { waitUntil: "domcontentloaded" });
  await page
    .getByText(/Vicious Mockery/i)
    .first()
    .waitFor({ timeout: 20000 });
  await freezeMotion(page);

  const fob = page.locator(".fob");
  // The standing coins before history: no session pair yet.
  const editBefore = await rectOf(page, ".fob-edit");
  await expect(fob.getByRole("button", { name: /^Undo: /i })).toHaveCount(0);

  await castHealingWord(page);

  // The session pair mounts with history, naming the concrete act — and the
  // standing coins hold their exact screen position (the chain grows upward).
  const undoCoin = fob.getByRole("button", { name: /^Undo: /i });
  await expect(undoCoin).toBeVisible();
  expect(await rectOf(page, ".fob-edit")).toEqual(editBefore);

  // Acting on it reverses the cast (the same seam as ⌘Z): Undo empties the
  // past, so Redo becomes the enabled side (the act is now redoable).
  await undoCoin.click();
  await expect(fob.getByRole("button", { name: /^Redo: /i })).toBeEnabled();
  await expect(page.getByText(/Undone/i).first()).toBeVisible();

  // The toast lane yields to the fob column — the live toast never overlaps
  // the chain (lanes, not layers).
  const toast = await rectOf(page, ".toast-region .toast");
  const fobRect = await rectOf(page, ".fob");
  expect(toast, "the undo confirmation toast is on-screen").not.toBeNull();
  if (toast && fobRect) {
    expect(toast.x + toast.w).toBeLessThanOrEqual(fobRect.x);
  }
});

for (const theme of ["dark", "light"] as Theme[]) {
  test(`axe: the play tab is clean with the fob chain populated [${theme}]`, async ({
    page,
  }) => {
    test.skip(
      test.info().project.name === "mobile",
      "the fob is the desktop home — runs once under chromium"
    );
    await page.setViewportSize({ width: 1440, height: 960 });
    await seedUI(page, theme, "play");
    await seedLang(page, "en");
    await page.goto("/characters/mock-1?tab=spells", { waitUntil: "domcontentloaded" });
    await page
      .getByText(/Vicious Mockery/i)
      .first()
      .waitFor({ timeout: 20000 });
    await freezeMotion(page);

    // Populate the undo stack so the full chain (⟲ ⟳ ⋯ ✎) is on-screen.
    await castHealingWord(page);
    await expect(
      page.locator(".fob").getByRole("button", { name: /^Undo: /i })
    ).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = results.violations.filter(
      (v) => typeof v.impact === "string" && ["serious", "critical"].includes(v.impact)
    );
    const summary = blocking
      .map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`)
      .join("\n");
    expect(blocking, summary).toEqual([]);
  });
}
