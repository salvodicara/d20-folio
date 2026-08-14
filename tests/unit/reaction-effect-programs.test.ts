import { describe, expect, it } from "vitest";

import { ROGUE_FEATURES } from "@/data/classes/rogue";
import {
  createReviewedCombatEffectArtifact,
  interpretCombatEffectArtifact,
  validateCombatEffectProgram,
  type CombatEffectStateView,
} from "@/lib/combat-effect-program";
import { createCombatEffectPlanningState } from "@/lib/combat-effect-planning-state";
import { atomicDocumentForOwner } from "@/lib/combat-effect-atomic";
import { NO_DEFENSES } from "@/lib/damage-intake";

const STATE: CombatEffectStateView = {
  hp: 20,
  maxHp: 20,
  tempHp: 0,
  stable: false,
  deathSaves: { successes: 0, failures: 0 },
  conditions: [],
  conditionLifetimes: {},
  standing: [],
  standingLifetimes: {},
  resources: {},
  stateFlags: {},
};

describe("exact reaction effect programs", () => {
  it("makes Uncanny Dodge leave floor-half damage for odd attack totals", () => {
    const feature = ROGUE_FEATURES.find(
      (candidate) => candidate.id === "rogue-uncanny-dodge"
    );
    const program = feature?.mechanics?.actions?.[0]?.effectProgram;
    expect(validateCombatEffectProgram(program).valid).toBe(true);
    if (!program) throw new TypeError("Missing Uncanny Dodge effect program");

    const artifact = createReviewedCombatEffectArtifact(
      program,
      {
        occurrenceId: "turn:rogue:reaction:0",
        phaseId: "resolve",
        sourceId: "rogue",
        targets: [],
        instances: 1,
        triggerFacts: {
          attack: { result: "hit", critical: false },
          damage: { amount: 9, sourceId: "attacker" },
        },
      },
      []
    );
    const owner = {
      kind: "pc",
      surface: "local",
      uid: "user:rogue",
      characterId: "character:rogue",
      combatantId: "rogue",
    } as const;
    const plan = interpretCombatEffectArtifact(
      artifact,
      createCombatEffectPlanningState([
        {
          owner,
          documentRevisions: [{ document: atomicDocumentForOwner(owner), revision: 1 }],
          refs: [{ kind: "source", id: "rogue" }],
          baseState: STATE,
          defenses: NO_DEFENSES,
          resourceSnapshots: {},
          stateFlagBindings: {},
          occurrenceHeads: [],
          lifecycleHeads: [
            {
              header: {
                occurrenceId: "turn:rogue:reaction:0",
                programId: program.id,
                sourceId: "rogue",
              },
              expected: { present: false },
            },
          ],
        },
      ])
    );

    expect(plan.readSet).toMatchObject({ schema: 1 });
    expect(Object.isFrozen(plan.readSet)).toBe(true);
    expect(plan.consequences).toEqual([
      expect.objectContaining({
        kind: "damage-reduction",
        amount: 5,
        appliedAmount: 5,
        triggeringDamage: { amount: 9, sourceId: "attacker" },
      }),
    ]);
  });
});
