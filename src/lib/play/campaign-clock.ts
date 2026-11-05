/**
 * The campaign clock: one game clock per table. A character in a campaign reads its
 * time of day and its countdowns from the campaign's clock; a solo sheet keeps its
 * own (the sheet's time of day). `clockFor` is the one read of either: no other reader
 * reads the sheet's time of day (`clock.ts`).
 *
 * Countdowns are derived on read and normalized on write. A sheet stores its timers
 * as rounds left at the campaign minute it last caught up to (`session.clockSeen`);
 * `docAtClock` is the sheet as it stands now, the minutes since passed through the
 * same `passTime` a declared stretch uses. Any viewer (the DM, another member) reads
 * through it, so Mage Armor shows expired the moment the clock passes its 8 hours.
 * The owner's device stores that catch-up and runs its side effects.
 *
 * Writes are forward steps of at most a day (one long rest's worth), each recording
 * who stepped and by how much, so the step can be undone by its writer or the DM.
 * The Firestore rules hold the same bounds (`gameClockWrite` in firestore.rules).
 */
import type { CharacterDoc } from "@/types/character";
import {
  clockFor,
  DAY,
  MAX_CLOCK_STEP,
  type CampaignClock,
  withCampaignClock,
} from "./clock";
import { advanceTimeOfDay, passTime } from "./time";

export {
  clockFor,
  MAX_CLOCK_STEP,
  withCampaignClock,
  type CampaignClock,
  type ClockRead,
  type ProjectedCampaignClock,
} from "./clock";

/** The sheet as it stands on the campaign clock now: the minutes since its last
 *  catch-up passed (Mage Armor ends 8 hours on). A solo sheet, or one with nothing
 *  elapsed, is returned as is. */
export function docAtClock(doc: CharacterDoc): CharacterDoc {
  const read = clockFor(doc);
  if (read.scope === "sheet") return doc;
  const seen = doc.session.clockSeen;
  if (read.elapsedMinutes <= 0 && seen !== undefined && seen >= read.minute) return doc;
  const passed =
    read.elapsedMinutes > 0
      ? (passTime(atLastSeen(doc, read.elapsedMinutes), read.elapsedMinutes) ?? doc)
      : doc;
  const session = { ...passed.session, clockSeen: read.minute };
  if (doc.session.campaignClock) session.campaignClock = doc.session.campaignClock;
  return { ...passed, session };
}

/** The sheet with its campaign clock set back to the time it last saw, so a dawn the
 *  minutes since crossed is counted from there. */
function atLastSeen(doc: CharacterDoc, elapsed: number): CharacterDoc {
  const projected = doc.session.campaignClock;
  const timeOfDay = projected?.clock.timeOfDay;
  if (!projected || timeOfDay === undefined) return doc;
  return withCampaignClock(doc, {
    ...projected,
    clock: { ...projected.clock, timeOfDay: (((timeOfDay - elapsed) % DAY) + DAY) % DAY },
  });
}

/** The clock after a forward step of `minutes` by `by`; null for a step that is not
 *  forward or longer than a day. */
export function advanceCampaignClock(
  clock: CampaignClock | undefined,
  minutes: number,
  by: string
): CampaignClock | null {
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > MAX_CLOCK_STEP) return null;
  const from = clock ?? { minute: 0 };
  const timeOfDay = advanceTimeOfDay(from.timeOfDay, minutes);
  return {
    minute: from.minute + minutes,
    ...(timeOfDay !== undefined ? { timeOfDay } : {}),
    last: { by, minutes },
  };
}

/** The clock with its last step taken back, by that step's writer or the DM; null
 *  when there is no step to take back or `by` may not. */
export function stepBackCampaignClock(
  clock: CampaignClock | undefined,
  by: string,
  isDm: boolean
): CampaignClock | null {
  const last = clock?.last;
  if (!clock || !last || (last.by !== by && !isDm)) return null;
  const timeOfDay =
    clock.timeOfDay === undefined
      ? undefined
      : (((clock.timeOfDay - last.minutes) % DAY) + DAY) % DAY;
  return {
    minute: clock.minute - last.minutes,
    ...(timeOfDay !== undefined ? { timeOfDay } : {}),
  };
}

/** The clock with the table's time of day set, the minute and last step unchanged;
 *  null when it already reads that time. */
export function setCampaignTimeOfDay(
  clock: CampaignClock | undefined,
  timeOfDay: number
): CampaignClock | null {
  if (!Number.isInteger(timeOfDay) || timeOfDay < 0 || timeOfDay >= DAY) return null;
  const from = clock ?? { minute: 0 };
  return from.timeOfDay === timeOfDay ? null : { ...from, timeOfDay };
}

const isWhole = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= min &&
  value <= max;

/** A stored clock read at the campaign's untrusted boundary; anything malformed is
 *  dropped (the table then reads minute 0, no time of day). */
export function conformCampaignClock(raw: unknown): CampaignClock | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const value = raw as Record<string, unknown>;
  if (!isWhole(value.minute, 0, Number.MAX_SAFE_INTEGER)) return undefined;
  const last = value.last as Record<string, unknown> | undefined;
  return {
    minute: value.minute,
    ...(isWhole(value.timeOfDay, 0, DAY - 1) ? { timeOfDay: value.timeOfDay } : {}),
    ...(last &&
    typeof last.by === "string" &&
    last.by.length > 0 &&
    isWhole(last.minutes, 1, MAX_CLOCK_STEP)
      ? { last: { by: last.by, minutes: last.minutes } }
      : {}),
  };
}
