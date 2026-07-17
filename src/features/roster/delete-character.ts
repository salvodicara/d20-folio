/**
 * deleteCharacterAndDetach — the feature-layer use-case orchestrator behind a
 * roster "Delete" action.
 *
 * It composes two concerns that live in two different aggregates:
 *
 *   1. **Referential integrity (cross-aggregate).** A character can be assigned
 *      to a shared campaign, which holds a denormalized back-ref + frozen
 *      snapshot (`memberDetails.<uid>.characterId` / `.character`). Deleting the
 *      character without clearing that leaves a "ghost" hero in the party. So we
 *      first detach the character from EVERY shared campaign it is assigned to.
 *   2. **Sub-resource cascade (own aggregate).** Then we delete the character
 *      itself — its portrait, snapshots, and doc — via the pure engine primitive
 *      `deleteCharacter`.
 *
 * **Why this lives in the feature layer, not in `lib/firestore`:** the engine
 * (`src/lib`) is the lower layer and must never import the UI/feature layer
 * (`src/features`) — that inversion is enforced by
 * `architecture-direction.guard.test.ts`. `deleteCharacter` is a character-only
 * engine primitive; the campaign relationship is a feature concern
 * (`features/campaigns/campaign-io`). The only place that legitimately knows
 * about BOTH is a feature-layer orchestrator — here. Engine stays pure; the
 * cross-aggregate knowledge lives up where both features are already visible.
 *
 * Order matters: detach FIRST. If the later character delete fails, the
 * character is already gone from the party but still recoverable in the roster —
 * never the reverse (a deleted character still referenced by a live campaign).
 * Detach is a no-op when the character is in no shared campaign, so the common
 * single-player case costs exactly one cheap `listSharedCampaigns` read.
 */

import { deleteCharacter } from "@/lib/firestore";
import {
  listSharedCampaigns,
  setMemberCharacter,
} from "@/features/campaigns/campaign-io";

/**
 * Detach `charId` from every shared campaign the user has it assigned to, then
 * cascade-delete the character (portrait → snapshots → doc).
 *
 * @param uid    The signed-in owner's uid.
 * @param charId The character document id to delete.
 */
export async function deleteCharacterAndDetach(
  uid: string,
  charId: string
): Promise<void> {
  // 1. Cross-aggregate detach — scan the user's shared campaigns and clear the
  //    back-ref + snapshot + DM-readable sheet on every one that points at THIS
  //    character. The assignment lives ONLY on the campaign doc
  //    (`memberDetails[uid].characterId`) — the character never carries it — so
  //    the campaign is the only source of truth to scan. The user owns their own
  //    `memberDetails` entry + sheet copy (rules permit the self-detach + delete).
  const campaigns = await listSharedCampaigns(uid);
  await detachFrom(campaigns, uid, charId);
  // 2. Own-aggregate cascade — the engine primitive wipes portrait, snapshots,
  //    and the doc itself.
  await deleteCharacter(uid, charId);
}

/** Outcome of a bulk delete: how many of the requested ids actually went. */
export interface BulkDeleteResult {
  /** Characters fully deleted (detached + cascade succeeded). */
  deleted: number;
  /** Characters whose delete threw (left intact + still listed). */
  failed: number;
}

/**
 * Bulk variant behind the roster's multi-select "Delete" action. Same two
 * concerns as the single delete, but the shared-campaign list is fetched ONCE
 * (not once per id), then every character is detached + cascade-deleted
 * concurrently. Failures are isolated per-character (`allSettled`) so one bad
 * delete never aborts the rest — the caller reports the deleted/failed tally.
 *
 * Lives in the feature layer for the same reason as the single orchestrator: it
 * is the only place that legitimately knows about BOTH the character and the
 * campaign aggregates (engine stays pure; see the module header).
 */
export async function deleteCharactersAndDetach(
  uid: string,
  charIds: readonly string[]
): Promise<BulkDeleteResult> {
  const ids = [...new Set(charIds)];
  if (ids.length === 0) return { deleted: 0, failed: 0 };

  // ONE campaign-list read for the whole batch (the single orchestrator pays it
  // per id; bulk amortizes it across the selection — #7 free-tier read budget).
  const campaigns = await listSharedCampaigns(uid);
  const results = await Promise.allSettled(
    ids.map(async (charId) => {
      await detachFrom(campaigns, uid, charId);
      await deleteCharacter(uid, charId);
    })
  );
  const deleted = results.filter((r) => r.status === "fulfilled").length;
  return { deleted, failed: ids.length - deleted };
}

/**
 * Clear the back-ref + lite snapshot on every campaign pointing at `charId` (so
 * deleting a character leaves no ghost hero — the no-leaks rule). The character's
 * cross-user grant needs no cleanup (it derives live from the campaign doc): the doc itself is deleted immediately after,
 * taking the ACL with it.
 */
async function detachFrom(
  campaigns: Awaited<ReturnType<typeof listSharedCampaigns>>,
  uid: string,
  charId: string
): Promise<void> {
  await Promise.all(
    campaigns
      .filter((c) => c.memberDetails[uid]?.characterId === charId)
      .map((c) => setMemberCharacter(c.id, uid, null, null))
  );
}
