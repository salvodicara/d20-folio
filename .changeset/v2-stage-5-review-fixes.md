---
---

Stage-5 review fixes: the Storage map rule evaluates the campaign predicate before the admin lookup (a DM without a profile document is not locked out); the upload adapter refuses a grid the reducer would reject before sending a byte; `planDrop` applies the move step's own budget test and requires `core:move`; relations are recomputed in sorted entity order; image and cell sizes have an upper bound; more proofs (a seeded rectangle-difference sweep, nested-key quarantine, an undo in the map replay, the DM of another campaign, a member's download URL).
