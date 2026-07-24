---
"d20-folio": patch
---

fix(combat): the current combatant's card keeps its material. Marking whose turn it is replaced the
card's entire shadow stack, so a plate quietly lost its edge and depth the moment it became active.
It now composes the hero plate edge instead — the same promotion a roster card takes under the
pointer, which is also what the active panel should look like.
