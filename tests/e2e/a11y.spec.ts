/**
 * E2E: Accessibility gate (axe-core) — EVERY surface, dark + light.
 *
 * Drives the axe accessibility engine against every surface in the shared
 * `SURFACES` model (the same inventory the visual suite uses: all pages, the
 * edit-mode variants, every overlay/modal/wizard step, and the HP-driven states)
 * in BOTH themes, and fails on any serious/critical WCAG 2.1 AA violation
 * (missing labels/names, broken roles, contrast failures, focus traps,
 * nested-interactive). Moderate/minor are reported but tolerated.
 *
 * This is the SELF-ENFORCING coverage: a new surface added to `surface-manifest.ts`
 * automatically gets an a11y test here (no per-page wiring), so accessibility
 * coverage can't silently rot as pages are added. It is part of the separate
 * Playwright suite (`pnpm test:e2e`), not the unit coverage gate.
 *
 * Runs at 1440×1000 (desktop) for every surface — the deterministic lens that
 * exercises the full chrome (nav rail + header + ribbon + rail) alongside the
 * page content. The visual suite owns the mobile/tablet pixel baselines.
 */

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { SURFACES, seedUI, seedLang, freezeMotion, type Theme } from "./surfaces";

/** Impact levels we refuse to ship. Moderate/minor are reported but tolerated. */
const BLOCKING_IMPACTS = new Set(["serious", "critical"]);
const THEMES: Theme[] = ["dark", "light"];

for (const surface of SURFACES) {
  for (const theme of THEMES) {
    test(`a11y: ${surface.slug} [${theme}] — no serious/critical axe violations`, async ({
      page,
    }) => {
      await seedUI(page, theme, surface.edit ? "edit" : "play");
      await seedLang(page, "en");
      await page.goto(surface.route, { waitUntil: "domcontentloaded" });
      await surface.ready(page);
      if (surface.prepare) await surface.prepare(page);
      await freezeMotion(page);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const blocking = results.violations.filter(
        (v) => typeof v.impact === "string" && BLOCKING_IMPACTS.has(v.impact)
      );
      const summary = blocking
        .map(
          (v) =>
            `[${v.impact ?? "unknown"}] ${v.id}: ${v.help} (${v.nodes.length} node(s))` +
            `\n  ${v.nodes
              .slice(0, 3)
              .map((n) => n.target.join(" "))
              .join("\n  ")}\n  ${v.helpUrl}`
        )
        .join("\n");

      expect(blocking, summary).toEqual([]);
    });
  }
}
