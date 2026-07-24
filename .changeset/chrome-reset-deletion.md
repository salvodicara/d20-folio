---
"d20-folio": patch
---

feat(identity): the chrome reset, phase 1 — take the lasagna off

The owner's verdict on the accreted chrome was "a lasagna — layers, not a design", with the
delete-character dialog's DOUBLE SEPARATOR as the named example: a full-width tip-fading
border-image rule under a 260px winged-fleur SVG that draws its own 260px rail, one pixel apart, at
different lengths, weights and brightnesses. That is one layer laid over another, and it is what
five successive waves had been doing everywhere — each adding a treatment without removing the one
it superseded.

Phase 1 is pure REMOVAL. ~95 painted layers come off and exactly one goes on (the hairline):

- **The four confirmed double-paints.** The dialog head's rule + winged seat ornament (both gone;
  the head now ends in the one hairline, inset from the padding edge). The compendium leaf's second
  concentric gilt frame at `inset: 7px`. The third copy of the parchment texture over the leaf's own
  material. The corner goldwork on dialogs — a dialog already commands the screen, so it carries no
  ornament at all.
- **Four divider grammars → one.** `--hairline` (with `--hairline-ink` as its single parameter) is
  now every separator in the application: modal heads, card feet, section rubrics, the compendium
  entry head, the colophon. Tips fading, NODELESS, inset — never wall-to-wall, never a filled band.
- **All 18 rotated-diamond ornaments.** Rubric markers, rail heads, list bullets, divider nodes,
  charge pips, the menu "you are here" marker, the footer node. A heading is type and space; a
  bullet is a bullet; a marker is ink colour; a pip is a square facet. The one surviving
  `rotate(45deg)` is the `<select>` caret, guard-pinned as the only one.
- **Every light-emission system.** The focus interior wash and `--illumination` bloom (the 2px ring
  alone clears WCAG 1.4.11), `--gilt-glow` / `--gilt-glow-sm`, the `--glint-ink` hover sweep, the
  commit bloom, the compendium entry head's radial bloom. Light on this chrome means a lit material,
  never a state.
- **`--emboss-sheen`** — the fourth independent source of a cream top highlight (the light masthead
  was resolving three of them on one 1px line).
- **The count medallion** → plain numerals (a number you cannot act on is not an object); the
  disclosure knob stays struck, because it is the one thing in a rubric row a pointer can act on.
- **The class-pigment crown bar** on roster and campaign cards — the portrait well and the banner
  already carry that identity.
- **Engraved ceremonial titling** and **the crest watermark** behind every masthead. The crest is
  now spent exactly once, on the compendium frontispiece, where nothing live is set over it.

`ornament-vocabulary.guard.test.ts` is rewritten to pin the NEW system — the ornament budget, the
one divider, zero rotated diamonds, zero emission, flat type — instead of the vocabulary this phase
removes.
