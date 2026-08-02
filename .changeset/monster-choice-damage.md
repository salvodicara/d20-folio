---
"d20-folio": patch
---

Monster statblock damage clauses can now express a use-time CHOSEN damage type.
`MonsterDamage` gains `damageChoice?: DamageType[]` (a ≥1-element type choice the
attacker picks on hit, mutually exclusive with the concrete `damageType`; mirrors
the spell-side `SrdSpellData.damageChoice`), and the corpus guard's §F.4 now
accepts an `attack` clause satisfied by a non-empty choice set. Unblocks the five
choice-damage Monster Manual creatures that dealt their primary attack in a
creature-chosen element (Winged Kobold's Chromatic Spittle, the elemental titans'
bursts, the empyreans' Necrotic-or-Radiant rays).
