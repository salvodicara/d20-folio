/**
 * Mirror the live encounter into the campaign's session log, on the DM's device only.
 * The DM's tracker is the single author of the Combat Chronicle, so mirroring there
 * records every beat exactly once; the mirror is idempotent, so a reload catches up
 * without duplicates. Under dev bypass it writes the in-memory store.
 */

import { useEffect, useRef } from "react";

import { diagnosticsLog } from "@/lib/diagnostics";
import { createEncounterMirror } from "@/lib/session-log";
import { sessionLogStoreFor } from "@/features/campaigns/session-log-source";
import { useCampaignStore } from "@/features/campaigns/campaignStore";

export function useSessionLogMirror(
  campaignId: string,
  uid: string | undefined,
  dmUid: string | undefined
): void {
  const encounter = useCampaignStore((s) => s.campaign?.encounter ?? null);
  const mirror = useRef<ReturnType<typeof createEncounterMirror> | null>(null);
  const enabled = uid !== undefined && uid === dmUid;

  useEffect(() => {
    if (!enabled) return;
    const onError = (error: unknown): void =>
      diagnosticsLog("warn", "session-log.mirror-failed", { message: String(error) });
    // The log is a record beside the fight: nothing here may ever break the hub.
    let instance: ReturnType<typeof createEncounterMirror>;
    try {
      instance = createEncounterMirror({
        store: sessionLogStoreFor(campaignId),
        uid,
        dmUid: uid,
        onError,
      });
    } catch (error) {
      onError(error);
      return;
    }
    instance.update(useCampaignStore.getState().campaign?.encounter ?? null);
    mirror.current = instance;
    return () => {
      instance.stop();
      mirror.current = null;
    };
  }, [enabled, campaignId, uid]);

  useEffect(() => {
    mirror.current?.update(encounter);
  }, [encounter]);
}
