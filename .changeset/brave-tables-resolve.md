---
"d20-folio": minor
---

Make combat resolution reliable across the whole table: peer damage, healing, Temporary HP and conditions now land atomically even when the target is offline; target-bound effects persist by exact creature instance and drive Aid, Heroism, Warding Bond, Death Ward, Haste and marked-target rules through the same grant engine; Haste's restricted action and aftereffect are enforced; spent turn economy and spell resources survive navigation without duplicate pending pips; and non-damaging areas retain free multi-target selection. Initiative gathering supports explicit skip and partial start, while NPC allies are first-class, reversible participants.

Dev bypass now mirrors the production character/combat/campaign document lifecycle across navigation, reloads and tabs, while one command starts a seeded Auth/Firestore/Storage/Functions sandbox for production-faithful dogfood. Reuse the Compendium leaf on Legal, recrop the Zombie portrait to preserve its head, and make published GitHub releases trigger the tag-pinned deploy workflow while retaining manual fallbacks.

Preserve the spatially stable encounter turn handoff while adding ally/enemy presentation, so advancing initiative changes state without moving or auto-expanding combatant cards.
Keep campaign transactions and the dev-only local replica out of the production entry chunk by loading campaign IO only when the palette or roster action actually needs it.
