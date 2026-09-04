---
---

Remove the write-back shape that could brick a live character: `leaveTable`'s personal write-back is the legacy document alone, so no caller can put an `Encounter` on the path the old sheet's `CombatState` owns.
