---
"d20-folio": patch
---

A `vitals.hp` override now clamps to 0 instead of allowing a negative live HP, which previously
inflated `applyDamage`'s massive-damage overflow calculation and could fire an instant kill early.
