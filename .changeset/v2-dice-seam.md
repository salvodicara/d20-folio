---
"d20-folio": patch
---

The dice seam `src/lib/dice.ts`: `roll(formula, { by, roller, reason, hidden, mode, faces })` builds a verified `roll` action body — an app roll from one 32-bit seed, a manual roll from the entered faces — the only place in the app that draws randomness for dice (ADR-0010).
