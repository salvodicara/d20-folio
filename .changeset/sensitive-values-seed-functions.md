---
"d20-folio": patch
---

Sensitive-value cleanup: the emulator sandbox seed moves to `content-pack/scripts/` (it is fixture-bound) and reads the owner uid from `SEED_OWNER_UID` with a fail-loud guard instead of hardcoding it; the signup-email Cloud Function drops its hardcoded destination fallback — the `OWNER_EMAIL` secret is the only source, with a loud error log when unset.
