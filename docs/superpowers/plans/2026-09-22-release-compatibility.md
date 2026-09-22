# Release 0.24.1 saved-character compatibility

The owner authorized push, release and GitHub Actions deployment. The released
commit is 1083e7986043f4a99cb052c779176cc5be5093cc; CI and Verify both passed.
The deployment's read-only identity check found six documents needing the
existing deterministic identity migration, with no malformed-data issues.
Promotion stopped before every Firebase write.

Use this isolated operational topic to inspect and, if the documented migration
is sufficient, recover compatibility with the released client. Never merge this
topic's replacement workflow into main or move the published release tag. The
main workflow continues to enforce both checks before deploying.

1. Dispatch the existing workflow filename from this topic with a pinned checkout
   of the released code and the exact pack commit from the green Verify. Supply
   the pack SHA as a validated dispatch input to keep the receipt out of public
   git history. Run both existing checks in read-only mode so the first
   failure does not hide the parent report. No credential creation or bypass.
2. Inspect the complete reports. The release runbook explicitly requires an
   idempotent identity re-apply when old clients have reintroduced missing IDs.
3. Before any required apply, prepare and independently review the exact operation.
   Reuse the released migration scripts: a complete preflight, recoverable backup,
   one update-time-guarded atomic batch, reread, global verification and idempotency.
   Export Firestore to the existing private backup bucket before writing. Preserve
   per-document backups privately; never upload character payloads as GitHub artifacts.
4. Re-run both checks, then dispatch the unchanged main deployment workflow for
   the already-released SHA. Verify the Action and the live app version.

Production data and backup receipts stay outside public git history. This first
operational revision is read-only. Application code and the migration code remain
exactly those of the verified release.
