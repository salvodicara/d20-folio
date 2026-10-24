/**
 * The tracker moves that are not a plain spend or restore: a physical roll recorded
 * against a tracker use (a homebrew "Foretelling" d20 kept for later), spending one
 * of those recorded rolls, and topping a pool up (a short rest's Focus refill). Pure:
 * the sheet events and the play log replay these.
 */
import { resolveTrackers } from "@/lib/smart-tracker";
import type { CharacterDoc, SessionState, TrackerState } from "@/types/character";
import { restoreTrackerEntry } from "./recoveries";

const trackerOf = (doc: CharacterDoc, trackerId: string) =>
  resolveTrackers(doc).find((entry) => entry.id === trackerId);

/**
 * Record (or clear, with null) the roll in an available use's slot, clamped to the
 * tracker's die. Null when the tracker records no rolls or the slot isn't available.
 */
export function setTrackerRoll(
  doc: CharacterDoc,
  trackerId: string,
  index: number,
  value: number | null
): SessionState | null {
  if (index < 0 || !Number.isInteger(index)) return null;
  const tracker = trackerOf(doc, trackerId);
  if (!tracker?.recordedRolls) return null;
  const available = Math.max(0, tracker.total - tracker.used);
  if (index >= available) return null;
  const normalized =
    value === null || !Number.isFinite(value)
      ? null
      : Math.min(
          tracker.recordedRolls.max,
          Math.max(tracker.recordedRolls.min, Math.round(value))
        );
  const prior = doc.session.trackers[trackerId];
  const rolls = Array.from({ length: available }, (_, slot): number | null =>
    slot === index ? normalized : (prior?.rolls?.[slot] ?? null)
  );
  const used = prior?.used ?? 0;
  const next: TrackerState | undefined = rolls.some(
    (roll): roll is number => typeof roll === "number"
  )
    ? { used, rolls }
    : used > 0
      ? { used }
      : undefined;
  return {
    ...doc.session,
    trackers: restoreTrackerEntry(doc.session.trackers, trackerId, next),
  };
}

/** Spend the use whose recorded roll sits at `index`, or null when there is none. */
export function spendTrackerRoll(
  doc: CharacterDoc,
  trackerId: string,
  index: number
): SessionState | null {
  if (index < 0 || !Number.isInteger(index)) return null;
  const tracker = trackerOf(doc, trackerId);
  const prior = doc.session.trackers[trackerId];
  if (
    !tracker?.recordedRolls ||
    !prior ||
    prior.used >= tracker.total ||
    index >= tracker.total - prior.used ||
    typeof prior.rolls?.[index] !== "number"
  ) {
    return null;
  }
  const rolls = [...prior.rolls];
  rolls.splice(index, 1);
  const next: TrackerState = {
    used: Math.min(tracker.total, prior.used + 1),
    ...(rolls.length > 0 ? { rolls } : {}),
  };
  return { ...doc.session, trackers: { ...doc.session.trackers, [trackerId]: next } };
}

/**
 * The uses a top-up leaves spent (`appliedUsed`): the pool refilled to `upTo` uses
 * left, or to full. Null when the tracker doesn't exist.
 */
export function topUpUsed(
  doc: CharacterDoc,
  trackerId: string,
  upTo: number | "full"
): number | null {
  const tracker = trackerOf(doc, trackerId);
  if (!tracker) return null;
  const floor =
    upTo === "full" ? tracker.total : Math.min(tracker.total, Math.max(0, upTo));
  return tracker.total - floor;
}

/** Refill a pool to `upTo` uses left (or full); null when it is already that full. */
export function topUpTracker(
  doc: CharacterDoc,
  trackerId: string,
  upTo: number | "full"
): SessionState | null {
  const appliedUsed = topUpUsed(doc, trackerId, upTo);
  if (appliedUsed === null) return null;
  if ((doc.session.trackers[trackerId]?.used ?? 0) <= appliedUsed) return null;
  const trackers =
    appliedUsed === 0
      ? restoreTrackerEntry(doc.session.trackers, trackerId, undefined)
      : { ...doc.session.trackers, [trackerId]: { used: appliedUsed } };
  return { ...doc.session, trackers };
}
