---
"d20-folio": patch
---

The seat line becomes what it always should have been: the panel's own
border (full border, fully rounded corners like every folio panel). The
synthetic row-background line, its fading tips, the junction-curl pseudos
and their per-position suppressions all die; the active tab simply
overlaps the border by 2px inside the scroller's padding box. Also fixes
the focus ring appearing on every pointer click of a tab (programmatic
focus tripped :focus-visible) - the ring is now keyboard-only.
