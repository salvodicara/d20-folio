/**
 * Shared gate for visual-regression pixel assertions.
 *
 * Playwright visual baselines are PLATFORM-SPECIFIC (macOS vs a Linux runner
 * render fonts/antialiasing differently), and no baselines are committed. To
 * stop a plain `pnpm test:e2e` from failing for lack of a baseline,
 * `toHaveScreenshot` calls only fire when this returns true:
 *
 *   • when the dedicated VISUAL lane runs (`VISUAL=1` — the on-demand pixel
 *     lane, `pnpm test:e2e:all:visual`, diffed against locally generated
 *     baselines); or
 *   • when (RE)GENERATING — `--update-snapshots` (Playwright sets
 *     `testInfo.config.updateSnapshots` to something other than "none").
 *
 * CRUCIALLY this is NOT keyed on bare `process.env.CI`. The deploy-gating e2e
 * run (which sets CI=true) must NOT pixel-diff: visual baselines are platform-
 * specific + churn on every legit UI tweak, so making them a hard deploy gate
 * during active development blocks every deploy on a baseline regen. Instead the
 * gating run drives these specs NAVIGATE-ONLY (a real behavioural smoke — catches
 * crashes / missing anchors), and the pixel diff stays a separate on-demand
 * VISUAL=1 lane. So "E2E green = deploy" is gated on stable behavioural
 * coverage, not on pixel drift.
 *
 * `visual-full.spec.ts` calls this with its `test.info()` so the update-mode
 * branch works.
 */

import { type TestInfo } from "@playwright/test";

export function shouldAssertSnapshots(testInfo: TestInfo): boolean {
  // `testInfo.config.updateSnapshots` is "missing" on a NORMAL run (Playwright's
  // default — create-if-absent, diff-if-present) and "changed"/"all" when the
  // run was invoked with `--update-snapshots`. We only treat the latter two as
  // "regenerating". Pixels are diffed ONLY in the explicit VISUAL lane or when
  // regenerating — never on a plain run (local OR the gating CI e2e job).
  const mode = testInfo.config.updateSnapshots;
  const updating = mode === "all" || mode === "changed";
  return Boolean(process.env.VISUAL || updating);
}
