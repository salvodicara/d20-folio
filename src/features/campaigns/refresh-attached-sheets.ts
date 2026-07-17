/**
 * refresh-attached-sheets — the feature-layer orchestrator that keeps the lite
 * party-member SNAPSHOTS reasonably live as the OWNER plays.
 *
 * The character auto-save (`useCharacterSubscription`) persists the owner's
 * character/session on a debounce. Whenever it does, this orchestrator refreshes
 * the lite `memberDetails[uid].character` party snapshot (name · classes · AC ·
 * HP · portrait) in every campaign the character is CURRENTLY attached to, so the
 * party card shows live AC/HP without read access to other members' private
 * character docs. The DM's FULL "View Sheet" no longer needs a fanned-out copy —
 * the DM reads the owner's REAL character doc via the live membership grant (the unified
 * read path), so only the peer-facing lite snapshot is refreshed here.
 *
 * **Why a feature-layer orchestrator (not in the engine / the hook body):** it
 * composes two aggregates — the character (passed in) and the campaign
 * (`campaign-io`). The engine (`src/lib`) must never import the campaign feature
 * (architecture-direction guard), and the hook should stay a thin wiring layer;
 * the cross-aggregate knowledge lives here, exactly like
 * `features/roster/delete-character.ts`.
 *
 * **Free-tier discipline (zero-budget NFR):**
 *   • The attached-campaign list is resolved LAZILY and ONCE per cockpit session
 *     (`AttachedCampaignTracker.ensure`): the first time a save fires we run ONE
 *     membership-scoped `listSharedCampaigns` read (the same `array-contains`
 *     query the rest of the app uses — never an enumeration) and cache the
 *     campaign ids where THIS character is attached. Merely viewing a sheet
 *     without editing costs nothing; a solo player (no shared campaigns) pays
 *     exactly that one read on their first edit and then fans out to NOBODY.
 *   • Each subsequent save fans out only to the cached attached campaigns —
 *     normally 0 or 1, occasionally 2. NEVER to all campaigns. So a save costs at
 *     most (attached-campaign-count) writes, on top of the single character write.
 *   • Fire-and-forget + self-swallowing: a failed/offline fan-out never blocks or
 *     fails the character save, and never loops (it issues campaign writes, which
 *     the character store does not read back).
 */

import type { CharacterDoc } from "@/types/character";
import type { MemberCharacterSnapshot } from "@/types/campaign";
import {
  listSharedCampaigns,
  setMemberCharacter,
} from "@/features/campaigns/campaign-io";
import { buildMemberSnapshot } from "@/features/campaigns/member-snapshot";

/**
 * Resolves, lazily and once, the campaign ids a given (owner, character) pair is
 * attached to — the bounded set the per-save fan-out targets. One instance per
 * cockpit subscription; thrown away on unmount, so the next open re-resolves
 * fresh (cheap: one membership-scoped read). `ensure()` returns the cached ids,
 * resolving them on the first call.
 */
export interface AttachedCampaignTracker {
  ensure: () => Promise<string[]>;
}

/** Build a tracker for `(uid, charId)`. Memoizes the in-flight + resolved read so
 *  the membership-scoped query runs at most once per cockpit session. */
export function createAttachedCampaignTracker(
  uid: string,
  charId: string
): AttachedCampaignTracker {
  let campaignIds: string[] | null = null;
  let resolving: Promise<string[]> | null = null;

  return {
    ensure(): Promise<string[]> {
      if (campaignIds) return Promise.resolve(campaignIds);
      if (!resolving) {
        resolving = listSharedCampaigns(uid)
          .then((campaigns) => {
            const ids = campaigns
              .filter((c) => c.memberDetails[uid]?.characterId === charId)
              .map((c) => c.id);
            campaignIds = ids;
            return ids;
          })
          .catch(() => {
            // Offline / denied — treat as "no attached campaigns" for this
            // session (a later save retries via the unset cache). Never throws.
            resolving = null;
            return [];
          });
      }
      return resolving;
    },
  };
}

/**
 * Refresh the lite party snapshot for a freshly-saved character in every campaign
 * it is attached to. Fire-and-forget — resolves quietly even when every write
 * fails (offline) so it can never affect the character save. A no-op when the
 * character is attached nowhere.
 */
export async function refreshAttachedSheets(
  tracker: AttachedCampaignTracker,
  uid: string,
  doc: CharacterDoc
): Promise<void> {
  const campaignIds = await tracker.ensure();
  if (campaignIds.length === 0) return;
  const snapshot: MemberCharacterSnapshot = buildMemberSnapshot(doc);
  await Promise.allSettled(
    campaignIds.map((campId) => setMemberCharacter(campId, uid, doc.id, snapshot))
  );
}
