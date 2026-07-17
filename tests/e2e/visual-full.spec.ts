/**
 * E2E: Comprehensive visual regression — EVERY surface × {dark,light} ×
 * {desktop,mobile} × {en,it}.
 *
 * This is the sole baseline suite: it asserts a pixel baseline
 * for the COMPLETE user-facing surface inventory — every page, sheet tab + edit
 * variant, create-wizard step, modal/popover/drawer, and HP-driven scenario
 * state — in both themes, both default viewports, and both locales. It reuses
 * the SAME surface model as the polish harness (`./surfaces.ts`), so the two can
 * never drift: one place declares a surface, both suites cover it.
 *
 * ── Gated via the shared visual-gate ─────────────────────────────────────────
 * Baselines are PLATFORM-SPECIFIC and none are committed. The
 * `toHaveScreenshot` assertion only fires when
 * `shouldAssertSnapshots(test.info())` is true — under `--update-snapshots`,
 * or with `VISUAL=1`. Otherwise (no flag) the spec
 * still NAVIGATES + drives each surface's ready/prepare interaction (catching
 * crashes / broken routes), it just skips the pixel diff so the absence of a
 * darwin baseline can't fail the run.
 *
 * ── Variant matrix ───────────────────────────────────────────────────────────
 * Per the task brief, the asserted matrix per surface is the CROSS of
 * {dark,light} × {desktop,mobile} × {en,it} — i.e. these eight variant keys:
 *   en/it × dark/light × desktop/mobile.
 * For surfaces with a restricted `variants` allowlist (overlays / wizard steps /
 * the tablet-band HP states — whose trigger only exists at certain breakpoints),
 * we intersect the eight with that allowlist so we never try to screenshot a
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
import { SURFACES, VARIANTS, freezeMotion, seedLang, seedUI } from "./surfaces";
import { shouldAssertSnapshots } from "./visual-gate";

/**
 * The comprehensive asserted matrix: {dark,light} × {desktop,mobile} × {en,it}.
 * These are the eight default-set variant keys (the tablet pair is reserved for
 * the interactive-HP surfaces and is added back per-surface via the allowlist
 * intersection below).
 */
const FULL_MATRIX = new Set([
  "en-dark-desktop",
  "en-light-desktop",
  "en-dark-mobile",
  // light-mobile + dark-desktop complete the EN cross …
  "en-light-mobile",
  "en-dark-desktop",
  // … and the IT cross.
  "it-dark-desktop",
  "it-light-desktop",
  "it-dark-mobile",
  "it-light-mobile",
]);

/**
 * `surfaces.ts` ships five default full-page variant keys (it omits
 * en-light-mobile / it-dark-desktop / it-light-mobile to keep the human-review
 * shot count down). The comprehensive baseline wants the full 8-cell cross, so
 * we extend VARIANTS with the missing four desktop/mobile cells here. The tablet
 * pair (en-light-tablet / it-dark-tablet) already exists in VARIANTS.
 */
const DESKTOP_VP = { width: 1440, height: 900 } as const;
const MOBILE_VP = { width: 390, height: 844 } as const;

const EXTRA_VARIANTS: typeof VARIANTS = [
  {
    key: "en-light-mobile",
    locale: "en",
    theme: "light",
    device: "mobile",
    viewport: MOBILE_VP,
  },
  {
    key: "it-dark-desktop",
    locale: "it",
    theme: "dark",
    device: "desktop",
    viewport: DESKTOP_VP,
  },
  {
    key: "it-light-mobile",
    locale: "it",
    theme: "light",
    device: "mobile",
    viewport: MOBILE_VP,
  },
];

/** All known variants (the shared set + the four we add for the full cross). */
const ALL_VARIANTS = [
  ...VARIANTS,
  ...EXTRA_VARIANTS.filter((e) => !VARIANTS.some((v) => v.key === e.key)),
];

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

  for (const variant of ALL_VARIANTS.filter((v) => keys.has(v.key))) {
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
            fullPage: true,
            // Cross-render font/antialias tolerance.
            maxDiffPixelRatio: 0.02,
          }
        );
      }
    });
  }
}
