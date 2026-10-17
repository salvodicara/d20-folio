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
 *
 * Out of combat ({@link planExploration}) there is no turn: every ready step that
 * applies is picked, and only Concentration (one spell at a time) still binds.
 */
import {
  PLAYBOOK_SLOTS,
  type PlanSkipReason,
  type PlaybookLimit,
  type PlaybookPlan,
  type PlaybookSlot,
  type PlaybookStep,
} from "./types";

export function planTurn(steps: ReadonlyArray<PlaybookStep>): PlaybookPlan {
  return plan(steps, {
    oneStepPerSlot: true,
    limits: ["one-concentration", "one-slot-spell"],
  });
}

/** Everything worth doing now, out of combat: no slots, one Concentration. */
export function planExploration(steps: ReadonlyArray<PlaybookStep>): PlaybookPlan {
  return plan(steps, { oneStepPerSlot: false, limits: ["one-concentration"] });
}

function plan(
  steps: ReadonlyArray<PlaybookStep>,
  rules: { oneStepPerSlot: boolean; limits: ReadonlyArray<PlaybookLimit> }
): PlaybookPlan {
  const candidates = steps
    .filter((s) => s.status === "ready" && (s.slot === "reaction" || s.applies === true))
    .sort(
      (x, y) =>
        y.priority - x.priority ||
        PLAYBOOK_SLOTS.indexOf(x.slot) - PLAYBOOK_SLOTS.indexOf(y.slot) ||
        (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)
    );

  const binding = (l: PlaybookLimit): boolean => rules.limits.includes(l);
  const takenSlots = new Set<PlaybookSlot>();
  const usedLimits = new Set<PlaybookLimit>();
  const picks: Array<PlaybookPlan["picks"][number]> = [];
  const skipped: Array<{ stepId: string; reason: PlanSkipReason }> = [];

  for (const step of candidates) {
    if (rules.oneStepPerSlot && takenSlots.has(step.slot)) {
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
      (o) => !(o.limits ?? []).some((l) => binding(l) && usedLimits.has(l))
    );
    if (!option) {
      const limit = (available[0]?.limits ?? []).find(
        (l) => binding(l) && usedLimits.has(l)
      );
      if (limit) skipped.push({ stepId: step.id, reason: limit });
      continue;
    }
    takenSlots.add(step.slot);
    for (const l of option.limits ?? []) if (binding(l)) usedLimits.add(l);
    picks.push({ slot: step.slot, stepId: step.id, actionId: option.actionId });
  }

  picks.sort((x, y) => PLAYBOOK_SLOTS.indexOf(x.slot) - PLAYBOOK_SLOTS.indexOf(y.slot));
  return { picks, skipped };
}
