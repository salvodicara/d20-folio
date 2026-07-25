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

      // ── THE CORNER IS A THREE-MEMBER UNIT, MEASURED OFF THE REFERENCE ─────
      // What shipped first was ONE member — a symmetric fan of seven near-equal
      // rays — which at 8× read as a whisk rather than as astral drafting. The
      // reference's corner (`crop-lvl-panel-topleft.png`) is three: crossed BLADES
      // with crescent-hook terminals overshooting the vertex, a PAIR of long
      // quarter-arcs, and RAYS of markedly different lengths. Both facts below are
      // DERIVED from the tile's own path data, not restated as a shape count.
      const master = /<g id="a"[^>]*>([\s\S]*?)<\/g>/.exec(svg)?.[1] ?? "";
      const paths = [...master.matchAll(/<path d="([^"]*)"\/>/g)].map((m) => m[1] ?? "");
      expect(paths.length, "the corner master must hold the figure").toBeGreaterThan(6);

      // A RAY is the straight tapering sliver `M x y L x y L x y Z`; an ARC / BLADE /
      // HOOK is a closed lens between two quadratics. Both kinds must be present —
      // a tile of only rays is the whisk, a tile of only curves has no fan.
      const rays = paths.filter((d) => !d.includes("Q"));
      const curved = paths.filter((d) => d.includes("Q"));
      expect(
        rays.length,
        "the corner has no RAYS left — the fan is one of its three members"
      ).toBeGreaterThanOrEqual(3);
      expect(
        curved.length,
        "the corner is a fan of rays and nothing else. The reference's corner also " +
          "carries a PAIR of long quarter-arcs and crescent-hook terminals — the " +
          "members that give it scale and make it read as drafting, not a whisk."
      ).toBeGreaterThanOrEqual(4);

      // …and the rays' lengths are MARKEDLY different. Seven near-equal spokes is
      // the exact figure this replaced, so the spread is the assertion.
      const lengths = rays
        .map((d) => {
          const n = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [
            Number(m[1]),
            Number(m[2]),
          ]);
          if (n.length < 2) return 0;
          const [ox, oy] = n[0] as [number, number];
          const [tx, ty] = n[1] as [number, number];
          return Math.hypot(tx - ox, ty - oy);
        })
        .filter((v) => v > 0)
        .sort((x, y) => x - y);
      const spread = (lengths.at(-1) ?? 0) / (lengths[0] ?? 1);
      expect(
        spread,
        `The corner's rays are near-equal (longest / shortest = ${spread.toFixed(2)}). ` +
          `The reference's are not: one runs nearly the panel's width and the shortest ` +
          `a third of it, and that unevenness is what stops the fan reading as a whisk.`
      ).toBeGreaterThan(1.9);
    }
  });

  /**
   * THE CARTOUCHE'S CENTRE IS THE BRIGHTEST POINT ON THE RULE.
   *
   * The reference's mid-edge event (`crop-lvl-winged-divider.png`) is a LUMINOUS
   * V-fleur — the brightest thing on its rule by a wide margin — with the rail
   * stopping and returning in scrolls either side of it. Ours shipped inverted: two
   * dim leaf-slivers with a centre chevron DIMMER than its own wings, so the eye
   * landed on the wings and the figure had no event at all.
   *
   * The check composites the tile's OWN fills — body over shade, then the glint at
   * its declared opacity — and compares the two members' relative luminance. It
   * cannot see whether the figure is beautiful; it can see which member the eye
   * lands on, which is the thing that was wrong.
   */
  it("strikes the run cartouche's CENTRE brighter than its wings", () => {
    for (const theme of ["dark", "light"] as const) {
      const start = indexCss.indexOf(`[data-theme="${theme}"]`);
      const block = indexCss.slice(start, indexCss.indexOf("\n}", start));
      const raw =
        /--mark-run: url\("data:image\/svg\+xml,([^"]*)"\)/.exec(block)?.[1] ?? "";
      const svg = decodeURIComponent(raw);
      const lum = (hex: string): number => {
        const n = parseInt(hex.slice(1), 16);
        const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
          const c = v / 255;
          return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * (ch[0] ?? 0) + 0.7152 * (ch[1] ?? 0) + 0.0722 * (ch[2] ?? 0);
      };
      /** The composite a `use` group paints: its fill, veiled by the glint above it. */
      const composite = (fill: string, glint: string, alpha: number): number =>
        lum(fill) * (1 - alpha) + lum(glint) * alpha;
      // Every `<g fill="#…" …><use href="#X"/></g>` pass, in paint order.
      const passes = [
        ...svg.matchAll(
          /<g([^>]*?)fill="(#[0-9a-f]{6})"([^>]*?)><use href="#([wgcf])"\/><\/g>/g
        ),
      ].map((m) => {
        const attrs = `${m[1] ?? ""}${m[3] ?? ""}`;
        return {
          fill: m[2] ?? "",
          target: m[4] ?? "",
          alpha: Number(/opacity="([\d.]+)"/.exec(attrs)?.[1] ?? 1),
          // The SHADE and the GLINT are the translated passes; the BODY is the one
          // struck in place. Reading "the first opaque pass" picks the shade and
          // makes the whole comparison a comparison of two blacks — which is how the
          // first draft of this check passed a mutation that brightened the wings.
          shifted: /transform="translate\(/.test(attrs),
        };
      });
      const body = (t: string) =>
        passes.find((p) => p.target === t && p.alpha === 1 && !p.shifted);
      const glint = (t: string) => passes.find((p) => p.target === t && p.alpha < 1);
      const wing = body("g");
      const wingGlint = glint("g");
      const fleur = body("f");
      const fleurGlint = glint("f");
      expect(
        Boolean(wing && fleur && wingGlint && fleurGlint),
        `${theme}: the run tile must strike its WINGS and its CENTRE as separate ` +
          `passes — that is the only way one can be brighter than the other.`
      ).toBe(true);
      const wingL = composite(
        wing?.fill ?? "#000",
        wingGlint?.fill ?? "#000",
        wingGlint?.alpha ?? 0
      );
      const fleurL = composite(
        fleur?.fill ?? "#000",
        fleurGlint?.fill ?? "#000",
        fleurGlint?.alpha ?? 0
      );
      expect(
        fleurL / Math.max(wingL, 0.0001),
        `${theme}: the cartouche's CENTRE (${fleurL.toFixed(3)}) is not clearly ` +
          `brighter than its wings (${wingL.toFixed(3)}). The reference's mid-edge ` +
          `event is the brightest thing on its rule; ours read as two slivers with a ` +
          `dimmer chevron between them, so the figure had no event at all.`
      ).toBeGreaterThan(1.6);
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
