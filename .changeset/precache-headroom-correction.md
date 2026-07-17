---
"d20-folio": patch
---

Fixed the exact-fit knife-edge that flipped the pre-push gate: the 2026-07-17 `PRECACHE_CEILING_KIB`
re-baseline (7151→7247) landed exactly on the measured build (7247.22 KiB), so the very next rebuild
tripped the guard on gzip/build noise alone — the same failure mode as the 2026-07-16 eager-closure
knife-edge. Raised `PRECACHE_CEILING_KIB` 7247→7250 (+3 KiB of deliberate, deterministic headroom;
no new asset weight) and codified a "never re-baseline exact-fit" policy in the guard's raise-protocol
comment (`tests/unit/bundle-budget.guard.test.ts`) and in the P3 ceilings table
(`docs/ARCHITECTURE.md`), citing both knife-edge flips so future raises always clear the measured
value by a margin.
