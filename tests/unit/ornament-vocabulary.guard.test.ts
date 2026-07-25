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
 *        it. The corner knot's rail SWELL crosses the vertex and tapers back to
 *        a hairline that dissolves into the host's own border stroke; it
 *        contributes no run line of its own. There is no surface anywhere where
 *        a rule and an ornament are painted on top of each other as TWO lines.
 *
 *   THE ORNAMENT BUDGET. EXACTLY THREE earned hero registers wear the corner
 *        knot (Constitution §4.16): the framed realm masthead, the gilt-framed
 *        hero band (cockpit identity), and dialogs. Everything else — a
 *        resting card, a sibling panel, a section heading, a list row, a chip —
 *        carries none, ever.
 *
 *   ONE CENTRE-NODE EXCEPTION. `--hairline` is every OTHER divider in the
 *        application (card feet, section rubrics, list groups, the compendium
 *        entry head, the colophon) — tips fading, NODELESS. The dialog head is
 *        the one earned ceremony seat: its own fading rule carries the
 *        ceremonial seat ornament (the winged divider) at its centre.
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
  it("spends the ornament budget on exactly THREE earned hero registers", () => {
    // The framed realm masthead, the gilt-framed hero band (cockpit identity),
    // and dialogs — the app's three EARNED hero registers (Constitution §4.16).
    const HOSTS = [
      "\\.page-head\\.framed::before",
      "\\.folio-panel\\.gilt-frame::after",
      "\\.modal::after",
    ];
    for (const host of HOSTS) {
      expect(
        new RegExp(`${host}[^{]*\\{[^}]*var\\(--frame-ornate\\)`).test(folio),
        `MISSING the corner knot on \`${host}\`. Exactly three earned hero registers ` +
          `wear it: the framed masthead, the gilt-framed hero band, and dialogs.`
      ).toBe(true);
    }
    // Every OTHER surface carries none — a resting card, a sibling panel, a
    // section heading, a list row and a chip, ever.
    for (const forbidden of [
      /\.ch-card::before\s*\{/,
      /\.info-card::(before|after)\s*\{/,
      /\.tome-leaf-surface::after\s*\{/,
    ]) {
      expect(folio).not.toMatch(forbidden);
    }
    // …and nothing else in the stylesheet consumes the corner knot.
    const consumers = [...folio.matchAll(/([^{}]+)\{[^}]*var\(--frame-ornate\)/g)].map(
      (m) => (m[1] ?? "").trim().replace(/\s+/g, " ")
    );
    expect(consumers.length, "the corner knot must be mounted somewhere").toBeGreaterThan(
      0
    );
    for (const subject of consumers) {
      expect(
        subject,
        `\`${subject}\` mounts the corner knot. Only the three earned hero registers ` +
          `may — a sibling panel, a resting card, a section heading, a list row and a ` +
          `chip carry none, ever.`
      ).toBe(".page-head.framed::before, .folio-panel.gilt-frame::after, .modal::after");
    }
  });

  it("draws the corner knot as the LINE'S OWN FORM — never a second rail, never floating", () => {
    for (const theme of ["dark", "light"] as const) {
      const start = indexCss.indexOf(`[data-theme="${theme}"]`);
      const block = indexCss.slice(start, indexCss.indexOf("\n}", start));
      for (const name of ["--frame-ornate", "--seat-orn"]) {
        expect(
          new RegExp(`${name}:`).test(block),
          `MISSING ${name} in the ${theme} theme. The knot is GOLD in both themes ` +
            `(bronze is banned) — a mark that exists in one theme only is a mark the ` +
            `daylight sibling was never designed for.`
        ).toBe(true);
      }
      // `--frame-ornate` is a list of FOUR fixed-size per-corner background
      // layers (tl/tr/bl/br), each a 64×64 tile anchored at its own corner.
      const decl = /--frame-ornate:\s*([\s\S]*?);\n/.exec(block)?.[1] ?? "";
      const urls = [...decl.matchAll(/url\("([^"]*)"\)/g)].map((m) => m[1] ?? "");
      expect(
        urls.length,
        "`--frame-ornate` must carry exactly four corner tiles (tl/tr/bl/br)"
      ).toBe(4);
      for (const corner of ["left top", "right top", "left bottom", "right bottom"]) {
        expect(decl).toContain(`${corner} / 64px 64px no-repeat`);
      }

      // The tl tile is the UNMIRRORED master — the source of truth for the
      // knot's own anatomy: the rail SWELL (g#e, a Q-curve — never a straight
      // rail), the wave-volute (g#v, an open-eye Q-curve), the KNOT (g#k —
      // the swell used TWICE plus the volute plus a weld diamond), and the
      // five-ray glint FAN (g#f). No mid-rail leaves survive: these four are
      // the WHOLE defs set.
      const tl = decodeURIComponent(urls[0] ?? "");
      const groupIds = [...tl.matchAll(/<g id='([a-zA-Z]+)'/g)].map((m) => m[1]);
      expect(
        groupIds,
        `the tl tile's defs must be EXACTLY {e, v, k, f} — a fifth group is a ` +
          `mid-rail leaf or scatter member creeping back in`
      ).toEqual(["e", "v", "k", "f"]);

      const swell = /<g id='e'>(.*?)<\/g>/.exec(tl)?.[1] ?? "";
      expect(
        swell,
        "the rail swell (g#e) must be a Q-curve, never a straight rail"
      ).toMatch(/Q/);
      expect(
        swell,
        "the rail swell must contribute no straight run line of its own"
      ).not.toMatch(/<(rect|line|polyline)\b/);

      const volute = /<g id='v'>(.*?)<\/g>/.exec(tl)?.[1] ?? "";
      expect(volute, "the wave-volute (g#v) must be a Q-curve open eye").toMatch(/Q/);

      const knot = /<g id='k'>(.*?)<\/g>/.exec(tl)?.[1] ?? "";
      expect(
        (knot.match(/<use href='#e'/g) ?? []).length,
        "the knot must use the rail swell TWICE — once on each rail axis"
      ).toBe(2);
      expect(knot, "the knot must carry the wave-volute").toContain("<use href='#v'/>");
      expect(
        knot,
        "the knot must seat a weld DIAMOND (a 4-point closed polygon) at the crossing"
      ).toMatch(/<path d='M[-\d. ]+L[-\d. ]+L[-\d. ]+L[-\d. ]+Z'\/>/);

      const fan = /<g id='f'>(.*?)<\/g>/.exec(tl)?.[1] ?? "";
      const fanRays = [...fan.matchAll(/<path/g)];
      expect(
        fanRays.length,
        "the glint fan (g#f) must carry exactly FIVE rays radiating into the panel"
      ).toBe(5);

      // TWO-TONE STRIKE: the metal is dimensional, not line-art. Each struck
      // member (knot, fan) paints at least three passes — shade, glint, body.
      for (const target of ["k", "f"]) {
        const passes = [...tl.matchAll(new RegExp(`<use href='#${target}'`, "g"))];
        expect(
          passes.length,
          `#${target} must paint at least three passes (shade/glint/body) — ` +
            `dimensional metal, never a flat line-art fill`
        ).toBeGreaterThanOrEqual(3);
      }

      // MIRROR FIRST, TONE AFTER, IN SCREEN SPACE: the tr tile mirrors the
      // UNFILLED master (g#K/g#F via one matrix each) and its PAINT passes
      // (the actual `<use>` fills) carry only `translate(…)` — never a
      // `matrix(…)` — so the bevel's light stays top-left on every corner
      // instead of rotating with the mirrored figure.
      const tr = decodeURIComponent(urls[1] ?? "");
      expect(tr, "tr must mirror the knot via one matrix into g#K").toMatch(
        /<g id='K'><use href='#k' transform='matrix\(/
      );
      expect(tr, "tr must mirror the fan via one matrix into g#F").toMatch(
        /<g id='F'><use href='#f' transform='matrix\(/
      );
      const paintPasses = tr.slice(tr.indexOf("</defs>"));
      expect(
        paintPasses,
        "tr's PAINT passes (outside <defs>) must never carry a matrix — mirroring " +
          "happens once, in the defs; toning happens after, in screen space"
      ).not.toMatch(/<use href='#[KF]'[^>]*matrix\(/);
    }
  });

  it("seats the ceremonial divider (the winged fleur) at the dialog head's centre", () => {
    for (const theme of ["dark", "light"] as const) {
      const start = indexCss.indexOf(`[data-theme="${theme}"]`);
      const block = indexCss.slice(start, indexCss.indexOf("\n}", start));
      const raw = /--seat-orn: url\("([^"]*)"\)/.exec(block)?.[1] ?? "";
      const svg = decodeURIComponent(raw);
      expect(svg, "the seat ornament must be drawn 1:1 at 260×24").toMatch(
        /width='260' height='24'/
      );
      // The backing diamond's glow: a radial gradient behind a blurred plumb
      // point, so the fleur reads as a baked lit facet, never a floating icon.
      expect(svg).toMatch(/<radialGradient id='gl'>/);
      expect(svg).toMatch(/<feGaussianBlur/);
      expect(svg).toMatch(/<circle cx='130' cy='13.5' r='13' fill='url\(#gl\)'\/>/);
      // The closure `g#s` combines the two rail-return scrolls (`g#u`, used
      // once per side) with the fleur's own chevron-and-plumb strokes.
      const closure = /<g id='s'>(.*?)<\/g>/.exec(svg)?.[1] ?? "";
      expect(
        (closure.match(/<use href='#u'/g) ?? []).length,
        "the closure must mirror the rail-return scroll once per side"
      ).toBe(2);
    }
    // Mounted on the dialog head's centre, at its authored size, and nowhere
    // consuming the hairline instead.
    const after = /\.modal-head::after \{([^}]*)\}/.exec(folio)?.[1] ?? "";
    expect(after, "the seat ornament must mount on .modal-head::after").toContain(
      "background: var(--seat-orn) center / 260px 24px no-repeat;"
    );
    expect(after).not.toContain("var(--hairline)");
  });

  it("mounts the corner knot as decor only — no border-image, no layout, no animation", () => {
    const rule =
      /\.page-head\.framed::before,\s*\.folio-panel\.gilt-frame::after,\s*\.modal::after \{([^}]*)\}/.exec(
        folio
      )?.[1] ?? "";
    expect(rule, "the corner-knot overlay rule must exist").not.toBe("");
    expect(rule).toContain("pointer-events: none;");
    // `border-image` mis-seats the centreline (its tiles shrink proportionally),
    // and a layout border on the pseudo would force a minimum box the size of the
    // tile. Neither is ever the mechanism.
    expect(folio).not.toMatch(/border-image[^;]*--frame-ornate/);
    expect(rule).not.toMatch(/border(-\w+)?\s*:/);
    expect(rule).not.toMatch(/(animation|transition)\s*:/);
    // The fitting rule: each 64px tile's rail centerline sits 20% in from the
    // tile's outer edge, so the paint box insets by -(0.2 × 64px + 0.5px) to
    // seat it exactly on the host's own border stroke.
    expect(rule).toMatch(/inset:\s*calc\(-1 \* \(0\.2 \* 64px \+ 0\.5px\)\);/);
    for (const host of [
      "\\.page-head\\.framed",
      "\\.folio-panel\\.gilt-frame",
      "\\.modal",
    ]) {
      const body = new RegExp(`${host} \\{([^}]*)\\}`).exec(folio)?.[1] ?? "";
      expect(
        /overflow[^;]*:\s*(hidden|clip)/.test(body),
        `A knot-bearing host must not clip: the corner ink is paint-only overflow.`
      ).toBe(false);
    }
  });

  it("has exactly ONE divider recipe, nodeless everywhere but the ONE earned ceremony seat", () => {
    // The one painted gradient, derived from the one ink parameter.
    expect(index).toMatch(
      /--hairline:\s*linear-gradient\(\s*90deg,\s*transparent,\s*var\(--hairline-ink\) 10%,\s*var\(--hairline-ink\) 90%,\s*transparent\s*\);/
    );
    // Every OTHER divider in the app consumes it rather than re-declaring a
    // gradient — the dialog head is the one named exception (below).
    for (const consumer of [
      /\.sec-rule \{[^}]*background: var\(--hairline\);/,
      /\.ch-foot::before \{[^}]*background: var\(--hairline\);/,
      /\.cmp-entry-head::after \{[^}]*background: var\(--hairline\);/,
      /\.colophon-hero-rule \{[^}]*background: var\(--hairline\);/,
    ]) {
      expect(consumer.test(folio), `MISSING hairline consumer: ${consumer}`).toBe(true);
    }
    // NODELESS — no OTHER divider anywhere carries a centre mark.
    expect(folio).not.toMatch(/\.sec-rule::(before|after)/);
    expect(folio).not.toMatch(/\.bm-rule::after/);
    expect(folio).not.toMatch(/\.colophon-hero-rule::after/);
    expect(folio).not.toMatch(/\.site-footer-diamond/);
    // The ONE exception: the dialog head's own bottom edge is the SAME
    // fading-both-tips shape as `.sec-rule` (a to-right gradient through the
    // border), and it alone carries the ceremonial seat ornament at its
    // centre — the one earned ceremony seat (DESIGN.md §5), not a return of
    // scatter ornament.
    const head = folio.match(/\.modal-head \{([^}]*)\}/)?.[1] ?? "";
    expect(head, "the dialog head's own border must fade at both tips").toMatch(
      /border-image:\s*linear-gradient\(\s*to right,\s*transparent,/
    );
    expect(folio).not.toMatch(
      /\.modal-head::after \{[^}]*background: var\(--hairline\);/
    );
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

  /**
   * …and the same law, DERIVED — because the check above reads deleted token NAMES,
   * and a bloom written as a literal is invisible to it. One was: the level-up
   * commit screen's 2.4rem number carried
   * `text-shadow: 0 0 18px color-mix(in oklab, var(--accent-glow) 38%, transparent)`
   * through the whole sweep that "removed all 22 glow terms", because it named none
   * of them. FLAT TYPE is not a list of retired tokens; it is a property of the
   * shipped stylesheet, so it is measured off the stylesheet.
   *
   * A zero-offset blurred `text-shadow` is the UNDERGLOW signature: a shadow with no
   * offset is not a ground under the ink, it is light coming out of it. `6px` is the
   * floor because the one legitimate ground, `--on-art-halo`, tops out at a 3px
   * blur — it is a tight backing for loose ink on the art, and it needs no exemption
   * here, which is the point. Custom properties are resolved first, so a glow cannot
   * hide one hop away in a token.
   *
   * WHAT IT CANNOT SEE:
   *   · A glow routed through `filter: drop-shadow(…)` — a different property with
   *     the same effect (`.magic-mark svg` uses exactly that form).
   *   · `box-shadow` emission. Fifty-three shipped recipes light an OBJECT that way
   *     (gilt CTAs, the lit economy sockets, focus wells, the caster statcard), which
   *     is a far larger question than FLAT TYPE and needs its own wave and its own
   *     owner ruling — widening this probe to catch it would just turn it red.
   */
  it("emits NO light: derived — no literal underglow on any type", () => {
    /** Every custom-property value in either file, so a glow cannot hide in a token. */
    const tokens = new Map<string, string[]>();
    for (const css of [index, folio]) {
      for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) {
        const name = m[1] ?? "";
        if (!tokens.has(name)) tokens.set(name, []);
        tokens.get(name)?.push((m[2] ?? "").trim());
      }
    }
    expect(
      tokens.size,
      "no custom properties found — did the token files move?"
    ).toBeGreaterThan(50);
    const expand = (value: string, depth = 0): string =>
      depth > 4
        ? value
        : value.replace(/var\((--[\w-]+)(?:,[^()]*)?\)/g, (all, n: string) =>
            (tokens.get(n) ?? [all]).map((v) => expand(v, depth + 1)).join(" , ")
          );
    /** Split a shadow value into LAYERS on top-level commas (a `color-mix()` is one). */
    const layersOf = (value: string): string[] => {
      const out: string[] = [];
      let depth = 0;
      let buf = "";
      for (const ch of value) {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        if (ch === "," && depth === 0) {
          out.push(buf);
          buf = "";
        } else buf += ch;
      }
      out.push(buf);
      return out;
    };
    /**
     * The ONE exemption, allowlisted by SELECTOR and never by value: `.magic-mark`
     * is the 14px ✦ magic-source MARKER — a glyph standing in for an icon (its `svg`
     * twin kindles identically via `drop-shadow`), not a title, a label or a number.
     */
    const EXEMPT = /\.magic-mark/;
    /** `0 0 <blur>` with unitless zeroes, the form the stylesheet actually writes. */
    const UNDERGLOW = /(?:^|\s)(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+([\d.]+)px/;

    const offenders: string[] = [];
    let scanned = 0;
    for (const [name, css] of [
      ["index.css", index],
      ["folio.css", folio],
    ] as const) {
      for (const rule of css.replace(/\s+/g, " ").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const sel = (rule[1] ?? "").trim();
        for (const decl of (rule[2] ?? "").matchAll(
          /(?:^|;)\s*text-shadow\s*:\s*([^;]+)/g
        )) {
          scanned++;
          if (EXEMPT.test(sel)) continue;
          for (const layer of layersOf(expand(decl[1] ?? ""))) {
            const g = UNDERGLOW.exec(layer.trim());
            if (!g) continue;
            if (Number(g[1]) !== 0 || Number(g[2]) !== 0 || Number(g[3]) < 6) continue;
            offenders.push(`${name}  ${sel.slice(0, 70)} → ${layer.trim().slice(0, 60)}`);
          }
        }
      }
    }
    expect(
      scanned,
      "no `text-shadow` declarations found at all — this probe has stopped reading " +
        "the stylesheet, and an empty scan is a green light that means nothing."
    ).toBeGreaterThan(4);
    expect(
      offenders,
      `A zero-offset blurred \`text-shadow\` is an UNDERGLOW, and type is FLAT ` +
        `(DESIGN.md §5): the chrome is a lit MATERIAL, so light on it means depth, ` +
        `never emphasis. Carry the ceremony with scale, the display face and the ` +
        `struck ornament around the type:\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
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
