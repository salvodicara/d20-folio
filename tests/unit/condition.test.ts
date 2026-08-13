import { describe, expect, it } from "vitest";

import {
  applyLongRestExhaustion,
  CONDITION_RULES,
  conformConditionInstances,
  conformExhaustionLevel,
  gainExhaustion,
  normalizeConditions,
  projectConditionEffects,
  removeExhaustion,
  resolveExhaustion,
} from "@/lib/condition";
import { conformDamageDefenseRule } from "@/lib/damage";
import {
  CONDITION_IDS,
  EXHAUSTION_LEVELS,
  NON_EXHAUSTION_CONDITION_IDS,
  type ConditionInstance,
  type DeterministicConditionEffect,
  type NonExhaustionConditionId,
} from "@/types/condition";
import type { EntityRef } from "@/types/mechanics-reference";

const material = {
  characterId: "character-1",
  kind: "character-play",
  uid: "uid-1",
} as const;
const charmer: EntityRef = { entityId: "charmer", material, ordinal: 1 };
const otherSource: EntityRef = { entityId: "other-source", material, ordinal: 2 };

function instance(
  conditionId: NonExhaustionConditionId,
  instanceId = `${conditionId}-1`,
  source: EntityRef | null = null
): ConditionInstance {
  return {
    conditionId,
    identity: {
      kind: "occurrence",
      ref: { occurrence: { material, occurrenceId: instanceId }, ordinal: 1 },
    },
    source,
  };
}

function occurrenceIdentity(occurrenceId: string): ConditionInstance["identity"] {
  return {
    kind: "occurrence",
    ref: { occurrence: { material, occurrenceId }, ordinal: 1 },
  };
}

function effects(conditionId: NonExhaustionConditionId) {
  const projection = projectConditionEffects([instance(conditionId)]);
  expect(projection).not.toBeNull();
  return projection?.deterministicEffects.map(({ effect }) => effect) ?? [];
}

function requirements(conditionId: NonExhaustionConditionId) {
  const projection = projectConditionEffects([instance(conditionId, undefined, charmer)]);
  expect(projection).not.toBeNull();
  return projection?.requirements.map(({ requirement }) => requirement) ?? [];
}

function effectOfKind<Kind extends DeterministicConditionEffect["kind"]>(
  values: ReadonlyArray<DeterministicConditionEffect>,
  kind: Kind
): Extract<DeterministicConditionEffect, { kind: Kind }>[] {
  return values.filter(
    (effect): effect is Extract<DeterministicConditionEffect, { kind: Kind }> =>
      effect.kind === kind
  );
}

describe("canonical condition vocabulary and exact boundary", () => {
  it("owns exactly the 15 conditions and the 14 non-Exhaustion occurrences", () => {
    expect(CONDITION_IDS).toEqual([
      "blinded",
      "charmed",
      "deafened",
      "exhaustion",
      "frightened",
      "grappled",
      "incapacitated",
      "invisible",
      "paralyzed",
      "petrified",
      "poisoned",
      "prone",
      "restrained",
      "stunned",
      "unconscious",
    ]);
    expect(NON_EXHAUSTION_CONDITION_IDS).toEqual(
      CONDITION_IDS.filter((conditionId) => conditionId !== "exhaustion")
    );
    expect(Object.keys(CONDITION_RULES)).toEqual(CONDITION_IDS);
    expect(CONDITION_RULES.exhaustion.kind).toBe("levels");
    for (const conditionId of NON_EXHAUSTION_CONDITION_IDS) {
      expect(CONDITION_RULES[conditionId].kind).toBe("occurrence");
    }
    expect(Object.isFrozen(CONDITION_RULES)).toBe(true);
    expect(Object.isFrozen(CONDITION_RULES.unconscious.implications)).toBe(true);
  });

  it("accepts only exact non-Exhaustion instances and returns a frozen clone", () => {
    const input = [instance("charmed", "charm-1", charmer)];
    const conformed = conformConditionInstances(input);
    expect(conformed).toEqual(input);
    expect(conformed).not.toBe(input);
    expect(Object.isFrozen(conformed)).toBe(true);
    expect(Object.isFrozen(conformed?.[0]?.source)).toBe(true);

    expect(
      conformConditionInstances([
        {
          conditionId: "exhaustion",
          identity: instance("blinded", "wrong-model").identity,
          source: null,
        },
      ])
    ).toBeNull();
    expect(
      conformConditionInstances([
        {
          conditionId: "blinded",
          description: "legacy prose",
          identity: instance("blinded", "blind-1").identity,
          source: null,
        },
      ])
    ).toBeNull();
    expect(
      conformConditionInstances([
        { condition: "blinded", id: "legacy", sourceId: "spell:blindness" },
      ])
    ).toBeNull();
    expect(
      conformConditionInstances([
        instance("blinded", "same"),
        instance("poisoned", "same"),
      ])
    ).toBeNull();
  });

  it("rejects hostile prototypes, accessors, symbols, sparse arrays, cycles and refs", () => {
    const customPrototype = Object.assign(
      Object.create({ inherited: true }) as Record<string, unknown>,
      {
        conditionId: "blinded",
        identity: instance("blinded", "blind-1").identity,
        source: null,
      }
    );
    const nullPrototype = Object.assign(
      Object.create(null) as Record<string, unknown>,
      instance("blinded")
    );
    const accessor = instance("blinded") as unknown as Record<string, unknown>;
    Object.defineProperty(accessor, "conditionId", {
      enumerable: true,
      get: () => "blinded",
    });
    const withSymbol = { ...instance("blinded") };
    Object.defineProperty(withSymbol, Symbol("hidden"), {
      enumerable: true,
      value: true,
    });
    const sparse = Array(1);
    const cyclic = { ...instance("blinded") } as Record<string, unknown>;
    cyclic.source = cyclic;
    const badRef = {
      ...instance("charmed"),
      source: { entityId: "charmer", material: { kind: "character-play" } },
    };

    for (const candidate of [
      [customPrototype],
      [nullPrototype],
      [accessor],
      [withSymbol],
      sparse,
      [cyclic],
      [badRef],
    ]) {
      expect(conformConditionInstances(candidate)).toBeNull();
    }
  });
});

describe("one exhaustive 2024 rule table", () => {
  it("models Blinded and Deafened sense failures without guessing the check context", () => {
    expect(effects("blinded")).toEqual([
      { kind: "sense-unavailable", sense: "sight" },
      {
        kind: "roll-mode",
        mode: "disadvantage",
        perspective: "self",
        test: "attack",
      },
      {
        kind: "roll-mode",
        mode: "advantage",
        perspective: "against-self",
        test: "attack",
      },
    ]);
    expect(requirements("blinded")).toEqual([
      {
        kind: "sense-dependent-ability-check",
        outcome: "automatic-failure",
        sense: "sight",
      },
    ]);
    expect(effects("deafened")).toEqual([
      { kind: "sense-unavailable", sense: "hearing" },
    ]);
    expect(requirements("deafened")).toEqual([
      {
        kind: "sense-dependent-ability-check",
        outcome: "automatic-failure",
        sense: "hearing",
      },
    ]);
  });

  it("models Charmed, Frightened and Grappled against their exact source", () => {
    expect(effects("charmed")).toEqual([]);
    expect(requirements("charmed")).toEqual([
      {
        kind: "harm-source-block",
        operations: ["attack", "damaging-ability", "damaging-magical-effect"],
      },
      { kind: "source-social-check", mode: "advantage" },
    ]);
    expect(requirements("frightened")).toEqual([
      {
        kind: "source-in-line-of-sight-roll",
        mode: "disadvantage",
        test: "ability-check",
      },
      {
        kind: "source-in-line-of-sight-roll",
        mode: "disadvantage",
        test: "attack",
      },
      { kind: "approach-source-block" },
    ]);
    expect(effects("grappled")).toEqual([{ kind: "speed-zero" }]);
    expect(requirements("grappled")).toEqual([
      { kind: "non-source-attack", mode: "disadvantage" },
      {
        exemption: "subject-tiny-or-two-plus-sizes-smaller",
        extraMovementCostPerFoot: 1,
        kind: "source-moves-grappled-subject",
      },
    ]);
  });

  it("models Incapacitated and the source-dependent visibility benefits", () => {
    expect(effects("incapacitated")).toEqual([
      { kind: "block-economy", slots: ["action", "bonus-action", "reaction"] },
      { kind: "break-concentration" },
      { kind: "speech-unavailable" },
      {
        kind: "roll-mode",
        mode: "disadvantage",
        perspective: "self",
        test: "initiative",
      },
    ]);

    const invisibleEffects = effects("invisible");
    expect(invisibleEffects).toEqual([
      {
        kind: "roll-mode",
        mode: "advantage",
        perspective: "self",
        test: "initiative",
      },
    ]);
    expect(requirements("invisible")).toEqual([
      {
        includesWornCarriedEquipment: true,
        kind: "seen-targeting",
        whenCreatorCannotSee: "ineligible",
      },
      {
        appliesWhen: "counterparty-cannot-see-subject",
        kind: "visibility-attack-roll",
        mode: "advantage",
        perspective: "self",
      },
      {
        appliesWhen: "counterparty-cannot-see-subject",
        kind: "visibility-attack-roll",
        mode: "disadvantage",
        perspective: "against-self",
      },
    ]);
  });

  it("models the three Incapacitated implications without inventing Stunned Speed 0", () => {
    expect(CONDITION_RULES.paralyzed.implications).toEqual(["incapacitated"]);
    expect(CONDITION_RULES.petrified.implications).toEqual(["incapacitated"]);
    expect(CONDITION_RULES.stunned.implications).toEqual(["incapacitated"]);

    for (const conditionId of ["paralyzed", "petrified", "stunned"] as const) {
      expect(effectOfKind(effects(conditionId), "auto-fail-save")).toEqual([
        { abilities: ["STR", "DEX"], kind: "auto-fail-save" },
      ]);
      expect(effectOfKind(effects(conditionId), "roll-mode")).toContainEqual({
        kind: "roll-mode",
        mode: "advantage",
        perspective: "against-self",
        test: "attack",
      });
      expect(effectOfKind(effects(conditionId), "block-economy")).toEqual([
        { kind: "block-economy", slots: ["action", "bonus-action", "reaction"] },
      ]);
      expect(effectOfKind(effects(conditionId), "break-concentration")).toEqual([
        { kind: "break-concentration" },
      ]);
    }
    expect(effectOfKind(effects("paralyzed"), "speed-zero")).toHaveLength(1);
    expect(effectOfKind(effects("petrified"), "speed-zero")).toHaveLength(1);
    expect(effectOfKind(effects("stunned"), "speed-zero")).toHaveLength(0);
    expect(requirements("paralyzed")).toContainEqual({
      distanceFt: 5,
      kind: "automatic-critical-on-hit",
    });
    expect(requirements("stunned")).not.toContainEqual(
      expect.objectContaining({ kind: "automatic-critical-on-hit" })
    );
  });

  it("models every Petrified fact through canonical damage and condition defenses", () => {
    const petrified = effects("petrified");
    expect(petrified).toContainEqual({
      includesWornCarriedNonmagicalObjects: true,
      kind: "inanimate-transformation",
    });
    expect(petrified).toContainEqual({ factor: 10, kind: "weight-multiplier" });
    expect(petrified).toContainEqual({ kind: "aging-suspended" });
    expect(petrified).toContainEqual({
      conditionId: "poisoned",
      kind: "condition-immunity",
    });
    const defense = effectOfKind(petrified, "damage-defense");
    expect(defense).toHaveLength(1);
    expect(conformDamageDefenseRule(defense[0]?.rule)).toEqual({
      kind: "resistance",
      selector: {
        damageTypes: [],
        deliveries: [],
        forbiddenTraits: [],
        requiredTraits: [],
      },
      sourceId: "condition:petrified:all-damage-resistance",
    });
  });

  it("models Poisoned, Prone and Restrained roll and movement rules", () => {
    expect(effects("poisoned")).toEqual([
      {
        kind: "roll-mode",
        mode: "disadvantage",
        perspective: "self",
        test: "ability-check",
      },
      {
        kind: "roll-mode",
        mode: "disadvantage",
        perspective: "self",
        test: "attack",
      },
    ]);
    expect(effects("prone")).toEqual([
      {
        kind: "roll-mode",
        mode: "disadvantage",
        perspective: "self",
        test: "attack",
      },
    ]);
    expect(requirements("prone")).toEqual([
      {
        crawlAllowed: true,
        kind: "prone-movement",
        standBlockedAtSpeedZero: true,
        standCost: "half-speed-round-down",
        standEndsCondition: true,
      },
      {
        beyond: "disadvantage",
        kind: "prone-attacks-against",
        thresholdFt: 5,
        within: "advantage",
      },
    ]);
    expect(effects("restrained")).toEqual([
      { kind: "speed-zero" },
      {
        kind: "roll-mode",
        mode: "advantage",
        perspective: "against-self",
        test: "attack",
      },
      {
        kind: "roll-mode",
        mode: "disadvantage",
        perspective: "self",
        test: "attack",
      },
      {
        ability: "DEX",
        kind: "roll-mode",
        mode: "disadvantage",
        perspective: "self",
        test: "saving-throw",
      },
    ]);
  });

  it("models Unconscious closure, inert state, critical range and retained Prone", () => {
    expect(CONDITION_RULES.unconscious.implications).toEqual(["incapacitated", "prone"]);
    const unconscious = effects("unconscious");
    expect(unconscious).toContainEqual({ kind: "drop-held-items" });
    expect(unconscious).toContainEqual({ kind: "surroundings-unaware" });
    expect(unconscious).toContainEqual({ kind: "speed-zero" });
    expect(unconscious).toContainEqual({
      abilities: ["STR", "DEX"],
      kind: "auto-fail-save",
    });
    expect(unconscious).toContainEqual({
      kind: "roll-mode",
      mode: "disadvantage",
      perspective: "self",
      test: "attack",
    });
    expect(requirements("unconscious")).toEqual([
      {
        crawlAllowed: true,
        kind: "prone-movement",
        standBlockedAtSpeedZero: true,
        standCost: "half-speed-round-down",
        standEndsCondition: true,
      },
      {
        beyond: "disadvantage",
        kind: "prone-attacks-against",
        thresholdFt: 5,
        within: "advantage",
      },
      { distanceFt: 5, kind: "automatic-critical-on-hit" },
      { conditionId: "prone", kind: "condition-end-retains" },
    ]);
  });

  it("contains tokens only, never localized or free-form presentation fields", () => {
    const forbidden = new Set(["description", "en", "it", "label", "prose"]);
    const visit = (value: unknown): void => {
      if (value === null || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        expect(forbidden.has(key)).toBe(false);
        visit(child);
      }
    };
    visit(CONDITION_RULES);
  });
});

describe("closure, multiplicity, provenance and non-stacking projection", () => {
  it("preserves every direct instance and traces every implied condition", () => {
    const input = [
      instance("paralyzed", "paralysis-a", charmer),
      instance("paralyzed", "paralysis-b", otherSource),
      instance("stunned", "stun-a", null),
    ];
    const normalized = normalizeConditions(input);
    expect(normalized?.instances).toHaveLength(3);
    expect(normalized?.effective.map(({ conditionId }) => conditionId)).toEqual([
      "incapacitated",
      "paralyzed",
      "stunned",
    ]);
    expect(
      normalized?.effective.find(({ conditionId }) => conditionId === "paralyzed")
        ?.provenance
    ).toEqual([
      {
        identity: occurrenceIdentity("paralysis-a"),
        path: ["paralyzed"],
        source: charmer,
      },
      {
        identity: occurrenceIdentity("paralysis-b"),
        path: ["paralyzed"],
        source: otherSource,
      },
    ]);
    expect(
      normalized?.effective.find(({ conditionId }) => conditionId === "incapacitated")
        ?.provenance
    ).toEqual([
      {
        identity: occurrenceIdentity("paralysis-a"),
        path: ["paralyzed", "incapacitated"],
        source: charmer,
      },
      {
        identity: occurrenceIdentity("paralysis-b"),
        path: ["paralyzed", "incapacitated"],
        source: otherSource,
      },
      {
        identity: occurrenceIdentity("stun-a"),
        path: ["stunned", "incapacitated"],
        source: null,
      },
    ]);
    expect(Object.isFrozen(normalized)).toBe(true);
  });

  it("deduplicates effects but retains every lifetime as effect provenance", () => {
    const projection = projectConditionEffects([
      instance("grappled", "grapple-a", charmer),
      instance("grappled", "grapple-b", charmer),
      instance("restrained", "restraint-a", otherSource),
    ]);
    const speedZero = projection?.deterministicEffects.filter(
      ({ effect }) => effect.kind === "speed-zero"
    );
    expect(speedZero).toHaveLength(1);
    expect(
      speedZero?.[0]?.provenance.map(({ identity }) =>
        identity.kind === "occurrence"
          ? identity.ref.occurrence.occurrenceId
          : identity.kind
      )
    ).toEqual(["grapple-a", "grapple-b", "restraint-a"]);
    expect(projection?.instances).toHaveLength(3);
  });

  it("groups source requirements per source without erasing duplicate occurrences", () => {
    const projection = projectConditionEffects([
      instance("frightened", "fear-a", charmer),
      instance("frightened", "fear-b", charmer),
      instance("frightened", "fear-c", otherSource),
    ]);
    const approach = projection?.requirements.filter(
      ({ requirement }) => requirement.kind === "approach-source-block"
    );
    expect(approach).toHaveLength(2);
    expect(approach?.[0]).toEqual({
      conditionSource: charmer,
      provenance: [
        {
          identity: occurrenceIdentity("fear-a"),
          path: ["frightened"],
          source: charmer,
        },
        {
          identity: occurrenceIdentity("fear-b"),
          path: ["frightened"],
          source: charmer,
        },
      ],
      requirement: { kind: "approach-source-block" },
    });
    expect(approach?.[1]).toEqual({
      conditionSource: otherSource,
      provenance: [
        {
          identity: occurrenceIdentity("fear-c"),
          path: ["frightened"],
          source: otherSource,
        },
      ],
      requirement: { kind: "approach-source-block" },
    });
  });
});

describe("numeric Exhaustion", () => {
  it("resolves every exact level from the engine-owned coefficients", () => {
    expect(EXHAUSTION_LEVELS.map(resolveExhaustion)).toEqual([
      { d20Penalty: 0, dead: false, speedPenaltyFt: 0 },
      { d20Penalty: -2, dead: false, speedPenaltyFt: 5 },
      { d20Penalty: -4, dead: false, speedPenaltyFt: 10 },
      { d20Penalty: -6, dead: false, speedPenaltyFt: 15 },
      { d20Penalty: -8, dead: false, speedPenaltyFt: 20 },
      { d20Penalty: -10, dead: false, speedPenaltyFt: 25 },
      { d20Penalty: -12, dead: true, speedPenaltyFt: 30 },
    ]);
  });

  it("rejects non-level values instead of coercing a legacy boolean condition", () => {
    for (const value of [-1, -0, 1.5, 7, NaN, Infinity, "2", true, null]) {
      expect(conformExhaustionLevel(value)).toBeNull();
      expect(resolveExhaustion(value)).toBeNull();
    }
    for (const level of EXHAUSTION_LEVELS) {
      expect(conformExhaustionLevel(level)).toBe(level);
    }
  });

  it("clamps gain, removal and Long Rest transitions and is idempotent at bounds", () => {
    expect(gainExhaustion(0)).toBe(1);
    expect(gainExhaustion(5, 99)).toBe(6);
    expect(gainExhaustion(6)).toBe(6);
    expect(gainExhaustion(3, 0)).toBe(3);
    expect(removeExhaustion(6)).toBe(5);
    expect(removeExhaustion(2, 99)).toBe(0);
    expect(removeExhaustion(0)).toBe(0);
    expect(removeExhaustion(3, 0)).toBe(3);
    expect(applyLongRestExhaustion(4)).toBe(3);
    expect(applyLongRestExhaustion(0)).toBe(0);
    expect(gainExhaustion(7)).toBeNull();
    expect(removeExhaustion(2, -1)).toBeNull();
    expect(removeExhaustion(2, -0)).toBeNull();
    expect(gainExhaustion(2, 1.5)).toBeNull();
  });
});
