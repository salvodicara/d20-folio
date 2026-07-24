import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const indexCss = readFileSync(resolve(here, "../../src/index.css"), "utf8");
const folioCss = readFileSync(resolve(here, "../../src/styles/folio.css"), "utf8");

/**
 * The ornament vocabulary (BG3 identity T5 — DESIGN.md §5 "The ornament
 * vocabulary"; the STARBOUND FRAME rework, owner-mandated 2026-07-23). Pins the
 * grammar's load-bearing facts so a refactor can't silently drop or re-add a
 * piece:
 *   - the hero frames are bound by the per-theme Starbound `--frame-ornate`
 *     SVG: a four-point star in a hairline diamond frame per corner, a twin
 *     inner rail continuing through the edge slices as taper wedges, mirrored
 *     UNFILLED first and toned AFTER (the two-tone strike);
 *   - dialog heads seat the per-theme `--seat-orn` p25 divider, whose backing
 *     diamond bakes the theme's own `--bg-surface-2` (drift-guarded);
 *   - selection is marked by the silver-over-bronze `--frame-selected` gradient
 *     (both themes), NOT by decorative diamonds;
 *   - SECTION dividers stay tip-fading and NODELESS — the ceremonial seat is
 *     the one centre-node divider, on dialog heads only;
 *   - the decorative diamonds trimmed in the ornament simplification stay gone
 *     (selection/commit crest nodes, scrollbar finials);
 *   - the jewelry-thin scrollbar keeps its Firefox fence (Chromium ≥121 lets an
 *     unfenced `scrollbar-width` disable every ::-webkit-scrollbar rule).
 */
describe("ornament vocabulary (T5)", () => {
  it("defines the selection metals + frame gradient in both themes", () => {
    // Dark strike + light strike of the metal pair.
    expect(indexCss.match(/--metal-silver:/g)?.length).toBe(2);
    expect(indexCss.match(/--metal-bronze:/g)?.length).toBe(2);
    // The silver→bronze→silver frame gradient derives from the metals, so ONE
    // definition serves both themes.
    expect(indexCss).toMatch(
      /--frame-selected:\s*linear-gradient\(\s*180deg,\s*var\(--metal-silver\),\s*var\(--metal-bronze\) 50%,\s*var\(--metal-silver\)\s*\)/
    );
  });

  it("strikes the Starbound frame + engraved titling in BOTH themes", () => {
    // The frame chrome is per-theme (dark strikes gilt, light letterpresses
    // bronze), so each token MUST be defined twice — once in :root, once in the
    // [data-theme="light"] scope. `css-token-defined.guard` only proves a token
    // is defined SOMEWHERE, so a dropped light copy would slip past it and
    // silently paint the light theme with no frame / flat title.
    expect(indexCss.match(/--frame-ornate:/g)?.length).toBe(2);
    expect(indexCss.match(/--seat-orn:/g)?.length).toBe(2);
    expect(indexCss.match(/--engrave-title:/g)?.length).toBe(2);
    // The Starbound corner anatomy (both themes carry the same geometry):
    // the hairline diamond frame around the star…
    expect(
      indexCss.match(
        /fill-rule='evenodd' d='M40 3 77 40 40 77 3 40ZM40 8 72 40 40 72 8 40Z'/g
      )?.length
    ).toBe(2);
    // …the four-point star silhouette…
    expect(
      indexCss.match(
        /M40 12 44\.2 35\.8 68 40 44\.2 44\.2 40 68 35\.8 44\.2 12 40 35\.8 35\.8Z/g
      )?.length
    ).toBe(2);
    // …and the twin rule's edge-slice taper wedge (straight lines stretch
    // losslessly through border-image edges; arrowheads would distort).
    expect(indexCss.match(/M200 50 252 51\.5 200 53Z/g)?.length).toBe(2);
    // TWO-TONE strike: each theme's SVG tones the goldwork AFTER the
    // four-corner mirroring — the unfilled geometry closure (id='f') is struck
    // by ≥2 offset tone layers (shade/understroke + top glint), so the bevel
    // light stays top-left on every corner (toning inside the mirrored unit
    // would flip it upside-down on the bottom corners) — and the star is a true
    // facet group (id='g') placed per-corner UNFLIPPED via use x/y. 2 per
    // theme = 4 total.
    expect(
      indexCss.match(
        /use href='%23f' fill='%23[0-9a-f]+' opacity='[^']+' transform='translate\(/g
      )?.length
    ).toBe(4);
    expect(indexCss.match(/use href='%23g' x='420' y='420'/g)?.length).toBe(2);
    // ...and both are actually wired (border-image on the hero overlay + the
    // engraved title text-shadow), so a defined-but-unused token can't fake it.
    expect(folioCss).toMatch(/border-image:\s*var\(--frame-ornate\)/);
    expect(folioCss).toMatch(/text-shadow:\s*var\(--engrave-title\)/);
  });

  it("seats the ceremonial seat ornament on dialog heads, surface-baked per theme", () => {
    // The p25 divider straddles the modal head's 1px seat rule (17px tall,
    // centered on the border line) — decorative only.
    expect(folioCss).toMatch(
      /\.modal-head::after\s*\{[^}]*background:\s*var\(--seat-orn\) center \/ 168px 17px no-repeat/
    );
    // Its backing diamond is baked in the theme's OWN --bg-surface-2, so the
    // seat rule passes BEHIND the star invisibly (both faces of the seat are
    // surface-2). Drift guard: the baked hex must equal the theme token.
    const themes = [...indexCss.matchAll(/--seat-orn:\s*url\("([^"]+)"\)/g)].map(
      (m) => m[1]
    );
    expect(themes).toHaveLength(2);
    const surface2 = [...indexCss.matchAll(/--bg-surface-2:\s*(#[0-9a-fA-F]{6})/g)].map(
      (m) => m[1]?.slice(1).toLowerCase()
    );
    expect(surface2).toHaveLength(2);
    themes.forEach((uri, i) => {
      expect(uri, `seat-orn theme ${i} bakes its surface-2 backing`).toContain(
        `fill='%23${surface2[i]}'`
      );
      // Same mirror-then-tone strike as the corners: the closure (id='s') is
      // struck by 2 offset tone layers per theme.
      expect(
        uri.match(
          /use href='%23s' fill='%23[0-9a-f]+' opacity='[^']+' transform='translate\(/g
        )?.length
      ).toBe(2);
    });
  });

  it("seats the goldwork ON the frame like a bookbinding fitting (owner, 2026-07-17)", () => {
    // The SVG's rail/star centerline lies at 20% of the corner tile; the
    // border-image OUTSET of `20% of the 48px tile + 0.5px` puts the rails on
    // the host's 1px border stroke and the star's center on the corner vertex —
    // the regression this pins is the ornament drifting back INSIDE the panel.
    expect(folioCss).toMatch(
      /border-image:\s*var\(--frame-ornate\) 40% \/ 48px \/ calc\(48px \* 0\.2 \+ 0\.5px\)/
    );
    // Outset ink is clipped by a host's child-paint clipping, so the hero hosts
    // must NOT overflow-hide: `.modal` scroll-clips on `.modal-body`, and the
    // masthead crest self-clips via mask-size on an `inset: 0` element. Each
    // slice anchor must actually exist — a renamed selector would make indexOf
    // return -1 and the slice a vacuously-passing tail fragment.
    const modalStart = folioCss.indexOf("\n.modal {");
    const modalEnd = folioCss.indexOf(".modal.sm");
    expect(modalStart).toBeGreaterThan(-1);
    expect(modalEnd).toBeGreaterThan(modalStart);
    expect(folioCss.slice(modalStart, modalEnd)).not.toContain("overflow: hidden");
    const crestHostStart = folioCss.indexOf(".page-head.framed.has-crest {");
    const crestHostEnd = folioCss.indexOf(".page-head-crest");
    expect(crestHostStart).toBeGreaterThan(-1);
    expect(crestHostEnd).toBeGreaterThan(crestHostStart);
    expect(folioCss.slice(crestHostStart, crestHostEnd)).not.toContain(
      "overflow: hidden"
    );
    expect(folioCss).toMatch(/\.page-head-crest\s*\{[^}]*inset: 0/);
  });

  it("marks selection with the frame gradient (altar + chosen plaque), not diamonds", () => {
    // The chosen plaque + the altar wear the silver-over-bronze frame.
    expect(folioCss).toMatch(/var\(--frame-selected\) border-box/);
    // The trimmed decorative diamonds are GONE — no crest nodes, no masked
    // corner pieces, no re-tint ink tokens.
    expect(folioCss).not.toMatch(/--orn-corner/);
    expect(folioCss).not.toMatch(/--orn-corners/);
    expect(indexCss).not.toMatch(/--orn-ink/);
    expect(folioCss).not.toMatch(
      /\.wiz-hero:not\(\.empty\)::before|\.cmp-tab\[aria-selected="true"\]::before/
    );
    expect(folioCss).not.toMatch(
      /\.wiz-pager-btn\.commit \.wiz-pager-seal\.gold::before/
    );
  });

  it("keeps the SECTION divider anatomy: both tips fade, NODELESS (leading .sec-diamond marks it)", () => {
    const rule = folioCss.slice(
      folioCss.indexOf(".sec-rule {"),
      folioCss.indexOf('[data-theme="light"] .sec-rule')
    );
    expect(rule).toContain("--rule-c:");
    expect(rule).toMatch(
      /transparent,\s*var\(--rule-c\) 14%,\s*var\(--rule-c\) 86%,\s*transparent/
    );
    // No centre node on SECTION rules — the ceremonial seat ornament is the one
    // centre-node divider, and it lives on dialog heads only.
    expect(folioCss).not.toMatch(/\.sec-rule::after/);
    // The section rubric's leading diamond is the divider's marker.
    expect(folioCss).toMatch(/\.sec-diamond\s*\{/);
    // Variants only re-tint the parameter — never re-declare the gradient.
    expect(folioCss).toMatch(
      /\.sec-head\[data-econ\] \.sec-rule\s*\{\s*--rule-c:[^{}]*\}/
    );
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
