import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const indexCss = readFileSync(resolve(here, "../../src/index.css"), "utf8");
const folioCss = readFileSync(resolve(here, "../../src/styles/folio.css"), "utf8");

/**
 * The ornament vocabulary (BG3 identity T5 — DESIGN.md §5, narrowed by «Lume»,
 * owner 2026-11-03: no corners, no filigree anywhere). Pins the surviving
 * grammar's load-bearing facts so a refactor can't silently drop or re-add a piece:
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

  it("keeps the engraved titling in BOTH themes", () => {
    expect(indexCss.match(/--engrave-title:/g)?.length).toBe(2);
    expect(folioCss).toMatch(/text-shadow:\s*var\(--engrave-title\)/);
  });

  it("wears no corner fitting and no filigree anywhere («Lume», owner 2026-11-03)", () => {
    // The binding corners (four masked SVGs on the framed heads, panels and every
    // dialog head) and the traced weave (the knot under heads and the first
    // rubric) are gone from the classic sheet too: a framed head keeps its gilt
    // border and glow only. Neither may come back under any name.
    expect(folioCss).not.toMatch(/ornaments\//);
    expect(folioCss).not.toMatch(/corner-(tl|tr|bl|br)\.svg/);
    expect(folioCss).not.toMatch(/--wb-knot:/);
    expect(folioCss).not.toMatch(/var\(--wb-knot\)/);
    expect(folioCss).not.toMatch(/\.modal-head::before\s*\{/);
    expect(folioCss).not.toMatch(/\.page-head\.framed::after\s*\{/);
    // The modal and the crest host still never clip (a later ornament would need it).
    const modalStart = folioCss.indexOf("\n.modal {");
    const modalEnd = folioCss.indexOf(".modal.sm");
    expect(modalStart).toBeGreaterThan(-1);
    expect(modalEnd).toBeGreaterThan(modalStart);
    expect(folioCss.slice(modalStart, modalEnd)).not.toContain("overflow: hidden");
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
