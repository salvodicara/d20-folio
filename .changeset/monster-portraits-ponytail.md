---
"d20-folio": patch
---

Ponytail-review convergence for the monster-portrait panel: drop the unused `editable`
prop (the seal is always the edit affordance), delete the unused `CREATURE_GLYPH_VIEWBOX`
export, and read glyphs straight off the `CREATURE_GLYPH_PATH` record (no wrapper).
