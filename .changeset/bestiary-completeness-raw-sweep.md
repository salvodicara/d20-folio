---
"d20-folio": minor
---

feat(bestiary): completeness — projection closure, the RAW beast sweep, initiative print-pins

Closes the bestiary campaign's final wave now that the public corpus is complete (330/330).

- **RAW Monstrosity sweep (user-visible correctness fix).** 2024 reclassified six
  Polymorph-catalogue animals as non-Beast: flying-snake, axe-beak, and giant-vulture are now
  **Monstrosity**; giant-eagle, giant-elk, and giant-owl are now **Celestial**. RAW, Polymorph
  grants **Beast forms only**, so these six are removed from the Polymorph catalogue
  (`src/data/beasts/beasts.ts` → 84 forms) and their now-orphaned `beasts.json` keys pruned in both
  locales (`attack.gouge`, unique to giant-vulture, goes with them; shared keys held). They
  simply stop being offered. A live session currently polymorphed into a removed form keeps its
  transient session state — the drop/revert path restores from the stored `prior` snapshot, and
  every render seam degrades gracefully on an unknown `beastId` (`resolveBeastFormAttacks` → `[]`;
  the active-form banner → the prod `⟦…⟧` sentinel, never a white-screen; the picker only ever
  offers surviving forms).

- **Projection completeness guard.** The beast→monster projection guard drops its intersection
  semantics and asserts COMPLETENESS: every beast resolves to a monster twin and DEEP-EQUALS its
  projection, the twin's `type` is pinned to `"beast"` (a future reclassification fails loud), and
  the public Beast count is pinned (84).

- **Initiative print-pins.** The monster-corpus guard pins all 330 SRD monsters' initiative bonus
  to their SRD 5.2.1 print (an id→bonus fixture), bidirectionally — catching both redundant
  overrides (already caught by §F.7) and silently-omitted ones, corpus-wide, forever. Zero
  mismatches found across the corpus.

- **One projection derivation.** `scripts/beast-projection.ts` is the sole source of the beast
  catalogue's values; the completeness guard owns it forever.
