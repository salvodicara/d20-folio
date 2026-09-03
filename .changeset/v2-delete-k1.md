---
"d20-folio": patch
---

Delete the K1 command kernel (`src/lib/command`, its orphan types, the Functions bundle step and wrappers, its two tests) on `v2`: nothing in the app or the deployed Functions called it (ADR-0004).
