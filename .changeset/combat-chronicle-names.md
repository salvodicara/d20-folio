---
"d20-folio": patch
---

Combat Chronicle: resolve a PC combatant's name from the denormalized member snapshot
(the same name the party cards show) so the feed, attribution chips, and end entry
always read the hero's name — never a transient "Someone" while the live doc loads,
and never a name that disagrees with the table. The dev-bypass encounter fixture seeds
a populated chronicle feed for the screenshot / a11y harness.
