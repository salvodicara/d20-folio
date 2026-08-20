import { conformActionFactGuard, journalActorRefKey } from "@/lib/action-journal";
import {
  canonicalFingerprint,
  canonicalJson,
  type CanonicalFingerprint,
} from "@/lib/canonical-fingerprint";
import { exactConformer, type ExactSchemaContext } from "@/lib/exact-schema";
import { conformIntegerBindings } from "@/lib/integer-expression";
import {
  MECHANICS_AUTHORITY_DEFINITION_SCHEMA,
  MECHANICS_AUTHORITY_SNAPSHOT_SCHEMA,
  type MechanicsAuthoritySchemaCustomTypes,
} from "@/lib/mechanics-authority-schema";
import {
  MECHANICS_AUTHORITY_REF_SCHEMA_REFS,
  conformMechanicsInvocationRef,
  mechanicsCapabilityInstallationRefKey,
  mechanicsDefinitionFactAddress,
  mechanicsInstallationFactAddress,
} from "@/lib/mechanics-authority-ref";
import {
  MECHANICS_CAPABILITY_SCHEMA_CUSTOMS,
  conformMechanicsCapabilitySnapshot,
  mechanicsCapabilitySnapshotFingerprint,
} from "@/lib/mechanics-capability";
import { conformMechanicsProgramAuthorityReceipt } from "@/lib/mechanics-program-receipt";
import type { MaterialRefSchemaShape } from "@/lib/mechanics-reference-schema";
import type { ActionFactGuard, JournalActorRef } from "@/types/action-journal";
import type { EntityRef } from "@/types/mechanics-reference";
import type {
  MechanicsAuthorityDefinition,
  MechanicsAuthoritySnapshot,
} from "@/types/mechanics-authority";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";

type MechanicsAuthoritySchemaRefTypes = {
  readonly "material-ref": MaterialRefSchemaShape;
};

const SCHEMA_CONTEXT: ExactSchemaContext<
  MechanicsAuthoritySchemaCustomTypes,
  MechanicsAuthoritySchemaRefTypes
> = {
  customs: {
    ...MECHANICS_CAPABILITY_SCHEMA_CUSTOMS,
    "action-fact": conformActionFactGuard,
    "integer-bindings": conformIntegerBindings,
  },
  refs: MECHANICS_AUTHORITY_REF_SCHEMA_REFS,
};

const conformMechanicsAuthorityDefinitionStructure = exactConformer(
  MECHANICS_AUTHORITY_DEFINITION_SCHEMA,
  SCHEMA_CONTEXT
);
const conformMechanicsAuthoritySnapshotStructure = exactConformer(
  MECHANICS_AUTHORITY_SNAPSHOT_SCHEMA,
  SCHEMA_CONTEXT
);

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function factGuardKey(guard: ActionFactGuard): string {
  return `${journalActorRefKey(guard.owner)}\u0000${canonicalJson(guard.address)}`;
}

function isEntityActor(owner: JournalActorRef): owner is EntityRef {
  return !("kind" in owner);
}

function programAuthorityReceipt(
  definition: MechanicsAuthorityDefinition
): Readonly<MechanicsProgramAuthorityReceipt> | null {
  return conformMechanicsProgramAuthorityReceipt({
    anchors: definition.anchors,
    installation: definition.installation,
    schema: 1,
    snapshot: definition.snapshot,
    source: definition.source,
    staticBindings: definition.staticBindings,
  });
}

function definitionClosureSemantics(definition: MechanicsAuthorityDefinition): boolean {
  const snapshot = conformMechanicsCapabilitySnapshot(definition.snapshot);
  if (
    !snapshot ||
    !sameCanonical(definition.installation.owner, definition.owner) ||
    !sameCanonical(definition.installation.capability, snapshot.ref) ||
    (snapshot.program !== null && programAuthorityReceipt(definition) === null)
  ) {
    return false;
  }

  if (definition.actorSpec.kind === "role") {
    const actor = definition.anchors[definition.actorSpec.role];
    return (
      actor !== null &&
      isEntityActor(definition.owner) &&
      sameCanonical(definition.owner, actor)
    );
  }

  const definitionRef = snapshot.ref.definition;
  return (
    !isEntityActor(definition.owner) &&
    definitionRef.kind === "table-declaration" &&
    definition.source.kind === "table-declaration" &&
    sameCanonical(definitionRef, definition.source) &&
    sameCanonical(definition.owner.material, definitionRef.material) &&
    definition.owner.authority === definitionRef.authority
  );
}

/**
 * Stable fingerprint of the complete installed closure, excluding its own CAS
 * guards so the installation guard is non-recursive.
 */
export function mechanicsAuthorityDefinitionFingerprint(
  value: MechanicsAuthorityDefinition
): CanonicalFingerprint {
  const definition = conformMechanicsAuthorityDefinitionStructure(value);
  if (!definition || !definitionClosureSemantics(definition)) {
    throw new TypeError("Invalid mechanics authority definition closure");
  }
  return canonicalFingerprint({
    actorSpec: definition.actorSpec,
    anchors: definition.anchors,
    capabilityFingerprint: mechanicsCapabilitySnapshotFingerprint(definition.snapshot),
    installation: definition.installation,
    owner: definition.owner,
    source: definition.source,
    staticBindings: definition.staticBindings,
  });
}

function guardsAreCanonical(guards: readonly ActionFactGuard[]): boolean {
  let previous: string | undefined;
  for (const guard of guards) {
    const key = factGuardKey(guard);
    if (previous !== undefined && previous >= key) return false;
    previous = key;
  }
  return true;
}

function definitionSemantics(definition: MechanicsAuthorityDefinition): boolean {
  if (
    !definitionClosureSemantics(definition) ||
    definition.definitionGuards.some((guard) => guard.lifecycle !== "commit") ||
    definition.installationGuards.some((guard) => guard.lifecycle !== "commit") ||
    !guardsAreCanonical(definition.definitionGuards) ||
    !guardsAreCanonical(definition.installationGuards)
  ) {
    return false;
  }

  const allGuardKeys = [
    ...definition.definitionGuards.map(factGuardKey),
    ...definition.installationGuards.map(factGuardKey),
  ];
  if (new Set(allGuardKeys).size !== allGuardKeys.length) return false;

  const definitionFingerprint = mechanicsCapabilitySnapshotFingerprint(
    definition.snapshot
  );
  const hasDefinitionGuard = definition.definitionGuards.some(
    (guard) =>
      sameCanonical(guard.owner, definition.owner) &&
      sameCanonical(
        guard.address,
        mechanicsDefinitionFactAddress(definition.snapshot.ref.definition)
      ) &&
      guard.expected.present &&
      guard.expected.value === definitionFingerprint
  );
  if (!hasDefinitionGuard) return false;

  const installationFingerprint = mechanicsAuthorityDefinitionFingerprint(definition);
  return definition.installationGuards.some(
    (guard) =>
      sameCanonical(guard.owner, definition.owner) &&
      sameCanonical(
        guard.address,
        mechanicsInstallationFactAddress(definition.installation)
      ) &&
      guard.expected.present &&
      guard.expected.value === installationFingerprint
  );
}

export function conformMechanicsAuthorityDefinition(
  value: unknown
): Readonly<MechanicsAuthorityDefinition> | null {
  const definition = conformMechanicsAuthorityDefinitionStructure(value);
  return definition && definitionSemantics(definition) ? definition : null;
}

/**
 * Project the sole durable authority carried by a program root. The complete
 * invocation closure is revalidated first; actor policy and transient CAS guards
 * never leak into the persisted occurrence.
 */
export function resolveMechanicsProgramAuthorityReceipt(
  value: unknown
): Readonly<MechanicsProgramAuthorityReceipt> | null {
  const definition = conformMechanicsAuthorityDefinition(value);
  return definition ? programAuthorityReceipt(definition) : null;
}

export function mechanicsAuthorityDefinitionKey(
  value: MechanicsAuthorityDefinition
): string {
  return mechanicsCapabilityInstallationRefKey(value.installation);
}

export function conformMechanicsAuthoritySnapshot(
  value: unknown
): Readonly<MechanicsAuthoritySnapshot> | null {
  const snapshot = conformMechanicsAuthoritySnapshotStructure(value);
  if (!snapshot) return null;
  let previous: string | null = null;
  const installationIdentities = new Set<string>();
  for (const definition of snapshot.definitions) {
    if (!conformMechanicsAuthorityDefinition(definition)) return null;
    const key = mechanicsAuthorityDefinitionKey(definition);
    const installationIdentity = `${journalActorRefKey(definition.owner)}\u0000${
      definition.installation.installationId
    }`;
    if (
      installationIdentities.has(installationIdentity) ||
      (previous !== null && previous >= key)
    ) {
      return null;
    }
    installationIdentities.add(installationIdentity);
    previous = key;
  }
  return snapshot;
}

export function mechanicsAuthoritySnapshotKey(
  value: MechanicsAuthoritySnapshot
): CanonicalFingerprint {
  const snapshot = conformMechanicsAuthoritySnapshot(value);
  if (!snapshot) throw new TypeError("Invalid mechanics authority snapshot");
  return canonicalFingerprint(snapshot);
}

/** Exact installed-capability lookup; program-root invocations resolve elsewhere. */
export function resolveInstalledMechanicsCapability(
  snapshotValue: unknown,
  invocationValue: unknown
): Readonly<MechanicsAuthorityDefinition> | null {
  const snapshot = conformMechanicsAuthoritySnapshot(snapshotValue);
  const invocation = conformMechanicsInvocationRef(invocationValue);
  if (!snapshot || invocation?.kind !== "installed-capability") return null;
  const key = mechanicsCapabilityInstallationRefKey(invocation.installation);
  return (
    snapshot.definitions.find(
      (definition) => mechanicsAuthorityDefinitionKey(definition) === key
    ) ?? null
  );
}
