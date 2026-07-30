---
"d20-folio": patch
---

The precache ceiling steps to 8967 KiB: the restored v0.22.0 chrome CSS re-adds the raw
bytes the chrome reset had trimmed (measured 8956.49 KiB on the composed lane, plus the
standing never-exact-fit headroom), ledgered in `docs/ARCHITECTURE.md`.
