/// <reference types="node" />
/**
 * Guard: the on-art treatment is OPT-IN, and it cannot go back to being a blanket.
 *
 * **The regression this pins (owner-reported, three times now):** loose text on the
 * candlelit backdrop takes a bright-ink + dark-outline treatment. Text on a CARD must
 * not. The mechanism used to be a blanket — a list of ink registers matched anywhere
 * inside `.on-art-scope`, minus a hand-written list of surface classes — and this
 * file used to assert that the exclusion list still contained the string
 * `.info-card`. That assertion is why the third instance shipped: the campaign hub's
 * sections were rebuilt on `.folio-panel.section-card` / `.hub-row` / `.hub-cell`,
 * no component in them used `.info-card` any more, the string was still in the CSS,
 * and 43 elements took cream ink and a dark halo inside an opaque ivory panel while
 * this guard stayed green. A regex over a list is not a check; it is the list again.
 *
 * So the treatment is a CLASS the leaf opts into (`.on-art` / `.on-art-title`, or
 * `--on-art-plate` for an object that backs itself), nothing reaches into a surface,
 * and the real check is RENDERED: `tests/e2e/on-art-ink.spec.ts` measures both
 * directions on the real page — loose ink must clear AA on the real composited
 * ground, and on-art ink must never appear ON a surface.
 *
 * WHAT IS LEFT HERE is what the rendered probe cannot see: that the blanket idiom
 * does not come back, that the halo stays ONE token, and the handful of per-recipe
 * mechanisms whose absence a screenshot would not obviously betray.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { SRC_ROOT, srcFiles, readSrc } from "./__helpers__/src-files";

const FOLIO_CSS = resolve(SRC_ROOT, "styles/folio.css");

/** Collapse every whitespace run to one space so multi-line selectors match. */
const css = readSrc(FOLIO_CSS).replace(/\s+/g, " ");

describe("ON-ART-INK (owner 2026-06-12) — the canonical scope covers the recurring offenders", () => {
  // The owner's recurring light-theme defect class: components rendered DIRECTLY
  // on the dark backdrop art inherit the standard dark ink and vanish. These pin
  // the scope-level recipes that fixed the 2026-06-12 sweep (member-sheet back
  // button, wizard page-turn captions, boon facet chips, on-art error ink, the
  // RunicEmptyState hero). The LIVE gate is tests/e2e/on-art-ink.spec.ts (a
  // manifest-wide luminance probe); these are its cheap unit-side mechanism pins.

  it("the wide-gutter page-turn captions flip — and ONLY at the gutter breakpoint (mobile pills keep their ink)", () => {
    // The caption floats on the art only on the ≥1360px gutter layout; below it
    // the pager folds into opaque blurred pills where cream ink would wash out.
    // The GROUND is theme-agnostic (dark's gold caption measured 1.52:1 on the
    // bright half of the art); only the INK flip is light's. Both must stay inside
    // the gutter media query — below it the pager folds into opaque pills where
    // cream ink would wash out.
    const mediaScoped =
      /@media \(min-width: 1360px\)\s*\{[\s\S]{0,900}?\[data-theme="light"\]\s*\.on-art-scope\s*\.wiz-pager-cap\s*\{[^}]*color:\s*var\(--text-on-backdrop\)/;
    const groundScoped =
      /@media \(min-width: 1360px\)\s*\{[\s\S]{0,900}?\.on-art-scope\s*\.wiz-pager-cap\s*\{\s*text-shadow:\s*var\(--on-art-halo\)/;
    expect(
      groundScoped.test(css),
      "MISSING: the media-scoped `.on-art-scope .wiz-pager-cap` HALO (both themes). " +
        "A `<button>` does not pass the scope's halo down, and at the gutter width " +
        "these captions sit on the scene with nothing behind them."
    ).toBe(true);
    expect(
      mediaScoped.test(css),
      "MISSING: the media-scoped `[data-theme=light] .on-art-scope .wiz-pager-cap` flip " +
        "(@media min-width:1360px). Without it the wizard's Exit/Continue captions are " +
        "unreadable on the art in light theme — and WITHOUT the media scope they'd " +
        "paint cream-on-cream on the mobile pager pills."
    ).toBe(true);
  });

  it("ONE halo token — the flips share `var(--on-art-halo)`, never a re-pasted shadow blob", () => {
    // The crisp dark outline lived as 9 verbatim 5-line blobs; ON-ART-INK folded
    // them into the `--on-art-halo` token so the halo can never drift. A re-pasted
    // raw blob is the regression.
    expect(
      css.includes("text-shadow: var(--on-art-halo)"),
      "MISSING: `text-shadow: var(--on-art-halo)` — the on-art halo must come from the token."
    ).toBe(true);
    expect(
      /text-shadow:\s*0 0 2px rgba\(18, 12, 3/.test(css),
      "FOUND a verbatim on-art halo blob in folio.css — use `text-shadow: var(--on-art-halo)` " +
        "(the single token) instead of re-pasting the shadow list."
    ).toBe(false);
  });

  it("the read-only member-sheet header row sits in the canonical scope (the owner's reported instance)", () => {
    const tsx = readSrc(resolve(SRC_ROOT, "features/campaigns/MemberSheetView.tsx"));
    expect(
      /className="on-art-scope[^"]*"/.test(tsx),
      "MISSING: `on-art-scope` on the MemberSheetView header row — its ghost back button " +
        "renders directly on the backdrop art and vanishes in light theme without it."
    ).toBe(true);
  });
});

describe("a shared component may only opt IN to on-art conditionally", () => {
  it("no `src/components/**` file stamps an on-art class unconditionally", () => {
    // **The regression this pins (owner-reported, 2026-06-10):** the savant "added to
    // your spellbook" hint hardcoded `className="on-art …"` inside a SHARED picker.
    // On the creation wizard (genuinely on the art) it read fine — but the same
    // component renders inside the LevelUpModal, a plain light card, where the
    // white-ink + dark-outline treatment leaked.
    //
    // The rule is NOT "a shared component may never say `on-art`" any more: the
    // treatment is opt-in now, so `SectionHeader`, `RunicEmptyState` and friends carry
    // it behind an `onArt` prop, which is exactly how a shared component is supposed
    // to express "my caller mounts me on the art". What stays banned is stamping it
    // UNCONDITIONALLY — a bare literal in a className with nothing gating it.
    const componentsDir = resolve(SRC_ROOT, "components");
    const offenders: string[] = [];
    for (const p of srcFiles({ under: componentsDir, exts: [".ts", ".tsx"] })) {
      const src = readSrc(p)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "")
        .replaceAll("on-art-scope", "");
      for (const m of src.matchAll(
        /["'`][^"'`]*\bon-art(?:-title|-chip)?\b[^"'`]*["'`]/g
      )) {
        // Gated forms — `onArt && "on-art"`, `cn(..., onArt && "on-art-title")` — are
        // the sanctioned shape; a literal that is not preceded by a gate is not.
        const before = src.slice(Math.max(0, m.index - 40), m.index);
        if (/&&\s*$/.test(before)) continue;
        if (/\?\s*$/.test(before)) continue;
        offenders.push(`${p} → ${m[0]}`);
      }
    }
    expect(
      offenders,
      "An on-art class is stamped UNCONDITIONALLY in a shared component. It renders " +
        "in card contexts too (LevelUpModal, sheet sections), where the backdrop ink " +
        "and dark halo are a leak. Gate it on an `onArt` prop so the CALLER — which " +
        "is the only thing that knows where the component is mounted — decides:\n  " +
        offenders.join("\n  ")
    ).toEqual([]);
  });
});

describe("light-theme campaign-card kebab reads on its dark banner (Img #34)", () => {
  it("the .cmp-card kebab takes the on-backdrop ink + a drop-shadow halo in light theme", () => {
    // The campaign kebab sits on the dark photographic banner (NOT the card
    // surface like the roster kebab), so in light theme the surface ink vanished.
    // It must take the illuminated-parchment on-backdrop ink + a drop-shadow halo
    // (text-shadow can't reach an SVG glyph) so it reads on the art. Checks the
    // mechanism, not exact shadow values.
    const kebabOnArt =
      /\[data-theme="light"\]\s*\.cmp-card\s*>\s*\.ch-overflow\s*\{[^}]*color:\s*var\(--text-on-backdrop\)[^}]*drop-shadow/;
    expect(
      kebabOnArt.test(css),
      "MISSING: the `[data-theme=light] .cmp-card > .ch-overflow { color: var(--text-on-backdrop); filter: drop-shadow(…) }` " +
        "rule. Without it the 3-dots kebab is invisible on the dark banner in light theme."
    ).toBe(true);
  });
});

describe("light-theme edit-mode frame GLOWS (Img #30)", () => {
  it("repaints the edit frame with the luminous --accent-primary, not the dark --edit-accent ink", () => {
    // In light theme `--edit-accent` is the dark gold ink (for AA pill text), which
    // made the edit frame a thin dark line with no glow. The light override must
    // repaint `.content[data-mode="edit"]::before` with the luminous --accent-primary
    // so edit mode glows on cream like it does on dark.
    const editGlow =
      /\[data-theme="light"\]\s*\.content\[data-mode="edit"\]::before\s*\{[^}]*var\(--accent-primary\)/;
    expect(
      editGlow.test(css),
      "MISSING: the `[data-theme=light] .content[data-mode=edit]::before` override using " +
        "var(--accent-primary). Without it light-theme edit mode is not obvious (no glow)."
    ).toBe(true);
  });
});

describe("the on-art treatment cannot go back to being a blanket", () => {
  it("no `.on-art-scope` rule carries a surface-exclusion list", () => {
    // THE DEFECT IDIOM, banned by shape rather than by name: a selector that matches
    // broadly inside the scope and then subtracts a hand-written list of surface
    // classes. It cannot be derived (whether text is on a surface is a fact about the
    // rendered ancestor chain, not about any class), so it rots silently the first
    // time a surface is built out of a class nobody remembered to add.
    //
    // Judged per RULE, on the SELECTOR only — a probe that scans the flattened
    // stylesheet for `:not( :where(` and then looks "nearby" for a surface name reads
    // straight across rule boundaries and reports selectors that carry no exclusion
    // at all (it did: two innocent `.fchip` rules).
    const offenders = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)]
      .map(([, sel]) => (sel ?? "").trim())
      .filter(
        (sel) =>
          sel.includes(".on-art-scope") &&
          /:not\(\s*:where\(/.test(sel) &&
          /\.info-card|\.party-card|\[class\*="bg-"\]/.test(sel)
      )
      .map((sel) => sel.slice(0, 90));
    expect(
      offenders,
      "A `.on-art-scope … :not(:where(<surface list>))` rule is back. That is the " +
        "mechanism that put cream ink on the campaign hub's ivory panels: the list " +
        "cannot be derived, so it rots the moment a new surface class appears. Put " +
        "`.on-art` / `.on-art-title` on the leaf that genuinely sits on the art " +
        "instead — and let `on-art-ink.spec.ts` prove both directions on the rendered " +
        "page:\n  " +
        offenders.join("\n  ")
    ).toEqual([]);
  });

  it("the two opt-in tiers exist, and light re-derives both inks", () => {
    expect(
      /\.on-art,\s*\.on-art-title \{ text-shadow: var\(--on-art-halo\); \}/.test(css),
      "MISSING the shared GROUND on the two opt-in tiers. The halo is theme-agnostic " +
        "(our backdrops carry bright regions in both rooms); only the INK is light's."
    ).toBe(true);
    expect(
      /\[data-theme="light"\] \.on-art \{ color: var\(--text-on-backdrop\); \}/.test(css),
      "MISSING light's parchment BODY ink on `.on-art`."
    ).toBe(true);
    expect(
      /\[data-theme="light"\] \.on-art-title \{ color: var\(--text-on-backdrop-title\); \}/.test(
        css
      ),
      "MISSING light's gilt TITLE ink on `.on-art-title`."
    ).toBe(true);
  });

  it("a self-backing control re-derives its plate PER THEME, never one scrim for both", () => {
    // `--on-art-plate` was theme-agnostic near-black, so on the cream hub the DM
    // attach affordance was the only near-black object on the page, between two
    // ivory panels. An object on the scene backs itself in the room it stands in.
    for (const token of ["--on-art-plate", "--on-art-plate-ink", "--on-art-plate-halo"]) {
      expect(
        (
          readSrc(resolve(SRC_ROOT, "index.css")).match(new RegExp(`${token}:`, "g")) ??
          []
        ).length,
        `${token} must be defined TWICE — once as the dark strike, once for daylight.`
      ).toBeGreaterThanOrEqual(2);
    }
    expect(
      /\.party-dm-attach \{[^}]*background-color: var\(--on-art-plate\)[^}]*color: var\(--on-art-plate-ink\)/.test(
        css
      ),
      "The DM attach affordance must paint the per-theme plate + its per-theme ink. " +
        "A halo grounds INK and cannot ground the dashed EDGE, so this control backs " +
        "itself — in BOTH rooms."
    ).toBe(true);
  });
});
