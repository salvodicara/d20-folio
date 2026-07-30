---
"d20-folio": patch
---

fix(sheet): a homebrew rename MOVES its library entry, and a refused keep says so

Two holes in "custom IS the library", closed together because both come from the entry
identity being (kind, name):

- **Rename ghost** — renaming a custom row on the sheet used to upsert under the new
  name and leave the old-named entry behind forever. Every edit seam (the spells tab's
  field writer, the inventory's weapon + equipment writers, the feature editor) now
  passes the PRE-edit name to `libraryStore.syncFromCharacter`, which removes the stale
  entry once the new one lands — a rename moves the template, never duplicates it. It
  moves only after a SUCCESSFUL upsert, so at the free-tier cap (where the append is
  refused) the original template survives instead of vanishing.
- **Silent at-cap loss** — a creation made while the library is full no longer pretends
  to have been kept: the item still lands on the sheet and a notice explains that the
  custom list is full, so the player knows to prune it. The per-keystroke edit seam
  stays silent by design (a notice per character typed would be spam), and now says so
  in a comment where the outcome is ignored.
