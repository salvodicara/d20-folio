/**
 * Which clock a character reads (the campaign clock, `campaign-clock.ts`): its
 * campaign's, or its own sheet's. `clockFor` is the one read of either: no other
 * reader touches `session.timeOfDay` (tests/unit/clock-reads.guard.test.ts). It
 * depends on nothing in play, so the clock's own transitions (`time.ts`) read it too.
 * The clock is projected only with this release's rules deployed (`global-combat`).
 */
import type { CharacterDoc } from "@/types/character";

/** The campaign's stored clock. */
export interface CampaignClock {
  /** Game minutes since the campaign began. Only ever moves forward, but for undo. */
  minute: number;
  /** Minutes since midnight, when the table has set a time of day. */
  timeOfDay?: number;
  /** The last forward step, so its writer or the DM can take it back. */
  last?: { by: string; minutes: number };
}

/** The campaign clock as projected onto an open sheet. */
export interface ProjectedCampaignClock {
  campaignId: string;
  clock: CampaignClock;
}

export const DAY = 24 * 60;
/** The largest step one write may take: a day, one long rest's worth and more. */
export const MAX_CLOCK_STEP = DAY;

export type ClockRead =
  | { scope: "sheet"; timeOfDay: number | undefined; elapsedMinutes: 0 }
  | {
      scope: "campaign";
      campaignId: string;
      minute: number;
      timeOfDay: number | undefined;
      /** Campaign minutes since the sheet's countdowns last caught up. */
      elapsedMinutes: number;
    };

/** The clock a character reads: its campaign's, or its own sheet's. */
export function clockFor(doc: CharacterDoc): ClockRead {
  const projected = doc.session.campaignClock;
  if (!projected) {
    return { scope: "sheet", timeOfDay: doc.session.timeOfDay, elapsedMinutes: 0 };
  }
  const { minute, timeOfDay } = projected.clock;
  const seen = doc.session.clockSeen;
  return {
    scope: "campaign",
    campaignId: projected.campaignId,
    minute,
    timeOfDay,
    elapsedMinutes: seen === undefined ? 0 : Math.max(0, minute - seen),
  };
}

/** The sheet with its campaign's clock projected on it (null: a solo sheet). */
export function withCampaignClock(
  doc: CharacterDoc,
  projected: ProjectedCampaignClock | null
): CharacterDoc {
  const session = { ...doc.session };
  if (projected) session.campaignClock = projected;
  else delete session.campaignClock;
  return { ...doc, session };
}
