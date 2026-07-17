/**
 * useChronicleSubscription — open the campaign's chronicle as a scoped,
 * auto-tearing-down real-time listener (Phase 5 · Part 2b).
 *
 * The chronicle counterpart to `useCampaignSubscription`: a THIN configuration of
 * the shared `useDocumentSubscription` abstraction (§7.1) with the chronicle I/O
 * boundary (`campaign-io`) + store (`chronicleStore`). All the leak-proof
 * discipline (open-only-when-scoped, detach-on-unmount, flush-before-detach, loop
 * guard, dev-bypass short-circuit) lives in the abstraction, so it is identical to
 * the campaign + character listeners'. Mounted by `CampaignHubPage` beside the
 * campaign listener — the hub's compose-once loading gate reads `loading` so the
 * page never paints before the chronicle's first snapshot (the book-spread growing
 * after paint shoved every section below it) — and detaches when the hub unmounts.
 */

import { useCallback } from "react";
import { useAuthStore } from "@/stores/authStore";
import type { ChronicleDoc } from "@/types/campaign";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import { makeDevChronicle } from "@/features/campaigns/dev-fixture";
import { useDocumentSubscription } from "@/app/_data/firestore-subscriptions";
import {
  useChronicleStore,
  type ChronicleState,
} from "@/features/campaigns/chronicleStore";
import { subscribeToChronicle } from "@/features/campaigns/campaign-io";

/**
 * Subscribe to a campaign's chronicle — READ-ONLY (no debounced writer). A `null`
 * snapshot loads as an empty chronicle (a valid state); a Save commits atomically
 * through `commitChronicleEdit` at the call site (`Chronicle.tsx`), so this
 * subscription omits the save-side wiring entirely.
 */
export function useChronicleSubscription(campaignId: string | undefined): void {
  const uid = useAuthStore((s) => s.user?.uid);
  const setChronicle = useChronicleStore((s) => s.setChronicle);
  const setLoading = useChronicleStore((s) => s.setLoading);
  const setError = useChronicleStore((s) => s.setError);

  const applySnapshot = useCallback(
    (doc: ChronicleDoc | null) => {
      setChronicle(doc);
      setLoading(false);
    },
    [setChronicle, setLoading]
  );

  const reset = useCallback(() => {
    setChronicle(null);
    setError(null);
    setLoading(false);
  }, [setChronicle, setError, setLoading]);

  const onSubscribeStart = useCallback(() => {
    setLoading(true);
    setError(null);
  }, [setError, setLoading]);

  const onError = useCallback(
    (err: Error) => {
      console.error("Chronicle subscription error", err);
      setError(err.message);
      setLoading(false);
    },
    [setError, setLoading]
  );

  // Dev bypass opens no listener; seed a populated chronicle so the reading view +
  // version history render locally and in the visual/a11y suite (mirrors the
  // campaign fixture). Only seeds an empty store, so dev edits aren't clobbered.
  const loadDevBypass = useCallback(() => {
    if (!DEV_BYPASS_AUTH) return;
    if ((useChronicleStore.getState().chronicle?.text ?? "") === "") {
      setChronicle(makeDevChronicle());
    }
    setLoading(false);
  }, [setChronicle, setLoading]);

  useDocumentSubscription<ChronicleDoc, ChronicleState, never>({
    uid,
    docId: campaignId,
    subscribe: subscribeToChronicle,
    applySnapshot,
    reset,
    onSubscribeStart,
    onError,
    loadDevBypass,
  });
}
