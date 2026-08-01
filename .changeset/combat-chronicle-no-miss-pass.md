---
"d20-folio": patch
---

Combat Chronicle: remove the miss / pass logging entirely — the live log is now purely
the deterministic record of what LANDED (hits, heals, downs, conditions, rounds), zero
effort. A miss has no deterministic signal (no dice), and a per-turn button is the
friction the app avoids; missed swings and drama belong in the DM's narrative note at
the end entry, whose placeholder now hints at that role. Drops the `attack-miss` /
`turn-pass` event kinds, their recorders, the `MissPassLogger` UI, and their strings +
tests. The one-tap attribution, the live feed, and the end-entry Chronicle append are
unchanged.
