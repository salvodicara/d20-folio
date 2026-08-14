import { describe, expect, it } from "vitest";

import type { CombatEffectLifetime } from "@/data/types";
import {
  atomicAddressKey,
  atomicDocumentForOwner,
  atomicDocumentKey,
  atomicEntityBindingKey,
  atomicLedgerForOwner,
  atomicOwnerKey,
  conformCombatEffectAtomicReadSet,
  type AtomicAddress,
  type AtomicEntityBinding,
  type AtomicLifecycleHead,
  type AtomicOccurrenceHead,
  type AtomicOwner,
  type AtomicRead,
  type AtomicResourceSnapshot,
  type CombatEffectAtomicReadSet,
  type SerializableDamageDefenses,
} from "@/lib/combat-effect-atomic";
import {
  commitCombatEffectPlan,
  materializeCombatEffectCommandBatch,
  prepareCombatEffectCommand,
  redoCombatEffectCommand,
  serializeCombatEffectCommandReceipt,
  undoCombatEffectCommand,
  type CombatEffectCommandAdapter,
  type CombatEffectCommandBatch,
  type CombatEffectJson,
} from "@/lib/combat-effect-command";
import {
  reduceCombatEffectLifecycle,
  type CombatEffectLifecycleRuntime,
} from "@/lib/combat-effect-lifecycle";
import type {
  CombatEffectEntityRef,
  CombatEffectMutationReceipt,
  CombatEffectOccurrenceChange,
  CombatEffectPlan,
  CombatEffectStateView,
} from "@/lib/combat-effect-program";
import {
  combatEffectOccurrenceFingerprint,
  combatEffectOccurrenceId,
  combatEffectOccurrenceInitialHeadId,
} from "@/lib/combat-effect-program";
import type { ActiveCombatEffect } from "@/types/combat-effect";

function state(overrides: Partial<CombatEffectStateView> = {}): CombatEffectStateView {
  return {
    hp: 10,
    maxHp: 10,
    tempHp: 0,
    stable: false,
    deathSaves: { successes: 0, failures: 0 },
    conditions: [],
    conditionLifetimes: {},
    standing: [],
    standingLifetimes: {},
    resources: {},
    stateFlags: {},
    ...overrides,
  };
}

const target = { kind: "target", target: { combatantId: "enemy:one" } } as const;
const source = { kind: "source", id: "hero:one" } as const;

const NO_DEFENSES: SerializableDamageDefenses = {
  allDamageResistance: false,
  resistances: [],
  immunities: [],
  vulnerabilities: [],
  sourceResistances: [],
  flatReductions: [],
  saveDamageRules: [],
};

function wardingBondEffect(id = "warding-bond:one"): ActiveCombatEffect {
  return {
    id,
    actor: {
      kind: "pc",
      combatantId: source.id,
      memberUid: "hero-user",
      characterId: "hero-character",
    },
    target: { kind: "monster", combatantId: target.target.combatantId },
    source: { kind: "spell", id: "warding-bond", actionId: "spell-warding-bond" },
    payload: { kind: "grant-group", activeKey: "spell-warding-bond" },
    duration: { kind: "encounter" },
  };
}

function provenance(stepId: string, instance: number | null = 0) {
  return {
    occurrenceId: "cast:one",
    programId: "spell:test",
    phaseId: "resolve",
    stepId,
    target: target.target,
    instance,
    iteration: 0,
  } as const;
}

function programMaterialization(
  effectId: string,
  stepId: string,
  payload: ActiveCombatEffect["payload"],
  duration: ActiveCombatEffect["duration"],
  authoredLifetime?: CombatEffectLifetime
): ActiveCombatEffect {
  const sourceOwner = fixtureOwner(source, "local");
  const targetOwner = fixtureOwner(target, "local");
  if (
    sourceOwner.kind !== "pc" ||
    sourceOwner.surface !== "local" ||
    targetOwner.kind !== "pc" ||
    targetOwner.surface !== "local"
  ) {
    throw new TypeError("Expected local PC fixture owners");
  }
  return {
    id: effectId,
    actor: {
      kind: "pc",
      combatantId: sourceOwner.combatantId,
      memberUid: sourceOwner.uid,
      characterId: sourceOwner.characterId,
    },
    target: {
      kind: "pc",
      combatantId: targetOwner.combatantId,
      memberUid: targetOwner.uid,
      characterId: targetOwner.characterId,
    },
    source: { kind: "spell", id: "spell:test", actionId: "spell:test" },
    payload,
    programOwner: {
      occurrenceId: provenance(stepId).occurrenceId,
      programId: provenance(stepId).programId,
      phaseId: provenance(stepId).phaseId,
      stepId,
      operationId: combatEffectOccurrenceInitialHeadId(effectId),
      instance: provenance(stepId).instance,
      iteration: provenance(stepId).iteration,
    },
    ...(authoredLifetime === undefined ? {} : { authoredLifetime }),
    duration,
  };
}

function damage(
  stepId: string,
  before: CombatEffectStateView,
  after: CombatEffectStateView,
  options: { instance?: number; critical?: boolean; packetId?: string } = {}
): Extract<CombatEffectMutationReceipt, { kind: "damage" }> {
  const amount = before.hp + before.tempHp - after.hp - after.tempHp;
  return {
    kind: "damage",
    packetId: options.packetId ?? stepId,
    components: [
      {
        stepId,
        amount,
        damageType: "fire",
        resolution: options.critical
          ? {
              kind: "gate",
              gateId: "attack",
              gateKind: "attack",
              result: "critical-hit",
              disposition: "full",
              criticalHit: true,
            }
          : { kind: "unconditional", disposition: "full", criticalHit: false },
      },
    ],
    defenseGroups: [{ damageType: "fire", amount, componentStepIds: [stepId] }],
    provenance: provenance(stepId, options.instance ?? 0),
    recipient: target,
    before,
    after,
    appliedAmount: amount,
    appliedComponents: [{ stepId, appliedAmount: amount }],
  };
}

function fixtureCommandId(
  value: Pick<
    CombatEffectPlan,
    "occurrenceId" | "programId" | "phaseId" | "sourceId" | "occurrence"
  >,
  attempt = 0
): string {
  return [
    value.occurrenceId,
    value.programId,
    value.phaseId,
    value.sourceId,
    String(value.occurrence),
    String(attempt),
  ]
    .map((part) => `${part.length}:${part}`)
    .join("|");
}

function fixtureOwner(
  ref: Readonly<CombatEffectEntityRef>,
  surface: "local" | "shared"
): AtomicOwner {
  const combatantId = ref.kind === "source" ? ref.id : ref.target.combatantId;
  if (surface === "local") {
    return {
      kind: "pc",
      surface,
      uid: "fixture:user",
      characterId: `${combatantId}:character`,
      combatantId,
    };
  }
  return ref.kind === "source"
    ? {
        kind: "pc",
        surface,
        campaignId: "campaign:fixture",
        encounterEpoch: 1,
        combatantId,
        memberUid: `${combatantId}:user`,
        characterId: `${combatantId}:character`,
      }
    : {
        kind: "monster",
        surface,
        campaignId: "campaign:fixture",
        encounterEpoch: 1,
        combatantId,
      };
}

function initialStateFor(
  ref: Readonly<CombatEffectEntityRef>,
  consequences: ReadonlyArray<CombatEffectPlan["consequences"][number]>
): CombatEffectStateView {
  const receipt = consequences.find(
    (consequence): consequence is CombatEffectMutationReceipt =>
      consequence.kind !== "counter" &&
      consequence.kind !== "end-program" &&
      same(consequence.recipient, ref)
  );
  return clone(receipt?.before ?? state());
}

function atomicBaseState(value: Readonly<CombatEffectStateView>) {
  return {
    hp: value.hp,
    tempHp: value.tempHp,
    stable: value.stable,
    deathSaves: value.deathSaves,
    conditions: [...value.conditions].sort(),
    conditionLifetimes: value.conditionLifetimes,
    standing: [...value.standing].sort(),
    standingLifetimes: value.standingLifetimes,
    resources: Object.fromEntries(
      Object.entries(value.resources).sort(([left], [right]) => left.localeCompare(right))
    ),
    stateFlags: Object.fromEntries(
      Object.entries(value.stateFlags).sort(([left], [right]) =>
        left.localeCompare(right)
      )
    ),
  };
}

function resourceSnapshot(resourceId: string, current: number): AtomicResourceSnapshot {
  return {
    present: true,
    binding: { kind: "tracker", trackerId: `${resourceId}:tracker` },
    current,
    capacity: Math.max(current, 3),
    enabled: true,
  };
}

function lifecycleHead(value: Omit<CombatEffectPlan, "readSet">): AtomicLifecycleHead {
  if (value.occurrence === 0) return { present: false };
  return {
    present: true,
    headCommandId: fixtureCommandId({ ...value, occurrence: value.occurrence - 1 }),
    cursor: {
      tallies: Object.entries(value.initialTallies)
        .map(([id, tally]) => ({ id, value: tally }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      layerStates: Object.entries(value.initialLayerStates ?? {})
        .map(([id, layerState]) => ({ id, state: layerState }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      areaStates: [...(value.initialAreaStates ?? [])].sort(),
      ended: false,
      phases: [{ phaseId: value.phaseId, nextOccurrence: value.occurrence }],
    },
  };
}

function occurrenceHeads(
  ref: Readonly<CombatEffectEntityRef>,
  consequences: ReadonlyArray<CombatEffectPlan["consequences"][number]>
): AtomicOccurrenceHead[] {
  const heads = new Map<string, AtomicOccurrenceHead>();
  for (const consequence of consequences) {
    const generated =
      consequence.kind === "resolved-damage" || consequence.kind === "state-flag"
        ? consequence.generatedBy.source
        : undefined;
    if (generated?.kind !== "effect-occurrence" || !same(generated.recipient, ref)) {
      continue;
    }
    heads.set(generated.effect.id, {
      effectId: generated.effect.id,
      headOpId: generated.expectedHeadOpId,
      active: generated.expectedActive,
      terminal: false,
      effect: clone(generated.effect),
    });
  }
  return [...heads.values()].sort((left, right) =>
    left.effectId.localeCompare(right.effectId)
  );
}

interface ReadSetSurfaces {
  source?: "local" | "shared";
  target?: "local" | "shared";
}

function atomicReadSet(
  value: Omit<CombatEffectPlan, "readSet">,
  surfaces: ReadSetSurfaces = {}
): CombatEffectAtomicReadSet {
  const refs: ReadonlyArray<CombatEffectEntityRef> = [
    { kind: "source", id: value.sourceId },
    target,
  ];
  const bindings: AtomicEntityBinding[] = refs.map((ref) => ({
    ref,
    owner: fixtureOwner(
      ref,
      ref.kind === "source" ? (surfaces.source ?? "local") : (surfaces.target ?? "local")
    ),
  }));
  const reads: AtomicRead[] = [];
  const documents = new Map<
    string,
    { owner: AtomicOwner; document: ReturnType<typeof atomicDocumentForOwner> }
  >();
  for (const { owner } of bindings) {
    for (const document of [atomicDocumentForOwner(owner), atomicLedgerForOwner(owner)]) {
      documents.set(atomicDocumentKey(document), { owner, document });
    }
  }
  for (const { owner, document } of documents.values()) {
    reads.push({
      owner,
      address: { kind: "document-revision", document },
      expected: value.occurrence,
    });
  }
  for (const binding of bindings) {
    const initial = initialStateFor(binding.ref, value.consequences);
    reads.push(
      {
        owner: binding.owner,
        address: { kind: "base-state" },
        expected: atomicBaseState(initial),
      },
      { owner: binding.owner, address: { kind: "max-hp" }, expected: initial.maxHp },
      {
        owner: binding.owner,
        address: { kind: "damage-defenses" },
        expected: NO_DEFENSES,
      },
      {
        owner: binding.owner,
        address: { kind: "zero-hp-floors" },
        expected: Object.entries(initial.stateFlags)
          .filter(([, active]) => active)
          .map(([stateKey]) => ({ stateKey, hitPoints: 1 }))
          .sort((left, right) => left.stateKey.localeCompare(right.stateKey)),
      },
      {
        owner: binding.owner,
        address: { kind: "occurrence-heads" },
        expected: occurrenceHeads(binding.ref, value.consequences),
      }
    );
    for (const [resourceId, current] of Object.entries(initial.resources)) {
      reads.push({
        owner: binding.owner,
        address: { kind: "resource", programResourceId: resourceId },
        expected: resourceSnapshot(resourceId, current),
      });
    }
    for (const [stateKey, active] of Object.entries(initial.stateFlags)) {
      reads.push({
        owner: binding.owner,
        address: { kind: "state-flag", stateKey },
        expected: {
          binding: { kind: "active-feature", activeKey: stateKey },
          active,
        },
      });
    }
  }
  const sourceBinding = bindings.find((binding) => binding.ref.kind === "source");
  if (!sourceBinding) throw new TypeError("Missing source read-set fixture");
  reads.push({
    owner: sourceBinding.owner,
    address: {
      kind: "lifecycle-head",
      occurrenceId: value.occurrenceId,
      programId: value.programId,
      sourceId: value.sourceId,
    },
    expected: lifecycleHead(value),
  });
  bindings.sort((left, right) =>
    atomicEntityBindingKey(left).localeCompare(atomicEntityBindingKey(right))
  );
  reads.sort((left, right) =>
    atomicAddressKey(left.owner, left.address).localeCompare(
      atomicAddressKey(right.owner, right.address)
    )
  );
  const conformed = conformCombatEffectAtomicReadSet(
    { schema: 1, bindings, reads },
    {
      occurrenceId: value.occurrenceId,
      programId: value.programId,
      sourceId: value.sourceId,
    }
  );
  if (!conformed) throw new TypeError("Invalid command read-set fixture");
  return conformed;
}

function plan(
  consequences: ReadonlyArray<CombatEffectMutationReceipt>,
  overrides: Partial<CombatEffectPlan> = {},
  surfaces: ReadSetSurfaces = {}
): CombatEffectPlan {
  const { readSet: overriddenReadSet, ...planOverrides } = overrides;
  const candidate: Omit<CombatEffectPlan, "readSet"> = {
    schema: 1,
    occurrenceId: "cast:one",
    programId: "spell:test",
    phaseId: "resolve",
    sourceId: "hero:one",
    occurrence: 0,
    consequences,
    initialTallies: {},
    finalTallies: {},
    ended: false,
    ...planOverrides,
  };
  return {
    ...candidate,
    readSet: overriddenReadSet ?? atomicReadSet(candidate, surfaces),
  };
}

function refKey(ref: CombatEffectEntityRef): string {
  return ref.kind === "source" ? `source:${ref.id}` : `target:${ref.target.combatantId}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function fieldAt(stateValue: CombatEffectStateView, path: ReadonlyArray<string>) {
  if (path[0] === "resources" || path[0] === "stateFlags") {
    const id = path[1] as string;
    const collection = stateValue[path[0]];
    return Object.hasOwn(collection, id)
      ? { present: true, value: collection[id] as CombatEffectJson }
      : { present: false };
  }
  const field = path[0] as Exclude<
    keyof CombatEffectStateView,
    "maxHp" | "resources" | "stateFlags"
  >;
  return { present: true, value: stateValue[field] as CombatEffectJson };
}

function writeField(
  stateValue: CombatEffectStateView,
  path: ReadonlyArray<string>,
  value: { present: boolean; value?: CombatEffectJson }
): void {
  const mutable = stateValue as unknown as Record<string, unknown>;
  if (path[0] === "resources" || path[0] === "stateFlags") {
    const collection = mutable[path[0]] as Record<string, CombatEffectJson>;
    const id = path[1] as string;
    if (value.present) collection[id] = value.value as CombatEffectJson;
    else {
      mutable[path[0]] = Object.fromEntries(
        Object.entries(collection).filter(([entryId]) => entryId !== id)
      );
    }
    return;
  }
  mutable[path[0] as string] = clone(value.value);
}

function same(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : typeof value === "object" && value !== null
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
              .map(([key, entry]) => [key, canonical(entry)])
          )
        : value;
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

type OccurrenceFacts = Map<string, ReadonlyArray<AtomicOccurrenceHead>>;

interface OccurrenceReplayFacts {
  committed: OccurrenceFacts;
  undone?: OccurrenceFacts;
}

function copyOccurrenceFacts(value: Readonly<OccurrenceFacts>): OccurrenceFacts {
  return new Map([...value].map(([ownerId, heads]) => [ownerId, clone(heads)] as const));
}

function sameOccurrenceFacts(
  left: Readonly<OccurrenceFacts>,
  right: Readonly<OccurrenceFacts>
): boolean {
  return (
    left.size === right.size &&
    [...left].every(([ownerId, heads]) => same(heads, right.get(ownerId)))
  );
}

function effectCombatant(ref: Readonly<CombatEffectEntityRef>) {
  return ref.kind === "source"
    ? {
        kind: "pc" as const,
        combatantId: ref.id,
        memberUid: `${ref.id}:user`,
        characterId: `${ref.id}:character`,
      }
    : {
        kind: "monster" as const,
        combatantId: ref.target.combatantId,
      };
}

function occurrenceEffect(
  change: Readonly<CombatEffectOccurrenceChange>
): ActiveCombatEffect {
  if (!change.descriptor) throw new TypeError("Missing occurrence descriptor");
  const operationId = combatEffectOccurrenceInitialHeadId(change.effectId);
  return {
    id: change.effectId,
    actor: effectCombatant(source),
    target: effectCombatant(change.recipient),
    source: {
      kind: "feature",
      id: change.provenance.programId,
      actionId: change.provenance.programId,
    },
    payload:
      change.descriptor.kind === "condition"
        ? { kind: "condition", conditionId: change.descriptor.condition }
        : {
            kind: "program-standing",
            effectId: change.descriptor.effectId,
          },
    programOwner: {
      occurrenceId: change.provenance.occurrenceId,
      programId: change.provenance.programId,
      phaseId: change.provenance.phaseId,
      stepId: change.provenance.stepId,
      operationId,
      instance: change.provenance.instance,
      iteration: change.provenance.iteration,
    },
    ...(change.descriptor.lifetime === undefined
      ? {}
      : { authoredLifetime: clone(change.descriptor.lifetime) }),
    duration: { kind: "encounter" },
  };
}

class MemoryAdapter implements CombatEffectCommandAdapter {
  readonly causal = new Map<string, "available" | "committed" | "undone">();
  readonly states = new Map<string, CombatEffectStateView>();
  readonly batches: CombatEffectCommandBatch[] = [];
  readonly atomicFacts = new Map<string, unknown>();
  readonly lifecycleRuntimes = new Map<string, Readonly<CombatEffectLifecycleRuntime>>();
  readonly occurrenceReplay = new Map<string, OccurrenceReplayFacts>();
  readonly id: string;
  readonly surface: "local" | "shared";
  readonly accept: (ref: Readonly<CombatEffectEntityRef>) => boolean;
  failForward = false;

  constructor(
    id: string,
    surface: "local" | "shared",
    accept: (ref: Readonly<CombatEffectEntityRef>) => boolean
  ) {
    this.id = id;
    this.surface = surface;
    this.accept = accept;
  }

  accepts(ref: Readonly<CombatEffectEntityRef>): boolean {
    return this.accept(ref);
  }

  seed(ref: CombatEffectEntityRef, value: CombatEffectStateView): void {
    this.states.set(refKey(ref), clone(value));
  }

  read(ref: CombatEffectEntityRef): CombatEffectStateView {
    const value = this.states.get(refKey(ref));
    if (!value) throw new Error(`Missing ${refKey(ref)}`);
    return clone(value);
  }

  setAtomicFact(
    ref: Readonly<CombatEffectEntityRef>,
    address: Readonly<AtomicAddress>,
    expected: unknown
  ): void {
    const owner = fixtureOwner(ref, this.surface);
    this.atomicFacts.set(atomicAddressKey(owner, address), clone(expected));
  }

  occurrenceFacts(ref: Readonly<CombatEffectEntityRef>): AtomicOccurrenceHead[] {
    const owner = fixtureOwner(ref, this.surface);
    const value = this.atomicFacts.get(
      atomicAddressKey(owner, { kind: "occurrence-heads" })
    );
    if (!Array.isArray(value)) throw new TypeError("Missing occurrence-head fixture");
    return clone(value as AtomicOccurrenceHead[]);
  }

  lifecycleFact(
    occurrenceId: string,
    programId: string,
    sourceId: string
  ): AtomicLifecycleHead {
    const owner = fixtureOwner({ kind: "source", id: sourceId }, this.surface);
    const value = this.atomicFacts.get(
      atomicAddressKey(owner, {
        kind: "lifecycle-head",
        occurrenceId,
        programId,
        sourceId,
      })
    );
    if (value === undefined) throw new TypeError("Missing lifecycle-head fixture");
    return clone(value as AtomicLifecycleHead);
  }

  private stateForOwner(
    batch: Readonly<CombatEffectCommandBatch>,
    owner: Readonly<AtomicOwner>,
    states: ReadonlyMap<string, CombatEffectStateView> = this.states
  ): CombatEffectStateView | null {
    const ownerId = atomicOwnerKey(owner);
    const binding = batch.readSet.bindings.find(
      (candidate) =>
        atomicOwnerKey(candidate.owner) === ownerId && states.has(refKey(candidate.ref))
    );
    return binding ? (states.get(refKey(binding.ref)) ?? null) : null;
  }

  private currentFact(
    batch: Readonly<CombatEffectCommandBatch>,
    read: Readonly<AtomicRead>
  ): unknown {
    const key = atomicAddressKey(read.owner, read.address);
    const current = this.stateForOwner(batch, read.owner);
    switch (read.address.kind) {
      case "document-revision":
        return this.atomicFacts.get(key) ?? 0;
      case "base-state":
        return current ? atomicBaseState(current) : undefined;
      case "max-hp":
        return current?.maxHp;
      case "damage-defenses":
        return this.atomicFacts.get(key) ?? NO_DEFENSES;
      case "resource": {
        const explicit = this.atomicFacts.get(key) as AtomicResourceSnapshot | undefined;
        const currentValue = current?.resources[read.address.programResourceId];
        if (explicit?.present) {
          return currentValue === undefined
            ? { present: false }
            : { ...explicit, current: currentValue };
        }
        return currentValue === undefined
          ? { present: false }
          : resourceSnapshot(read.address.programResourceId, currentValue);
      }
      case "state-flag": {
        const explicit = this.atomicFacts.get(key) as
          | Extract<AtomicRead, { address: { kind: "state-flag" } }>["expected"]
          | undefined;
        return {
          binding:
            explicit?.binding ??
            ({
              kind: "active-feature",
              activeKey: read.address.stateKey,
            } as const),
          active: current?.stateFlags[read.address.stateKey] ?? false,
        };
      }
      case "zero-hp-floors":
        return (
          this.atomicFacts.get(key) ??
          Object.entries(current?.stateFlags ?? {})
            .filter(([, active]) => active)
            .map(([stateKey]) => ({ stateKey, hitPoints: 1 }))
            .sort((left, right) => left.stateKey.localeCompare(right.stateKey))
        );
      case "occurrence-heads":
      case "lifecycle-head":
        return this.atomicFacts.get(key);
    }
  }

  private initializeCausalFacts(readSet: Readonly<CombatEffectAtomicReadSet>): void {
    for (const read of readSet.reads) {
      if (
        (read.address.kind === "occurrence-heads" ||
          read.address.kind === "lifecycle-head") &&
        !this.atomicFacts.has(atomicAddressKey(read.owner, read.address))
      ) {
        this.atomicFacts.set(
          atomicAddressKey(read.owner, read.address),
          clone(read.expected)
        );
      }
    }
  }

  private readsMatch(batch: Readonly<CombatEffectCommandBatch>): boolean {
    return batch.readSet.reads.every((read) => {
      if (
        batch.readSetPolicy === "undo" ||
        (batch.readSetPolicy === "redo" &&
          (read.address.kind === "document-revision" ||
            read.address.kind === "occurrence-heads" ||
            read.address.kind === "lifecycle-head"))
      ) {
        return true;
      }
      return same(this.currentFact(batch, read), read.expected);
    });
  }

  private occurrenceFactsForBatch(
    batch: Readonly<CombatEffectCommandBatch>
  ): OccurrenceFacts {
    const result: OccurrenceFacts = new Map();
    for (const read of batch.readSet.reads) {
      if (read.address.kind !== "occurrence-heads") continue;
      const current = this.atomicFacts.get(atomicAddressKey(read.owner, read.address));
      result.set(
        atomicOwnerKey(read.owner),
        clone((current ?? []) as ReadonlyArray<AtomicOccurrenceHead>)
      );
    }
    return result;
  }

  private advanceOccurrenceFacts(
    batch: Readonly<CombatEffectCommandBatch>,
    current: Readonly<OccurrenceFacts>,
    operation: "commit" | "undo" | "redo"
  ): OccurrenceFacts {
    const next = copyOccurrenceFacts(current);
    for (const commandOperation of batch.operations) {
      for (const change of commandOperation.persistentConsequences?.occurrenceChanges ??
        []) {
        const binding = batch.readSet.bindings.find((candidate) =>
          same(candidate.ref, change.recipient)
        );
        if (!binding) throw new TypeError("Missing occurrence owner fixture");
        const ownerId = atomicOwnerKey(binding.owner);
        const heads = [...(next.get(ownerId) ?? [])];
        const index = heads.findIndex(({ effectId }) => effectId === change.effectId);
        const prior = index < 0 ? undefined : heads[index];
        const active = operation === "undo" ? change.expectedActive : change.active;
        const head: AtomicOccurrenceHead = {
          effectId: change.effectId,
          headOpId:
            operation === "commit" && prior === undefined
              ? combatEffectOccurrenceInitialHeadId(change.effectId)
              : `${operation}:${batch.commandId}:${change.effectId}`,
          active,
          terminal: false,
          effect: clone(prior?.effect ?? occurrenceEffect(change)),
        };
        if (index < 0) heads.push(head);
        else heads[index] = head;
        heads.sort((left, right) => left.effectId.localeCompare(right.effectId));
        next.set(ownerId, heads);
      }
    }
    return next;
  }

  private storeOccurrenceFacts(
    batch: Readonly<CombatEffectCommandBatch>,
    facts: Readonly<OccurrenceFacts>
  ): void {
    for (const read of batch.readSet.reads) {
      if (read.address.kind !== "occurrence-heads") continue;
      this.atomicFacts.set(
        atomicAddressKey(read.owner, read.address),
        clone(facts.get(atomicOwnerKey(read.owner)) ?? [])
      );
    }
  }

  private lifecycleRead(batch: Readonly<CombatEffectCommandBatch>) {
    return batch.readSet.reads.find(
      (read): read is Extract<AtomicRead, { address: { kind: "lifecycle-head" } }> =>
        read.address.kind === "lifecycle-head"
    );
  }

  private lifecycleIsCausal(batch: Readonly<CombatEffectCommandBatch>): boolean {
    const read = this.lifecycleRead(batch);
    if (!read) return false;
    const key = atomicAddressKey(read.owner, read.address);
    const runtime = this.lifecycleRuntimes.get(key);
    const expected: AtomicLifecycleHead = runtime
      ? {
          present: true,
          headCommandId: runtime.headCommandId,
          cursor: runtime.cursor,
        }
      : { present: false };
    return same(this.atomicFacts.get(key), expected);
  }

  private incrementRevisions(batch: Readonly<CombatEffectCommandBatch>): void {
    const revisions = new Map(
      batch.readSet.reads
        .filter(
          (
            read
          ): read is Extract<AtomicRead, { address: { kind: "document-revision" } }> =>
            read.address.kind === "document-revision"
        )
        .map((read) => [atomicAddressKey(read.owner, read.address), read] as const)
    );
    for (const [key] of revisions) {
      const current = this.atomicFacts.get(key);
      this.atomicFacts.set(key, (typeof current === "number" ? current : 0) + 1);
    }
  }

  compareAndSwap(batch: Readonly<CombatEffectCommandBatch>) {
    this.batches.push(clone(batch));
    const actual = this.causal.get(batch.commandId) ?? "available";
    if (actual !== batch.expectedCausalState) {
      return {
        status: "rejected" as const,
        reason: "causal-conflict" as const,
        actualCausalState: actual,
      };
    }
    if (this.failForward && batch.direction === "forward") {
      this.failForward = false;
      return { status: "rejected" as const, reason: "failed" as const };
    }
    this.initializeCausalFacts(batch.readSet);
    if (!this.readsMatch(batch) || !this.lifecycleIsCausal(batch)) {
      return { status: "rejected" as const, reason: "stale-state" as const };
    }
    const currentOccurrences = this.occurrenceFactsForBatch(batch);
    const replay = this.occurrenceReplay.get(batch.commandId);
    const expectedOccurrences =
      batch.readSetPolicy === "undo"
        ? replay?.committed
        : batch.readSetPolicy === "redo"
          ? replay?.undone
          : undefined;
    if (
      batch.readSetPolicy !== "initial" &&
      (!expectedOccurrences ||
        !sameOccurrenceFacts(currentOccurrences, expectedOccurrences))
    ) {
      return { status: "rejected" as const, reason: "stale-state" as const };
    }
    const working = new Map(
      [...this.states].map(([key, value]) => [key, clone(value)] as const)
    );
    for (const operation of batch.operations) {
      const current = working.get(refKey(operation.recipient));
      if (!current) return { status: "rejected" as const, reason: "failed" as const };
      for (const change of operation.changes) {
        const expected = batch.direction === "forward" ? change.expected : change.next;
        const next = batch.direction === "forward" ? change.next : change.expected;
        if (!same(fieldAt(current, change.path), expected)) {
          return { status: "rejected" as const, reason: "stale-state" as const };
        }
        writeField(current, change.path, next);
      }
    }
    const lifecycleRead = this.lifecycleRead(batch);
    if (!lifecycleRead) {
      return { status: "rejected" as const, reason: "failed" as const };
    }
    const lifecycleKey = atomicAddressKey(lifecycleRead.owner, lifecycleRead.address);
    const lifecycleResult = reduceCombatEffectLifecycle(
      this.lifecycleRuntimes.get(lifecycleKey) ?? null,
      batch
    );
    if (lifecycleResult.status !== "applied") {
      return { status: "rejected" as const, reason: "stale-state" as const };
    }
    const replayOperation =
      batch.readSetPolicy === "initial"
        ? "commit"
        : batch.readSetPolicy === "undo"
          ? "undo"
          : "redo";
    const nextOccurrences = this.advanceOccurrenceFacts(
      batch,
      currentOccurrences,
      replayOperation
    );
    this.states.clear();
    for (const [key, value] of working) this.states.set(key, value);
    this.storeOccurrenceFacts(batch, nextOccurrences);
    if (batch.readSetPolicy === "initial") {
      this.occurrenceReplay.set(batch.commandId, {
        committed: copyOccurrenceFacts(nextOccurrences),
      });
    } else if (batch.readSetPolicy === "undo" && replay) {
      replay.undone = copyOccurrenceFacts(nextOccurrences);
    } else if (replay) {
      replay.committed = copyOccurrenceFacts(nextOccurrences);
    }
    this.lifecycleRuntimes.set(lifecycleKey, lifecycleResult.runtime);
    this.atomicFacts.set(lifecycleKey, {
      present: true,
      headCommandId: lifecycleResult.runtime.headCommandId,
      cursor: lifecycleResult.runtime.cursor,
    } satisfies AtomicLifecycleHead);
    this.incrementRevisions(batch);
    this.causal.set(batch.commandId, batch.nextCausalState);
    return {
      status: "applied" as const,
      operationIds: batch.operations.map((operation) => operation.operationId),
    };
  }
}

function localAdapter(initial: CombatEffectStateView = state()) {
  const adapter = new MemoryAdapter("local-character", "local", () => true);
  adapter.seed(target, initial);
  adapter.seed(source, state());
  return adapter;
}

describe("combat effect command kernel", () => {
  it("rejects drafts and inert plans but preserves lifecycle-only commands", async () => {
    const adapter = localAdapter();
    await expect(
      commitCombatEffectPlan({ createDisposableDraft: () => ({}) }, [adapter])
    ).resolves.toEqual({ status: "rejected", reason: "invalid-plan" });
    await expect(
      commitCombatEffectPlan(
        {
          schema: 1,
          occurrenceId: "cast:one",
          programId: "spell:test",
          phaseId: "resolve",
          consequences: [
            {
              kind: "heal",
              amount: 1,
              provenance: provenance("heal"),
              recipient: target,
            },
          ],
          finalTallies: {},
          ended: false,
        },
        [adapter]
      )
    ).resolves.toEqual({ status: "rejected", reason: "invalid-plan" });
    expect(prepareCombatEffectCommand(plan([]), [adapter])).toEqual({
      status: "rejected",
      reason: "invalid-plan",
    });
    expect(
      prepareCombatEffectCommand(
        plan([], {
          consequences: [
            {
              kind: "end-program",
              provenance: provenance("end", null),
            },
          ],
          ended: true,
        }),
        [adapter]
      )
    ).toMatchObject({
      status: "prepared",
      receipt: {
        operations: [],
        ended: true,
      },
    });
  });

  it("rejects malformed adapter contracts and adapter results", async () => {
    const invalidSurface = {
      id: "invalid-surface",
      surface: "remote",
      accepts: () => true,
      compareAndSwap: () => ({ status: "applied", operationIds: [] }),
    } as unknown as CombatEffectCommandAdapter;
    expect(
      prepareCombatEffectCommand(plan([damage("impact", state(), state({ hp: 6 }))]), [
        invalidSurface,
      ])
    ).toEqual({ status: "rejected", reason: "invalid-adapter" });

    const malformedResult = {
      id: "malformed-result",
      surface: "local",
      accepts: () => true,
      compareAndSwap: () => ({ status: "applied", operationIds: "not-an-array" }),
    } as unknown as CombatEffectCommandAdapter;
    await expect(
      commitCombatEffectPlan(plan([damage("impact", state(), state({ hp: 6 }))]), [
        malformedResult,
      ])
    ).resolves.toMatchObject({ status: "rejected", reason: "adapter-failure" });
  });

  it("routes event-only phases through one lifecycle coordinator and replays them causally", async () => {
    const adapter = localAdapter();
    const layerProvenance = {
      ...provenance("destroy-red", null),
      target: null,
    };
    const effect = plan([], {
      initialLayerStates: { red: "active" },
      finalLayerStates: { red: "destroyed" },
      events: [
        {
          kind: "layer",
          provenance: layerProvenance,
          layerId: "red",
          stateKey: "red",
          before: "active",
          after: "destroyed",
        },
      ],
    });

    const committed = await commitCombatEffectPlan(effect, [adapter]);
    expect(committed.status).toBe("applied");
    if (committed.status !== "applied") return;
    expect(adapter.batches[0]).toMatchObject({
      coordinatesLifecycle: true,
      operations: [],
      lifecycle: {
        initialLayerStates: { red: "active" },
        finalLayerStates: { red: "destroyed" },
      },
    });

    await expect(undoCombatEffectCommand(committed.receipt, [adapter])).resolves.toEqual(
      committed
    );
    await expect(redoCombatEffectCommand(committed.receipt, [adapter])).resolves.toEqual(
      committed
    );
    expect(adapter.batches.map((batch) => batch.direction)).toEqual([
      "forward",
      "reverse",
      "forward",
    ]);
    expect(adapter.batches.map((batch) => batch.readSetPolicy)).toEqual([
      "initial",
      "undo",
      "redo",
    ]);
    expect(adapter.batches.every((batch) => batch.coordinatesLifecycle)).toBe(true);
    expect(
      adapter.batches[0]?.readSet.reads.find(
        (read) => read.address.kind === "lifecycle-head"
      )?.address
    ).toEqual({
      kind: "lifecycle-head",
      occurrenceId: "cast:one",
      programId: "spell:test",
      sourceId: "hero:one",
    });

    expect(
      prepareCombatEffectCommand(
        plan([], {
          initialLayerStates: { red: "active" },
          finalLayerStates: { red: "destroyed" },
          events: [],
        }),
        [adapter]
      )
    ).toEqual({ status: "rejected", reason: "invalid-plan" });
  });

  it("fences undo on the exact lifecycle head and cursor", async () => {
    const before = state();
    const adapter = localAdapter(before);
    const committed = await commitCombatEffectPlan(
      plan([damage("impact", before, state({ hp: 6 }))]),
      [adapter]
    );
    if (committed.status !== "applied") throw new Error("expected commit");
    const address = {
      kind: "lifecycle-head",
      occurrenceId: committed.receipt.occurrenceId,
      programId: committed.receipt.programId,
      sourceId: committed.receipt.sourceId,
    } as const;
    const live = adapter.lifecycleFact(
      committed.receipt.occurrenceId,
      committed.receipt.programId,
      committed.receipt.sourceId
    );
    if (!live.present) throw new TypeError("Expected a committed lifecycle head");

    adapter.setAtomicFact(source, address, {
      ...live,
      headCommandId: "peer-command",
    });
    await expect(
      undoCombatEffectCommand(committed.receipt, [adapter])
    ).resolves.toMatchObject({ status: "rejected", reason: "stale-state" });

    adapter.setAtomicFact(source, address, {
      ...live,
      cursor: { ...live.cursor, ended: true },
    });
    await expect(
      undoCombatEffectCommand(committed.receipt, [adapter])
    ).resolves.toMatchObject({ status: "rejected", reason: "stale-state" });

    adapter.setAtomicFact(source, address, live);
    await expect(
      undoCombatEffectCommand(committed.receipt, [adapter])
    ).resolves.toMatchObject({ status: "applied" });
  });

  it("fresh-CAS rejects stale commits and duplicate commits", async () => {
    const before = state();
    const effect = plan([damage("impact", before, state({ hp: 6 }))]);
    const stale = localAdapter(state({ hp: 9 }));
    await expect(commitCombatEffectPlan(effect, [stale])).resolves.toMatchObject({
      status: "rejected",
      reason: "stale-state",
    });

    const adapter = localAdapter(before);
    const first = await commitCombatEffectPlan(effect, [adapter]);
    expect(first.status).toBe("applied");
    await expect(commitCombatEffectPlan(effect, [adapter])).resolves.toMatchObject({
      status: "rejected",
      reason: "duplicate-command",
    });
    expect(adapter.read(target).hp).toBe(6);
  });

  it.each<[string, (adapter: MemoryAdapter) => void]>([
    [
      "document revision",
      (adapter) =>
        adapter.setAtomicFact(
          target,
          {
            kind: "document-revision",
            document: atomicDocumentForOwner(fixtureOwner(target, adapter.surface)),
          },
          1
        ),
    ],
    ["maximum HP", (adapter) => adapter.seed(target, state({ maxHp: 12 }))],
    [
      "damage defenses",
      (adapter) =>
        adapter.setAtomicFact(
          target,
          { kind: "damage-defenses" },
          {
            ...NO_DEFENSES,
            resistances: ["fire"],
          }
        ),
    ],
  ])("rejects a stale initial %s fact", async (_label, makeStale) => {
    const before = state();
    const adapter = localAdapter(before);
    makeStale(adapter);

    await expect(
      commitCombatEffectPlan(plan([damage("impact", before, state({ hp: 6 }))]), [
        adapter,
      ])
    ).resolves.toMatchObject({ status: "rejected", reason: "stale-state" });
  });

  it.each<[string, (snapshot: AtomicResourceSnapshot) => AtomicResourceSnapshot]>([
    [
      "capacity",
      (snapshot) => (snapshot.present ? { ...snapshot, capacity: 4 } : snapshot),
    ],
    [
      "binding",
      (snapshot) =>
        snapshot.present
          ? {
              ...snapshot,
              binding: { kind: "tracker", trackerId: "other:tracker" },
            }
          : snapshot,
    ],
    [
      "enabled state",
      (snapshot) => (snapshot.present ? { ...snapshot, enabled: false } : snapshot),
    ],
  ])("rejects stale resource %s", async (_label, alter) => {
    const before = state({ resources: { focus: 2 } });
    const after = state({ resources: { focus: 1 } });
    const spend: CombatEffectMutationReceipt = {
      kind: "resource",
      operation: "spend",
      resourceId: "focus",
      amount: 1,
      provenance: provenance("focus"),
      recipient: target,
      before,
      after,
      appliedAmount: 1,
    };
    const adapter = localAdapter(before);
    adapter.setAtomicFact(
      target,
      { kind: "resource", programResourceId: "focus" },
      alter(resourceSnapshot("focus", 2))
    );

    await expect(commitCombatEffectPlan(plan([spend]), [adapter])).resolves.toMatchObject(
      { status: "rejected", reason: "stale-state" }
    );
  });

  it.each<[string, (adapter: MemoryAdapter) => void]>([
    [
      "state-flag binding",
      (adapter) =>
        adapter.setAtomicFact(
          target,
          { kind: "state-flag", stateKey: "feature-ward" },
          {
            binding: { kind: "active-feature", activeKey: "feature-other" },
            active: true,
          }
        ),
    ],
    [
      "zero-HP floor",
      (adapter) =>
        adapter.setAtomicFact(target, { kind: "zero-hp-floors" }, [
          { stateKey: "feature-ward", hitPoints: 2 },
        ]),
    ],
  ])("rejects a stale %s", async (_label, makeStale) => {
    const before = state({ stateFlags: { "feature-ward": true } });
    const after = state({
      tempHp: 1,
      stateFlags: before.stateFlags,
    });
    const grantTemporaryHp: CombatEffectMutationReceipt = {
      kind: "temp-hp",
      amount: 1,
      provenance: provenance("ward"),
      recipient: target,
      before,
      after,
      appliedAmount: 1,
    };
    const adapter = localAdapter(before);
    const reviewed = plan([grantTemporaryHp]);
    makeStale(adapter);

    await expect(commitCombatEffectPlan(reviewed, [adapter])).resolves.toMatchObject({
      status: "rejected",
      reason: "stale-state",
    });
  });

  it("gives each repeating phase occurrence a distinct causal command", async () => {
    const before = state();
    const afterFirst = state({ hp: 8 });
    const afterSecond = state({ hp: 6 });
    const adapter = localAdapter(before);
    const first = await commitCombatEffectPlan(
      plan([damage("pulse", before, afterFirst)]),
      [adapter]
    );
    expect(first.status).toBe("applied");

    const secondDamage = damage("pulse", afterFirst, afterSecond);
    secondDamage.provenance = { ...secondDamage.provenance, iteration: 1 };
    const second = await commitCombatEffectPlan(plan([secondDamage], { occurrence: 1 }), [
      adapter,
    ]);
    expect(second.status).toBe("applied");
    if (first.status !== "applied" || second.status !== "applied") return;
    expect(first.receipt.commandId).not.toBe(second.receipt.commandId);
    expect(adapter.read(target).hp).toBe(6);
  });

  it("gives a corrected reviewed attempt a distinct id for the same occurrence", () => {
    const adapter = localAdapter();
    const effect = plan([damage("impact", state(), state({ hp: 6 }))]);
    const original = prepareCombatEffectCommand(effect, [adapter]);
    const corrected = prepareCombatEffectCommand(effect, [adapter], 1);

    expect(original.status).toBe("prepared");
    expect(corrected.status).toBe("prepared");
    if (original.status !== "prepared" || corrected.status !== "prepared") return;
    expect(original.receipt.attempt).toBe(0);
    expect(corrected.receipt.attempt).toBe(1);
    expect(corrected.receipt.commandId).not.toBe(original.receipt.commandId);
    expect(prepareCombatEffectCommand(effect, [adapter], -1)).toEqual({
      status: "rejected",
      reason: "invalid-plan",
    });
  });

  it("rejects a plan whose consequence provenance belongs to another occurrence", () => {
    expect(
      prepareCombatEffectCommand(
        plan([damage("pulse", state(), state({ hp: 8 }))], { occurrence: 1 }),
        [localAdapter()]
      )
    ).toEqual({ status: "rejected", reason: "invalid-plan" });
  });

  it("undo and redo are exact, causal, and reject stale owned state", async () => {
    const before = state();
    const adapter = localAdapter(before);
    const committed = await commitCombatEffectPlan(
      plan([damage("impact", before, state({ hp: 6 }))]),
      [adapter]
    );
    if (committed.status !== "applied") throw new Error("expected commit");

    const current = adapter.read(target);
    adapter.setAtomicFact(
      target,
      {
        kind: "document-revision",
        document: atomicDocumentForOwner(fixtureOwner(target, adapter.surface)),
      },
      41
    );
    adapter.seed(target, { ...current, hp: 5 });
    await expect(
      undoCombatEffectCommand(committed.receipt, [adapter])
    ).resolves.toMatchObject({ status: "rejected", reason: "stale-state" });
    adapter.seed(target, { ...current, hp: 6 });
    await expect(
      undoCombatEffectCommand(committed.receipt, [adapter])
    ).resolves.toMatchObject({ status: "applied" });
    expect(adapter.read(target).hp).toBe(10);
    await expect(
      undoCombatEffectCommand(committed.receipt, [adapter])
    ).resolves.toMatchObject({ status: "rejected", reason: "stale-command" });

    adapter.setAtomicFact(
      target,
      { kind: "damage-defenses" },
      {
        ...NO_DEFENSES,
        resistances: ["fire"],
      }
    );
    await expect(
      redoCombatEffectCommand(committed.receipt, [adapter])
    ).resolves.toMatchObject({ status: "rejected", reason: "stale-state" });
    adapter.setAtomicFact(target, { kind: "damage-defenses" }, NO_DEFENSES);
    adapter.seed(target, state({ hp: 9 }));
    await expect(
      redoCombatEffectCommand(committed.receipt, [adapter])
    ).resolves.toMatchObject({ status: "rejected", reason: "stale-state" });
    adapter.seed(target, before);
    await expect(
      redoCombatEffectCommand(committed.receipt, [adapter])
    ).resolves.toMatchObject({ status: "applied" });
    expect(adapter.read(target).hp).toBe(6);
  });

  it("materializes strict child batches for one outer atomic action", () => {
    const prepared = prepareCombatEffectCommand(
      plan([damage("impact", state(), state({ hp: 6 }))]),
      [localAdapter()]
    );
    if (prepared.status !== "prepared") throw new Error("expected prepared command");

    expect(
      (["initial", "undo", "redo"] as const).map((policy) => {
        const result = materializeCombatEffectCommandBatch(prepared.receipt, policy);
        if (result.status !== "prepared") throw new Error("expected child batch");
        return {
          policy: result.batch.readSetPolicy,
          direction: result.batch.direction,
          expected: result.batch.expectedCausalState,
          next: result.batch.nextCausalState,
          frozen: Object.isFrozen(result.batch),
        };
      })
    ).toEqual([
      {
        policy: "initial",
        direction: "forward",
        expected: "available",
        next: "committed",
        frozen: true,
      },
      {
        policy: "undo",
        direction: "reverse",
        expected: "committed",
        next: "undone",
        frozen: true,
      },
      {
        policy: "redo",
        direction: "forward",
        expected: "undone",
        next: "committed",
        frozen: true,
      },
    ]);
    expect(
      materializeCombatEffectCommandBatch(
        { ...prepared.receipt, payloadIdentity: "forged" },
        "initial"
      )
    ).toEqual({ status: "rejected", reason: "invalid-receipt" });
  });

  it("rejects a command split across adapters before any state can change", async () => {
    const local = new MemoryAdapter("local", "local", (ref) => ref.kind === "source");
    const targetOwner = new MemoryAdapter(
      "target-owner",
      "local",
      (ref) => ref.kind === "target"
    );
    local.seed(source, state({ hp: 5 }));
    targetOwner.seed(target, state());
    const selfHeal: CombatEffectMutationReceipt = {
      kind: "heal",
      amount: 3,
      provenance: { ...provenance("heal"), target: null, instance: null },
      recipient: source,
      before: state({ hp: 5 }),
      after: state({ hp: 8 }),
      appliedAmount: 3,
    };
    const hit = damage("hit", state(), state({ hp: 8 }));
    const result = await commitCombatEffectPlan(plan([selfHeal, hit]), [
      local,
      targetOwner,
    ]);
    expect(result).toEqual({ status: "rejected", reason: "split-transaction" });
    expect(local.read(source).hp).toBe(5);
    expect(targetOwner.read(target).hp).toBe(10);
    expect(local.batches).toEqual([]);
    expect(targetOwner.batches).toEqual([]);
  });

  it("preserves independent packet cardinality, critical and gate provenance", async () => {
    const firstAfter = state({ hp: 7 });
    const secondAfter = state({ hp: 3 });
    const adapter = localAdapter();
    const result = await commitCombatEffectPlan(
      plan([
        damage("beam", state(), firstAfter, { instance: 0, packetId: "beam-0" }),
        damage("beam", firstAfter, secondAfter, {
          instance: 1,
          critical: true,
          packetId: "beam-1",
        }),
      ]),
      [adapter]
    );
    if (result.status !== "applied") {
      throw new Error(`expected commit: ${JSON.stringify(result)}`);
    }
    expect(result.receipt.operations).toHaveLength(2);
    expect(result.receipt.operations.map((operation) => operation.mutation.kind)).toEqual(
      ["damage", "damage"]
    );
    const second = result.receipt.operations[1];
    expect(second?.provenance.instance).toBe(1);
    expect(second?.appliedComponents).toEqual([{ stepId: "beam", appliedAmount: 4 }]);
    expect(
      second?.mutation.kind === "damage"
        ? second.mutation.components[0]?.resolution
        : undefined
    ).toMatchObject({
      kind: "gate",
      result: "critical-hit",
      criticalHit: true,
    });
    expect(adapter.read(target).hp).toBe(3);
  });

  it("keeps capped healing and non-stacking temporary HP receipts exact", async () => {
    const before = state({ hp: 9, tempHp: 2 });
    const healed = state({ hp: 10, tempHp: 2 });
    const tempUnchanged = state({ hp: 10, tempHp: 2 });
    const heal: CombatEffectMutationReceipt = {
      kind: "heal",
      amount: 5,
      provenance: provenance("heal"),
      recipient: target,
      before,
      after: healed,
      appliedAmount: 1,
    };
    const temp: CombatEffectMutationReceipt = {
      kind: "temp-hp",
      amount: 1,
      provenance: provenance("ward"),
      recipient: target,
      before: healed,
      after: tempUnchanged,
      appliedAmount: 0,
    };
    const adapter = localAdapter(before);
    const result = await commitCombatEffectPlan(plan([heal, temp]), [adapter]);
    if (result.status !== "applied") throw new Error("expected commit");
    expect(result.receipt.operations.map((operation) => operation.appliedAmount)).toEqual(
      [1, 0]
    );
    expect(result.receipt.operations[1]?.changes).toEqual([]);
    expect(adapter.read(target)).toEqual(tempUnchanged);
  });

  it("commits and reverses generated transfer damage plus one exact state flag", async () => {
    const beforeTarget = state({ hp: 8, stateFlags: { "spell-death-ward": true } });
    const afterDamage = state({
      hp: 1,
      stateFlags: { "spell-death-ward": true },
    });
    const afterFlag = state({
      hp: 1,
      stateFlags: { "spell-death-ward": false },
    });
    const beforeSource = state({ hp: 20, maxHp: 20 });
    const afterTransfer = state({ hp: 10, maxHp: 20 });
    const consumeFlag: CombatEffectMutationReceipt = {
      kind: "state-flag",
      operation: "deactivate",
      stateKey: "spell-death-ward",
      provenance: provenance("fatal"),
      recipient: target,
      before: afterDamage,
      after: afterFlag,
      generatedBy: {
        parentConsequenceIndex: 0,
        source: {
          kind: "state-flag",
          recipient: target,
          stateKey: "spell-death-ward",
          expectedActive: true,
          hitPoints: 1,
        },
      },
    };
    const bond = wardingBondEffect();
    const transfer: CombatEffectMutationReceipt = {
      kind: "resolved-damage",
      amount: 10,
      sourceEffectId: "warding-bond:one",
      transferPath: ["warding-bond:one"],
      provenance: provenance("fatal"),
      recipient: source,
      before: beforeSource,
      after: afterTransfer,
      appliedAmount: 10,
      generatedBy: {
        parentConsequenceIndex: 0,
        source: {
          kind: "effect-occurrence",
          recipient: target,
          effect: bond,
          expectedHeadOpId: `apply:${bond.id}`,
          expectedActive: true,
        },
      },
    };
    const adapter = new MemoryAdapter("shared-character", "shared", () => true);
    adapter.seed(target, beforeTarget);
    adapter.seed(source, beforeSource);
    const fatalBase = damage("fatal", beforeTarget, afterDamage);
    const fatalComponent = fatalBase.components[0];
    const fatalDefenseGroup = fatalBase.defenseGroups[0];
    if (!fatalComponent || !fatalDefenseGroup) throw new Error("missing damage packet");
    const fatal: CombatEffectMutationReceipt = {
      ...fatalBase,
      components: [{ ...fatalComponent, amount: 20 }],
      defenseGroups: [{ ...fatalDefenseGroup, amount: 20 }],
      appliedAmount: 10,
      appliedComponents: [{ stepId: "fatal", appliedAmount: 10 }],
    };

    const result = await commitCombatEffectPlan(
      plan([fatal, consumeFlag, transfer], {}, { source: "shared", target: "shared" }),
      [adapter]
    );

    if (result.status !== "applied") {
      throw new Error(`expected commit: ${JSON.stringify(result)}`);
    }
    expect(result.receipt.operations.map(({ mutation }) => mutation.kind)).toEqual([
      "damage",
      "state-flag",
      "resolved-damage",
    ]);
    expect(result.receipt.operations[1]?.changes).toEqual([
      {
        path: ["stateFlags", "spell-death-ward"],
        expected: { present: true, value: true },
        next: { present: true, value: false },
      },
    ]);
    expect(adapter.read(target)).toEqual(afterFlag);
    expect(adapter.read(source)).toEqual(afterTransfer);

    const occurrenceAddress = { kind: "occurrence-heads" } as const;
    const liveOccurrences = adapter.occurrenceFacts(target);
    const liveBond = liveOccurrences[0];
    if (!liveBond) throw new TypeError("Expected a generated-source occurrence");
    adapter.setAtomicFact(target, occurrenceAddress, [
      { ...liveBond, headOpId: "peer-head" },
    ]);
    await expect(
      undoCombatEffectCommand(result.receipt, [adapter])
    ).resolves.toMatchObject({ status: "rejected", reason: "stale-state" });

    adapter.setAtomicFact(target, occurrenceAddress, [
      {
        ...liveBond,
        effect: {
          ...liveBond.effect,
          source: { ...liveBond.effect.source, actionId: "peer-action" },
        },
      },
    ]);
    await expect(
      undoCombatEffectCommand(result.receipt, [adapter])
    ).resolves.toMatchObject({ status: "rejected", reason: "stale-state" });

    adapter.setAtomicFact(target, occurrenceAddress, liveOccurrences);
    await expect(
      undoCombatEffectCommand(result.receipt, [adapter])
    ).resolves.toMatchObject({ status: "applied" });
    expect(adapter.read(target)).toEqual(beforeTarget);
    expect(adapter.read(source)).toEqual(beforeSource);
  });

  it("routes condition and standing lifetimes as exact occurrence changes", async () => {
    const lifetime: CombatEffectLifetime = {
      kind: "turn-boundary",
      subject: "target",
      phase: "turn-end",
      offsetTurns: 1,
    };
    const before = state();
    // Authored occurrences never write the durable/manual condition arrays.
    // Their projection is derived exclusively from the exact occurrence ledger.
    const conditioned = state();
    const standing = state();
    const applyCondition: CombatEffectMutationReceipt = {
      kind: "condition",
      operation: "apply",
      condition: "prone",
      lifetime,
      provenance: provenance("prone"),
      recipient: target,
      before,
      after: conditioned,
      persistentConsequences: {
        occurrenceChanges: [
          {
            effectId: combatEffectOccurrenceId({
              kind: "condition",
              operation: "apply",
              condition: "prone",
              lifetime,
              provenance: provenance("prone"),
              recipient: target,
            }),
            provenance: provenance("prone"),
            recipient: target,
            expectedActive: false,
            expectedHeadOpId: null,
            active: true,
            reason: "program-apply",
            descriptor: { kind: "condition", condition: "prone", lifetime },
            materializedEffect: programMaterialization(
              combatEffectOccurrenceId({
                kind: "condition",
                operation: "apply",
                condition: "prone",
                lifetime,
                provenance: provenance("prone"),
                recipient: target,
              }),
              "prone",
              { kind: "condition", conditionId: "prone" },
              {
                kind: "turn-boundary",
                combatantId: target.target.combatantId,
                round: 2,
                phase: "turn-end",
              },
              lifetime
            ),
          },
        ],
      },
    };
    const startStanding: CombatEffectMutationReceipt = {
      kind: "standing",
      operation: "start",
      effectId: "burning-zone",
      lifetime: { kind: "source-end" },
      provenance: provenance("zone"),
      recipient: target,
      before: conditioned,
      after: standing,
      persistentConsequences: {
        occurrenceChanges: [
          {
            effectId: combatEffectOccurrenceId({
              kind: "standing",
              operation: "start",
              effectId: "burning-zone",
              lifetime: { kind: "source-end" },
              provenance: provenance("zone"),
              recipient: target,
            }),
            provenance: provenance("zone"),
            recipient: target,
            expectedActive: false,
            expectedHeadOpId: null,
            active: true,
            reason: "program-start",
            descriptor: {
              kind: "standing",
              effectId: "burning-zone",
              lifetime: { kind: "source-end" },
            },
            materializedEffect: programMaterialization(
              combatEffectOccurrenceId({
                kind: "standing",
                operation: "start",
                effectId: "burning-zone",
                lifetime: { kind: "source-end" },
                provenance: provenance("zone"),
                recipient: target,
              }),
              "zone",
              { kind: "program-standing", effectId: "burning-zone" },
              { kind: "encounter" },
              { kind: "source-end" }
            ),
          },
        ],
      },
    };
    const adapter = localAdapter(before);
    const result = await commitCombatEffectPlan(plan([applyCondition, startStanding]), [
      adapter,
    ]);
    if (result.status !== "applied") throw new Error("expected commit");
    expect(adapter.read(target)).toEqual(before);
    expect(result.receipt.operations.map((operation) => operation.changes)).toEqual([
      [],
      [],
    ]);
    expect(
      result.receipt.operations.flatMap(
        (operation) => operation.persistentConsequences?.occurrenceChanges ?? []
      )
    ).toHaveLength(2);
    await expect(
      undoCombatEffectCommand(result.receipt, [adapter])
    ).resolves.toMatchObject({
      status: "applied",
    });
    expect(adapter.read(target)).toEqual(before);
  });

  it("keeps authored occurrence deactivation reversible while rejecting terminal heads", async () => {
    const effectId = "condition:prone:one";
    const headOpId = `apply:${effectId}`;
    const existing: ActiveCombatEffect = {
      id: effectId,
      actor: effectCombatant(source),
      target: effectCombatant(target),
      source: {
        kind: "feature",
        id: "spell:test",
        actionId: "spell:test",
      },
      payload: { kind: "condition", conditionId: "prone" },
      programOwner: {
        occurrenceId: "cast:one",
        programId: "spell:test",
        phaseId: "resolve",
        stepId: "prone",
        operationId: headOpId,
        instance: 0,
        iteration: 0,
      },
      duration: { kind: "encounter" },
    };
    const before = state();
    const remove: CombatEffectMutationReceipt = {
      kind: "condition",
      operation: "remove",
      condition: "prone",
      provenance: provenance("remove-prone"),
      recipient: target,
      before,
      after: before,
      persistentConsequences: {
        occurrenceChanges: [
          {
            effectId,
            provenance: provenance("remove-prone"),
            recipient: target,
            expectedHeadOpId: headOpId,
            expectedEffect: combatEffectOccurrenceFingerprint(existing),
            expectedActive: true,
            active: false,
            reason: "program-remove",
          },
        ],
      },
    };
    const seed = plan([remove], {}, { source: "shared", target: "shared" });
    const withHead = (terminal: boolean): CombatEffectAtomicReadSet => {
      const candidate = clone(seed.readSet);
      const read = candidate.reads.find(
        (entry) =>
          entry.address.kind === "occurrence-heads" &&
          atomicOwnerKey(entry.owner) === atomicOwnerKey(fixtureOwner(target, "shared"))
      );
      if (!read || read.address.kind !== "occurrence-heads") {
        throw new TypeError("Missing occurrence-head fixture");
      }
      read.expected = [
        {
          effectId,
          headOpId,
          active: !terminal,
          terminal,
          effect: existing,
        },
      ];
      const conformed = conformCombatEffectAtomicReadSet(candidate, {
        occurrenceId: seed.occurrenceId,
        programId: seed.programId,
        sourceId: seed.sourceId,
      });
      if (!conformed) throw new TypeError("Invalid occurrence-head fixture");
      return conformed;
    };
    const reviewed = plan([remove], { readSet: withHead(false) });
    const adapter = new MemoryAdapter("shared-character", "shared", () => true);
    adapter.seed(source, state());
    adapter.seed(target, before);

    const committed = await commitCombatEffectPlan(reviewed, [adapter]);
    if (committed.status !== "applied") throw new Error("expected commit");
    expect(adapter.occurrenceFacts(target)[0]).toMatchObject({
      active: false,
      terminal: false,
    });
    await expect(
      undoCombatEffectCommand(committed.receipt, [adapter])
    ).resolves.toMatchObject({ status: "applied" });
    expect(adapter.occurrenceFacts(target)[0]).toMatchObject({
      active: true,
      terminal: false,
    });
    await expect(
      redoCombatEffectCommand(committed.receipt, [adapter])
    ).resolves.toMatchObject({ status: "applied" });
    expect(adapter.occurrenceFacts(target)[0]).toMatchObject({
      active: false,
      terminal: false,
    });

    expect(
      prepareCombatEffectCommand(plan([remove], { readSet: withHead(true) }), [
        new MemoryAdapter("shared-character", "shared", () => true),
      ])
    ).toEqual({ status: "rejected", reason: "invalid-plan" });
  });

  it("rejects non-canonical condition state and lifetime snapshots", () => {
    const valid = damage("impact", state(), state({ hp: 6 }));
    const invalidStates: ReadonlyArray<[string, CombatEffectStateView]> = [
      [
        "unknown condition",
        state({
          hp: 6,
          conditions: ["not-a-condition" as never],
          conditionLifetimes: { "not-a-condition": null },
        }),
      ],
      [
        "duplicate condition",
        state({
          hp: 6,
          conditions: ["prone", "prone"],
          conditionLifetimes: { prone: null },
        }),
      ],
      [
        "missing condition lifetime",
        state({ hp: 6, conditions: ["prone"], conditionLifetimes: {} }),
      ],
      ["extra condition lifetime", state({ hp: 6, conditionLifetimes: { prone: null } })],
    ];

    for (const [label, after] of invalidStates) {
      expect(
        prepareCombatEffectCommand(plan([{ ...valid, after }]), [localAdapter()]),
        label
      ).toEqual({ status: "rejected", reason: "invalid-plan" });
    }
  });

  it("rejects malformed damage components, resolutions, and defense groups", () => {
    const valid = damage("impact", state(), state({ hp: 6 }));
    const component = valid.components[0];
    if (!component) throw new Error("missing damage component");
    const invalidPackets: ReadonlyArray<
      [string, Extract<CombatEffectMutationReceipt, { kind: "damage" }>]
    > = [
      [
        "duplicate component step",
        {
          ...valid,
          components: [
            { ...component, amount: 2 },
            { ...component, amount: 2 },
          ],
          defenseGroups: [
            {
              damageType: "fire",
              amount: 4,
              componentStepIds: ["impact", "impact"],
            },
          ],
          appliedComponents: [
            { stepId: "impact", appliedAmount: 2 },
            { stepId: "impact", appliedAmount: 2 },
          ],
        },
      ],
      [
        "unknown component field",
        {
          ...valid,
          components: [{ ...component, unexpected: true } as never],
        },
      ],
      [
        "incoherent critical resolution",
        {
          ...valid,
          components: [
            {
              ...component,
              resolution: {
                kind: "gate",
                gateId: "attack",
                gateKind: "attack",
                result: "hit",
                disposition: "full",
                criticalHit: true,
              },
            },
          ],
        },
      ],
      [
        "save resolution without its exact ability and baseline",
        {
          ...valid,
          components: [
            {
              ...component,
              resolution: {
                kind: "gate",
                gateId: "save",
                gateKind: "save",
                result: "failure",
                disposition: "full",
                criticalHit: false,
              } as never,
            },
          ],
        },
      ],
      [
        "defense total differs from its components",
        {
          ...valid,
          defenseGroups: [
            { damageType: "fire", amount: 5, componentStepIds: ["impact"] },
          ],
        },
      ],
      [
        "defense group names a different component",
        {
          ...valid,
          defenseGroups: [{ damageType: "fire", amount: 4, componentStepIds: ["other"] }],
        },
      ],
    ];

    for (const [label, consequence] of invalidPackets) {
      expect(
        prepareCombatEffectCommand(plan([consequence]), [localAdapter()]),
        label
      ).toEqual({ status: "rejected", reason: "invalid-plan" });
    }
  });

  it("rejects forged temporary HP, healing, and stabilization transitions", () => {
    const partialHeal: CombatEffectMutationReceipt = {
      kind: "heal",
      amount: 5,
      provenance: provenance("heal"),
      recipient: target,
      before: state({ hp: 2 }),
      after: state({ hp: 3 }),
      appliedAmount: 1,
    };
    const incompleteStabilize: CombatEffectMutationReceipt = {
      kind: "stabilize",
      provenance: provenance("stabilize"),
      recipient: target,
      before: state({ hp: 0, deathSaves: { successes: 1, failures: 2 } }),
      after: state({
        hp: 0,
        stable: true,
        deathSaves: { successes: 1, failures: 2 },
      }),
    };
    const impossibleStabilize: CombatEffectMutationReceipt = {
      kind: "stabilize",
      provenance: provenance("stabilize"),
      recipient: target,
      before: state({ hp: 5 }),
      after: state({ hp: 5, stable: true, deathSaves: { successes: 3, failures: 0 } }),
    };

    const forgeries: ReadonlyArray<[string, CombatEffectMutationReceipt]> = [
      [
        "temporary HP decrease",
        {
          kind: "temp-hp",
          amount: 5,
          provenance: provenance("ward"),
          recipient: target,
          before: state({ tempHp: 2 }),
          after: state({ tempHp: 1 }),
          appliedAmount: 0,
        },
      ],
      [
        "temporary HP false no-op",
        {
          kind: "temp-hp",
          amount: 5,
          provenance: provenance("ward"),
          recipient: target,
          before: state({ tempHp: 2 }),
          after: state({ tempHp: 2 }),
          appliedAmount: 0,
        },
      ],
      ["partial heal", partialHeal],
      ["incomplete stabilization", incompleteStabilize],
      ["impossible stabilization", impossibleStabilize],
    ];

    for (const [label, consequence] of forgeries) {
      expect
        .soft(prepareCombatEffectCommand(plan([consequence]), [localAdapter()]), label)
        .toEqual({ status: "rejected", reason: "invalid-plan" });
    }
  });

  it("rejects damage that rewrites an unrelated condition", () => {
    const before = state({ conditions: ["prone"], conditionLifetimes: { prone: null } });
    const forged = damage("impact", before, state({ hp: 6 }));

    expect(prepareCombatEffectCommand(plan([forged]), [localAdapter(before)])).toEqual({
      status: "rejected",
      reason: "invalid-plan",
    });
  });

  it("serializes a frozen JSON receipt without unrelated before/after snapshots", async () => {
    const adapter = localAdapter();
    const result = await commitCombatEffectPlan(
      plan([damage("impact", state(), state({ hp: 6 }))]),
      [adapter]
    );
    if (result.status !== "applied") throw new Error("expected commit");
    expect(Object.isFrozen(result.receipt)).toBe(true);
    const serialized = serializeCombatEffectCommandReceipt(result.receipt);
    const parsed = JSON.parse(serialized) as Record<string, unknown>;
    expect(parsed.schema).toBe(1);
    expect(serialized).not.toContain('"before"');
    expect(serialized).not.toContain('"after"');
    expect(serialized).toContain('"criticalHit":false');
    expect(() =>
      serializeCombatEffectCommandReceipt({ ...result.receipt, commandId: undefined })
    ).toThrow("Invalid combat-effect command receipt");
  });
});
