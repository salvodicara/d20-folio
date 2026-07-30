---
"d20-folio": patch
---

fix(library): a kept item remembers that it tracks its uses

`toLibraryEntry` stripped `tracked` from equipment as if it were play state. It isn't:
it is the authored tracking MODE, the same tier as `isConsumable` / `isPotion` /
`potionFormula`, which all survive — the play value is the `quantity` it counts, and
that is still stripped. The strip made the pencil's round-trip lossy: editing a
"track uses" homebrew opened the form on "None", and saving silently dropped the mode
again (its prefill branch could never fire). Now the mode is kept, the form reopens on
it, and a save preserves it.
