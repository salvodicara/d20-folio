/**
 * Time passing outside the turn order, as a screen commits it (the engine's
 * `time-passes` contract, sheet-events.ts): when the stretch ends the held
 * Concentration, its teardown runs first, and both share one whole-state undo, so
 * «Annulla» brings the Concentration back too. The stretch is logged for the session.
 *
 * A character in a campaign moves the campaign's clock (`clockFor`): the step is
 * written on the campaign, the sheet marks the minute it has caught up to, and the
 * undo takes the step back as well.
 */
import { diagnosticsLog } from "@/lib/diagnostics";
import { docAtClock, MAX_CLOCK_STEP } from "@/lib/play/campaign-clock";
import { clockFor } from "@/lib/play/clock";
import { timePassEndsConcentration } from "@/lib/play/time";
import { useAuthStore } from "@/stores/authStore";
import { beginWholeStateUndo, useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";

export function passTimeWithUndo(
  minutes: number,
  message: string,
  /** The time of day the table says it is before the stretch (M18). */
  timeOfDay?: number
): void {
  registerUndoableToast(
    { message },
    () => {
      const store = useCharacterStore.getState();
      const doc = store.character;
      if (!doc || store.readonly) return null;
      const clock = clockFor(doc);
      const uid = useAuthStore.getState().user?.uid;
      const campaign = clock.scope === "campaign" && uid ? clock : null;
      // The campaign's clock moves a day at most per step (the rules hold it too).
      if (campaign && minutes > MAX_CLOCK_STEP) return null;
      const seal = beginWholeStateUndo();
      if (timeOfDay !== undefined && timeOfDay !== clock.timeOfDay && !campaign) {
        store.dispatch({ kind: "set-time-of-day", minutes: timeOfDay });
      }
      if (timePassEndsConcentration(doc, minutes)) {
        store.setConcentration("", { undoable: false, silent: true });
      }
      store.dispatch({ kind: "time-passes", minutes });
      if (campaign) store.updateSession({ clockSeen: campaign.minute + minutes });
      store.logEvent({ kind: "time-passes", minutes });
      const restore = seal?.() ?? null;
      if (!campaign || !uid) return restore;
      void moveCampaignClock(
        campaign.campaignId,
        minutes,
        uid,
        timeOfDay,
        clock.timeOfDay
      );
      return () => {
        if (restore && !restore()) return false;
        void import("@/features/campaigns/clock-io")
          .then(({ undoCampaignClockStep }) =>
            undoCampaignClockStep(campaign.campaignId, uid, false)
          )
          .catch(clockWriteFailed);
        return true;
      };
    },
    { turnScoped: false }
  );
}

async function moveCampaignClock(
  campaignId: string,
  minutes: number,
  uid: string,
  timeOfDay: number | undefined,
  known: number | undefined
): Promise<void> {
  try {
    const { setCampaignClockTime, stepCampaignClock } =
      await import("@/features/campaigns/clock-io");
    if (timeOfDay !== undefined && timeOfDay !== known) {
      await setCampaignClockTime(campaignId, timeOfDay);
    }
    await stepCampaignClock(campaignId, minutes, uid);
  } catch (error) {
    clockWriteFailed(error);
  }
}

function clockWriteFailed(error: unknown): void {
  diagnosticsLog("warn", "play.campaign-clock-write-failed", { message: String(error) });
}

/**
 * The owner's device stores what the campaign clock has already passed for every
 * reader (`docAtClock`): the sheet catches up to the campaign minute, ending what ran
 * out. An engine-held Concentration ends through the store teardown first, so the
 * world's occurrence ends with it; the stretch is logged. Not undoable: the step it
 * follows is the campaign's, undone there.
 */
export function catchUpCampaignClock(): void {
  const store = useCharacterStore.getState();
  const doc = store.character;
  if (!doc || store.readonly) return;
  const clock = clockFor(doc);
  if (clock.scope !== "campaign") return;
  const caught = docAtClock(doc);
  if (caught === doc) return;
  if (doc.session.concentration && !caught.session.concentration) {
    store.setConcentration("", { undoable: false, silent: true });
  }
  store.dispatch({ kind: "clock-catch-up" });
  if (clock.elapsedMinutes > 0) {
    store.logEvent({ kind: "time-passes", minutes: clock.elapsedMinutes });
  }
}

/** The campaign minute the open sheet must catch up to, or null when it is current
 *  (a solo sheet, a read-only view, nothing elapsed). A store selector. */
export function clockCatchUpTarget(state: {
  character: CharacterDoc | null;
  readonly: boolean;
}): number | null {
  const doc = state.character;
  if (!doc || state.readonly) return null;
  const clock = clockFor(doc);
  if (clock.scope !== "campaign") return null;
  return doc.session.clockSeen === undefined || clock.elapsedMinutes > 0
    ? clock.minute
    : null;
}

/** The longest stretch one «Passa il tempo» may pass: a day on a campaign's clock,
 *  any on a solo sheet's. */
export function longestTimePass(doc: CharacterDoc): number {
  return clockFor(doc).scope === "campaign" ? MAX_CLOCK_STEP : Number.POSITIVE_INFINITY;
}
