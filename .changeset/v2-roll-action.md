---
"d20-folio": patch
---

The `roll` action in the combat aggregate: the reducer verifies every roll's provenance (an app roll must reproduce from its seed, a manual roll carries no seed), records accepted rolls in the folded state, and intents answer their `d20`/`dice` inputs with a roll's id — undoing the roll re-validates the intent as `missing-answer`. The engine boundary guard now also forbids `crypto` randomness.
