---
"d20-folio": patch
---

docs: the "custom IS the library" model in ARCHITECTURE + PROGRESS

`docs/ARCHITECTURE.md`'s library subsection now states the owner-ratified model — no
save gesture, no manager surface; create and edit auto-upsert by (kind, name), the
Custom tab's trash is the only curation and a deletion sticks, and a rename leaves the
old entry because the sheet item carries no entry id. It also names the new pieces:
`customDraftAt`, `syncFromCharacter`, and the debounced `createLibraryWriter`
(`LIBRARY_WRITE_DEBOUNCE_MS`), plus the renamed `CustomTabBody`. `PROGRESS.md`'s rung
(a) entry is rewritten to the shipped shape.
