import { describe, expect, it } from "vitest";

import {
  conformDiceAcceptancePolicy,
  conformDiceFormula,
  conformDiceObservation,
  conformDiceReplacementPolicy,
  conformDiceResolution,
  conformDiceRollRequirement,
  countAuthorizedDiceReplacementUses,
  diceReplacementsAreAuthorized,
  evaluateDiceFormula,
  evaluateDiceReplacementPolicy,
  resolveDiceObservation,
} from "@/lib/dice-formula";
import { STANDARD_DIE_SIDES } from "@/types/dice-formula";

const fixed = (value: number) => ({ kind: "fixed" as const, value });
const binding = (bindingId: string) => ({ kind: "binding" as const, bindingId });

describe("DiceFormula", () => {
  it("exactly conforms, clones, and deeply freezes one authored formula", () => {
    const source = {
      terms: [
        {
          count: fixed(2),
          kind: "dice",
          operation: "add",
          sides: 6,
          termId: "damage",
        },
      ],
    };

    const formula = conformDiceFormula(source);

    expect(formula).toEqual(source);
    expect(formula).not.toBe(source);
    expect(Object.isFrozen(formula)).toBe(true);
    expect(Object.isFrozen(formula?.terms)).toBe(true);
    expect(Object.isFrozen(formula?.terms[0]?.count)).toBe(true);
    const sourceTerm = source.terms[0];
    if (!sourceTerm) throw new Error("test formula lost its only term");
    sourceTerm.termId = "changed";
    expect(formula?.terms[0]?.termId).toBe("damage");
  });

  it("rejects aliases, duplicate ids, formulas without dice, and nonstandard dice", () => {
    expect(
      conformDiceFormula({
        terms: [
          {
            count: fixed(1),
            kind: "dice",
            operation: "add",
            sides: 6,
            termId: "same",
          },
          {
            count: fixed(1),
            kind: "dice",
            operation: "add",
            sides: 8,
            termId: "same",
          },
        ],
      })
    ).toBeNull();
    expect(
      conformDiceFormula({
        terms: [
          {
            kind: "integer",
            operation: "add",
            termId: "flat",
            value: fixed(2),
          },
        ],
      })
    ).toBeNull();
    expect(
      conformDiceFormula({
        terms: [
          {
            count: fixed(1),
            kind: "dice",
            operation: "add",
            sides: 5,
            termId: "damage",
          },
        ],
      })
    ).toBeNull();
    expect(
      conformDiceFormula({
        terms: [
          {
            count: fixed(1),
            kind: "dice",
            operation: "add",
            sides: 6,
            termId: "damage",
            modifier: 2,
          },
        ],
      })
    ).toBeNull();
  });

  it("accepts the complete canonical D&D die family", () => {
    const requirement = evaluateDiceFormula(
      {
        terms: STANDARD_DIE_SIDES.map((sides) => ({
          count: fixed(1),
          kind: "dice" as const,
          operation: "add" as const,
          sides,
          termId: `die-${sides}`,
        })),
      },
      {}
    );

    expect(requirement?.trails.map((trail) => trail.sides)).toEqual(STANDARD_DIE_SIDES);
  });

  it("evaluates scaling, mixed groups, subtraction, modifiers, ids, and bounds", () => {
    const formula = {
      terms: [
        {
          count: binding("damageDice"),
          kind: "dice",
          operation: "add",
          sides: 6,
          termId: "fire",
        },
        {
          count: fixed(1),
          kind: "dice",
          operation: "subtract",
          sides: 4,
          termId: "penalty",
        },
        {
          kind: "integer",
          operation: "add",
          termId: "ability",
          value: binding("abilityModifier"),
        },
        {
          kind: "integer",
          operation: "subtract",
          termId: "flat-reduction",
          value: fixed(2),
        },
      ],
    };

    const requirement = evaluateDiceFormula(formula, {
      abilityModifier: 3,
      damageDice: 3,
    });

    expect(requirement).toEqual({
      acceptanceRules: [],
      aggregates: [],
      deterministicTerms: [
        { operation: "add", termId: "ability", value: 3 },
        { operation: "subtract", termId: "flat-reduction", value: 2 },
      ],
      maximumTotal: 18,
      minimumTotal: 0,
      trails: [
        {
          maximumFace: 6,
          minimumFace: 1,
          operation: "add",
          sides: 6,
          termId: "fire",
          trailId: "5:trail4:fire1:0",
        },
        {
          maximumFace: 6,
          minimumFace: 1,
          operation: "add",
          sides: 6,
          termId: "fire",
          trailId: "5:trail4:fire1:1",
        },
        {
          maximumFace: 6,
          minimumFace: 1,
          operation: "add",
          sides: 6,
          termId: "fire",
          trailId: "5:trail4:fire1:2",
        },
        {
          maximumFace: 4,
          minimumFace: 1,
          operation: "subtract",
          sides: 4,
          termId: "penalty",
          trailId: "5:trail7:penalty1:0",
        },
      ],
    });
    expect(Object.isFrozen(requirement)).toBe(true);
  });

  it("returns failure for missing bindings, negative or excessive counts, and overflow", () => {
    const scaling = {
      terms: [
        {
          count: binding("count"),
          kind: "dice",
          operation: "add",
          sides: 6,
          termId: "damage",
        },
      ],
    };
    expect(evaluateDiceFormula(scaling, {})).toBeNull();
    expect(evaluateDiceFormula(scaling, { count: -1 })).toBeNull();
    expect(evaluateDiceFormula(scaling, { count: 257 })).toBeNull();
    expect(
      evaluateDiceFormula(
        {
          terms: [
            {
              count: fixed(1),
              kind: "dice",
              operation: "add",
              sides: 2,
              termId: "die",
            },
            {
              kind: "integer",
              operation: "add",
              termId: "limit",
              value: fixed(Number.MAX_SAFE_INTEGER),
            },
          ],
        },
        {}
      )
    ).toBeNull();
  });

  it("resolves replacement chains and retains exact contribution provenance", () => {
    const requirement = evaluateDiceFormula(
      {
        terms: [
          {
            count: fixed(2),
            kind: "dice",
            operation: "add",
            sides: 6,
            termId: "damage",
          },
          {
            count: fixed(1),
            kind: "dice",
            operation: "subtract",
            sides: 4,
            termId: "ward",
          },
          {
            kind: "integer",
            operation: "add",
            termId: "modifier",
            value: fixed(3),
          },
        ],
      },
      {}
    );
    const firstId = requirement?.trails[0]?.trailId;
    const secondId = requirement?.trails[1]?.trailId;
    const wardId = requirement?.trails[2]?.trailId;
    expect(firstId).toBeDefined();
    expect(secondId).toBeDefined();
    expect(wardId).toBeDefined();
    const observation = {
      aggregates: [],
      trails: [
        {
          initialFace: 2,
          steps: [
            { face: 4, kind: "replacement", sourceId: "empowered-spell" },
            { face: 5, kind: "replacement", sourceId: "table-override" },
          ],
          trailId: firstId,
        },
        { initialFace: 6, steps: [], trailId: secondId },
        { initialFace: 4, steps: [], trailId: wardId },
      ],
    };

    const result = resolveDiceObservation(requirement, observation);

    expect(result?.total).toBe(10);
    expect(result?.trails.map((trail) => trail.contribution)).toEqual([5, 6, -4]);
    expect(result?.trails[0]).toMatchObject({
      effectiveFace: 5,
      initialFace: 2,
      steps: [
        { face: 4, kind: "replacement", sourceId: "empowered-spell" },
        { face: 5, kind: "replacement", sourceId: "table-override" },
      ],
    });
    expect(result?.deterministicTerms).toEqual([
      { contribution: 3, operation: "add", termId: "modifier", value: 3 },
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.trails[0]?.steps)).toBe(true);
    expect(conformDiceResolution(result)).toEqual(result);
    expect(
      conformDiceResolution({
        ...result,
        total: 11,
      })
    ).toBeNull();
    expect(
      conformDiceResolution({
        ...result,
        trails: result?.trails.map((trail, index) =>
          index === 0 ? { ...trail, effectiveFace: 4 } : trail
        ),
      })
    ).toBeNull();
    expect(
      conformDiceResolution({
        ...result,
        deterministicTerms: result?.deterministicTerms.map((term) => ({
          ...term,
          contribution: 4,
        })),
      })
    ).toBeNull();
  });

  it("requires every expected trail in exact order and rejects invalid faces", () => {
    const requirement = evaluateDiceFormula(
      {
        terms: [
          {
            count: fixed(2),
            kind: "dice",
            operation: "add",
            sides: 6,
            termId: "damage",
          },
        ],
      },
      {}
    );
    const ids = requirement?.trails.map((trail) => trail.trailId) ?? [];
    const valid = {
      aggregates: [],
      trails: ids.map((trailId, index) => ({
        initialFace: index + 1,
        steps: [],
        trailId,
      })),
    };
    expect(resolveDiceObservation(requirement, valid)?.total).toBe(3);
    expect(
      resolveDiceObservation(requirement, {
        ...valid,
        trails: [...valid.trails].reverse(),
      })
    ).toBeNull();
    expect(
      resolveDiceObservation(requirement, {
        ...valid,
        trails: valid.trails.slice(0, 1),
      })
    ).toBeNull();
    expect(
      resolveDiceObservation(requirement, {
        ...valid,
        trails: [{ ...valid.trails[0], initialFace: 7 }, valid.trails[1]],
      })
    ).toBeNull();
    expect(
      resolveDiceObservation(requirement, {
        ...valid,
        trails: [
          {
            ...valid.trails[0],
            steps: [{ face: 0, kind: "replacement", sourceId: "reroll" }],
          },
          valid.trails[1],
        ],
      })
    ).toBeNull();
  });

  it("uses aggregate entry only when the authored formula explicitly requires it", () => {
    const requirement = evaluateDiceFormula(
      {
        terms: [
          {
            count: fixed(2),
            kind: "aggregate-dice",
            operation: "add",
            sides: 6,
            termId: "hidden-roll",
          },
          {
            kind: "integer",
            operation: "add",
            termId: "bonus",
            value: fixed(1),
          },
        ],
      },
      {}
    );
    const rollId = requirement?.aggregates[0]?.rollId;

    expect(requirement).toMatchObject({
      aggregates: [
        {
          count: 2,
          maximumTotal: 12,
          minimumTotal: 2,
          rollId: "9:aggregate11:hidden-roll",
          sides: 6,
        },
      ],
      maximumTotal: 13,
      minimumTotal: 3,
      trails: [],
    });
    expect(
      resolveDiceObservation(requirement, {
        aggregates: [{ rollId, total: 7 }],
        trails: [],
      })?.total
    ).toBe(8);
    expect(
      resolveDiceObservation(requirement, {
        aggregates: [{ rollId, total: 1 }],
        trails: [],
      })
    ).toBeNull();
    expect(
      resolveDiceObservation(requirement, {
        aggregates: [],
        trails: [{ initialFace: 6, steps: [], trailId: rollId }],
      })
    ).toBeNull();
  });

  it("supports a zero evaluated die count without asking the table for fake rolls", () => {
    const requirement = evaluateDiceFormula(
      {
        terms: [
          {
            count: binding("count"),
            kind: "dice",
            operation: "add",
            sides: 8,
            termId: "scaling",
          },
          {
            kind: "integer",
            operation: "subtract",
            termId: "zero",
            value: fixed(0),
          },
        ],
      },
      { count: 0 }
    );

    expect(requirement).toMatchObject({
      aggregates: [],
      maximumTotal: 0,
      minimumTotal: 0,
      trails: [],
    });
    expect(
      resolveDiceObservation(requirement, { aggregates: [], trails: [] })?.total
    ).toBe(0);
  });

  it("rejects duplicate observations, excessive chains, and forged requirements", () => {
    const source = {
      aggregates: [],
      trails: [
        {
          initialFace: 1,
          steps: [{ face: 2, kind: "replacement", sourceId: "reroll" }],
          trailId: "trail",
        },
      ],
    };
    const canonical = conformDiceObservation(source);
    expect(canonical).toEqual(source);
    expect(canonical).not.toBe(source);
    expect(Object.isFrozen(canonical?.trails[0]?.steps)).toBe(true);
    const sourceTrail = source.trails[0];
    if (!sourceTrail) throw new Error("test observation lost its only trail");
    sourceTrail.steps.push({ face: 3, kind: "replacement", sourceId: "later" });
    expect(canonical?.trails[0]?.steps).toHaveLength(1);

    const replacements = Array.from({ length: 65 }, (_, index) => ({
      face: 1,
      sourceId: `source-${index}`,
    }));
    expect(
      conformDiceObservation({
        aggregates: [{ rollId: "same", total: 2 }],
        trails: [{ initialFace: 1, steps: [], trailId: "same" }],
      })
    ).toBeNull();
    expect(
      conformDiceObservation({
        aggregates: [],
        trails: [{ initialFace: 1, replacements, trailId: "trail" }],
      })
    ).toBeNull();

    const requirement = evaluateDiceFormula(
      {
        terms: [
          {
            count: fixed(1),
            kind: "dice",
            operation: "add",
            sides: 6,
            termId: "damage",
          },
        ],
      },
      {}
    );
    expect(
      conformDiceRollRequirement({
        ...requirement,
        trails: requirement?.trails.map((trail) => ({
          ...trail,
          maximumFace: 4,
        })),
      })
    ).toBeNull();
  });

  it("authorizes replacement provenance once across a complete causal roll batch", () => {
    const authored = [
      {
        faces: [1, 2],
        kind: "faces" as const,
        maximumUses: fixed(2),
        sourceId: "reroll-low",
      },
      {
        kind: "any-face" as const,
        maximumUses: fixed(1),
        sourceId: "inspiration",
      },
    ];
    const policy = evaluateDiceReplacementPolicy(authored, {});
    expect(policy).toEqual([
      {
        faces: [1, 2],
        kind: "faces",
        maximumUses: 2,
        sourceId: "reroll-low",
      },
      {
        kind: "any-face",
        maximumUses: 1,
        sourceId: "inspiration",
      },
    ]);
    if (!policy) throw new Error("replacement policy fixture");

    const first = {
      contribution: 4,
      effectiveFace: 4,
      initialFace: 1,
      operation: "add" as const,
      steps: [{ face: 4, kind: "replacement", sourceId: "reroll-low" }],
      sides: 6 as const,
      termId: "first",
      trailId: "first:0",
    };
    const second = {
      ...first,
      contribution: 6,
      effectiveFace: 6,
      steps: [
        { face: 2, kind: "replacement", sourceId: "reroll-low" },
        { face: 6, kind: "replacement", sourceId: "inspiration" },
      ],
      termId: "second",
      trailId: "second:0",
    };
    expect(
      diceReplacementsAreAuthorized([
        { rules: policy, trails: [first] },
        { rules: policy, trails: [second] },
      ])
    ).toBe(true);
    expect(
      countAuthorizedDiceReplacementUses([
        { rules: policy, trails: [first] },
        { rules: policy, trails: [second] },
      ])
    ).toEqual({ inspiration: 1, "reroll-low": 2 });
    expect(
      diceReplacementsAreAuthorized([
        { rules: policy, trails: [first] },
        { rules: policy, trails: [second, first] },
      ])
    ).toBe(false);
    expect(
      diceReplacementsAreAuthorized([{ rules: policy.slice(0, 1), trails: [second] }])
    ).toBe(false);

    expect(conformDiceReplacementPolicy([{ ...authored[0], faces: [2, 1] }])).toBeNull();
    expect(
      conformDiceReplacementPolicy([
        authored[0],
        { ...authored[1], sourceId: "reroll-low" },
      ])
    ).toBeNull();
  });

  it("requires physical rerolls until a term-local face is accepted", () => {
    const policy = [
      {
        kind: "reroll-faces-until-accepted" as const,
        rejectedFaces: [8],
        ruleId: "prismatic-spray-color-8",
        termIds: ["color"],
      },
    ];
    const requirement = evaluateDiceFormula(
      {
        terms: [
          {
            count: fixed(1),
            kind: "dice",
            operation: "add",
            sides: 8,
            termId: "color",
          },
        ],
      },
      {},
      policy
    );
    const trailId = requirement?.trails[0]?.trailId;
    expect(requirement?.acceptanceRules).toEqual(policy);
    expect(
      resolveDiceObservation(requirement, {
        aggregates: [],
        trails: [
          {
            initialFace: 8,
            steps: [
              {
                face: 8,
                kind: "required-reroll",
                ruleId: "prismatic-spray-color-8",
              },
              {
                face: 3,
                kind: "required-reroll",
                ruleId: "prismatic-spray-color-8",
              },
            ],
            trailId,
          },
        ],
      })
    ).toMatchObject({
      total: 3,
      trails: [
        {
          effectiveFace: 3,
          initialFace: 8,
          steps: [
            { face: 8, kind: "required-reroll" },
            { face: 3, kind: "required-reroll" },
          ],
        },
      ],
    });
    for (const invalidSteps of [
      [],
      [
        {
          face: 3,
          kind: "required-reroll" as const,
          ruleId: "wrong-rule",
        },
      ],
      [
        {
          face: 3,
          kind: "replacement" as const,
          sourceId: "voluntary",
        },
      ],
    ]) {
      expect(
        resolveDiceObservation(requirement, {
          aggregates: [],
          trails: [{ initialFace: 8, steps: invalidSteps, trailId }],
        })
      ).toBeNull();
    }
    expect(
      resolveDiceObservation(requirement, {
        aggregates: [],
        trails: [
          {
            initialFace: 3,
            steps: [
              {
                face: 4,
                kind: "required-reroll",
                ruleId: "prismatic-spray-color-8",
              },
            ],
            trailId,
          },
        ],
      })
    ).toBeNull();
  });

  it("rejects ambiguous, impossible, and noncanonical acceptance policies", () => {
    expect(
      conformDiceAcceptancePolicy([
        {
          kind: "reroll-faces-until-accepted",
          rejectedFaces: [8, 1],
          ruleId: "unordered",
          termIds: ["color"],
        },
      ])
    ).toBeNull();
    expect(
      evaluateDiceFormula(
        {
          terms: [
            {
              count: fixed(1),
              kind: "dice",
              operation: "add",
              sides: 2,
              termId: "coin",
            },
          ],
        },
        {},
        [
          {
            kind: "reroll-faces-until-accepted",
            rejectedFaces: [1, 2],
            ruleId: "no-accepted-face",
            termIds: ["coin"],
          },
        ]
      )
    ).toBeNull();
    expect(
      conformDiceAcceptancePolicy([
        {
          kind: "reroll-faces-until-accepted",
          rejectedFaces: [1],
          ruleId: "first",
          termIds: ["die"],
        },
        {
          kind: "reroll-faces-until-accepted",
          rejectedFaces: [1],
          ruleId: "second",
          termIds: ["die"],
        },
      ])
    ).toBeNull();
  });
});
