---
"d20-folio": patch
---

Add an in-app end-to-end regression for the auto-narrated Combat Chronicle: a
Playwright spec drives a real encounter through the actual surfaces (the sheet's
AttackDeclaration banner for a weapon swing, Magic Missile's multi-select, and
Fireball's area save; the DM hub's reconciled live feed across two rounds; the
editable end-of-combat entry; and the saved Chronicle chapter), so the real
`reconcileChronicle` engine generates the chronicle live rather than a bespoke
showcase. Backed by dev-bypass-only, production-tree-shaken seams: a scoped
own-PC encounter status for the sheet banner (`makeDevChronicleCombat`), a
localStorage seed for the party's declared attacks (`devDeclarations`, folded
into `usePartyCombatStates`), an optimistic turn advance + chronicle-append under
bypass (so the fight can step rounds and the saved chapter shows without
Firestore), and a Quarterstaff on the evoker dev scenario. No user-facing
behaviour changes.
