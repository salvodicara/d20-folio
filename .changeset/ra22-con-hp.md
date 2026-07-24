---
"d20-folio": patch
---

fix(hp): retro-adjust stored max HP when Constitution is edited on the sheet (RA-22)

Editing your Constitution directly on the sheet now retroactively adjusts your maximum HP across
every level, in both directions, exactly as the 2024 rules require and as the level-up flow already
did. A rise raises your maximum, a decrease lowers it, and an even-to-odd bump that doesn't change
your Constitution modifier leaves it untouched. A hand-pinned or rolled maximum is shifted by the
same amount rather than reset to the average, so your deviation is preserved. Nothing changes on
load — only an explicit edit rebakes the value.
