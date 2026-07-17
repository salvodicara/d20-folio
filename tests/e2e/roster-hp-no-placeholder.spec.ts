/**
 * roster-hp-no-placeholder — PERMANENT proof that a wounded hero's roster (My-Heroes)
 * HP fill FIRST-PAINTS at its real width and never animates down from a full-HP
 * placeholder on load / navigation (owner bug, reported three times).
 *
 * WHY THE PRIOR HARNESSES WERE WORTHLESS: dev-bypass hydrates the roster SYNCHRONOUSLY
 * (`rosterProjectionFromDoc` seeds the mock's real session HP in one render), so the
 * prod TWO-PHASE — parent docs land first at the full-HP placeholder `cacheToRosterDoc`
 * seeds, THEN the `combat/state` subdoc folds the real HP a beat later — never happens
 * in dev, and the slide can't reproduce by poking `--w` by hand.
 *
 * THE FAITHFUL REPRO: the dev-only `d20-dev-hp-hydrate-delay` flag drives the REAL prod
 * sequence in a real browser — the tile first paints the full-HP placeholder, then its
 * real (wounded 38/62) combat state folds in after a delay through the ACTUAL
 * `applyCombatToRosterDoc` + `combatStates[id]` seam (see `useCharacters.ts`). We sample
 * the wounded tile's `.ch-hp .hp-fill` geometry + running animations every animation
 * frame from navigation through the fold.
 *
 * THE ASSERTIONS (all hold WITH the fix; #3/#4/#5 FAIL on the unfixed roster card,
 * where the fill is always painted and slides 100%→61% with a running width transition):
 *   1. the wounded tile's HP track renders;
 *   2. the fill eventually paints at the REAL width (~61%);
 *   3. the fill is NEVER wider than the real width + ε on ANY frame (no full-HP frame);
 *   4. NO running animation is ever observed on the fill (no width slide);
 *   5. the fill's FIRST painted frame is already at the real width (first-paint-correct).
 */

import { test, expect, type Page } from "@playwright/test";

/** One rAF sample of the wounded tile's HP bar. */
type HpFrame = {
  /** ms since the in-page sampler started. */
  t: number;
  /** `.ch-hp .hp-bar` (the track) width, or null before the card paints. */
  barW: number | null;
  /** Is the `.ch-hp .hp-fill` span in the DOM this frame? */
  hasFill: boolean;
  /** fill width / track width (the painted %), or null when the track isn't measurable. */
  ratio: number | null;
  /** Count of RUNNING animations on the fill (a live width transition ⇒ ≥ 1). */
  fillAnims: number;
};

declare global {
  interface Window {
    __hpFrames?: HpFrame[];
    __hpDone?: boolean;
  }
}

/** The mock hero is 38/62 → the roster paints `round(38/62*100) = 61%`. */
const REAL_RATIO = 0.61;
const EPS = 0.05;
/** Sampler runtime PAST THE TRACK'S FIRST PAINT — well past the 600 ms hydrate delay +
 *  the 240 ms width transition. Anchored to the first frame where `.ch-hp .hp-bar` is
 *  measurable, NOT to navigation: on a slow CI runner the app can take longer than any
 *  wall-clock budget to boot, and a navigation-anchored window expired BEFORE the roster
 *  ever painted (frames=68, filled=0 — the deploy-gate false red of 2026-07-03). The
 *  placeholder→real fold starts at the tile's first paint, so first-paint-anchored
 *  sampling observes the entire window the bug can occur in, on any machine. */
const SAMPLE_MS = 1600;
/** Hard cap from navigation — the sampler always terminates (the outer `waitFor` on the
 *  bar would fail such a run anyway; this just guarantees `__hpDone` flips). */
const SAMPLE_CAP_MS = 30_000;

/** Seed theme/locale + the two-phase repro flag, and install the per-frame HP sampler
 *  BEFORE the app boots. Motion is left LIVE (no `freezeMotion`) so a real width
 *  transition — the very thing the bug produces — is observable. */
async function seedReproAndSampler(page: Page): Promise<void> {
  await page.addInitScript(
    ({ sampleMs, capMs }: { sampleMs: number; capMs: number }) => {
      window.localStorage.setItem(
        "d20-folio-ui",
        JSON.stringify({ state: { theme: "dark", sheetMode: "play" }, version: 0 })
      );
      window.localStorage.setItem("i18nextLng", "en");
      window.localStorage.setItem("d20-dev-hp-hydrate-delay", "1");

      const frames: HpFrame[] = [];
      window.__hpFrames = frames;
      window.__hpDone = false;
      const start = performance.now();
      // The sample window opens at the track's FIRST measurable paint (null until then).
      let firstBarAt: number | null = null;
      const tick = (): void => {
        const bar = document.querySelector(".ch-hp .hp-bar");
        const fill = document.querySelector(".ch-hp .hp-fill");
        const barW = bar ? bar.getBoundingClientRect().width : null;
        const fillW = fill ? fill.getBoundingClientRect().width : 0;
        const now = performance.now();
        if (firstBarAt === null && barW !== null && barW > 1) firstBarAt = now;
        frames.push({
          t: now - start,
          barW,
          hasFill: !!fill,
          ratio: barW && barW > 1 ? fillW / barW : null,
          fillAnims: fill ? fill.getAnimations().length : 0,
        });
        const windowDone = firstBarAt !== null && now - firstBarAt >= sampleMs;
        if (!windowDone && now - start < capMs) requestAnimationFrame(tick);
        else window.__hpDone = true;
      };
      requestAnimationFrame(tick);
    },
    { sampleMs: SAMPLE_MS, capMs: SAMPLE_CAP_MS }
  );
}

test.describe("roster HP fill — no full-HP placeholder slide", () => {
  test("a wounded tile's gold fill first-paints at the real width and never animates down", async ({
    page,
  }) => {
    await seedReproAndSampler(page);
    await page.goto("/characters");

    // The wounded tile's HP track must render (the card is up).
    await page.locator(".ch-hp .hp-bar").first().waitFor({ timeout: 20_000 });
    // Let the sampler run through the placeholder → real fold and settle.
    await page.waitForFunction(() => window.__hpDone === true, {
      timeout: SAMPLE_MS + 8_000,
    });

    const frames = await page.evaluate(() => window.__hpFrames ?? []);

    // Frame-by-frame trace (logged so the evidence is in the run output).
    const withFill = frames.filter((f) => f.hasFill && f.ratio !== null);
    const ratios = withFill.map((f) => Number(f.ratio).toFixed(3));
    const maxRatio = withFill.reduce((m, f) => Math.max(m, f.ratio ?? 0), 0);
    const maxAnims = frames.reduce((m, f) => Math.max(m, f.fillAnims), 0);
    const firstFill = withFill[0];
    const lastFill = withFill[withFill.length - 1];
    console.log(
      "[roster-hp] frames=%d  filled=%d  maxRatio=%s  maxFillAnims=%d\n  firstFill=%o\n  lastFill=%o\n  ratios=%s",
      frames.length,
      withFill.length,
      maxRatio.toFixed(3),
      maxAnims,
      firstFill,
      lastFill,
      ratios.join(" ")
    );

    // (1) the track rendered, and (2) the fill eventually painted at the REAL width.
    expect(frames.some((f) => f.barW !== null)).toBe(true);
    expect(withFill.length).toBeGreaterThan(0);
    if (!firstFill || !lastFill) throw new Error("no filled HP frames were sampled");
    expect(lastFill.ratio).toBeGreaterThan(REAL_RATIO - EPS);
    expect(lastFill.ratio).toBeLessThan(REAL_RATIO + EPS);

    // (3) NO frame is ever wider than the real width + ε — the fill never paints a
    //     full-HP bar. On the unfixed card the placeholder paints at 100% ⇒ FAILS.
    expect(maxRatio).toBeLessThanOrEqual(REAL_RATIO + EPS);

    // (4) NO running animation is EVER observed on the fill — the width never slides.
    //     On the unfixed card the 100%→61% width transition runs ⇒ maxFillAnims ≥ 1.
    expect(maxAnims).toBe(0);

    // (5) FIRST-PAINT-CORRECT: the very first painted fill is already the real width.
    //     On the unfixed card the first painted fill is the 100% placeholder ⇒ FAILS.
    expect(firstFill.ratio).toBeGreaterThan(REAL_RATIO - EPS);
    expect(firstFill.ratio).toBeLessThan(REAL_RATIO + EPS);
  });
});
