---
"d20-folio": patch
---

Apply the stage-1 review: a roll is consumed by at most one action and only by the entity it was rolled for (`roll-consumed`, `roll-roller-mismatch`); the seam's options are a discriminated union (`app` draws a seed, `manual` requires faces); the grammar accepts a leading sign, refuses `0dN`, formulas without dice and flat terms above 1000; the roll purposes are a runtime tuple registered with the i18n dynamic-key guard; golden replays compare whole rejections.
