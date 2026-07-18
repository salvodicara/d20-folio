---
"d20-folio": patch
---

One-off prod cleanup: purged the pre-retarget `/bug_reports` docs (old-tracker issue numbers,
unreconcilable against the public tracker) and their Storage screenshots, plus any orphaned
`bug-reports/` files — snapshot-first, idempotent, verified post-apply. The inbox now holds only
reports that mirror open public issues.
