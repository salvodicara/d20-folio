---
"d20-folio": minor
---

Companions surface (engine): add the persistent-companion session model — a Beast
Master `companionVariant` pick and the Find Familiar `familiar` summon (form id +
Celestial/Fey/Fiend type swap + pocket-dimension state), round-tripped through the
v3 codec (malformed familiars dropped at the parse boundary, stale form ids kept)
and the store (`setCompanionVariant`, `summonFamiliar`, `setFamiliarDismissed`,
`dismissFamiliar`, all undoable). Add the `familiar-forms` grant kind (Pact of the
Chain widens the summon's eligible-form pool with the seven SRD special forms) and
the corpus-derived `resolveFamiliarForms` resolver (lazy-only). No user-visible UI
yet — this is the model + engine seam the Companions rail section and Find Familiar
flow build on.
