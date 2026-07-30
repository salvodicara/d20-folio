---
"d20-folio": patch
---

Companions convergence (pass 2): the rail reads the companion card views
directly — the write-only `CompanionRowVM` union and its two builders are gone,
`buildCompanionCardViews` aggregates the owner's grants ONCE (was three passes
across the rail and the familiar panel, which now takes `formIds` as a prop),
and the ±HP micro-stepper is ONE shared `CompanionHpStepper` instead of three
verbatim copies. Behaviour, i18n, and every aria-label unchanged.
