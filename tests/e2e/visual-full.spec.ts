/**
 * E2E: Comprehensive visual regression — EVERY surface × {desktop,mobile} ×
 * {en,it} (the app is dark only, owner 2026-10-16).
 *
 * This is the sole baseline suite: it asserts a pixel baseline
 * for the COMPLETE user-facing surface inventory — every page, sheet tab + edit
 * variant, create-wizard step, modal/popover/drawer, and HP-driven scenario
 * state — in both default viewports and both locales. It reuses
 * the SAME surface model as the polish harness (`./surfaces.ts`), so the two can
 * never drift: one place declares a surface, both suites cover it.
 *
 * ── Gated via the shared visual-gate ─────────────────────────────────────────
 * Baselines are PLATFORM-SPECIFIC and none are committed. The whole suite runs
 * ONLY when `shouldAssertSnapshots(test.info())` is true — under
 * `--update-snapshots`, or with `VISUAL=1`. Without the flag every test skips:
 * the navigate-only "crash smoke" it used to run duplicated the a11y + i18n
 * sweeps, which drive the same SURFACES manifest (with prepare) across both
 * locales and both viewports (2026-08-05 test audit).
 *
 * ── Variant matrix ───────────────────────────────────────────────────────────
 * The asserted matrix per surface is the CROSS of {desktop,mobile} × {en,it},
 * dark theme — i.e. the four VARIANTS keys.
 * For surfaces with a restricted `variants` allowlist (overlays / wizard steps /
 * the tablet-band HP states — whose trigger only exists at certain breakpoints),
 * we intersect the four with that allowlist so we never try to screenshot a
 * control that isn't present (e.g. the header HP popover only exists in the
 * 721–1180 tablet band, so those surfaces assert on the tablet pair instead).
 *
 * ── Adding coverage ──────────────────────────────────────────────────────────
 * New page / form / wizard step / modal → add a `SurfaceRoute` to
 * surface-manifest.ts (+ its ready/prepare in surfaces.ts). The route-coverage
 * guard (tests/unit/route-coverage.guard.test.ts) fails CI if a router route has
 * no surface, so coverage can't silently rot. See docs/CONTRIBUTING.md.
 *
 * Part of the separate Playwright suite (`pnpm test:e2e`) — NOT the unit gate.
 */

import { test, expect } from "@playwright/test";
import {
  SURFACES,
  VARIANTS,
  freezeMotion,
  seedLang,
  seedUI,
  surfaceCaptureFullPage,
} from "./surfaces";
import { shouldAssertSnapshots } from "./visual-gate";

/** The comprehensive asserted matrix: {desktop,mobile} × {en,it}, dark. */
const FULL_MATRIX = new Set(VARIANTS.map((v) => v.key));

// Pixel lane ONLY (2026-08-05 test audit): without VISUAL=1 this suite used to
// run navigate-only "crash smoke" — but a11y.spec (every surface, with prepare) and i18n-sweep.spec (every surface × both locales × both
// viewports, with prepare) already drive the exact same manifest, so the
// no-flag pass duplicated ~344 navigations per run for no unique signal.
// The skip lives in a
// beforeEach so it fires BEFORE the page fixture is built — an ambient run
// never pays 344 browser-context setups just to skip.
test.beforeEach(() => {
  test.skip(
    !shouldAssertSnapshots(test.info()),
    "pixel-baseline lane — runs under VISUAL=1 / --update-snapshots only"
  );
});

for (const surface of SURFACES) {
  // The variant keys this surface CAN run: its allowlist if it has one
  // (overlays / wizard steps / tablet-band states), else the full cross.
  const allowed = surface.variants ?? [...FULL_MATRIX];
  // Assert on the intersection of {what this surface supports} ∩ {what we want
  // to cover}, PLUS any tablet-band keys the surface explicitly requires (those
  // live outside FULL_MATRIX but are the only place the control exists).
  const keys = new Set<string>();
  for (const k of allowed) {
    if (FULL_MATRIX.has(k) || k.endsWith("-tablet")) keys.add(k);
  }

  for (const variant of VARIANTS.filter((v) => keys.has(v.key))) {
    const name = `${surface.slug} — ${variant.locale} ${variant.theme} @ ${variant.device}`;
    test(name, async ({ page }) => {
      await page.setViewportSize(variant.viewport);
      await seedUI(page, variant.theme, surface.edit ? "edit" : "play");
      await seedLang(page, variant.locale);
      await page.goto(surface.route);
      await surface.ready(page);
      if (surface.prepare) await surface.prepare(page);
      await freezeMotion(page);

      if (shouldAssertSnapshots(test.info())) {
        await expect(page).toHaveScreenshot(
          `${surface.slug}-${variant.locale}-${variant.theme}-${variant.device}.png`,
          {
            fullPage: surfaceCaptureFullPage(surface),
            // Cross-render font/antialias tolerance.
            maxDiffPixelRatio: 0.02,
          }
        );
      }
    });
  }
}
