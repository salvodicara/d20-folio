---
"d20-folio": patch
---

fix(wizard): the DISABLED page-turn seal self-backs so it never dissolves into the v2 plate

The richer v2 scene plates surfaced a latent legibility bug in the wizard pager's disabled state.
The forward "Continue" seal dropped to `opacity: 0.4` when blocked — fine over the old
ultra-blurred backdrop, but over the v2 light plate's brass-orrery/shelf detail the translucent
gold disc DISSOLVED into the machinery (the gilt-coin trap, DESIGN §13.5: a seal is an object and
must self-back, never depend on what is painted behind it), and its caption's gilt title ink blended
into the brass it floated over. Quench the disabled seal to a QUIET OPAQUE disc instead — a material
fade, not pure opacity: the enabled gold's bright radial sheen, gilt edge, and `--gilt-glow` are all
stripped, leaving a flat muted self-backed material that reads plainly subordinate to the lit CTA
yet never bleeds the backdrop through, and the disabled caption drops from the gilt title ink to the
warm-parchment body ink so it separates cleanly from the brass. Every token theme-flips, so the one
rule fixes both themes (dark's marginal 0.4 ghost is repaired for free). Affects both wizards
(creation + level-up) on gutter-wide viewports.
