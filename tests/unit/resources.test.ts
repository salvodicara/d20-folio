import { describe, expect, it, vi } from "vitest";

import {
  evaluateDiceFormula,
  resolveDiceObservation,
  type DiceFormula,
  type DiceObservation,
  type DiceResolution,
} from "@/lib/dice-formula";
import {
  conformIntegerExpression,
  evaluateIntegerExpression,
  type IntegerBindings,
} from "@/lib/integer-expression";
import {
  conformResourceCell,
  conformResourceRef,
  conformResourceSelector,
  conformResourceSpec,
  conformResourceTerm,
  initializeResource,
  reduceResource,
  resourceRefKey,
} from "@/lib/resources";
import type { ResourceSpec } from "@/types/resource";

const fixed = (value: number) => ({ kind: "fixed", value }) as const;

function dieFormula(
  sides: 4 | 6 | 20 | 100,
  count = 1,
  termId = "resource-value"
): DiceFormula {
  return {
    terms: [
      {
        count: fixed(count),
        kind: "dice",
        operation: "add",
        sides,
        termId,
      },
    ],
  };
}

function observationFor(
  formula: DiceFormula,
  faces: readonly number[],
  bindings: IntegerBindings = {},
  replacements: Readonly<
    Record<number, readonly { readonly face: number; readonly sourceId: string }[]>
  > = {}
): DiceObservation {
  const requirement = evaluateDiceFormula(formula, bindings);
  if (!requirement || requirement.trails.length !== faces.length) {
    throw new Error("test observation does not match its formula");
  }
  return {
    aggregates: [],
    trails: requirement.trails.map((trail, index) => ({
      initialFace: faces[index] as number,
      steps: (replacements[index] ?? []).map((replacement) => ({
        ...replacement,
        kind: "replacement" as const,
      })),
      trailId: trail.trailId,
    })),
  };
}

function resolutionFor(
  formula: DiceFormula,
  faces: readonly number[],
  bindings: IntegerBindings = {},
  replacements: Readonly<
    Record<number, readonly { readonly face: number; readonly sourceId: string }[]>
  > = {}
): Readonly<DiceResolution> {
  const requirement = evaluateDiceFormula(formula, bindings);
  const resolution = resolveDiceObservation(
    requirement,
    observationFor(formula, faces, bindings, replacements)
  );
  if (!resolution) throw new Error("test dice resolution is invalid");
  return resolution;
}

const d4 = dieFormula(4);
const d6 = dieFormula(6);
const d20 = dieFormula(20);
const conditionalFormula = {
  terms: [
    {
      count: { bindingId: "dice-count", kind: "binding" },
      kind: "dice",
      operation: "add",
      sides: 4,
      termId: "conditional-dice",
    },
    {
      kind: "integer",
      operation: "add",
      termId: "deterministic-value",
      value: fixed(2),
    },
  ],
} as const satisfies DiceFormula;
const scalingCapacityFormula = {
  terms: [
    {
      count: fixed(1),
      kind: "dice",
      operation: "add",
      sides: 4,
      termId: "capacity-die",
    },
    {
      kind: "integer",
      operation: "add",
      termId: "capacity-bonus",
      value: { bindingId: "capacity-bonus", kind: "binding" },
    },
  ],
} as const satisfies DiceFormula;

const countSpec = {
  capacity: { amount: fixed(3), kind: "bounded" },
  id: "focus",
  initial: { kind: "full" },
  kind: "count",
  recoveries: [
    { amount: { kind: "full" }, trigger: { kind: "long-rest" } },
    { amount: { amount: fixed(2), kind: "fixed" }, trigger: { kind: "dawn" } },
    {
      amount: { formula: d4, kind: "formula" },
      trigger: { eventId: "feature-reset", kind: "event" },
    },
  ],
} as const satisfies ResourceSpec;

const rolledSpec = {
  capacity: { amount: fixed(3), kind: "bounded" },
  formula: d20,
  id: "portents",
  initial: { kind: "full" },
  kind: "rolled",
  recoveries: [
    { amount: { kind: "full" }, trigger: { kind: "long-rest" } },
    { amount: { amount: fixed(2), kind: "fixed" }, trigger: { kind: "dawn" } },
  ],
} as const satisfies ResourceSpec;

describe("integer expressions", () => {
  it("uses one signed, exact grammar for arithmetic and deterministic bindings", () => {
    const expression = conformIntegerExpression({
      kind: "max",
      values: [
        {
          dividend: {
            kind: "add",
            terms: [
              { bindingId: "level", kind: "binding" },
              { kind: "fixed", value: -3 },
            ],
          },
          divisor: fixed(2),
          kind: "divide",
          rounding: "floor",
        },
        {
          factors: [fixed(-2), { kind: "min", values: [fixed(4), fixed(6)] }],
          kind: "multiply",
        },
      ],
    });

    expect(expression).not.toBeNull();
    expect(evaluateIntegerExpression(expression, { level: 10 })).toBe(3);
    expect(
      evaluateIntegerExpression(
        {
          dividend: fixed(-3),
          divisor: fixed(2),
          kind: "divide",
          rounding: "ceil",
        },
        {}
      )
    ).toBe(-1);
    expect(Object.isFrozen(expression)).toBe(true);
  });

  it("fails closed on aliases, bounds, missing inputs, division, depth, and overflow", () => {
    expect(
      conformIntegerExpression({ bindingId: "level", floor: 1, kind: "binding" })
    ).toBeNull();
    expect(conformIntegerExpression({ kind: "add", terms: [] })).toBeNull();
    expect(conformIntegerExpression({ kind: "min", values: [] })).toBeNull();
    expect(
      evaluateIntegerExpression({ bindingId: "missing", kind: "binding" }, {})
    ).toBeNull();
    expect(
      evaluateIntegerExpression(
        {
          dividend: fixed(4),
          divisor: fixed(0),
          kind: "divide",
          rounding: "floor",
        },
        {}
      )
    ).toBeNull();
    expect(
      evaluateIntegerExpression(
        {
          factors: [fixed(Number.MAX_SAFE_INTEGER), fixed(2)],
          kind: "multiply",
        },
        {}
      )
    ).toBeNull();

    let tooDeep: unknown = fixed(1);
    for (let depth = 0; depth < 18; depth += 1) {
      tooDeep = { kind: "max", values: [tooDeep] };
    }
    expect(conformIntegerExpression(tooDeep)).toBeNull();
    expect(
      conformIntegerExpression({
        kind: "add",
        terms: Array.from({ length: 33 }, () => fixed(1)),
      })
    ).toBeNull();
  });
});

describe("resource authoring and identity boundaries", () => {
  it("shares one exact selector/expression term without use-site assumptions", () => {
    const term = conformResourceTerm({
      amount: fixed(0),
      selector: { kind: "pool", owner: "source", resourceId: "ki" },
    });

    expect(term).toEqual({
      amount: fixed(0),
      selector: { kind: "pool", owner: "source", resourceId: "ki" },
    });
    expect(Object.isFrozen(term?.amount)).toBe(true);
    expect(
      conformResourceTerm({
        amount: fixed(1),
        selector: { kind: "pool", owner: "source", resourceId: "ki" },
        unexpected: "ki",
      })
    ).toBeNull();
  });

  it("accepts only the exact DiceFormula resource grammar", () => {
    expect(conformResourceSpec(countSpec)).not.toBeNull();
    expect(conformResourceSpec(rolledSpec)).not.toBeNull();
    expect(
      conformResourceSpec({
        ...countSpec,
        capacity: { alias: d4, formula: d4, kind: "formula" },
      })
    ).toBeNull();
    expect(
      conformResourceSpec({
        ...countSpec,
        recoveries: [
          { amount: { kind: "full" }, trigger: { kind: "long-rest" } },
          { amount: { kind: "full" }, trigger: { kind: "long-rest" } },
        ],
      })
    ).toBeNull();
    expect(
      conformResourceSpec({ ...countSpec, capacity: { kind: "unbounded" } })
    ).toBeNull();
    expect(
      conformResourceSpec({
        ...rolledSpec,
        formula: {
          terms: [
            {
              count: fixed(1),
              kind: "dice",
              operation: "add",
              sides: 5,
              termId: "invalid-die",
            },
          ],
        },
      })
    ).toBeNull();
  });

  it("keeps selectors exact and resource identities collision-safe", () => {
    expect(
      conformResourceSelector({
        item: { inputId: "wand", kind: "reviewed-input" },
        kind: "item-resource",
        owner: "activator",
        resourceId: "charges",
      })
    ).not.toBeNull();
    expect(
      conformResourceSelector({ kind: "unknown-selector", selectorId: "focus" })
    ).toBeNull();

    const first = conformResourceRef({
      kind: "pool",
      owner: {
        entityId: "a",
        material: { campaignId: "campaign", kind: "shared-combat" },
      },
      resourceId: "b:c",
    });
    const second = conformResourceRef({
      kind: "pool",
      owner: {
        entityId: "a:b",
        material: { campaignId: "campaign", kind: "shared-combat" },
      },
      resourceId: "c",
    });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    if (!first || !second) throw new Error("expected canonical resource refs");
    expect(resourceRefKey(first)).not.toBe(resourceRefKey(second));
    expect(
      conformResourceRef({
        character: { characterId: "hero", kind: "character-play", uid: "u" },
        instanceId: "physical-instance",
        instanceOrdinal: 1,
        itemId: "catalogue-id",
        kind: "item-resource",
        resourceId: "charges",
      })
    ).toBeNull();
  });

  it("includes the exact inventory generation in item-resource identity", () => {
    const character = { characterId: "hero", kind: "character-play", uid: "u" };
    const refs = [
      {
        character,
        instanceId: "wand",
        instanceOrdinal: 1,
        kind: "item-resource",
        resourceId: "charges",
      },
      {
        character,
        instanceId: "wand",
        instanceOrdinal: 2,
        kind: "item-resource",
        resourceId: "charges",
      },
      {
        character,
        instanceId: "wand",
        instanceOrdinal: 1,
        kind: "item-quantity",
      },
      {
        character,
        instanceId: "wand",
        instanceOrdinal: 2,
        kind: "item-quantity",
      },
    ].map(conformResourceRef);

    expect(refs.every((ref) => ref !== null)).toBe(true);
    const keys = refs.map((ref) => {
      if (!ref) throw new Error("expected exact inventory-generation resource ref");
      return resourceRefKey(ref);
    });
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("requires a positive inventory generation without compatibility aliases", () => {
    const character = { characterId: "hero", kind: "character-play", uid: "u" };
    expect(
      conformResourceRef({
        character,
        instanceId: "wand",
        instanceOrdinal: 1,
        kind: "item-quantity",
      })
    ).not.toBeNull();
    expect(
      [
        { character, instanceId: "wand", kind: "item-quantity" },
        {
          character,
          instanceId: "wand",
          instanceOrdinal: 0,
          kind: "item-quantity",
        },
        {
          character,
          instanceId: "wand",
          instanceOrdinal: 1.5,
          kind: "item-resource",
          resourceId: "charges",
        },
        {
          character,
          generation: 1,
          instanceId: "wand",
          instanceOrdinal: 1,
          kind: "item-resource",
          resourceId: "charges",
        },
      ].map(conformResourceRef)
    ).toEqual([null, null, null, null]);
  });
});

describe("resource initialization", () => {
  it("initializes count and rolled cells without fabricating physical facts", () => {
    expect(initializeResource(countSpec, {})).toEqual({
      cell: {
        capacity: { base: { kind: "derived", value: 3 }, override: null },
        current: 3,
        disabled: false,
        kind: "count",
      },
      status: "initialized",
    });
    expect(initializeResource(rolledSpec, {})).toEqual({
      cell: {
        capacity: { base: { kind: "derived", value: 3 }, override: null },
        disabled: false,
        kind: "rolled",
        values: [null, null, null],
      },
      status: "initialized",
    });
  });

  it("automatically resolves a formula whose evaluated dice count is zero", () => {
    expect(
      initializeResource(
        {
          ...countSpec,
          capacity: { formula: conditionalFormula, kind: "formula" },
        },
        { "dice-count": 0 }
      )
    ).toMatchObject({
      cell: {
        capacity: {
          base: {
            kind: "formula",
            resolution: {
              deterministicTerms: [
                {
                  contribution: 2,
                  termId: "deterministic-value",
                  value: 2,
                },
              ],
              total: 2,
            },
          },
          override: null,
        },
        current: 2,
      },
      status: "initialized",
    });
    expect(
      initializeResource(
        {
          ...countSpec,
          capacity: { formula: conditionalFormula, kind: "formula" },
        },
        { "dice-count": 0 },
        { capacity: { aggregates: [], trails: [] } }
      )
    ).toEqual({ reason: "unexpected-observation", status: "rejected" });
  });

  it("requests evaluated requirements in order and preserves capacity provenance", () => {
    const spec = {
      ...countSpec,
      capacity: { formula: d4, kind: "formula" },
      initial: { formula: d4, kind: "formula" },
    } as const satisfies ResourceSpec;
    const capacity = observationFor(
      d4,
      [2],
      {},
      {
        0: [{ face: 4, sourceId: "capacity-reroll" }],
      }
    );
    const initial = observationFor(d4, [2]);

    expect(initializeResource(spec, {})).toMatchObject({
      boundary: "capacity",
      requirement: { maximumTotal: 4, minimumTotal: 1 },
      status: "needs-observation",
    });
    expect(initializeResource(spec, {}, { capacity })).toMatchObject({
      boundary: "initial",
      requirement: { maximumTotal: 4, minimumTotal: 1 },
      status: "needs-observation",
    });
    const result = initializeResource(spec, {}, { capacity, initial });
    expect(result).toMatchObject({
      cell: {
        capacity: {
          base: {
            kind: "formula",
            resolution: {
              total: 4,
              trails: [
                {
                  effectiveFace: 4,
                  initialFace: 2,
                  steps: [
                    {
                      face: 4,
                      kind: "replacement",
                      sourceId: "capacity-reroll",
                    },
                  ],
                },
              ],
            },
          },
          override: null,
        },
        current: 2,
      },
      status: "initialized",
    });
  });

  it("rejects unexpected, malformed, impossible, unsafe, and over-capacity input", () => {
    expect(
      initializeResource(
        { ...countSpec, initial: { amount: fixed(4), kind: "fixed" } },
        {}
      )
    ).toEqual({ reason: "overfill", status: "rejected" });
    expect(
      initializeResource(
        { ...countSpec, initial: { amount: fixed(-1), kind: "fixed" } },
        {}
      )
    ).toEqual({ reason: "invalid-spec", status: "rejected" });
    expect(
      initializeResource(countSpec, {}, { initial: observationFor(d4, [2]) })
    ).toEqual({ reason: "unexpected-observation", status: "rejected" });

    const formulaCapacity = {
      ...countSpec,
      capacity: { formula: d4, kind: "formula" },
    } as const satisfies ResourceSpec;
    expect(
      initializeResource(formulaCapacity, {}, { capacity: observationFor(d4, [5]) })
    ).toEqual({ reason: "invalid-observation", status: "rejected" });
    expect(
      initializeResource(
        formulaCapacity,
        {},
        {
          capacity: {
            aggregates: [],
            trails: [
              {
                initialFace: 2,
                steps: [{ face: 3, kind: "replacement", sourceId: "" }],
                trailId: "wrong",
              },
            ],
          },
        }
      )
    ).toEqual({ reason: "invalid-observation", status: "rejected" });

    const negativeMinimum = {
      terms: [
        {
          count: fixed(1),
          kind: "dice",
          operation: "add",
          sides: 4,
          termId: "die",
        },
        {
          kind: "integer",
          operation: "subtract",
          termId: "penalty",
          value: fixed(2),
        },
      ],
    } as const satisfies DiceFormula;
    expect(
      initializeResource(
        { ...countSpec, capacity: { formula: negativeMinimum, kind: "formula" } },
        {}
      )
    ).toEqual({ reason: "invalid-spec", status: "rejected" });
    expect(initializeResource({ ...rolledSpec, formula: negativeMinimum }, {})).toEqual({
      reason: "invalid-spec",
      status: "rejected",
    });
    expect(
      initializeResource(
        {
          ...rolledSpec,
          capacity: { formula: dieFormula(100, 21), kind: "formula" },
        },
        {}
      )
    ).toEqual({ reason: "invalid-spec", status: "rejected" });
  });
});

describe("resource reducer", () => {
  it("applies count mutations exactly and reports depletion once", () => {
    const initial = {
      capacity: { base: { kind: "derived", value: 3 }, override: null },
      current: 2,
      disabled: false,
      kind: "count",
    } as const;
    const first = reduceResource(countSpec, initial, {}, { amount: 1, kind: "spend" });
    expect(first).toMatchObject({
      after: { current: 1 },
      facts: {
        afterRemaining: 1,
        becameEmpty: false,
        beforeRemaining: 2,
        recoveryResolution: null,
        spentResolution: null,
      },
      status: "applied",
    });
    if (first.status !== "applied") throw new Error("expected applied transition");
    expect(
      reduceResource(countSpec, first.after, {}, { amount: 1, kind: "spend" })
    ).toMatchObject({
      after: { current: 0 },
      facts: { becameEmpty: true },
      status: "applied",
    });
    expect(reduceResource(countSpec, initial, {}, { amount: 3, kind: "spend" })).toEqual({
      reason: "overdraw",
      status: "rejected",
    });
    expect(reduceResource(countSpec, initial, {}, { amount: 2, kind: "gain" })).toEqual({
      reason: "overfill",
      status: "rejected",
    });
    expect(
      reduceResource(countSpec, initial, {}, { kind: "set-count", value: 3 })
    ).toMatchObject({ after: { current: 3 }, status: "applied" });
  });

  it("keeps disabled state deterministic and capacity overrides reversible", () => {
    const cell = {
      capacity: { base: { kind: "derived", value: 3 }, override: null },
      current: 2,
      disabled: false,
      kind: "count",
    } as const;
    const disabled = reduceResource(
      countSpec,
      cell,
      {},
      {
        disabled: true,
        kind: "set-disabled",
      }
    );
    expect(disabled).toMatchObject({ after: { disabled: true }, status: "applied" });
    if (disabled.status !== "applied") throw new Error("expected applied transition");
    expect(
      reduceResource(countSpec, disabled.after, {}, { amount: 1, kind: "spend" })
    ).toEqual({ reason: "disabled", status: "rejected" });
    const overridden = reduceResource(
      countSpec,
      disabled.after,
      {},
      {
        capacity: 5,
        kind: "override-capacity",
      }
    );
    expect(overridden).toMatchObject({
      after: {
        capacity: { base: { kind: "derived", value: 3 }, override: 5 },
        current: 4,
        disabled: true,
      },
      status: "applied",
    });
    if (overridden.status !== "applied") throw new Error("expected capacity override");
    expect(
      reduceResource(
        countSpec,
        overridden.after,
        {},
        {
          kind: "clear-capacity-override",
        }
      )
    ).toMatchObject({
      after: {
        capacity: { base: { kind: "derived", value: 3 }, override: null },
        current: 2,
        disabled: true,
      },
      status: "applied",
    });
  });

  it("requests and resolves recovery observations through the canonical dice kernel", () => {
    const cell = {
      capacity: { base: { kind: "derived", value: 3 }, override: null },
      current: 0,
      disabled: false,
      kind: "count",
    } as const;
    expect(
      reduceResource(
        countSpec,
        cell,
        {},
        {
          kind: "recover",
          trigger: { kind: "dawn" },
        }
      )
    ).toMatchObject({ after: { current: 2 }, status: "applied" });
    expect(
      reduceResource(
        countSpec,
        { ...cell, current: 2 },
        {},
        {
          kind: "recover",
          trigger: { kind: "long-rest" },
        }
      )
    ).toMatchObject({ after: { current: 3 }, status: "applied" });
    const operation = {
      kind: "recover",
      trigger: { eventId: "feature-reset", kind: "event" },
    } as const;
    expect(reduceResource(countSpec, cell, {}, operation)).toMatchObject({
      boundary: "recovery",
      requirement: { maximumTotal: 4, minimumTotal: 1 },
      status: "needs-observation",
    });
    expect(
      reduceResource(
        countSpec,
        cell,
        {},
        {
          ...operation,
          observation: observationFor(d4, [4]),
        }
      )
    ).toMatchObject({ after: { current: 3 }, status: "applied" });
    expect(
      reduceResource(
        countSpec,
        cell,
        {},
        {
          ...operation,
          observation: observationFor(d4, [5]),
        }
      )
    ).toEqual({ reason: "invalid-observation", status: "rejected" });
    expect(
      reduceResource(
        countSpec,
        cell,
        {},
        {
          kind: "recover",
          observation: observationFor(d4, [2]),
          trigger: { kind: "dawn" },
        }
      )
    ).toEqual({ reason: "unexpected-observation", status: "rejected" });
    expect(
      reduceResource(
        countSpec,
        cell,
        {},
        {
          kind: "recover",
          trigger: { kind: "short-rest" },
        }
      )
    ).toEqual({ reason: "unsupported-boundary", status: "rejected" });
  });

  it("skips needless count recovery rolls at cap and preserves capped roll facts", () => {
    const d6RecoverySpec = {
      ...countSpec,
      recoveries: [
        {
          amount: { formula: d6, kind: "formula" },
          trigger: { kind: "manual" },
        },
      ],
    } as const satisfies ResourceSpec;
    const full = {
      capacity: { base: { kind: "derived", value: 3 }, override: null },
      current: 3,
      disabled: false,
      kind: "count",
    } as const;
    const noRoll = reduceResource(
      d6RecoverySpec,
      full,
      {},
      {
        kind: "recover",
        trigger: { kind: "manual" },
      }
    );
    expect(noRoll).toMatchObject({
      after: { current: 3 },
      before: { current: 3 },
      status: "applied",
    });
    if (noRoll.status !== "applied") throw new Error("expected capped recovery");
    expect(noRoll.facts).toEqual({
      afterRemaining: 3,
      becameEmpty: false,
      beforeRemaining: 3,
      recoveryResolution: null,
      spentResolution: null,
    });

    const capped = reduceResource(
      d6RecoverySpec,
      { ...full, current: 1 },
      {},
      {
        kind: "recover",
        observation: observationFor(d6, [6]),
        trigger: { kind: "manual" },
      }
    );
    expect(capped).toMatchObject({ after: { current: 3 }, status: "applied" });
    if (capped.status !== "applied") throw new Error("expected resolved recovery");
    expect(capped.facts).toEqual({
      afterRemaining: 3,
      becameEmpty: false,
      beforeRemaining: 1,
      recoveryResolution: resolutionFor(d6, [6]),
      spentResolution: null,
    });
  });

  it("automatically resolves deterministic recovery and recorded-value formulas", () => {
    const deterministicRecovery = {
      ...countSpec,
      recoveries: [
        {
          amount: { formula: conditionalFormula, kind: "formula" },
          trigger: { kind: "dawn" },
        },
      ],
    } as const satisfies ResourceSpec;
    expect(
      reduceResource(
        deterministicRecovery,
        {
          capacity: { base: { kind: "derived", value: 3 }, override: null },
          current: 0,
          disabled: false,
          kind: "count",
        },
        { "dice-count": 0 },
        { kind: "recover", trigger: { kind: "dawn" } }
      )
    ).toMatchObject({ after: { current: 2 }, status: "applied" });
    expect(
      reduceResource(
        deterministicRecovery,
        {
          capacity: { base: { kind: "derived", value: 3 }, override: null },
          current: 0,
          disabled: false,
          kind: "count",
        },
        { "dice-count": 0 },
        {
          kind: "recover",
          observation: { aggregates: [], trails: [] },
          trigger: { kind: "dawn" },
        }
      )
    ).toEqual({ reason: "unexpected-observation", status: "rejected" });

    const deterministicRolled = {
      ...rolledSpec,
      formula: conditionalFormula,
    } as const satisfies ResourceSpec;
    expect(
      reduceResource(
        deterministicRolled,
        {
          capacity: { base: { kind: "derived", value: 1 }, override: null },
          disabled: false,
          kind: "rolled",
          values: [null],
        },
        { "dice-count": 0 },
        { index: 0, kind: "record-roll" }
      )
    ).toMatchObject({
      after: {
        values: [
          {
            deterministicTerms: [{ contribution: 2, value: 2 }],
            total: 2,
            trails: [],
          },
          null,
          null,
        ],
      },
      status: "applied",
    });
    expect(
      reduceResource(
        deterministicRolled,
        {
          capacity: { base: { kind: "derived", value: 1 }, override: null },
          disabled: false,
          kind: "rolled",
          values: [null],
        },
        { "dice-count": 0 },
        {
          index: 0,
          kind: "record-roll",
          observation: { aggregates: [], trails: [] },
        }
      )
    ).toEqual({ reason: "unexpected-observation", status: "rejected" });
  });

  it("synchronizes derived capacity by deficit and validates formula provenance", () => {
    const scalable = {
      ...countSpec,
      capacity: {
        amount: { bindingId: "capacity", kind: "binding" },
        kind: "bounded",
      },
    } as const satisfies ResourceSpec;
    expect(
      reduceResource(
        scalable,
        {
          capacity: { base: { kind: "derived", value: 3 }, override: null },
          current: 1,
          disabled: false,
          kind: "count",
        },
        { capacity: 5 },
        { disabled: false, kind: "set-disabled" }
      )
    ).toMatchObject({
      after: {
        capacity: { base: { kind: "derived", value: 5 }, override: null },
        current: 3,
      },
      before: {
        capacity: { base: { kind: "derived", value: 3 }, override: null },
        current: 1,
      },
      facts: { afterRemaining: 3, beforeRemaining: 1 },
      status: "applied",
    });

    const d4CapacitySpec = {
      ...countSpec,
      capacity: { formula: d4, kind: "formula" },
    } as const satisfies ResourceSpec;
    const wrongResolution = resolutionFor(dieFormula(6), [4]);
    expect(
      reduceResource(
        d4CapacitySpec,
        {
          capacity: {
            base: { kind: "formula", resolution: wrongResolution },
            override: null,
          },
          current: 2,
          disabled: false,
          kind: "count",
        },
        {},
        { disabled: false, kind: "set-disabled" }
      )
    ).toEqual({ reason: "invalid-cell", status: "rejected" });

    const scalingSpec = {
      ...countSpec,
      capacity: { formula: scalingCapacityFormula, kind: "formula" },
    } as const satisfies ResourceSpec;
    const originalResolution = resolutionFor(
      scalingCapacityFormula,
      [2],
      { "capacity-bonus": 1 },
      { 0: [{ face: 3, sourceId: "capacity-replacement" }] }
    );
    expect(
      reduceResource(
        scalingSpec,
        {
          capacity: {
            base: { kind: "formula", resolution: originalResolution },
            override: null,
          },
          current: 2,
          disabled: false,
          kind: "count",
        },
        { "capacity-bonus": 2 },
        { disabled: false, kind: "set-disabled" }
      )
    ).toMatchObject({
      after: {
        capacity: {
          base: {
            resolution: {
              deterministicTerms: [{ contribution: 2, value: 2 }],
              total: 5,
              trails: [
                {
                  effectiveFace: 3,
                  initialFace: 2,
                  steps: [
                    {
                      face: 3,
                      kind: "replacement",
                      sourceId: "capacity-replacement",
                    },
                  ],
                },
              ],
            },
          },
        },
        current: 3,
      },
      status: "applied",
    });
  });

  it("records lossless rolled resolutions and returns the full spent fact", () => {
    const cell = {
      capacity: { base: { kind: "derived", value: 3 }, override: null },
      disabled: false,
      kind: "rolled",
      values: [null, null, null],
    } as const;
    expect(
      reduceResource(rolledSpec, cell, {}, { index: 0, kind: "record-roll" })
    ).toMatchObject({
      boundary: "record-roll",
      requirement: { maximumTotal: 20, minimumTotal: 1 },
      status: "needs-observation",
    });

    const observation = observationFor(
      d20,
      [5],
      {},
      {
        0: [
          { face: 8, sourceId: "chronal-shift" },
          { face: 12, sourceId: "table-override" },
        ],
      }
    );
    const recorded = reduceResource(
      rolledSpec,
      cell,
      {},
      {
        index: 0,
        kind: "record-roll",
        observation,
      }
    );
    expect(recorded).toMatchObject({
      after: {
        values: [
          {
            total: 12,
            trails: [
              {
                effectiveFace: 12,
                initialFace: 5,
                steps: [
                  { face: 8, kind: "replacement", sourceId: "chronal-shift" },
                  { face: 12, kind: "replacement", sourceId: "table-override" },
                ],
              },
            ],
          },
          null,
          null,
        ],
      },
      status: "applied",
    });
    if (recorded.status !== "applied") throw new Error("expected recorded roll");
    const spent = reduceResource(
      rolledSpec,
      recorded.after,
      {},
      {
        index: 0,
        kind: "spend-roll",
      }
    );
    expect(spent).toMatchObject({
      after: { values: [null, null] },
      facts: {
        becameEmpty: false,
        spentResolution: {
          total: 12,
          trails: [
            {
              initialFace: 5,
              steps: [
                { face: 8, kind: "replacement", sourceId: "chronal-shift" },
                { face: 12, kind: "replacement", sourceId: "table-override" },
              ],
            },
          ],
        },
      },
      status: "applied",
    });
  });

  it("rejects malformed, out-of-range, repeated, and absent rolled observations", () => {
    const resolution = resolutionFor(d20, [9]);
    const cell = {
      capacity: { base: { kind: "derived", value: 3 }, override: null },
      disabled: false,
      kind: "rolled",
      values: [resolution, null, null],
    } as const;
    expect(
      reduceResource(
        rolledSpec,
        cell,
        {},
        {
          index: 0,
          kind: "record-roll",
          observation: observationFor(d20, [12]),
        }
      )
    ).toEqual({ reason: "already-recorded", status: "rejected" });
    expect(
      reduceResource(rolledSpec, cell, {}, { index: 1, kind: "spend-roll" })
    ).toEqual({ reason: "unrecorded-roll", status: "rejected" });
    expect(
      reduceResource(
        rolledSpec,
        cell,
        {},
        {
          index: 1,
          kind: "record-roll",
          observation: observationFor(d20, [21]),
        }
      )
    ).toEqual({ reason: "invalid-observation", status: "rejected" });
    expect(
      reduceResource(
        rolledSpec,
        cell,
        {},
        {
          index: 1,
          kind: "record-roll",
          observation: {
            aggregates: [],
            trails: [
              {
                initialFace: 4,
                steps: [{ face: 0, kind: "replacement", sourceId: "reroll" }],
                trailId: observationFor(d20, [4]).trails[0]?.trailId,
              },
            ],
          },
        }
      )
    ).toEqual({ reason: "invalid-operation", status: "rejected" });
    expect(
      reduceResource(rolledSpec, cell, {}, { index: 3, kind: "record-roll" })
    ).toEqual({ reason: "out-of-range", status: "rejected" });
  });

  it("resets every roll on full recovery but preserves existing rolls on partial recovery", () => {
    const seven = resolutionFor(d20, [7]);
    const cell = {
      capacity: { base: { kind: "derived", value: 3 }, override: null },
      disabled: false,
      kind: "rolled",
      values: [seven],
    } as const;
    expect(
      reduceResource(
        rolledSpec,
        cell,
        {},
        {
          kind: "recover",
          trigger: { kind: "dawn" },
        }
      )
    ).toMatchObject({
      after: { values: [seven, null, null] },
      status: "applied",
    });
    expect(
      reduceResource(
        rolledSpec,
        cell,
        {},
        {
          kind: "recover",
          trigger: { kind: "long-rest" },
        }
      )
    ).toMatchObject({ after: { values: [null, null, null] }, status: "applied" });

    const overridden = reduceResource(
      rolledSpec,
      cell,
      {},
      {
        capacity: 5,
        kind: "override-capacity",
      }
    );
    expect(overridden).toMatchObject({
      after: {
        capacity: { base: { kind: "derived", value: 3 }, override: 5 },
        values: [seven, null, null],
      },
      status: "applied",
    });
    expect(
      reduceResource(
        rolledSpec,
        { ...cell, values: [seven, resolutionFor(d20, [8]), resolutionFor(d20, [9])] },
        {},
        { capacity: 2, kind: "override-capacity" }
      )
    ).toMatchObject({ after: { values: [seven, resolutionFor(d20, [8])] } });
  });

  it("fails closed on missing, malformed, wrong-kind, extra-field, and corrupt state", () => {
    expect(reduceResource(countSpec, null, {}, { amount: 1, kind: "spend" })).toEqual({
      reason: "missing",
      status: "rejected",
    });
    expect(
      reduceResource(countSpec, { kind: "count" }, {}, { amount: 1, kind: "spend" })
    ).toEqual({ reason: "invalid-cell", status: "rejected" });
    expect(
      reduceResource(
        countSpec,
        {
          capacity: { base: { kind: "derived", value: 3 }, override: null },
          disabled: false,
          kind: "rolled",
          values: [null],
        },
        {},
        { amount: 1, kind: "spend" }
      )
    ).toEqual({ reason: "wrong-kind", status: "rejected" });
    expect(
      reduceResource(
        countSpec,
        {
          capacity: { base: { kind: "derived", value: 3 }, override: null },
          current: 2,
          disabled: false,
          kind: "count",
        },
        {},
        { amount: 1, kind: "spend", unexpected: true }
      )
    ).toEqual({ reason: "invalid-operation", status: "rejected" });
    expect(
      reduceResource(
        rolledSpec,
        {
          capacity: { base: { kind: "derived", value: 3 }, override: null },
          disabled: false,
          kind: "rolled",
          values: [resolutionFor(dieFormula(6), [5])],
        },
        {},
        { disabled: false, kind: "set-disabled" }
      )
    ).toEqual({ reason: "invalid-cell", status: "rejected" });
  });

  it("never reads randomness or time", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("engine attempted to roll");
    });
    const now = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("engine attempted to timestamp");
    });
    expect(initializeResource(rolledSpec, {}).status).toBe("initialized");
    expect(
      reduceResource(
        rolledSpec,
        {
          capacity: { base: { kind: "derived", value: 3 }, override: null },
          disabled: false,
          kind: "rolled",
          values: [null],
        },
        {},
        {
          index: 0,
          kind: "record-roll",
          observation: observationFor(d20, [7]),
        }
      ).status
    ).toBe("applied");
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    random.mockRestore();
    now.mockRestore();
  });
});

describe("resource cell persistence", () => {
  it("canonicalizes and deeply freezes exact lossless cells", () => {
    const resolution = resolutionFor(
      d20,
      [3],
      {},
      {
        0: [{ face: 18, sourceId: "portent-replacement" }],
      }
    );
    const input = {
      capacity: {
        base: { kind: "formula", resolution: resolutionFor(d4, [3]) },
        override: null,
      },
      disabled: true,
      kind: "rolled",
      values: [resolution, null],
    } as const;
    const rolled = conformResourceCell(input);
    const zero = conformResourceCell({
      capacity: { base: { kind: "unbounded" }, override: null },
      current: 0,
      disabled: false,
      kind: "count",
    });

    expect(rolled).toEqual(input);
    expect(rolled).not.toBe(input);
    expect(Object.isFrozen(rolled)).toBe(true);
    expect(rolled?.kind === "rolled" && Object.isFrozen(rolled.values)).toBe(true);
    expect(rolled?.kind === "rolled" && Object.isFrozen(rolled.values[0]?.trails)).toBe(
      true
    );
    expect(zero).not.toBeNull();
  });

  it("rejects hostile object graphs without invoking accessors", () => {
    const getter = vi.fn(() => 1);
    const accessor = {
      capacity: { base: { kind: "derived", value: 1 }, override: null },
      disabled: false,
      kind: "count",
    } as Record<string, unknown>;
    Object.defineProperty(accessor, "current", {
      enumerable: true,
      get: getter,
    });
    const cyclic: Record<string, unknown> = {
      capacity: { base: { kind: "derived", value: 1 }, override: null },
      current: 1,
      disabled: false,
      kind: "count",
    };
    cyclic.cycle = cyclic;

    expect(conformResourceCell(accessor)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
    expect(conformResourceCell(cyclic)).toBeNull();
    expect(conformResourceCell(Object.create(null))).toBeNull();
  });

  it.each([
    null,
    {
      capacity: { base: { kind: "derived", value: 1 }, override: null },
      current: 1,
      kind: "count",
    },
    {
      capacity: { base: { kind: "derived", value: 1 }, override: null },
      current: 2,
      disabled: false,
      kind: "count",
    },
    {
      capacity: {
        base: { kind: "derived", unexpected: true, value: 1 },
        override: null,
      },
      current: 1,
      disabled: false,
      kind: "count",
    },
    {
      capacity: { base: { kind: "derived", value: 2 }, override: null },
      disabled: false,
      kind: "rolled",
      values: [{ total: 12 }, null],
    },
    {
      capacity: { base: { kind: "derived", value: 2_049 }, override: null },
      disabled: false,
      kind: "rolled",
      values: [],
    },
    {
      capacity: { base: { kind: "derived", value: 1 }, override: 2_049 },
      disabled: false,
      kind: "rolled",
      values: [],
    },
    {
      capacity: { base: { kind: "derived", value: 1 }, override: null },
      disabled: false,
      kind: "rolled",
      values: [resolutionFor(d20, [12]), null],
    },
    {
      capacity: { base: { kind: "derived", value: 1 }, override: null },
      disabled: false,
      kind: "rolled",
      values: [
        {
          ...resolutionFor(d20, [12]),
          total: 13,
        },
      ],
    },
  ])("rejects malformed, forged, or over-capacity cell %#", (value) => {
    expect(conformResourceCell(value)).toBeNull();
  });
});
