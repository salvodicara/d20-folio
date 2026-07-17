/**
 * E2E: Edit Mode
 *
 * The play/edit mode toggle and field editing, across BOTH management homes of
 * the fob family: on desktop (fine pointer ≥768px — the chromium project) the
 * toggle is the Binder's Fob's ✎ coin, standing at rest; on phones (the mobile
 * project, coarse pointer) it is the Signet's ✎ coin, which lives in the chain
 * the seal coin blooms. Either home lights the SAME control amber in place while
 * editing (aria "Done editing", pressed) — one `sheetMode` signal, one fixed,
 * always-reachable exit, no separate floating Done.
 */

import { test, expect, type Page } from "@playwright/test";
import { teamFixtureName } from "./team-fixture";

// The fixture-bound wrap tests assert the PACK fixture's rendered name — the
// long two-word display name whose fold shape the No-Truncation Rule pins. The
// literal never ships publicly: it is derived from the pack fixture at runtime.
const HERO_NAME = teamFixtureName("catalion-bard");
const HERO = HERO_NAME ?? "";

/** The pressed edit toggle's accessible name is "Done editing" on both homes. */
const ACTIVE_TOGGLE = /^done editing$/i;

const isMobile = (): boolean => test.info().project.name === "mobile";

/** Reveal the "Edit" affordance for the current home. On mobile the Signet's
 *  seal coin blooms the chain (where ✎ lives); on desktop the fob's ✎ stands. */
async function revealEditControl(page: Page): Promise<void> {
  if (isMobile()) {
    await page.getByRole("button", { name: /^sheet tools$/i }).click();
  }
}

/** Enter edit mode through the current home's ✎ control. */
async function enterEditMode(page: Page): Promise<void> {
  await revealEditControl(page);
  await page
    .getByRole("button", { name: /^edit$/i })
    .first()
    .click();
}

test.describe("Edit Mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/characters/mock-1");
    await expect(page.getByText("Lyra Voss").first()).toBeVisible();
  });

  test("starts in play mode by default", async ({ page }) => {
    // At rest the home shows its resting affordance, never the active state:
    // desktop the fob's "Edit" coin, mobile the Signet's "Sheet tools" seal coin.
    const resting = isMobile()
      ? page.getByRole("button", { name: /^sheet tools$/i })
      : page.getByRole("button", { name: /^edit$/i }).first();
    await expect(resting).toBeVisible();
    await expect(page.getByRole("button", { name: ACTIVE_TOGGLE })).toHaveCount(0);
  });

  test("can toggle to edit mode", async ({ page }) => {
    await enterEditMode(page);

    // The ✎ control flips IN PLACE to its active pressed state (the lit fob coin
    // on desktop / the lit Signet coin on mobile) — no separate Done control
    // mounts at the top of the page.
    await expect(
      page.getByRole("button", { name: ACTIVE_TOGGLE, pressed: true })
    ).toBeVisible();
  });

  test("can toggle back to play mode via the same control", async ({ page }) => {
    await enterEditMode(page);
    const active = page.getByRole("button", { name: ACTIVE_TOGGLE });
    await expect(active).toBeVisible();

    // The same lit control toggles back to play (one-tap exit).
    await active.first().click();

    // Back in play mode — the resting affordance returns.
    const resting = isMobile()
      ? page.getByRole("button", { name: /^sheet tools$/i })
      : page.getByRole("button", { name: /^edit$/i }).first();
    await expect(resting).toBeVisible();
  });

  test("edit mode shows additional controls on equipment page", async ({ page }) => {
    // Navigate to equipment
    await page.goto("/characters/mock-1?tab=inventory");
    await expect(page.getByText(/Rapier/i).first()).toBeVisible();

    // Enter edit mode
    await enterEditMode(page);

    // Should show add/delete buttons
    await expect(page.getByRole("button", { name: /add|new/i }).first()).toBeVisible();
  });

  test("edit mode shows additional controls on spells page", async ({ page }) => {
    // Navigate to spells
    await page.goto("/characters/mock-1?tab=spells");
    await expect(page.getByText(/Vicious Mockery/i).first()).toBeVisible();

    // Enter edit mode
    await enterEditMode(page);

    // Should show add spell button
    await expect(page.getByRole("button", { name: /add|new/i }).first()).toBeVisible();
  });

  test("gates vitals + name behind edit mode; play interactions stay live", async ({
    page,
  }) => {
    // PLAY mode (default): the name + AC vital render as clean text, NOT editors.
    // `exact` — Playwright's name match is substring by default, and "AC" is a
    // substring of "Character", "Backstory", … so the vital must be matched exactly.
    await expect(page.getByRole("button", { name: "AC", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /character name/i })).toHaveCount(0);

    // A PLAY interaction works without ever entering edit mode: applying damage
    // (via the header HP popover) surfaces the undo toast — HP controls are NOT
    // gated. (HP relocated into the header in the Phase-6 IA revision.)
    await page.getByRole("button", { name: /hit points: open/i }).click();
    const dialog = page.getByRole("dialog", { name: /hit points/i });
    await dialog.getByRole("spinbutton", { name: /amount/i }).fill("3");
    await dialog.getByRole("button", { name: /^damage$/i }).click();
    await expect(page.getByRole("button", { name: /^undo$/i })).toBeVisible();

    // Enter EDIT mode → the name + every vital become editable.
    await enterEditMode(page);
    const acButton = page.getByRole("button", { name: "AC", exact: true });
    await expect(acButton).toBeVisible();

    // Edit the AC override and confirm the displayed value updates.
    await acButton.click();
    const acInput = page.getByLabel("AC", { exact: true });
    await acInput.fill("19");
    await acInput.press("Enter");
    await expect(page.getByRole("button", { name: "AC", exact: true })).toContainText(
      "19"
    );

    // Edit the NAME (the one-and-only name editor lives in the header).
    const nameButton = page.getByRole("button", { name: /character name/i });
    await nameButton.click();
    const nameInput = page.getByLabel(/character name/i);
    await nameInput.fill("Lyra the Bold");
    await nameInput.press("Enter");
    await expect(page.getByRole("button", { name: /character name/i })).toContainText(
      "Lyra the Bold"
    );

    // DONE → back to clean display text (no inline editors), edits preserved.
    // The same active toggle exits to play (fob coin / masthead pill).
    await page.getByRole("button", { name: ACTIVE_TOGGLE }).first().click();
    await expect(page.getByRole("button", { name: "AC", exact: true })).toHaveCount(0);
    await expect(page.getByText("Lyra the Bold").first()).toBeVisible();
  });

  test("edit signifier is the in-place lit coin + `.content` frame (no sticky banner); the fixed coin is the always-reachable exit at any depth; Esc exits", async ({
    page,
  }) => {
    const content = page.locator(".content");

    // PLAY (default): no edit frame; the sticky "Editing" banner is GONE entirely.
    await expect(content).not.toHaveAttribute("data-mode", "edit");
    await expect(page.getByRole("status").filter({ hasText: /editing/i })).toHaveCount(0);

    // Enter EDIT → the ✎ coin flips to its amber active state IN PLACE and the
    // content frame lights. NO layout-shifting banner mounts.
    await enterEditMode(page);
    await expect(content).toHaveAttribute("data-mode", "edit");
    const litCoin = page.getByRole("button", { name: ACTIVE_TOGGLE, pressed: true });
    await expect(litCoin).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /editing/i })).toHaveCount(0);

    // The fob family is FIXED, so it is the always-reachable exit at any depth —
    // no separate floating Done. Scroll deep and confirm the lit coin is still on
    // screen and exits from down here (no scroll-back needed).
    await page.mouse.wheel(0, 800);
    await expect(litCoin).toBeInViewport();
    await litCoin.click();
    await expect(content).not.toHaveAttribute("data-mode", "edit");
    await page.mouse.wheel(0, -800);

    // Re-enter and confirm Esc still exits from anywhere (the tooltip's hint).
    await enterEditMode(page);
    await expect(content).toHaveAttribute("data-mode", "edit");
    await page.keyboard.press("Escape");
    await expect(content).not.toHaveAttribute("data-mode", "edit");
  });
});

/**
 * Edit-mode name layout — the No-Truncation Rule's edit-mode half (owner
 * regression, 2026-06-12): the cockpit name in EDIT mode must lay out exactly
 * like read mode — ONE line whenever the header has room (at any width), a
 * space-wrap only when genuinely necessary, never a mid-name ellipsis and never
 * horizontal clipping. Before the fix, the InlineEditable at-rest button's
 * horizontal padding made Chromium under-measure its intrinsic width by a
 * sub-pixel, so the content-sized identity block boxed the name ~0.7px too
 * narrow and the fixture's long two-word name folded onto two text-balanced lines despite
 * a half-empty desktop header. These are REAL layout measurements (bounding box
 * vs line-height), not class assertions — they fail on any future re-fold.
 *
 * Seeded IT: the sub-pixel under-measure is locale-sensitive (measured: the EN
 * page sized the identity block to the exact 336.06px one-line width while the
 * IT page got 335.39px and folded) — IT is the owner's locale and the only one
 * that reproduced the regression, so the pin runs in IT.
 */
test.describe("Edit-mode name layout (no premature wrap)", () => {
  /** Rendered line count of the name button: box height ÷ line height. The
   *  display webfont MUST be settled first — fallback-font metrics are narrower
   *  and can mask the fold this guard exists to catch. */
  async function nameLines(page: import("@playwright/test").Page): Promise<number> {
    const btn = page.getByRole("button", { name: /nome personaggio/i });
    await expect(btn).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    return btn.evaluate((el) => {
      const lh = parseFloat(getComputedStyle(el).lineHeight);
      return Math.round(el.getBoundingClientRect().height / lh);
    });
  }

  async function h1Overflow(page: import("@playwright/test").Page): Promise<number> {
    return page
      .getByRole("heading", { level: 1 })
      .evaluate((el) => el.scrollWidth - el.clientWidth);
  }

  test.beforeEach(async ({ page }) => {
    // Seed edit mode + IT directly (persisted uiStore + i18next) — the suite's
    // standard seam (see tests/e2e/surfaces.ts).
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "d20-folio-ui",
        JSON.stringify({ state: { theme: "dark", sheetMode: "edit" }, version: 0 })
      );
      window.localStorage.setItem("i18nextLng", "it");
    });
  });

  test("the owner's name renders ONE line at desktop width in edit mode", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    test.skip(!HERO_NAME, "pack fixtures absent (SRD-only tree)");
    await page.goto("/characters/team-catalion-bard");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(HERO, {
      timeout: 20_000,
    });
    expect(await nameLines(page)).toBe(1);
    expect(await h1Overflow(page)).toBeLessThanOrEqual(0);
  });

  test("390px: edit mode matches read mode — same wrap, no premature fold or clipping", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // EDIT mode (seeded by beforeEach) — measure the name's line count.
    test.skip(!HERO_NAME, "pack fixtures absent (SRD-only tree)");
    await page.goto("/characters/team-catalion-bard");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(HERO, {
      timeout: 20_000,
    });
    const editLines = await nameLines(page);
    expect(await h1Overflow(page)).toBeLessThanOrEqual(0);

    // READ mode — flip the seeded sheetMode to play and reload, then measure the
    // SAME name's line count. (The display name is plain text in read mode, so
    // it's measured via the h1 box, not the InlineEditable button.)
    await page.evaluate(() => {
      window.localStorage.setItem(
        "d20-folio-ui",
        JSON.stringify({ state: { theme: "dark", sheetMode: "play" }, version: 0 })
      );
    });
    await page.reload();
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toContainText(HERO, { timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);
    const readLines = await h1.evaluate((el) => {
      const lh = parseFloat(getComputedStyle(el).lineHeight);
      return Math.round(el.getBoundingClientRect().height / lh);
    });
    expect(await h1Overflow(page)).toBeLessThanOrEqual(0);

    // The No-Truncation Rule's edit-mode half (DESIGN.md §3): edit mode must lay
    // out IDENTICALLY to read mode — never fold EARLIER (the sub-pixel
    // under-measure bug folded the two-word name onto two lines in edit while read kept
    // it on one line). At 390px the 28px display name (`--text-xl`) wraps to two
    // balanced lines in BOTH modes — that's the No-Truncation "wrap at spaces"
    // behaviour, not a clip. The guard is PARITY: edit lines === read lines.
    expect(editLines).toBe(readLines);
  });

  test("md band (800px): the actions cluster never starves the identity — one-line name in read mode", async ({
    page,
  }) => {
    // The 721–1023 band regression: flexbox shrank BOTH header children in
    // proportion to their unwrapped max-content basis, and the actions cluster's
    // one-line basis (~940px) dwarfed the identity's — so the name was squeezed
    // to ~110px and folded the two-word name beside a half-empty header
    // while the cluster wrapped internally anyway. The identity is `md:shrink-0`
    // now; this pins the one-line read-mode layout at the band's midpoint.
    await page.setViewportSize({ width: 800, height: 900 });
    // Registered AFTER the beforeEach seed, so it runs later on navigation and
    // flips the seeded sheetMode to play (read mode) for this one test.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "d20-folio-ui",
        JSON.stringify({ state: { theme: "dark", sheetMode: "play" }, version: 0 })
      );
    });
    test.skip(!HERO_NAME, "pack fixtures absent (SRD-only tree)");
    await page.goto("/characters/team-catalion-bard");
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toContainText(HERO, { timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);
    const lines = await h1.evaluate((el) => {
      const lh = parseFloat(getComputedStyle(el).lineHeight);
      return Math.round(el.getBoundingClientRect().height / lh);
    });
    expect(lines).toBe(1);
    expect(await h1Overflow(page)).toBeLessThanOrEqual(0);
  });

  test("390px: a genuinely long name WRAPS at spaces (never clips) in edit mode", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/characters/mock-1");
    // Rename in place to a 38-char name that cannot fit one line at 390.
    const btn = page.getByRole("button", { name: /nome personaggio/i });
    await expect(btn).toBeVisible({ timeout: 20_000 });
    await btn.click();
    const input = page.getByLabel(/nome personaggio/i);
    await input.fill("Massimiliano Beneventano di Boscolungo");
    await input.press("Enter");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Massimiliano Beneventano di Boscolungo"
    );
    // The fixup's 390 behavior stays: multi-line wrap, zero horizontal overflow.
    expect(await nameLines(page)).toBeGreaterThanOrEqual(2);
    expect(await h1Overflow(page)).toBeLessThanOrEqual(0);
  });
});
