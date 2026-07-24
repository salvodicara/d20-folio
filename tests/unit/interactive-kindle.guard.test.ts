/**
 * Guard: the INTERACTIVE grammar (DESIGN.md §9 "Motion + Feedback" / §5 button
 * recipes). Two load-bearing facts:
 *
 *   1. NO LIGHT EMISSION ON A STATE. A control's hover changes light and
 *      colour — it never EMITS. The specular hover sweep (a moving white band
 *      across a CTA face) is banned outright: nothing in the reference plays
 *      light across a surface, and it was the last survivor of the four
 *      "something glows" systems this chrome carried.
 *
 *   2. "WARM TO THE TOUCH" — browse-row hover KINDLES toward candle-gold
 *      (accent-tinted fill), never a plain neutral surface fill; and the
 *      light-theme .cmp-tab keeps its own perceptible hover strike (the base
 *      surface-2 fill is invisible on the ivory band).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const folioCss = readFileSync(resolve(here, "../../src/styles/folio.css"), "utf8");
const indexCss = readFileSync(resolve(here, "../../src/index.css"), "utf8");

describe("interactive kindle grammar (wave 2)", () => {
  it("plays NO specular sweep on any control — a state never emits light", () => {
    // The band, its ink token and its motion gate are all gone. A re-add would
    // reintroduce a moving light source on a surface that is meant to be a
    // material lit from one place.
    expect(indexCss).not.toMatch(/--glint-ink/);
    expect(folioCss).not.toMatch(/--glint-ink/);
    expect(folioCss).not.toMatch(/\.btn\.primary::before/);
    expect(folioCss).not.toMatch(/translateX\(-?130%\)/);
    // The hosts keep their clip seat (the loading spinner + the face gradient
    // still need it) — only the emission is gone.
    expect(folioCss).toMatch(
      /\.btn\.primary,\s*\.btn\.brass\s*\{[^}]*position: relative;\s*overflow: hidden;/
    );
  });

  it("kindles browse-row hover toward gold (never a plain neutral fill)", () => {
    const rowHover = folioCss.match(
      /\.pick-row:hover:not\(:disabled\),\s*\.spell-pick-row:hover\s*\{[^}]*\}/
    )?.[0];
    expect(rowHover).toBeTruthy();
    expect(rowHover).toContain("var(--accent-glow)");
    expect(rowHover).toContain("var(--accent-primary)");
  });

  it("kindles the upcast cast-level picker row hover toward gold (never a plain neutral fill)", () => {
    const clOptHover = folioCss.match(/\.cl-opt:hover\s*\{[^}]*\}/)?.[0];
    expect(clOptHover).toBeTruthy();
    expect(clOptHover).toContain("var(--accent-glow)");
    expect(clOptHover).toContain("var(--accent-primary)");
  });

  it("keeps the light-theme compendium tab hover perceptible (its own strike)", () => {
    expect(folioCss).toMatch(
      /\[data-theme="light"\] \.cmp-tab:hover\s*\{[^}]*var\(--accent-primary\)/
    );
  });
});
