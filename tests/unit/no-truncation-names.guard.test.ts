/// <reference types="node" />
/**
 * Guard: the No-Truncation Rule for card/row NAMES (DESIGN.md §3 — owner,
 * 2026-06-12: "the ellipsis on mobile … like 'Pozione di G…' are not really
 * acceptable"). Identity text on a UniversalCard (`.uc-name`) or picker row
 * (`.pick-name`) WRAPS at spaces — it is never `white-space: nowrap` +
 * `overflow: hidden` + `text-overflow: ellipsis` clipped, at ANY viewport.
 *
 * The recipe this pins ("names wrap, chips don't"):
 *  1. NO rule targeting a protected name selector may reintroduce nowrap /
 *     ellipsis / overflow-clipping — the unit-suite twin of the e2e DOM probe
 *     in `tests/e2e/mobile-layout.spec.ts` (which measures engaged clipping at
 *     390px on every manifest surface).
 *  2. `.uc-name` renders INLINE inside `.uc-name-cell` so the marks (✦ · ◎ ·
 *     RIT · ×qty) flow after the LAST word of a wrapped name instead of
 *     floating beside the first line.
 *  3. Wrapped names balance their lines (`text-wrap: balance` — the cockpit
 *     CombatHeader precedent) so a two-line name reads intentional, never a
 *     long line plus an orphan word.
 *  4. The trailing cluster keeps natural width (`.uc-verdict` pins
 *     `min-width: max-content`; the verdict grid track is `max-content`) —
 *     the NAME absorbs the squeeze by wrapping, the at-a-glance chip is never
 *     compressed or clipped.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "../../src/styles/folio.css"), "utf8")
  .replace(/\s+/g, " ")
  // Strip comments so a doc comment before a rule never pollutes its selector.
  .replace(/\/\*.*?\*\//g, " ");

/** Every `selector { body }` pair, tolerant of at-rule nesting (the selector is
 * whatever follows the previous `{` or `}` — so rules inside `@media` blocks
 * are still seen individually). */
function rules(): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = (m[1] ?? "").split(/[{}]/).pop()?.trim() ?? "";
    if (selector && !selector.startsWith("@")) out.push({ selector, body: m[2] ?? "" });
  }
  return out;
}

/** All rule bodies whose selector mentions the given name class. */
function bodiesTouching(nameClass: string): { selector: string; body: string }[] {
  return rules().filter((r) => new RegExp(`\\${nameClass}(?![\\w-])`).test(r.selector));
}

/** The single base rule for an exact selector. */
function baseBody(selector: string): string {
  const hit = rules().find((r) => r.selector === selector);
  expect(hit, `folio.css must keep a base \`${selector}\` rule`).toBeDefined();
  return hit?.body ?? "";
}

describe("No-Truncation Rule — card/row names (DESIGN.md §3)", () => {
  it("no rule touching a protected name selector reintroduces clipping", () => {
    // `.ch-name` = the roster CARD title; `.party-id-hero` = the campaign party card
    // title. `.party-id-hero` rejoined the wrap recipe (owner 2026-07-07 re-decision,
    // golden rule 26): the 2026-06-29 single-line/ellipsis exception was reversed once
    // the freed row let the name break at a SPACE, so this title now WRAPS like every
    // other name family — the app carries ONE truncation doctrine, no carve-out.
    for (const nameClass of [".uc-name", ".pick-name", ".ch-name", ".party-id-hero"]) {
      for (const { selector, body } of bodiesTouching(nameClass)) {
        const offence = `\`${selector}\` must let names WRAP (No-Truncation Rule), got: ${body.trim()}`;
        expect(body, offence).not.toMatch(/text-overflow:\s*ellipsis/);
        expect(body, offence).not.toMatch(/white-space:\s*nowrap/);
        expect(body, offence).not.toMatch(/overflow:\s*hidden/);
        expect(body, offence).not.toMatch(/-webkit-line-clamp/);
      }
    }
  });

  it("the roster card head reserves the kebab column so a wrapped name never runs under the dots", () => {
    // `.ch-overflow` is absolutely positioned top-right (8px + 28px); without a
    // reserved right padding on `.ch-top`, a long name's first line renders
    // BENEATH the kebab (the "Sister Beatrice of thë" collision, P8 audit).
    const body = baseBody(".ch-top");
    expect(body).toMatch(/padding:\s*var\(--sp-4\)\s+44px/);
  });

  it("the UniversalCard name is INLINE in its cell so marks flow after the last word", () => {
    expect(baseBody(".uc-name")).toMatch(/display:\s*inline\b/);
  });

  it("wrapped names balance their lines (the CombatHeader precedent)", () => {
    expect(baseBody(".uc-name-cell")).toMatch(/text-wrap:\s*balance/);
    expect(baseBody(".pick-name")).toMatch(/text-wrap:\s*balance/);
    // The roster card title wraps balanced (AC-ZERO).
    expect(baseBody(".ch-name")).toMatch(/text-wrap:\s*balance/);
    // The party card title wraps balanced too (owner 2026-07-07 re-decision, golden
    // rule 26 — the 2026-06-29 single-line/ellipsis exception was reversed once the
    // freed row let the name break at a space; it rejoins the one wrap doctrine).
    expect(baseBody(".party-id-hero")).toMatch(/text-wrap:\s*balance/);
  });

  it("the verdict chip is a single-line nowrap token (CHIP-COMPACT — content is budget-gated upstream)", () => {
    const chip = baseBody(".uc-verdict");
    // CHIP-COMPACT (owner 2026-06-12: "chips should never be that big")
    // supersedes the old wrap-inside-20ch recipe: chip CONTENT is bounded at
    // the view seam (`chipText` ≤ CHIP_BUDGET, pinned by
    // `chip-budget.guard.test.ts` walking every SRD-emitted chip in both
    // locales), so the recipe locks nowrap — a chip can never wrap into a
    // paragraph beside a one-line card, and nowrap can never clip because
    // over-budget content is unrepresentable.
    expect(chip).toMatch(/white-space:\s*nowrap/);
    expect(chip).not.toMatch(/max-width:/);
    expect(chip).not.toMatch(/text-overflow:\s*ellipsis/);
    expect(chip).not.toMatch(/overflow:\s*hidden/);
    // The verdict grid track stays `max-content` (D31's phone-width
    // `minmax(0, max-content)` compromise is superseded: it let the CHIP clip;
    // now the wrapping name yields the space instead).
    expect(baseBody(".uc-head")).toMatch(
      /grid-template-columns:\s*34px minmax\(0, 1fr\) max-content auto/
    );
  });
});
