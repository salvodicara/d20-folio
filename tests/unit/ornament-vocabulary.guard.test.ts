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
 *   - ordinary section dividers fade at both tips and stay NODELESS — the
 *     ceremonial hero/modal seat alone earns the shared traced weave;
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

  it("wires the binding corners + engraved titling in BOTH themes", () => {
    // The binding-corner fitting (the CC0 spandrel silhouette) ships as FOUR
    // external mask assets — one per orientation — struck with the warm
    // gold→bronze ramp approved for the current+B+BG3 hybrid. The cold silver
    // frame remains selection-only. The engraved titling stays per-theme.
    for (const k of ["tl", "tr", "bl", "br"]) {
      expect(folioCss).toContain(`url("/assets/ornaments/corner-${k}.svg")`);
    }
    expect(folioCss).toMatch(/mask-image:[\s\S]*?corner-tl\.svg[\s\S]*?corner-br\.svg/);
    expect(folioCss).toMatch(
      /background:\s*linear-gradient\(\s*180deg,\s*var\(--accent-primary-bright\),\s*var\(--metal-bronze\) 52%,\s*var\(--accent-primary\)\s*\)/
    );
    expect(indexCss.match(/--engrave-title:/g)?.length).toBe(2);
    expect(folioCss).toMatch(/text-shadow:\s*var\(--engrave-title\)/);
  });

  it("seats the fitting ON the frame like a bookbinding corner (owner, 2026-07-31)", () => {
    // The mask tile's origin IS the fitting's outer-rule outer edge, and the
    // overlay sits at inset -1px, so the fitting's rules lie pixel-coincident
    // ON the host's 1px border — the regression this pins is the fitting
    // drifting back INSIDE the panel (or the seat geometry changing without
    // the doc trail). Position: the four corners; span: the 48px wing.
    // The modal's fittings ride the HEAD band since 2026-08-01 (the owner's
    // bound-cover ruling): the shared rule hosts .modal-head::after, scaled
    // to 32px by its own override below.
    const fitting = folioCss.match(
      /\.page-head\.framed::before,\n\.folio-panel\.gilt-frame::after,\n\.modal-head::after \{[\s\S]*?\n\}/
    )?.[0];
    expect(fitting).toBeTruthy();
    expect(fitting).toContain("inset: -1px");
    expect(fitting).toMatch(
      /mask-position:\s*left top,\s*right top,\s*left bottom,\s*right bottom/
    );
    expect(fitting).toMatch(/mask-size: 48px 48px/);
    // …and the dialog head wears them SCALED (32px), never the masthead size.
    expect(folioCss).toMatch(/\.modal-head::after \{\n {2}mask-size: 32px 32px;/);
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
    expect(folioCss).toMatch(/\.page-head-crest\s*\{[^}]*opacity: 0\.055/);
    expect(folioCss).toMatch(
      /\[data-theme="light"\] \.page-head-crest\s*\{[^}]*opacity: 0\.14/
    );
  });

  it("spends the traced open weave only on hero and dialog seat lines", () => {
    const weave = folioCss.match(
      /\.page-head\.framed::after,\n\.modal-head::before \{[\s\S]*?\n\}/
    )?.[0];
    expect(weave).toBeTruthy();
    expect(weave).toContain("background: var(--wb-knot) center / contain no-repeat");
    expect(weave).toContain("width: 72px");
    expect(weave).toContain("height: 25px");
    expect(folioCss).toMatch(/\.modal-head::before \{[^}]*width: 56px[^}]*height: 20px/);
    // BLIND SPOT: this source guard pins homes and geometry, not rendered
    // registration; the identity screenshot sweep covers the actual seat.
  });

  it("marks selection with the frame gradient (altar + chosen plaque), not diamonds", () => {
    // The chosen plaque + the altar wear the silver-over-bronze frame.
    expect(folioCss).toMatch(/var\(--frame-selected\) border-box/);
    // The trimmed decorative diamonds are GONE — no crest nodes, no masked
    // corner pieces, no re-tint ink tokens.
    expect(folioCss).not.toMatch(/--orn-corner/);
    expect(folioCss).not.toMatch(/--orn-corners/);
    expect(indexCss).not.toMatch(/--orn-ink/);
    expect(folioCss).not.toMatch(/\.wiz-hero:not\(\.empty\)::before/);
    // The junction curls died with the classic construction (owner,
    // 2026-08-01: "è semplicemente il bordo del riquadro" — the seat line IS
    // the panel's border, the active tab overlaps it, no pseudo ornaments).
    expect(folioCss).not.toMatch(/\.cmp-tab\[aria-selected="true"\]::before/);
    expect(folioCss).not.toMatch(
      /\.wiz-pager-btn\.commit \.wiz-pager-seal\.gold::before/
    );
  });

  it("keeps ordinary section dividers tip-faded and nodeless", () => {
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
