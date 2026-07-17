#!/usr/bin/env node
/**
 * drop-playerhandle.ts — the ONE-OFF live-data purge of the dropped `playerHandle`
 * member field.
 *
 * The per-campaign table handle (`memberDetails.<uid>.playerHandle`) has been removed
 * from the model + every consumer: the join flow no longer writes it, and every read
 * already falls back to the account `displayName`. An extra stored field is harmless
 * (ignored on read), but golden rule 10 forbids a lingering dead representation — this
 * script DELETES the leaf from every live campaign doc so there is exactly one shape.
 *
 * For every `campaigns/{id}`:
 *   • for each `memberDetails.<uid>` entry that still physically carries a
 *     `playerHandle` key → `FieldValue.delete()` that NESTED leaf (never the member
 *     entry itself — that would wipe the member). One `update` per campaign.
 *   • an entry with no `playerHandle` (a fresh joiner, or the DM's own setDoc entry
 *     that never wrote it) is left untouched — so re-running is a no-op (IDEMPOTENT).
 *
 * `--check` runs a READ-ONLY verify instead: counts how many member entries still
 * carry the leaf and exits non-zero if any remain, so it doubles as a post-apply gate.
 *
 * SAFETY (the standard one-off admin-script pattern, mirrors
 * `migrate-shared-notes.ts`):
 *   • DRY-RUN by default — prints the planned per-doc change; writes ONLY with `--apply`.
 *     `--dry-run` is accepted as the explicit default alias.
 *   • IDEMPOTENT + re-runnable — the leaf-presence gate; re-running a clean DB is a no-op.
 *   • Needs GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account key (supplied by
 *     the owner at run time) — checked even in dry-run so the connection is real.
 *
 * RULE 10: this script lives in `scripts/` ONLY while it is needed and is DELETED (git
 * rm, with its test) once it has run on live data + been verified idempotent. Committed
 * now so the OWNER can run it; the orchestrator never runs it on prod.
 *
 * USAGE
 *   node --import ./scripts/alias-loader.mjs scripts/drop-playerhandle.ts            # dry-run
 *   node --import ./scripts/alias-loader.mjs scripts/drop-playerhandle.ts --apply    # write
 *   node --import ./scripts/alias-loader.mjs scripts/drop-playerhandle.ts --check    # verify-only
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/key.json \
 *     node --import ./scripts/alias-loader.mjs scripts/drop-playerhandle.ts --apply
 */

import { argv as processArgv, env, exit } from "node:process";
import { pathToFileURL } from "node:url";

type Json = Record<string, unknown>;

const isRecord = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The dotted `memberDetails.<uid>.playerHandle` leaf paths still present in a
 * campaign's `memberDetails` map — one per entry that physically carries the key.
 * PURE (no Firestore) so it can be unit-tested without a live run; `run()` maps each
 * path to `FieldValue.delete()`.
 */
export function playerHandlePaths(memberDetails: Json): string[] {
  return Object.entries(memberDetails)
    .filter(([, detail]) => isRecord(detail) && "playerHandle" in detail)
    .map(([uid]) => `memberDetails.${uid}.playerHandle`);
}

async function run(): Promise<void> {
  const apply = processArgv.includes("--apply");
  const check = processArgv.includes("--check");
  if (!env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      "This cleanup needs GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account key."
    );
    exit(1);
  }
  const { initializeApp, applicationDefault } = await import("firebase-admin/app");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();

  // ── --check: count any surviving playerHandle leaves (READ-ONLY) ──────────────
  if (check) {
    console.log("── CHECK: surviving playerHandle leaves (read-only) ──");
    const campaigns = await db.collection("campaigns").get();
    let remaining = 0;
    for (const campSnap of campaigns.docs) {
      const camp: Json = campSnap.data();
      const memberDetails = isRecord(camp.memberDetails) ? camp.memberDetails : {};
      remaining += playerHandlePaths(memberDetails).length;
    }
    console.log(
      `\nScanned ${campaigns.size} campaigns — ${remaining} member entr${
        remaining === 1 ? "y" : "ies"
      } still carry playerHandle.`
    );
    if (remaining > 0) exit(1);
    return;
  }

  console.log(apply ? "── APPLY ──" : "── DRY-RUN (use --apply to write) ──");

  let scanned = 0;
  let cleaned = 0;
  let skipped = 0;
  let leaves = 0;

  // ONE bounded query across every campaigns/{id}.
  const campaigns = await db.collection("campaigns").get();
  for (const campSnap of campaigns.docs) {
    scanned++;
    const camp: Json = campSnap.data();
    const memberDetails = isRecord(camp.memberDetails) ? camp.memberDetails : {};
    const paths = playerHandlePaths(memberDetails);
    if (paths.length === 0) {
      skipped++;
      continue;
    }
    const payload: Json = {};
    for (const path of paths) payload[path] = FieldValue.delete();
    cleaned++;
    leaves += paths.length;
    if (apply) await campSnap.ref.update(payload);
    console.log(
      `${apply ? "✓ cleaned" : "· would clean"} ${paths.length} leaf/leaves — ${campSnap.id}`
    );
  }

  console.log(
    `\nDone — scanned: ${scanned}; ${apply ? "cleaned" : "to clean"}: ${cleaned}; ` +
      `skipped (already clean): ${skipped}; total leaves removed: ${leaves}.`
  );
}

// Execute ONLY when invoked directly (`node … scripts/drop-playerhandle.ts`); a unit
// test imports the pure helper above WITHOUT triggering the live Firestore run.
if (processArgv[1] && import.meta.url === pathToFileURL(processArgv[1]).href) {
  run().catch((err: unknown) => {
    console.error(err);
    exit(1);
  });
}
