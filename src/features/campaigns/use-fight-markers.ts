/**
 * Fight markers from a player's device (T6). The DM's open campaign page mirrors the
 * whole chronicle into the session log; with that page closed, a fight left no start,
 * no rounds and no end, and the players' lines fell outside it in the report. Every
 * player in the fight now writes its markers too (`markersOnly`): the DM mirror's own
 * ids, so two devices leave one line, sent in order, start to end. The DM's device
 * writes none here: its campaign page already mirrors the fight.
 */
import { useEffect, useRef, useState } from "react";

import { diagnosticsLog } from "@/lib/diagnostics";
import { createEncounterMirror } from "@/lib/session-log";
import { sessionLogStoreFor } from "@/features/campaigns/session-log-source";
import type { CampaignDoc } from "@/types/campaign";

import { useCombatStatusStore } from "./combat-status-store";

type Mirror = ReturnType<typeof createEncounterMirror>;

export function useFightMarkers(
  campaigns: readonly CampaignDoc[],
  uid: string | undefined
): void {
  const fightCampaignId = useCombatStatusStore((s) => s.status?.campaignId ?? null);
  // The campaign of this player's latest fight: kept after the fight ends, so its end
  // marker is still written (state derived during render, React's documented pattern).
  const [lastCampaignId, setLastCampaignId] = useState<string | null>(null);
  if (fightCampaignId && fightCampaignId !== lastCampaignId)
    setLastCampaignId(fightCampaignId);
  const campaignId = fightCampaignId ?? lastCampaignId;
  const campaign = campaigns.find((c) => c.id === campaignId) ?? null;
  const markerCampaign =
    uid !== undefined && campaign !== null && campaign.dmUid !== uid ? campaign : null;
  const mirror = useRef<Mirror | null>(null);

  useEffect(() => {
    if (!markerCampaign || uid === undefined) return;
    const campaign = markerCampaign;
    const onError = (error: unknown): void =>
      diagnosticsLog("warn", "session-log.markers-failed", { message: String(error) });
    let instance: Mirror;
    try {
      instance = createEncounterMirror({
        store: sessionLogStoreFor(campaign.id),
        uid,
        dmUid: campaign.dmUid,
        onError,
        markersOnly: true,
      });
    } catch (error) {
      onError(error);
      return;
    }
    mirror.current = instance;
    return () => {
      instance.stop();
      mirror.current = null;
    };
    // The mirror lives per campaign and player; the fight itself flows through update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerCampaign?.id, markerCampaign?.dmUid, uid]);

  const encounter = markerCampaign?.encounter ?? null;
  const active = markerCampaign !== null;
  useEffect(() => {
    if (active) mirror.current?.update(encounter);
  }, [encounter, active]);
}
