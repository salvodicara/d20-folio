/**
 * turn-indicator-flicker — PERMANENT proof, in REAL Chromium, of the owner-reported bug:
 * "when it's my turn and I End Turn, the topbar pip FLASHES 'Your turn' before it changes to
 * '<next>'s turn'." A single-frame flash is a render-timing artifact jsdom CANNOT show, so this
 * drives the producer's turn-flicker replay harness (`d20-dev-turn-flicker`), which publishes
 * the exact sequence of reconcile inputs a real End Turn produces, and records the pip's state
 * word with a MutationObserver on the document — one callback per DOM COMMIT, so every
 * intermediate value is captured regardless of paint coalescing. (A per-animation-frame poll
 * samples at paint cadence (~16ms); under CPU load the browser can coalesce several step
 * commits into one paint, so a transient commit that lives <16ms is never sampled — that was
 * the ~25% flake this recorder replaced.)
 *
 *   • `raw`   — the OLD two-source publish (`set(rawStatus, rawPip)` directly). REPRODUCES the
 *               flash: the pip word returns to "Your turn" AFTER it first read "Goblin's turn".
 *               This asserts the harness genuinely reproduces the bug, so the `fixed` absence
 *               below is meaningful and not vacuous.
 *   • `fixed` — the SAME steps through `reconcileCombatPublish` (the ship path). The word NEVER
 *               returns to "Your turn" once it has advanced. Reverting the reconcile flips this
 *               red.
 */

import { test, expect, type Page } from "@playwright/test";
import { seedUI, seedLang } from "./surfaces";

/** Install a MutationObserver recorder of the pip's state word (deduped on change), and
 *  seed the replay mode, BEFORE the app boots. */
async function bootReplay(page: Page, mode: "raw" | "fixed"): Promise<void> {
  await seedUI(page, "dark", "play");
  await seedLang(page, "en");
  await page.addInitScript((m) => {
    window.localStorage.setItem("d20-dev-turn-flicker", m);
    const frames: string[] = [];
    (window as unknown as { __cpFrames: string[] }).__cpFrames = frames;
    // Record the pip's state word on every DOM COMMIT, not every paint. Each scripted
    // reconcile step runs in its OWN setTimeout macrotask, so React commits each to the DOM
    // in its own task; the HTML event loop runs a microtask checkpoint after EVERY task, and
    // that checkpoint is exactly when MutationObserver callbacks are delivered. So the
    // observer fires BETWEEN step tasks — once per commit — and the `.cp-state` text it reads
    // is the value that step committed (step 3's transient stale "your turn" included), before
    // the next step's task can overwrite it. That holds even when overdue timers fire
    // back-to-back under load: separate macrotasks each still get their own microtask
    // checkpoint, hence their own callback. Reading the CURRENT DOM per callback is therefore
    // enough — no need to walk MutationRecords — and it is deterministic where the old
    // requestAnimationFrame poll (paint cadence, ~16ms) was not: under load the browser
    // coalesces several step commits into one paint, and a transient commit that lives <16ms
    // is never sampled. No rAF anywhere.
    const sample = () => {
      const el = document.querySelector(".combat-pip .cp-state");
      const text = el && el.textContent ? el.textContent.trim() : "";
      if (text && frames[frames.length - 1] !== text) frames.push(text);
    };
    // One-time initial read (mirrors the old loop's first tick), before any mutation fires,
    // so the very first "your turn" render is captured even if it lands before the first
    // observer callback.
    sample();
    // Observe `document`, NOT `document.documentElement`/`.body`: this init script runs at
    // `readyState === "loading"`, before the `<html>` element exists (documentElement is null
    // then, and `.observe(null)` throws). `document` is the always-present root, and a
    // subtree observer on it covers the entire tree once it's built. An active MutationObserver
    // is kept alive by the node's registered-observer list, so it survives past this init
    // function without a retained reference.
    new MutationObserver(sample).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }, mode);
  await page.goto("/characters/mock-1");
  // The pip's first frame — the replay's step 1 ("Your turn").
  await page.locator(".combat-pip .cp-state").waitFor({ timeout: 20_000 });
}

/** Read the recorded ordered sequence of distinct pip state words once the replay has run. */
async function stateWords(page: Page): Promise<string[]> {
  // 5 steps × 120 ms ≈ 600 ms of replay; wait comfortably past the last.
  await page.waitForTimeout(1400);
  return page.evaluate(() => (window as unknown as { __cpFrames: string[] }).__cpFrames);
}

const isYourTurn = (w: string) => /^your turn$/i.test(w);
const isActorTurn = (w: string) => /turn$/i.test(w) && !isYourTurn(w); // "Goblin's turn"

// The pip's state word (`.cp-state`, inside `.cp-body`) is hidden by folio.css's
// `@media (max-width: 640px)` collapse (the phone pip is a colour-only ⚔{n}› glyph — no
// words). The owner-reported flash is a VISIBLE-TEXT flash of that word, i.e. a wide-topbar
// (desktop) phenomenon: on the narrow pip there is no text to flash, so bootReplay's
// `.cp-state` waitFor would time out with nothing to observe. The underlying fix is the
// device-agnostic `reconcileCombatPublish` seam, already covered by
// tests/unit/combat-reconcile.test.ts — so this text-based spec runs only where the word is
// visible. `mobile` (Pixel 7, 390px) is the sole matrix project below the 640px threshold
// that also runs this spec (the two `portrait-sw*` projects match only the portrait-export
// spec).
const HIDDEN_PROJECTS = new Set(["mobile"]);

test.describe("topbar turn indicator — no stale 'your turn' flash on End Turn", () => {
  // Skip on the narrow projects that hide the pip state word (same mobile-scoping intent as
  // settings/combat/abilities.spec.ts). `test.info()` reads the running project so the hook
  // takes no fixtures — avoiding an unused `page` arg.
  test.beforeEach(() => {
    test.skip(
      HIDDEN_PROJECTS.has(test.info().project.name),
      "pip state word is hidden on narrow viewports; the flash is a desktop text phenomenon — reconcile fix is device-agnostic, covered by combat-reconcile.test.ts"
    );
  });

  test("raw (old two-source publish) REPRODUCES the flash — proof the bug is real", async ({
    page,
  }) => {
    await bootReplay(page, "raw");
    const words = await stateWords(page);

    // The pip did advance to the next actor at some point…
    const firstActor = words.findIndex(isActorTurn);
    expect(firstActor).toBeGreaterThanOrEqual(0);
    // …and the OLD publish flashed back to "Your turn" AFTER that (the reported bug).
    const flashed = words.slice(firstActor + 1).some(isYourTurn);
    expect(flashed).toBe(true);
  });

  test("fixed (reconciled publish) never flashes 'Your turn' after the turn advances", async ({
    page,
  }) => {
    await bootReplay(page, "fixed");
    const words = await stateWords(page);

    const firstActor = words.findIndex(isActorTurn);
    expect(firstActor).toBeGreaterThanOrEqual(0); // the turn still advances
    // Once it reads the next actor, it NEVER returns to "Your turn" — the flash is gone.
    const flashed = words.slice(firstActor + 1).some(isYourTurn);
    expect(flashed).toBe(false);
  });
});
