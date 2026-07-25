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
 *   L2 · AN ORNAMENT IS THE LINE'S OWN LOCAL FORM — never a second rail beside
 *        it. For the length of the mark the rule wears a different shape: the
 *        corner terminal contributes no run line at all, and the cartouche's
 *        leaves weave over and under a rail that passes through unbroken. The
 *        reference has no surface anywhere where a rule and an ornament are
 *        painted on top of each other — and a head that drew both (a full-width
 *        rule under a fleur carrying its own rail, one pixel apart) was the one
 *        defect the owner named.
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
  it("spends the ornament budget on exactly TWO hosts, which can never co-occur", () => {
    // At most ONE mark-bearing surface per screen, and it is the screen's
    // IDENTITY plate: the framed realm masthead on every route that renders one,
    // and the cockpit's identity band on the ONE route that renders none. They
    // can never both appear — the cockpit is the only surface that mounts
    // `.folio-panel.gilt-frame`, and it renders no `PageHeader`.
    const HOSTS = ["\\.page-head\\.framed::before", "\\.folio-panel\\.gilt-frame::after"];
    for (const host of HOSTS) {
      expect(
        new RegExp(`${host}[^{]*\\{[^}]*var\\(--mark-tl\\)`).test(folio),
        `MISSING the mark on \`${host}\`. The budget is ONE ornamented surface per ` +
          `screen and it is the identity plate — the reference's own second ornament ` +
          `home (the ogee head of a hero/identity panel).`
      ).toBe(true);
    }
    // Every OTHER surface carries none. A dialog in particular carries none,
    // ever: it already commands the screen, and the reference's own modals are
    // plain plates with a title and a whisper.
    for (const forbidden of [
      /\.modal::after\s*\{/,
      /\.modal::before\s*\{/,
      /\.ch-card::before\s*\{/,
      /\.info-card::(before|after)\s*\{/,
      /\.tome-leaf-surface::after\s*\{/,
    ]) {
      expect(folio).not.toMatch(forbidden);
    }
    // …and nothing else in the stylesheet consumes a mark layer. At-rule
    // preludes are unwrapped first, so a media-query strike is judged by the
    // SELECTOR inside it rather than by `@media (…)`.
    const flat = folio.replace(/@media[^{]*\{/g, "");
    const consumers = [...flat.matchAll(/([^{}]+)\{[^}]*var\(--mark-(?:tl|run)\)/g)].map(
      (m) => (m[1] ?? "").trim().replace(/\s+/g, " ")
    );
    expect(consumers.length, "the mark must be mounted somewhere").toBeGreaterThan(0);
    for (const subject of consumers) {
      expect(
        subject,
        `\`${subject}\` mounts the MARK. Only the two identity plates may — a sibling ` +
          `panel, a resting card, a section heading, a list row and a chip carry ` +
          `none, ever.`
      ).toBe(".page-head.framed::before, .folio-panel.gilt-frame::after");
    }
  });

  it("draws the mark as the LINE'S OWN FORM — never a second rail, never floating", () => {
    // THE CORNER TERMINAL contributes no run line at all: the host's own border
    // is the only line at the corner. The knot this chrome used to carry re-drew
    // ~30px of that rail from a square vertex, which is the two-line defect L2
    // exists to forbid — so the fan is pure rays, anchored ON the corner arc.
    for (const theme of ["dark", "light"] as const) {
      const start = indexCss.indexOf(`[data-theme="${theme}"]`);
      const block = indexCss.slice(start, indexCss.indexOf("\n}", start));
      for (const name of [
        "--mark-tl",
        "--mark-tr",
        "--mark-bl",
        "--mark-br",
        "--mark-run",
      ]) {
        expect(
          new RegExp(`${name}:`).test(block),
          `MISSING ${name} in the ${theme} theme. The mark is GOLD in both themes ` +
            `(bronze is banned) — a mark that exists in one theme only is a mark the ` +
            `daylight sibling was never designed for.`
        ).toBe(true);
      }
      const tl =
        /--mark-tl: url\("data:image\/svg\+xml,([^"]*)"\)/.exec(block)?.[1] ?? "";
      const svg = decodeURIComponent(tl);
      // Rays are TRIANGLES from one origin — no rect, no line, no long straight
      // path that could read as a rail beside the host's own.
      expect(svg).not.toMatch(/<(rect|line|polyline)\b/);
      // …and the geometry is authored ONCE and MIRRORED, with the toning applied
      // AFTER the mirror so the bevel's light stays top-left on all four corners.
      expect(
        /<use href="#a"\/>/.test(svg) && /translate\([-\d.]+ [-\d.]+\)/.test(svg),
        "The corner tile must mirror an unfilled master and tone it in SCREEN space " +
          "(a translated shade group + a translated glint group around the body)."
      ).toBe(true);
      // Three tonal passes: the metal is DIMENSIONAL, not line-art.
      expect(
        (svg.match(/<g /g) ?? []).length,
        "Every struck member carries a light/shade pair: a shade group, the body, " +
          "and a glint group. Line-art gold is not this material."
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("mounts the mark as decor only — no border-image, no layout, no animation", () => {
    const rule =
      /\.page-head\.framed::before,\s*\.folio-panel\.gilt-frame::after \{([^}]*)\}/.exec(
        folio
      )?.[1] ?? "";
    expect(rule, "the mark overlay rule must exist").not.toBe("");
    expect(rule).toContain("pointer-events: none;");
    // `border-image` mis-seats the centreline (its tiles shrink proportionally),
    // and a layout border on the pseudo would force a minimum box the size of the
    // tile. Neither is ever the mechanism.
    expect(folio).not.toMatch(/border-image[^;]*--mark/);
    expect(rule).not.toMatch(/border(-\w+)?\s*:/);
    expect(rule).not.toMatch(/(animation|transition)\s*:/);
    // The overlay hangs past the plate's foot so the cartouche's underside can
    // paint (a background is clipped to its own box) — so a mark-bearing host
    // must never clip.
    expect(rule).toMatch(/var\(--mark-drop\)/);
    for (const host of ["\\.page-head\\.framed", "\\.folio-panel\\.gilt-frame"]) {
      const body = new RegExp(`${host} \\{([^}]*)\\}`).exec(folio)?.[1] ?? "";
      expect(
        /overflow[^;]*:\s*(hidden|clip)/.test(body),
        `A mark-bearing host must not clip: the corner ink and the cartouche's ` +
          `underside are paint-only overflow.`
      ).toBe(false);
    }
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
