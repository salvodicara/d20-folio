import { describe, expect, it, vi } from "vitest";

import {
  atomicAddressKey,
  atomicDocumentForOwner,
  atomicDocumentKey,
  atomicLedgerForOwner,
  atomicOwnerKey,
  atomicOwnerScopeKey,
  canonicalizeDamageDefenses,
  conformAtomicOccurrenceRuleIdentity,
  conformCombatEffectAtomicReadSet,
  isAtomicOccurrenceRuleIdentity,
  materializeDamageDefenses,
  serializeCombatEffectAtomicReadSet,
  type AtomicAddress,
  type AtomicOwner,
  type AtomicRead,
  type CombatEffectAtomicReadSet,
} from "@/lib/combat-effect-atomic";
import type { DamageDefenses } from "@/lib/damage-intake";
import type { ActiveCombatEffect } from "@/types/combat-effect";

const owner: Extract<AtomicOwner, { kind: "pc"; surface: "local" }> = {
  kind: "pc",
  surface: "local",
  uid: "user:one",
  characterId: "character:one",
  combatantId: "combatant:one",
};

function completeEffect(): ActiveCombatEffect {
  return {
    id: "effect:one",
    actor: {
      kind: "pc",
      combatantId: "caster:one",
      memberUid: "caster-user",
      characterId: "caster-character",
    },
    target: {
      kind: "pc",
      combatantId: owner.combatantId,
      memberUid: owner.uid,
      characterId: owner.characterId,
    },
    source: {
      kind: "spell",
      id: "spell:ward",
      actionId: "cast",
      castLevel: 4,
    },
    payload: { kind: "program-standing", effectId: "warded" },
    programOwner: {
      occurrenceId: "occurrence:one",
      programId: "program:ward",
      phaseId: "resolve",
      stepId: "apply-ward",
      operationId: "operation:one",
      instance: 0,
      iteration: 2,
    },
    authoredLifetime: {
      kind: "turn-boundary",
      subject: "target",
      phase: "turn-end",
      offsetTurns: 1,
    },
    bindings: { spellcastingModifier: -1 },
    applied: { currentHpDelta: -3 },
    duration: {
      kind: "concentration",
      actorId: "caster:one",
      sourceId: "spell:ward",
    },
  };
}

function defenses(): DamageDefenses {
  return {
    allDamageResistance: true,
    resistances: new Set(["fire", "acid"]),
    immunities: new Set(["poison", "cold"]),
    vulnerabilities: new Set(["thunder", "radiant"]),
    sourceResistances: new Set(["spell"]),
    flatReductions: [
      {
        id: "reduction:z",
        damageTypes: ["slashing", "bludgeoning"],
        amount: 2,
        trigger: "attack",
      },
      {
        id: "reduction:a",
        damageTypes: ["piercing"],
        amount: 1,
        trigger: "attack",
      },
    ],
    saveDamageRules: [
      {
        id: "save:z",
        ability: "DEX",
        requiresDamageOnSuccess: "half",
        onSuccess: "none",
        onFailure: "half",
      },
      {
        id: "save:a",
        ability: "CON",
        requiresDamageOnSuccess: "half",
        onSuccess: "none",
        onFailure: "half",
      },
    ],
  };
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function orderedReads(reads: ReadonlyArray<AtomicRead>): AtomicRead[] {
  return [...reads].sort((left, right) =>
    compare(
      atomicAddressKey(left.owner, left.address),
      atomicAddressKey(right.owner, right.address)
    )
  );
}

function readSet(): CombatEffectAtomicReadSet {
  const canonicalDefenses = canonicalizeDamageDefenses(defenses());
  return {
    schema: 1,
    bindings: [{ ref: { kind: "source", id: owner.combatantId }, owner }],
    reads: orderedReads([
      {
        owner,
        address: {
          kind: "document-revision",
          document: atomicDocumentForOwner(owner),
        },
        expected: 7,
      },
      {
        owner,
        address: { kind: "base-state" },
        expected: {
          hp: 18,
          tempHp: 3,
          stable: false,
          deathSaves: { successes: 1, failures: 0 },
          conditions: ["frightened", "poisoned"],
          conditionLifetimes: {
            poisoned: null,
            frightened: { kind: "phase-end", phaseId: "resolve" },
          },
          standing: ["aura", "ward"],
          standingLifetimes: {
            ward: { kind: "manual" },
            aura: { kind: "source-end" },
          },
          resources: { "ward-use": 1 },
          stateFlags: { "ward-active": true },
        },
      },
      { owner, address: { kind: "max-hp" }, expected: 24 },
      { owner, address: { kind: "damage-defenses" }, expected: canonicalDefenses },
      {
        owner,
        address: { kind: "resource", programResourceId: "ward-use" },
        expected: {
          present: true,
          binding: { kind: "tracker", trackerId: "ward-tracker" },
          current: 1,
          capacity: 3,
          enabled: true,
        },
      },
      {
        owner,
        address: { kind: "state-flag", stateKey: "ward-active" },
        expected: {
          binding: { kind: "active-feature", activeKey: "ward-active" },
          active: true,
        },
      },
      {
        owner,
        address: { kind: "zero-hp-floors" },
        expected: [{ stateKey: "ward-active", hitPoints: 1 }],
      },
      {
        owner,
        address: { kind: "occurrence-heads" },
        expected: [
          {
            effectId: "effect:one",
            headOpId: "operation:head",
            active: true,
            terminal: false,
            effect: completeEffect(),
          },
        ],
      },
      {
        owner,
        address: {
          kind: "lifecycle-head",
          occurrenceId: "occurrence:one",
          programId: "program:ward",
          sourceId: owner.combatantId,
        },
        expected: { present: false },
      },
    ]),
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function first<T>(values: ReadonlyArray<T>): T {
  const value = values[0];
  if (value === undefined) throw new TypeError("Empty fixture");
  return value;
}

type AtomicReadAt<Kind extends AtomicAddress["kind"]> = Extract<
  AtomicRead,
  { address: { kind: Kind } }
>;

function readByKind<Kind extends AtomicAddress["kind"]>(
  value: CombatEffectAtomicReadSet,
  kind: Kind
): AtomicReadAt<Kind> {
  const read = value.reads.find((candidate) => candidate.address.kind === kind);
  if (!read) throw new TypeError(`Missing ${kind} fixture`);
  return read as AtomicReadAt<Kind>;
}

describe("combat-effect atomic read set", () => {
  it("builds collision-safe deterministic owner and logical-address keys", () => {
    const sharedMonster: AtomicOwner = {
      kind: "monster",
      surface: "shared",
      campaignId: "campaign|1:alpha",
      encounterEpoch: 8,
      combatantId: "monster:one",
    };
    const nextMonster = {
      ...sharedMonster,
      combatantId: "monster:two",
    } satisfies AtomicOwner;

    expect(atomicOwnerKey(sharedMonster)).toBe(atomicOwnerKey(clone(sharedMonster)));
    expect(atomicOwnerKey(sharedMonster)).not.toBe(atomicOwnerKey(nextMonster));
    const sharedPc: AtomicOwner = {
      kind: "pc",
      surface: "shared",
      campaignId: "campaign|1:alpha",
      encounterEpoch: 8,
      combatantId: "pc:user:one",
      memberUid: owner.uid,
      characterId: owner.characterId,
    };
    expect(atomicOwnerKey(sharedPc)).toBe(atomicOwnerKey(owner));
    expect(atomicOwnerScopeKey(sharedPc)).not.toBe(atomicOwnerScopeKey(owner));
    expect(atomicDocumentKey(atomicDocumentForOwner(sharedPc))).toBe(
      atomicDocumentKey(atomicDocumentForOwner(owner))
    );
    expect(atomicDocumentKey(atomicDocumentForOwner(sharedMonster))).toBe(
      atomicDocumentKey(atomicDocumentForOwner(nextMonster))
    );
    expect(atomicDocumentKey(atomicLedgerForOwner(sharedPc))).toBe(
      atomicDocumentKey(atomicLedgerForOwner(sharedMonster))
    );
    expect(
      atomicAddressKey(owner, { kind: "resource", programResourceId: "a|1:b" })
    ).not.toBe(
      atomicAddressKey(owner, {
        kind: "lifecycle-head",
        occurrenceId: "a",
        programId: "b",
        sourceId: "c",
      })
    );
    expect(() =>
      atomicOwnerKey({ ...owner, future: true } as unknown as AtomicOwner)
    ).toThrow(TypeError);
  });

  it("rejects bindings that span execution scopes even when owners are valid", () => {
    const candidate = readSet();
    const foreignOwner: AtomicOwner = {
      kind: "pc",
      surface: "shared",
      campaignId: "campaign:other",
      encounterEpoch: 1,
      combatantId: "pc:other",
      memberUid: "user:other",
      characterId: "character:other",
    };
    candidate.bindings = [
      ...candidate.bindings,
      {
        ref: { kind: "target", target: { combatantId: "pc:other" } },
        owner: foreignOwner,
      },
    ];
    expect(conformCombatEffectAtomicReadSet(candidate)).toBeNull();
  });

  it("canonicalizes defense Sets and unordered rule arrays into frozen JSON facts", () => {
    const result = canonicalizeDamageDefenses(defenses());

    expect(result).toEqual({
      allDamageResistance: true,
      resistances: ["acid", "fire"],
      immunities: ["cold", "poison"],
      vulnerabilities: ["radiant", "thunder"],
      sourceResistances: ["spell"],
      flatReductions: [
        {
          id: "reduction:a",
          damageTypes: ["piercing"],
          amount: 1,
          trigger: "attack",
        },
        {
          id: "reduction:z",
          damageTypes: ["bludgeoning", "slashing"],
          amount: 2,
          trigger: "attack",
        },
      ],
      saveDamageRules: [
        {
          id: "save:a",
          ability: "CON",
          requiresDamageOnSuccess: "half",
          onSuccess: "none",
          onFailure: "half",
        },
        {
          id: "save:z",
          ability: "DEX",
          requiresDamageOnSuccess: "half",
          onSuccess: "none",
          onFailure: "half",
        },
      ],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.flatReductions[0]?.damageTypes)).toBe(true);
    const materialized = materializeDamageDefenses(result);
    expect(materialized?.resistances).toEqual(new Set(["acid", "fire"]));
    expect(materialized?.flatReductions).toEqual(result.flatReductions);
    expect(materialized?.resistances).not.toBe(defenses().resistances);

    const duplicate = defenses();
    const reduction = first(duplicate.flatReductions);
    duplicate.flatReductions = [reduction, reduction];
    expect(() => canonicalizeDamageDefenses(duplicate)).toThrow(/unique/);
  });

  it("guards and canonicalizes the complete occurrence rule identity", () => {
    const effect = completeEffect();
    const conformed = conformAtomicOccurrenceRuleIdentity(effect);

    expect(isAtomicOccurrenceRuleIdentity(effect)).toBe(true);
    expect(conformed).toEqual(effect);
    expect(Object.isFrozen(conformed)).toBe(true);
    expect(Object.isFrozen(conformed?.programOwner)).toBe(true);

    const changedCastLevel = clone(effect);
    changedCastLevel.source.castLevel = 5;
    expect(
      JSON.stringify(conformAtomicOccurrenceRuleIdentity(changedCastLevel))
    ).not.toBe(JSON.stringify(conformed));

    const extraNested = clone(effect) as ActiveCombatEffect & {
      source: ActiveCombatEffect["source"] & { future: boolean };
    };
    extraNested.source.future = true;
    expect(isAtomicOccurrenceRuleIdentity(extraNested)).toBe(false);
    expect(conformAtomicOccurrenceRuleIdentity(extraNested)).toBeNull();

    const getter = vi.fn(() => 5);
    const accessor = clone(effect);
    Object.defineProperty(accessor.source, "castLevel", {
      enumerable: true,
      get: getter,
    });
    expect(isAtomicOccurrenceRuleIdentity(accessor)).toBe(false);
    expect(getter).not.toHaveBeenCalled();

    const invalidCondition = clone(effect);
    invalidCondition.payload = { kind: "condition", conditionId: "made-up" };
    expect(isAtomicOccurrenceRuleIdentity(invalidCondition)).toBe(false);

    const ownedGrant = clone(effect);
    ownedGrant.payload = { kind: "grant-group", activeKey: "ward" };
    expect(isAtomicOccurrenceRuleIdentity(ownedGrant)).toBe(false);
  });

  it("conforms, freezes and byte-stably serializes the complete read set", () => {
    const candidate = readSet();
    const conformed = conformCombatEffectAtomicReadSet(candidate);

    expect(conformed).not.toBeNull();
    expect(Object.isFrozen(conformed)).toBe(true);
    expect(Object.isFrozen(conformed?.reads)).toBe(true);
    expect(Object.isFrozen(conformed?.reads[0])).toBe(true);
    const serialized = serializeCombatEffectAtomicReadSet(candidate);
    expect(serializeCombatEffectAtomicReadSet(JSON.parse(serialized))).toBe(serialized);
  });

  it("rejects non-canonical ordering, duplicate addresses and incomplete owner facts", () => {
    const reversed = readSet();
    reversed.reads = [...reversed.reads].reverse();
    expect(conformCombatEffectAtomicReadSet(reversed)).toBeNull();

    const duplicateAddress = readSet();
    duplicateAddress.reads = orderedReads([
      ...duplicateAddress.reads,
      clone(first(duplicateAddress.reads)),
    ]);
    expect(conformCombatEffectAtomicReadSet(duplicateAddress)).toBeNull();

    const noRevision = readSet();
    noRevision.reads = noRevision.reads.filter(
      (read) => read.address.kind !== "document-revision"
    );
    expect(conformCombatEffectAtomicReadSet(noRevision)).toBeNull();

    const noMaximum = readSet();
    noMaximum.reads = noMaximum.reads.filter((read) => read.address.kind !== "max-hp");
    expect(conformCombatEffectAtomicReadSet(noMaximum)).toBeNull();

    for (const kind of [
      "base-state",
      "damage-defenses",
      "zero-hp-floors",
      "occurrence-heads",
    ] as const) {
      const incomplete = readSet();
      incomplete.reads = incomplete.reads.filter((read) => read.address.kind !== kind);
      expect(conformCombatEffectAtomicReadSet(incomplete)).toBeNull();
    }

    const noLifecycle = readSet();
    noLifecycle.reads = noLifecycle.reads.filter(
      (read) => read.address.kind !== "lifecycle-head"
    );
    expect(conformCombatEffectAtomicReadSet(noLifecycle)).toBeNull();

    const duplicateBinding = readSet();
    const binding = first(duplicateBinding.bindings);
    duplicateBinding.bindings = [binding, clone(binding)];
    expect(conformCombatEffectAtomicReadSet(duplicateBinding)).toBeNull();
  });

  it("rejects unsorted set-like facts, missing floor flags and wrong occurrence owners", () => {
    const unsortedDefenses = clone(readSet());
    const defenseRead = readByKind(unsortedDefenses, "damage-defenses");
    defenseRead.expected.resistances = ["fire", "acid"];
    expect(conformCombatEffectAtomicReadSet(unsortedDefenses)).toBeNull();

    const noFlag = readSet();
    noFlag.reads = noFlag.reads.filter((read) => read.address.kind !== "state-flag");
    expect(conformCombatEffectAtomicReadSet(noFlag)).toBeNull();

    const relabeledFlag = readSet();
    const flagRead = readByKind(relabeledFlag, "state-flag");
    flagRead.expected.binding.activeKey = "another-flag";
    expect(conformCombatEffectAtomicReadSet(relabeledFlag)).toBeNull();

    const wrongTarget = readSet();
    const occurrenceRead = readByKind(wrongTarget, "occurrence-heads");
    first(occurrenceRead.expected).effect.target.combatantId = "someone-else";
    expect(conformCombatEffectAtomicReadSet(wrongTarget)).toBeNull();
  });

  it("requires item binding revisions while forbidding them on other resource kinds", () => {
    const item = readSet();
    const itemRead = readByKind(item, "resource");
    itemRead.expected = {
      present: true,
      binding: {
        kind: "item-resource",
        itemId: "wand",
        instanceId: "wand:one",
        resourceId: "charges",
      },
      current: 2,
      capacity: 7,
      enabled: true,
      bindingRevision: 3,
    };
    const itemBase = readByKind(item, "base-state");
    itemBase.expected = {
      ...itemBase.expected,
      resources: { ...itemBase.expected.resources, "ward-use": 2 },
    };
    expect(conformCombatEffectAtomicReadSet(item)).not.toBeNull();

    const missingRevision = clone(item);
    const missingRead = readByKind(missingRevision, "resource");
    delete (missingRead.expected as unknown as Record<string, unknown>).bindingRevision;
    expect(conformCombatEffectAtomicReadSet(missingRevision)).toBeNull();

    const trackerRevision = readSet();
    const trackerRead = readByKind(trackerRevision, "resource");
    (trackerRead.expected as unknown as Record<string, unknown>).bindingRevision = 1;
    expect(conformCombatEffectAtomicReadSet(trackerRevision)).toBeNull();
  });

  it("maps logical resource ids one-to-one onto explicit physical bindings", () => {
    const duplicatePhysical = readSet();
    const base = readByKind(duplicatePhysical, "base-state");
    base.expected = {
      ...base.expected,
      resources: { ...base.expected.resources, "second-use": 1 },
    };
    const firstResource = readByKind(duplicatePhysical, "resource");
    duplicatePhysical.reads = orderedReads([
      ...duplicatePhysical.reads,
      {
        owner,
        address: { kind: "resource", programResourceId: "second-use" },
        expected: clone(firstResource.expected),
      },
    ]);
    expect(conformCombatEffectAtomicReadSet(duplicatePhysical)).toBeNull();
  });

  it("distinguishes an absent lifecycle from an existing fully-undone runtime", () => {
    const absent = readSet();
    const existing = readSet();
    const lifecycleRead = readByKind(existing, "lifecycle-head");
    lifecycleRead.expected = {
      present: true,
      headCommandId: null,
      cursor: {
        tallies: [{ id: "charge", value: 0 }],
        layerStates: [{ id: "shell", state: "active" }],
        areaStates: ["difficult-terrain", "obscured"],
        ended: false,
        phases: [{ phaseId: "resolve", nextOccurrence: 1 }],
      },
    };

    expect(conformCombatEffectAtomicReadSet(absent)).not.toBeNull();
    expect(conformCombatEffectAtomicReadSet(existing)).not.toBeNull();
    expect(serializeCombatEffectAtomicReadSet(existing)).not.toBe(
      serializeCombatEffectAtomicReadSet(absent)
    );

    const malformed = clone(existing);
    const malformedRead = readByKind(malformed, "lifecycle-head");
    if (!malformedRead.expected.present) {
      throw new TypeError("fixture");
    }
    first(malformedRead.expected.cursor.phases).nextOccurrence = 0;
    expect(conformCombatEffectAtomicReadSet(malformed)).toBeNull();
  });

  it("rejects accessor-bearing JSON without invoking it and rejects unknown fields", () => {
    const getter = vi.fn(() => 7);
    const accessor = readSet();
    const revision = readByKind(accessor, "document-revision");
    Object.defineProperty(revision, "expected", { enumerable: true, get: getter });

    expect(conformCombatEffectAtomicReadSet(accessor)).toBeNull();
    expect(getter).not.toHaveBeenCalled();

    const future = readSet() as CombatEffectAtomicReadSet & { future: boolean };
    future.future = true;
    expect(conformCombatEffectAtomicReadSet(future)).toBeNull();
    expect(() => serializeCombatEffectAtomicReadSet(future)).toThrow(TypeError);
  });
});
