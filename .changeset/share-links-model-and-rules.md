---
"d20-folio": minor
---

Public character share links, part 1 — the data model and the anonymous read grant. A character now
carries a single `shared` flag, and its Firestore document path is the link: with the flag on,
`firestore.rules` allows an unauthenticated `get` of that one document, so a friend without an
account can open the sheet. Turning the flag off revokes the link on the very next read. The grant is
`get`-only, so it can never be widened into a query that enumerates a player's shared characters, and
the snapshot/combat subcollections stay owner-only. The flag is document metadata, never part of the
portable character file, so exporting a shared character cannot publish it and importing one cannot
inherit it. Replaces the never-implemented `shareId` scaffolding and the unused public `/shared`
collection it pointed at.
