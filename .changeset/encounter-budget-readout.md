---
"d20-folio": minor
---

feat(campaign): DM XP-budget encounter difficulty readout

The DM-facing half of the 2024-DMG difficulty calculator (DDB-parity epic). A new
`buildBudgetView` selector grades the running encounter — the party's XP budget off
its members' LIVE class levels vs. the summed monster XP — and a compact
`EncounterBudgetReadout` shows the verdict (Low / Moderate / High / Over High) plus
the costed total in two places: the encounter round bar and, ticking live as you
pick, the Add-monster modal (SRD Step 3 is literally "deduct as you add"). DM-only —
players never see it, sparing the metagame.

Two ways to cost the monsters the picker can't: the custom-monster form gains an
optional CR select (the DM picks a CR, sees its XP, and the group is costed), and a
statblock's lair-XP alternative ("or 13,000 in lair") gets a toggle in the DM
statblock disclosure. The verdict withholds itself honestly — while a party member's
sheet is still loading, when no monster is costed yet, and with an un-costed marker
whenever a group carries no XP, so the grade always reads as a floor, never a guess.
Both themes and both languages (EN + IT) throughout.
