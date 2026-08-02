---
"d20-folio": minor
---

Model AoE save-area spells (the Fireball-class shape signal). A new `area` fact on the
spell data — set on Burning Hands, Thunderwave, Shatter, Fireball, Lightning Bolt, Ice
Storm and Cone of Cold — finally distinguishes a burst save-for-half spell from a
single-target save cantrip (both are just a save + damage). The in-encounter capture
reads it (`attack-scope`) to open an UNBOUNDED multi-target SAVE declaration, and
`actionRiderConditions` surfaces a weapon's Topple Mastery as an applied Prone rider.
