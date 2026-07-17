/**
 * party-nav-scroll-jump — REAL-Chromium proof that the combat-pip's "Vai al gruppo"
 * (sheet→party) navigation lands like any other push: at the TOP, no surprise.
 *
 * History: the pip used to carry `?scrollTo=party` and the hub auto-scrolled the encounter
 * into view. The owner reversed that ruling (2026-07-11): the auto-scroll read as a JUMP, and
 * the standing navigation doctrine is "never jump, never surprise". The `?scrollTo` param, its
 * hub reader, and the ScrollRestorer hand-off are all deleted — the pip now navigates to
 * `/campaigns/<id>` plainly, and the ScrollRestorer's normal behaviour governs (a fresh PUSH →
 * top; a POP → exact restore).
 *
 * jsdom can't see this — it is a real render-timing + scroll fact — so it is proven in a real
 * browser. The window.scrollTo(0,0) instrumentation makes the top-reset observable.
 */

import { test, expect, type Page } from "@playwright/test";
import { firstWord, teamFixtureName } from "./team-fixture";

// Derived from the pack fixture at runtime — no name literal ships publicly.
const HERO_NAME = teamFixtureName("catalion-bard");
const HERO_FIRST = firstWord(HERO_NAME);
import { seedUI, seedLang } from "./surfaces";

/** Boot the app with a deterministic quiet split pip (`.cp-dest-chip`) and instrument
 *  window.scrollTo so a top-reset (0,0) — the restorer's scroll-to-top — is observable. */
async function bootPip(page: Page): Promise<void> {
  await seedUI(page, "dark", "play");
  await seedLang(page, "en");
  await page.addInitScript(() => window.localStorage.setItem("d20-dev-pip", "actorturn"));
  await page.addInitScript(() => {
    const w = window as unknown as { __scrollTo0: number[] };
    w.__scrollTo0 = [];
    const orig = window.scrollTo.bind(window);
    window.scrollTo = (...args: unknown[]) => {
      const first = args[0];
      let x: unknown;
      let y: unknown;
      if (typeof first === "object" && first !== null) {
        x = (first as ScrollToOptions).left;
        y = (first as ScrollToOptions).top;
        orig(first as ScrollToOptions);
      } else {
        x = args[0];
        y = args[1];
        orig(x as number, y as number);
      }
      if ((x === 0 || x === undefined) && y === 0) w.__scrollTo0.push(Date.now());
    };
  });
}

const topResets = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __scrollTo0: number[] }).__scrollTo0.length
  );
const resetTopResets = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { __scrollTo0: number[] }).__scrollTo0 = [];
  });

test.describe("combat-pip sheet↔party navigation — plain landing (no auto-scroll)", () => {
  test("both the hero-flip and the group nav land at the TOP, URL stays clean", async ({
    page,
  }) => {
    test.skip(!HERO_NAME, "pack fixtures absent (SRD-only tree)");
    await bootPip(page);

    // ── Warm the hub chunk on the ENCOUNTER surface (pip flips to the hero here). ──
    await page.goto("/campaigns/mock-1");
    const partyHead = page.locator("#party-head");
    await partyHead.waitFor({ timeout: 20_000 });
    // Scroll the encounter down so the upcoming top-landings are non-vacuous.
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);

    // ── (a) HERO FLIP — a bare /characters/<id> PUSH → tops out. ──
    await resetTopResets(page);
    await page.locator(".combat-pip-split .cp-dest-chip").click();
    await page.waitForURL("**/characters/team-catalion-bard", { timeout: 20_000 });
    await page.getByText(HERO_FIRST).first().waitFor({ timeout: 20_000 });
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 10_000 })
      .toBeLessThan(5);
    expect(await topResets(page), "hero-flip PUSH scrolls to top").toBeGreaterThan(0);

    // ── (b) GROUP NAV — /campaigns/mock-1 (NO scrollTo) → lands at the TOP too. ──
    await page.evaluate(() => window.scrollTo(0, 600)); // scroll down again on the sheet
    await resetTopResets(page);
    await page.locator(".combat-pip-split .cp-dest-chip").click();
    await page.waitForURL("**/campaigns/mock-1", { timeout: 20_000 });
    await partyHead.waitFor({ timeout: 20_000 });
    // Lands at the TOP (the restorer forced it) — the encounter header is at the very top of
    // the viewport, NOT pushed below a topbar-clearing anchor scroll.
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 10_000 })
      .toBeLessThan(5);
    expect(await topResets(page), "group nav PUSH scrolls to top").toBeGreaterThan(0);

    // The URL is a PLAIN hub path — no `?scrollTo` param was ever added.
    expect(new URL(page.url()).search).toBe("");

    // Focus (a11y) moved to #main on the push.
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id), { timeout: 10_000 })
      .toBe("main");
  });
});
