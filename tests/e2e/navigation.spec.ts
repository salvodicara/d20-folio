/**
 * E2E: Navigation feel — the cross-page scroll / focus / overlay-Back contract
 * (DESIGN.md → "Navigation feel").
 *
 * Pins the four behaviours that make navigation feel native on a lazy-route SPA:
 *
 *  1. **Back restores the exact scroll** on a LAZY window route — the cockpit is
 *     `React.lazy` + Suspense, the historic clamp-to-top bug's home. Scroll deep,
 *     push to another route, Back → the offset is restored (never dumped at top).
 *  2. **A fresh forward PUSH starts at the top** — opening a character from the
 *     roster lands at the top of the sheet, regardless of the roster's scroll.
 *  3. **A realm switch lands at the top — rock-solid masthead** (owner
 *     2026-07-10): switching realms via the tabs NEVER restores a remembered
 *     offset, so the masthead lands in exactly the same place every time (the
 *     old per-realm memory made the page visibly jump after mount).
 *  4. **Back closes an open overlay and STAYS on the page** — the hardware /
 *     gesture Back peels the command palette, it does not navigate away.
 *
 * Auth is bypassed by the webServer's `VITE_DEV_BYPASS_AUTH`; the mock roster
 * (Lyra Voss + the team fixtures) and `mock-1` cockpit load with no sign-in.
 */

import { test, expect } from "@playwright/test";

test.describe("navigation feel", () => {
  test("Back restores the exact scroll on a lazy window route", async ({ page }) => {
    await page.goto("/characters/mock-1", { waitUntil: "domcontentloaded" });
    await page.getByRole("main").waitFor();

    // Scroll deep into the (tall, lazy) character sheet.
    const y = await page.evaluate(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.min(1200, max));
      return window.scrollY;
    });
    expect(y).toBeGreaterThan(200); // sanity: the page is tall enough to test

    // PUSH to another route via the topbar realm tab, then Back.
    await page.getByRole("link", { name: "Characters", exact: true }).first().click();
    await expect(page).toHaveURL(/\/characters$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/characters\/mock-1/);

    // The saved offset is restored once the lazy route re-mounts (not clamped to 0).
    await page.waitForFunction((exp) => Math.abs(window.scrollY - exp) < 40, y, {
      timeout: 5000,
    });
  });

  test("a fresh forward PUSH starts at the top", async ({ page }) => {
    await page.goto("/characters", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Open Lyra Voss/ }).waitFor();
    await page.evaluate(() => window.scrollTo(0, 300));

    await page.getByRole("button", { name: /Open Lyra Voss/ }).click();
    await expect(page).toHaveURL(/\/characters\/[^/]+$/);

    await page.waitForFunction(() => window.scrollY < 20, undefined, { timeout: 5000 });
  });

  test("a realm switch always lands at the top — the masthead never jumps", async ({
    page,
  }) => {
    // Regression (owner 2026-07-09/10 masthead jump): the realm indexes used to
    // restore a remembered scroll offset on PUSH, so returning to a scrolled realm
    // painted the top then visibly jumped down — and the masthead/crest never
    // landed in the same place twice. A short viewport guarantees the realm index
    // scrolls regardless of how many mock characters the dev roster seeds.
    await page.setViewportSize({ width: 390, height: 360 });
    await page.goto("/characters", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Open Lyra Voss/ }).waitFor();

    const y = await page.evaluate(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.min(150, max));
      return window.scrollY;
    });
    expect(y).toBeGreaterThan(20); // the realm index scrolls at this viewport

    // Switch realms via the bottom nav, then return via the tab: the return is a
    // fresh PUSH and must land at the very top (no remembered offset, no jump).
    // Wait for the compendium to actually COMMIT (heading rendered), not just for
    // the URL: a return click while the lazy route is still pending is a same-
    // location REPLACE (React Router cancels the transition) — a no-op that
    // rightly leaves scroll alone, which is not the scenario under test.
    await page.getByRole("link", { name: /Compendium/ }).click();
    await expect(page.getByRole("heading", { name: /Compendium/ })).toBeVisible();
    await page
      .getByRole("link", { name: /Characters/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/characters$/);

    // Settle a beat, then pin: the page stays at the top (a late restore jump
    // would move it after mount — exactly the regression this guards against).
    await page.waitForFunction(() => window.scrollY === 0, undefined, { timeout: 5000 });
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("Back closes an open overlay and stays on the page", async ({ page }) => {
    await page.goto("/characters/mock-1", { waitUntil: "domcontentloaded" });
    await page.getByRole("main").waitFor();
    const url = page.url();

    // Open the command palette (a controlled Dialog → inherits overlay-Back).
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByRole("dialog")).toBeVisible();

    // Hardware / gesture Back closes the overlay — and does NOT navigate away.
    await page.evaluate(() => window.history.back());
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page).toHaveURL(url);
  });
});

test.describe("the anchor rule (D1–D3) — every surface lights one anchor", () => {
  test("a ring page lights the account cluster, no realm tab", async ({ page }) => {
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await page.getByRole("main").waitFor();

    // The account cluster is the anchor — lit like a hub tab.
    await expect(page.locator('.acct-trigger[data-current="true"]')).toBeVisible();
    // The Settings menu row marks itself current (open the menu to see it).
    await page.locator(".acct-trigger").click();
    await expect(page.getByRole("menuitem", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await page.keyboard.press("Escape");

    // No realm tab is current, and there is NO Back button on a ring page.
    await expect(page.locator('.topbar a[aria-current="page"]')).toHaveCount(0);
  });

  test("legal lights the footer link", async ({ page }) => {
    await page.goto("/legal", { waitUntil: "domcontentloaded" });
    await page.getByRole("main").waitFor();
    await expect(page.locator('.site-footer-link[aria-current="page"]')).toBeVisible();
    // The account cluster is NOT lit on legal (its anchor is the footer).
    await expect(page.locator('.acct-trigger[data-current="true"]')).toHaveCount(0);
  });

  test("a realm page lights only its hub tab", async ({ page }) => {
    await page.goto("/characters", { waitUntil: "domcontentloaded" });
    await page.getByRole("main").waitFor();
    // The realm tab is current; the account cluster + footer link are not.
    await expect(page.locator('.topbar a[aria-current="page"]').first()).toBeVisible();
    await expect(page.locator('.acct-trigger[data-current="true"]')).toHaveCount(0);
    await expect(page.locator('.site-footer-link[aria-current="page"]')).toHaveCount(0);
  });
});

test.describe("document title (D5) — the browser-level breadcrumb", () => {
  test("the roster titles the tab with the realm name", async ({ page }) => {
    await page.goto("/characters", { waitUntil: "domcontentloaded" });
    await page.getByRole("main").waitFor();
    await expect(page).toHaveTitle("Characters · d20 Folio");
  });

  test("the cockpit titles the tab with the character name", async ({ page }) => {
    await page.goto("/characters/mock-1", { waitUntil: "domcontentloaded" });
    await page.getByRole("main").waitFor();
    await expect(page).toHaveTitle("Lyra Voss · d20 Folio");
  });

  test("settings titles the tab", async ({ page }) => {
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await page.getByRole("main").waitFor();
    await expect(page).toHaveTitle("Settings · d20 Folio");
  });

  test("legal titles the tab", async ({ page }) => {
    await page.goto("/legal", { waitUntil: "domcontentloaded" });
    await page.getByRole("main").waitFor();
    await expect(page).toHaveTitle("Legal & Attribution · d20 Folio");
  });

  test("a compendium entry titles the tab with the entry name", async ({ page }) => {
    await page.goto("/compendium", { waitUntil: "domcontentloaded" });
    await page.getByRole("main").waitFor();
    await expect(page).toHaveTitle("Compendium · d20 Folio");

    // Deep-link an open entry → `<Entry> · Compendium · d20 Folio`.
    await page.goto("/compendium?type=spell&sel=fire-bolt", {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("main").waitFor();
    await expect(page).toHaveTitle("Fire Bolt · Compendium · d20 Folio");
  });
});
