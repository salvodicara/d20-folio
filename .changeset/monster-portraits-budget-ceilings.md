---
"d20-folio": patch
---

chore(budget): raise precache + eager ceilings for the monster-portrait feature

The owner-approved custom-monster library + monster-portraits feature adds real
weight: the composed precache grows to 8243.51 KiB (new LAZY UI chunks — the
custom-monster editor, the Option-B portrait plate, the crop hook) and the eager
closure to 779.2 KB gz (the Option-B plate CSS in folio.css). Raise
`PRECACHE_CEILING_KIB` 8219 → 8255 and `EAGER_CEILING_KB` 779 → 782 with the
usual never-exact-fit headroom, and sync the baseline doc (ARCHITECTURE P3 table)
in the same commit.
