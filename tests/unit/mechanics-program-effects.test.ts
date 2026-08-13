import { describe, expect, it } from "vitest";

import { materialRefKey } from "@/lib/action-journal";
import {
  mechanicsProgramEffectOccurrenceId,
  mechanicsProgramExpansionSlot,
  materializeMechanicsStandingFacts,
  resolveMechanicsLifetime,
  resolveMechanicsMaterialClocks,
  selectActiveMechanicsEffects,
  selectActiveProgramStepChildren,
  type MechanicsLifetimeResolutionContext,
} from "@/lib/mechanics-program-effects";
import {
  createEmptyCharacterMaterialState,
  createEmptySharedMaterialState,
} from "@/lib/material-state";
import { parseMechanicsWorld } from "@/lib/mechanics-world";
import {
  createBetweenTurnsEconomyState,
  createTurnEconomyState,
} from "@/lib/turn-economy";
import type { EffectOccurrence } from "@/types/mechanic-occurrence";
import type { EntityRef, OccurrenceGenerationRef } from "@/types/mechanics-reference";
import type { EncounterState } from "@/types/material-state";
import type { MechanicsWorld } from "@/types/mechanics-world";

const CHARACTER = {
  characterId: "hero",
  kind: "character-play",
  uid: "user",
} as const;
const SHARED = { campaignId: "campaign", kind: "shared-combat" } as const;
const SELF = { entityId: "self", material: CHARACTER } as const satisfies EntityRef;
const ENEMY = {
  entityId: "enemy",
  material: CHARACTER,
  ordinal: 1,
} as const satisfies EntityRef;
const SHARED_ENEMY = {
  entityId: "shared-enemy",
  material: SHARED,
  ordinal: 1,
} as const satisfies EntityRef;
const ROOT = {
  occurrence: { material: CHARACTER, occurrenceId: "root" },
  ordinal: 1,
} as const satisfies OccurrenceGenerationRef;
const OTHER_ROOT = {
  occurrence: { material: CHARACTER, occurrenceId: "other-root" },
  ordinal: 4,
} as const satisfies OccurrenceGenerationRef;
const REPLACED_ROOT = {
  occurrence: { material: CHARACTER, occurrenceId: "root" },
  ordinal: 99,
} as const satisfies OccurrenceGenerationRef;

function economy(turnId: string, ownTurn: boolean) {
  const state = ownTurn
    ? createTurnEconomyState(turnId)
    : createBetweenTurnsEconomyState(turnId);
  if (!state) throw new Error("turn-economy fixture");
  return state;
}

function encounter(
  round = 4,
  currentCombatantId: "enemy" | "hero" = "hero"
): EncounterState {
  return {
    currentCombatantId,
    epoch: 5,
    nextCombatantOrdinal: 3,
    order: ["hero", "enemy"],
    participants: {
      enemy: {
        combatant: ENEMY,
        economy: economy("enemy-turn", currentCombatantId === "enemy"),
        initiativeRoll: 10,
        ordinal: 2,
        skipped: false,
      },
      hero: {
        combatant: SELF,
        economy: economy("hero-turn", currentCombatantId === "hero"),
        initiativeRoll: 15,
        ordinal: 1,
        skipped: false,
      },
    },
    phase: "turns",
    round,
  };
}

function localEncounterWorld(
  elapsedSeconds = 100,
  round = 4,
  currentCombatantId: "enemy" | "hero" = "hero"
): Readonly<MechanicsWorld> {
  const base = createEmptyCharacterMaterialState(1, CHARACTER, {
    hitPoints: {
      current: 20,
      temporary: { current: 0, sourceOccurrence: null },
    },
    zeroHitPoints: null,
  });
  return {
    documents: [
      {
        kind: "character",
        material: CHARACTER,
        state: {
          ...structuredClone(base),
          clockBinding: {
            encounter: { epoch: 5, material: CHARACTER },
            timeline: { epoch: 4, material: CHARACTER },
          },
          encounter: encounter(round, currentCombatantId),
          nextEncounterEpoch: 6,
          timeline: { elapsedSeconds, epoch: 4, nextBoundaryOrdinal: 1 },
        },
      },
    ],
    scope: CHARACTER,
  };
}

function lifetimeContext(
  world = localEncounterWorld(),
  combatant: Readonly<EntityRef> | null = ENEMY,
  currentTurnPhase: MechanicsLifetimeResolutionContext["currentTurnPhase"] = "active"
): MechanicsLifetimeResolutionContext {
  return {
    bindings: {},
    combatant,
    currentPhaseId: "resolve",
    currentTurnPhase,
    execution: 3,
    phaseExecutions: { pulse: 0, resolve: 3 },
    root: ROOT,
    world,
  };
}

function condition(
  ordinal: number,
  options: {
    readonly conditionId?: "poisoned" | "prone";
    readonly ending?: boolean;
    readonly execution?: number;
    readonly root?: Readonly<OccurrenceGenerationRef>;
    readonly stepId?: string;
    readonly target?: Readonly<EntityRef>;
  } = {}
): Extract<EffectOccurrence, { kind: "condition" }> {
  const root = options.root ?? ROOT;
  return {
    conditionId: options.conditionId ?? "poisoned",
    endRules: [],
    ending: options.ending ? { causes: [{ kind: "requested" }] } : null,
    kind: "condition",
    ordinal,
    origin: {
      execution: options.execution ?? 1,
      kind: "program-step",
      phaseId: "resolve",
      root,
      slot: ordinal,
      stepId: options.stepId ?? "apply-condition",
    },
    parentId: root.occurrence.occurrenceId,
    target: options.target ?? SELF,
  };
}

function effectWorld(): Readonly<MechanicsWorld> {
  const character = {
    ...structuredClone(
      createEmptyCharacterMaterialState(1, CHARACTER, {
        hitPoints: {
          current: 20,
          temporary: { current: 0, sourceOccurrence: null },
        },
        zeroHitPoints: null,
      })
    ),
    nextOccurrenceOrdinal: 12,
    occurrences: {
      concentration: {
        endRules: [],
        ending: null,
        kind: "concentration",
        ordinal: 7,
        origin: {
          execution: 1,
          kind: "program-step",
          phaseId: "resolve",
          root: ROOT,
          slot: 7,
          stepId: "concentrate",
        },
        parentId: "root",
        target: SELF,
      },
      early: condition(5),
      ending: condition(1, { ending: true }),
      late: condition(2, { execution: 2 }),
      lifecycle: {
        endRules: [],
        ending: null,
        kind: "material-lifecycle",
        ordinal: 9,
        origin: {
          execution: 2,
          kind: "program-step",
          phaseId: "resolve",
          root: ROOT,
          slot: 1,
          stepId: "create-entity",
        },
        parentId: "root",
        target: SELF,
      },
      other: condition(3, { root: OTHER_ROOT }),
      polymorph: {
        endRules: [],
        ending: null,
        formId: "wolf",
        kind: "polymorph-form",
        ordinal: 8,
        origin: {
          execution: 1,
          kind: "program-step",
          phaseId: "resolve",
          root: ROOT,
          slot: 8,
          stepId: "polymorph",
        },
        parentId: "root",
        target: SELF,
      },
      standing: {
        endRules: [],
        ending: null,
        fact: { key: "ward", kind: "active-key" },
        kind: "standing",
        ordinal: 6,
        origin: {
          execution: 1,
          kind: "program-step",
          phaseId: "resolve",
          root: ROOT,
          slot: 6,
          stepId: "stand",
        },
        parentId: "root",
        target: SELF,
      },
      staleGeneration: condition(10, { root: REPLACED_ROOT }),
    },
  };
  const shared = {
    ...structuredClone(createEmptySharedMaterialState()),
    nextOccurrenceOrdinal: 2,
    occurrences: {
      shared: condition(1, {
        root: {
          occurrence: { material: SHARED, occurrenceId: "shared-root" },
          ordinal: 1,
        },
        target: SHARED_ENEMY,
      }),
    },
  };
  return {
    documents: [
      { kind: "shared", material: SHARED, state: shared },
      { kind: "character", material: CHARACTER, state: character },
    ],
    scope: CHARACTER,
  };
}

describe("mechanics program effect identities", () => {
  it("derives stable one-based slots and occurrence ids from exact provenance", () => {
    expect(mechanicsProgramExpansionSlot(0)).toBe(1);
    expect(mechanicsProgramExpansionSlot(4)).toBe(5);
    expect(mechanicsProgramExpansionSlot(-1)).toBeNull();
    expect(mechanicsProgramExpansionSlot(Number.MAX_SAFE_INTEGER)).toBeNull();

    const identity = {
      execution: 2,
      phaseId: "resolve",
      root: ROOT,
      slot: 3,
      stepId: "apply-condition",
    } as const;
    const id = mechanicsProgramEffectOccurrenceId(identity);
    expect(id).toMatch(/^effect:sha256:[0-9a-f]{64}$/);
    expect(mechanicsProgramEffectOccurrenceId(identity)).toBe(id);
    expect(mechanicsProgramEffectOccurrenceId({ ...identity, slot: 4 })).not.toBe(id);
    expect(mechanicsProgramEffectOccurrenceId({ ...identity, execution: 0 })).toBeNull();
  });
});

describe("mechanics material clocks and lifetimes", () => {
  it("resolves character leases and shared materials from the same physical clocks", () => {
    const character = {
      ...structuredClone(
        createEmptyCharacterMaterialState(1, CHARACTER, {
          hitPoints: {
            current: 20,
            temporary: { current: 0, sourceOccurrence: null },
          },
          zeroHitPoints: null,
        })
      ),
      clockBinding: {
        encounter: { epoch: 9, material: SHARED },
        timeline: { epoch: 7, material: SHARED },
      },
    };
    const shared = {
      ...structuredClone(createEmptySharedMaterialState()),
      encounter: {
        currentCombatantId: "hero",
        epoch: 9,
        nextCombatantOrdinal: 2,
        order: ["hero"],
        participants: {
          hero: {
            combatant: SELF,
            economy: economy("shared-hero-turn", true),
            initiativeRoll: 15,
            ordinal: 1,
            skipped: false,
          },
        },
        phase: "turns" as const,
        round: 4,
      },
      nextEncounterEpoch: 10,
      timeline: { elapsedSeconds: 200, epoch: 7, nextBoundaryOrdinal: 1 },
    };
    const parsed = parseMechanicsWorld({
      documents: [
        { kind: "shared", material: SHARED, state: shared },
        { kind: "character", material: CHARACTER, state: character },
      ].sort((left, right) => {
        const leftKey = materialRefKey(left.material);
        const rightKey = materialRefKey(right.material);
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      }),
      scope: CHARACTER,
    });
    if (!parsed.ok) throw new Error(`clock fixture: ${parsed.reason}`);
    const world = parsed.value;

    expect(resolveMechanicsMaterialClocks(world, CHARACTER)).toEqual(
      resolveMechanicsMaterialClocks(world, SHARED)
    );
    expect(resolveMechanicsMaterialClocks(world, CHARACTER)).toMatchObject({
      encounter: { clock: { epoch: 9, material: SHARED } },
      timeline: {
        clock: { epoch: 7, material: SHARED },
        state: { elapsedSeconds: 200, epoch: 7, nextBoundaryOrdinal: 1 },
      },
    });
    expect(
      resolveMechanicsMaterialClocks(
        {
          ...world,
          documents: world.documents.map((document) =>
            document.kind === "character"
              ? {
                  ...document,
                  state: {
                    ...document.state,
                    clockBinding: {
                      ...document.state.clockBinding,
                      timeline: { epoch: 8, material: SHARED },
                    },
                  },
                }
              : document
          ),
        },
        CHARACTER
      )
    ).toBeNull();
  });

  it("freezes every authored lifetime to exact end rules", () => {
    const context = lifetimeContext();
    expect(resolveMechanicsLifetime({ kind: "manual" }, context)).toEqual([]);
    expect(resolveMechanicsLifetime({ kind: "source-end" }, context)).toEqual([
      { kind: "occurrence-end", occurrenceId: "root" },
    ]);
    expect(
      resolveMechanicsLifetime({ kind: "program-phase-end", phaseId: "pulse" }, context)
    ).toEqual([
      {
        execution: 1,
        kind: "program-phase-end",
        occurrenceId: "root",
        phaseId: "pulse",
      },
    ]);
    expect(
      resolveMechanicsLifetime({ kind: "program-phase-end", phaseId: "resolve" }, context)
    ).toEqual([
      {
        execution: 3,
        kind: "program-phase-end",
        occurrenceId: "root",
        phaseId: "resolve",
      },
    ]);
    expect(resolveMechanicsLifetime({ kind: "combat-end" }, context)).toEqual([
      { clock: { epoch: 5, material: CHARACTER }, kind: "combat-end" },
    ]);
    expect(
      resolveMechanicsLifetime(
        { kind: "duration", seconds: { kind: "fixed", value: 6 } },
        context
      )
    ).toEqual([
      {
        clock: { epoch: 4, material: CHARACTER },
        elapsedSeconds: 106,
        kind: "time-reached",
      },
    ]);
    expect(
      resolveMechanicsLifetime(
        {
          combatant: "target",
          kind: "turn-boundary",
          offsetTurns: { kind: "fixed", value: 1 },
          phase: "start",
        },
        context
      )
    ).toEqual([
      {
        clock: { epoch: 5, material: CHARACTER },
        combatant: ENEMY,
        kind: "turn-boundary",
        phase: "start",
        round: 4,
      },
    ]);
    expect(
      resolveMechanicsLifetime(
        { combatant: "target", kind: "rest-completed", rest: "long" },
        context
      )
    ).toEqual([
      {
        clock: { epoch: 4, material: CHARACTER },
        combatant: ENEMY,
        kind: "rest-completed",
        minimumBoundaryOrdinal: 1,
        rest: "long",
      },
    ]);
    expect(
      resolveMechanicsLifetime({ kind: "day-phase", phase: "dawn" }, context)
    ).toEqual([
      {
        clock: { epoch: 4, material: CHARACTER },
        kind: "day-phase",
        minimumBoundaryOrdinal: 1,
        phase: "dawn",
      },
    ]);
    expect(
      resolveMechanicsLifetime({ kind: "temporary-hit-points-empty" }, context)
    ).toEqual([{ kind: "temporary-hp-empty" }]);
  });

  it("counts future turns from exact order and fails closed on past or overflowed time", () => {
    const selfContext = lifetimeContext(localEncounterWorld(), SELF);
    expect(
      resolveMechanicsLifetime(
        {
          combatant: "owner",
          kind: "turn-boundary",
          offsetTurns: { kind: "fixed", value: 1 },
          phase: "end",
        },
        selfContext
      )
    ).toMatchObject([{ kind: "turn-boundary", round: 4 }]);
    expect(
      resolveMechanicsLifetime(
        {
          combatant: "owner",
          kind: "turn-boundary",
          offsetTurns: { kind: "fixed", value: 1 },
          phase: "start",
        },
        selfContext
      )
    ).toMatchObject([{ kind: "turn-boundary", round: 5 }]);
    expect(
      resolveMechanicsLifetime(
        {
          combatant: "owner",
          kind: "turn-boundary",
          offsetTurns: { kind: "fixed", value: 1 },
          phase: "end",
        },
        lifetimeContext(localEncounterWorld(), SELF, "start")
      )
    ).toMatchObject([{ kind: "turn-boundary", round: 4 }]);
    expect(
      resolveMechanicsLifetime(
        {
          combatant: "owner",
          kind: "turn-boundary",
          offsetTurns: { kind: "fixed", value: 1 },
          phase: "end",
        },
        lifetimeContext(localEncounterWorld(), SELF, "end")
      )
    ).toMatchObject([{ kind: "turn-boundary", round: 5 }]);
    expect(
      resolveMechanicsLifetime(
        {
          combatant: "owner",
          kind: "turn-boundary",
          offsetTurns: { kind: "fixed", value: 1 },
          phase: "end",
        },
        lifetimeContext(localEncounterWorld(100, 4, "enemy"), SELF)
      )
    ).toMatchObject([{ kind: "turn-boundary", round: 5 }]);
    expect(
      resolveMechanicsLifetime(
        {
          combatant: "target",
          kind: "turn-boundary",
          offsetTurns: { kind: "fixed", value: 0 },
          phase: "start",
        },
        lifetimeContext()
      )
    ).toBeNull();
    expect(
      resolveMechanicsLifetime(
        { kind: "duration", seconds: { kind: "fixed", value: 0 } },
        lifetimeContext()
      )
    ).toBeNull();
    expect(
      resolveMechanicsLifetime(
        { kind: "duration", seconds: { kind: "fixed", value: 1 } },
        lifetimeContext(localEncounterWorld(Number.MAX_SAFE_INTEGER))
      )
    ).toBeNull();
    expect(
      resolveMechanicsLifetime(
        {
          combatant: "owner",
          kind: "turn-boundary",
          offsetTurns: { kind: "fixed", value: 1 },
          phase: "start",
        },
        lifetimeContext(localEncounterWorld(100, Number.MAX_SAFE_INTEGER), SELF)
      )
    ).toBeNull();
  });
});

describe("standing fact materialization", () => {
  it("broadcasts or zips marks and rejects every ambiguous cardinality", () => {
    expect(
      materializeMechanicsStandingFacts(
        {
          kind: "target-mark",
          markId: "quarry",
          marked: { kind: "role", role: "target" },
        },
        [SELF, ENEMY],
        [SHARED_ENEMY]
      )
    ).toEqual([
      {
        fact: { kind: "target-mark", markId: "quarry", marked: SHARED_ENEMY },
        target: SELF,
      },
      {
        fact: { kind: "target-mark", markId: "quarry", marked: SHARED_ENEMY },
        target: ENEMY,
      },
    ]);
    expect(
      materializeMechanicsStandingFacts(
        {
          kind: "target-mark",
          markId: "quarry",
          marked: { kind: "role", role: "target" },
        },
        [SELF, ENEMY],
        [ENEMY, SHARED_ENEMY]
      )
    ).toEqual([
      {
        fact: { kind: "target-mark", markId: "quarry", marked: ENEMY },
        target: SELF,
      },
      {
        fact: { kind: "target-mark", markId: "quarry", marked: SHARED_ENEMY },
        target: ENEMY,
      },
    ]);
    expect(
      materializeMechanicsStandingFacts(
        {
          kind: "target-mark",
          markId: "quarry",
          marked: { kind: "role", role: "target" },
        },
        [SELF, ENEMY],
        [SELF, ENEMY, SHARED_ENEMY]
      )
    ).toBeNull();
    expect(
      materializeMechanicsStandingFacts({ key: "ward", kind: "active-key" }, [
        SELF,
        ENEMY,
      ])
    ).toEqual([
      { fact: { key: "ward", kind: "active-key" }, target: SELF },
      { fact: { key: "ward", kind: "active-key" }, target: ENEMY },
    ]);
    expect(
      materializeMechanicsStandingFacts(
        { key: "ward", kind: "active-key" },
        [SELF],
        [ENEMY]
      )
    ).toBeNull();
  });
});

describe("active effect selectors", () => {
  it("selects exact active kinds and root generations with canonical order", () => {
    const world = effectWorld();
    expect(
      selectActiveMechanicsEffects(world, {
        conditionId: "poisoned",
        kind: "condition",
        root: ROOT,
        target: SELF,
      })
    ).toEqual([
      { occurrence: { material: CHARACTER, occurrenceId: "late" }, ordinal: 2 },
      { occurrence: { material: CHARACTER, occurrenceId: "early" }, ordinal: 5 },
    ]);
    expect(
      selectActiveMechanicsEffects(world, {
        fact: { key: "ward", kind: "active-key" },
        kind: "standing",
      })
    ).toEqual([
      { occurrence: { material: CHARACTER, occurrenceId: "standing" }, ordinal: 6 },
    ]);
    expect(selectActiveMechanicsEffects(world, { kind: "concentration" })).toEqual([
      {
        occurrence: { material: CHARACTER, occurrenceId: "concentration" },
        ordinal: 7,
      },
    ]);
    expect(
      selectActiveMechanicsEffects(world, {
        formId: "wolf",
        kind: "polymorph-form",
      })
    ).toEqual([
      {
        occurrence: { material: CHARACTER, occurrenceId: "polymorph" },
        ordinal: 8,
      },
    ]);
    expect(selectActiveProgramStepChildren(world, ROOT, "apply-condition")).toEqual([
      { occurrence: { material: CHARACTER, occurrenceId: "early" }, ordinal: 5 },
      { occurrence: { material: CHARACTER, occurrenceId: "late" }, ordinal: 2 },
    ]);
    expect(selectActiveProgramStepChildren(world, ROOT, "create-entity")).toEqual([
      {
        occurrence: { material: CHARACTER, occurrenceId: "lifecycle" },
        ordinal: 9,
      },
    ]);
  });

  it("orders world-wide matches by material then allocation ordinal", () => {
    const selected = selectActiveMechanicsEffects(effectWorld(), {
      conditionId: "poisoned",
      kind: "condition",
    });
    const expected = [
      { occurrence: { material: CHARACTER, occurrenceId: "late" }, ordinal: 2 },
      { occurrence: { material: CHARACTER, occurrenceId: "other" }, ordinal: 3 },
      { occurrence: { material: CHARACTER, occurrenceId: "early" }, ordinal: 5 },
      {
        occurrence: { material: CHARACTER, occurrenceId: "staleGeneration" },
        ordinal: 10,
      },
      { occurrence: { material: SHARED, occurrenceId: "shared" }, ordinal: 1 },
    ].sort((left, right) => {
      const leftKey = materialRefKey(left.occurrence.material);
      const rightKey = materialRefKey(right.occurrence.material);
      return leftKey < rightKey
        ? -1
        : leftKey > rightKey
          ? 1
          : left.ordinal - right.ordinal;
    });
    expect(selected).toEqual(expected);
  });
});
