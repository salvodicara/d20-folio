---
---

The `combat/state` write seam is now as closed as the read seam: `combatStateWriteData` refuses a payload with no valid v1 `playState` instead of persisting a child the app's reader would refuse forever, and `defaultCombatState` seeds the empty v1 owner so a first write still lands a complete shape. One vocabulary for the fail-closed read (`Invalid character document: missing-combat-state`), a guard pinning the pre-cutover readers to the migration script alone, and the subdoc section of the architecture map reconciled to v1.
