/**
 * E2E: click interactions must not JUMP the page (owner, 2026-07-04).
 *
 * Three named repros the owner hit on real devices, pinned here as scroll-stability
 * guards (a click must not move `window.scrollY`) plus the one directly-observable
 * behavioural fix:
 *
 *   (1) COMPENDIUM TYPE RIBBON (mobile) — tapping a type that sits off the ribbon's
 *       right edge used to leave it CLIPPED, and a touch browser's native focus-scroll
 *       then jumped the page to reveal it. The fix reveals the tab inside the ribbon's
 *       OWN horizontal scroller (scrollLeft only). Asserted directly: after the tap the
 *       selected tab is fully inside the viewport AND the page did not scroll.
 *   (2) ENCOUNTER INITIATIVE (gathering) — assigning an initiative re-sorts the live
 *       order; the keyed rows move under a stable scroll anchor, so the page holds.
 *   (3) ENCOUNTER TURN (begun) — a rapid double-click on Next must not scroll the page
 *       (the turn-skip half is the CAS covered by the unit suite; here we pin no jump).
 *
 * The turn/initiative WRITES no-op under dev-bypass (no Firestore) — these two assert
 * the layout/scroll stability, not the mutation; the mutation is unit-pinned.
 *
 * Tests 2 & 3 click IN PLACE via `page.mouse` at the target's settled box, NOT via
 * `locator.click()` — the latter runs `scrollIntoViewIfNeeded` before every click,
 * which is a test-harness scroll, not the user's. A real user's tap lands where the
 * element already is; that is what we measure.
 */

import { test, expect, type Page, type Locator } from "@playwright/test";

/** The current window scroll offset. */
function scrollY(page: Page): Promise<number> {
  return page.evaluate(() => Math.round(window.scrollY));
}

/** Click the settled centre of `target` with the real mouse (no auto-scroll). */
async function clickInPlace(page: Page, target: Locator): Promise<void> {
  const box = await target.boundingBox();
  if (!box) throw new Error("target has no box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test.describe("no page jump on click", () => {
  test("compendium type ribbon reveals an off-screen tab without scrolling the page", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto("/compendium");
    await expect(page.getByRole("searchbox")).toBeVisible();

    const before = await scrollY(page);
    const equipment = page.getByRole("tab", { name: "Equipment" });
    await equipment.click();
    // The tapped type is now selected AND fully revealed inside the viewport.
    await expect(equipment).toHaveAttribute("aria-selected", "true");
    const box = await equipment.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390 + 1);
    }
    // The PAGE never moved (the reveal touches only the ribbon's scrollLeft).
    expect(Math.abs((await scrollY(page)) - before)).toBeLessThanOrEqual(1);
  });

  test("assigning an encounter initiative does not jump the page", async ({ page }) => {
    await page.addInitScript(() =>
      window.localStorage.setItem("d20-dev-encounter", "gathering")
    );
    await page.goto("/campaigns/mock-1");
    const chip = page.locator("[aria-label*='nitiative' i]").last();
    await chip.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const before = await scrollY(page);

    await clickInPlace(page, chip);
    await page.waitForTimeout(150);
    await page.keyboard.press("Control+a").catch(() => {});
    await page.keyboard.type("99");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);

    expect(Math.abs((await scrollY(page)) - before)).toBeLessThanOrEqual(2);
  });

  test("double-clicking Next turn does not jump the page", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("d20-dev-encounter", "1"));
    await page.goto("/campaigns/mock-1");
    const next = page.getByRole("button", { name: /next turn/i }).first();
    await next.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const box = await next.boundingBox();
    if (!box) throw new Error("Next turn has no box");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const before = await scrollY(page);

    // A genuine rapid double-tap in place (the disarm blocks the second write; here we
    // pin that neither activation scrolls the page).
    await page.mouse.click(cx, cy);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(400);

    expect(Math.abs((await scrollY(page)) - before)).toBeLessThanOrEqual(2);
  });
});
