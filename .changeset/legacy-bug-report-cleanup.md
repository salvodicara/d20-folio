---
"d20-folio": patch
---

One-off prod cleanup: purged the 10 pre-retarget `/bug_reports` docs (old-tracker issue numbers,
unreconcilable against the public tracker) and their 7 surviving Storage screenshots (0 orphaned
files) — snapshot-first, idempotent, verified post-apply; the spent script was removed once the
run verified clean. The inbox now holds only reports that mirror open public issues.
