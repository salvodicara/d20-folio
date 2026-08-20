import { describe, expect, it } from "vitest";

import {
  conformProgramStepOccurrenceOrigin,
  parseOccurrenceState,
  selectProgramPhaseChildren,
  selectProgramStepChildren,
} from "@/lib/mechanic-occurrences";
import type { ProgramStepOccurrenceOrigin } from "@/types/mechanic-occurrence";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type { MechanicsStep } from "@/types/mechanics-program-authoring";

const MATERIAL = {
  characterId: "character-1",
  kind: "character-play",
  uid: "user-1",
} as const;
const TARGET = { entityId: "self", material: MATERIAL } as const;
const ROOT = {
  occurrence: { material: MATERIAL, occurrenceId: "root" },
  ordinal: 1,
} as const;
const TARGET_SELECTOR = { kind: "role", role: "target" } as const;
const MANUAL_LIFETIME = { kind: "manual" } as const;
const FIXED_ONE = { kind: "fixed", value: 1 } as const;

const CONDITION_STEP = {
  conditionId: "prone",
  kind: "condition",
  lifetime: MANUAL_LIFETIME,
  operation: "apply",
  stepId: "condition",
  target: TARGET_SELECTOR,
  when: null,
} as const satisfies MechanicsStep;
const STANDING_STEP = {
  fact: { key: "ward", kind: "active-key" },
  kind: "standing",
  lifetime: MANUAL_LIFETIME,
  operation: "start",
  stepId: "standing",
  target: TARGET_SELECTOR,
  when: null,
} as const satisfies MechanicsStep;
const TEMPORARY_HIT_POINTS_STEP = {
  amount: { expression: FIXED_ONE, kind: "integer" },
  decision: "replace",
  kind: "temporary-hit-points",
  lifetime: MANUAL_LIFETIME,
  stepId: "temporary-hit-points",
  target: TARGET_SELECTOR,
  when: null,
} as const satisfies MechanicsStep;
const CONCENTRATION_STEP = {
  kind: "concentration",
  lifetime: MANUAL_LIFETIME,
  operation: "start",
  stepId: "concentration",
  when: null,
} as const satisfies MechanicsStep;
const POLYMORPH_STEP = {
  formId: "wolf",
  kind: "polymorph",
  lifetime: MANUAL_LIFETIME,
  operation: "start",
  stepId: "polymorph",
  target: TARGET_SELECTOR,
  when: null,
} as const satisfies MechanicsStep;
const ENTITY_CREATE_STEP = {
  controller: null,
  entityKey: "summon",
  kind: "entity-create",
  lifetime: MANUAL_LIFETIME,
  stepId: "entity-create",
  template: { kind: "monster", monsterId: "wolf" },
  when: null,
} as const satisfies MechanicsStep;
const INVENTORY_CREATE_STEP = {
  instanceKey: "created-item",
  itemId: "item.potion",
  kind: "inventory-create",
  lifetime: MANUAL_LIFETIME,
  owner: "owner",
  quantity: FIXED_ONE,
  stepId: "inventory-create",
  when: null,
} as const satisfies MechanicsStep;

function authority(steps: readonly MechanicsStep[]): MechanicsProgramAuthorityReceipt {
  const capability = {
    capabilityId: "origin-program",
    definition: {
      catalogueKind: "spell",
      entityId: "spell.origin-program",
      kind: "catalogue",
      mechanicsRevision: `sha256:${"0".repeat(64)}`,
    },
    kind: "program",
  } as const;
  const program = {
    id: capability.capabilityId,
    phases: [
      {
        inputs: [],
        phaseId: "invoke",
        steps,
        trigger: { kind: "invocation" },
      },
    ],
    registers: [],
    version: 1,
  } as const;
  return {
    anchors: {
      activator: TARGET,
      caster: TARGET,
      owner: TARGET,
      source: TARGET,
      target: TARGET,
    },
    installation: {
      capability,
      generation: 1,
      installationId: "origin-installation",
      owner: TARGET,
    },
    schema: 1,
    snapshot: {
      grantGroups: {},
      program,
      ref: capability,
      resources: {},
      schema: 1,
    },
    source: { capability, kind: "capability", owner: TARGET },
    staticBindings: {},
  };
}

function origin(stepId: string, execution = 1, slot = 1): ProgramStepOccurrenceOrigin {
  return {
    execution,
    kind: "program-step",
    phaseId: "invoke",
    root: ROOT,
    slot,
    stepId,
  };
}

function effect(
  step: MechanicsStep,
  occurrenceKind?: string,
  effectOrigin = origin(step.stepId)
): Readonly<Record<string, unknown>> {
  const common = {
    endRules: [],
    ending: null,
    ordinal: 2,
    origin: effectOrigin,
    parentId: "root",
    target: TARGET,
  } as const;
  switch (occurrenceKind ?? step.kind) {
    case "condition":
      return { ...common, conditionId: "prone", kind: "condition" };
    case "standing":
    case "temporary-hit-points":
      return {
        ...common,
        fact: { key: "origin", kind: "active-key" },
        kind: "standing",
      };
    case "concentration":
      return { ...common, kind: "concentration" };
    case "polymorph":
    case "polymorph-form":
      return { ...common, formId: "wolf", kind: "polymorph-form" };
    case "entity-create":
    case "inventory-create":
    case "material-lifecycle":
      return { ...common, kind: "material-lifecycle" };
    default:
      throw new TypeError("step does not create an occurrence");
  }
}

function state(
  steps: readonly MechanicsStep[],
  effects: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
  execution = 1
) {
  return {
    nextOccurrenceOrdinal: Object.keys(effects).length + 2,
    occurrences: {
      root: {
        authority: authority(steps),
        endRules: [],
        ending: null,
        kind: "program",
        ordinal: 1,
        phaseState: {
          invoke: { execution, lastTriggerEventId: execution === 0 ? null : "event" },
        },
        registers: {},
      },
      ...Object.fromEntries(
        Object.entries(effects).map(([id, candidate], index) => [
          id,
          { ...candidate, ordinal: index + 2 },
        ])
      ),
    },
  };
}

describe("program-step occurrence origin", () => {
  it("conforms one exact hostile shape without attempting state semantics", () => {
    const candidate = origin("condition");
    const conformed = conformProgramStepOccurrenceOrigin(candidate);
    expect(conformed).toEqual(candidate);
    expect(conformed).not.toBe(candidate);
    expect(Object.isFrozen(conformed?.root)).toBe(true);

    expect(
      conformProgramStepOccurrenceOrigin({ ...candidate, unexpected: true })
    ).toBeNull();
    expect(conformProgramStepOccurrenceOrigin({ ...candidate, slot: 0 })).toBeNull();

    let accessed = false;
    const hostile = { ...candidate } as Record<string, unknown>;
    Object.defineProperty(hostile, "slot", {
      enumerable: true,
      get: () => {
        accessed = true;
        return 1;
      },
    });
    expect(conformProgramStepOccurrenceOrigin(hostile)).toBeNull();
    expect(accessed).toBe(false);
  });

  it.each([
    [CONDITION_STEP, "condition"],
    [STANDING_STEP, "standing"],
    [TEMPORARY_HIT_POINTS_STEP, "standing"],
    [CONCENTRATION_STEP, "concentration"],
    [POLYMORPH_STEP, "polymorph-form"],
    [ENTITY_CREATE_STEP, "material-lifecycle"],
    [INVENTORY_CREATE_STEP, "material-lifecycle"],
  ] as const)("accepts %s provenance for %s", (step, occurrenceKind) => {
    const parsed = parseOccurrenceState(
      state([step], { child: effect(step, occurrenceKind) })
    );
    expect(parsed.ok).toBe(true);
  });

  it.each([
    [{ ...CONDITION_STEP, lifetime: null, operation: "remove" } as const, "condition"],
    [{ ...STANDING_STEP, lifetime: null, operation: "end" } as const, "standing"],
    [
      { ...CONCENTRATION_STEP, lifetime: null, operation: "end" } as const,
      "concentration",
    ],
    [{ ...POLYMORPH_STEP, lifetime: null, operation: "end" } as const, "polymorph-form"],
  ] as const)("rejects non-producing %s provenance for %s", (step, occurrenceKind) => {
    const parsed = parseOccurrenceState(
      state([step], { child: effect(step, occurrenceKind) })
    );
    expect(parsed.ok).toBe(false);
  });

  it("rejects forged roots, unknown or incompatible steps, and future executions", () => {
    const validOrigin = origin("condition");
    const valid = effect(CONDITION_STEP, "condition", validOrigin);
    const candidates = [
      { ...valid, parentId: "other" },
      { ...valid, origin: { ...validOrigin, root: { ...ROOT, ordinal: 2 } } },
      { ...valid, origin: { ...validOrigin, phaseId: "missing" } },
      { ...valid, origin: { ...validOrigin, stepId: "missing" } },
      effect(CONDITION_STEP, "standing"),
      effect(CONDITION_STEP, "condition", origin("condition", 3)),
    ];
    for (const candidate of candidates) {
      expect(parseOccurrenceState(state([CONDITION_STEP], { child: candidate })).ok).toBe(
        false
      );
    }
  });

  it("accepts past and next-execution effects but rejects a duplicate origin tuple", () => {
    const oldEffect = effect(CONDITION_STEP, "condition", origin("condition", 1, 1));
    const nextEffect = effect(CONDITION_STEP, "condition", origin("condition", 3, 1));
    expect(
      parseOccurrenceState(
        state([CONDITION_STEP], { next: nextEffect, old: oldEffect }, 2)
      ).ok
    ).toBe(true);
    expect(
      parseOccurrenceState(
        state([CONDITION_STEP], { duplicate: oldEffect, old: oldEffect }, 2)
      ).ok
    ).toBe(false);
  });

  it("selects phase and step children from origin rather than lifetime rules", () => {
    const parsed = parseOccurrenceState(
      state(
        [CONDITION_STEP, STANDING_STEP],
        {
          condition: effect(CONDITION_STEP),
          standing: effect(STANDING_STEP),
        },
        1
      )
    );
    if (!parsed.ok) throw new Error("fixture must conform");

    expect(
      selectProgramPhaseChildren(parsed.value, "root", "invoke", 1).map(({ id }) => id)
    ).toEqual(["condition", "standing"]);
    expect(
      selectProgramStepChildren(parsed.value, "root", "invoke", 1, "standing").map(
        ({ id }) => id
      )
    ).toEqual(["standing"]);
  });
});
