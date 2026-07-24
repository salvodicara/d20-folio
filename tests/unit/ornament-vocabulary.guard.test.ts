import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const indexCss = readFileSync(resolve(here, "../../src/index.css"), "utf8");
const folioCss = readFileSync(resolve(here, "../../src/styles/folio.css"), "utf8");

/**
 * The ornament vocabulary (BG3 identity T5 — DESIGN.md §5 "The ornament
 * vocabulary"; settled 2026-07-24 on the owner's STYLE-A pick: "Do style A,
 * but you must ALIGN. And make it more wow — without breaking things").
 * Pins the grammar's load-bearing facts so a refactor can't silently drop or
 * re-add a piece:
 *   - the hero frames are bound by the per-theme `--frame-ornate` token —
 *     FOUR fixed-size per-corner SVG background layers (tl/tr/bl/br, 64px
 *     tiles), NEVER border-image and NEVER a layout border on the pseudo:
 *     the old `border: 64px solid transparent` carrier forced a 128px
 *     minimum pseudo box, so hosts shorter than that dropped `bottom`
 *     (over-constrained abspos) and the bottom corners hung 25–32px below
 *     the plate — the owner's "everything is translated downward" rejection;
 *     border-image's proportional tile-shrink also mis-seats the centerline
 *     on short hosts. Fixed-size corner layers register 0px at every host
 *     size by construction;
 *   - THE KNOT (style A, the faithful transcription of the owner's BG3
 *     spellbook-reference corner): rail swells crossing the vertex in a fine
 *     whisker overshoot, ONE wave-volute comma-curl rising outward on the
 *     diagonal over an OPEN eye, a small weld diamond seating the crossing,
 *     a two-tone-struck five-ray glint fan, and a sickle leaf pair threaded
 *     ON each rail (leaf ink within 59px of the tile edge so opposing
 *     corners keep air on the ~98px cockpit band) — and NOTHING else;
 *   - THE ONE-LINE LAW: the ornament contributes no run lines — the host's
 *     own 1px border is THE frame line and the three framed registers stay
 *     SQUARE so the knot seats on a true crossing; nothing floats, ever;
 *   - the STRUCK members are mirrored per-corner UNFILLED first and toned
 *     AFTER in screen space (the two-tone strike), so the bevel light stays
 *     top-left on all four corners;
 *   - dialog heads seat the per-theme `--seat-orn` winged divider in the
 *     SAME style-A language: rails tapering outward into open under-curls,
 *     inner open-eye S-hook returns, a luminous chevron pair over a
 *     descending faceted plumb (glow raised per the "more wow" verdict);
 *     its backing diamond bakes the theme's own `--bg-surface-2`
 *     (drift-guarded), hugs the fleur, and blurs its edge; the gen9
 *     floating under-dot stays DEAD;
 *   - the LIGHT theme's ornament ink is GOLD, not bronze (owner, 2026-07-24);
 *   - selection is marked by the silver-over-bronze `--frame-selected`
 *     gradient (both themes), NOT by decorative diamonds;
 *   - SECTION dividers stay tip-fading and NODELESS — the ceremonial seat is
 *     the one centre-node divider, on dialog heads only;
 *   - the decorative diamonds trimmed in the ornament simplification stay
 *     gone (selection/commit crest nodes, scrollbar finials);
 *   - the jewelry-thin scrollbar keeps its Firefox fence (Chromium ≥121 lets
 *     an unfenced `scrollbar-width` disable every ::-webkit-scrollbar rule).
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

  it("strikes the style-A knot + engraved titling in BOTH themes", () => {
    // The frame chrome is per-theme (dark strikes gilt, light letterpresses
    // GOLD), so each token MUST be defined twice — once in :root, once in the
    // [data-theme="light"] scope. `css-token-defined.guard` only proves a token
    // is defined SOMEWHERE, so a dropped light copy would slip past it and
    // silently paint the light theme with no frame / flat title.
    expect(indexCss.match(/--frame-ornate:/g)?.length).toBe(2);
    expect(indexCss.match(/--seat-orn:/g)?.length).toBe(2);
    expect(indexCss.match(/--engrave-title:/g)?.length).toBe(2);
    // The A anatomy, once per corner SVG × 4 corners × 2 themes = 8 each:
    // the rail swell…
    expect(indexCss.match(/M30 12\.3Q20 12\.18 14\.5 12\.22/g)?.length).toBe(8);
    // …crossing the vertex in the fine whisker overshoot (tip ON the rail
    // axis — attached, never floating)…
    expect(indexCss.match(/Q11\.4 12\.25 9\.8 12\.74/g)?.length).toBe(8);
    // …the ONE wave-volute comma-curl (tail welded to the knot, crown
    // breaking over, beak curling back over the OPEN eye)…
    expect(
      indexCss.match(/M11\.41 12\.18Q7\.53 10\.63 6\.21 7\.76Q5\.67 5\.2 7\.69 4\.04/g)
        ?.length
    ).toBe(8);
    // …the small weld diamond seating the crossing…
    expect(
      indexCss.match(/M12\.8 10\.9L14\.7 12\.8L12\.8 14\.7L10\.9 12\.8Z/g)?.length
    ).toBe(8);
    // …the sickle leaf PAIR threaded ON each rail (the reference's paired
    // second leaf; leaf ink ends ≤59.2px in-tile — the cockpit-band air cap)…
    expect(indexCss.match(/M42 12\.8Q46\.5 11\.5 54 12\.58/g)?.length).toBe(8);
    expect(indexCss.match(/M55\.5 12\.8Q57\.5 12\.12 59\.2 12\.6/g)?.length).toBe(8);
    // …and the five-ray glint fan as a real group of 5 path elements.
    expect(indexCss.match(/<g id='f'>(?:<path d='[^']*'\/>){5}<\/g>/g)?.length).toBe(8);
    // Mirror-then-tone (the two-tone strike): each corner mirrors the
    // UNFILLED geometry first (tl carries no mirror; tr/bl/br mirror their
    // knot AND fan groups — 2 uses per corner × 2 themes = 4 each)…
    expect(indexCss.match(/matrix\(-1 0 0 1 64 0\)/g)?.length).toBe(4);
    expect(indexCss.match(/matrix\(1 0 0 -1 0 64\)/g)?.length).toBe(4);
    expect(indexCss.match(/matrix\(-1 0 0 -1 64 64\)/g)?.length).toBe(4);
    // …then tones in SCREEN space (knot shade offset below-right + fan shade,
    // once per corner = 8 each), keeping the bevel light top-left everywhere.
    expect(indexCss.match(/transform='translate\(1 1\.4\)'/g)?.length).toBe(8);
    expect(indexCss.match(/transform='translate\(\.6 \.85\)'/g)?.length).toBe(8);
    // The engraved title is wired (text-shadow), so a defined-but-unused
    // token can't fake it.
    expect(folioCss).toMatch(/text-shadow:\s*var\(--engrave-title\)/);
  });

  it("keeps the light theme's ornament ink GOLD, never bronze (owner, 2026-07-24)", () => {
    // The light `--frame-ornate` body is the deep antique-gold #94741f — a
    // true-gold hue letterpressed into the vellum. The superseded bronze-700
    // (#7a5f24) body must not return to either ornament token's light strike.
    const lightBlock = indexCss.slice(indexCss.indexOf('[data-theme="light"]'));
    const lightFrame = lightBlock.match(/--frame-ornate:\s*([^;]+);/)?.[1];
    const lightSeat = lightBlock.match(/--seat-orn: url\("([^"]+)"\)/)?.[1];
    expect(lightFrame).toBeDefined();
    expect(lightSeat).toBeDefined();
    expect(lightFrame).toContain("fill='%2394741f'");
    expect(lightSeat).toContain("fill='%2394741f'");
    expect(lightFrame).not.toContain("fill='%237a5f24'");
    expect(lightSeat).not.toContain("fill='%237a5f24'");
  });

  it("seats the style-A winged divider on dialog heads, surface-baked per theme", () => {
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
      // The A-language anatomy: the luminous centre (nested chevron pair over
      // the descending faceted plumb, hanging BELOW the rule)…
      expect(uri).toContain("M121.8 6.4L130 10.5L138.2 6.4");
      expect(uri).toContain("M130 13.2L132.2 16.6L130 22.8L127.8 16.6Z");
      // …the inner open-eye S-hook return (the corner volute language)…
      expect(uri).toContain("M102.6 12.55Q106.8 11.7 107.8 9.9");
      // …and the rail's outer hairpoint ending in a tiny OPEN under-curl.
      expect(uri).toContain("Q4.7 12.95 5.7 13.75");
      // The gen9 floating under-dot stays dead (nothing floats, ever).
      expect(uri).not.toContain("circle cx='108.6'");
      // The baked radial glow seats the centre…
      expect(uri).toContain("radialGradient");
      expect(uri).toContain("circle cx='130' cy='13.5' r='13' fill='url(%23gl)'");
      // …and the surface-2 backing diamond HUGS the fleur with an in-SVG
      // blurred edge, so no hard plate rim ever shows against the glow.
      expect(uri).toContain("M130 5L136.4 13.2L130 21L123.6 13.2Z");
      expect(uri).toContain("filter='url(%23pb)'");
      expect(uri).toContain("feGaussianBlur");
      // Same mirror-then-tone strike as the corners: the closure (id='s') is
      // struck by 2 offset tone layers per theme.
      expect(
        uri.match(
          /use href='%23s' fill='%23[0-9a-f]+' opacity='[^']+' transform='translate\(/g
        )?.length
      ).toBe(2);
    });
    // The glow carries the "more wow" presence (owner, 2026-07-24 — supersedes
    // the earlier whisper weight): dark .38, light .3.
    expect(themes[0]).toContain("stop-opacity='.38'");
    expect(themes[1]).toContain("stop-opacity='.3'");
  });

  it("registers the goldwork ON the frame corners at every host size (owner, 2026-07-24)", () => {
    // The corner-goldwork pseudo rule: four FIXED-SIZE corner background
    // layers on an inset paint box. The fitting rule: each 64px tile draws
    // its rail centerline at 20% (12.8px), so `inset: -(0.2 × 64px + 0.5px)`
    // seats it exactly on the host's 1px border stroke.
    const ruleRaw = folioCss.match(
      /\.page-head\.framed::before,\s*\.folio-panel\.gilt-frame::after,\s*\.modal::after\s*\{([^}]*)\}/
    )?.[1];
    expect(ruleRaw).toBeDefined();
    // Comments narrate the banned mechanisms; assert on declarations only.
    const rule = (ruleRaw ?? "").replace(/\/\*[^]*?\*\//g, "");
    expect(rule).toContain("inset: calc(-1 * (0.2 * 64px + 0.5px));");
    expect(rule).toContain("background: var(--frame-ornate);");
    // THE ROOT-CAUSE PIN (the "translated downward" regression): the pseudo
    // must carry NO layout border and NO border-image — a 64px transparent
    // border forces a 128px minimum box that overflows every shorter host
    // downward, and border-image's proportional tile-shrink mis-seats the
    // centerline. `content: ""` is the only quoted property allowed here.
    expect(rule).not.toContain("border:");
    expect(rule).not.toContain("border-image");
    expect(folioCss).not.toMatch(/border-image:\s*var\(--frame-ornate\)/);
    // Each per-theme token carries exactly the four corner-anchored
    // fixed-size layers.
    for (const pos of ["left top", "right top", "left bottom", "right bottom"]) {
      expect(
        indexCss.match(new RegExp(`\\)\\s*${pos} / 64px 64px no-repeat`, "g"))?.length
      ).toBe(2);
    }
    // THE ONE-LINE LAW's host half (owner, 2026-07-24 "must ALIGN to the
    // borders"): the three framed registers are SQUARE so the knot seats on a
    // true crossing of the host's own border — a rounded arc curving under the
    // knot is the two-line regression this pins out. Each anchor slice is the
    // same one used above (a renamed selector fails the indexOf checks there).
    const modalRule = folioCss.slice(
      folioCss.indexOf("\n.modal {"),
      folioCss.indexOf(".modal.sm")
    );
    expect(modalRule).toContain("border-radius: 0;");
    const framedRule = folioCss.slice(
      folioCss.indexOf(".page-head.framed {"),
      folioCss.indexOf(".page-head.framed.has-crest")
    );
    expect(framedRule).toContain("border-radius: 0;");
    expect(folioCss).toMatch(
      /\.folio-panel\.gilt-frame,\s*\[data-theme="dark"\] \.folio-panel\.gilt-frame::before\s*\{\s*border-radius: 0;\s*\}/
    );
    expect(folioCss).toMatch(/\.modal-head\s*\{[^}]*border-radius: 0;/);
    // Corner ink is paint-only overflow, clipped by a host's child-paint
    // clipping, so the hero hosts must NOT overflow-hide: `.modal`
    // scroll-clips on `.modal-body`, and the masthead crest self-clips via
    // mask-size on an `inset: 0` element. Each slice anchor must actually
    // exist — a renamed selector would make indexOf return -1 and the slice a
    // vacuously-passing tail fragment.
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
