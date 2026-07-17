/**
 * E2E: the Living Sheet vitals row — the pixel-geometry pin the unit test
 * (`tests/unit/combat-header.test.tsx`) defers to (jsdom has no layout engine).
 *
 * Locks the two invariants of the Rest moon medallion's placement (owner-ratified
 * mobile round, variant C — the coin is a same-row SIBLING trailing HP, one rule
 * across breakpoints, NEVER an overlay on the bar track):
 *
 *  1. **Zero bar-track overlap (phones).** At 390px the coin's left edge sits at
 *     or past the Liquid-Mercury bar's right edge — clear air between them, never
 *     the coin floating over the track. The coin keeps its full 44px face and
 *     shares HP's TOP row; the four reference tiles wrap to an even row beneath.
 *  2. **Locale-stable geometry (the round-3 acceptance).** The vitals-row boxes —
 *     HP tile, the coin, and the four reference tiles — land at byte-identical
 *     rects in EN and IT (the glyph-only coin renders no locale-varying text, so
 *     the row cannot shift between languages).
 *
 * Plus the desktop composition: [HP][coin][AC · Init · Speed · PB] read as ONE
 * row (the coin an inline peer between HP and AC).
 */

import { test, expect, type Page } from "@playwright/test";
import { MOBILE, seedUI, seedLang, freezeMotion } from "./surfaces";
import { waitForStableLayout } from "./ready";

type Rect = { x: number; y: number; w: number; h: number };

/** Rounded bounding rects of the vitals-row members, in DOM order. */
async function vitalsGeometry(page: Page): Promise<{
  hp: Rect | null;
  bar: Rect | null;
  coin: Rect | null;
  tiles: Rect[];
}> {
  return page.evaluate(() => {
    const r = (el: Element | null): Rect | null => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return {
        x: Math.round(b.x),
        y: Math.round(b.y),
        w: Math.round(b.width),
        h: Math.round(b.height),
      };
    };
    const vitals = document.querySelector(".hdr-vitals");
    return {
      hp: r(vitals?.querySelector(".vital-hp") ?? null),
      bar: r(vitals?.querySelector(".vital-hp .hp-bar") ?? null),
      coin: r(vitals?.querySelector(".rest-medal") ?? null),
      tiles: [
        // The four REFERENCE tiles (AC · Init · Speed · PB) — the HP tile also
        // wears `.vital[data-density="tile"]`, so exclude it explicitly.
        ...(vitals?.querySelectorAll<HTMLElement>(
          '.vital[data-density="tile"]:not(.vital-hp)'
        ) ?? []),
      ].map((el) => r(el) as Rect),
    };
  });
}

async function loadCockpit(page: Page, locale: "en" | "it"): Promise<void> {
  await seedUI(page, "dark", "play");
  await seedLang(page, locale);
  await page.goto("/characters/mock-1", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
  await page.locator(".hdr-vitals .rest-medal").waitFor({ timeout: 20000 });
  await freezeMotion(page);
  await waitForStableLayout(page);
}

test("phones: the Rest coin trails HP with clear air — zero bar-track overlap", async ({
  page,
}) => {
  test.skip(
    test.info().project.name === "mobile",
    "explicit 390×844 viewport — runs once under chromium"
  );
  await page.setViewportSize(MOBILE);
  await loadCockpit(page, "en");
  const { hp, bar, coin, tiles } = await vitalsGeometry(page);

  expect(hp, "the HP tile must render").not.toBeNull();
  expect(bar, "the HP Liquid-Mercury bar must render").not.toBeNull();
  expect(coin, "the Rest coin must render").not.toBeNull();
  expect(tiles.length, "the four reference tiles must render").toBe(4);
  if (!hp || !bar || !coin) return;

  // 1 — the coin keeps its full ~44px face (never shrunk into an overlay).
  expect(coin.w, "the coin face stays a full 44px").toBeGreaterThanOrEqual(40);
  expect(coin.h, "the coin face stays a full 44px").toBeGreaterThanOrEqual(40);

  // 2 — ZERO track overlap: the coin's left edge is at/past the bar's right edge.
  expect(
    coin.x,
    `the coin (x=${coin.x}) must sit past the HP bar's right edge (${bar.x + bar.w})`
  ).toBeGreaterThanOrEqual(bar.x + bar.w);

  // 3 — the coin shares HP's TOP row (its vertical centre falls inside the HP tile).
  const coinMid = coin.y + coin.h / 2;
  expect(coinMid).toBeGreaterThanOrEqual(hp.y);
  expect(coinMid).toBeLessThanOrEqual(hp.y + hp.h);

  // 4 — the four reference tiles wrap to their OWN even row beneath the HP row.
  for (const tile of tiles) {
    expect(
      tile.y,
      "each reference tile sits on the row beneath HP"
    ).toBeGreaterThanOrEqual(hp.y + hp.h - 1);
  }
});

test("phones: the vitals row is geometry-identical EN vs IT (locale-stable)", async ({
  page,
}) => {
  test.skip(
    test.info().project.name === "mobile",
    "explicit 390×844 viewport — runs once under chromium"
  );
  await page.setViewportSize(MOBILE);

  await loadCockpit(page, "en");
  const en = await vitalsGeometry(page);
  await loadCockpit(page, "it");
  const it = await vitalsGeometry(page);

  // The glyph-only coin carries no locale text, so every vitals box lands at the
  // same rect in both languages — the round-3 acceptance invariant, pinned in
  // real pixels.
  expect(it.hp).toEqual(en.hp);
  expect(it.coin).toEqual(en.coin);
  expect(it.tiles).toEqual(en.tiles);
});

test("desktop: [HP][coin][AC · Init · Speed · PB] read as one row", async ({ page }) => {
  test.skip(
    test.info().project.name === "mobile",
    "explicit desktop viewport — runs once under chromium"
  );
  await page.setViewportSize({ width: 1512, height: 960 });
  await loadCockpit(page, "en");
  const { hp, coin, tiles } = await vitalsGeometry(page);
  expect(hp).not.toBeNull();
  expect(coin).not.toBeNull();
  expect(tiles.length).toBe(4);
  if (!hp || !coin) return;

  // The coin is an inline peer immediately RIGHT of HP (its left past HP's right),
  // and every member shares one row (tops within a few px of the HP tile).
  expect(coin.x).toBeGreaterThanOrEqual(hp.x + hp.w);
  const tops = [hp.y, coin.y, ...tiles.map((t) => t.y)];
  const spread = Math.max(...tops) - Math.min(...tops);
  expect(
    spread,
    `the vitals members share one row (top spread ${spread}px)`
  ).toBeLessThanOrEqual(12);
});
