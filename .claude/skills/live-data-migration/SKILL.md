---
name: live-data-migration
description: Change data stored in production Firestore, Auth claims or Storage. Use when a change rewrites stored characters, campaigns, users or claims, or when a deploy needs a migration.
---

# Live-data migration

Stored characters are never lost. Every change to live data follows the same ladder, and the owner
says yes before each apply.

1. **Snapshot.** Back up exactly what the change touches (`gcloud firestore export`, or the script's own
   `--backup <fresh absolute private dir>`, or a claims snapshot file). Keep it outside the repo and
   outside synced folders (`~/Workspace/Codex/…`). Done when the snapshot exists and its path is noted.
2. **Dry run.** Run the script read-only (`--check` or its default). Report counts and issue codes,
   never payloads. Done when the plan is printed and every issue is explained.
3. **Owner's yes.** Show the owner the dry-run counts in plain Italian and ask. Done on an explicit yes
   for this apply.
4. **Idempotent apply.** `--apply`. Any single issue blocks the whole batch; fix the document and go
   back to step 2.
5. **Verify.** Re-run the check; it must report nothing pending. Re-run it again right before the
   deploy that needs it.

Credentials come from the owner at run time (`GOOGLE_APPLICATION_CREDENTIALS` or their gcloud login);
they never enter the repo, logs or memory. Scripts run with
`node --import ./scripts/alias-loader.mjs scripts/<name>.ts`, which composes the private pack the way
the app does. Order and limits of the existing migrations: `docs/RELEASE.md` → "Migrate before you
deploy". Content-pack claims: `scripts/pack/pack-access.ts` (`list`, then `grant … --apply`).
