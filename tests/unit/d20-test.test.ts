import { describe, expect, it } from "vitest";

import {
  conformD20TestObservation,
  conformD20TestRequest,
  evaluateD20Test,
  reviewD20Test,
} from "@/lib/d20-test";
import type {
  DiceObservation,
  DiceReplacement,
  DiceRollRequirement,
} from "@/types/dice-formula";
import type {
  D20RollRules,
  D20TableOverride,
  D20TestObservation,
  D20TestRequest,
} from "@/types/d20-test";
import type { IntegerBindings } from "@/types/integer-expression";

type ReplacementInput = Omit<DiceReplacement, "kind">;

const fixed = (value: number) => ({ kind: "fixed" as const, value });
const binding = (bindingId: string) => ({ kind: "binding" as const, bindingId });
const MATERIAL = {
  characterId: "character-1",
  kind: "character-play" as const,
  uid: "user-1",
};
const ACTOR = { entityId: "actor-1", material: MATERIAL, ordinal: 1 };
const TARGET = { entityId: "target-1", material: MATERIAL, ordinal: 2 };

function rollRules(overrides: Partial<D20RollRules> = {}): D20RollRules {
  return {
    advantageSourceIds: [],
    disadvantageSourceIds: [],
    extraD20SourceIds: [],
    faceFloors: [],
    replacements: [],
    substitutions: [],
    totalFloors: [],
    ...overrides,
  };
}

function savingThrow(difficultyClass = 10): D20TestRequest {
  return {
    actor: ACTOR,
    ability: "CON",
    difficultyClass: fixed(difficultyClass),
    enteredModifiers: [],
    kind: "saving-throw",
    modifiers: [],
    resolution: { kind: "rolled" },
    rollRules: rollRules(),
    target: null,
    testId: "test-1",
  };
}

function diceObservation(
  requirement: Readonly<DiceRollRequirement>,
  faces: readonly number[],
  replacements: readonly (readonly ReplacementInput[])[] = []
): DiceObservation {
  if (requirement.trails.length !== faces.length) {
    throw new Error("test fixture supplied the wrong number of physical faces");
  }
  return {
    aggregates: [],
    trails: requirement.trails.map((trail, index) => {
      const initialFace = faces[index];
      if (initialFace === undefined) throw new Error("test fixture lost a face");
      return {
        initialFace,
        steps: (replacements[index] ?? []).map((replacement) => ({
          ...replacement,
          kind: "replacement" as const,
        })),
        trailId: trail.trailId,
      };
    }),
  };
}

function observationFor(
  request: D20TestRequest,
  faces: readonly number[],
  options: {
    readonly bindings?: IntegerBindings;
    readonly enteredModifiers?: D20TestObservation["enteredModifiers"];
    readonly replacements?: readonly (readonly ReplacementInput[])[];
    readonly tableOverride?: D20TableOverride | null;
  } = {}
): D20TestObservation {
  const review = reviewD20Test(request, options.bindings ?? {});
  if (!review) throw new Error("test request did not produce a review");
  if (review.d20Requirement === null) {
    if (faces.length > 0) throw new Error("non-rolled test received physical faces");
    return {
      d20: null,
      enteredModifiers: options.enteredModifiers ?? [],
      tableOverride: options.tableOverride ?? null,
    };
  }
  return {
    d20: diceObservation(review.d20Requirement, faces, options.replacements),
    enteredModifiers: options.enteredModifiers ?? [],
    tableOverride: options.tableOverride ?? null,
  };
}

function enteredDiceObservation(
  request: D20TestRequest,
  sourceId: string,
  faces: readonly number[],
  options: {
    readonly bindings?: IntegerBindings;
    readonly replacements?: readonly (readonly ReplacementInput[])[];
  } = {}
): D20TestObservation["enteredModifiers"][number] {
  const rule = reviewD20Test(request, options.bindings ?? {})?.enteredModifiers.find(
    (candidate) => candidate.sourceId === sourceId
  );
  if (rule?.kind !== "dice-formula") {
    throw new Error("test fixture did not resolve the entered dice formula");
  }
  return {
    kind: "dice-formula",
    observation: diceObservation(rule.requirement, faces, options.replacements),
    sourceId,
  };
}

describe("D20 Test exact boundaries", () => {
  it("clones, canonicalizes, deeply freezes, and requires EntityRef identities", () => {
    const source = { ...savingThrow(14) };
    const request = conformD20TestRequest(source);

    expect(request).toEqual(source);
    expect(request).not.toBe(source);
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request?.actor.material)).toBe(true);
    source.testId = "changed";
    expect(request?.testId).toBe("test-1");
    expect(conformD20TestRequest({ ...savingThrow(), actor: "actor-1" })).toBeNull();
    expect(conformD20TestRequest({ ...savingThrow(), persistedResult: true })).toBeNull();
    expect(conformD20TestRequest({ ...savingThrow(), ability: "LUCK" })).toBeNull();
    expect(conformD20TestRequest({ ...savingThrow(), difficultyClass: null })).toBeNull();
  });

  it("rejects duplicate or excessive authored facts and exact observation aliases", () => {
    expect(
      conformD20TestRequest({
        ...savingThrow(),
        rollRules: rollRules({ advantageSourceIds: ["advantage-1", "advantage-1"] }),
      })
    ).toBeNull();
    expect(
      conformD20TestRequest({
        ...savingThrow(),
        modifiers: Array.from({ length: 65 }, (_, index) => ({
          sourceId: `modifier-${index}`,
          value: fixed(index),
        })),
      })
    ).toBeNull();
    expect(
      conformD20TestObservation({
        d20: null,
        enteredModifiers: [],
        forgedField: [],
        tableOverride: null,
      })
    ).toBeNull();
    expect(
      conformD20TestObservation({
        d20: null,
        enteredModifiers: [],
        tableOverride: { kind: "outcome", outcome: "success" },
      })
    ).toBeNull();
    expect(
      conformD20TestObservation({
        d20: null,
        enteredModifiers: [{ kind: "exact", sourceId: "modifier-1", value: -0 }],
        tableOverride: null,
      })
    ).toBeNull();
  });
});

describe("D20 roll contracts", () => {
  it("derives normal, Advantage, Disadvantage, cancellation, and non-rolled modes", () => {
    expect(reviewD20Test(savingThrow(), {})?.mode).toBe("normal");
    expect(reviewD20Test(savingThrow(), {})?.d20Requirement?.trails).toHaveLength(1);

    const advantage: D20TestRequest = {
      ...savingThrow(),
      rollRules: rollRules({ advantageSourceIds: ["advantage-1", "advantage-2"] }),
    };
    expect(reviewD20Test(advantage, {})?.mode).toBe("advantage");
    expect(reviewD20Test(advantage, {})?.d20Requirement?.trails).toHaveLength(2);

    const disadvantage: D20TestRequest = {
      ...savingThrow(),
      rollRules: rollRules({ disadvantageSourceIds: ["disadvantage-1"] }),
    };
    expect(reviewD20Test(disadvantage, {})?.mode).toBe("disadvantage");

    const cancelled: D20TestRequest = {
      ...savingThrow(),
      rollRules: rollRules({
        advantageSourceIds: ["advantage-1"],
        disadvantageSourceIds: ["disadvantage-1"],
      }),
    };
    expect(reviewD20Test(cancelled, {})?.mode).toBe("cancelled");
    expect(reviewD20Test(cancelled, {})?.d20Requirement?.trails).toHaveLength(1);

    const automatic: D20TestRequest = {
      ...savingThrow(),
      resolution: {
        kind: "automatic",
        outcome: "success",
        reasonId: "automatic-success",
        sourceId: "automatic-success-1",
      },
    };
    expect(reviewD20Test(automatic, {})?.mode).toBe("not-rolled");
    expect(reviewD20Test(automatic, {})?.d20Requirement).toBeNull();
  });

  it("requires an active extra-d20 capability and keeps Advantage selection stable", () => {
    const elvenAccuracy: D20TestRequest = {
      ...savingThrow(15),
      rollRules: rollRules({
        advantageSourceIds: ["advantage-1"],
        extraD20SourceIds: ["extra-d20-1"],
      }),
    };
    const review = reviewD20Test(elvenAccuracy, {});
    expect(review?.d20Requirement?.trails).toHaveLength(3);
    const result = evaluateD20Test(
      elvenAccuracy,
      {},
      observationFor(elvenAccuracy, [7, 18, 12])
    );
    expect(result?.selectedNaturalFace).toBe(18);
    expect(result?.selectedTrailId).toBe(review?.d20Requirement?.trails[1]?.trailId);

    expect(
      reviewD20Test(
        {
          ...savingThrow(),
          rollRules: rollRules({ extraD20SourceIds: ["extra-d20-1"] }),
        },
        {}
      )
    ).toBeNull();
  });

  it("authorizes ordered Heroic Inspiration and face-triggered reroll chains", () => {
    const request: D20TestRequest = {
      ...savingThrow(12),
      rollRules: rollRules({
        replacements: [
          {
            appliesTo: "d20",
            rule: {
              faces: [1],
              kind: "faces",
              maximumUses: fixed(2),
              sourceId: "halfling-lucky-1",
            },
          },
          {
            appliesTo: "any-die",
            rule: {
              kind: "any-face",
              maximumUses: fixed(1),
              sourceId: "heroic-inspiration-1",
            },
          },
        ],
      }),
    };
    const replacements = [
      [
        { face: 1, sourceId: "halfling-lucky-1" },
        { face: 6, sourceId: "halfling-lucky-1" },
        { face: 17, sourceId: "heroic-inspiration-1" },
      ],
    ];
    const result = evaluateD20Test(
      request,
      {},
      observationFor(request, [1], { replacements })
    );
    expect(result?.selectedNaturalFace).toBe(17);

    const wrongTrigger = observationFor(request, [2], {
      replacements: [[{ face: 10, sourceId: "halfling-lucky-1" }]],
    });
    expect(evaluateD20Test(request, {}, wrongTrigger)).toBeNull();
    const unknownSource = observationFor(request, [1], {
      replacements: [[{ face: 10, sourceId: "unavailable-reroll-1" }]],
    });
    expect(evaluateD20Test(request, {}, unknownSource)).toBeNull();
  });

  it("uses an authorized Portent-style substitution instead of the entire dice pool", () => {
    const request: D20TestRequest = {
      ...savingThrow(22),
      modifiers: [{ sourceId: "save-bonus-1", value: fixed(2) }],
      rollRules: rollRules({
        advantageSourceIds: ["advantage-1"],
        extraD20SourceIds: ["elven-accuracy-1"],
        substitutions: [
          { face: fixed(20), sourceId: "portent-slot-1" },
          { face: fixed(10), sourceId: "clockwork-amulet-1" },
        ],
      }),
    };
    const review = reviewD20Test(request, {});
    expect(review?.d20Requirement?.trails).toHaveLength(3);
    expect(review?.substitutions).toEqual([
      { face: 20, sourceId: "portent-slot-1" },
      { face: 10, sourceId: "clockwork-amulet-1" },
    ]);

    const result = evaluateD20Test(
      request,
      {},
      {
        d20: { kind: "substitution", sourceId: "portent-slot-1" },
        enteredModifiers: [],
        tableOverride: null,
      }
    );
    expect(result).toMatchObject({
      appliedSubstitution: { face: 20, sourceId: "portent-slot-1" },
      effectiveFace: 20,
      preFloorTotal: 22,
      selectedNaturalFace: 20,
      selectedTrailId: null,
      total: 22,
      computedOutcome: { outcomeId: "success", status: "success" },
    });

    expect(
      evaluateD20Test(
        request,
        {},
        {
          d20: { kind: "substitution", sourceId: "unavailable-portent-1" },
          enteredModifiers: [],
          tableOverride: null,
        }
      )
    ).toBeNull();
    expect(
      reviewD20Test(
        {
          ...savingThrow(),
          rollRules: rollRules({
            substitutions: [{ face: fixed(21), sourceId: "invalid-portent-1" }],
          }),
        },
        {}
      )
    ).toBeNull();
  });
});

describe("attacks", () => {
  function attack(
    armorClass: number,
    criticalThreshold = 20,
    automaticCriticalSourceIds: readonly string[] = []
  ): D20TestRequest {
    return {
      actor: ACTOR,
      armorClass: fixed(armorClass),
      automaticCriticalSourceIds,
      criticalThreshold: fixed(criticalThreshold),
      enteredModifiers: [],
      kind: "attack",
      modifiers: [{ sourceId: "attack-bonus-1", value: fixed(5) }],
      resolution: { kind: "rolled" },
      rollRules: rollRules(),
      target: TARGET,
      testId: "attack-1",
    };
  }

  it("uses AC ties, natural 1, and authored critical thresholds exactly", () => {
    const tie = attack(15);
    expect(
      evaluateD20Test(tie, {}, observationFor(tie, [10]))?.computedOutcome
    ).toMatchObject({ hit: true, outcomeId: "hit", status: "success" });

    const below = attack(16);
    expect(
      evaluateD20Test(below, {}, observationFor(below, [10]))?.computedOutcome
    ).toMatchObject({ hit: false, outcomeId: "miss" });

    const naturalOne: D20TestRequest = {
      ...attack(1),
      modifiers: [{ sourceId: "attack-bonus-1", value: fixed(100) }],
      rollRules: rollRules({
        faceFloors: [{ minimumFace: fixed(10), sourceId: "face-floor-1" }],
      }),
    };
    const naturalOneResult = evaluateD20Test(
      naturalOne,
      {},
      observationFor(naturalOne, [1])
    );
    expect(naturalOneResult).toMatchObject({
      effectiveFace: 10,
      selectedNaturalFace: 1,
      computedOutcome: { hit: false, naturalOne: true, outcomeId: "miss" },
    });

    const expandedCritical = attack(100, 19);
    expect(
      evaluateD20Test(expandedCritical, {}, observationFor(expandedCritical, [19]))
        ?.computedOutcome
    ).toMatchObject({
      critical: true,
      hit: true,
      naturalCritical: true,
      outcomeId: "critical-hit",
    });
  });

  it("applies automatic critical only to hits and records explicit table overrides", () => {
    const request = attack(20, 20, ["automatic-critical-1"]);
    expect(
      evaluateD20Test(request, {}, observationFor(request, [10]))?.computedOutcome
    ).toMatchObject({
      appliedAutomaticCriticalSourceIds: [],
      critical: false,
      hit: false,
    });

    const hit = attack(15, 20, ["automatic-critical-1"]);
    expect(
      evaluateD20Test(hit, {}, observationFor(hit, [10]))?.computedOutcome
    ).toMatchObject({
      appliedAutomaticCriticalSourceIds: ["automatic-critical-1"],
      critical: true,
      hit: true,
    });

    const overridden = evaluateD20Test(
      request,
      {},
      observationFor(request, [10], {
        tableOverride: {
          critical: true,
          hit: true,
          kind: "attack",
          reasonId: "table-ruling",
          sourceId: "review-1",
        },
      })
    );
    expect(overridden?.computedOutcome.status).toBe("failure");
    expect(overridden?.outcome).toMatchObject({
      basis: "table-override",
      critical: true,
      hit: true,
    });
    expect(overridden?.observation.tableOverride).toEqual({
      critical: true,
      hit: true,
      kind: "attack",
      reasonId: "table-ruling",
      sourceId: "review-1",
    });
    expect(
      evaluateD20Test(
        request,
        {},
        observationFor(request, [10], {
          tableOverride: {
            critical: true,
            hit: false,
            kind: "attack",
            reasonId: "table-ruling",
            sourceId: "review-1",
          },
        })
      )
    ).toBeNull();
  });
});

describe("checks and saving throws", () => {
  it("does not invent natural success or failure for ordinary D20 Tests", () => {
    const save: D20TestRequest = {
      ...savingThrow(10),
      modifiers: [{ sourceId: "save-bonus-1", value: fixed(9) }],
    };
    expect(
      evaluateD20Test(save, {}, observationFor(save, [1]))?.computedOutcome.status
    ).toBe("success");

    const check: D20TestRequest = {
      actor: ACTOR,
      ability: "WIS",
      difficultyClass: fixed(10),
      enteredModifiers: [],
      kind: "ability-check",
      modifiers: [{ sourceId: "check-penalty-1", value: fixed(-11) }],
      resolution: { kind: "rolled" },
      rollRules: rollRules(),
      target: null,
      testId: "check-1",
    };
    expect(
      evaluateD20Test(check, {}, observationFor(check, [20]))?.computedOutcome.status
    ).toBe("failure");
  });

  it("combines IntegerExpression modifiers, exact entered modifiers, and face floors", () => {
    const request: D20TestRequest = {
      actor: ACTOR,
      ability: "DEX",
      difficultyClass: binding("difficultyClass"),
      enteredModifiers: [
        {
          kind: "exact",
          maximum: fixed(4),
          minimum: fixed(1),
          required: true,
          sourceId: "guidance-1",
        },
        {
          kind: "exact",
          maximum: fixed(-1),
          minimum: fixed(-8),
          required: false,
          sourceId: "penalty-die-1",
        },
      ],
      kind: "ability-check",
      modifiers: [
        { sourceId: "ability-1", value: binding("abilityModifier") },
        { sourceId: "exhaustion-1", value: fixed(-2) },
      ],
      resolution: { kind: "rolled" },
      rollRules: rollRules({
        faceFloors: [{ minimumFace: fixed(10), sourceId: "reliable-talent-1" }],
      }),
      target: null,
      testId: "check-1",
    };
    const bindings = { abilityModifier: 4, difficultyClass: 15 };
    const result = evaluateD20Test(
      request,
      bindings,
      observationFor(request, [3], {
        bindings,
        enteredModifiers: [{ kind: "exact", sourceId: "guidance-1", value: 3 }],
      })
    );
    expect(result).toMatchObject({
      appliedFaceFloorSourceIds: ["reliable-talent-1"],
      effectiveFace: 10,
      enteredModifierTotal: 3,
      margin: 0,
      selectedNaturalFace: 3,
      total: 15,
      computedOutcome: { outcomeId: "success", status: "success" },
    });

    expect(
      evaluateD20Test(request, bindings, observationFor(request, [10], { bindings }))
    ).toBeNull();
  });

  it("applies total floors after every modifier and preserves pre-floor provenance", () => {
    const request: D20TestRequest = {
      actor: ACTOR,
      ability: "STR",
      difficultyClass: fixed(18),
      enteredModifiers: [
        {
          kind: "exact",
          maximum: fixed(4),
          minimum: fixed(1),
          required: true,
          sourceId: "guidance-1",
        },
      ],
      kind: "ability-check",
      modifiers: [{ sourceId: "strength-modifier-1", value: fixed(2) }],
      resolution: { kind: "rolled" },
      rollRules: rollRules({
        totalFloors: [
          { minimumTotal: fixed(18), sourceId: "indomitable-might-1" },
          { minimumTotal: fixed(18), sourceId: "indomitable-might-echo-1" },
        ],
      }),
      target: null,
      testId: "strength-check-1",
    };
    const enteredModifiers: D20TestObservation["enteredModifiers"] = [
      { kind: "exact", sourceId: "guidance-1", value: 3 },
    ];
    const raised = evaluateD20Test(
      request,
      {},
      observationFor(request, [5], { enteredModifiers })
    );
    expect(raised).toMatchObject({
      appliedTotalFloorSourceIds: ["indomitable-might-1", "indomitable-might-echo-1"],
      enteredModifierTotal: 3,
      margin: 0,
      preFloorTotal: 10,
      total: 18,
      computedOutcome: { outcomeId: "success", status: "success" },
    });

    const alreadyHigher = evaluateD20Test(
      request,
      {},
      observationFor(request, [20], { enteredModifiers })
    );
    expect(alreadyHigher).toMatchObject({
      appliedTotalFloorSourceIds: [],
      preFloorTotal: 25,
      total: 25,
    });
  });

  it("resolves entered DiceFormula modifiers with authorized replacement history", () => {
    const request: D20TestRequest = {
      ...savingThrow(12),
      enteredModifiers: [
        {
          formula: {
            terms: [
              {
                count: fixed(1),
                kind: "dice",
                operation: "add",
                sides: 4,
                termId: "guidance-die",
              },
            ],
          },
          kind: "dice-formula",
          required: true,
          sourceId: "guidance-1",
        },
      ],
      rollRules: rollRules({
        replacements: [
          {
            appliesTo: "any-die",
            rule: {
              kind: "any-face",
              maximumUses: fixed(1),
              sourceId: "heroic-inspiration-1",
            },
          },
          {
            appliesTo: "d20",
            rule: {
              faces: [1],
              kind: "faces",
              maximumUses: fixed(1),
              sourceId: "halfling-lucky-1",
            },
          },
        ],
      }),
    };
    const guidance = enteredDiceObservation(request, "guidance-1", [1], {
      replacements: [[{ face: 4, sourceId: "heroic-inspiration-1" }]],
    });
    const result = evaluateD20Test(
      request,
      {},
      observationFor(request, [8], { enteredModifiers: [guidance] })
    );
    expect(result).toMatchObject({
      enteredModifierTotal: 4,
      preFloorTotal: 12,
      resolvedEnteredModifiers: [
        {
          kind: "dice-formula",
          sourceId: "guidance-1",
          value: 4,
          resolution: {
            total: 4,
            trails: [
              {
                effectiveFace: 4,
                initialFace: 1,
                steps: [
                  {
                    face: 4,
                    kind: "replacement",
                    sourceId: "heroic-inspiration-1",
                  },
                ],
              },
            ],
          },
        },
      ],
      total: 12,
    });

    const d20OnlyOnGuidance = enteredDiceObservation(request, "guidance-1", [1], {
      replacements: [[{ face: 4, sourceId: "halfling-lucky-1" }]],
    });
    expect(
      evaluateD20Test(
        request,
        {},
        observationFor(request, [8], { enteredModifiers: [d20OnlyOnGuidance] })
      )
    ).toBeNull();

    const reusedHeroicInspiration = enteredDiceObservation(request, "guidance-1", [1], {
      replacements: [[{ face: 4, sourceId: "heroic-inspiration-1" }]],
    });
    expect(
      evaluateD20Test(
        request,
        {},
        observationFor(request, [8], {
          enteredModifiers: [reusedHeroicInspiration],
          replacements: [[{ face: 12, sourceId: "heroic-inspiration-1" }]],
        })
      )
    ).toBeNull();

    expect(
      evaluateD20Test(
        request,
        {},
        observationFor(request, [8], {
          enteredModifiers: [{ kind: "exact", sourceId: "guidance-1", value: 4 }],
        })
      )
    ).toBeNull();

    const outOfRangeGuidance = enteredDiceObservation(request, "guidance-1", [5]);
    expect(
      evaluateD20Test(
        request,
        {},
        observationFor(request, [8], {
          enteredModifiers: [outOfRangeGuidance],
        })
      )
    ).toBeNull();
  });

  it("represents initiative as a total-only Ability Check", () => {
    const request: D20TestRequest = {
      actor: ACTOR,
      ability: "DEX",
      difficultyClass: null,
      enteredModifiers: [],
      kind: "ability-check",
      modifiers: [{ sourceId: "initiative-bonus-1", value: fixed(3) }],
      resolution: { kind: "rolled" },
      rollRules: rollRules(),
      target: null,
      testId: "initiative-1",
    };
    const result = evaluateD20Test(request, {}, observationFor(request, [14]));
    expect(result).toMatchObject({
      margin: null,
      total: 17,
      computedOutcome: { outcomeId: "total-only", status: "total-only" },
    });
  });
});

describe("death saving throws", () => {
  function deathSave(recoveryThreshold = 20): D20TestRequest {
    return {
      actor: ACTOR,
      enteredModifiers: [],
      kind: "death-save",
      modifiers: [],
      recoveryThreshold: fixed(recoveryThreshold),
      resolution: { kind: "rolled" },
      rollRules: rollRules(),
      target: null,
      testId: "death-save-1",
    };
  }

  it("uses natural 1 and the recovery threshold independently of modifiers and floors", () => {
    const naturalOne: D20TestRequest = {
      ...deathSave(),
      modifiers: [{ sourceId: "death-save-bonus-1", value: fixed(100) }],
      rollRules: rollRules({
        faceFloors: [{ minimumFace: fixed(10), sourceId: "face-floor-1" }],
      }),
    };
    expect(
      evaluateD20Test(naturalOne, {}, observationFor(naturalOne, [1]))?.computedOutcome
    ).toMatchObject({
      failures: 2,
      naturalOne: true,
      outcomeId: "death-save-natural-one",
      status: "failure",
    });

    const survivor = deathSave(18);
    expect(
      evaluateD20Test(survivor, {}, observationFor(survivor, [18]))?.computedOutcome
    ).toMatchObject({
      hitPointsRegained: 1,
      outcomeId: "death-save-recovery",
      recoveryBenefit: true,
      successes: 0,
    });
  });

  it("uses the modified total against DC 10 for an ordinary death save", () => {
    const request: D20TestRequest = {
      ...deathSave(),
      enteredModifiers: [
        {
          kind: "exact",
          maximum: fixed(4),
          minimum: fixed(1),
          required: true,
          sourceId: "death-save-die-1",
        },
      ],
      modifiers: [
        { sourceId: "all-save-bonus-1", value: fixed(3) },
        { sourceId: "exhaustion-1", value: fixed(-2) },
      ],
    };
    const result = evaluateD20Test(
      request,
      {},
      observationFor(request, [6], {
        enteredModifiers: [{ kind: "exact", sourceId: "death-save-die-1", value: 3 }],
      })
    );
    expect(result).toMatchObject({
      margin: 0,
      total: 10,
      computedOutcome: {
        failures: 0,
        outcomeId: "death-save-success",
        successes: 1,
      },
    });

    const overridden = evaluateD20Test(
      request,
      {},
      observationFor(request, [10], {
        enteredModifiers: [{ kind: "exact", sourceId: "death-save-die-1", value: 1 }],
        tableOverride: {
          kind: "death-save",
          reasonId: "table-ruling",
          result: "regain-one-hit-point",
          sourceId: "review-1",
        },
      })
    );
    expect(overridden?.outcome).toMatchObject({
      basis: "table-override",
      hitPointsRegained: 1,
      outcomeId: "death-save-recovery",
      successes: 0,
    });

    const twoFailures = evaluateD20Test(
      deathSave(),
      {},
      observationFor(deathSave(), [12], {
        tableOverride: {
          kind: "death-save",
          reasonId: "table-ruling",
          result: "two-failures",
          sourceId: "review-2",
        },
      })
    );
    expect(twoFailures?.outcome).toMatchObject({
      failures: 2,
      naturalOne: false,
      outcomeId: "death-save-two-failures",
    });
  });
});

describe("fixed facts, overrides, and immutable results", () => {
  it("resolves automatic and ineligible facts without accepting physical dice", () => {
    const automatic: D20TestRequest = {
      ...savingThrow(18),
      resolution: {
        kind: "automatic",
        outcome: "failure",
        reasonId: "automatic-failure",
        sourceId: "automatic-failure-1",
      },
    };
    const automaticObservation = observationFor(automatic, []);
    expect(evaluateD20Test(automatic, {}, automaticObservation)).toMatchObject({
      selectedNaturalFace: null,
      total: null,
      computedOutcome: { basis: "automatic", status: "failure" },
    });
    expect(
      evaluateD20Test(
        automatic,
        {},
        {
          ...automaticObservation,
          d20: { aggregates: [], trails: [] },
        }
      )
    ).toBeNull();

    const ineligible: D20TestRequest = {
      ...savingThrow(),
      resolution: {
        kind: "ineligible",
        reasonId: "no-valid-target",
        sourceId: "ineligible-1",
      },
    };
    const overridden = evaluateD20Test(
      ineligible,
      {},
      observationFor(ineligible, [], {
        tableOverride: {
          kind: "outcome",
          outcome: "success",
          reasonId: "table-ruling",
          sourceId: "review-1",
        },
      })
    );
    expect(overridden?.computedOutcome.status).toBe("ineligible");
    expect(overridden?.outcome).toMatchObject({
      basis: "table-override",
      status: "success",
    });
  });

  it("returns a detached, deeply frozen review fact and rejects physical forgery", () => {
    const request = savingThrow(12);
    const observation = observationFor(request, [11]);
    const result = evaluateD20Test(request, {}, observation);
    expect(result?.computedOutcome.status).toBe("failure");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.review.request.actor.material)).toBe(true);
    expect(Object.isFrozen(result?.observation.d20)).toBe(true);

    const forged = {
      ...observation,
      d20: {
        aggregates: [],
        trails: [
          {
            initialFace: 20,
            steps: [],
            trailId: "forged-trail-1",
          },
        ],
      },
    };
    expect(evaluateD20Test(request, {}, forged)).toBeNull();
    expect(evaluateD20Test(request, { missing: Number.NaN }, observation)).toBeNull();
  });
});
