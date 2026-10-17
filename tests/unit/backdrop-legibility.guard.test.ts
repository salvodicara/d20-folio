/// <reference types="node" />
/**
 * Guard: backdrop legibility + layout fixes on the candlelit backdrop (owner,
 * 2026-06-07, Img #5/#6). Each assertion pins a recipe that, if deleted, re-breaks
 * a surface the owner explicitly flagged. Checks the MECHANISM (selector + key
 * declaration), not exact values, so a legitimate refactor passes.
 *
 *   #5 — the class tip was an ad-hoc `bg-accent/5` (5%) wash the dark art bled
 *        through; it now reuses the OPAQUE `.info-card` surface (`.info-card.tip`).
 *   #6 — the 10-step guided rail ran wider than a narrow viewport and forced a
 *        PAGE-level horizontal scroll; the wizard-F orbs WRAP so they never do.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "../../src/styles/folio.css"), "utf8").replace(
  /\s+/g,
  " "
);

describe("backdrop legibility + layout guards (Img #5/#6)", () => {
  it("#5 — `.info-card.tip` is built on the OPAQUE info-card surface (no translucent wash)", () => {
    // The tip must reuse the opaque parchment surface so the dark art can't bleed
    // through. Assert the variant exists and re-paints an opaque --bg-surface-2 base.
    const rule = /\.info-card\.tip\s*\{[^}]*--bg-surface-2[^}]*\}/;
    expect(
      rule.test(css),
      "MISSING: `.info-card.tip { … --bg-surface-2 … }`. The class tip must be an opaque " +
        "info-card surface, not the old `bg-accent/5` wash the dark backdrop bled through."
    ).toBe(true);
  });

  it("#6 — the wizard-F orbs WRAP on mobile so the page never overflows horizontally", () => {
    const rule = /\.wiz-orbs\s*\{[^}]*flex-wrap:\s*wrap/;
    expect(
      rule.test(css),
      "MISSING: `.wiz-steprail { … overflow-x: auto … }`. Without it the 10-step guided " +
        "rail forces a page-level horizontal scroll on narrow viewports (clipped topbar, Img #6)."
    ).toBe(true);
  });
});
