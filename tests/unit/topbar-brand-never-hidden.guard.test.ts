/// <reference types="node" />
/**
 * Guard: the phone topbar's brand / search / account are FIXED-SIZE INVARIANTS — a
 * live combat pip never hides, shrinks, or shifts them (owner 2026-07-11: "The
 * INVARIANTS (logo, search bar, profile) cannot change or users will be wtf. If
 * anything has to adapt on mobile it's the ENCOUNTER CHIPS"). Two earlier fixes both
 * made the WRONG element give: one hid `.brand-word` outright (a lone die glyph); its
 * replacement SHRANK the die + wordmark and tightened the bar's own padding when the
 * pip mounted — which clipped the wordmark to "FOL" and read as a "big bug". Both
 * paths are deleted. The pip is now the one flexible element (it collapses to a
 * glyph+count tap target); the invariants hold their exact box — DESIGN.md §combat pip.
 *
 * The authoritative pin is the real-layout e2e (`topbar-brand-invariant.spec.ts`,
 * byte-identical boxes with/without an encounter). This is the cheap CSS-source guard
 * that the deleted shrink path can never quietly return: no `.combat-pip-wrap`-scoped
 * rule may hide OR resize the brand, and the bar's own gap/padding must not change
 * under `:has(.combat-pip-wrap)`.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { SRC_ROOT as SRC, readSrc } from "./__helpers__/src-files";

const FOLIO = resolve(SRC, "styles/folio.css");

/** Innermost `selector { declarations }` blocks (media preludes fall away). */
function ruleBlocks(css: string): Array<{ selector: string; decls: string }> {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: (m[1] ?? "").trim(),
    decls: m[2] ?? "",
  }));
}

const BRAND_PARTS = [".brand-word", ".brand-d20", ".brand-lockup"];
const RESIZES = /display\s*:\s*none|font-size|width|height|gap|transform|scale/;

describe("topbar brand/search/account are combat-invariant", () => {
  it("no `.combat-pip-wrap`-scoped rule hides OR resizes the brand", () => {
    // The whole shrink path (hide the wordmark, or step the die/wordmark down) must
    // never return — the brand is the same box with or without a pip.
    const offenders = ruleBlocks(readSrc(FOLIO)).filter(
      (b) =>
        b.selector.includes(".combat-pip-wrap") &&
        BRAND_PARTS.some((p) => b.selector.includes(p)) &&
        RESIZES.test(b.decls)
    );
    expect(
      offenders.map((b) => b.selector),
      "the brand lockup must stay a fixed-size invariant when the combat pip shares " +
        "the bar — the PIP adapts, never the brand"
    ).toEqual([]);
  });

  it("the bar's own gap/padding does not change under `:has(.combat-pip-wrap)`", () => {
    // Tightening the bar's gap/padding when a pip appears would SHIFT the search +
    // account cluster (breaking their byte-identical box). The bar spacing is invariant;
    // the pip absorbs the `flex:1` spacer's slack instead.
    const offenders = ruleBlocks(readSrc(FOLIO)).filter(
      (b) =>
        /\.topbar:has\(\.combat-pip-wrap\)\s*$/.test(b.selector) &&
        /gap|padding/.test(b.decls)
    );
    expect(
      offenders.map((b) => b.decls.trim()),
      "the bar's gap/padding must not change under an active encounter — it moves the invariants"
    ).toEqual([]);
  });

  it("the invariants carry flex-shrink:0 and the pip collapses to glyph+count", () => {
    // Positive lock on the mechanism the fix relies on: the three invariants never
    // shrink, and at the tightest width the pip drops to its glyph+count lead
    // (`.cp-dest-lead` shown, the decorative status segment hidden).
    const css = readSrc(FOLIO);
    for (const sel of [".topbar-brand", ".topbar-ask", ".topbar-user"]) {
      const esc = sel.replace(/[.]/g, "\\.");
      expect(css, `${sel} must be flex-shrink:0`).toMatch(
        new RegExp(`${esc}\\s*\\{[^}]*flex-shrink:\\s*0`)
      );
    }
    expect(css).toMatch(
      /\.topbar:has\(\.combat-pip-wrap\)\s*\.cp-dest-lead\s*\{[^}]*display:\s*inline-flex/
    );
    expect(css).toMatch(
      /\.topbar:has\(\.combat-pip-wrap\)[^{]*\.cp-status[^{]*\{[^}]*display:\s*none/
    );
  });
});
