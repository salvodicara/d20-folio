/// <reference types="node" />
/**
 * Guard: the light-theme `.on-art-scope` flip must EXCLUDE card/surface text.
 *
 * **The regression this pins (owner-reported, twice):** loose text on the candlelit
 * backdrop gets a bright-ink + dark-outline treatment via `.on-art-scope`. Text that
 * sits on a CARD must NOT get it. The CORRECT design (owner: "card text should never
 * be considered on the backdrop in the FIRST place") is to make the flip selector
 * never MATCH surface text — via `:not(:where(<surfaces>) *, :where(<surfaces>))` —
 * rather than flip everything and undo it on cards (the old fragile reset layer that
 * a dead-code sweep silently stripped, re-leaking the outline onto the Account email
 * + DM Tools card).
 *
 * This guard asserts the two invariants of that design: (1) the flip carries the
 * surface EXCLUSION, and (2) the single inheritance-hygiene rule zeroes the outline
 * at the surface boundary. It checks the mechanism, not exact selector text, so a
 * legitimate refactor of the surface list still passes — but deleting the exclusion
 * (the thing that prevents the leak) fails CI.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { SRC_ROOT, srcFiles, readSrc } from "./__helpers__/src-files";

const FOLIO_CSS = resolve(SRC_ROOT, "styles/folio.css");

/** Collapse every whitespace run to one space so multi-line selectors match. */
const css = readSrc(FOLIO_CSS).replace(/\s+/g, " ");

describe("light-theme on-art-scope excludes card text (no outline leak onto cards)", () => {
  it("the backdrop-ink flip EXCLUDES surface text (`…:is(…text-text-secondary…):not(:where(…info-card…))`)", () => {
    // The flip that paints the bright ink + outline must carry the surface exclusion,
    // so card text is never matched in the first place. This is the leak-preventer.
    const flipExcludesSurfaces =
      /\.on-art-scope\s*:is\([^)]*\.text-text-secondary[^)]*\)\s*:not\(\s*:where\([^)]*\.info-card[^)]*\[class\*="bg-"\]/;
    expect(
      flipExcludesSurfaces.test(css),
      "MISSING: the `.on-art-scope :is(…text-text-secondary…):not(:where(…surfaces…) …)` exclusion. " +
        "Without it the backdrop-text outline leaks onto card text in light theme. " +
        "Card text must NEVER be matched by the flip — exclude surfaces, don't reset them. " +
        "See light-on-backdrop-text memory."
    ).toBe(true);
  });

  it("the title-ink flip ALSO excludes surface text (`…:is(…sec-title…):not(:where(…))`)", () => {
    const titleFlipExcludes =
      /\.on-art-scope\s*:is\([^)]*\.sec-title[^)]*\)\s*:not\(\s*:where\([^)]*\.info-card/;
    expect(
      titleFlipExcludes.test(css),
      "MISSING: the surface exclusion on the gilt-title flip (.field-label/.sec-title/…). " +
        "Both on-art-scope flips must exclude surfaces, or label/title card text leaks."
    ).toBe(true);
  });

  it("a single inheritance-hygiene rule zeroes the outline at the surface boundary", () => {
    // Surfaces establish a no-outline baseline so card text can't inherit a flipped
    // loose ancestor's outline. (One boundary rule — not a per-utility undo.)
    const hygiene =
      /\.on-art-scope\s*:is\([^)]*\.info-card[^)]*\[class\*="bg-"\]\s*\)\s*\{\s*text-shadow:\s*none/;
    expect(
      hygiene.test(css),
      "MISSING: the `.on-art-scope :is(<surfaces>) { text-shadow: none }` inheritance-hygiene rule."
    ).toBe(true);
  });
});

describe("ON-ART-INK (owner 2026-06-12) — the canonical scope covers the recurring offenders", () => {
  // The owner's recurring light-theme defect class: components rendered DIRECTLY
  // on the dark backdrop art inherit the standard dark ink and vanish. These pin
  // the scope-level recipes that fixed the 2026-06-12 sweep (member-sheet back
  // button, wizard page-turn captions, boon facet chips, on-art error ink, the
  // RunicEmptyState hero). The LIVE gate is tests/e2e/on-art-ink.spec.ts (a
  // manifest-wide luminance probe); these are its cheap unit-side mechanism pins.

  it("the RunicEmptyState text family is in the flips (es-title/blurb/note body; es-eyebrow + title em gilt)", () => {
    const bodyFlip =
      /\.on-art-scope\s*:is\([^)]*\.es-title,\s*\.es-blurb,\s*\.es-note[^)]*\):not\(/;
    const titleFlip =
      /\.on-art-scope\s*:is\([^)]*\.es-eyebrow,\s*\.es-title em[^)]*\):not\(/;
    expect(
      bodyFlip.test(css) && titleFlip.test(css),
      "MISSING: the `.es-*` empty-state vocabulary in the on-art-scope flips. Without it " +
        "the 404/no-access/empty heroes are dark-on-dark on the raw backdrop in light theme."
    ).toBe(true);
  });

  it("an UNPRESSED `.fchip` loose in the scope takes the parchment ink (pressed = its own gilt surface)", () => {
    const rule =
      /\.on-art-scope\s*\.fchip:not\(\[aria-pressed="true"\]\):not\(\s*:where\([^{]*\{[^}]*color:\s*var\(--text-on-backdrop\)/;
    expect(
      rule.test(css),
      "MISSING: `[data-theme=light] .on-art-scope .fchip:not([aria-pressed=true]):not(…surfaces…) " +
        "{ color: var(--text-on-backdrop) }`. Without it the level-up boon facet chips " +
        "(Origin Feat / Dark Gift / …) are invisible on the art in light theme."
    ).toBe(true);
  });

  it("the wide-gutter page-turn captions flip — and ONLY at the gutter breakpoint (mobile pills keep their ink)", () => {
    // The caption floats on the art only on the ≥1360px gutter layout; below it
    // the pager folds into opaque blurred pills where cream ink would wash out.
    const mediaScoped =
      /@media \(min-width: 1360px\)\s*\{\s*\[data-theme="light"\]\s*\.on-art-scope\s*\.wiz-pager-cap\s*\{[^}]*color:\s*var\(--text-on-backdrop\)/;
    expect(
      mediaScoped.test(css),
      "MISSING: the media-scoped `[data-theme=light] .on-art-scope .wiz-pager-cap` flip " +
        "(@media min-width:1360px). Without it the wizard's Exit/Continue captions are " +
        "unreadable on the art in light theme — and WITHOUT the media scope they'd " +
        "paint cream-on-cream on the mobile pager pills."
    ).toBe(true);
  });

  it("`.text-error` loose in the scope takes the on-backdrop danger ink", () => {
    const rule =
      /\.on-art-scope\s*\.text-error:not\([^{]*\{[^}]*color:\s*var\(--text-on-backdrop-danger\)/;
    expect(
      rule.test(css),
      "MISSING: `[data-theme=light] .on-art-scope .text-error:not(…surfaces…) " +
        "{ color: var(--text-on-backdrop-danger) }`. Without it the wizard's required-field " +
        "asterisk / inline errors are deep-vermilion-on-dark-art in light theme."
    ).toBe(true);
  });

  it("transparent loose chips/buttons flip — the DMPC attach button + `.badge.muted` take the parchment ink", () => {
    // The campaign hub's `.party-dm-attach` dashed button + the treasury `.badge.muted`
    // ("X gp total") chip both paint a transparent background, so they read dark-on-dark
    // on the candlelit backdrop in light theme. `.badge` is a SURFACE in the text flips,
    // so a transparent muted chip needs this explicit flip. (Live gate: on-art-ink.spec.)
    const rule =
      /\.on-art-scope\s*:is\(\.party-dm-attach,\s*\.badge\.muted\):not\([^{]*\{[^}]*color:\s*var\(--text-on-backdrop\)/;
    expect(
      rule.test(css),
      "MISSING: `[data-theme=light] .on-art-scope :is(.party-dm-attach, .badge.muted):not(…surfaces…) " +
        "{ color: var(--text-on-backdrop) }`. Without it the campaign-hub DMPC attach button + the " +
        "treasury 'X gp total' chip are dark-on-dark on the atmospheric backdrop in light theme."
    ).toBe(true);
  });

  it("the treasury GP-total plate flip (background/border/shadow) ALSO excludes card surfaces", () => {
    // The plate rule adds the self-backed cartouche (dark plate + gilt border + tight
    // shadow) SEPARATELY from the generic ink flip above — it must carry the SAME
    // `.badge.muted:not(:where(<surfaces minus .badge>) …)` exclusion, or it leaks onto
    // every card-bound `.badge.muted` (e.g. the party-encounter monster `×N` token
    // badge on `.party-card`, which must keep its plain card-surface badge, not the
    // dark plate meant only for the loose treasury cartouche).
    const plateExcludesSurfaces =
      /\.on-art-scope\s*\.badge\.muted:not\([^{]*\.party-card[^{]*\{[^}]*background:\s*color-mix\(in oklab, #1a1206/;
    expect(
      plateExcludesSurfaces.test(css),
      "MISSING: the `.on-art-scope .badge.muted:not(:where(…surfaces…))` exclusion on the " +
        "treasury plate rule. Without it the GP-total cartouche's dark plate + gilt border " +
        "leaks onto the party-encounter monster ×N badge (a card-bound .badge.muted)."
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

describe("shared components never hardcode the `.on-art` leaf class (owner-reported leak)", () => {
  it("no `src/components/**` file stamps `on-art` — context (`.on-art-scope`) decides, not the leaf", () => {
    // **The regression this pins (owner-reported, 2026-06-10):** the savant
    // "added to your spellbook" hint hardcoded `className="on-art …"` inside a
    // SHARED picker. On the creation wizard (genuinely on the candlelit art) that
    // read fine — but the same component renders inside the LevelUpModal, a plain
    // light card, where the white-ink + dark-outline backdrop treatment leaked.
    // `.on-art` is for CONTEXT-FIXED surfaces only (login hero, creation steps —
    // places that are on the art by construction). A shared component must rely
    // on the `.on-art-scope` flip, which restyles loose text per ancestor context
    // and never matches card surfaces.
    const componentsDir = resolve(SRC_ROOT, "components");
    const offenders: string[] = [];
    for (const p of srcFiles({ under: componentsDir, exts: [".ts", ".tsx"] })) {
      // Comments may legitimately DISCUSS `.on-art` (e.g. explaining why a
      // shared component must not use it) — strip them; pin only real code.
      const src = readSrc(p)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "")
        .replaceAll("on-art-scope", "");
      if (/\bon-art\b/.test(src)) offenders.push(p);
    }
    expect(
      offenders,
      "Hardcoded `on-art` in a SHARED component — it renders in card contexts too " +
        "(LevelUpModal, sheet sections) where the backdrop ink + dark outline is a leak. " +
        "Remove the class; the `.on-art-scope` ancestor flip restyles it on art contexts."
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
