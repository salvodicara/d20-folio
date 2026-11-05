/**
 * The campaign clock's writes (`lib/play/campaign-clock.ts`): a forward step, its
 * undo, and the table setting the time of day. Each runs in a transaction on the
 * campaign doc, so two members stepping at once both count. The rules hold the same
 * bounds (`gameClockWrite` in firestore.rules). No-ops under dev bypass. Firebase loads
 * on the first write, so the screens that import these stay Firebase-free in tests.
 */
import { DEV_BYPASS_AUTH as DEV_BYPASS } from "@/lib/dev-bypass";
import {
  advanceCampaignClock,
  conformCampaignClock,
  setCampaignTimeOfDay,
  stepBackCampaignClock,
  type CampaignClock,
} from "@/lib/play/campaign-clock";

type Step = (clock: CampaignClock | undefined) => CampaignClock | null;

async function writeClock(campaignId: string, step: Step): Promise<CampaignClock | null> {
  if (import.meta.env.DEV && DEV_BYPASS) return null;
  const [{ doc, runTransaction, serverTimestamp }, { db }] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase"),
  ]);
  const ref = doc(db, "campaigns", campaignId);
  return runTransaction(db, async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists()) return null;
    const next = step(conformCampaignClock(snap.data().gameClock));
    if (!next) return null;
    txn.update(ref, { gameClock: next, updatedAt: serverTimestamp() });
    return next;
  });
}

/** `minutes` pass on the campaign clock, stepped by `uid`. */
export function stepCampaignClock(
  campaignId: string,
  minutes: number,
  uid: string
): Promise<CampaignClock | null> {
  return writeClock(campaignId, (clock) => advanceCampaignClock(clock, minutes, uid));
}

/** Take back the clock's last step, as its writer or the DM. */
export function undoCampaignClockStep(
  campaignId: string,
  uid: string,
  isDm: boolean
): Promise<CampaignClock | null> {
  return writeClock(campaignId, (clock) => stepBackCampaignClock(clock, uid, isDm));
}

/** The table says what time it is (minutes since midnight), the minute unchanged. */
export function setCampaignClockTime(
  campaignId: string,
  timeOfDay: number
): Promise<CampaignClock | null> {
  return writeClock(campaignId, (clock) => setCampaignTimeOfDay(clock, timeOfDay));
}
