/**
 * One concrete turn from a playbook's steps, greedily and by hand-checkable rules:
 *
 *  1. Candidates are ready steps whose trigger applies (a reaction only needs to
 *     be ready: it waits for the enemy's turn).
 *  2. Highest priority first; ties by slot order, then step id.
 *  3. One step per slot. Inside a step, the first available option that breaks
 *     no turn-wide limit: one concentration spell, one spell slot per turn
 *     (SRD 5.2.1 "One Spell with a Spell Slot per Turn").
 *  4. A candidate that loses is listed in `skipped` with the reason.
 */
import {
  ECONOMY_SLOTS,
  type EconomySlot,
  type PlanSkipReason,
  type PlaybookLimit,
  type PlaybookPlan,
  type PlaybookStep,
} from "./types";

export function planTurn(steps: ReadonlyArray<PlaybookStep>): PlaybookPlan {
  const candidates = steps
    .filter((s) => s.status === "ready" && (s.slot === "reaction" || s.applies === true))
    .sort(
      (x, y) =>
        y.priority - x.priority ||
        ECONOMY_SLOTS.indexOf(x.slot) - ECONOMY_SLOTS.indexOf(y.slot) ||
        (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)
    );

  const takenSlots = new Set<EconomySlot>();
  const usedLimits = new Set<PlaybookLimit>();
  const picks: Array<PlaybookPlan["picks"][number]> = [];
  const skipped: Array<{ stepId: string; reason: PlanSkipReason }> = [];

  for (const step of candidates) {
    if (takenSlots.has(step.slot)) {
      skipped.push({ stepId: step.id, reason: "slot-taken" });
      continue;
    }
    if (step.options.length === 0) {
      takenSlots.add(step.slot);
      picks.push({ slot: step.slot, stepId: step.id });
      continue;
    }
    const available = step.options.filter((o) => o.available);
    const option = available.find(
      (o) => !(o.limits ?? []).some((l) => usedLimits.has(l))
    );
    if (!option) {
      const limit = (available[0]?.limits ?? []).find((l) => usedLimits.has(l));
      if (limit) skipped.push({ stepId: step.id, reason: limit });
      continue;
    }
    takenSlots.add(step.slot);
    for (const l of option.limits ?? []) usedLimits.add(l);
    picks.push({ slot: step.slot, stepId: step.id, actionId: option.actionId });
  }

  picks.sort((x, y) => ECONOMY_SLOTS.indexOf(x.slot) - ECONOMY_SLOTS.indexOf(y.slot));
  return { picks, skipped };
}
