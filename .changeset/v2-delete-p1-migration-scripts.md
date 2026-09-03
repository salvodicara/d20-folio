---
"d20-folio": patch
---

Delete the P1/P3 migration scripts, their script-only legacy readers and tests, the Phase-2 handoff and the 2026-08-14 automation handoff on `v2`: the migrations run from `main`; `mergeCombatTrio` is exported for the tests that pin the trio merge; the pack twin drops its item-resource migration test on the pack's `v2` branch in the same motion.
