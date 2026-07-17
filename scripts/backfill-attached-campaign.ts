#!/usr/bin/env node
/**
 * backfill-attached-campaign.ts — the ONE-OFF migration for the live-derived
 * cross-user access model (the initiative-SSOT re-architecture).
 *
 * `firestore.rules` now derives EVERY cross-user grant (a peer reading a teammate's
 * sheet, the DM combat-writing a member's HP/conditions) LIVE from the character's
 * `attachedCampaignId` pointer + the campaign roster. The pointer is written
 * atomically by the attach transaction (B07) — but characters attached BEFORE that
 * transaction existed may lack it, and without it their owner's teammates/DM lose
 * the cross-user read/write the moment the new rules deploy. This script backfills
 * the pointer from the campaigns' own `memberDetails` (the membership SSOT), and
 * sweeps the now-dead denormalized ACL fields (`dmReaders` / `campaignReaders`) off
 * every character doc (rule 10 — the superseded representation is removed entirely;
 * nothing reads them anymore).
 *
 * For every `/campaigns/{campId}` → every `memberDetails[uid].characterId`:
 *   • the char doc `/users/{uid}/characters/{charId}`:
 *       – pointer ABSENT            → SET `attachedCampaignId: campId`;
 *       – pointer == campId         → SKIP (idempotency gate);
 *       – pointer == ANOTHER camp   → WARN + leave (two campaigns claim one char —
 *         the one-campaign invariant is broken upstream; surfaced for the owner,
 *         never silently rewritten);
 *       – char doc MISSING          → WARN (a dangling roster ref) + skip.
 * Then ONE collection-group sweep over every `characters` doc deleting any lingering
 * `dmReaders` / `campaignReaders` field (attached or not).
 *
 * ORDER: pointer backfill FIRST, residue sweep second — a crash between the two
 * leaves the system fully functional (the residue fields are inert), and a re-run
 * SKIPs the already-pointed chars and re-issues only the still-pending deletes.
 * Re-running a fully-migrated database is a no-op.
 *
 * `--check` runs a READ-ONLY survey: how many attached chars still lack the pointer,
 * how many docs still carry ACL residue. Writes nothing.
 *
 * SAFETY (the standard one-off admin-script pattern):
 *   • DRY-RUN by default — prints the planned per-char change; writes ONLY with
 *     `--apply`. `--dry-run` is accepted as the explicit default alias.
 *   • IDEMPOTENT + re-runnable (the equality gate + field-delete repair).
 *   • Needs GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account key
 *     (supplied by the owner at run time) — checked even in dry-run.
 *
 * RULE 10 / RULE 22: this script lives in `scripts/` ONLY while it is needed and is
 * DELETED (git rm, with its test) once it has run on live data + been verified. RUN
 * AT DEPLOY TIME, immediately AFTER `firebase deploy` ships the new rules. The
 * expected pointer-backfill count on prod is ZERO: the 2026-07-10 one-off
 * `attachedCampaignId` backfill (see `.changeset/backfill-attached-campaign-id.md`)
 * already stamped every live attached character — phase 1 here is the verifying belt
 * to that suspender (`--check` proves it), and phase 2 (the ACL-residue sweep) is the
 * genuinely new work.
 *
 * USAGE
 *   node --import ./scripts/alias-loader.mjs scripts/backfill-attached-campaign.ts            # dry-run
 *   node --import ./scripts/alias-loader.mjs scripts/backfill-attached-campaign.ts --apply    # write
 *   node --import ./scripts/alias-loader.mjs scripts/backfill-attached-campaign.ts --check    # survey-only
 */

import { argv as processArgv, env, exit } from "node:process";
import { pathToFileURL } from "node:url";

type Json = Record<string, unknown>;

const isRecord = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** One attached (uid, charId) pair off a campaign's memberDetails. */
export interface AttachedRef {
  uid: string;
  charId: string;
}

/** Every attached (uid, charId) the campaign's `memberDetails` claims — the roster
 *  side of the backfill (pure, unit-pinned). Ignores members with no character and
 *  malformed entries. */
export function attachedRefsOf(camp: Json): AttachedRef[] {
  const details = camp.memberDetails;
  if (!isRecord(details)) return [];
  const out: AttachedRef[] = [];
  for (const [uid, entry] of Object.entries(details)) {
    if (!isRecord(entry)) continue;
    const charId = entry.characterId;
    if (typeof charId === "string" && charId.length > 0) out.push({ uid, charId });
  }
  return out;
}

/** The backfill decision for one char doc (pure, unit-pinned): what to do given the
 *  char's current pointer vs the campaign claiming it. */
export function pointerAction(
  current: unknown,
  campId: string
): "set" | "skip" | "conflict" {
  if (typeof current !== "string" || current.length === 0) return "set";
  return current === campId ? "skip" : "conflict";
}

/** Does a char doc still carry the dead denormalized ACL fields? (pure, unit-pinned) */
export function hasAclResidue(char: Json): boolean {
  return "dmReaders" in char || "campaignReaders" in char;
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

  // ── Phase 1: the pointer backfill (campaign roster → char doc claim) ─────────
  const campaigns = await db.collection("campaigns").get();
  let toSet = 0;
  let pointed = 0;
  let conflicts = 0;
  let dangling = 0;
  for (const campSnap of campaigns.docs) {
    for (const { uid, charId } of attachedRefsOf(campSnap.data())) {
      const ref = db.doc(`users/${uid}/characters/${charId}`);
      const snap = await ref.get();
      if (!snap.exists) {
        dangling++;
        console.warn(`! ${campSnap.id} → ${ref.path} — roster points at a MISSING char`);
        continue;
      }
      const action = pointerAction(snap.data()?.attachedCampaignId, campSnap.id);
      if (action === "skip") {
        pointed++;
        continue;
      }
      if (action === "conflict") {
        conflicts++;
        console.warn(
          `! ${ref.path} — claims campaign ${String(snap.data()?.attachedCampaignId)} ` +
            `but ${campSnap.id} also lists it; left untouched (owner decides)`
        );
        continue;
      }
      toSet++;
      console.log(`  ${ref.path} ← attachedCampaignId: ${campSnap.id}`);
      if (apply && !check) await ref.update({ attachedCampaignId: campSnap.id });
    }
  }

  // ── Phase 2: the ACL-residue sweep (dmReaders / campaignReaders → gone) ──────
  const chars = await db.collectionGroup("characters").get();
  let residue = 0;
  for (const snap of chars.docs) {
    if (!hasAclResidue(snap.data())) continue;
    residue++;
    if (check) continue;
    console.log(`  ${snap.ref.path} — deleting dmReaders/campaignReaders residue`);
    if (apply) {
      await snap.ref.update({
        dmReaders: FieldValue.delete(),
        campaignReaders: FieldValue.delete(),
      });
    }
  }

  const mode = check ? "CHECK (read-only)" : apply ? "APPLY" : "DRY-RUN";
  console.log(
    `\n[${mode}] campaigns: ${campaigns.size} · pointers already set: ${pointed} · ` +
      `to backfill: ${toSet} · conflicts: ${conflicts} · dangling refs: ${dangling} · ` +
      `chars with ACL residue: ${residue} / ${chars.size}`
  );
}

// Only run when executed directly (the unit test imports the pure helpers).
if (import.meta.url === pathToFileURL(processArgv[1] ?? "").href) {
  run().catch((err: unknown) => {
    console.error(err);
    exit(1);
  });
}
