/**
 * topbar-brand-invariant — the mobile topbar's brand / search / account cluster are
 * FIXED-SIZE INVARIANTS at every breakpoint and combat state (owner, 2026-07-11:
 * "The INVARIANTS (logo, search bar, profile) cannot change or users will be wtf. If
 * anything has to adapt on mobile it's the ENCOUNTER CHIPS").
 *
 * History: a live encounter used to SHRINK the "d20 Folio" brand (die 34→26px, wordmark
 * a step down) to make room for the combat pip at 390px — a jarring, "big bug" resize the
 * owner flagged. The pip lives in the topbar's `flex:1` spacer, so its appearance must be
 * absorbed by that slack (and the pip itself truncates) WITHOUT nudging the brand, the
 * search trigger, or the account cluster by a single pixel.
 *
 * This pins that at the tightest supported width (390px): the brand, search, and profile
 * bounding boxes are byte-identical with and without an active encounter. jsdom can't
 * measure layout, so it is proven in real Chromium.
 */

import { test, expect, type Page } from "@playwright/test";
import { seedUI, seedLang, MOBILE } from "./surfaces";

type Box = { x: number; y: number; width: number; height: number };

/** The three invariant clusters' bounding boxes, rounded to whole device px. */
async function invariantBoxes(page: Page): Promise<Record<string, Box>> {
  const raw = await page.evaluate(() => {
    const round = (b: DOMRect) => ({
      x: Math.round(b.x),
      y: Math.round(b.y),
      width: Math.round(b.width),
      height: Math.round(b.height),
    });
    const pick = (sel: string) => {
      const el = document.querySelector(sel);
      return el ? round(el.getBoundingClientRect()) : null;
    };
    return JSON.stringify({
      brand: pick(".topbar-brand"),
      search: pick(".topbar-ask"),
      user: pick(".topbar-user"),
    });
  });
  return JSON.parse(raw) as Record<string, Box>;
}

test.use({ viewport: MOBILE });

test.describe("mobile topbar — brand / search / profile are combat-invariant", () => {
  // Cover BOTH the quiet split pip (`actorturn`) and the loud needs-roll roller — the two
  // structurally different pip forms, each of which must fit the slack without moving the
  // invariants.
  for (const phase of ["actorturn", "needsroll"] as const) {
    test(`brand, search and account boxes are byte-identical with and without a ${phase} encounter (390px)`, async ({
      page,
    }) => {
      await seedUI(page, "dark", "play");
      await seedLang(page, "en");

      // ── State A: NO encounter (pip absent) — the resting phone topbar. ──
      await page.goto("/characters/mock-1");
      await page.locator(".topbar-brand").waitFor({ timeout: 20_000 });
      // The pip must genuinely be absent in this state (else the comparison is vacuous).
      await expect(page.locator(".combat-pip-wrap")).toHaveCount(0);
      // The brand wordmark is Cinzel (a web font) — measure only once fonts have loaded, or
      // a pre-font fallback width races the post-font width across the two loads (flaky).
      await page.evaluate(() => document.fonts.ready);
      const resting = await invariantBoxes(page);

      // ── State B: LIVE encounter (pip present) — seed the dev-bypass pip. ──
      await page.addInitScript(
        (p) => window.localStorage.setItem("d20-dev-pip", p),
        phase
      );
      await page.goto("/characters/mock-1");
      await page.locator(".combat-pip-wrap").waitFor({ timeout: 20_000 });
      await page.evaluate(() => document.fonts.ready);
      const inCombat = await invariantBoxes(page);

      // The bar must never overflow the viewport (the pip is absorbed by the spacer's slack).
      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollW, "no horizontal overflow at 390px").toBeLessThanOrEqual(
        MOBILE.width
      );

      // The three invariants are byte-identical across states — the brand NEVER shrinks or
      // shifts; the search + account cluster stay anchored. Only the pip adapts.
      for (const key of ["brand", "search", "user"] as const) {
        expect(resting[key], `${key} present in resting state`).toBeTruthy();
        expect(inCombat[key], `${key} present in combat state`).toBeTruthy();
        expect(inCombat[key], `${key} box is combat-invariant`).toEqual(resting[key]);
      }
    });
  }

  test("the needs-roll pip keeps its ≥44px touch target on mobile (the ::before overlay isn't clipped)", async ({
    page,
  }) => {
    // Regression guard: capping the pip wrap to the spacer's slack must NOT use
    // `overflow:hidden` — that clips the loud red roller's transparent ≥44px hit overlay
    // (a `::before` extending past the ~21px pill) back to the pill height, gutting the
    // single most important combat tap on a phone. We probe 20px above AND below the pill
    // centre and require the point to still resolve onto the pip.
    await seedUI(page, "dark", "play");
    await seedLang(page, "en");
    await page.addInitScript(() =>
      window.localStorage.setItem("d20-dev-pip", "needsroll")
    );
    await page.goto("/characters/mock-1");
    await page
      .locator('.combat-pip[data-phase="needs-roll"]')
      .waitFor({ timeout: 20_000 });
    const reach = await page.evaluate(() => {
      const pip = document.querySelector('.combat-pip[data-phase="needs-roll"]');
      if (!pip) return null;
      const r = pip.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const hits = (dy: number) =>
        !!document
          .elementFromPoint(cx, cy + dy)
          ?.closest('.combat-pip[data-phase="needs-roll"]');
      return { pillHeight: Math.round(r.height), above: hits(-20), below: hits(20) };
    });
    expect(reach, "needs-roll pip present").toBeTruthy();
    const r = reach ?? { pillHeight: 0, above: false, below: false };
    // The pill itself is far shorter than 40px, yet the overlay must carry the tap ±20px.
    expect(r.pillHeight, "the visual pill stays compact").toBeLessThan(40);
    expect(r.above, "touch reaches 20px above the pill centre").toBe(true);
    expect(r.below, "touch reaches 20px below the pill centre").toBe(true);
  });
});
