---
"d20-folio": minor
---

Combat Chronicle — the data seam: a structured, deterministic `CombatChronicleEvent`
feed that the DM's encounter tracker accumulates on the (existing, debounced)
encounter doc, plus the pure recorders that derive each beat (damage/heal + fall,
conditions, logged miss/pass — never a guessed attacker, never an inferred miss) and
the EN + IT prose presenter that renders the feed and builds the end-of-fight
Chronicle chapter.
