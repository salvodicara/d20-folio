---
"d20-folio": minor
---

feat(lib): the 2024-DMG XP-budget encounter difficulty engine

The pure math seam behind the DM encounter difficulty readout (DDB-parity epic).
`src/lib/encounter-difficulty.ts` models the SRD 5.2.1 "Combat Encounter Difficulty"
procedure exactly — the "XP Budget per Character" table (20 levels × 3 grades),
`xpBudgetForLevel` / `partyXpBudget` (per-character sum for mixed-level parties) /
`encounterXpCost` / `budgetVerdict`. Three grades, and NO 2014 encounter multipliers —
that omission is the whole 2024 delta, and it makes this more correct than DDB's
standalone tool (which still runs 2014 math). Pinned by a mutation-proof test:
all 60 table cells against an independent transcription plus the SRD's own three
worked examples.

Two `monster.ts` helpers back it and collapse a duplicated fallback: `monsterXp`
(the ONE `m.xp ?? xpForCr(cr)` chain — existence-based, so a harmless CR-0 "XP 0"
monster is honoured, not overwritten) and `CR_VALUES` (every legal CR, derived
from the XP table). `fmtXp` is lifted from `MonsterStatBlockCard` into `utils.ts`
as the shared XP formatter, and the card now reads XP through `monsterXp`.
