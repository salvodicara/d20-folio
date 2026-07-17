/**
 * useCampaignNotesSubscription — open the active campaign's shared-notes
 * subcollection (`/campaigns/{campId}/notes`) as a scoped, auto-tearing-down
 * real-time listener.
 *
 * Notes are NOT a field on the campaign doc: they are per-note documents so the
 * content-sharing soft-reveal is enforced by `firestore.rules` at the READ
 * boundary (a hidden note never reaches a player's client). This hook picks the
 * query the rules admit for the current viewer — the DM/admin reads every note,
 * a player reads only the revealed ones — and pushes the snapshot into the
 * `notes` slice of `campaignStore`. Used by {@link SharedNotes}.
 */

import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { subscribeToCampaignNotes } from "@/features/campaigns/campaign-io";

export function useCampaignNotesSubscription(): void {
  const uid = useAuthStore((s) => s.user?.uid);
  const isAdmin = useIsAdmin();
  const campaignId = useCampaignStore((s) => s.campaign?.id);
  const dmUid = useCampaignStore((s) => s.campaign?.dmUid);
  const setNotes = useCampaignStore((s) => s.setNotes);
  const setNotesLoading = useCampaignStore((s) => s.setNotesLoading);
  const setNotesError = useCampaignStore((s) => s.setNotesError);

  // The DM (or an admin override) reads EVERY note; a player reads only revealed
  // ones — the SAME split firestore.rules enforces, so the scoped query is allowed.
  const dmView = (dmUid !== undefined && dmUid === uid) || isAdmin;

  useEffect(() => {
    if (!campaignId) {
      setNotes([]);
      return;
    }
    setNotesLoading(true);
    const unsubscribe = subscribeToCampaignNotes(
      campaignId,
      dmView,
      (notes) => setNotes(notes),
      (err) => setNotesError(err.message)
    );
    return unsubscribe;
  }, [campaignId, dmView, setNotes, setNotesLoading, setNotesError]);
}
