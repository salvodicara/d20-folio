---
"d20-folio": patch
---

Roadmap capture (docs-only): record the owner's reusable custom-monster library idea (2026-08-01) as
a named CANDIDATE rung on the DDB-parity homebrew ladder — "custom IS the library" applied to
MONSTERS. A DM who builds a custom monster inside an encounter has it silently auto-saved to a
reusable ACCOUNT-level library, droppable into any encounter/campaign, editable/deletable, and never
rebuilt. Framed as the ladder's monster-editor rung (charter rung (c)) reusing the SHIPPED
homebrew-library infra (libraryStore / library-io / LibraryEntry + the "custom IS the library"
pattern) — extended with a `monster` kind on LIBRARY_KINDS / LibraryDraft (or a sibling monster
library if the encounter-monster shape doesn't fit the per-character custom-item union) — wired into
the encounter Add-monster modal's Custom tab (encounter-bestiary.tsx / the AddMonsterForm in
party-encounter.tsx) as a "your custom monsters" list: auto-save on create, tap-to-add, edit/delete.
DDB-parity angle: DDB has a monster/homebrew library. Because it touches the same AddMonsterForm as
the in-flight encounter-polish + the combat-chronicle epic, it sequences after those; priority stays
the owner's call.
