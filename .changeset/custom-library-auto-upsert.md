---
"d20-folio": minor
---

feat(sheet): homebrew is kept automatically — create and edit both upsert the library

The other half of "custom IS the library": there is no save gesture because every
create and every edit keeps itself.

- **Create** — each Custom form commit (spell · gear · armor · weapon · feature) lands
  on the character AND upserts the same homebrew into the account library by kind +
  name. Silent: the creation is its own feedback, so no second toast narrates the
  bookkeeping.
- **Edit** — the sheet-side custom edit seams (the spells tab's field/component
  writers, the inventory's weapon + equipment field writer, the feature editor's save)
  upsert too, so a correction follows the entry everywhere. An SRD row never touches
  the library.
- **Debounced write** — those seams fire per keystroke/tap and each write rewrites the
  whole library doc, so `library-io.createLibraryWriter` coalesces a burst into ONE
  `setDoc` ~2 s later (the character auto-save cadence), flushed on teardown so a
  pending edit is never dropped. Memory state still updates instantly.
- Deletion stays sticky: only a real create/edit re-adds an entry.
