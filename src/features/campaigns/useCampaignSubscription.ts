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

import { useCallback } from "react";
import { useAuthStore } from "@/stores/authStore";
import type { CampaignDoc } from "@/types/campaign";
import { useDocumentSubscription } from "@/app/_data/firestore-subscriptions";
import { useCampaignStore, type CampaignState } from "@/features/campaigns/campaignStore";
import {
  createCampaignSave,
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
 * Pure: persist the shared artifacts when (and only when) they change for the
 * same campaign. Identity comparison is enough — the store mutations replace the
 * `name` / `encounter` references on every edit.
 *
 * TREASURY is deliberately NOT here anymore (B06): the whole-map / whole-log
 * last-write-wins debounce silently corrupted the shared total and dropped ledger
 * rows under concurrent edits, so treasury now persists through the ATOMIC,
 * composing `applyTreasuryDelta` / `undoTreasuryEntry` path (campaign-io) fired
 * directly from `Treasury`. Shared NOTES are likewise not here — a per-note
 * subcollection written through immediately by `SharedNotes`.
 */
function selectCampaignSave(
  state: CampaignState,
  prev: CampaignState
): CampaignWritable | null {
  const next = state.campaign;
  const before = prev.campaign;
  if (!next || !before || next.id !== before.id) return null;
  if (next.name !== before.name || next.encounter !== before.encounter) {
    return {
      name: next.name,
      // The DM's live encounter rides this debounced writer — every immediate-commit
      // structural mutation replaces the `encounter` reference. `stripUndefined`
      // (updateCampaign) cleans optional combatant fields; `null` ends the encounter.
      // The turn pointer is reconciled from the live store at write time so a queued
      // structural write can never revert a concurrent advance (B04).
      encounter: next.encounter,
    };
  }
  return null;
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
        setCampaign(doc);
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
  });
}
