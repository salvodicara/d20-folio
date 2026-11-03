/**
 * The campaign the open character is attached to: the Play screen's right column,
 * its «Scontro e resoconto» section and the header's campaign button read it once.
 */
import { useEffect, useState } from "react";

import { listSharedCampaigns } from "@/features/campaigns/campaign-io";
import { diagnosticsLog } from "@/lib/diagnostics";
import { useAuthStore } from "@/stores/authStore";
import type { CampaignDoc } from "@/types/campaign";

/** The campaign this character is attached to (one read on open), or null. */
export function useAttachedCampaign(characterId: string): CampaignDoc | null {
  const uid = useAuthStore((s) => s.user?.uid);
  const [campaign, setCampaign] = useState<CampaignDoc | null>(null);
  useEffect(() => {
    if (!uid) return;
    let live = true;
    listSharedCampaigns(uid)
      .then((all) => {
        if (live)
          setCampaign(
            all.find((c) => c.memberDetails[uid]?.characterId === characterId) ?? null
          );
      })
      .catch((error: unknown) =>
        diagnosticsLog("warn", "play.campaign-read-failed", { message: String(error) })
      );
    return () => {
      live = false;
    };
  }, [uid, characterId]);
  return campaign;
}
