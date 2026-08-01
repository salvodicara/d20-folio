---
"d20-folio": patch
---

Combat Chronicle Phase 1 (channel): the per-character `combat/state` subdoc now
carries a small capped ring of the player's DECLARED in-encounter attacks
(`recentActions`) — the budget-safe cross-user channel the DM's correlation layer will
read to auto-attribute hits and record misses. It rides the existing debounced
combat-state write (no new document, no new subscription): the character store mirrors
the ring like the combat round so every whole-object write preserves a just-declared
attack.
