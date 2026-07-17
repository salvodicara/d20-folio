/**
 * Guard: the wave-2 INTERACTIVE grammar (the full-BG3 push — DESIGN.md §9
 * "Motion + Feedback" / §5 button recipes). Two load-bearing facts:
 *
 *   1. THE GILT GLINT — the struck-gold tier (.btn.primary / .btn.brass /
 *      .endturn, the earned metal CTAs only) plays a one-shot specular sweep
 *      on hover. It must stay transform-driven (GPU-only, no layout) and the
 *      moving state must live behind [data-motion="auto"] — under reduced
 *      motion the band never moves. The transition must live ONLY on the
 *      hover rule (that is what makes the sweep one-shot: un-hover resets
 *      instantly and invisibly).
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
  it("strikes the gilt glint on exactly the struck-gold tier, reduced-motion-gated", () => {
    // The resting band: an overlay pseudo parked off-face by transform, inked
    // by the per-theme --glint-ink token (defined twice, once per theme root).
    expect(folioCss).toMatch(
      /\.btn\.primary::before,\s*\.btn\.brass::before,\s*\.endturn::before\s*\{[^}]*var\(--glint-ink\)[^}]*transform: translateX\(-130%\)/
    );
    const indexCssGlint = indexCss.match(/--glint-ink:/g)?.length;
    expect(indexCssGlint).toBe(2);
    // The sweep: hover moves the band, ONLY under [data-motion="auto"], and the
    // transition — exactly `transform <n>ms var(--ease-standard)`, nothing else
    // (GPU-only) — lives on the hover rule itself (that is the one-shot).
    const sweep = folioCss.match(
      /\[data-motion="auto"\] \.btn\.primary:hover[^{]*::before,[^{]*\{[^}]*\}/
    )?.[0];
    expect(sweep).toBeTruthy();
    expect(sweep).toContain("transform: translateX(130%)");
    expect(sweep).toMatch(/transition: transform \d+ms var\(--ease-standard\);/);
    // The band is clipped to each host's face — and the seat MUST live inside
    // each BASE recipe: .endturn's opens `all: unset` LATER in source than the
    // glint block, so a shared grouped host rule is cascade-dead for it (the
    // pass-1 review catch). Pin the order: unset first, then the seat.
    expect(folioCss).toMatch(
      /\.btn\.primary,\s*\.btn\.brass\s*\{[^}]*position: relative;\s*overflow: hidden;/
    );
    expect(folioCss).toMatch(
      /\.endturn\s*\{\s*all: unset;[^}]*position: relative;\s*overflow: hidden;/
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
