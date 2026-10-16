/**
 * delete-user-plan — the PURE decision logic behind the `deleteUser` callable
 * (admin-godmode part b).
 *
 * The Cloud Function (`index.ts`) does the IO (read caller role, query campaigns,
 * recursive-delete, Storage purge, Auth delete, audit write); these helpers hold the
 * branchy, security-relevant DECISIONS so they can be unit-tested WITHOUT the
 * emulator (mirroring how `issue-format.ts` / `signup-email.ts` keep their logic
 * pure). No Firebase imports.
 */

/** The minimal campaign shape the plan reasons over (a subset of the app's
 *  `CampaignDoc`). The function passes the raw Firestore data through. */
export interface CampaignLike {
  members: string[];
  memberDetails: Record<
    string,
    { role?: string; characterId?: string | null } | undefined
  >;
  dmUid: string;
}

/**
 * How a single campaign must change when `deletedUid` is removed:
 *   - `delete` — the user was the campaign's ONLY member; nothing meaningful
 *     remains, so the whole campaign doc (and its subcollections) is removed.
 *   - `update` — strip the user from `members` + `memberDetails`; if they were the
 *     DM, PROMOTE the first remaining member to DM (DM-orphaning handled — never
 *     leave a live campaign with a dangling `dmUid`), so the table stays playable.
 */
export type CampaignPlan =
  | { kind: "delete" }
  | {
      kind: "update";
      members: string[];
      memberDetails: Record<string, { role?: string; characterId?: string | null }>;
      dmUid: string;
    };

/**
 * Decide one campaign's mutation when `deletedUid` leaves. Pure + idempotent: if
 * `deletedUid` isn't actually a member the result is still a well-formed `update`
 * that no-ops (the IO layer writes it anyway, harmlessly). DM-orphaning: when the
 * leaver is the `dmUid`, the first remaining member is promoted (its `memberDetails`
 * role set to `"dm"`) so no remaining-member campaign is stranded DM-less.
 */
export function planCampaignUpdate(c: CampaignLike, deletedUid: string): CampaignPlan {
  const members = (c.members ?? []).filter((u) => u !== deletedUid);
  // No members left → the campaign is empty; remove it wholesale.
  if (members.length === 0) return { kind: "delete" };

  const memberDetails: Record<string, { role?: string; characterId?: string | null }> =
    {};
  for (const [uid, detail] of Object.entries(c.memberDetails ?? {})) {
    if (uid !== deletedUid && detail) memberDetails[uid] = { ...detail };
  }

  let dmUid = c.dmUid;
  if (c.dmUid === deletedUid) {
    // DM-orphaning: promote the first remaining member (deterministic: members[0]).
    dmUid = members[0];
    const promoted = memberDetails[dmUid];
    if (promoted) memberDetails[dmUid] = { ...promoted, role: "dm" };
  }

  return { kind: "update", members, memberDetails, dmUid };
}

/** A co-member's attached character whose cross-user ACLs (`campaignReaders` /
 *  `dmReaders`) still list the leaver and must have them removed. */
export interface AclTarget {
  ownerUid: string;
  charId: string;
}

/**
 * The OTHER members' attached characters in a campaign the leaver shared — each
 * still carries `deletedUid` in its `campaignReaders` (every co-member) and possibly
 * `dmReaders` (if the leaver DM'd), so the function must `arrayRemove` the leaver
 * from both arrays on each. Excludes the leaver's own characters (deleted wholesale)
 * and members with no attached character (nothing to clean).
 */
export function coMemberAclTargets(c: CampaignLike, deletedUid: string): AclTarget[] {
  const targets: AclTarget[] = [];
  for (const [uid, detail] of Object.entries(c.memberDetails ?? {})) {
    if (uid === deletedUid || !detail) continue;
    if (detail.characterId) targets.push({ ownerUid: uid, charId: detail.characterId });
  }
  return targets;
}

/**
 * Typed-confirm guard: the callable payload carries the target's email; the function
 * re-reads the target `/users` doc and this asserts the stored email matches (case-
 * insensitive, trimmed) before ANY delete — so a wrong/stale uid can never nuke a
 * different account than the admin confirmed. Returns whether they match.
 */
export function emailMatches(
  storedEmail: string | undefined | null,
  confirmEmail: string | undefined | null
): boolean {
  const norm = (s: string | undefined | null): string => (s ?? "").trim().toLowerCase();
  const a = norm(storedEmail);
  const b = norm(confirmEmail);
  return a.length > 0 && a === b;
}

/**
 * Who may delete which account. An admin may delete anyone but themselves (their
 * own deletion would orphan the console mid-run); since 2026-10-16 every player
 * may delete their own account without asking (GDPR erasure, Phase 5). Codes are
 * the `HttpsError` codes the callable throws.
 */
export type DeletionAuthorization =
  | { ok: true; selfService: boolean }
  | {
      ok: false;
      code:
        | "unauthenticated"
        | "invalid-argument"
        | "permission-denied"
        | "failed-precondition";
    };

export function authorizeAccountDeletion(input: {
  callerUid: string | undefined;
  callerIsAdmin: boolean;
  targetUid: string;
}): DeletionAuthorization {
  const { callerUid, callerIsAdmin, targetUid } = input;
  if (!callerUid) return { ok: false, code: "unauthenticated" };
  if (!targetUid) return { ok: false, code: "invalid-argument" };
  if (targetUid === callerUid) {
    return callerIsAdmin
      ? { ok: false, code: "failed-precondition" }
      : { ok: true, selfService: true };
  }
  return callerIsAdmin
    ? { ok: true, selfService: false }
    : { ok: false, code: "permission-denied" };
}
