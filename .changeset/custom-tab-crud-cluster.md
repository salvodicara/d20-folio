---
"d20-folio": minor
---

feat(sheet): the Custom tab's rows get one right-edge action cluster, and edit-in-place

Owner round-3 feedback on the homebrew tab:

- **One cluster, on the name line.** Each row now reads name + meta on the left with all
  three actions — add-to-sheet · edit · delete — as a single right-edge icon cluster,
  top-aligned with the name (the add glyph used to float mid-row, and sitting right
  after the name it read as a magic-item suffix rather than a control). Every glyph is
  a house `IconButton` with hover/focus chrome, and its label names the action ("Add
  Emberfang Blade to the sheet").
- **Edit-in-place completes CRUD.** The pencil reopens the SAME create form, prefilled
  from that entry, with the CTA reading "Save changes"; Back returns without saving.
  Saving updates the entry by ID — so a rename keeps the entry (and absorbs a collision
  with another kept name) instead of leaving a ghost — and deliberately does NOT touch
  any character: a library entry is a template, and the copies already on your sheets
  are independent of it (the same one-way relationship the delete confirm teaches).

The three forms gained ONE optional `libraryEdit` prop rather than being forked, and the
"Edit {{name}}" aria merged into `common.editNamed` (the features tab's pencil reroutes
to it) so the app has one canonical label for that control.
