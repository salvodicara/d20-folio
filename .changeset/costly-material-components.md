---
"d20-folio": patch
---

Spells with a costly material component now show what they cost right on the cast card. Spells like
Revivify (a 300 gp diamond it consumes) or Chromatic Orb (a 50 gp diamond) now carry a compact
"M: 300 gp, consumed" chip at the top of the spell card's tag row, so the gold cost is clear at the
moment you cast (RA-23). The cost and consumed facts are modeled as structured data across all 53
priced SRD spells; the full material breakdown still lives in the compendium entry. No gold is
auto-spent — the chip only tells you the price.
