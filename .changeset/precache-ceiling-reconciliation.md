---
"d20-folio": patch
---

The PWA precache ceiling is re-baselined to a measured value (9033 → 9055 KiB). The 9033 figure was
never reproducible from the tree that set it — a fresh composed build of that commit measures
9043.09 KiB / 301 entries against the 9022.6 KiB / 300 it recorded — so the ceiling sat ~20 KiB
below its own tree and the next full build was always going to trip it. Nothing heavy entered the
precache: the manifest is the same 301 entries with only content-hash renames, no new
image/font/public asset, and the eager closure is unchanged. The guard's audit trail also gains the
two raises (binding corners, quickbuild) that had only ever been recorded in `docs/ARCHITECTURE.md`,
so both trails read the same history again.
