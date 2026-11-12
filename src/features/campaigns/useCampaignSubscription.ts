/**
 * useCampaignSubscription — open the active campaign as a scoped, auto-tearing-down
 * real-time listener (Phase 5 · Part 2a).
 *
 * The campaign counterpart to `useCharacterSubscription`, but THIN: it only
 * configures the shared `useDocumentSubscription` abstraction (§7.1) with the
 * campaign-specific I/O boundary (`campaign-io`) and store wiring
 * (`campaignStore`). All of the leak-proof discipline — open-only-when-scoped,
 * detach-on-unmount, flush-before-detach, the loop guard, dev-bypass short-circuit
 * — lives in the abstraction, so it is identical to the character listener's.
 *
 * Local edits to the shared artifacts (treasury / notes) are debounced-persisted;
 * `members` / `memberDetails` are NOT touched here (roster changes flow through
 * `createCampaign` / `joinCampaign` / DM tools).
 */

import { useCallback, useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import type { CampaignDoc } from "@/types/campaign";
import { useDocumentSubscription } from "@/app/_data/firestore-subscriptions";
import { useCampaignStore, type CampaignState } from "@/features/campaigns/campaignStore";
import {
  closeEncounterEdits,
  encounterFromServer,
  handOverEncounterEdits,
  isEditLogFight,
} from "@/features/campaigns/encounter-edit-sync";
import {
  createCampaignSave,
  createDevCampaignSave,
  subscribeToCampaign,
  type CampaignWritable,
} from "@/features/campaigns/campaign-io";

/** Stable wrapper over the campaign store's `subscribe` (avoids overload friction). */
function campaignStoreSubscribe(
  listener: (state: CampaignState, prev: CampaignState) => void
): () => void {
  return useCampaignStore.subscribe(listener);
}

/**
 * Pure: persist the campaign's name when it changes for the same campaign. Everything
 * else has its own writer: the fight goes through the DM's edit log or a transactional
 * move (`encounter-edit-sync.ts`, `combat-lifecycle-io.ts`), the treasury through the
 * atomic `applyTreasuryDelta` (B06), shared notes through their own subcollection.
 *
 * A fight on screen that the edit log did not put there (a fight started or ended, a
 * turn passed) was written by its own move: the log starts over from it.
 */
function selectCampaignSave(
  state: CampaignState,
  prev: CampaignState
): CampaignWritable | null {
  const next = state.campaign;
  const before = prev.campaign;
  if (!next || !before || next.id !== before.id) return null;
  if (next.encounter !== before.encounter && !isEditLogFight(next.id, next.encounter))
    handOverEncounterEdits(next.id);
  return next.name !== before.name ? { name: next.name } : null;
}

/**
 * Subscribe to a campaign document. Loads it into the campaign store and
 * auto-persists shared-artifact edits. Pass `undefined` to subscribe to nothing
 * (clears the store).
 *
 * @param campaignId - the Firestore document id of the campaign (== its invite code)
 */
export function useCampaignSubscription(campaignId: string | undefined): void {
  const uid = useAuthStore((s) => s.user?.uid);
  const setCampaign = useCampaignStore((s) => s.setCampaign);
  const setLoading = useCampaignStore((s) => s.setLoading);
  const setError = useCampaignStore((s) => s.setError);

  const applySnapshot = useCallback(
    (doc: CampaignDoc | null) => {
      if (doc) {
        // The DM's waiting fight edits stay on screen over every snapshot.
        const fight = doc.encounter ?? null;
        const shown = encounterFromServer(doc.id, fight);
        setCampaign(shown === fight ? doc : { ...doc, encounter: shown });
        setError(null);
      } else {
        setCampaign(null);
        setError("Campaign not found");
      }
      setLoading(false);
    },
    [setCampaign, setError, setLoading]
  );

  const reset = useCallback(() => {
    setCampaign(null);
    setError(null);
    setLoading(false);
  }, [setCampaign, setError, setLoading]);

  const onSubscribeStart = useCallback(() => {
    setLoading(true);
    setError(null);
  }, [setError, setLoading]);

  const onError = useCallback(
    (err: Error) => {
      console.error("Campaign subscription error", err);
      setError(err.message);
      setLoading(false);
      // NO ACL reconcile needed on access loss: cross-user access derives LIVE from
      // the campaign doc in firestore.rules (a removal / DM transfer is effective on
      // the very next request), so there is no stored reader list to converge.
    },
    [setError, setLoading]
  );

  // The DM's waiting fight edits are written when the campaign closes or the page is
  // hidden, as the old autosave's flush did.
  useEffect(() => {
    if (!campaignId) return;
    const close = () => closeEncounterEdits(campaignId);
    window.addEventListener("pagehide", close);
    return () => {
      window.removeEventListener("pagehide", close);
      close();
    };
  }, [campaignId]);

  useDocumentSubscription<CampaignDoc, CampaignState, CampaignWritable>({
    uid,
    docId: campaignId,
    subscribe: subscribeToCampaign,
    createSave: createCampaignSave,
    applySnapshot,
    reset,
    onSubscribeStart,
    onError,
    storeSubscribe: campaignStoreSubscribe,
    selectSave: selectCampaignSave,
    subscribeDevBypass: subscribeToCampaign,
    // Development builds only: a production build drops the dev writer and its fixtures.
    ...(import.meta.env.DEV ? { createDevBypassSave: createDevCampaignSave } : {}),
  });
}
