/**
 * E2E: Polish screenshot harness (NOT a regression test)
 *
 * Captures the built/reachable app surfaces as standalone PNGs for the
 * design-polish review loop. Unlike `visual-full.spec.ts` (which asserts pixel
 * baselines), this spec makes NO assertions about the images — it only seeds
 * the mock character + theme/motion and writes `page.screenshot()` PNGs to a
 * directory the reviewer can flip through.
 *
 * It is leading-underscore-prefixed so it is easy to glob/exclude, and it is
 * GATED on POLISH_SHOT_DIR — when that env var is unset the whole file is
 * skipped, so it never runs in normal `pnpm test:e2e` / CI.
 *
 * Run it explicitly:
 *   POLISH_SHOT_DIR=/tmp/polish pnpm exec playwright test tests/e2e/_polish-shots.spec.ts
 *
 * The surface list, variant matrix, and per-surface ready/prepare interactions
 * are SHARED with the CI visual-regression suite via `./surfaces.ts` (whose pure
 * `{slug,route}` half lives in `./surface-manifest.ts` and is cross-checked by
 * `tests/unit/route-coverage.guard.test.ts`). So this human-review harness and
 * the machine baseline suite always cover exactly the same surfaces.
 *
 * ── COMPLETE user-facing surface inventory ───────────────────────────────────
 * (enumerated from src/app/router.tsx + the route pages + the sheet/shared
 * components — every page, sub-menu, modal/popover, wizard step, and the key
 * scenario states. The canonical machine-readable list is `SURFACE_ROUTES` in
 * surface-manifest.ts; this narrative explains what each captures.)
 *
 *   Standalone routes
 *     home              "/"                      roster grid (cards · search · CTAs)
 *     home-row-menu     "/" + ⋯ overflow         per-card export/clone/archive/delete menu
 *     home-delete       "/" + ⋯ → Delete         delete-character confirm dialog
 *     create            "/characters/new"        Quick Start single-page form (default mode)
 *     create-guided     "/characters/new" → Guided  guided wizard step 1 (Class)
 *     create-guided-race / -background / -skills / -spells / -equipment /
 *       -bgasi / -abilities / -review            each guided step (jumped via the stepper)
 *
 *   Sheet tabs ("/characters/mock-1/…")  — all 9, each + edit variant where it has one
 *     abilities (+edit) · combat (+edit) · spells (+edit) · features ·
 *     equipment (+edit) · lore · notes · algorithm · rest
 *
 *   Overlays (modals / popovers / drawers — opened from a page)
 *     settings          header gear → settings dropdown popover (lang/theme/motion)
 *     snapshots         header history icon → Character Snapshots modal
 *     level-up          header pill → full level-up modal (Bard 9→10, single scroll)
 *     spell-add         spells (edit) → Add Spell modal
 *     spell-cast        spells (play) → Cast / upcast (CastLevel) modal  [best-effort]
 *     equipment-add     equipment (edit) → Add Equipment modal
 *     magic-item-add    equipment (edit) → Magic Items modal
 *     feature-add       features (edit) → Add Feature modal
 *     mobile-drawer     mobile → MobileGameDrawer bottom sheet (expanded)
 *     hp-popover        TABLET band → header HP pill → damage/heal/temp popover
 *
 *   Scenario states (driven by interaction on the tablet band, where the HP
 *   control is the interactive surface — see the HP-band note below)
 *     hp-wounded        HP driven into the wounded band (bar colour shift)
 *     hp-critical       HP driven into the critical band
 *     hp-death-saves    HP driven to 0 → combat Death-Saves panel appears
 *
 * ── The HP-control band (why some surfaces use a tablet viewport) ─────────────
 * folio.css shows HP EXACTLY ONCE per viewport:
 *   • ≥1181px (desktop): the read-only game RAIL owns HP; the header pill hides.
 *   • 721–1180px (tablet): the header HP PILL (the interactive damage/heal/temp
 *     popover) is the surface.
 *   • ≤720px (phone): the read-only drawer summary owns HP; the header pill hides.
 * So the ONLY interactive HP control (the popover that applies damage) lives in
 * the tablet band. Capturing the HP popover and driving HP to wounded/critical/0
 * (for death saves) therefore uses a dedicated TABLET viewport. This is also the
 * answer to the owner's "can't edit HP" report on desktop — HP is rail-only there.
 *
 * Each FULL PAGE is captured in all five locale×theme×viewport variants. MODALS,
 * MENUS, WIZARD STEPS, and STATES run a bounded representative subset (at minimum
 * en-light-desktop + it-light-desktop + it-dark-mobile) via the optional
 * per-surface `variants` allowlist, so the IT/i18n lens and the mobile-overflow
 * lens both see them without exploding the shot count. Files are named
 * `<slug>-<locale>-<theme>-<device>.png`.
 *
 * The server runs with VITE_DEV_BYPASS_AUTH=true (see playwright.config.ts),
 * so "/" lands on the authenticated character list and "mock-1" resolves to
 * MOCK_CHARACTER (Lyra Voss, Bard 9) without Firebase.
 *
 * NOTE — Login is intentionally NOT in this inventory. The dev bypass injects a
 * mock user synchronously at boot, and `/login` redirects to "/" whenever
 * `initialized && user` — so under the bypass the sign-in surface is unreachable
 * by design. It is reviewed via its own RTL/visual baseline, not this harness.
 */

import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import {
  SURFACES,
  VARIANTS,
  FULL_PAGE_VARIANTS,
  freezeMotion,
  seedLang,
  seedUI,
  settleForShot,
} from "./surfaces";

const SHOT_DIR = process.env.POLISH_SHOT_DIR;

// Gate: only run when an output dir is provided. Keeps this out of CI / the
// normal e2e run, where POLISH_SHOT_DIR is unset.
test.skip(!SHOT_DIR, "POLISH_SHOT_DIR is not set — polish harness disabled.");

test.beforeAll(() => {
  if (SHOT_DIR) fs.mkdirSync(SHOT_DIR, { recursive: true });
});

for (const surface of SURFACES) {
  const variantKeys = surface.variants ?? FULL_PAGE_VARIANTS;
  for (const variant of VARIANTS.filter((v) => variantKeys.includes(v.key))) {
    const name = `${surface.slug} — ${variant.locale} ${variant.theme} @ ${variant.device}`;
    test(name, async ({ page }) => {
      // SHOT_DIR is guaranteed by the file-level test.skip gate above.
      const dir = SHOT_DIR ?? "";
      await page.setViewportSize(variant.viewport);
      await seedUI(page, variant.theme, surface.edit ? "edit" : "play");
      await seedLang(page, variant.locale);
      await page.goto(surface.route);
      await surface.ready(page);
      if (surface.prepare) await surface.prepare(page);
      // F1 P3 — an OVERLAY surface (one that declares a `variants` allowlist to
      // capture a modal/popover) whose `prepare()` swallows a failed open (every
      // prepare wraps its clicks in `.catch(() => {})`) would silently capture the
      // BARE page, not the overlay — a no-op variant nobody notices. Assert the
      // overlay actually mounted so a broken trigger FAILS the harness instead.
      // A surface pinned `overlay: false` drives an INLINE page state (its own
      // `ready`/`prepare` anchors prove the paint), so the assert skips it.
      if (surface.variants && surface.prepare && surface.overlay !== false) {
        const overlay = page.locator('[role="dialog"], .glossary-pop, [role="menu"]');
        await expect(
          overlay.first(),
          `${surface.slug}: prepare() did not open an overlay — variant capture would be a no-op`
        ).toBeVisible({ timeout: 5000 });
      }
      await freezeMotion(page);
      // Let in-viewport art decode + a short post-networkidle beat BEFORE the shot,
      // so a full-page capture never freezes a pre-paint state (the harness-hygiene
      // fix — 4 audit findings were artifacts of capturing too early). Bounded.
      await settleForShot(page);

      const file = `${surface.slug}-${variant.locale}-${variant.theme}-${variant.device}.png`;
      await page.screenshot({ path: path.join(dir, file), fullPage: true });
    });
  }
}
