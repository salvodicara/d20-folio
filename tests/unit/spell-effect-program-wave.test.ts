import { describe, expect, it } from "vitest";
import { SRD_CANTRIPS } from "@/data/spells/cantrips";
import { SRD_SPELLS_LEVEL1 } from "@/data/spells/level1";
import { SRD_SPELLS_LEVEL2 } from "@/data/spells/level2";
import { SRD_SPELLS_LEVEL4 } from "@/data/spells/level4";
import { SRD_SPELLS_LEVEL5 } from "@/data/spells/level5";
import { SRD_SPELLS_LEVEL7 } from "@/data/spells/level7";
import { SRD_SPELLS_LEVEL9 } from "@/data/spells/level9";
import type { AbilityCode, SrdSpellData } from "@/data/types";
import {
  assertCombatEffectProgram,
  deriveCombatEffectRequirements,
  type CombatEffectExecution,
} from "@/lib/combat-effect-program";
import {
  combatTableEntityRef,
  evaluateEnteredCombatD20Test,
} from "@/lib/combat-test-context";
import type { CombatOutcomeTarget } from "@/types/combat-outcome";
import type { D20TestRequest } from "@/types/d20-test";

const TARGET: CombatOutcomeTarget = { combatantId: "target-1" };
const fixed = (value: number) => ({ kind: "fixed" as const, value });

function emptyRollRules(): D20TestRequest["rollRules"] {
  return {
    advantageSourceIds: [],
    disadvantageSourceIds: [],
    extraD20SourceIds: [],
    faceFloors: [],
    replacements: [],
    substitutions: [],
    totalFloors: [],
  };
}

function enteredD20(context: D20TestRequest, ...faces: readonly number[]) {
  const result = evaluateEnteredCombatD20Test(context, { faces });
  if (!result) throw new Error("test D20 context did not resolve");
  return result;
}

function programFor(
  spells: ReadonlyArray<{ id: string; effectProgram?: unknown }>,
  id: string
) {
  const program = spells.find((spell) => spell.id === id)?.effectProgram;
  if (!program) throw new Error(`missing effect program for ${id}`);
  assertCombatEffectProgram(program);
  return program;
}

function spellFor(spells: ReadonlyArray<SrdSpellData>, id: string): SrdSpellData {
  const spell = spells.find((candidate) => candidate.id === id);
  if (!spell) throw new Error(`missing spell ${id}`);
  return spell;
}

function attackContext(testId: string): D20TestRequest {
  return {
    actor: combatTableEntityRef("source-1"),
    armorClass: fixed(15),
    automaticCriticalSourceIds: [],
    criticalThreshold: fixed(20),
    enteredModifiers: [],
    kind: "attack",
    modifiers: [],
    resolution: { kind: "rolled" },
    rollRules: emptyRollRules(),
    target: combatTableEntityRef(TARGET.combatantId),
    testId,
  };
}

function saveContext(
  testId: string,
  ability: AbilityCode,
  target: CombatOutcomeTarget = TARGET
): D20TestRequest {
  return {
    ability,
    actor: combatTableEntityRef(target.combatantId),
    difficultyClass: fixed(17),
    enteredModifiers: [],
    kind: "saving-throw",
    modifiers: [{ sourceId: `save:${ability.toLowerCase()}`, value: fixed(3) }],
    resolution: { kind: "rolled" },
    rollRules: emptyRollRules(),
    target: null,
    testId,
  };
}

function answeredSaveGates(
  requirements: ReturnType<typeof deriveCombatEffectRequirements>,
  face: number
) {
  return requirements
    .filter((requirement) => requirement.kind === "save")
    .map((requirement) => ({
      key: requirement.key,
      value: enteredD20(requirement.context, face),
    }));
}

function answeredAttackGates(
  requirements: ReturnType<typeof deriveCombatEffectRequirements>
) {
  return requirements
    .filter((requirement) => requirement.kind === "attack")
    .map((requirement) => ({
      key: requirement.key,
      value: enteredD20(requirement.context, 15),
    }));
}

function execution(
  phaseId: string,
  overrides: Partial<CombatEffectExecution> = {}
): CombatEffectExecution {
  return {
    occurrenceId: `occurrence-${phaseId}`,
    phaseId,
    sourceId: "source-1",
    targets: [TARGET],
    instances: 1,
    occurrence: 0,
    tallies: {},
    gateContexts: [],
    ...overrides,
  };
}

describe("explicit spell effect programs — first exact lifecycle wave", () => {
  it("models Eldritch Blast as 1/2/3/4 independently targeted attack packets", () => {
    const program = programFor(SRD_CANTRIPS, "eldritch-blast");

    for (const [characterLevel, instances] of [
      [1, 1],
      [5, 2],
      [11, 3],
      [17, 4],
    ] as const) {
      const instanceTargets = Array.from({ length: instances }, () => TARGET);
      const invocation = execution("resolve", {
        characterLevel,
        instances,
        instanceTargets,
        gateContexts: instanceTargets.map((target, instance) => ({
          gateId: "beam-attack",
          target,
          instance,
          context: attackContext(`beam-${characterLevel}-${instance}`),
        })),
      });
      const gates = deriveCombatEffectRequirements(program, invocation);
      const requirements = deriveCombatEffectRequirements(
        program,
        invocation,
        answeredAttackGates(gates)
      );

      expect(
        requirements.filter((requirement) => requirement.kind === "attack")
      ).toHaveLength(instances);
      const damageRolls = requirements.filter(
        (requirement) => requirement.refId === "beam-roll"
      );
      expect(damageRolls).toHaveLength(instances);
      expect(damageRolls.map((requirement) => requirement.instance)).toEqual(
        Array.from({ length: instances }, (_, index) => index)
      );
    }
  });

  it("models Acid Arrow's upcast impact/miss-half separately from its fixed afterburn", () => {
    const program = programFor(SRD_SPELLS_LEVEL2, "melfs-acid-arrow");
    const invocation = execution("impact", {
      castLevel: 5,
      gateContexts: [
        {
          gateId: "arrow-attack",
          target: TARGET,
          context: attackContext("acid-arrow-impact"),
        },
      ],
    });
    const impactGates = deriveCombatEffectRequirements(program, invocation);
    const impact = deriveCombatEffectRequirements(
      program,
      invocation,
      answeredAttackGates(impactGates)
    );
    expect(
      impact.find((requirement) => requirement.refId === "impact-roll")
    ).toMatchObject({ kind: "roll", roll: { count: 7, sides: 4 } });

    const afterburn = deriveCombatEffectRequirements(
      program,
      execution("afterburn", { castLevel: 5 })
    );
    expect(afterburn).toEqual([
      expect.objectContaining({
        refId: "afterburn-roll",
        kind: "roll",
        roll: { count: 2, sides: 4, bonus: 0 },
      }),
    ]);
  });

  it("models Vitriolic Sphere as one shared area roll plus failure-only target afterburns", () => {
    const program = programFor(SRD_SPELLS_LEVEL4, "vitriolic-sphere");
    const requirements = deriveCombatEffectRequirements(
      program,
      execution("impact", {
        castLevel: 6,
        gateContexts: [
          {
            gateId: "initial-save",
            target: TARGET,
            context: saveContext("vitriolic-save", "DEX"),
          },
        ],
      })
    );

    expect(
      requirements.filter((requirement) => requirement.refId === "initial-roll")
    ).toEqual([
      expect.objectContaining({
        scope: "program",
        kind: "roll",
        roll: { count: 14, sides: 4, bonus: 0 },
      }),
    ]);
    expect(
      deriveCombatEffectRequirements(program, execution("afterburn", { castLevel: 6 }))
    ).toEqual([
      expect.objectContaining({
        refId: "afterburn-roll",
        kind: "roll",
        roll: { count: 5, sides: 4, bonus: 0 },
      }),
    ]);
  });

  it.each([
    ["ensnaring-strike", SRD_SPELLS_LEVEL1],
    ["searing-smite", SRD_SPELLS_LEVEL1],
    ["dragons-breath", SRD_SPELLS_LEVEL2],
    ["spike-growth", SRD_SPELLS_LEVEL2],
    ["phantasmal-force", SRD_SPELLS_LEVEL2],
    ["fire-shield", SRD_SPELLS_LEVEL4],
    ["phantasmal-killer", SRD_SPELLS_LEVEL4],
    ["contagion", SRD_SPELLS_LEVEL5],
    ["delayed-blast-fireball", SRD_SPELLS_LEVEL7],
    ["prismatic-spray", SRD_SPELLS_LEVEL7],
    ["prismatic-wall", SRD_SPELLS_LEVEL9],
    ["storm-of-vengeance", SRD_SPELLS_LEVEL9],
    ["weird", SRD_SPELLS_LEVEL9],
  ] as const)("validates the authored %s programme", (id, spells) => {
    expect(programFor(spells, id).id).toBe(`spell.${id}`);
  });

  it("accumulates Delayed Blast Fireball dice before one shared area roll", () => {
    const program = programFor(SRD_SPELLS_LEVEL7, "delayed-blast-fireball");
    expect(
      deriveCombatEffectRequirements(program, execution("charge", { targets: [] }))
    ).toEqual([]);

    const targets = [TARGET, { combatantId: "target-2" }];
    const requirements = deriveCombatEffectRequirements(
      program,
      execution("detonate", {
        targets,
        castLevel: 9,
        tallies: { "stored-dice": 3 },
        gateContexts: targets.map((target, index) => ({
          gateId: "explosion-save",
          target,
          context: saveContext(`explosion-${index}`, "DEX", target),
        })),
      })
    );
    expect(
      requirements.filter((requirement) => requirement.kind === "save")
    ).toHaveLength(2);
    expect(requirements.filter((requirement) => requirement.kind === "roll")).toEqual([
      expect.objectContaining({
        refId: "explosion-roll",
        scope: "program",
        roll: { count: 17, sides: 6, bonus: 0 },
      }),
    ]);
  });

  it("keeps Phantasmal Killer's initial half damage separate from its failed repeat", () => {
    const program = programFor(SRD_SPELLS_LEVEL4, "phantasmal-killer");
    for (const [phaseId, gateId] of [
      ["impact", "initial-save"],
      ["nightmare-turn", "repeat-save"],
    ] as const) {
      const requirements = deriveCombatEffectRequirements(
        program,
        execution(phaseId, {
          castLevel: 6,
          gateContexts: [
            {
              gateId,
              target: TARGET,
              context: saveContext(`${phaseId}-save`, "WIS"),
            },
          ],
        })
      );
      expect(
        requirements.filter((requirement) => requirement.kind === "save")
      ).toHaveLength(1);
      expect(requirements.filter((requirement) => requirement.kind === "roll")).toEqual([
        expect.objectContaining({ roll: { count: 6, sides: 10, bonus: 0 } }),
      ]);
    }
  });

  it("branches Contagion only after the initial save and caps its 3-of-a-kind series", () => {
    const program = programFor(SRD_SPELLS_LEVEL5, "contagion");
    const invocation = execution("infect", {
      gateContexts: [
        {
          gateId: "initial-save",
          target: TARGET,
          context: saveContext("contagion-initial", "CON"),
        },
      ],
    });
    const gateOnly = deriveCombatEffectRequirements(program, invocation);
    expect(gateOnly.map((requirement) => requirement.kind)).toEqual(["save"]);
    expect(
      deriveCombatEffectRequirements(program, invocation, answeredSaveGates(gateOnly, 20))
    ).toHaveLength(1);
    expect(
      deriveCombatEffectRequirements(
        program,
        invocation,
        answeredSaveGates(gateOnly, 1)
      ).map((requirement) => requirement.kind)
    ).toEqual(["save", "roll", "choice"]);

    const repeat = program.phases.find((phase) => phase.id === "save-series-turn");
    expect(repeat?.repeat?.maxOccurrences).toBe(5);
    expect(
      repeat?.steps
        .filter((step) => step.kind === "counter")
        .map((step) => step.counterId)
    ).toEqual(["save-successes", "save-failures"]);
  });

  it("uses one Storm of Vengeance roll with six distinct turn-three saves", () => {
    const program = programFor(SRD_SPELLS_LEVEL9, "storm-of-vengeance");
    const targets = Array.from({ length: 6 }, (_, index) => ({
      combatantId: `storm-target-${index}`,
    }));
    const requirements = deriveCombatEffectRequirements(
      program,
      execution("turn-three", {
        targets,
        gateContexts: targets.map((target, index) => ({
          gateId: "lightning-save",
          target,
          context: saveContext(`storm-lightning-${index}`, "DEX", target),
        })),
      })
    );
    expect(
      requirements.filter((requirement) => requirement.kind === "save")
    ).toHaveLength(6);
    expect(requirements.filter((requirement) => requirement.kind === "roll")).toEqual([
      expect.objectContaining({
        refId: "lightning-roll",
        scope: "program",
        roll: { count: 10, sides: 6, bonus: 0 },
      }),
    ]);
  });

  it("models Weird's shared impact and per-target repeat damage separately", () => {
    const program = programFor(SRD_SPELLS_LEVEL9, "weird");
    const targets = [TARGET, { combatantId: "target-2" }];
    const impact = deriveCombatEffectRequirements(
      program,
      execution("terror", {
        targets,
        gateContexts: targets.map((target, index) => ({
          gateId: "initial-save",
          target,
          context: saveContext(`weird-initial-${index}`, "WIS", target),
        })),
      })
    );
    expect(impact.filter((requirement) => requirement.kind === "save")).toHaveLength(2);
    expect(impact.filter((requirement) => requirement.kind === "roll")).toEqual([
      expect.objectContaining({
        refId: "initial-roll",
        scope: "program",
        roll: { count: 10, sides: 10, bonus: 0 },
      }),
    ]);

    const invocation = execution("terror-turn", {
      gateContexts: [
        {
          gateId: "repeat-save",
          target: TARGET,
          context: saveContext("weird-repeat", "WIS"),
        },
      ],
    });
    const gateOnly = deriveCombatEffectRequirements(program, invocation);
    expect(gateOnly.map((requirement) => requirement.kind)).toEqual(["save"]);
    expect(
      deriveCombatEffectRequirements(program, invocation, answeredSaveGates(gateOnly, 1))
    ).toEqual([
      expect.objectContaining({ kind: "save", refId: "repeat-save" }),
      expect.objectContaining({
        kind: "roll",
        refId: "repeat-roll",
        roll: { count: 5, sides: 10, bonus: 0 },
      }),
    ]);
  });

  it("keeps environmental and retaliatory events to one exact physical packet", () => {
    const spike = deriveCombatEffectRequirements(
      programFor(SRD_SPELLS_LEVEL2, "spike-growth"),
      execution("travel-five-feet")
    );
    const phantasm = deriveCombatEffectRequirements(
      programFor(SRD_SPELLS_LEVEL2, "phantasmal-force"),
      execution("dangerous-phantasm")
    );
    const shield = deriveCombatEffectRequirements(
      programFor(SRD_SPELLS_LEVEL4, "fire-shield"),
      execution("retaliate")
    );
    expect(spike).toEqual([
      expect.objectContaining({ roll: { count: 2, sides: 4, bonus: 0 } }),
    ]);
    expect(phantasm).toEqual([
      expect.objectContaining({ roll: { count: 2, sides: 8, bonus: 0 } }),
    ]);
    expect(shield).toEqual([
      expect.objectContaining({ roll: { count: 2, sides: 8, bonus: 0 } }),
    ]);
  });

  it("branches the smite and breath lifecycles without silently rolling dice", () => {
    const ensnaring = programFor(SRD_SPELLS_LEVEL1, "ensnaring-strike");
    const largeSave = {
      ...saveContext("ensnaring-large", "STR"),
      rollRules: {
        ...emptyRollRules(),
        advantageSourceIds: ["ensnaring-strike-large-save-advantage"],
      },
    };
    const ensnare = deriveCombatEffectRequirements(
      ensnaring,
      execution("ensnare", {
        castLevel: 3,
        bindings: { casterSpellSaveDc: 17 },
        triggerFacts: { attack: { result: "hit", critical: false } },
        participantFacts: [
          { participant: { kind: "target", target: TARGET }, size: "Large" },
        ],
        gateContexts: [{ gateId: "vine-save", target: TARGET, context: largeSave }],
      })
    );
    expect(ensnare).toEqual([
      expect.objectContaining({ kind: "save", refId: "vine-save" }),
    ]);
    expect(
      deriveCombatEffectRequirements(
        ensnaring,
        execution("restrained-turn", { castLevel: 3 })
      )
    ).toEqual([
      expect.objectContaining({
        refId: "vine-damage-roll",
        roll: { count: 3, sides: 6, bonus: 0 },
      }),
    ]);

    const searing = programFor(SRD_SPELLS_LEVEL1, "searing-smite");
    expect(
      deriveCombatEffectRequirements(
        searing,
        execution("ignite", {
          castLevel: 4,
          triggerFacts: { attack: { result: "miss", critical: false } },
        })
      )
    ).toEqual([]);
    expect(
      deriveCombatEffectRequirements(
        searing,
        execution("ignite", {
          castLevel: 4,
          triggerFacts: { attack: { result: "hit", critical: false } },
        })
      )
    ).toEqual([
      expect.objectContaining({
        refId: "impact-roll",
        roll: { count: 4, sides: 6, bonus: 0 },
      }),
    ]);

    const breath = programFor(SRD_SPELLS_LEVEL2, "dragons-breath");
    expect(deriveCombatEffectRequirements(breath, execution("imbue"))).toEqual([
      expect.objectContaining({ kind: "choice", refId: "breath-type" }),
    ]);
  });

  it("expands Prismatic Spray's eighth result into two reviewed reroll-until rays", () => {
    const program = programFor(SRD_SPELLS_LEVEL7, "prismatic-spray");
    const invocation = execution("spray", {
      bindings: { casterSpellSaveDc: 17 },
      gateContexts: [
        {
          gateId: "ray-save",
          target: TARGET,
          context: saveContext("prismatic-spray-save", "DEX"),
        },
      ],
    });
    const initial = deriveCombatEffectRequirements(program, invocation);
    const saveAnswers = answeredSaveGates(initial, 1);
    const primary = initial.find((entry) => entry.refId === "primary-ray");
    if (!primary) throw new Error("missing primary ray table");
    const expanded = deriveCombatEffectRequirements(program, invocation, [
      ...saveAnswers,
      {
        key: primary.key,
        value: {
          dice: [{ dieId: "primary-d8", initialFace: 8, replacements: [] }],
          consumedResourceIds: [],
          total: 8,
        },
      },
    ]);
    expect(
      expanded
        .filter((entry) => entry.kind === "table-roll")
        .map((entry) => [
          entry.refId,
          entry.kind === "table-roll" ? entry.rerollValues : undefined,
        ])
    ).toEqual([
      ["primary-ray", undefined],
      ["secondary-one-ray", [8]],
      ["secondary-two-ray", [8]],
    ]);
  });

  it("keeps Prismatic Wall's ordered active layers and 12d6 crossings explicit", () => {
    const program = programFor(SRD_SPELLS_LEVEL9, "prismatic-wall");
    expect(program.layers?.map((layer) => layer.id)).toEqual([
      "red",
      "orange",
      "yellow",
      "green",
      "blue",
      "indigo",
      "violet",
    ]);
    const crossing = deriveCombatEffectRequirements(
      program,
      execution("cross-red", {
        bindings: { casterSpellSaveDc: 17 },
        gateContexts: [
          {
            gateId: "red-cross-save",
            target: TARGET,
            context: saveContext("wall-red-save", "DEX"),
          },
        ],
      })
    );
    expect(crossing).toEqual([
      expect.objectContaining({ kind: "save", refId: "red-cross-save" }),
      expect.objectContaining({
        kind: "roll",
        refId: "red-damage-roll",
        roll: { count: 12, sides: 6, bonus: 0 },
      }),
    ]);
  });

  it("keeps legacy cast cards from applying delayed packets at cast", () => {
    expect(spellFor(SRD_SPELLS_LEVEL2, "spike-growth")).toMatchObject({
      damageDice: "2d4",
      resolveOnCast: false,
    });
    expect(spellFor(SRD_SPELLS_LEVEL2, "phantasmal-force")).toMatchObject({
      damageDice: "2d8",
      resolveOnCast: false,
    });
    expect(spellFor(SRD_SPELLS_LEVEL4, "fire-shield")).toMatchObject({
      damageDice: "2d8",
      resolveOnCast: false,
    });
    expect(spellFor(SRD_SPELLS_LEVEL4, "phantasmal-killer")).toMatchObject({
      damageDice: "4d10",
      damageOnSave: "half",
    });
    expect(spellFor(SRD_SPELLS_LEVEL5, "contagion")).toMatchObject({
      damageDice: "11d8",
      damageType: "necrotic",
      conditionApplication: { options: ["poisoned"], on: "failed-save" },
    });
    expect(spellFor(SRD_SPELLS_LEVEL7, "delayed-blast-fireball")).toMatchObject({
      damageDice: "12d6",
      resolveOnCast: false,
    });
    expect(spellFor(SRD_SPELLS_LEVEL9, "weird")).toMatchObject({
      damageDice: "10d10",
      damageOnSave: "half",
    });
  });
});
