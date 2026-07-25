import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const indexCss = readFileSync(resolve(here, "../../src/index.css"), "utf8");
const folioCss = readFileSync(resolve(here, "../../src/styles/folio.css"), "utf8");
/** folio.css with comments stripped — assertions must read DECLARATIONS, never prose. */
const folio = folioCss.replace(/\/\*[\s\S]*?\*\//g, "");
const index = indexCss.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * THE ORNAMENT VOCABULARY (DESIGN.md §5). Ornament is EARNED, never decorative,
 * and the vocabulary is deliberately tiny. This guard pins the load-bearing
 * facts so a later wave cannot quietly grow a second one back:
 *
 *   L2 · AN ORNAMENT REPLACES THE LINE. It is never drawn over it, beside it,
 *        or near it. Wherever a mark appears, the rule terminates, the mark
 *        occupies the interval, the rule resumes. The reference has no surface
 *        anywhere where a rule and an ornament are painted on top of each
 *        other — and a head that drew both was the one defect the owner named.
 *
 *   ONE DIVIDER. `--hairline` is every separator in the application: modal
 *        heads, card feet, section rubrics, list groups, the compendium entry
 *        head, the colophon. Tips fading, NODELESS, inset from the padding
 *        edge. There is no second divider grammar and no node on any of them.
 *
 *   THE ORNAMENT BUDGET. At most ONE mark-bearing surface per screen, and it
 *        must be the surface the user is acting in. A dialog carries none (it
 *        already commands the screen); a resting card, a sibling panel, a
 *        section heading, a list row and a chip carry none, ever.
 *
 *   NO LIGHT EMISSION. Glows, blooms, sweeps and auras are not part of the
 *        vocabulary: this chrome is a lit MATERIAL, and light on it means
 *        depth, never state. Focus is the a11y ring alone.
 *
 *   FLAT TYPE. Titles carry no engraving, letterpress, underglow or gradient;
 *        a section heading is type and space; gold means a value or a state,
 *        never a label.
 */
describe("the ornament vocabulary", () => {
  it("keeps the ornament BUDGET at ZERO while the MARK is unmounted", () => {
    // The corner knot came off with the square corners: it re-drew ~30px of the
    // host's own rail from a square vertex, which cannot register on a rounded
    // plate — a thickened, offset segment of line that abruptly returns to the
    // border is exactly the two-line defect L2 forbids. Nothing carries a mark
    // until it is redrawn as a fan seated INSIDE the radius.
    expect(indexCss).not.toMatch(/--frame-ornate/);
    expect(folio).not.toMatch(/--frame-ornate/);
    // …and no surface grew a replacement in the meantime. A DIALOG in particular
    // carries none, ever: it already commands the screen, and the reference's own
    // modals are plain plates with a title and a whisper.
    expect(folio).not.toMatch(/\.modal::after\s*\{/);
    expect(folio).not.toMatch(/\.modal::before\s*\{/);
    expect(folio).not.toMatch(/\.page-head\.framed::before\s*\{/);
    expect(folio).not.toMatch(/\.folio-panel\.gilt-frame::after\s*\{/);
  });

  it("draws NO ornament over a line — no head figure, no divider node", () => {
    // The reported defect: a dialog head that drew a full-width border-image
    // rule AND a 260px winged-fleur SVG with its own rail, one pixel apart, at
    // different lengths and weights. Both the ornament and the second rule are
    // gone; the head ends in the one hairline.
    expect(index).not.toMatch(/--seat-orn/);
    expect(folio).not.toMatch(/--seat-orn/);
    const head = folio.match(/\.modal-head::after \{([^}]*)\}/)?.[1] ?? "";
    expect(head, "the modal head must end in the ONE hairline").toContain(
      "background: var(--hairline);"
    );
    expect(folio).not.toMatch(/\.modal-head \{[^}]*border-image/);
    expect(folio).not.toMatch(/\.modal-head \{[^}]*border-bottom/);
  });

  it("has exactly ONE divider recipe, and it is nodeless", () => {
    // The one painted gradient, derived from the one ink parameter.
    expect(index).toMatch(
      /--hairline:\s*linear-gradient\(\s*90deg,\s*transparent,\s*var\(--hairline-ink\) 10%,\s*var\(--hairline-ink\) 90%,\s*transparent\s*\);/
    );
    // Every divider in the app consumes it rather than re-declaring a gradient.
    for (const consumer of [
      /\.sec-rule \{[^}]*background: var\(--hairline\);/,
      /\.modal-head::after \{[^}]*background: var\(--hairline\);/,
      /\.ch-foot::before \{[^}]*background: var\(--hairline\);/,
      /\.cmp-entry-head::after \{[^}]*background: var\(--hairline\);/,
      /\.colophon-hero-rule \{[^}]*background: var\(--hairline\);/,
    ]) {
      expect(consumer.test(folio), `MISSING hairline consumer: ${consumer}`).toBe(true);
    }
    // NODELESS — no divider anywhere carries a centre mark.
    expect(folio).not.toMatch(/\.sec-rule::(before|after)/);
    expect(folio).not.toMatch(/\.bm-rule::after/);
    expect(folio).not.toMatch(/\.colophon-hero-rule::after/);
    expect(folio).not.toMatch(/\.site-footer-diamond/);
  });

  it("has ZERO rotated-diamond ornaments — a heading is type and space", () => {
    // 18 rotated-45° lozenges shipped as rubric markers, rail heads, list
    // bullets, divider nodes and menu markers. A heading is type and space; a
    // bullet is a bullet; a marker is ink colour. The ONE surviving rotate(45deg)
    // is the `<select>` caret — a chevron drawn from two borders, the standard
    // form-control idiom, not a lapidary node.
    const rotations = [...folio.matchAll(/transform:[^;]*rotate\(-?45deg\)/g)];
    const selectors = rotations.map((m) => {
      const before = folio.slice(0, m.index);
      const head = before
        .slice(before.lastIndexOf("}") + 1)
        .trim()
        .split("{")[0];
      return head === undefined ? "" : head.trim();
    });
    expect(
      selectors,
      "Every rotate(45deg) in the chrome must be the <select> caret. A new one is a " +
        "re-added lapidary diamond — a heading is type and space, a divider is nodeless."
    ).toEqual([".select::after"]);
    // The named lozenges stay deleted, markup and all.
    for (const gone of [
      "sec-diamond",
      "rh-diamond",
      "ag-diamond",
      "runic-gem",
      "site-footer-diamond",
    ]) {
      expect(folio.includes(gone), `\`.${gone}\` must stay deleted`).toBe(false);
    }
  });

  it("emits NO light: no glow, no bloom, no sweep, no aura, no focus halo", () => {
    for (const token of [
      "--illumination",
      "--gilt-glow",
      "--gilt-glow-sm",
      "--glint-ink",
      "--focus-wash",
      "--emboss-sheen",
    ]) {
      expect(index.includes(token), `${token} must stay deleted`).toBe(false);
      expect(folio.includes(token), `${token} must stay deleted`).toBe(false);
    }
    // Focus is the ring, and only the ring.
    const focus = index.match(/^:focus-visible \{([^}]*)\}/m)?.[1] ?? "";
    expect(focus).toContain("outline: 2px solid var(--focus-ring);");
    expect(focus).not.toContain("box-shadow");
    // The commit bloom + its keyframes are gone.
    expect(folio).not.toMatch(/pager-bloom/);
  });

  it("keeps type FLAT and un-watermarked — no engraving, no crest behind ink", () => {
    expect(index).not.toMatch(/--engrave-title/);
    expect(folio).not.toMatch(/--engrave-title/);
    expect(folio).not.toMatch(/page-head-crest/);
    // `--asset-crest` survives with ONE consumer: the compendium frontispiece,
    // the single place a watermark is honest (a title page, with no live
    // content over it).
    expect(folio.match(/var\(--asset-crest\)/g)?.length).toBe(2); // -webkit-mask + mask
    expect(folio).toMatch(/\.cmp-frontis-inner::before \{[^}]*var\(--asset-crest\)/);
  });

  it("marks selection with the frame gradient (altar + chosen plaque), not diamonds", () => {
    expect(indexCss.match(/--metal-silver:/g)?.length).toBe(2);
    expect(indexCss.match(/--metal-bronze:/g)?.length).toBe(2);
    expect(indexCss).toMatch(
      /--frame-selected:\s*linear-gradient\(\s*180deg,\s*var\(--metal-silver\),\s*var\(--metal-bronze\) 50%,\s*var\(--metal-silver\)\s*\)/
    );
    expect(folio).toMatch(/var\(--frame-selected\) border-box/);
  });

  it("keeps the jewelry-thin scrollbar: transparent track, ghost thumb, hidden buttons, Firefox fence", () => {
    expect(indexCss).toMatch(
      /@supports not selector\(::-webkit-scrollbar\)\s*\{[^]*?scrollbar-width: thin/
    );
    expect(indexCss).toMatch(/::-webkit-scrollbar-track\s*\{\s*background: transparent/);
    expect(indexCss).toMatch(
      /::-webkit-scrollbar-thumb\s*\{[^}]*var\(--text-muted\) 40%/
    );
    // The scroll buttons are hidden — no finial ornament.
    expect(indexCss).toMatch(/::-webkit-scrollbar-button\s*\{\s*display: none/);
    expect(indexCss).not.toMatch(/--orn-finial/);
    expect(folioCss).not.toMatch(/--orn-finial/);
  });
});
