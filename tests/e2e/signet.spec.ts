/**
 * E2E: THE SIGNET — the mobile management home (owner-ratified 2026-07-11).
 *
 * On coarse-pointer / <768px viewports the sheet's management chrome is ONE
 * struck-metal coin fixed above the bottom nav: the seal coin at rest, blooming
 * a chain (⟲ ⟳ · ⋯ · ✎ Edit) on tap; the lit amber ✎ one-tap exit while editing.
 * This spec pins the invariants jsdom cannot see, at a real 390px Pixel 7:
 *
 *  1. Reachable at every scroll depth — the fixed seal coin stays on-screen and
 *     clears the bottom nav (no floating deep-scroll exit).
 *  2. Edit enter/exit via the Signet — tap the seal to bloom, tap ✎ Edit; the
 *     seal itself becomes the lit "Done editing" one-tap exit (the de-dup
 *     ruling: the pencil never appears twice).
 *  3. Undo acts on a REAL out-of-combat act (a spell cast) through the bloomed
 *     chain's ⟲ coin — the same seam as ⌘Z.
 *  4. No collision — the coin never overlaps the bottom nav, and a live toast
 *     never overlaps the coin.
 *  5. axe-clean on the play tab (both themes) with the chain bloomed.
 *
 * The Signet is the MOBILE home, so every test runs under the `mobile` project.
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

/** The Signet is the mobile home only — skip the desktop (chromium) project. */
function mobileOnly(): void {
  test.skip(
    test.info().project.name !== "mobile",
    "the Signet is the mobile home — runs under the mobile (Pixel 7) project"
  );
}

async function loadCockpit(page: Page, theme: Theme = "dark", tab = ""): Promise<void> {
  await seedUI(page, theme, "play");
  await seedLang(page, "en");
  await page.goto(`/characters/mock-1${tab}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
  await freezeMotion(page);
  await waitForStableLayout(page);
}

/** Cast Healing Word on the spells tab — a real out-of-combat undoable act. */
async function castHealingWord(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Expand: Healing Word/i }).click();
  const detail = page.getByRole("region", { name: /Healing Word/i });
  await detail.getByRole("button", { name: /cast/i }).first().click();
  const modal = page.getByRole("dialog");
  if (await modal.isVisible({ timeout: 1500 }).catch(() => false)) {
    await modal.locator(".cl-slot").first().click();
  }
}

const seal = (page: Page) => page.locator(".signet-fab");
const chain = (page: Page) => page.locator(".signet-chain");

test("idle: the seal coin bears the seal glyph — NOT a pencil — and blooms the chain (with ✎ Edit) on tap", async ({
  page,
}) => {
  mobileOnly();
  await loadCockpit(page);

  // At rest: the seal coin stands, aria "Sheet tools", wearing the Wrench tools
  // glyph — no pencil anywhere, no bloomed chain.
  const coin = seal(page);
  await expect(coin).toBeVisible();
  await expect(coin).toHaveAttribute("aria-label", /sheet tools/i);
  await expect(coin.locator("svg.lucide-wrench")).toHaveCount(1);
  await expect(coin.locator("svg.lucide-square-pen")).toHaveCount(0);
  await expect(chain(page)).toHaveCount(0);

  // Tap → the chain blooms with the ✎ Edit coin (the ONE pencil, in the chain).
  await coin.click();
  await expect(chain(page)).toBeVisible();
  await expect(page.getByRole("button", { name: /^edit$/i })).toBeVisible();
  await expect(chain(page).locator("svg.lucide-square-pen")).toHaveCount(1);
});

test("edit enter/exit via the Signet: the seal becomes the lit ✎ one-tap exit; no second pencil while editing", async ({
  page,
}) => {
  mobileOnly();
  await loadCockpit(page);
  const coin = seal(page);

  // Enter edit: bloom, then tap ✎ Edit — the chain closes and the seal itself
  // lights amber (data-editing + pressed, aria "Done editing").
  await coin.click();
  await page.getByRole("button", { name: /^edit$/i }).click();
  await expect(page.locator('.content[data-mode="edit"]')).toBeVisible();
  await expect(coin).toHaveAttribute("data-editing", "");
  await expect(coin).toHaveAttribute("aria-pressed", "true");
  await expect(coin).toHaveAttribute("aria-label", /done editing/i);
  await expect(coin.locator("svg.lucide-square-pen")).toHaveCount(1);
  await expect(chain(page)).toHaveCount(0);

  // De-dup invariant: entering edit is a one-tap exit — a lit-coin tap deactivates
  // — so the pencil never appears twice (the seal IS the edit control now).
  await coin.click();
  await expect(page.locator('.content[data-mode="edit"]')).toHaveCount(0);
  await expect(coin).not.toHaveAttribute("data-editing");
  await expect(coin.locator("svg.lucide-wrench")).toHaveCount(1);
});

test("reachable at every depth: the fixed seal coin stays on-screen deep-scrolled and exits edit", async ({
  page,
}) => {
  mobileOnly();
  await loadCockpit(page);
  const coin = seal(page);

  // Enter edit at the top, then scroll deep — the fixed coin is still on-screen.
  await coin.click();
  await page.getByRole("button", { name: /^edit$/i }).click();
  await expect(page.locator('.content[data-mode="edit"]')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 1400));
  await expect(coin).toBeInViewport();
  await expect(coin).toHaveAttribute("data-editing", "");

  // The lit coin exits edit from down here — no scroll-back, no floating Done.
  await coin.click();
  await expect(page.locator('.content[data-mode="edit"]')).toHaveCount(0);
});

test("undo acts on a real out-of-combat act — a spell cast — through the bloomed chain's ⟲ coin", async ({
  page,
}) => {
  mobileOnly();
  await loadCockpit(page, "dark", "?tab=spells");
  await page
    .getByText(/Healing Word/i)
    .first()
    .waitFor({ timeout: 20000 });

  // No history yet → blooming the chain shows no Undo coin.
  await seal(page).click();
  await expect(chain(page).getByRole("button", { name: /^Undo: /i })).toHaveCount(0);
  await seal(page).click(); // collapse

  await castHealingWord(page);

  // Bloom the chain — the ⟲ coin now names the concrete act; acting on it
  // reverses the cast (the same seam as ⌘Z) and Redo becomes the enabled side.
  await seal(page).click();
  const undoCoin = chain(page).getByRole("button", { name: /^Undo: /i });
  await expect(undoCoin).toBeVisible();
  await undoCoin.click();
  await expect(page.getByText(/Undone/i).first()).toBeVisible();
});

test("no collision: the seal coin clears the bottom nav, and a live toast never overlaps it", async ({
  page,
}) => {
  mobileOnly();
  await loadCockpit(page, "dark", "?tab=spells");
  await page
    .getByText(/Healing Word/i)
    .first()
    .waitFor({ timeout: 20000 });

  // The coin sits ABOVE the bottom nav (no overlap).
  const coinRect = await rectOf(page, ".signet-fab");
  const navRect = await rectOf(page, ".m-nav");
  expect(coinRect, "the seal coin renders").not.toBeNull();
  expect(navRect, "the mobile bottom nav renders").not.toBeNull();
  if (coinRect && navRect) {
    expect(coinRect.y + coinRect.h).toBeLessThanOrEqual(navRect.y);
  }

  // A commit surfaces the undo toast — it must not overlap the coin (the coin's
  // bottom offset clears the centred toast band, sitting above it).
  await castHealingWord(page);
  const toast = await rectOf(page, ".toast-region .toast");
  const coinAfter = await rectOf(page, ".signet-fab");
  expect(toast, "the undo confirmation toast is on-screen").not.toBeNull();
  if (toast && coinAfter) {
    const overlap =
      coinAfter.x < toast.x + toast.w &&
      toast.x < coinAfter.x + coinAfter.w &&
      coinAfter.y < toast.y + toast.h &&
      toast.y < coinAfter.y + coinAfter.h;
    expect(overlap, "the seal coin and the toast do not overlap").toBe(false);
  }
});

for (const theme of ["dark", "light"] as Theme[]) {
  test(`axe: the play tab is clean with the Signet chain bloomed [${theme}]`, async ({
    page,
  }) => {
    mobileOnly();
    await loadCockpit(page, theme, "?tab=spells");
    await page
      .getByText(/Healing Word/i)
      .first()
      .waitFor({ timeout: 20000 });

    // Populate history + bloom the full chain (⟲ ⟳ · ⋯ · ✎) so axe sees it all.
    await castHealingWord(page);
    await seal(page).click();
    await expect(chain(page).getByRole("button", { name: /^Undo: /i })).toBeVisible();

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
