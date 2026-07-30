---
"d20-folio": minor
---

feat(lib): the account-level homebrew library — model, IO, store, rules

The engine half of the DDB-parity epic's homebrew ladder rung (a): a player's
homebrew stops being trapped inside one character. `src/lib/library.ts` promotes the
four per-character types (`CustomSpell` / `CustomFeature` / `CustomEquipment` /
`CustomWeapon`) to reusable account entries, and encodes the ONE rule the feature
rests on — a library entry is a TEMPLATE, not a copy of a sheet row:

- `toLibraryEntry` deep-copies and strips every per-character play value per kind
  (spell: prepared/notes/tags · equipment: equipped/quantity/tracked/attuned/notes
  with any charge pool wound back to full · weapon: quantity 1, notes/tags and both
  overrides dropped · feature: kept whole — its blocks/trackers/actions ARE the
  content).
- `upsertEntry` replaces the same (kind, name) IN PLACE, keeping the original id and
  list position, so re-saving an edited homebrew updates its template instead of
  growing near-duplicates.
- `entryToCharacterItem` lands a deep copy re-seeded with the SAME defaults the
  Custom creation forms produce, returning the kind-tagged pair so the caller's
  switch narrows to the array it appends to.

The module is pure (no Firebase, no i18n, no `Date.now()` — registered in the
pure-modules guard). `lib/library-io.ts` owns the Firestore seam on the
`users/{uid}/library/index` singleton (defensive read, full-doc `setDoc` overwrite
through `stripUndefined`, DEV_BYPASS no-op) on the `combat-state-io` pattern;
`stores/libraryStore.ts` holds the live list and the two optimistic mutations,
emitting outcomes (`saved`/`updated`/`full`/`unavailable`) rather than strings; the
single listener lives in `hooks/useLibrary.ts` and refuses to write from an
unhydrated store. `FREE_TIER_LIMITS.libraryEntries` (100) is mirrored in
`firestore.rules` — owner-only read/write plus a list + size guard, proved by
mutation in the emulator rules suite.
