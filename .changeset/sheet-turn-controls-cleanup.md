---
"d20-folio": patch
---

The sheet's redundant "Previous turn / Next turn" controls are gone. They rendered only in a
live encounter on the player's own turn, but the turn meter's gilded End Turn already routes the
same shared `advanceEncounterTurn` transaction (and also runs the local end-of-turn finalization
the raw "Next turn" skipped), and "Previous turn" is the DM's correction tool — it stays in the
campaign hub's encounter controls. One control per job: the sheet passes the turn with End Turn.
