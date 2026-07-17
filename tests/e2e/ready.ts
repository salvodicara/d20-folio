/**
 * Shared deterministic-readiness helpers for the e2e suite.
 *
 * The [mobile] specs flake ONLY under heavy parallel CPU load (several agents +
 * push gates on one machine): a fixed `waitForTimeout` that is comfortably long
 * on an idle laptop becomes too short on a saturated one, so a `page.evaluate`
 * runs before React has mounted / focused the node it reads (→ a `null`
 * dereference) or before the browser has finished its font-swap + reflow (→ a
 * transient layout measurement). The cure is never a longer timeout or a retry —
 * it is a DETERMINISTIC readiness signal the test waits on. These helpers are the
 * one place those signals live, so every spec waits the same proven way and a
 * fix propagates everywhere.
 */
import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Resolve once the page's layout is fully settled after a navigation or a
 * `setViewportSize` — i.e. the measurement that follows is the FINAL layout.
 *
 * Two transient-overflow sources were root-caused on the [mobile] flake:
 *
 *  1. **Web-font swap race** — the UI's serif faces (`--font-body` Alegreya,
 *     `--font-title` Cinzel) render in a wider fallback serif until
 *     `document.fonts.ready` resolves, briefly pushing text wider than the
 *     layout accounts for.
 *  2. **Layout-recalc lag** — after `setViewportSize` the reflow is enqueued;
 *     under CPU load it can outlast any fixed timeout. A double
 *     `requestAnimationFrame` guarantees a full style-recalc → layout → paint
 *     cycle has committed (browsers batch layout and paint into separate
 *     frames — one rAF catches layout, the second catches paint).
 *
 * Combining both makes the measured layout deterministic.
 */
export async function waitForStableLayout(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        void document.fonts.ready.then(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
          });
        });
      })
  );
}

/**
 * Resolve once `document.documentElement.scrollWidth` has stopped changing —
 * i.e. every reflow in the cascade triggered by a font swap, a viewport resize,
 * AND any late async layout shift (e.g. the creation wizard's SRD hydration
 * committing a wider/narrower step rail a frame or two after paint) has settled.
 *
 * `waitForStableLayout` proves fonts + ONE layout/paint pair are done, but a
 * React state update landing after that pair can reflow again; polling for a
 * QUIESCENT width across consecutive animation frames is the deterministic
 * signal that no further reflow is pending, so the single strict overflow
 * measurement that follows is the final layout. Bounded to avoid hanging on a
 * genuinely oscillating layout (which would be a real product bug, surfaced by
 * the assertion that follows rather than masked here).
 */
export async function waitForQuiescentWidth(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let last = -1;
        let stable = 0;
        let frames = 0;
        const tick = (): void => {
          const w = document.documentElement.scrollWidth;
          if (w === last) {
            // Two consecutive equal frames ⇒ the reflow cascade has quiesced.
            if (++stable >= 2) {
              resolve();
              return;
            }
          } else {
            stable = 0;
            last = w;
          }
          // Safety bound (~60 frames ≈ 1 s) so an oscillating layout can't hang
          // the test — it falls through to the strict assertion, which reports it.
          if (++frames > 60) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      })
  );
}

/**
 * Seed the dev-bypass chronicle with EXACT text and open its hub, deterministically
 * and with ZERO UI round-trips.
 *
 * Why this exists (the #84 flake): the chronicle specs used to put their chapter
 * structure in place by DRIVING the editor — open it, `fill` 30+ lines, click Save,
 * then acknowledge the D27 "you're wiping a lot of the story" confirm. That is a
 * five-step dance on the heaviest page in the app, served by a CPU-contended vite
 * dev server; under the full-matrix load (many parallel browsers oversubscribing
 * the cores) the accumulated round-trips overran the test's wall-clock budget and
 * the spec flaked — NOT because the chronicle UI ever raced or jumped (its
 * assertions always held), but purely because the SETUP did too much slow work.
 *
 * The cure is to do LESS, deterministically — never a bigger timeout. The
 * dev-bypass fixture reads `DEV_CHRONICLE_OVERRIDE_KEY` from localStorage
 * (tree-shaken from production), so a spec can pre-seed its precise text via
 * `addInitScript` BEFORE the app boots — exactly how it already seeds the theme +
 * locale. The hub then renders straight to the seeded reader; we wait on the
 * Chapter selector, the deterministic "reader is mounted with this multi-chapter
 * text" signal (Playwright polls it on its own clock), and the editor is never
 * opened or saved during setup.
 */
export async function seedChronicle(
  page: Page,
  text: string,
  opts: { motion: "auto" | "reduced"; width: number }
): Promise<void> {
  // localStorage key the dev-bypass chronicle fixture reads — kept in lock-step
  // with `DEV_CHRONICLE_OVERRIDE_KEY` in src/features/campaigns/dev-fixture.ts
  // (an e2e file can't import app src cleanly; a guard test pins the two equal).
  const DEV_CHRONICLE_OVERRIDE_KEY = "d20-folio-dev-chronicle";
  await page.addInitScript(
    ([key, body, motion]) => {
      localStorage.setItem(
        "d20-folio-ui",
        JSON.stringify({ state: { theme: "dark", motion }, version: 0 })
      );
      localStorage.setItem("i18nextLng", "en");
      localStorage.setItem(key, body);
    },
    [DEV_CHRONICLE_OVERRIDE_KEY, text, opts.motion] as const
  );
  await page.setViewportSize({ width: opts.width, height: 850 });
  await page.goto("/campaigns/DEVCAMPAIGN24");
  // The FIXED reading body renders the latest chapter's prose as soon as the reader
  // mounts with the seeded text — the deterministic "hub + seeded chronicle are
  // ready" signal (always visible; the chapter navigator now lives in the section's
  // collapsible detail). No UI save round-trip, so the slow editor→fill→save→confirm
  // chain that overran the budget is gone.
  await page
    .locator('section[aria-labelledby="chronicle-head"] .chronicle-prose')
    .first()
    .waitFor();
}

/**
 * Reveal the chronicle's chapter navigator — it now lives in the section's collapsible
 * DETAIL (the FIXED panel shows only the latest chapter), so a spec that pages to a
 * specific chapter must open the detail first. Idempotent: a no-op if already open.
 * Robust to a dropped toggle click (the same `toPass` recovery the editor open uses).
 */
export async function openChronicleNav(page: Page): Promise<void> {
  const select = page.getByLabel("Chapter", { exact: true });
  if (await select.isVisible()) return;
  const toggle = page
    .locator('section[aria-labelledby="chronicle-head"]')
    .getByRole("button", { name: /^chronicle$/i });
  await expect(async () => {
    await toggle.click();
    await expect(select).toBeVisible({ timeout: 1500 });
  }).toPass();
}

/**
 * Click the chronicle's "Edit" button and resolve once the editor is
 * actually open + caret-seeded — re-clicking if (and ONLY if) the click was dropped.
 *
 * The PROVEN race (#84): clicking "Edit" IMMEDIATELY after a
 * `selectOption` on the Chapter navigator occasionally has its React `onClick`
 * SWALLOWED under heavy CPU contention — the chapter change re-renders the whole
 * Chronicle content subtree (reader + the Edit-button footer) and its
 * AutoAnimateHeight ResizeObserver mutates the DOM in the same window, and a
 * click landing mid-cascade reaches the button (it even takes browser focus) but
 * its handler never runs, so `setEditing(true)` never fires. Root-caused by binary
 * diagnostics: WITHOUT a preceding `selectOption` the click NEVER drops (80/80
 * under load); WITH one it drops ~2 % of the time, and a SECOND click always
 * recovers — i.e. the click is dropped, not slow (the editor opens in 66–141 ms
 * when the handler does run). This is a machine-click-speed artifact (Playwright
 * clicks within ~10 ms of the select; a human's >100 ms gap never hits the window).
 *
 * The cure is Playwright's web-first `expect(...).toPass()` retry: click, then
 * assert the EFFECT (the textarea visible); if the effect didn't land, the block
 * re-runs (re-clicks) — exactly what a user does when a click does nothing. It is
 * NOT a `retries` bump (that re-runs the WHOLE test, masking real breaks) nor a
 * timeout widen: the assertion stays strict and a genuine "editor never opens"
 * regression still FAILS (the bounded poll exhausts without the textarea ever
 * appearing). `toPass` uses bounded backoff, so the recovery is cheap.
 *
 * Why textarea-VISIBLE is enough to then read `selectionStart`: the editor seeds the
 * caret (`focus()` + `setSelectionRange()`) in a `useLayoutEffect`, which React runs
 * SYNCHRONOUSLY after committing the textarea and BEFORE the browser paints. So once
 * Playwright observes the textarea VISIBLE (visibility requires a committed layout +
 * paint), the caret is already in place — callers can `page.evaluate` it directly.
 * Visibility is also driver-side (the DOM-snapshot protocol), so it resolves even
 * while the page main thread is briefly starved — unlike an in-page focus poll.
 *
 * @returns the focused chronicle textarea Locator.
 */
export async function openChronicleEditor(page: Page): Promise<Locator> {
  const editBtn = page
    .locator('section[aria-labelledby="chronicle-head"]')
    .getByRole("button", { name: /^edit$/i });
  const ta = page.locator("#chronicle-text");
  await expect(async () => {
    await editBtn.click();
    // Short per-attempt visibility budget: if THIS click opened the editor it is
    // visible within a beat; if it was dropped, the attempt fails fast and toPass
    // clicks again. (A genuinely never-opening editor exhausts toPass → real fail.)
    await expect(ta).toBeVisible({ timeout: 2000 });
  }).toPass();
  return ta;
}

/**
 * Guarantee the ⌘K "Ask the Folio" palette's SEARCH FIELD holds focus after the
 * palette is open — pointer-appropriately, on BOTH the `chromium` and `mobile`
 * projects.
 *
 * The palette auto-focuses its search input on open ONLY on a FINE pointer. On a
 * COARSE (touch) pointer it deliberately does NOT: auto-focusing there pops the soft
 * keyboard, which shrinks the visual viewport and visibly resizes the page under the
 * palette (the `onOpenAutoFocus` coarse-pointer guard in `CommandPalette.tsx`; see
 * `palette-touch-autofocus.spec.ts`). So on touch we mirror the exact gesture a real
 * user makes to start typing — TAP the field — before any keystroke or focus
 * assertion. On a fine pointer the field is already focused, so the tap is skipped
 * and this only confirms the auto-focus landed. Either way the input holds focus on
 * return, so every downstream `keyboard.type` / ↑↓ / ↵ / focus assertion is
 * deterministic regardless of the project's pointer type.
 *
 * Call it AFTER the combobox is visible and BEFORE the first keystroke/assertion.
 */
export async function ensurePaletteSearchFocused(page: Page): Promise<void> {
  const input = page.locator("#palette-search-input");
  await expect(input).toBeVisible();
  const coarse = await page.evaluate(
    () => window.matchMedia("(pointer: coarse)").matches
  );
  // Touch: no auto-focus by design → tap to focus, as the user would. Fine pointer:
  // already auto-focused → skip the tap (Desktop Chrome has no touch to tap with).
  if (coarse) await input.tap();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe("palette-search-input");
}
