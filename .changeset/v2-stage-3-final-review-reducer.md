---
---

Close the last reducer holes found by the stage-3 whole-branch review: a `log-only` table now
withholds a held attack's declaration itself (no window, no `declared` entry, no cost), an HP
override to zero takes `applyDamage`'s 0-HP rule (dying for a PC, dead for anything else),
`answerNumber` and `referencedRolls` stay total over a `null` answer, the `vitals.life` whitelist
narrows through a predicate instead of a cast, and area targets are sorted so no client's
object-key enumeration decides the fold order.
