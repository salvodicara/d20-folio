---
"d20-folio": patch
---

Test-only, no behaviour change: mobile-harden the damage-and-dying E2E. On the phone cockpit
(<1180px) the Right HUD — which carries the Active Features (Rage) toggle — folds behind a collapsed
"Resources" disclosure, so the raging-Barbarian intake spec's `beforeEach` could not reach the Rage
toggle and both typed-chip cases timed out on the `[mobile]` project. The spec now opens the
Resources disclosure before toggling Rage (a no-op on desktop, where the rail is always open),
mirroring the sibling shot specs' idiom. The HP popover's typed-chip flow itself is fully usable at
390px — chips, the live math line, and "Add another" all work — so the product surface is unchanged.
