import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const indexCss = readFileSync(resolve(here, "../../src/index.css"), "utf8");
const folioCss = readFileSync(resolve(here, "../../src/styles/folio.css"), "utf8");

/**
 * The ornament vocabulary (BG3 identity T5 — DESIGN.md §5 "The ornament
 * vocabulary"; the COMPASS-WEB FRAME redo, owner-mandated 2026-07-24). Pins the
 * grammar's load-bearing facts so a refactor can't silently drop or re-add a
 * piece:
 *   - the hero frames are bound by the per-theme Compass-Web `--frame-ornate`
 *     SVG: crossed calligraphic blades overshooting the vertex, a faceted
 *     rivet diamond on the crossing, a slim floating crescent outside the
 *     corner, a whisper compass web (quarter-arc pair + fading ray fan) and a
 *     faint inner rail dissolving through the edge slices as a taper wedge;
 *   - the STRUCK members (blades/crescent/dart/rivet) are mirrored UNFILLED
 *     first and toned AFTER (the two-tone strike); the WEB rides a separate
 *     single-fill whisper closure with per-member opacities (the weight
 *     ladder: vertex mass → arc hairline → ray whisper);
 *   - dialog heads seat the per-theme `--seat-orn` winged-fleur divider
 *     (outward-tapering rails, scroll hooks, a luminous descending V-fleur),
 *     whose backing diamond bakes the theme's own `--bg-surface-2`
 *     (drift-guarded);
 *   - the LIGHT theme's ornament ink is GOLD, not bronze (owner, 2026-07-24);
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

  it("strikes the Compass-Web frame + engraved titling in BOTH themes", () => {
    // The frame chrome is per-theme (dark strikes gilt, light letterpresses
    // GOLD), so each token MUST be defined twice — once in :root, once in the
    // [data-theme="light"] scope. `css-token-defined.guard` only proves a token
    // is defined SOMEWHERE, so a dropped light copy would slip past it and
    // silently paint the light theme with no frame / flat title.
    expect(indexCss.match(/--frame-ornate:/g)?.length).toBe(2);
    expect(indexCss.match(/--seat-orn:/g)?.length).toBe(2);
    expect(indexCss.match(/--engrave-title:/g)?.length).toBe(2);
    // The Compass-Web corner anatomy (both themes carry the same geometry):
    // the calligraphic blade swelling along the rail toward the vertex…
    expect(indexCss.match(/M48 12\.3Q28 11\.85 17\.5 11\.95/g)?.length).toBe(2);
    // …the slim floating crescent just outside the corner on the diagonal…
    expect(
      indexCss.match(/M4\.4 8\.5A3 3 0 1 1 8\.5 4\.4A3\.95 3\.95 0 0 0 4\.4 8\.5Z/g)
        ?.length
    ).toBe(2);
    // …the rivet diamond seating the blade crossing on the vertex…
    expect(
      indexCss.match(/M12\.8 9\.7L15\.9 12\.8L12\.8 15\.9L9\.7 12\.8Z/g)?.length
    ).toBe(2);
    // …and the inner rail's edge-slice taper wedge (straight lines stretch
    // losslessly through border-image edges; curves would distort).
    expect(indexCss.match(/L156 17\.3/g)?.length).toBe(2);
    // THE WEIGHT LADDER: the struck mass closure (id='m4') is toned by ≥2
    // offset tone layers (shade + glint) per theme so the bevel light stays
    // top-left on every corner (toning inside the mirrored unit would flip it
    // upside-down on the bottom corners) — 2 per theme = 4 total…
    expect(
      indexCss.match(
        /use href='%23m4' fill='%23[0-9a-f]+' opacity='[^']+' transform='translate\(/g
      )?.length
    ).toBe(4);
    // …while the compass WEB rides a separate single-fill whisper closure
    // (id='w4', per-member opacities — no strike): the quarter-arc pair at
    // .55/.35 and the four rays at .34, per theme.
    expect(indexCss.match(/use href='%23w4' fill='%23[0-9a-f]+'\/>/g)?.length).toBe(2);
    expect(indexCss.match(/opacity='\.55' d='M39\.06 15\.56A26\.4/g)?.length).toBe(2);
    expect(indexCss.match(/opacity='\.34'/g)?.length).toBe(8);
    // The rivet facet group is 4-fold symmetric and placed per-corner
    // UNFLIPPED via use x/y (translate placement only works for vertex-centered
    // members).
    expect(indexCss.match(/use href='%23g' x='294\.4' y='294\.4'/g)?.length).toBe(2);
    // ...and both are actually wired (border-image on the hero overlay + the
    // engraved title text-shadow), so a defined-but-unused token can't fake it.
    expect(folioCss).toMatch(/border-image:\s*var\(--frame-ornate\)/);
    expect(folioCss).toMatch(/text-shadow:\s*var\(--engrave-title\)/);
  });

  it("keeps the light theme's ornament ink GOLD, never bronze (owner, 2026-07-24)", () => {
    // The light `--frame-ornate` body is the deep antique-gold #94741f — a
    // true-gold hue letterpressed into the vellum. The superseded bronze-700
    // (#7a5f24) body must not return to either ornament token's light strike.
    const lightBlock = indexCss.slice(indexCss.indexOf('[data-theme="light"]'));
    const lightFrame = lightBlock.match(/--frame-ornate: url\("([^"]+)"\)/)?.[1];
    const lightSeat = lightBlock.match(/--seat-orn: url\("([^"]+)"\)/)?.[1];
    expect(lightFrame).toBeDefined();
    expect(lightSeat).toBeDefined();
    expect(lightFrame).toContain("fill='%2394741f'");
    expect(lightSeat).toContain("fill='%2394741f'");
    expect(lightFrame).not.toContain("fill='%237a5f24'");
    expect(lightSeat).not.toContain("fill='%237a5f24'");
  });

  it("seats the winged-fleur divider on dialog heads, surface-baked per theme", () => {
    // The divider straddles the modal head's 1px seat rule (24px tall, the
    // SVG's rule line at y=12 on the border) — decorative only.
    expect(folioCss).toMatch(
      /\.modal-head::after\s*\{[^}]*background:\s*var\(--seat-orn\) center \/ 260px 24px no-repeat/
    );
    const themes = [...indexCss.matchAll(/--seat-orn:\s*url\("([^"]+)"\)/g)]
      .map((m) => m[1])
      .filter((u): u is string => u !== undefined);
    expect(themes).toHaveLength(2);
    // The theme's OWN --bg-surface-2 bakes the fleur's backing diamond, so the
    // seat rule passes BEHIND the fleur invisibly (both faces of the seat are
    // surface-2). Drift guard: the baked hex must equal the theme token.
    const surface2 = [...indexCss.matchAll(/--bg-surface-2:\s*(#[0-9a-fA-F]{6})/g)]
      .map((m) => m[1])
      .filter((h): h is string => h !== undefined)
      .map((h) => h.slice(1).toLowerCase());
    expect(surface2).toHaveLength(2);
    themes.forEach((uri, i) => {
      expect(uri, `seat-orn theme ${i} bakes its surface-2 backing`).toContain(
        `fill='%23${surface2[i]}'`
      );
      // The fleur anatomy: nested chevron wings over the descending plumb
      // point (which hangs BELOW the rule), seated in a baked radial glow.
      expect(uri).toContain("M123 7.6L130 10.7L137 7.6");
      expect(uri).toContain("M130 13L132.2 16.4L130 22.4L127.8 16.4Z");
      expect(uri).toContain("radialGradient");
      expect(uri).toContain("circle cx='130' cy='14' r='11' fill='url(%23gl)'");
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
    // The SVG's rail centerline lies at 20% of the 64px corner tile; the
    // border-image OUTSET of `20% of 64px + 0.5px` puts the blades on the
    // host's 1px border stroke and the rivet's center on the corner vertex —
    // the regression this pins is the ornament drifting back INSIDE the panel.
    expect(folioCss).toMatch(
      /border-image:\s*var\(--frame-ornate\) 20% \/ 64px \/ calc\(64px \* 0\.2 \+ 0\.5px\)/
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
