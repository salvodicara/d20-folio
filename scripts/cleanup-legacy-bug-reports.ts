#!/usr/bin/env node
/**
 * cleanup-legacy-bug-reports.ts — the ONE-OFF purge of pre-retarget `/bug_reports`
 * docs (and their Storage screenshots) whose `issueNumber` references the OLD
 * private tracker.
 *
 * The issue tracker moved to the PUBLIC `salvodicara/d20-folio` repo (retarget
 * deployed 2026-07-17 ~17:30Z). Reports created BEFORE the retarget carry issue
 * numbers from the old tracker — unreconcilable, and number-colliding with new
 * public issues — so the admin inbox can never resolve them. GitHub (the old
 * tracker) keeps their content; the Firestore docs + screenshots are spent.
 *
 * Classification: LEGACY = `createdAt` < 2026-07-17T18:00:00Z (a safe boundary
 * after the retarget deploy; a missing `createdAt` also counts as legacy — no
 * post-retarget doc can lack the server timestamp). Everything at/after the
 * boundary is KEPT (currently exactly one: the owner's test → public issue #2).
 * ALSO swept: ORPHANED Storage files under `bug-reports/` with no corresponding
 * doc among the keepers.
 *
 * SAFETY (rule 22's mandatory migration protocol):
 *   • DRY-RUN by default — prints the full classification; writes ONLY with `--apply`.
 *   • SNAPSHOT before delete — `--apply` first writes every affected doc as JSON and
 *     downloads every affected screenshot into the backup dir (BACKUP_DIR env var or
 *     `--backup <dir>`), then deletes.
 *   • Storage object FIRST, then doc — a partial failure leaves the doc, so a re-run
 *     retries; object-not-found is a no-op (IDEMPOTENT).
 *   • `--check` = READ-ONLY post-apply verify: exits non-zero if any legacy doc or
 *     orphaned file remains.
 *   • Needs GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account key.
 *
 * RULE 10: lives in `scripts/` only until it has run on live data and been verified;
 * then it is `git rm`'d (with its test).
 *
 * USAGE
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/key.json \
 *     node --import ./scripts/alias-loader.mjs scripts/cleanup-legacy-bug-reports.ts             # dry-run
 *   … --apply --backup /path/to/backup                                                           # snapshot + delete + verify
 *   … --check                                                                                    # read-only verify
 */

import { argv as processArgv, env, exit } from "node:process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** First moment AFTER the tracker retarget deploy — everything before is legacy. */
export const RETARGET_BOUNDARY = new Date("2026-07-17T18:00:00Z");

/** The production Storage bucket (VITE_FIREBASE_STORAGE_BUCKET). */
const BUCKET = "d20-folio.firebasestorage.app";

export interface ReportRow {
  id: string;
  createdAt: Date | null;
  issueNumber: number | null;
  screenshotPath: string | null;
}

/**
 * PURE classification: legacy (pre-boundary or timestamp-less) vs keep.
 * Unit-tested without Firestore.
 */
export function classifyReports(rows: readonly ReportRow[]): {
  legacy: ReportRow[];
  keep: ReportRow[];
} {
  const legacy: ReportRow[] = [];
  const keep: ReportRow[] = [];
  for (const row of rows) {
    (row.createdAt === null || row.createdAt < RETARGET_BOUNDARY ? legacy : keep).push(
      row
    );
  }
  return { legacy, keep };
}

/**
 * PURE orphan sweep: Storage paths under `bug-reports/` that no surviving doc
 * references (via `screenshotPath`).
 */
export function orphanedFiles(
  filePaths: readonly string[],
  referencedPaths: ReadonlySet<string>
): string[] {
  return filePaths.filter((p) => !referencedPaths.has(p));
}

function describe(row: ReportRow): string {
  const when = row.createdAt ? row.createdAt.toISOString() : "no createdAt";
  const issue = row.issueNumber === null ? "no issue" : `issue #${row.issueNumber}`;
  const shot = row.screenshotPath ?? "no screenshot";
  return `${row.id} · ${when} · ${issue} · ${shot}`;
}

async function run(): Promise<void> {
  const apply = processArgv.includes("--apply");
  const check = processArgv.includes("--check");
  const backupFlag = processArgv.indexOf("--backup");
  const backupDir =
    (backupFlag !== -1 ? processArgv[backupFlag + 1] : undefined) ?? env.BACKUP_DIR ?? "";
  if (!env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      "This cleanup needs GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account key."
    );
    exit(1);
  }
  if (apply && !backupDir) {
    console.error("--apply needs a snapshot destination: --backup <dir> or BACKUP_DIR.");
    exit(1);
  }
  const { initializeApp, applicationDefault } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const { getStorage } = await import("firebase-admin/storage");
  initializeApp({ credential: applicationDefault(), storageBucket: BUCKET });
  const db = getFirestore();
  const bucket = getStorage().bucket();

  // ── Gather: every /bug_reports doc + every bug-reports/ Storage file ─────────
  const snap = await db.collection("bug_reports").get();
  const rows: ReportRow[] = snap.docs.map((d) => {
    const data = d.data();
    const created = data.createdAt as { toDate?: () => Date } | undefined;
    return {
      id: d.id,
      createdAt: created?.toDate ? created.toDate() : null,
      issueNumber: typeof data.issueNumber === "number" ? data.issueNumber : null,
      screenshotPath:
        typeof data.screenshotPath === "string" ? data.screenshotPath : null,
    };
  });
  const [files] = await bucket.getFiles({ prefix: "bug-reports/" });
  const filePaths = files.map((f) => f.name);

  const { legacy, keep } = classifyReports(rows);
  const keptPaths = new Set(
    keep.flatMap((r) => (r.screenshotPath ? [r.screenshotPath] : []))
  );
  // Orphans = files referenced by NO doc at all… plus, after the legacy docs go,
  // the legacy screenshots (deleted with their docs, not as orphans).
  const referencedByAnyDoc = new Set(
    rows.flatMap((r) => (r.screenshotPath ? [r.screenshotPath] : []))
  );
  const orphans = orphanedFiles(filePaths, referencedByAnyDoc);

  // ── --check: read-only verify — clean means only keepers remain ─────────────
  if (check) {
    console.log("── CHECK (read-only) ──");
    console.log(`docs: ${rows.length} · legacy remaining: ${legacy.length}`);
    for (const row of legacy) console.log(`  ✗ legacy: ${describe(row)}`);
    for (const row of keep) console.log(`  ✓ keep:   ${describe(row)}`);
    const strayFiles = orphanedFiles(filePaths, keptPaths);
    console.log(
      `storage files: ${filePaths.length} · not-a-keeper's: ${strayFiles.length}`
    );
    for (const p of strayFiles) console.log(`  ✗ stray file: ${p}`);
    if (legacy.length > 0 || strayFiles.length > 0) exit(1);
    console.log("CLEAN — only keepers remain.");
    return;
  }

  console.log(apply ? "── APPLY ──" : "── DRY-RUN (use --apply to write) ──");
  console.log(`boundary: ${RETARGET_BOUNDARY.toISOString()}`);
  console.log(`docs: ${rows.length} → keep ${keep.length}, delete ${legacy.length}`);
  for (const row of keep) console.log(`  ✓ KEEP    ${describe(row)}`);
  for (const row of legacy) console.log(`  ✗ DELETE  ${describe(row)}`);
  console.log(
    `storage files: ${filePaths.length} · orphaned (no doc): ${orphans.length}`
  );
  for (const p of orphans) console.log(`  ✗ DELETE orphan ${p}`);

  if (!apply) return;

  // ── SNAPSHOT everything affected before any delete ──────────────────────────
  const docsDir = join(backupDir, "docs");
  const shotsDir = join(backupDir, "screenshots");
  mkdirSync(docsDir, { recursive: true });
  mkdirSync(shotsDir, { recursive: true });
  for (const row of legacy) {
    const d = snap.docs.find((doc) => doc.id === row.id);
    if (!d) continue;
    writeFileSync(
      join(docsDir, `${row.id}.json`),
      JSON.stringify(d.data(), (_k, v: unknown) => v, 2)
    );
  }
  const toDownload = [
    ...legacy.flatMap((r) => (r.screenshotPath ? [r.screenshotPath] : [])),
    ...orphans,
  ];
  for (const path of toDownload) {
    const dest = join(shotsDir, path.replaceAll("/", "__"));
    try {
      await bucket.file(path).download({ destination: dest });
      console.log(`  ⬇ snapshotted ${path}`);
    } catch (err) {
      console.warn(`  ⚠ could not snapshot ${path} (continuing):`, err);
    }
  }
  console.log(`snapshot written to ${backupDir}`);

  // ── APPLY: storage object FIRST, then doc (idempotent, log-and-skip) ────────
  let docsDeleted = 0;
  let filesDeleted = 0;
  for (const row of legacy) {
    try {
      if (row.screenshotPath) {
        try {
          await bucket.file(row.screenshotPath).delete();
          filesDeleted++;
        } catch (err: unknown) {
          const code = (err as { code?: number }).code;
          if (code !== 404) throw err;
        }
      }
      await db.collection("bug_reports").doc(row.id).delete();
      docsDeleted++;
      console.log(`  ✓ deleted ${row.id}`);
    } catch (err) {
      console.warn(`  ⚠ failed on ${row.id} (re-run to retry):`, err);
    }
  }
  for (const path of orphans) {
    try {
      await bucket.file(path).delete();
      filesDeleted++;
      console.log(`  ✓ deleted orphan ${path}`);
    } catch (err) {
      console.warn(`  ⚠ failed on orphan ${path} (re-run to retry):`, err);
    }
  }
  console.log(
    `\nDone — docs deleted: ${docsDeleted}/${legacy.length}; files deleted: ${filesDeleted}. ` +
      "Now run --check to verify."
  );
}

// Execute ONLY when invoked directly; the unit test imports the pure helpers.
if (processArgv[1] && import.meta.url === pathToFileURL(processArgv[1]).href) {
  run().catch((err: unknown) => {
    console.error(err);
    exit(1);
  });
}
