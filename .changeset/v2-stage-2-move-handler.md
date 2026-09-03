---
"d20-folio": patch
---

Give the `move` step a real handler: it spends the entity's movement budget, updates its
position, and recomputes derived `adjacent`/`range` relations against every other positioned
entity — opening the same opportunity-attack window a manually declared departure already does,
through one shared helper. `Answer` gains a `Position` variant so a program can carry a
destination the way it already carries a rolled number.
