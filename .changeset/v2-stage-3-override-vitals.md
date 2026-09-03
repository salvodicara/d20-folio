---
"d20-folio": patch
---

An `override` on `vitals.hp` or `vitals.life` now directly patches the entity, matching the
design's "DM's last word" invariant — previously it was recorded in the audit trail but silently
had no effect on anything but `stats.ac`/`stats.speed`.
