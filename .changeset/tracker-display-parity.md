---
"d20-folio": patch
---

Tracker DISPLAY parity, fixed at the one shared presenter seam (`tracker-view`) so surfaces agree by
construction:

- The compendium mechanics grid now renders a scaling `total` formula as localized prose
  ("5 × Paladin level" / "5 × livello da Paladino") instead of the raw "level\*5" token — browse has
  no character to resolve the formula against. A fixed number stays a number; a class feature scopes
  its "level" term to its class; genuinely un-presentable arithmetic shows the intent
  ("scales with level").
- A dawn-recharge pool (a magic item's daily charges) now shows the SAME Long-Rest badge on the
  resource rail as on the Features tab — both surfaces read one shared recovery-bucket classifier, so
  they can never disagree again (a Long Rest resets dawn pools, so dawn folds to Long Rest on every
  on-screen surface).
