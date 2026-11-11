# Glossary

Terms the code uses with one fixed meaning. Short on purpose: one line of meaning, then
where it lives.

- **Edit log** (the DM's encounter edit log): the fight edits made on this device that the
  server has not confirmed yet, kept as the pure reducers the screen applied. The screen
  shows them over every server snapshot; they are sent as one transaction replayed onto the
  server's newest fight, or written whole when offline. With the moves, it is the only
  writer of a fight's contents: the campaign's autosave writes only its name.
  `src/features/campaigns/encounter-edit-log.ts` (pure), `encounter-edit-sync.ts` (wiring).
- **Move**: one transactional change to a fight, planned from the fight the server holds
  (`combat-lifecycle.ts`) and written by `combat-lifecycle-io.ts`; every move returns its
  undo.
- **Spends ledger**: what a hit from another device spent on a character's sheet (a ward
  filled, a claimed dodge used), appended to `combat/spends` and folded by the owner's
  sheet. `src/lib/play/peer-spends.ts`, `src/lib/peer-spends-io.ts`.
