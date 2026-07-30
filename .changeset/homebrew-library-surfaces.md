---
"d20-folio": minor
---

feat(sheet): save homebrew to a reusable library, and add it to any character

The player-facing half of the homebrew library (DDB-parity epic, rung (a)). Homebrew
authored on one sheet is now reusable across every character:

- **Save** — a custom spell / gear / armor / weapon / feature card carries a
  bookmark glyph inside its existing edit-action cluster (no new chrome). One shared
  `SaveToLibraryButton` resolves the item from the live character at click time,
  promotes it to a template (play state stripped), and announces "saved" vs
  "updated" — re-saving an edited homebrew replaces its entry instead of piling up
  near-duplicates. At the free-tier cap it explains instead of writing.
- **Add** — a "My Library" tab joins the Add-Spell, Add-Item and Add-Feature modals
  (pools first, authoring last), each showing only its own kinds and landing an entry
  through the same commit path the Custom forms use. One shared `LibraryPickerBody`
  serves all three: search + one row per entry (name · kind · its cheapest fact),
  with a quiet hint when the library is still empty.
- **Manage** — a "Homebrew library" section on `/settings` lists every entry with its
  kind and deletes one behind the house confirm dialog. Characters that already use
  an entry keep their copy.

Also: `ModalTabSwitcher` went N-tab (a `tabs` array, id generic over the caller's
union) and `AddItemModal`'s private three-tab copy was deleted — one tab strip for
all four add-modals (golden rule 6). Full EN + IT copy; the library listener is
mounted once by `AppShell`, and it INJECTS the store's write seam (the
`combatPersistence` pattern) so the five cockpit cards that now render a save
affordance stay Firebase-free.
