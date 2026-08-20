---
"d20-folio": patch
---

The sheet's core vital reads (hp/temp, death saves, spell-slot and tracker-pool usage, exhaustion, concentration, conditions) go through one character-vitals projection seam that reconciles the persisted engine world against the legacy session fields (session truth wins on any drift), so the write-through mirrors can later be deleted by flipping one module. Observable no-op.
