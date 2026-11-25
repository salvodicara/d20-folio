/**
 * delete-user-cascade — the IO of the `deleteUser` callable once the caller is
 * authorized (#1352). Kept apart from `index.ts` so the Firestore emulator can run
 * it: Auth and Storage come in as small functions.
 *
 * Contract:
 *   - only the leaver's own documents are deleted; another player's character,
 *     membership or character link is never written, except the campaign hand-over
 *     below;
 *   - each campaign the leaver is in changes in ONE transaction that re-reads it, so
 *     a change another player makes meanwhile is kept: the leaver and their
 *     character link leave, a DM's table goes to the first remaining member, and only
 *     a campaign with nobody else in it is deleted (with its subcollections);
 *   - every step is idempotent and Auth goes last, so a re-run after a half failure
 *     finishes the job: with the user document already gone, the Auth account's own
 *     email confirms the request and the rest of the cascade runs again.
 */
import type { Firestore } from "firebase-admin/firestore";
import { emailMatches, planCampaignUpdate, type CampaignLike } from "./delete-user-plan";

export interface DeletionDeps {
  db: Firestore;
  /** The server-timestamp sentinel of the same SDK copy as `db`. */
  serverTimestamp: () => unknown;
  /** Deletes every Storage object under a prefix; a failure is not fatal. */
  purgePrefix: (prefix: string) => Promise<void>;
  /** The Auth account's email, or null when there is no Auth account. */
  authEmail: (uid: string) => Promise<string | null>;
  /** Deletes the Auth account; absent is fine. */
  deleteAuthUser: (uid: string) => Promise<void>;
  /** Test seam: runs before each campaign's transaction. */
  beforeCampaignWrite?: (campaignId: string) => Promise<void>;
}

export class DeletionError extends Error {
  constructor(
    readonly code: "not-found" | "failed-precondition" | "internal",
    message: string
  ) {
    super(message);
  }
}

export interface DeletionCounts {
  characters: number;
  campaignsUpdated: number;
  campaignsDeleted: number;
}

export async function runAccountDeletion(
  deps: DeletionDeps,
  input: {
    callerUid: string;
    targetUid: string;
    confirmEmail: string;
    /** A player erasing their own account leaves no email in the audit. */
    selfService?: boolean;
  }
): Promise<DeletionCounts> {
  const { db } = deps;
  const { targetUid, confirmEmail } = input;

  // ── Typed confirm: the stored email, or the Auth account's on a re-run ──────
  const userRef = db.collection("users").doc(targetUid);
  const userSnap = await userRef.get();
  const storedEmail = userSnap.exists
    ? (userSnap.get("email") as string | undefined)
    : await deps.authEmail(targetUid);
  if (!userSnap.exists && storedEmail == null) {
    throw new DeletionError("not-found", "Target user not found (already deleted?).");
  }
  if (!emailMatches(storedEmail, confirmEmail)) {
    throw new DeletionError(
      "failed-precondition",
      "Confirmation email does not match the target account."
    );
  }

  const counts: DeletionCounts = {
    characters: 0,
    campaignsUpdated: 0,
    campaignsDeleted: 0,
  };

  // ── Characters (recursive: combat/ and snapshots/ go too) ───────────────────
  const charsCol = userRef.collection("characters");
  counts.characters = (await charsCol.get()).size;
  await db.recursiveDelete(charsCol);

  // ── Storage portraits ───────────────────────────────────────────────────────
  await deps.purgePrefix(`users/${targetUid}/`);

  // ── Campaigns: one transaction each, re-reading the campaign ────────────────
  const campaigns = await db
    .collection("campaigns")
    .where("members", "array-contains", targetUid)
    .get();
  for (const camp of campaigns.docs) {
    await deps.beforeCampaignWrite?.(camp.id);
    const outcome = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(camp.ref);
      if (!fresh.exists) return "none" as const;
      const data = fresh.data() as CampaignLike;
      if (!(data.members ?? []).includes(targetUid)) return "none" as const;
      const plan = planCampaignUpdate(data, targetUid);
      if (plan.kind === "delete") {
        tx.delete(camp.ref);
        return "deleted" as const;
      }
      tx.update(camp.ref, {
        members: plan.members,
        memberDetails: plan.memberDetails,
        dmUid: plan.dmUid,
      });
      return "updated" as const;
    });
    if (outcome === "deleted") {
      // the doc is gone (nobody can join it now); its subcollections follow
      await db.recursiveDelete(camp.ref);
      counts.campaignsDeleted++;
    } else if (outcome === "updated") counts.campaignsUpdated++;
  }

  // ── Their error and bug reports ─────────────────────────────────────────────
  for (const [collection, field] of [
    ["diagnostics", "uid"],
    ["bug_reports", "reporterUid"],
  ] as const) {
    const owned = await db.collection(collection).where(field, "==", targetUid).get();
    await Promise.all(owned.docs.map((doc) => db.recursiveDelete(doc.ref)));
  }
  await deps.purgePrefix(`bug-reports/${targetUid}/`);

  // ── The user doc with every subcollection ───────────────────────────────────
  await db.recursiveDelete(userRef);

  // ── Audit (who deleted whom, when, and the counts) ──────────────────────────
  await db.collection("admin_audit").add({
    action: input.selfService ? "deleteOwnAccount" : "deleteUser",
    actorUid: input.callerUid,
    targetUid,
    ...(input.selfService ? {} : { targetEmail: storedEmail ?? confirmEmail }),
    counts,
    at: deps.serverTimestamp(),
  });

  // ── Auth last (data before Auth) ────────────────────────────────────────────
  try {
    await deps.deleteAuthUser(targetUid);
  } catch {
    throw new DeletionError(
      "internal",
      "Account data removed, but Auth deletion failed."
    );
  }
  return counts;
}
