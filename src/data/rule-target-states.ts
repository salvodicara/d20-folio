/**
 * States the core rules put on a target, outside any spell or class feature
 * (edge-case family M17): Vex (a weapon mastery) and the Help action. An encounter
 * effect names one with `source: { kind: "feature", id }` and the state's
 * `activeKey`; `resolveCombatEffectGrantGroup` finds it here when no class feature
 * has that id.
 */
import type { Grant } from "@/lib/grants";

type TargetState = Extract<Grant, { type: "while-active" }>;

export const RULE_TARGET_STATES: ReadonlyMap<
  string,
  ReadonlyArray<TargetState>
> = new Map([
  [
    // Vex: "you have Advantage on your next attack roll against that creature before
    // the end of your next turn."
    "mastery-vex",
    [
      {
        type: "while-active",
        activeKey: "vexed",
        consumedBy: "next-attack-by",
        duration: { kind: "turn-boundary", phase: "turn-end", turns: 1 },
        grants: [{ type: "incoming-attack-advantage" }],
      },
    ],
  ],
  [
    // Help (attack): "the next attack roll by one of your allies against that enemy
    // has Advantage before the start of your next turn." The ally rides the effect's
    // `bindings.beneficiaryId`.
    "action-help",
    [
      {
        type: "while-active",
        activeKey: "helped-against",
        consumedBy: "next-attack-by",
        duration: { kind: "turn-boundary", phase: "turn-start", turns: 1 },
        grants: [{ type: "incoming-attack-advantage" }],
      },
    ],
  ],
]);
