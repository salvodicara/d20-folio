---
"d20-folio": patch
---

fix(bestiary): pin the onSuccess↔print correlation + IT condition-casing sweep

Two ratified corpus-consistency rulings enforced across the shipped bestiary.

- **The `onSuccess` classification rule.** Every save entry's stored `onSuccess` now correlates
  with its EN catalogue print: `"half"` ⟺ a bare `Success: Half damage[ only].` sentence,
  `"special"` ⟺ an initial-save `Success:` sentence that is anything else, `"none"` ⟺ no initial
  Success sentence (`Failure or Success:` recharge footers and staged `First/Second Failure` prose
  do not count). Three drifted entries were realigned on the real composed data (never a regex over
  the TS source): `ancient-silver-dragon.paralyzing-breath` special → none and
  `basilisk.petrifying-gaze` special → none (both print only First/Second Failure, no Success
  sentence), and `bulette.deadly-leap` half → special (its Success still pushes the target, so it is
  not bare half). A new `monster-corpus.guard.test.ts` row (§F.11) derives the mandated value from
  the print and asserts it `=== entry.onSuccess` for every save entry, policing all future waves.

- **IT condition-lexeme casing.** Closed-set condition lexemes used as status descriptors in IT
  monster prose are Title-Case (`è Afferrato`, `cade a terra Prono`); abstract nouns and the
  monster's own active verb stay lowercase. Swept the IT catalogue and Title-Cased 33 lowercase
  status descriptors across 23 entries (including the two flagged violations,
  `cockatrice.petrifying-bite` and `constrictor-snake.constrict`), leaving `invisibilità`/`paralisi`
  and `aboleth`'s `ha afferrato` verb untouched. The convention is now recorded in
  `docs/IT_NAME_REGISTRY.md`.
