#!/usr/bin/env node
/**
 * migrate-shared-notes.ts — the ONE-OFF shared-notes migration (content-soft-reveal).
 *
 * Shared campaign notes moved from an inline `sharedNotes: SharedNote[]` ARRAY on the
 * campaign doc to per-note SUBCOLLECTION documents — `/campaigns/{campId}/notes/{id}`
 * (revealed) + `/campaigns/{campId}/dmNotes/{id}` (hidden) — so `firestore.rules` can
 * READ-gate each note's visibility by COLLECTION PATH (a flag on an array element can
 * never be read-gated). Every live campaign is still UN-MIGRATED at deploy time: its
 * notes sit in the legacy array and the subcollections are empty. The app's
 * load-boundary READ-FALLBACK (`mergeSharedNotes`, unioning the array with the
 * subcollections) keeps those campaigns correct BEFORE this runs; this script makes
 * the SUBCOLLECTION the source AFTER, deleting the legacy array so there is exactly
 * one home (golden rule 10 — no dual representation).
 *
 * For every `/campaigns/{campId}` document:
 *   • if it carries NO `sharedNotes` array (or an empty one) → already migrated / no
 *     notes. SKIP (the idempotency gate).
 *   • else → MIGRATE: for each note in the array, CREATE
 *     `/campaigns/{campId}/notes/{noteId}` from the legacy note (the doc id IS the
 *     note's `id`) — UNLESS a doc with that id already exists in EITHER `notes` OR
 *     `dmNotes` (a note already promoted by an in-app edit/pin/hide between deploy and
 *     this run). Every legacy note migrates to the members-readable `notes`
 *     collection: the `dmOnly` hide flag is NET-NEW, so NO live note is hidden — a
 *     note already moved to `dmNotes` is skipped, never resurrected as visible. THEN
 *     `deleteField` the `sharedNotes` array from the campaign doc.
 *
 * The note-create-BEFORE-array-delete order keeps a crash re-runnable: a re-run SKIPs
 * the now-existing notes and re-issues the still-pending array delete. Re-running a
 * fully-migrated database is a no-op.
 *
 * `--check` runs a READ-ONLY survey instead: how many campaigns still carry a legacy
 * array, how many notes total, and how many of those note ids ALREADY exist in a
 * subcollection (a partially-migrated campaign). Writes nothing.
 *
 * SAFETY (the standard one-off admin-script pattern):
 *   • DRY-RUN by default — prints the planned per-campaign change; writes ONLY with
 *     `--apply`. `--dry-run` is accepted as the explicit default alias.
 *   • IDEMPOTENT + re-runnable — the per-note existence gate + the array-delete repair.
 *   • Needs GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account key (supplied
 *     by the owner at run time) — checked even in dry-run so the connection is real.
 *
 * RULE 10: this script lives in `scripts/` ONLY while it is needed and is DELETED (git
 * rm, with its test) once it has run on live data + been verified idempotent. Committed
 * now so the OWNER can run it; the orchestrator never runs it on prod.
 *
 * USAGE
 *   node --import ./scripts/alias-loader.mjs scripts/migrate-shared-notes.ts            # dry-run
 *   node --import ./scripts/alias-loader.mjs scripts/migrate-shared-notes.ts --apply    # write
 *   node --import ./scripts/alias-loader.mjs scripts/migrate-shared-notes.ts --check    # survey-only
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/key.json \
 *     node --import ./scripts/alias-loader.mjs scripts/migrate-shared-notes.ts --apply
 */

import { argv as processArgv, env, exit } from "node:process";
import { pathToFileURL } from "node:url";

type Json = Record<string, unknown>;

const isRecord = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const asString = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Does this campaign doc carry a NON-EMPTY legacy `sharedNotes` array (→ migrate)?
 * An absent/empty array means already-migrated or never-had-notes (→ skip). The
 * migrate-vs-skip discriminator.
 */
export function hasLegacyNotes(camp: Json): boolean {
  return Array.isArray(camp.sharedNotes) && camp.sharedNotes.length > 0;
}

/** The persisted shape of a `notes`-subcollection document (visibility is the
 *  COLLECTION, never a field — so no `dmOnly` is written here). `updatedAt` is the
 *  ORIGINAL value passed through (a Timestamp on the wire) to preserve note ordering;
 *  absent when the legacy note omitted it (the run-time fills `serverTimestamp`). */
export interface NoteDocData extends Json {
  title: string;
  content: string;
  pinned: boolean;
  createdBy: string;
  updatedAt?: unknown;
}

/**
 * Project ONE legacy array note → its `notes`-subcollection document fields (the doc
 * id is the note's own `id`, carried separately). All legacy notes are VISIBLE (the
 * `dmOnly` flag is net-new — no live note is hidden), so every note lands in the
 * members-readable `notes` collection; `dmOnly` is never written. The original
 * `updatedAt` is preserved (note ordering); a note that omitted it leaves the key off
 * so the run-time can stamp a `serverTimestamp`. Pure — mirrors the codec's defaults.
 */
export function legacyNoteToNoteDoc(note: Json): NoteDocData {
  const data: NoteDocData = {
    title: asString(note.title),
    content: asString(note.content),
    pinned: note.pinned === true,
    createdBy: asString(note.createdBy),
  };
  if (note.updatedAt !== undefined && note.updatedAt !== null) {
    data.updatedAt = note.updatedAt;
  }
  return data;
}

async function run(): Promise<void> {
  const apply = processArgv.includes("--apply");
  const check = processArgv.includes("--check");
  if (!env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      "This migration needs GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account key."
    );
    exit(1);
  }
  const { initializeApp, applicationDefault } = await import("firebase-admin/app");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();

  // ── --check: a READ-ONLY survey of the legacy frontier ───────────────────────
  if (check) {
    console.log("── CHECK: legacy sharedNotes survey (read-only) ──");
    const campaigns = await db.collection("campaigns").get();
    let withLegacy = 0;
    let totalNotes = 0;
    let alreadyInSub = 0;
    for (const campSnap of campaigns.docs) {
      const camp: Json = campSnap.data();
      if (!hasLegacyNotes(camp)) continue;
      withLegacy++;
      const notes = camp.sharedNotes as unknown[];
      for (const raw of notes) {
        if (!isRecord(raw)) continue;
        totalNotes++;
        const id = asString(raw.id);
        if (id.length === 0) continue;
        const [inNotes, inDm] = await Promise.all([
          campSnap.ref.collection("notes").doc(id).get(),
          campSnap.ref.collection("dmNotes").doc(id).get(),
        ]);
        if (inNotes.exists || inDm.exists) alreadyInSub++;
      }
    }
    console.log(
      `\nScanned ${campaigns.size} campaigns — ${withLegacy} still carry a legacy ` +
        `sharedNotes array (${totalNotes} notes; ${alreadyInSub} already in a subcollection).`
    );
    return;
  }

  console.log(apply ? "── APPLY ──" : "── DRY-RUN (use --apply to write) ──");

  let scanned = 0;
  let migratedCampaigns = 0;
  let skippedCampaigns = 0;
  let notesCreated = 0;
  let notesSkipped = 0;

  // ONE bounded query across every campaign doc.
  const campaigns = await db.collection("campaigns").get();
  for (const campSnap of campaigns.docs) {
    scanned++;
    const camp: Json = campSnap.data();
    if (!hasLegacyNotes(camp)) {
      skippedCampaigns++;
      continue;
    }
    migratedCampaigns++;
    const path = campSnap.ref.path;
    const notes = camp.sharedNotes as unknown[];
    for (const raw of notes) {
      if (!isRecord(raw)) continue;
      const id = asString(raw.id);
      if (id.length === 0) {
        console.warn(`! ${path} — a legacy note has no id; skipping it`);
        continue;
      }
      // Skip a note already promoted into EITHER subcollection (an in-app
      // edit/pin/hide between deploy and now) — never resurrect a hidden note.
      const [inNotes, inDm] = await Promise.all([
        campSnap.ref.collection("notes").doc(id).get(),
        campSnap.ref.collection("dmNotes").doc(id).get(),
      ]);
      if (inNotes.exists || inDm.exists) {
        notesSkipped++;
        continue;
      }
      const noteData = legacyNoteToNoteDoc(raw);
      if (noteData.updatedAt === undefined)
        noteData.updatedAt = FieldValue.serverTimestamp();
      notesCreated++;
      if (apply) await campSnap.ref.collection("notes").doc(id).set(noteData);
      console.log(
        `${apply ? "✓ created" : "· would create"} notes/${id} ` +
          `"${noteData.title}" pinned=${noteData.pinned} — ${path}`
      );
    }
    // Note-create BEFORE array-delete (a crash stays re-runnable).
    if (apply) {
      await campSnap.ref.update({
        sharedNotes: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    console.log(
      `${apply ? "✓ cleared" : "· would clear"} legacy sharedNotes array — ${path}`
    );
  }

  console.log(
    `\nDone — scanned: ${scanned} campaigns; ${apply ? "migrated" : "to migrate"}: ` +
      `${migratedCampaigns}; skipped (no legacy array): ${skippedCampaigns}; ` +
      `notes ${apply ? "created" : "to create"}: ${notesCreated}; ` +
      `notes skipped (already in a subcollection): ${notesSkipped}.`
  );
}

// Execute ONLY when invoked directly (`node … scripts/migrate-shared-notes.ts`); a
// unit test imports the pure helpers above WITHOUT triggering the live Firestore run.
if (processArgv[1] && import.meta.url === pathToFileURL(processArgv[1]).href) {
  run().catch((err: unknown) => {
    console.error(err);
    exit(1);
  });
}
