import { describe, expect, it } from "vitest";

import { materialRefKey, reduceActionJournal } from "@/lib/action-journal";
import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { resolveDamage, withDamageTableOverride } from "@/lib/damage";
import { evaluateDiceFormula } from "@/lib/dice-formula";
import { addOccurrence } from "@/lib/mechanic-occurrences";
import {
  locateResolvedMaterialResource,
  resourceDefinitionFactGuard,
} from "@/lib/material-resource";
import { createEmptyCharacterMaterialState } from "@/lib/material-state";
import {
  conformMechanicsOperation,
  conformMechanicsTransaction,
  planMechanicsTransaction,
} from "@/lib/mechanics-operation";
import { discoverMechanicsEndWave, parseMechanicsWorld } from "@/lib/mechanics-world";
import type {
  ActionFactGuard,
  ActionJournalWorld,
  JournalActionDraft,
  JsonValue,
  ResolvedActionFact,
} from "@/types/action-journal";
import type { DamageDefenseRule, DamagePart, DamageResolution } from "@/types/damage";
import type { DiceFormula, DiceObservation } from "@/types/dice-formula";
import type { MechanicsInvocationRef } from "@/types/mechanics-authority-ref";
import type { EntityRef } from "@/types/mechanics-reference";
import type {
  CreatureMaterialEntity,
  MaterialEntity,
  ObjectMaterialEntity,
} from "@/types/material-state";
import type {
  MechanicsOperation,
  MechanicsOperationCause,
  MechanicsTransaction,
  MechanicsTransactionResult,
} from "@/types/mechanics-operation";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type { MechanicsWorld } from "@/types/mechanics-world";
import type {
  ResourceInitializationObservations,
  ResourceRef,
  ResourceSpec,
} from "@/types/resource";
import type { CreatureVitals } from "@/types/vitals";

const CHARACTER = {
  characterId: "character-1",
  kind: "character-play",
  uid: "user-1",
} as const;
const SELF = { entityId: "self", material: CHARACTER } as const satisfies EntityRef;
const MECHANICS_REVISION = canonicalFingerprint({ fixture: "mechanics-operation" });
const CAPABILITY = {
  capabilityId: "operation",
  definition: {
    catalogueKind: "system",
    entityId: "system.mechanics-operation",
    kind: "catalogue",
    mechanicsRevision: MECHANICS_REVISION,
  },
  kind: "program",
} as const;
const INSTALLATION = {
  capability: CAPABILITY,
  generation: 1,
  installationId: "operation-installation",
  owner: SELF,
} as const;
const AUTHORITY = {
  anchors: {
    activator: SELF,
    caster: SELF,
    owner: SELF,
    source: SELF,
    target: SELF,
  },
  installation: INSTALLATION,
  schema: 1,
  snapshot: {
    grantGroups: {},
    program: {
      id: CAPABILITY.capabilityId,
      phases: [
        {
          inputs: [],
          phaseId: "invoke",
          steps: [],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    },
    ref: CAPABILITY,
    resources: {},
    schema: 1,
  },
  source: { capability: CAPABILITY, kind: "capability", owner: SELF },
  staticBindings: {},
} as const satisfies MechanicsProgramAuthorityReceipt;

function operationCause(
  authority: MechanicsProgramAuthorityReceipt,
  invocation: MechanicsInvocationRef
): MechanicsOperationCause {
  return {
    authority,
    causeId: canonicalFingerprint({ authority, invocation }),
    invocation,
  };
}

function installedCause(
  authority: MechanicsProgramAuthorityReceipt
): MechanicsOperationCause {
  return operationCause(authority, {
    installation: authority.installation,
    kind: "installed-capability",
  });
}

function programRootCause(
  authority: MechanicsProgramAuthorityReceipt,
  occurrenceId: string
): MechanicsOperationCause {
  return operationCause(authority, {
    kind: "program-root",
    occurrence: { material: CHARACTER, occurrenceId },
  });
}

function inventoryAuthority(
  instanceId: string,
  instanceOrdinal: number
): MechanicsProgramAuthorityReceipt {
  return {
    ...AUTHORITY,
    source: {
      instanceId,
      instanceOrdinal,
      kind: "inventory-item",
      owner: CHARACTER,
    },
  };
}

function authorityVariant(seed: number): MechanicsProgramAuthorityReceipt {
  return { ...AUTHORITY, staticBindings: { seed } };
}

function orderedCauses(
  left: MechanicsOperationCause,
  right: MechanicsOperationCause
): [MechanicsOperationCause, MechanicsOperationCause] {
  return left.causeId < right.causeId ? [left, right] : [right, left];
}

const INSTALLED_CAUSE = installedCause(AUTHORITY);
const SELECTOR = {
  damageTypes: [],
  deliveries: [],
  forbiddenTraits: [],
  requiredTraits: [],
} as const;
const COUNT_RESOURCE_SPEC = {
  capacity: { kind: "unbounded" },
  id: "focus",
  initial: { kind: "empty" },
  kind: "count",
  recoveries: [],
} as const satisfies ResourceSpec;
const BOUNDED_RESOURCE_SPEC = {
  capacity: { amount: { kind: "fixed", value: 3 }, kind: "bounded" },
  id: "focus",
  initial: { kind: "full" },
  kind: "count",
  recoveries: [],
} as const satisfies ResourceSpec;
const D4_FORMULA = {
  terms: [
    {
      count: { kind: "fixed", value: 1 },
      kind: "dice",
      operation: "add",
      sides: 4,
      termId: "resource-die",
    },
  ],
} as const satisfies DiceFormula;

function diceObservation(face: number): DiceObservation {
  const requirement = evaluateDiceFormula(D4_FORMULA, {});
  const trail = requirement?.trails[0];
  if (!requirement || !trail || requirement.trails.length !== 1) {
    throw new Error("dice observation fixture");
  }
  return {
    aggregates: [],
    trails: [{ initialFace: face, steps: [], trailId: trail.trailId }],
  };
}

function alive(current: number, temporary = 0): CreatureVitals {
  return {
    hitPoints: {
      current,
      temporary: { current: temporary, sourceOccurrence: null },
    },
    zeroHitPoints: null,
  };
}

function countResource(current: number) {
  return {
    capacity: { base: { kind: "unbounded" as const }, override: null },
    current,
    disabled: false,
    kind: "count" as const,
  };
}

function dying(failures = 0): CreatureVitals {
  return {
    hitPoints: {
      current: 0,
      temporary: { current: 0, sourceOccurrence: null },
    },
    zeroHitPoints: { failures, kind: "dying", successes: 0 },
  };
}

function dead(): CreatureVitals {
  return {
    hitPoints: {
      current: 0,
      temporary: { current: 0, sourceOccurrence: null },
    },
    zeroHitPoints: { kind: "dead" },
  };
}

function creature(
  vitals: CreatureVitals,
  present = true,
  ordinal = 1
): CreatureMaterialEntity {
  return {
    availability: present ? "present" : "dismissed",
    exhaustion: 0,
    kind: "creature",
    label: "",
    ordinal,
    ownerOccurrence: null,
    overrides: {
      armorClass: null,
      hitPointMaximum: 10,
      initiativeBonus: null,
      speedFt: null,
    },
    resources: {},
    template: {
      creatureTypeOverride: null,
      kind: "catalogue-monster",
      monsterId: "monster-1",
    },
    vitals,
  };
}

function object(current = 7, ordinal = 1): ObjectMaterialEntity {
  return {
    availability: "present",
    kind: "object",
    label: "",
    ordinal,
    ownerOccurrence: null,
    overrides: {
      armorClass: null,
      damageDefenseProfile: null,
      hitPointMaximum: null,
      magical: null,
      materials: null,
      size: null,
    },
    resources: {},
    template: {
      definition: {
        armorClass: 15,
        damageDefenseProfile: { damageThreshold: null, rules: [] },
        hitPointMaximum: 7,
        magical: false,
        materials: [{ kind: "wood" }],
        name: "Training target",
        size: "Medium",
      },
      kind: "custom",
    },
    vitals: { hitPoints: { current } },
  };
}

function parsedWorld(
  vitals: CreatureVitals,
  entities: Record<string, MaterialEntity> = {}
): Readonly<MechanicsWorld> {
  const state = createEmptyCharacterMaterialState(1, CHARACTER, vitals);
  const nextEntityOrdinal =
    Math.max(0, ...Object.values(entities).map(({ ordinal }) => ordinal)) + 1;
  const result = parseMechanicsWorld({
    documents: [
      {
        kind: "character",
        material: CHARACTER,
        state: { ...state, entities, nextEntityOrdinal },
      },
    ],
    scope: CHARACTER,
  });
  if (!result.ok) throw new Error(`Invalid fixture: ${result.reason}`);
  return result.value;
}

function parsedCharacterState(
  state: Readonly<ReturnType<typeof createEmptyCharacterMaterialState>>
): Readonly<MechanicsWorld> {
  const result = parseMechanicsWorld({
    documents: [{ kind: "character", material: CHARACTER, state }],
    scope: CHARACTER,
  });
  if (!result.ok) throw new Error(`Invalid fixture: ${result.reason}`);
  return result.value;
}

function resourceWorld(current = 3): Readonly<MechanicsWorld> {
  const material = structuredClone(
    createEmptyCharacterMaterialState(1, CHARACTER, alive(10))
  );
  material.resources.pools.focus = countResource(current);
  return parsedCharacterState(material);
}

function resourceDefinitionFact(
  world: Readonly<MechanicsWorld>,
  resource: Readonly<ResourceRef>,
  spec: Readonly<ResourceSpec> = COUNT_RESOURCE_SPEC,
  bindings: Readonly<Record<string, number>> = {}
): ActionFactGuard {
  const location = locateResolvedMaterialResource(world, resource);
  if (!location) throw new Error("resource fixture missing");
  return resourceDefinitionFactGuard(location, spec, bindings);
}

function initializeOperation(
  operationId: string,
  resource: Readonly<ResourceRef>,
  spec: Readonly<ResourceSpec> = BOUNDED_RESOURCE_SPEC,
  observations: Readonly<ResourceInitializationObservations> = {}
): MechanicsOperation {
  return {
    bindings: {},
    causeId: INSTALLED_CAUSE.causeId,
    kind: "resource-initialize",
    observations,
    operationId,
    resource,
    spec,
  };
}

function concentratingWorld(vitals: CreatureVitals): Readonly<MechanicsWorld> {
  const state = structuredClone(createEmptyCharacterMaterialState(1, CHARACTER, vitals));
  const root = addOccurrence(
    {
      nextOccurrenceOrdinal: state.nextOccurrenceOrdinal,
      occurrences: state.occurrences,
    },
    "root",
    {
      authority: AUTHORITY,
      endRules: [],
      kind: "program",
      phaseState: { invoke: { execution: 0, lastTriggerEventId: null } },
      registers: {},
    }
  );
  const occurrences = addOccurrence(root, "focus", {
    endRules: [],
    kind: "concentration",
    parentId: "root",
    target: SELF,
  });
  return parsedCharacterState({ ...state, ...occurrences });
}

function damage(
  target: EntityRef,
  parts: readonly DamagePart[],
  rules: readonly DamageDefenseRule[] = []
): Readonly<DamageResolution> {
  const result = resolveDamage(
    {
      delivery: "attack",
      packetId: `packet-${target.entityId}`,
      parts,
      target,
      traits: [],
    },
    { damageThreshold: null, rules },
    []
  );
  if (!result || result.kind !== "resolved") throw new Error("damage fixture");
  return result.resolution;
}

function creatureDamage(
  operationId: string,
  target: EntityRef,
  amount: number,
  options: {
    criticalHit?: boolean;
    maximumHitPoints?: { kind: "material" } | { kind: "fact"; value: number };
    rules?: readonly DamageDefenseRule[];
  } = {}
): Extract<MechanicsOperation, { readonly kind: "creature-damage" }> {
  return {
    attacker: null,
    causeId: INSTALLED_CAUSE.causeId,
    criticalHit: options.criticalHit ?? false,
    damage: damage(
      target,
      [{ amount, damageType: "force", partId: `part-${operationId}` }],
      options.rules
    ),
    kind: "creature-damage",
    maximumHitPoints: options.maximumHitPoints ?? { kind: "material" },
    operationId,
    zeroHitPointsPolicy: "dying",
  };
}

function conditionCreate(
  operationId: string,
  occurrenceId: string,
  conditionId: "paralyzed" | "poisoned",
  conditionImmunityOverride: { reasonId: string } | null = null
): MechanicsOperation {
  return {
    causeId: INSTALLED_CAUSE.causeId,
    conditionImmunityOverride,
    kind: "occurrence-create",
    material: CHARACTER,
    occurrence: {
      conditionId,
      endRules: [],
      kind: "condition",
      parentId: "root",
      target: SELF,
    },
    occurrenceId,
    operationId,
  };
}

function programCreate(
  operationId: string,
  occurrenceId: string,
  cause: MechanicsOperationCause
): Extract<MechanicsOperation, { readonly kind: "occurrence-create" }> {
  return {
    causeId: cause.causeId,
    kind: "occurrence-create",
    material: CHARACTER,
    occurrence: {
      endRules: [],
      kind: "program",
      phaseState: { invoke: { execution: 0, lastTriggerEventId: null } },
      registers: {},
    },
    occurrenceId,
    operationId,
  };
}

function standingCreate(
  operationId: string,
  occurrenceId: string,
  parentId: string,
  cause: MechanicsOperationCause
): Extract<MechanicsOperation, { readonly kind: "occurrence-create" }> {
  return {
    causeId: cause.causeId,
    conditionImmunityOverride: null,
    kind: "occurrence-create",
    material: CHARACTER,
    occurrence: {
      endRules: [],
      fact: { key: occurrenceId, kind: "active-key" },
      kind: "standing",
      parentId,
      target: SELF,
    },
    occurrenceId,
    operationId,
  };
}

function worldWithRoots(
  roots: readonly (readonly [string, MechanicsProgramAuthorityReceipt])[]
): Readonly<MechanicsWorld> {
  const state = structuredClone(
    createEmptyCharacterMaterialState(1, CHARACTER, alive(10))
  );
  const occurrences = roots.reduce(
    (current, [occurrenceId, authority]) =>
      addOccurrence(current, occurrenceId, {
        authority,
        endRules: [],
        kind: "program",
        phaseState: { invoke: { execution: 0, lastTriggerEventId: null } },
        registers: {},
      }),
    {
      nextOccurrenceOrdinal: state.nextOccurrenceOrdinal,
      occurrences: state.occurrences,
    }
  );
  return parsedCharacterState({ ...state, ...occurrences });
}

function transaction(
  operations: readonly [MechanicsOperation, ...MechanicsOperation[]],
  options: {
    actionId?: string;
    actor?: MechanicsTransaction["actor"];
    causes?: readonly [MechanicsOperationCause, ...MechanicsOperationCause[]];
    factGuards?: readonly ActionFactGuard[];
  } = {}
): MechanicsTransaction {
  return {
    actionId: options.actionId ?? "action-1",
    actor: options.actor ?? SELF,
    causes: options.causes ?? [INSTALLED_CAUSE],
    factGuards: options.factGuards ?? [],
    operations,
  };
}

function planned(
  result: MechanicsTransactionResult
): Extract<MechanicsTransactionResult, { status: "planned" }> {
  if (result.status !== "planned") {
    throw new Error(`Expected plan, got ${JSON.stringify(result)}`);
  }
  return result;
}

function state(world: Readonly<MechanicsWorld>) {
  const document = world.documents[0];
  if (!document || document.kind !== "character") throw new Error("fixture");
  return document.state;
}

function toJournalWorld(world: Readonly<MechanicsWorld>): ActionJournalWorld {
  return {
    documents: world.documents.map(({ material, state: materialState }) => {
      const { actions, epoch, revision } = materialState;
      const data = structuredClone(materialState) as unknown as Record<string, JsonValue>;
      for (const key of ["actions", "buildRevision", "epoch", "revision", "schema"]) {
        Reflect.deleteProperty(data, key);
      }
      return { data, journal: { actions, epoch, revision }, material };
    }),
    scope: world.scope,
  };
}

function resolvedFacts(
  action: JournalActionDraft,
  phase: "commit" | "redo" = "commit"
): readonly ResolvedActionFact[] {
  return action.guards.facts
    .filter((guard) => phase === "commit" || guard.lifecycle === "commit-redo")
    .map(({ address, expected, owner }) => ({
      actual: expected,
      address,
      owner,
    }));
}

function currentDocuments(
  world: ActionJournalWorld,
  action: JournalActionDraft
): JournalActionDraft["guards"]["documents"] {
  return action.guards.documents.map(({ material }) => {
    const document = world.documents.find(
      (candidate) => materialRefKey(candidate.material) === materialRefKey(material)
    );
    if (!document) throw new Error("fixture");
    return {
      epoch: document.journal.epoch,
      material,
      revision: document.journal.revision,
    };
  });
}

function journalData(world: Readonly<ActionJournalWorld>) {
  return world.documents.map(({ data, material }) => ({ data, material }));
}

/** Prove that the generated mechanics diff owns every closure mutation exactly. */
function expectExactActionRoundTrip(
  before: Readonly<MechanicsWorld>,
  result: Extract<MechanicsTransactionResult, { readonly status: "planned" }>
): void {
  const journalBefore = toJournalWorld(before);
  const journalAfter = toJournalWorld(result.world);
  const committed = reduceActionJournal(
    journalBefore,
    { action: result.action, kind: "commit" },
    resolvedFacts(result.action)
  );
  expect(committed.status).toBe("applied");
  if (committed.status !== "applied") return;
  expect(journalData(committed.world)).toEqual(journalData(journalAfter));

  const undone = reduceActionJournal(
    committed.world,
    {
      action: result.action,
      documents: currentDocuments(committed.world, result.action),
      expectedGeneration: 1,
      kind: "undo",
    },
    []
  );
  expect(undone.status).toBe("applied");
  if (undone.status !== "applied") return;
  expect(journalData(undone.world)).toEqual(journalData(journalBefore));

  const redone = reduceActionJournal(
    undone.world,
    {
      action: result.action,
      documents: currentDocuments(undone.world, result.action),
      expectedGeneration: 2,
      kind: "redo",
    },
    resolvedFacts(result.action, "redo")
  );
  expect(redone.status).toBe("applied");
  if (redone.status !== "applied") return;
  expect(journalData(redone.world)).toEqual(journalData(journalAfter));
}

describe("atomic mechanics transactions", () => {
  it("accepts only the exact envelope and unique operation identities", () => {
    const operation = creatureDamage("damage", SELF, 1, {
      maximumHitPoints: { kind: "fact", value: 10 },
    });
    expect(conformMechanicsOperation(operation)).toEqual(operation);
    const missingAttacker: Record<string, unknown> = { ...operation };
    delete missingAttacker.attacker;
    expect(conformMechanicsOperation(missingAttacker)).toBeNull();
    expect(
      conformMechanicsOperation({ ...operation, actionId: "duplicated" })
    ).toBeNull();
    expect(conformMechanicsTransaction(transaction([operation]))).not.toBeNull();
    expect(conformMechanicsTransaction(transaction([operation, operation]))).toBeNull();
    expect(
      conformMechanicsTransaction({ ...transaction([operation]), extra: true })
    ).toBeNull();
  });

  it("rejects forged, unordered, duplicate, unused, missing, and excessive causes", () => {
    const operation = creatureDamage("damage", SELF, 1, {
      maximumHitPoints: { kind: "fact", value: 10 },
    });
    const first = installedCause(authorityVariant(1));
    const second = installedCause(authorityVariant(2));
    const [lower, higher] = orderedCauses(first, second);
    const operationFor = (
      cause: MechanicsOperationCause,
      operationId: string
    ): MechanicsOperation => ({ ...operation, causeId: cause.causeId, operationId });

    expect(
      conformMechanicsTransaction({
        ...transaction([operation]),
        causes: [{ ...INSTALLED_CAUSE, causeId: canonicalFingerprint({ forged: true }) }],
      })
    ).toBeNull();
    expect(
      conformMechanicsTransaction({
        ...transaction([operationFor(lower, "lower"), operationFor(higher, "higher")]),
        causes: [higher, lower],
      })
    ).toBeNull();
    expect(
      conformMechanicsTransaction({
        ...transaction([operation]),
        causes: [INSTALLED_CAUSE, INSTALLED_CAUSE],
      })
    ).toBeNull();
    expect(
      conformMechanicsTransaction({
        ...transaction([operationFor(lower, "lower")]),
        causes: [lower, higher],
      })
    ).toBeNull();
    expect(
      conformMechanicsTransaction({
        ...transaction([operation]),
        causes: [first],
      })
    ).toBeNull();

    const many = Array.from({ length: 513 }, (_, seed) =>
      installedCause(authorityVariant(seed + 1))
    ).sort((left, right) => left.causeId.localeCompare(right.causeId));
    expect(
      conformMechanicsTransaction({
        ...transaction(
          many.map((cause, index) => operationFor(cause, `operation-${index}`)) as [
            MechanicsOperation,
            ...MechanicsOperation[],
          ]
        ),
        causes: many,
      })
    ).toBeNull();
  });

  it("binds installed invocation to its exact receipt installation", () => {
    const mismatchedInvocation = {
      installation: { ...INSTALLATION, generation: 2 },
      kind: "installed-capability",
    } as const;
    const mismatched = operationCause(AUTHORITY, mismatchedInvocation);
    const operation = {
      ...creatureDamage("damage", SELF, 1, {
        maximumHitPoints: { kind: "fact", value: 10 },
      }),
      causeId: mismatched.causeId,
    };
    expect(
      conformMechanicsTransaction({
        ...transaction([operation]),
        causes: [mismatched],
      })
    ).toBeNull();
  });

  it("derives durable root authority from an installed cause before creating effects", () => {
    const authority = authorityVariant(7);
    const cause = installedCause(authority);
    const root = programCreate("create-root", "root", cause);
    expect(root).not.toHaveProperty("authority");
    expect(root.occurrence).not.toHaveProperty("authority");
    expect(root).not.toHaveProperty("conditionImmunityOverride");
    expect(
      conformMechanicsOperation({
        ...root,
        occurrence: { ...root.occurrence, authority },
      })
    ).toBeNull();

    const result = planned(
      planMechanicsTransaction(
        parsedWorld(alive(10)),
        transaction([root, standingCreate("create-effect", "effect", "root", cause)], {
          causes: [cause],
        })
      )
    );
    expect(state(result.world).occurrences.root).toMatchObject({ authority });
    expect(state(result.world).occurrences.effect).toMatchObject({ parentId: "root" });
  });

  it("rejects child-before-root, root creation from a root, and unrelated parents", () => {
    const cause = installedCause(AUTHORITY);
    expect(
      planMechanicsTransaction(
        parsedWorld(alive(10)),
        transaction(
          [
            standingCreate("child-first", "effect", "root", cause),
            programCreate("root-second", "root", cause),
          ],
          { causes: [cause] }
        )
      )
    ).toEqual({
      operationId: "child-first",
      reason: "invalid-cause",
      status: "rejected",
    });

    const rooted = worldWithRoots([["root", AUTHORITY]]);
    const rootCause = programRootCause(AUTHORITY, "root");
    expect(
      planMechanicsTransaction(
        rooted,
        transaction([programCreate("forged-root", "second-root", rootCause)], {
          causes: [rootCause],
        })
      )
    ).toEqual({
      operationId: null,
      reason: "invalid-transaction",
      status: "rejected",
    });

    const unrelated = installedCause(authorityVariant(8));
    expect(
      planMechanicsTransaction(
        rooted,
        transaction([standingCreate("unrelated", "effect", "root", unrelated)], {
          causes: [unrelated],
        })
      )
    ).toEqual({
      operationId: "unrelated",
      reason: "invalid-cause",
      status: "rejected",
    });

    expect(
      conformMechanicsTransaction(
        transaction(
          [
            programCreate("first-root", "first", cause),
            programCreate("second-root", "second", cause),
          ],
          { causes: [cause] }
        )
      )
    ).toBeNull();
  });

  it("requires exact existing root authority but permits it to end another root", () => {
    const otherAuthority = authorityVariant(9);
    const before = worldWithRoots([
      ["causing-root", AUTHORITY],
      ["other-root", otherAuthority],
    ]);
    const cause = programRootCause(AUTHORITY, "causing-root");
    const ended = planned(
      planMechanicsTransaction(
        before,
        transaction(
          [
            {
              causeId: cause.causeId,
              kind: "occurrence-end",
              occurrence: { material: CHARACTER, occurrenceId: "other-root" },
              operationId: "dispel-other",
            },
          ],
          { causes: [cause] }
        )
      )
    );
    expect(state(ended.world).occurrences).toHaveProperty("causing-root");
    expect(state(ended.world).occurrences).not.toHaveProperty("other-root");
    expect(ended.transaction.operations[0].causeId).toBe(cause.causeId);

    const mismatched = programRootCause(otherAuthority, "causing-root");
    expect(
      planMechanicsTransaction(
        before,
        transaction(
          [
            {
              causeId: mismatched.causeId,
              kind: "occurrence-end",
              occurrence: { material: CHARACTER, occurrenceId: "other-root" },
              operationId: "forged-dispatch",
            },
          ],
          { causes: [mismatched] }
        )
      )
    ).toEqual({
      operationId: "forged-dispatch",
      reason: "invalid-cause",
      status: "rejected",
    });
  });

  it("plans multi-target damage as one journal action and aborts the whole batch", () => {
    const first = { entityId: "first", material: CHARACTER } as const;
    const second = { entityId: "second", material: CHARACTER } as const;
    const before = parsedWorld(alive(10), {
      first: creature(alive(10)),
      second: creature(alive(10, 2), true, 2),
    });
    const snapshot = JSON.stringify(before);
    const result = planned(
      planMechanicsTransaction(
        before,
        transaction([
          creatureDamage("first-hit", first, 4),
          creatureDamage("second-hit", second, 5),
        ])
      )
    );

    expect(
      result.executions.map(({ operationId, status }) => [operationId, status])
    ).toEqual([
      ["first-hit", "applied"],
      ["second-hit", "applied"],
    ]);
    expect(state(result.world).entities.first?.vitals.hitPoints.current).toBe(6);
    expect(state(result.world).entities.second?.vitals.hitPoints).toMatchObject({
      current: 7,
      temporary: { current: 0 },
    });
    expect(result.action.id).toBe("action-1");
    expect(result.action.mutations.map(({ path }) => path)).toEqual([
      ["entities", "first", "vitals", "hitPoints", "current"],
      ["entities", "second", "vitals", "hitPoints", "current"],
      ["entities", "second", "vitals", "hitPoints", "temporary", "current"],
    ]);
    expect(JSON.stringify(before)).toBe(snapshot);

    const missing = { entityId: "missing", material: CHARACTER } as const;
    expect(
      planMechanicsTransaction(
        before,
        transaction([
          creatureDamage("would-apply", first, 4),
          creatureDamage("must-abort", missing, 1),
        ])
      )
    ).toEqual({
      operationId: "must-abort",
      reason: "missing-target",
      status: "rejected",
    });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("simulates ordered consequences, retains no-change receipts, and diffs once", () => {
    const immunity: DamageDefenseRule = {
      kind: "immunity",
      selector: SELECTOR,
      sourceId: "immunity",
    };
    const before = parsedWorld(alive(10));
    const result = planned(
      planMechanicsTransaction(
        before,
        transaction([
          creatureDamage("immune", SELF, 20, {
            maximumHitPoints: { kind: "fact", value: 10 },
            rules: [immunity],
          }),
          creatureDamage("landed", SELF, 4, {
            maximumHitPoints: { kind: "fact", value: 10 },
          }),
          {
            input: { amount: 3, maximumHitPoints: 10 },
            kind: "creature-healing",
            maximumHitPointsSource: { kind: "fact" },
            operationId: "heal",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
          },
        ])
      )
    );

    expect(result.executions.map(({ status }) => status)).toEqual([
      "no-change",
      "applied",
      "applied",
    ]);
    expect(state(result.world).vitals.hitPoints.current).toBe(9);
    expect(result.action.mutations).toHaveLength(1);
    expect(result.action.mutations[0]?.path).toEqual(["vitals", "hitPoints", "current"]);
    expect(result.action.guards.facts).toEqual([
      {
        address: ["hit-point-maximum"],
        expected: { present: true, value: 10 },
        lifecycle: "commit-redo",
        owner: SELF,
      },
    ]);

    expect(
      planMechanicsTransaction(
        before,
        transaction([
          creatureDamage("immune", SELF, 20, {
            maximumHitPoints: { kind: "fact", value: 10 },
            rules: [immunity],
          }),
        ])
      )
    ).toMatchObject({ status: "no-change", world: before });
  });

  it("uses the effective table override while retaining computed damage evidence", () => {
    const computed = damage(SELF, [{ amount: 8, damageType: "fire", partId: "fire" }]);
    const overridden = withDamageTableOverride(computed, {
      amount: 2,
      kind: "net-total",
      reasonId: "table-ruling",
    });
    if (!overridden) throw new Error("fixture");
    const result = planned(
      planMechanicsTransaction(
        parsedWorld(alive(10, 3)),
        transaction([
          {
            attacker: null,
            criticalHit: false,
            damage: overridden,
            kind: "creature-damage",
            maximumHitPoints: { kind: "fact", value: 10 },
            operationId: "overridden",
            causeId: INSTALLED_CAUSE.causeId,
            zeroHitPointsPolicy: "dying",
          },
        ])
      )
    );
    const execution = result.executions[0];
    expect(execution?.status).toBe("applied");
    if (execution?.status !== "applied") return;
    expect(execution.operation).toMatchObject({ damage: overridden });
    expect(execution.facts).toMatchObject({
      damageTaken: 2,
      hitPointsLost: 0,
      temporaryHitPointsLost: 2,
    });
    expect(state(result.world).vitals.hitPoints.temporary.current).toBe(1);
  });

  it("covers every terminal creature and object vitality transition", () => {
    const heal = planned(
      planMechanicsTransaction(
        parsedWorld(alive(4)),
        transaction([
          {
            input: { amount: 20, maximumHitPoints: 10 },
            kind: "creature-healing",
            maximumHitPointsSource: { kind: "fact" },
            operationId: "heal",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
          },
        ])
      )
    );
    expect(state(heal.world).vitals.hitPoints.current).toBe(10);

    const granted = planned(
      planMechanicsTransaction(
        parsedWorld(alive(10)),
        transaction([
          {
            grant: { amount: 6, decision: "replace", sourceOccurrence: null },
            kind: "temporary-hit-points-grant",
            operationId: "grant-thp",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
          },
        ])
      )
    );
    expect(state(granted.world).vitals.hitPoints.temporary.current).toBe(6);
    const cleared = planned(
      planMechanicsTransaction(
        granted.world,
        transaction([
          {
            clear: { kind: "all" },
            kind: "temporary-hit-points-clear",
            operationId: "clear-thp",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
          },
        ])
      )
    );
    expect(state(cleared.world).vitals.hitPoints.temporary.current).toBe(0);

    const stable = planned(
      planMechanicsTransaction(
        parsedWorld(dying(1)),
        transaction([
          {
            kind: "creature-stabilize",
            operationId: "stabilize",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
          },
        ])
      )
    );
    expect(state(stable.world).vitals.zeroHitPoints).toEqual({ kind: "stable" });

    const killed = planned(
      planMechanicsTransaction(
        parsedWorld(alive(10, 4)),
        transaction([
          {
            kind: "creature-kill",
            operationId: "kill",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
          },
        ])
      )
    );
    expect(state(killed.world).vitals).toEqual({
      hitPoints: {
        current: 0,
        temporary: { current: 4, sourceOccurrence: null },
      },
      zeroHitPoints: { kind: "dead" },
    });

    const reduced = planned(
      planMechanicsTransaction(
        parsedWorld(alive(5, 2)),
        transaction([
          {
            input: { maximumHitPoints: 10, zeroHitPointsPolicy: "dying" },
            kind: "creature-reduce-to-zero",
            maximumHitPointsSource: { kind: "fact" },
            operationId: "reduce",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
          },
        ])
      )
    );
    expect(state(reduced.world).vitals).toEqual({
      hitPoints: {
        current: 0,
        temporary: { current: 2, sourceOccurrence: null },
      },
      zeroHitPoints: { failures: 0, kind: "dying", successes: 0 },
    });

    const revived = planned(
      planMechanicsTransaction(
        parsedWorld(dead()),
        transaction([
          {
            input: { hitPoints: 50, maximumHitPoints: 12 },
            kind: "creature-revive",
            maximumHitPointsSource: { kind: "fact" },
            operationId: "revive",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
          },
        ])
      )
    );
    expect(state(revived.world).vitals).toEqual(alive(12));

    const deathSave = planned(
      planMechanicsTransaction(
        parsedWorld(dying()),
        transaction([
          {
            kind: "creature-death-save",
            operationId: "death-save",
            outcome: "critical-success",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
          },
        ])
      )
    );
    expect(state(deathSave.world).vitals).toEqual(alive(1));

    const creatureSync = planned(
      planMechanicsTransaction(
        parsedWorld(alive(12, 3)),
        transaction([
          {
            input: { maximumHitPoints: 7 },
            kind: "creature-maximum-sync",
            operationId: "creature-sync",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
          },
        ])
      )
    );
    expect(state(creatureSync.world).vitals.hitPoints.current).toBe(7);

    const door = { entityId: "door", material: CHARACTER } as const;
    const objectResult = planned(
      planMechanicsTransaction(
        parsedWorld(alive(10), { door: object(7) }),
        transaction([
          {
            attacker: null,
            criticalHit: false,
            damage: damage(door, [
              { amount: 20, damageType: "bludgeoning", partId: "impact" },
            ]),
            kind: "object-damage",
            maximumHitPoints: { kind: "material" },
            operationId: "object-damage",
            causeId: INSTALLED_CAUSE.causeId,
          },
          {
            input: { amount: 3, maximumHitPoints: 7 },
            kind: "object-repair",
            maximumHitPointsSource: { kind: "material" },
            operationId: "object-repair",
            causeId: INSTALLED_CAUSE.causeId,
            target: door,
          },
          {
            input: { maximumHitPoints: 0 },
            kind: "object-maximum-sync",
            operationId: "object-sync",
            causeId: INSTALLED_CAUSE.causeId,
            target: door,
          },
        ])
      )
    );
    expect(state(objectResult.world).entities.door?.vitals).toEqual({
      hitPoints: { current: 0 },
    });
    expect(objectResult.executions).toHaveLength(3);
  });

  it("models damage at zero, critical failures, and instant death from raw damage", () => {
    const target = { entityId: "foe", material: CHARACTER } as const;
    const critical = planned(
      planMechanicsTransaction(
        parsedWorld(alive(10), { foe: creature(dying(1)) }),
        transaction([creatureDamage("critical", target, 1, { criticalHit: true })])
      )
    );
    expect(state(critical.world).entities.foe?.vitals).toEqual(dead());

    const instant = planned(
      planMechanicsTransaction(
        parsedWorld(alive(10), { foe: creature(dying()) }),
        transaction([creatureDamage("instant", target, 10)])
      )
    );
    expect(state(instant.world).entities.foe?.vitals).toEqual(dead());
  });

  it("keeps Concentration readable until its causal end wave is delivered", () => {
    const result = planned(
      planMechanicsTransaction(
        concentratingWorld(alive(3)),
        transaction([
          creatureDamage("drop", SELF, 3, {
            maximumHitPoints: { kind: "fact", value: 10 },
          }),
        ])
      )
    );

    expect(state(result.world).vitals.zeroHitPoints?.kind).toBe("dying");
    expect(state(result.world).occurrences).toHaveProperty("root");
    expect(state(result.world).occurrences).toHaveProperty("focus");
    expect(result.action.mutations.map(({ path }) => path)).not.toContainEqual([
      "occurrences",
      "focus",
    ]);
    expect(discoverMechanicsEndWave(result.world)).toMatchObject({
      candidates: [
        {
          causes: [{ kind: "concentration-broken" }],
          occurrence: { material: CHARACTER, occurrenceId: "focus" },
        },
      ],
      status: "discovered",
    });
  });

  it("creates universal occurrences and defers their causal closure", () => {
    const paralyzed = planned(
      planMechanicsTransaction(
        concentratingWorld(alive(10)),
        transaction([conditionCreate("paralyze", "paralysis", "paralyzed")])
      )
    );
    expect(Object.keys(state(paralyzed.world).occurrences)).toEqual([
      "root",
      "focus",
      "paralysis",
    ]);
    const paralyzeExecution = paralyzed.executions[0];
    expect(paralyzeExecution?.status).toBe("applied");
    if (paralyzeExecution?.status !== "applied") return;
    expect(paralyzeExecution.facts).toMatchObject({
      created: { material: CHARACTER, occurrenceId: "paralysis" },
      ended: [],
    });
    expect(discoverMechanicsEndWave(paralyzed.world)).toMatchObject({
      candidates: [
        {
          causes: [{ kind: "concentration-broken" }],
          occurrence: { material: CHARACTER, occurrenceId: "focus" },
        },
      ],
      status: "discovered",
    });

    const immuneState = structuredClone(
      createEmptyCharacterMaterialState(1, CHARACTER, alive(10))
    );
    const immuneRoot = addOccurrence(
      {
        nextOccurrenceOrdinal: immuneState.nextOccurrenceOrdinal,
        occurrences: immuneState.occurrences,
      },
      "root",
      {
        authority: AUTHORITY,
        endRules: [],
        kind: "program",
        phaseState: { invoke: { execution: 0, lastTriggerEventId: null } },
        registers: {},
      }
    );
    const immuneOccurrence = addOccurrence(immuneRoot, "poison-immunity", {
      endRules: [],
      fact: { conditionId: "poisoned", kind: "condition-immunity" },
      kind: "standing",
      parentId: "root",
      target: SELF,
    });
    const immuneWorld = parsedCharacterState({ ...immuneState, ...immuneOccurrence });
    expect(
      planMechanicsTransaction(
        immuneWorld,
        transaction([conditionCreate("poison", "poisoned", "poisoned")])
      )
    ).toMatchObject({
      executions: [{ reason: "condition-immune", status: "no-change" }],
      status: "no-change",
    });

    const overridden = planned(
      planMechanicsTransaction(
        immuneWorld,
        transaction([
          conditionCreate("poison-override", "poisoned", "poisoned", {
            reasonId: "table-overrides-immunity",
          }),
        ])
      )
    );
    expect(state(overridden.world).occurrences).toHaveProperty("poisoned");
  });

  it("requires an explicit Concentration barrier and ends dependency cascades", () => {
    const replacement: MechanicsOperation = {
      causeId: INSTALLED_CAUSE.causeId,
      conditionImmunityOverride: null,
      kind: "occurrence-create",
      material: CHARACTER,
      occurrence: {
        endRules: [],
        kind: "concentration",
        parentId: "root",
        target: SELF,
      },
      occurrenceId: "new-focus",
      operationId: "replace-focus",
    };
    const concentrating = concentratingWorld(alive(10));
    expect(planMechanicsTransaction(concentrating, transaction([replacement]))).toEqual({
      operationId: "replace-focus",
      reason: "concentration-replacement-required",
      status: "rejected",
    });
    const replaced = planned(
      planMechanicsTransaction(
        concentrating,
        transaction([
          {
            causeId: INSTALLED_CAUSE.causeId,
            kind: "occurrence-end",
            occurrence: { material: CHARACTER, occurrenceId: "focus" },
            operationId: "end-old-focus",
          },
          replacement,
        ])
      )
    );
    expect(Object.keys(state(replaced.world).occurrences)).toEqual(["root", "new-focus"]);

    const rootState = structuredClone(
      createEmptyCharacterMaterialState(1, CHARACTER, alive(10))
    );
    const root = addOccurrence(
      {
        nextOccurrenceOrdinal: rootState.nextOccurrenceOrdinal,
        occurrences: rootState.occurrences,
      },
      "root",
      {
        authority: AUTHORITY,
        endRules: [],
        kind: "program",
        phaseState: {
          invoke: { execution: 0, lastTriggerEventId: null },
        },
        registers: {},
      }
    );
    const child = addOccurrence(root, "child", {
      endRules: [],
      fact: { key: "child", kind: "active-key" },
      kind: "standing",
      parentId: "root",
      target: SELF,
    });
    const cascadeWorld = parsedCharacterState({ ...rootState, ...child });
    const ended = planned(
      planMechanicsTransaction(
        cascadeWorld,
        transaction([
          {
            causeId: INSTALLED_CAUSE.causeId,
            kind: "occurrence-end",
            occurrence: { material: CHARACTER, occurrenceId: "root" },
            operationId: "end-root",
          },
        ])
      )
    );
    expect(state(ended.world).occurrences).toEqual({});
    const endExecution = ended.executions[0];
    expect(endExecution?.status).toBe("applied");
    if (endExecution?.status !== "applied") return;
    expect(endExecution.facts).toMatchObject({
      ended: [
        { material: CHARACTER, occurrenceId: "child" },
        { material: CHARACTER, occurrenceId: "root" },
      ],
    });
    expectExactActionRoundTrip(cascadeWorld, ended);
  });

  it("kills at Exhaustion 6 and permits ordered removal before revival", () => {
    const exhaustedState = {
      ...structuredClone(createEmptyCharacterMaterialState(1, CHARACTER, alive(10))),
      exhaustion: 5 as const,
    };
    const exhaustedWorld = parsedCharacterState(exhaustedState);
    const killed = planned(
      planMechanicsTransaction(
        exhaustedWorld,
        transaction([
          {
            kind: "exhaustion-transition",
            operationId: "gain-exhaustion",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
            transition: { amount: 1, kind: "gain" },
          },
        ])
      )
    );
    expect(state(killed.world)).toMatchObject({
      exhaustion: 6,
      vitals: { zeroHitPoints: { kind: "dead" } },
    });

    const restored = planned(
      planMechanicsTransaction(
        killed.world,
        transaction([
          {
            kind: "exhaustion-transition",
            operationId: "remove-exhaustion",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
            transition: { amount: 1, kind: "remove" },
          },
          {
            input: { hitPoints: 4, maximumHitPoints: 10 },
            kind: "creature-revive",
            maximumHitPointsSource: { kind: "fact" },
            operationId: "revive",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
          },
        ])
      )
    );
    expect(state(restored.world)).toMatchObject({
      exhaustion: 5,
      vitals: { hitPoints: { current: 4 }, zeroHitPoints: null },
    });
  });

  it("spends one physical resource sequentially with definition CAS evidence", () => {
    const before = resourceWorld();
    const resource = {
      kind: "pool",
      owner: SELF,
      resourceId: "focus",
    } as const satisfies ResourceRef;
    const result = planned(
      planMechanicsTransaction(
        before,
        transaction(
          [
            {
              bindings: {},
              kind: "resource-transition",
              operationId: "spend-one",
              resource,
              causeId: INSTALLED_CAUSE.causeId,
              spec: COUNT_RESOURCE_SPEC,
              transition: { amount: 1, kind: "spend" },
            },
            {
              bindings: {},
              kind: "resource-transition",
              operationId: "spend-rest",
              resource,
              causeId: INSTALLED_CAUSE.causeId,
              spec: COUNT_RESOURCE_SPEC,
              transition: { amount: 2, kind: "spend" },
            },
          ],
          { factGuards: [resourceDefinitionFact(before, resource)] }
        )
      )
    );

    expect(state(result.world).resources.pools.focus).toMatchObject({ current: 0 });
    expect(result.executions.map(({ status }) => status)).toEqual(["applied", "applied"]);
    const facts = result.executions.flatMap((execution) =>
      execution.status === "applied" && execution.kind === "resource-transition"
        ? [execution.facts]
        : []
    );
    expect(facts).toEqual([
      {
        afterRemaining: 2,
        becameEmpty: false,
        beforeRemaining: 3,
        recoveryResolution: null,
        spentResolution: null,
      },
      {
        afterRemaining: 0,
        becameEmpty: true,
        beforeRemaining: 2,
        recoveryResolution: null,
        spentResolution: null,
      },
    ]);
    expect(result.action.mutations.map(({ path }) => path)).toEqual([
      ["resources", "pools", "focus", "current"],
    ]);

    expect(
      planMechanicsTransaction(
        before,
        transaction([
          {
            bindings: {},
            kind: "resource-transition",
            operationId: "unguarded",
            resource,
            causeId: INSTALLED_CAUSE.causeId,
            spec: COUNT_RESOURCE_SPEC,
            transition: { amount: 1, kind: "spend" },
          },
        ])
      )
    ).toEqual({
      operationId: null,
      reason: "missing-resource-definition-fact",
      status: "rejected",
    });
  });

  it("keeps resource definitions commit-only so later definition drift cannot block redo", () => {
    const before = resourceWorld();
    const resource = {
      kind: "pool",
      owner: SELF,
      resourceId: "focus",
    } as const satisfies ResourceRef;
    const definition = resourceDefinitionFact(before, resource);
    const result = planned(
      planMechanicsTransaction(
        before,
        transaction(
          [
            {
              bindings: {},
              kind: "resource-transition",
              operationId: "spend",
              resource,
              causeId: INSTALLED_CAUSE.causeId,
              spec: COUNT_RESOURCE_SPEC,
              transition: { amount: 1, kind: "spend" },
            },
          ],
          { factGuards: [definition] }
        )
      )
    );
    expect(result.action.guards.facts).toEqual([{ ...definition, lifecycle: "commit" }]);

    const committed = reduceActionJournal(
      toJournalWorld(before),
      { action: result.action, kind: "commit" },
      resolvedFacts(result.action)
    );
    expect(committed.status).toBe("applied");
    if (committed.status !== "applied") return;
    const undone = reduceActionJournal(
      committed.world,
      {
        action: result.action,
        documents: currentDocuments(committed.world, result.action),
        expectedGeneration: 1,
        kind: "undo",
      },
      []
    );
    expect(undone.status).toBe("applied");
    if (undone.status !== "applied") return;
    const redo = {
      action: result.action,
      documents: currentDocuments(undone.world, result.action),
      expectedGeneration: 2,
      kind: "redo",
    } as const;
    const driftedDefinition: ResolvedActionFact = {
      actual: { present: true, value: "changed-definition" },
      address: definition.address,
      owner: definition.owner,
    };
    expect(reduceActionJournal(undone.world, redo, [driftedDefinition])).toMatchObject({
      reason: "fact-conflict",
      status: "rejected",
    });

    const redone = reduceActionJournal(
      undone.world,
      redo,
      resolvedFacts(result.action, "redo")
    );
    expect(redone.status).toBe("applied");
    if (redone.status !== "applied") return;
    expect(redone.world.documents[0]?.data).toMatchObject({
      resources: { pools: { focus: { current: 2 } } },
    });
  });

  it("aborts cumulative resource overdraw and propagates missing roll input", () => {
    const before = resourceWorld(2);
    const resource = {
      kind: "pool",
      owner: SELF,
      resourceId: "focus",
    } as const satisfies ResourceRef;
    const fact = resourceDefinitionFact(before, resource);
    const spend = (operationId: string): MechanicsOperation => ({
      bindings: {},
      kind: "resource-transition",
      operationId,
      resource,
      causeId: INSTALLED_CAUSE.causeId,
      spec: COUNT_RESOURCE_SPEC,
      transition: { amount: 2, kind: "spend" },
    });
    expect(
      planMechanicsTransaction(
        before,
        transaction([spend("first"), spend("overdraw")], {
          factGuards: [fact],
        })
      )
    ).toEqual({
      operationId: "overdraw",
      reason: "resource-overdraw",
      status: "rejected",
    });
    expect(state(before).resources.pools.focus).toMatchObject({ current: 2 });

    const recoverySpec = {
      ...COUNT_RESOURCE_SPEC,
      recoveries: [
        {
          amount: {
            formula: {
              terms: [
                {
                  count: { kind: "fixed", value: 1 },
                  kind: "dice",
                  operation: "add",
                  sides: 6,
                  termId: "recovery",
                },
              ],
            },
            kind: "formula",
          },
          trigger: { kind: "manual" },
        },
      ],
    } as const satisfies ResourceSpec;
    const recovery = planMechanicsTransaction(
      before,
      transaction(
        [
          {
            bindings: {},
            kind: "resource-transition",
            operationId: "recover",
            resource,
            causeId: INSTALLED_CAUSE.causeId,
            spec: recoverySpec,
            transition: { kind: "recover", trigger: { kind: "manual" } },
          },
        ],
        {
          factGuards: [resourceDefinitionFact(before, resource, recoverySpec)],
        }
      )
    );
    expect(recovery).toMatchObject({
      boundary: "recovery",
      operationId: "recover",
      status: "needs-observation",
    });
    expect(recovery).not.toHaveProperty("action");
  });

  it("accepts only exact resource lifecycle commands and observations", () => {
    const resource = {
      kind: "pool",
      owner: SELF,
      resourceId: "new-focus",
    } as const satisfies ResourceRef;
    const initialize = initializeOperation("initialize", resource);
    const remove = {
      kind: "resource-remove",
      operationId: "remove",
      resource,
      causeId: INSTALLED_CAUSE.causeId,
    } as const satisfies MechanicsOperation;

    expect(conformMechanicsOperation(initialize)).toEqual(initialize);
    expect(conformMechanicsOperation(remove)).toEqual(remove);
    expect(conformMechanicsOperation({ ...initialize, legacyCurrent: 3 })).toBeNull();
    expect(
      conformMechanicsOperation({
        ...initialize,
        observations: {
          capacity: { aggregates: [], legacyRoll: 3, trails: [] },
        },
      })
    ).toBeNull();
    expect(conformMechanicsOperation({ ...remove, observations: {} })).toBeNull();
  });

  it("fails closed on lifecycle collisions, missing state, and fixed-shape cells", () => {
    const before = resourceWorld();
    const snapshot = structuredClone(before);
    const focus = {
      kind: "pool",
      owner: SELF,
      resourceId: "focus",
    } as const satisfies ResourceRef;
    const missing = { ...focus, resourceId: "missing" } as const satisfies ResourceRef;
    const currency = {
      character: CHARACTER,
      denomination: "gp",
      kind: "currency",
    } as const satisfies ResourceRef;
    const quantity = {
      character: CHARACTER,
      instanceId: "missing-item",
      instanceOrdinal: 1,
      kind: "item-quantity",
    } as const satisfies ResourceRef;

    expect(
      planMechanicsTransaction(
        before,
        transaction([initializeOperation("collision", focus)])
      )
    ).toEqual({
      operationId: "collision",
      reason: "resource-collision",
      status: "rejected",
    });
    expect(
      planMechanicsTransaction(
        before,
        transaction([
          {
            kind: "resource-remove",
            operationId: "missing",
            resource: missing,
            causeId: INSTALLED_CAUSE.causeId,
          },
        ])
      )
    ).toEqual({
      operationId: "missing",
      reason: "resource-missing",
      status: "rejected",
    });
    for (const [operationId, operation] of [
      ["initialize-currency", initializeOperation("initialize-currency", currency)],
      [
        "remove-quantity",
        {
          kind: "resource-remove",
          operationId: "remove-quantity",
          resource: quantity,
          causeId: INSTALLED_CAUSE.causeId,
        } satisfies MechanicsOperation,
      ],
    ] as const) {
      expect(planMechanicsTransaction(before, transaction([operation]))).toEqual({
        operationId,
        reason: "resource-fixed-shape",
        status: "rejected",
      });
    }
    expect(before).toEqual(snapshot);
  });

  it("suspends formula initialization at each physical observation boundary", () => {
    const resource = {
      kind: "pool",
      owner: SELF,
      resourceId: "rolled-capacity",
    } as const satisfies ResourceRef;
    const spec = {
      capacity: { formula: D4_FORMULA, kind: "formula" },
      id: "rolled-capacity",
      initial: { formula: D4_FORMULA, kind: "formula" },
      kind: "count",
      recoveries: [],
    } as const satisfies ResourceSpec;
    const before = parsedWorld(alive(10));
    const snapshot = structuredClone(before);

    const capacity = planMechanicsTransaction(
      before,
      transaction([initializeOperation("initialize", resource, spec)])
    );
    expect(capacity).toMatchObject({
      boundary: "capacity",
      operationId: "initialize",
      status: "needs-observation",
    });
    expect(capacity).not.toHaveProperty("action");
    expect(capacity).not.toHaveProperty("world");

    const initial = planMechanicsTransaction(
      before,
      transaction([
        initializeOperation("initialize", resource, spec, {
          capacity: diceObservation(4),
        }),
      ])
    );
    expect(initial).toMatchObject({
      boundary: "initial",
      operationId: "initialize",
      status: "needs-observation",
    });

    expect(
      planMechanicsTransaction(
        before,
        transaction([
          initializeOperation("invalid-roll", resource, spec, {
            capacity: diceObservation(5),
            initial: diceObservation(2),
          }),
        ])
      )
    ).toEqual({
      operationId: "invalid-roll",
      reason: "resource-invalid-observation",
      status: "rejected",
    });

    const result = planned(
      planMechanicsTransaction(
        before,
        transaction([
          initializeOperation("initialize", resource, spec, {
            capacity: diceObservation(4),
            initial: diceObservation(2),
          }),
        ])
      )
    );
    expect(state(result.world).resources.pools[resource.resourceId]).toMatchObject({
      capacity: { base: { kind: "formula", resolution: { total: 4 } } },
      current: 2,
    });
    expect(result.executions[0]).toMatchObject({
      facts: {
        cell: { current: 2, kind: "count" },
        observations: {
          capacity: diceObservation(4),
          initial: diceObservation(2),
        },
      },
      status: "applied",
    });
    expect(before).toEqual(snapshot);
  });

  it("aborts earlier consequences when initialization still needs a roll", () => {
    const before = parsedWorld(alive(10));
    const snapshot = structuredClone(before);
    const resource = {
      kind: "pool",
      owner: SELF,
      resourceId: "formula-resource",
    } as const satisfies ResourceRef;
    const spec = {
      ...BOUNDED_RESOURCE_SPEC,
      capacity: { formula: D4_FORMULA, kind: "formula" },
      id: "formula-resource",
      initial: { kind: "empty" },
    } as const satisfies ResourceSpec;
    const result = planMechanicsTransaction(
      before,
      transaction([
        creatureDamage("would-apply", SELF, 3, {
          maximumHitPoints: { kind: "fact", value: 10 },
        }),
        initializeOperation("needs-roll", resource, spec),
      ])
    );

    expect(result).toMatchObject({
      boundary: "capacity",
      operationId: "needs-roll",
      status: "needs-observation",
    });
    expect(result).not.toHaveProperty("action");
    expect(result).not.toHaveProperty("world");
    expect(before).toEqual(snapshot);
    expect(state(before).vitals.hitPoints.current).toBe(10);
  });

  it("chains initialize then transition, and transition then removal, atomically", () => {
    const resource = {
      kind: "pool",
      owner: SELF,
      resourceId: "focus",
    } as const satisfies ResourceRef;
    const emptyWorld = parsedWorld(alive(10));
    const initializedAndSpent = planned(
      planMechanicsTransaction(
        emptyWorld,
        transaction([
          initializeOperation("initialize", resource),
          {
            bindings: {},
            kind: "resource-transition",
            operationId: "spend",
            resource,
            causeId: INSTALLED_CAUSE.causeId,
            spec: BOUNDED_RESOURCE_SPEC,
            transition: { amount: 1, kind: "spend" },
          },
        ])
      )
    );
    expect(state(initializedAndSpent.world).resources.pools.focus).toMatchObject({
      current: 2,
    });
    expect(
      initializedAndSpent.executions.map(({ kind, status }) => [kind, status])
    ).toEqual([
      ["resource-initialize", "applied"],
      ["resource-transition", "applied"],
    ]);

    const populatedWorld = resourceWorld();
    const transitionedAndRemoved = planned(
      planMechanicsTransaction(
        populatedWorld,
        transaction(
          [
            {
              bindings: {},
              kind: "resource-transition",
              operationId: "spend",
              resource,
              causeId: INSTALLED_CAUSE.causeId,
              spec: COUNT_RESOURCE_SPEC,
              transition: { amount: 1, kind: "spend" },
            },
            {
              kind: "resource-remove",
              operationId: "remove",
              resource,
              causeId: INSTALLED_CAUSE.causeId,
            },
          ],
          { factGuards: [resourceDefinitionFact(populatedWorld, resource)] }
        )
      )
    );
    expect(state(transitionedAndRemoved.world).resources.pools).not.toHaveProperty(
      "focus"
    );
    expect(transitionedAndRemoved.executions[1]).toMatchObject({
      facts: { removed: { current: 2, kind: "count" } },
      kind: "resource-remove",
      status: "applied",
    });
    expect(transitionedAndRemoved.action.mutations.map(({ path }) => path)).toEqual([
      ["resources", "pools", "focus"],
    ]);
    expect(state(populatedWorld).resources.pools.focus).toMatchObject({ current: 3 });
  });

  it("deletes the final item quantity through resource closure", () => {
    const material = structuredClone(
      createEmptyCharacterMaterialState(1, CHARACTER, alive(10))
    );
    material.inventory.potion = {
      attuned: false,
      definition: { itemId: "potion-of-healing", kind: "catalogue" },
      disposition: "magical",
      enchantInstanceId: null,
      equipped: false,
      notes: "",
      ordinal: 1,
      overrides: {
        armorClass: null,
        attackBonus: null,
        damageFormula: null,
        damageType: null,
        name: null,
      },
      ownerOccurrence: null,
      quantity: countResource(1),
      resources: {},
      tags: [],
    };
    material.nextInventoryOrdinal = 2;
    const before = parsedCharacterState(material);
    const itemCause = installedCause(inventoryAuthority("potion", 1));
    const resource = {
      character: CHARACTER,
      instanceId: "potion",
      instanceOrdinal: 1,
      kind: "item-quantity",
    } as const satisfies ResourceRef;
    const quantitySpec = {
      ...COUNT_RESOURCE_SPEC,
      id: "item-quantity",
    } as const satisfies ResourceSpec;
    const result = planned(
      planMechanicsTransaction(
        before,
        transaction(
          [
            {
              bindings: {},
              causeId: itemCause.causeId,
              kind: "resource-transition",
              operationId: "drink-potion",
              resource,
              spec: quantitySpec,
              transition: { amount: 1, kind: "spend" },
            },
          ],
          {
            causes: [itemCause],
            factGuards: [resourceDefinitionFact(before, resource, quantitySpec)],
          }
        )
      )
    );
    expect(state(result.world).inventory).not.toHaveProperty("potion");
    expect(result.action.mutations.map(({ path }) => path)).toEqual([
      ["inventory", "potion"],
    ]);
  });

  it("rejects ABA reuse when one inventory id names a new physical ordinal", () => {
    const material = structuredClone(
      createEmptyCharacterMaterialState(1, CHARACTER, alive(10))
    );
    material.inventory.wand = {
      attuned: false,
      definition: { itemId: "wand-of-magic-missiles", kind: "catalogue" },
      disposition: "magical",
      enchantInstanceId: null,
      equipped: false,
      notes: "",
      ordinal: 2,
      overrides: {
        armorClass: null,
        attackBonus: null,
        damageFormula: null,
        damageType: null,
        name: null,
      },
      ownerOccurrence: null,
      quantity: countResource(1),
      resources: {},
      tags: [],
    };
    material.nextInventoryOrdinal = 3;
    const before = parsedCharacterState(material);
    const staleCause = installedCause(inventoryAuthority("wand", 1));
    const operation = {
      ...creatureDamage("stale-wand", SELF, 1, {
        maximumHitPoints: { kind: "fact", value: 10 },
      }),
      causeId: staleCause.causeId,
    };
    expect(
      planMechanicsTransaction(before, transaction([operation], { causes: [staleCause] }))
    ).toEqual({
      operationId: "stale-wand",
      reason: "invalid-cause",
      status: "rejected",
    });
  });

  it("leases a final consumable through cost and effects, then rejects reuse", () => {
    const material = structuredClone(
      createEmptyCharacterMaterialState(1, CHARACTER, alive(10))
    );
    material.inventory.potion = {
      attuned: false,
      definition: { itemId: "potion-of-speed", kind: "catalogue" },
      disposition: "magical",
      enchantInstanceId: null,
      equipped: false,
      notes: "",
      ordinal: 1,
      overrides: {
        armorClass: null,
        attackBonus: null,
        damageFormula: null,
        damageType: null,
        name: null,
      },
      ownerOccurrence: null,
      quantity: countResource(1),
      resources: {},
      tags: [],
    };
    material.nextInventoryOrdinal = 2;
    const before = parsedCharacterState(material);
    const authority = inventoryAuthority("potion", 1);
    const itemCause = installedCause(authority);
    const resource = {
      character: CHARACTER,
      instanceId: "potion",
      instanceOrdinal: 1,
      kind: "item-quantity",
    } as const satisfies ResourceRef;
    const quantitySpec = {
      ...COUNT_RESOURCE_SPEC,
      id: "item-quantity",
    } as const satisfies ResourceSpec;
    const activated = planned(
      planMechanicsTransaction(
        before,
        transaction(
          [
            {
              bindings: {},
              causeId: itemCause.causeId,
              kind: "resource-transition",
              operationId: "drink",
              resource,
              spec: quantitySpec,
              transition: { amount: 1, kind: "spend" },
            },
            {
              causeId: itemCause.causeId,
              kind: "occurrence-create",
              material: CHARACTER,
              occurrence: {
                endRules: [],
                kind: "program",
                phaseState: {
                  invoke: { execution: 0, lastTriggerEventId: null },
                },
                registers: {},
              },
              occurrenceId: "potion-root",
              operationId: "create-root",
            },
            {
              causeId: itemCause.causeId,
              conditionImmunityOverride: null,
              kind: "occurrence-create",
              material: CHARACTER,
              occurrence: {
                endRules: [],
                fact: { key: "haste", kind: "active-key" },
                kind: "standing",
                parentId: "potion-root",
                target: SELF,
              },
              occurrenceId: "potion-effect",
              operationId: "apply-effect",
            },
          ],
          {
            causes: [itemCause],
            factGuards: [resourceDefinitionFact(before, resource, quantitySpec)],
          }
        )
      )
    );
    expect(state(activated.world).inventory.potion?.quantity.current).toBe(0);
    expect(state(activated.world).occurrences).toHaveProperty("potion-root");
    expect(state(activated.world).occurrences).toHaveProperty("potion-effect");

    expect(
      planMechanicsTransaction(
        activated.world,
        transaction(
          [
            {
              ...creatureDamage("reuse-empty-potion", SELF, 1, {
                maximumHitPoints: { kind: "fact", value: 10 },
              }),
              causeId: itemCause.causeId,
            },
          ],
          { actionId: "reuse-empty-potion", causes: [itemCause] }
        )
      )
    ).toEqual({
      operationId: "reuse-empty-potion",
      reason: "invalid-cause",
      status: "rejected",
    });

    const rootCause = programRootCause(authority, "potion-root");
    const ended = planned(
      planMechanicsTransaction(
        activated.world,
        transaction(
          [
            {
              causeId: rootCause.causeId,
              kind: "occurrence-end",
              occurrence: { material: CHARACTER, occurrenceId: "potion-root" },
              operationId: "end-potion-effect",
            },
          ],
          { actionId: "end-potion-effect", causes: [rootCause] }
        )
      )
    );
    expect(state(ended.world).occurrences).not.toHaveProperty("potion-root");
    expect(state(ended.world).occurrences).not.toHaveProperty("potion-effect");
    expect(state(ended.world).inventory).not.toHaveProperty("potion");
    expectExactActionRoundTrip(activated.world, ended);
  });

  it("rejects bad authority, targets, kinds, and maximum evidence", () => {
    const before = parsedWorld(alive(10), {
      dismissed: creature(alive(5), false),
      door: object(7, 2),
    });
    const missingActor = { entityId: "missing", material: CHARACTER } as const;
    expect(
      planMechanicsTransaction(
        before,
        transaction(
          [
            creatureDamage("damage", SELF, 1, {
              maximumHitPoints: { kind: "fact", value: 10 },
            }),
          ],
          { actor: missingActor }
        )
      )
    ).toEqual({ operationId: null, reason: "missing-actor", status: "rejected" });

    const missingAuthority = inventoryAuthority("missing", 1);
    const missingCause = installedCause(missingAuthority);
    const missingAuthorityOperation: MechanicsOperation = {
      ...creatureDamage("source", SELF, 1, {
        maximumHitPoints: { kind: "fact", value: 10 },
      }),
      causeId: missingCause.causeId,
    };
    expect(
      planMechanicsTransaction(
        before,
        transaction([missingAuthorityOperation], { causes: [missingCause] })
      )
    ).toEqual({
      operationId: "source",
      reason: "invalid-cause",
      status: "rejected",
    });

    const unavailable = { entityId: "dismissed", material: CHARACTER } as const;
    expect(
      planMechanicsTransaction(
        before,
        transaction([creatureDamage("unavailable", unavailable, 1)])
      )
    ).toEqual({
      operationId: "unavailable",
      reason: "target-unavailable",
      status: "rejected",
    });

    const door = { entityId: "door", material: CHARACTER } as const;
    expect(
      planMechanicsTransaction(
        before,
        transaction([creatureDamage("wrong-kind", door, 1)])
      )
    ).toEqual({
      operationId: "wrong-kind",
      reason: "wrong-target-kind",
      status: "rejected",
    });

    expect(
      planMechanicsTransaction(
        before,
        transaction([
          creatureDamage("stale", SELF, 1, {
            maximumHitPoints: { kind: "fact", value: 5 },
          }),
        ])
      )
    ).toEqual({
      operationId: "stale",
      reason: "stale-hit-point-maximum",
      status: "rejected",
    });
    expect(
      planMechanicsTransaction(
        before,
        transaction([creatureDamage("missing-max", SELF, 1)])
      )
    ).toEqual({
      operationId: "missing-max",
      reason: "missing-hit-point-maximum",
      status: "rejected",
    });
  });

  it("deduplicates equal semantic facts and rejects conflicting facts", () => {
    const maximum: ActionFactGuard = {
      address: ["hit-point-maximum"],
      expected: { present: true, value: 10 },
      lifecycle: "commit-redo",
      owner: SELF,
    };
    const operation = creatureDamage("damage", SELF, 1, {
      maximumHitPoints: { kind: "fact", value: 10 },
    });
    const result = planned(
      planMechanicsTransaction(
        parsedWorld(alive(10)),
        transaction([operation], { factGuards: [maximum] })
      )
    );
    expect(result.action.guards.facts).toEqual([maximum]);

    expect(
      planMechanicsTransaction(
        parsedWorld(alive(10)),
        transaction([operation], {
          factGuards: [
            {
              ...maximum,
              expected: { present: true, value: 9 },
            },
          ],
        })
      )
    ).toEqual({ operationId: null, reason: "fact-conflict", status: "rejected" });

    expect(
      planMechanicsTransaction(
        parsedWorld(alive(10)),
        transaction([operation], {
          factGuards: [{ ...maximum, lifecycle: "commit" }],
        })
      )
    ).toEqual({ operationId: null, reason: "fact-conflict", status: "rejected" });
  });

  it("commits once, fences stale state, and undo-redoes the complete batch", () => {
    const before = parsedWorld(alive(10));
    const result = planned(
      planMechanicsTransaction(
        before,
        transaction(
          [
            creatureDamage("damage", SELF, 4, {
              maximumHitPoints: { kind: "fact", value: 10 },
            }),
            {
              input: { amount: 1, maximumHitPoints: 10 },
              kind: "creature-healing",
              maximumHitPointsSource: { kind: "fact" },
              operationId: "heal",
              causeId: INSTALLED_CAUSE.causeId,
              target: SELF,
            },
          ],
          { actionId: "whole-action" }
        )
      )
    );
    const journalBefore = toJournalWorld(before);
    const facts = resolvedFacts(result.action);
    const stale: ActionJournalWorld = {
      ...journalBefore,
      documents: journalBefore.documents.map((document) => ({
        ...document,
        journal: { ...document.journal, revision: document.journal.revision + 1 },
      })),
    };
    expect(
      reduceActionJournal(stale, { action: result.action, kind: "commit" }, facts)
    ).toMatchObject({ reason: "document-conflict", status: "rejected" });

    const committed = reduceActionJournal(
      journalBefore,
      { action: result.action, kind: "commit" },
      facts
    );
    expect(committed.status).toBe("applied");
    if (committed.status !== "applied") return;
    expect(committed.world.documents[0]?.data).toMatchObject({
      vitals: { hitPoints: { current: 7 } },
    });

    const undone = reduceActionJournal(
      committed.world,
      {
        action: result.action,
        documents: currentDocuments(committed.world, result.action),
        expectedGeneration: 1,
        kind: "undo",
      },
      facts
    );
    expect(undone.status).toBe("applied");
    if (undone.status !== "applied") return;
    expect(undone.world.documents[0]?.data).toMatchObject({
      vitals: { hitPoints: { current: 10 } },
    });

    const staleRedoFacts = resolvedFacts(result.action, "redo").map((fact) => ({
      ...fact,
      actual: { present: true, value: 11 } as const,
    }));
    expect(
      reduceActionJournal(
        undone.world,
        {
          action: result.action,
          documents: currentDocuments(undone.world, result.action),
          expectedGeneration: 2,
          kind: "redo",
        },
        staleRedoFacts
      )
    ).toMatchObject({ reason: "fact-conflict", status: "rejected" });

    const redone = reduceActionJournal(
      undone.world,
      {
        action: result.action,
        documents: currentDocuments(undone.world, result.action),
        expectedGeneration: 2,
        kind: "redo",
      },
      resolvedFacts(result.action, "redo")
    );
    expect(redone.status).toBe("applied");
    if (redone.status !== "applied") return;
    expect(redone.world.documents[0]?.data).toMatchObject({
      vitals: { hitPoints: { current: 7 } },
    });
  });
});
