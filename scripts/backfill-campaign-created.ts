#!/usr/bin/env node
/**
 * backfill-campaign-created.ts — the ONE-OFF live-data backfill of the campaign
 * `createdAt` start date.
 *
 * WHY. `createCampaign` used to route its two `serverTimestamp()` sentinels THROUGH
 * `stripUndefined` (fixed in the same change as this script — src/features/campaigns/
 * campaign-io.ts). A `FieldValue` sentinel is a plain class instance with one
 * enumerable field (`_methodName`), so `stripUndefined` — which special-cases only
 * `Date`/`Timestamp` — recursed INTO it and flattened the sentinel to a dead
 * `{ _methodName: "serverTimestamp" }` map. Firestore then persisted that map instead
 * of stamping the server time, so an app-created campaign's `createdAt` read back as a
 * plain object (never a Timestamp) and the campaigns-list card's "Iniziata {date}"
 * ("Started {date}") never rendered. `updatedAt` self-healed on the next update (which
 * adds it OUTSIDE `stripUndefined`); `createdAt`, written once at creation, stayed
 * broken. The code fix repairs NEW campaigns; this script repairs the EXISTING ones.
 *
 * WHAT. For every `/campaigns/{id}` document that LACKS a valid `createdAt` (absent OR
 * the broken `{ _methodName }` map — anything that is not a genuine Firestore
 * Timestamp), matched by exact campaign NAME:
 *   • "La Compagnia del Carretto (Siciliano)" → 2026-02-02 (owner-specified start);
 *   • "test" (DM Salvatore Di Cara)           → 2026-06-30 (owner placeholder).
 * A named target that ALREADY has a valid `createdAt` is SKIPPED (idempotent). Any
 * OTHER campaign that lacks a valid `createdAt` but is NOT one of the two named targets
 * is LEFT UNTOUCHED and FLAGGED in the report, so the owner is aware of it and can
 * decide a date out-of-band (this script never invents a date for an un-named doc).
 * Only `createdAt` is written — `updatedAt` (the "Attiva {relative}" line) is never
 * touched, so the backfill can't disturb a campaign's recency ordering.
 *
 * SAFETY (the standard one-off admin-script pattern, mirrors `migrate-shared-notes.ts`):
 *   • DRY-RUN by default — prints the full per-campaign survey (name · DM · has-createdAt
 *     · planned action); writes ONLY with `--apply`. `--dry-run` is the explicit default
 *     alias.
 *   • IDEMPOTENT + re-runnable — the valid-Timestamp gate; re-running a repaired DB is a
 *     no-op.
 *   • Needs GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account key (supplied by
 *     the owner at run time) — checked even in dry-run so the connection is real.
 *
 * RULE 10: this script lives in `scripts/` ONLY while it is needed and is DELETED (git
 * rm, with its test) once it has run on live data + been verified idempotent. Committed
 * now so the OWNER can run it; the orchestrator never runs it on prod.
 *
 * USAGE
 *   node --import ./scripts/alias-loader.mjs scripts/backfill-campaign-created.ts            # dry-run
 *   node --import ./scripts/alias-loader.mjs scripts/backfill-campaign-created.ts --apply    # write
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/key.json \
 *     node --import ./scripts/alias-loader.mjs scripts/backfill-campaign-created.ts --apply
 */

import { argv as processArgv, env, exit } from "node:process";
import { pathToFileURL } from "node:url";

type Json = Record<string, unknown>;

const isRecord = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const asString = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * The owner-specified start dates, keyed by EXACT campaign name. Noon UTC is used
 * deliberately: the card renders only the calendar date via `toLocaleDateString`, and
 * noon UTC keeps that calendar date stable (Feb 2 / Jun 30) in every realistic viewer
 * timezone — a midnight-UTC value could slip a day earlier for a viewer behind UTC.
 */
export const TARGET_DATES: Readonly<Record<string, string>> = {
  "La Compagnia del Carretto (Siciliano)": "2026-02-02T12:00:00.000Z",
  test: "2026-06-30T12:00:00.000Z",
};

/**
 * The start `Date` this script would stamp for a campaign of `name`, or `null` when the
 * name is not one of the two owner-specified targets (→ the script leaves it untouched,
 * only flags it). PURE (no Firestore) so the name→date mapping is unit-tested without a
 * live run; `run()` wraps the result in `Timestamp.fromDate` at write time.
 */
export function plannedDateForName(name: string): Date | null {
  const iso = TARGET_DATES[name];
  return iso ? new Date(iso) : null;
}

/**
 * Is `value` a genuine Firestore `Timestamp` (a `toDate()`-carrying object)? Duck-typed
 * — same discriminator the app's read boundary uses (`timestampsToDates`) — so it needs
 * no `firebase-admin` import and matches both a real admin Timestamp and a test double.
 * The BROKEN `{ _methodName: "serverTimestamp" }` map the bug wrote is a plain object
 * with NO `toDate`, so it correctly reads as "not a valid Timestamp".
 */
export function isTimestampLike(value: unknown): value is { toDate: () => Date } {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  );
}

/**
 * Does this campaign already carry a VALID `createdAt` (a real Timestamp)? The
 * idempotency gate: `true` → SKIP (already good). `false` → it lacks a usable start
 * date (absent, or the broken `{ _methodName }` sentinel-map) and is a backfill
 * candidate. PURE — unit-tested with a Timestamp double and a broken map.
 */
export function hasValidCreatedAt(camp: Json): boolean {
  return isTimestampLike(camp.createdAt);
}

/** The DM's display name for a campaign doc (for the report), or "?" when unknown. */
function dmDisplayName(camp: Json): string {
  const dmUid = asString(camp.dmUid);
  const members: Json = isRecord(camp.memberDetails) ? camp.memberDetails : {};
  const entry = members[dmUid];
  const dm: Json = isRecord(entry) ? entry : {};
  return asString(dm.displayName) || asString(camp.createdBy) || "?";
}

async function run(): Promise<void> {
  const apply = processArgv.includes("--apply");
  if (!env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      "This backfill needs GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account key."
    );
    exit(1);
  }
  const { initializeApp, applicationDefault } = await import("firebase-admin/app");
  const { getFirestore, Timestamp } = await import("firebase-admin/firestore");
  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();

  console.log(apply ? "── APPLY ──" : "── DRY-RUN (use --apply to write) ──");

  let scanned = 0;
  let backfilled = 0;
  let skippedValid = 0;
  const flagged: string[] = [];

  // ONE bounded query across every campaign doc.
  const campaigns = await db.collection("campaigns").get();
  for (const campSnap of campaigns.docs) {
    scanned++;
    const camp: Json = campSnap.data();
    const name = asString(camp.name);
    const dm = dmDisplayName(camp);
    const hasCreated = hasValidCreatedAt(camp);
    const planned = plannedDateForName(name);
    const path = campSnap.ref.path;

    // Per-campaign survey line (EVERY campaign — the owner asked for full visibility).
    console.log(
      `• "${name}" — DM ${dm} — createdAt: ${hasCreated ? "present" : "MISSING"} — ${path}`
    );

    if (hasCreated) {
      skippedValid++;
      continue; // idempotent: a valid start date is left exactly as-is
    }
    if (!planned) {
      // Lacks a start date but is NOT a named target — never guess a date; flag it.
      flagged.push(`"${name}" (DM ${dm}) — ${path}`);
      console.log(`  ↳ FLAG: no createdAt and not a named target — left UNTOUCHED`);
      continue;
    }
    backfilled++;
    const date = planned.toISOString().slice(0, 10);
    if (apply) {
      await campSnap.ref.update({ createdAt: Timestamp.fromDate(planned) });
    }
    console.log(`  ↳ ${apply ? "SET" : "would set"} createdAt = ${date}`);
  }

  console.log(
    `\nDone — scanned: ${scanned} campaigns; ${apply ? "backfilled" : "to backfill"}: ` +
      `${backfilled}; skipped (already valid): ${skippedValid}; ` +
      `flagged (missing, un-named — untouched): ${flagged.length}.`
  );
  if (flagged.length > 0) {
    console.log(
      "\nFLAGGED (missing createdAt, NOT a named target — decide a date out-of-band):"
    );
    for (const f of flagged) console.log(`  · ${f}`);
  }
}

// Execute ONLY when invoked directly (`node … scripts/backfill-campaign-created.ts`); a
// unit test imports the pure helpers above WITHOUT triggering the live Firestore run.
if (processArgv[1] && import.meta.url === pathToFileURL(processArgv[1]).href) {
  run().catch((err: unknown) => {
    console.error(err);
    exit(1);
  });
}
