/**
 * When the shell's campaigns count as READ (#1217): the source of `resolvedFor`, which
 * `context-settled` and every campaign-aware action trust. Measured on the emulator
 * (2026-11-23): a reopened page first gets the local cache's copy, which can be stale (a
 * fight started on another device), and the server's answer follows a moment later.
 *
 * - Online, a cached snapshot is not read; the server's answer is.
 * - Offline, the cache is all there is: read at once.
 * - After `CAMPAIGNS_CONFIRM_MS` the cached answer counts, so a slow connection never
 *   blocks play. It sits below the actions' own wait (`PARTY_WAIT_MS`), so they see it.
 * - A read error is never «no campaigns». Firestore stops a listener for good after an
 *   error, so the shell attaches it again, `CAMPAIGNS_READ_ATTEMPTS` times in all. Then
 *   the campaigns stay unread (`failed`; the actions refuse with a Reload notice),
 *   unless the open character is attached to no campaign: solo play keeps working.
 */
import { create } from "zustand";

import { PARTY_WAIT_MS } from "./party-roster";

/** How long a cached answer waits for the server's before it counts as read. */
export const CAMPAIGNS_CONFIRM_MS = PARTY_WAIT_MS - 1500;

/** How many times the shell attaches the campaigns listener before it gives up. */
export const CAMPAIGNS_READ_ATTEMPTS = 3;

/** The pause before attaching the listener again after its `attempt`-th failure. */
export function retryDelayMs(attempt: number): number {
  return 1000 * 2 ** (attempt - 1);
}

export const useCampaignsReadStore = create<{
  /** Whether the open character is attached to a campaign, from its own document. */
  attachment: { characterId: string; attached: boolean } | null;
  /** Every attempt to read the campaigns failed. */
  failed: boolean;
  setAttachment: (characterId: string, attached: boolean) => void;
  setFailed: (failed: boolean) => void;
}>((set) => ({
  attachment: null,
  failed: false,
  setAttachment: (characterId, attached) =>
    set({ attachment: { characterId, attached } }),
  setFailed: (failed) => set({ failed }),
}));

/** The character plays solo for sure: its own document names no campaign. */
export function playsSolo(characterId: string | null): boolean {
  const { attachment } = useCampaignsReadStore.getState();
  return (
    characterId !== null &&
    attachment?.characterId === characterId &&
    !attachment.attached
  );
}

/**
 * The notice when a campaign-aware action could not read the campaign, so did nothing.
 * Slow read: try again in a moment. Every read attempt failed: say so and offer Reload
 * (Coordinator 2026-11-22; pattern: Google Docs «Trying to connect…» with Reload).
 */
export function unreadNotice(
  t: (key: string) => string,
  reload: () => void = () => {
    window.location.reload();
  }
): { message: string; duration: number; action?: { label: string; run: () => void } } {
  if (!useCampaignsReadStore.getState().failed)
    return { message: t("campaignContext.unread"), duration: 6000 };
  return {
    message: t("campaignContext.failed"),
    duration: 10_000,
    action: { label: t("campaignContext.reload"), run: reload },
  };
}
