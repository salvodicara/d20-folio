import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const indexCss = readFileSync(resolve(here, "../../src/index.css"), "utf8");
const folioCss = readFileSync(resolve(here, "../../src/styles/folio.css"), "utf8");

/**
 * The ornament vocabulary (BG3 identity T5 — DESIGN.md §5 "The ornament
 * vocabulary"). Pins the surviving grammar's load-bearing facts so a refactor
 * can't silently drop or re-add a piece:
 *   - selection is marked by the silver-over-bronze `--frame-selected` gradient
 *     (both themes), NOT by decorative diamonds;
 *   - the ONE divider fades at both tips and is NODELESS — the section rubric's
 *     leading `.sec-diamond` is the divider's marker;
 *   - the decorative diamonds trimmed in the ornament simplification stay gone
 *     (frame-corner pieces, selection/commit crest nodes, divider-centre node,
 *     scrollbar finials);
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

  it("strikes the reliquary hero frame + engraved titling in BOTH themes", () => {
    // The Gilded Reliquary chrome is per-theme (dark strikes gilt, light strikes
    // burnished bronze), so each token MUST be defined twice — once in :root, once
    // in the [data-theme="light"] scope. `css-token-defined.guard` only proves a
    // token is defined SOMEWHERE, so a dropped light copy would slip past it and
    // silently paint the light theme with no frame / flat title. This pins the pair.
    expect(indexCss.match(/--frame-ornate:/g)?.length).toBe(2);
    expect(indexCss.match(/--engrave-title:/g)?.length).toBe(2);
    // The wave-2 TWO-TONE strike (F2): each theme's SVG tones the goldwork AFTER
    // the four-corner mirroring — the unfilled geometry closure (id='f') is struck
    // by ≥2 offset tone layers (shade/understroke + top glint), so the bevel light
    // stays top-left on every corner (toning inside the mirrored unit would flip
    // it upside-down on the bottom corners) — and the gem is a true facet group
    // (id='g') placed per-corner UNFLIPPED via use x/y. 2 per theme = 4 total.
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

  it("seats the goldwork ON the frame like a bookbinding fitting (owner, 2026-07-17)", () => {
    // The SVG's arm/gem centerline lies at 20% of the corner tile; the
    // border-image OUTSET of `20% of the 48px tile + 0.5px` puts the arms on the
    // host's 1px border stroke and the gem's center on the corner vertex — the
    // regression this pins is the ornament drifting back INSIDE the panel.
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

  it("keeps the ONE divider anatomy: both tips fade, NODELESS (leading .sec-diamond marks it)", () => {
    const rule = folioCss.slice(
      folioCss.indexOf(".sec-rule {"),
      folioCss.indexOf('[data-theme="light"] .sec-rule')
    );
    expect(rule).toContain("--rule-c:");
    expect(rule).toMatch(
      /transparent,\s*var\(--rule-c\) 14%,\s*var\(--rule-c\) 86%,\s*transparent/
    );
    // No centre node on the rule anymore.
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
