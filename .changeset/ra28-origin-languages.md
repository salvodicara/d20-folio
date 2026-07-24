---
"d20-folio": patch
---

feat(creation): choose your two origin languages when you make a character (RA-28)

Every 2024 character knows Common plus two more languages of your choice from the standard languages
table, but the wizard only ever seeded Common and left the two picks to be found by hand-editing the
Bio tab. Character creation now has a Languages step (in both Quick Start and the guided flow) where
you choose your two starting languages from the standard table, and Create stays blocked until you
have. The picks land as stable language ids, so they read in the right language on every surface; the
Bio editor stays the way to add any other tongue later.
