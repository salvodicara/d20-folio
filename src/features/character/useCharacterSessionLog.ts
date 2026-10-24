/**
 * The sheet's share of the session log: when the character is in a campaign, the open
 * session's lines where it acts or is acted on (its own gestures, and the DM's moves on
 * it), live. `null` while the character is in no campaign, or until the campaign
 * resolves; the log panel then keeps showing the sheet's own log. Failures go to
 * diagnostics and leave the panel on the sheet's log.
 */

import { useEffect, useState } from "react";

import { listSharedCampaigns } from "@/features/campaigns/campaign-io";
import { sessionLogStoreFor } from "@/features/campaigns/session-log-source";
import { diagnosticsLog } from "@/lib/diagnostics";
import {
  entriesInvolving,
  foldSession,
  nextSessionId,
  sessionCreatureNames,
  type CombatantId,
  type SessionEntry,
} from "@/lib/session-log";
import type { CampaignDoc } from "@/types/campaign";

export interface CharacterSessionLog {
  /** The session lines involving this character, in log order. */
  entries: SessionEntry[];
  /** This character's combatant id in the session (`pc-<uid>`). */
  me: CombatantId;
  /** A party member's character name for a `pc-<uid>` id, else a creature's name. */
  nameOf: (id: CombatantId) => string | undefined;
}

export function useCharacterSessionLog(
  uid: string | undefined,
  characterId: string | undefined
): CharacterSessionLog | null {
  // Each result remembers what it was read for, so a stale one is never shown.
  const [found, setFound] = useState<{
    key: string;
    campaign: CampaignDoc | null;
  } | null>(null);
  const [read, setRead] = useState<{
    campaignId: string;
    entries: SessionEntry[];
  } | null>(null);
  const key = uid && characterId ? `${uid}/${characterId}` : null;

  useEffect(() => {
    if (!uid || !characterId) return;
    const forKey = `${uid}/${characterId}`;
    let stopped = false;
    listSharedCampaigns(uid)
      .then((campaigns) => {
        if (stopped) return;
        setFound({
          key: forKey,
          campaign:
            campaigns.find((c) => c.memberDetails[uid]?.characterId === characterId) ??
            null,
        });
      })
      .catch((error: unknown) =>
        diagnosticsLog("warn", "session-log.sheet-campaign-failed", {
          message: String(error),
        })
      );
    return () => {
      stopped = true;
    };
  }, [uid, characterId]);

  const campaign = found && found.key === key ? found.campaign : null;
  const campaignId = campaign?.id;
  const dmUid = campaign?.dmUid;
  useEffect(() => {
    if (!campaignId) return;
    const onError = (error: unknown): void =>
      diagnosticsLog("warn", "session-log.sheet-read-failed", { message: String(error) });
    let stopped = false;
    let unsubscribe: (() => void) | null = null;
    const store = sessionLogStoreFor(campaignId);
    void store
      .latest()
      .then((head) => {
        if (stopped) return;
        unsubscribe = store.subscribe(
          nextSessionId(head, new Date()),
          (items) => setRead({ campaignId, entries: foldSession(items, { dmUid }) }),
          onError
        );
      })
      .catch(onError);
    return () => {
      stopped = true;
      unsubscribe?.();
    };
  }, [campaignId, dmUid]);

  if (!uid || !campaign) return null;
  const all = read && read.campaignId === campaign.id ? read.entries : [];
  const me: CombatantId = `pc-${uid}`;
  const creatures = sessionCreatureNames(all);
  return {
    entries: entriesInvolving(all, me),
    me,
    nameOf: (id) => {
      const member = campaign.memberDetails[id.replace(/^pc-/, "")];
      return member?.character?.name || member?.displayName || creatures[id];
    },
  };
}
