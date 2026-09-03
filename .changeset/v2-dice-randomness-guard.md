---
"d20-folio": patch
---

Guard: every production file that calls a random source is pinned with its reason; dice go through `src/lib/dice.ts` only.
