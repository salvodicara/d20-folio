---
"d20-folio": minor
---

feat(sheet): custom IS the library — one Custom tab, no save gesture, no manager page

Owner-directed rework of the homebrew library's surface. The bookmark "save to
library" glyph and the `/settings` manager section are GONE (and with them their i18n
keys): a player never curates a library by hand. Each Add-X modal is back to its
original tab count, and its **Custom** tab is now the whole surface — the player's own
homebrew of that kind, list + create in one place:

- rows are the add-to-sheet buttons, each with a trash glyph beside it (the ONLY
  delete, behind the house confirm dialog, moved here from the deleted Settings
  section);
- a "Create …" bar swaps the body to the EXISTING create form, with a Back affordance;
- an empty library opens straight on the create form with one line saying that what
  you create is kept, so a first-timer never meets a blank list.

`LibraryPickerBody` became `CustomTabBody` (the name now says what it is). The
generic confirm title merged to `common.deleteTitle` (the roster's copy of it is
rerouted) so the new confirm reuses one canonical key.
