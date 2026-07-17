---
"d20-folio": minor
---

Repatriated the 11 held-back SRD subclass features (Hunter's Prey, Superior Hunter's Defense,
Draconic Resilience/Spells/Dragon Wings/Dragon Companion, Dark One's Own Luck, Hurl Through Hell,
Evocation Savant, Sculpt Spells, Overchannel) from the content pack to the public SRD catalogue
with freshly sourced SRD 5.2.1 prose (EN verbatim CC-BY, IT per the D2 cascade) — the four SRD
subclasses (Hunter, Draconic Sorcery, Fiend Patron, Evoker) now ship complete in SRD-only mode.
The now-empty `dataOverlay.subclassFeatureIds` escape hatch was deleted from the pack seam
(the pack-subclass composition itself — `withPackSubclasses` in `src/data/classes.ts` — remains;
only the data-overlay branch died).
