# One-off migrations: read-only production check before deleting (2026-11-02)

Five July 2026 one-off scripts still sit in `scripts/` with tests and, for one, an app read fallback.
Each was meant to be deleted once it had run. This plan proves on production, **read-only**, that
each is done, then deletes it. Nothing here writes data. The owner runs the commands (they hold the
service-account key) or says yes to an agent running them; no `--apply` anywhere.

Setup, once: `export GOOGLE_APPLICATION_CREDENTIALS=/path/to/read-key.json` (a key the owner
supplies at run time; never stored in the repo, logs or docs).

| Script                       | Read-only command                                                                                        | Green means                                                    | Deleted when green                                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `backfill-attached-campaign` | `node --import ./scripts/alias-loader.mjs scripts/backfill-attached-campaign.ts --check`                 | 0 attached characters lack `attachedCampaignId`                | the script and its test                                                                                                      |
| `backfill-campaign-created`  | `node --import ./scripts/alias-loader.mjs scripts/backfill-campaign-created.ts` (dry-run is the default) | every campaign shows a real `createdAt`, planned action "none" | the script and its test                                                                                                      |
| `drop-playerhandle`          | `node --import ./scripts/alias-loader.mjs scripts/drop-playerhandle.ts --check`                          | 0 member entries still hold `playerHandle`                     | the script and its test                                                                                                      |
| `migrate-shared-notes`       | `node --import ./scripts/alias-loader.mjs scripts/migrate-shared-notes.ts --check`                       | 0 campaigns still hold the legacy `sharedNotes` array          | the script, its test, and the app read fallback `mergeSharedNotes` (campaign-io, campaignStore, SharedNotes, types/campaign) |

`survey-dead-effect-fields` ran on production 2026-11-03: every field 0. The script and its test are
gone; the engine keeps the readers, because the v0.25.0 client and main still write those fields.

**Result, 2026-11-03 (production, read-only):** `backfill-campaign-created` 4/4 valid,
`drop-playerhandle` 0, `migrate-shared-notes` 0: those three scripts, their tests and
`mergeSharedNotes` (with `evictLegacyNote` and `CampaignDoc.sharedNotes`) are deleted.
`backfill-attached-campaign --check`: 0 to backfill, 0 conflicts, 0 dangling, but 11/12 characters
still carry the dead `dmReaders` / `campaignReaders` fields (nothing reads or writes them). The
script is deleted; the guarded `clear-acl-residue` cleared the fields on 2026-11-10 after the
v0.26.0 deploy (owner's yes, 11 documents backed up, `--check` zero pending) and is deleted.
`migrate-item-resources` dry-run: 38 docs, 0 to change.

If any check is not green, nothing is deleted for that script; we report the counts and the owner
decides whether the pending migration runs (owner-gated, snapshot → dry-run → yes → apply → verify).

Kept regardless: `migrate-custom-identity`, `migrate-character-parents`, `migrate-item-resources`
(the deploy workflow gates on them until the held deploy ships), `backfill-role-claims` (#318), and
`migrate-statuses` ("prepared, not run": the engine session decides).
