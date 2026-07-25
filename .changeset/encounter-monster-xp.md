---
"d20-folio": minor
---

feat(campaign): encounter monsters carry their XP at add time

Each monster group in an encounter now stores an optional per-token `xp`
(SRD Step 3 — "every creature has an XP value in its stat block"), seeded when the
group is added: the bestiary picker seeds `monsterXp(statblock)`, the custom form
seeds the chosen CR's XP, and a stat-less improv NPC stays un-costed. This is the
derived-at-write seam the DM budget readout deducts against — offline-first, no
corpus fetch, working for any doc age.

`xp` is encounter-OWNED, exactly like `ac`/`maxHp`: the statblock is a seed, not a
live source, so a later corpus CR correction does NOT retro-update existing
encounter docs (the same accepted stale-seed behaviour as `ac`). The write guard is
existence-based, so a genuine harmless "XP 0" CR-0 monster is stored costed, never
mis-read as unknown. Additive-only — every live encounter doc loads unchanged.
