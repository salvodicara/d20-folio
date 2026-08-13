/** Pure conformance, keys and semantic addresses for mechanics authority identities. */

import { journalActorRefKey } from "@/lib/action-journal";
import { canonicalJson, conformCanonicalFingerprint } from "@/lib/canonical-fingerprint";
import {
  exactConformer,
  type ExactSchemaContext,
  type ExactSchemaCustomConformers,
} from "@/lib/exact-schema";
import {
  HOMEBREW_DEFINITION_OWNER_REF_SCHEMA,
  MECHANICS_CAPABILITY_INSTALLATION_REF_SCHEMA,
  MECHANICS_CAPABILITY_REF_SCHEMA,
  MECHANICS_DEFINITION_REF_SCHEMA,
  MECHANICS_INVOCATION_REF_SCHEMA,
  MECHANICS_SOURCE_REF_SCHEMA,
  TABLE_DECLARATION_MECHANICS_DEFINITION_REF_SCHEMA,
  type MechanicsAuthorityRefSchemaCustomTypes,
} from "@/lib/mechanics-authority-ref-schema";
import {
  MATERIAL_REF_SCHEMA,
  conformMaterialEntityId,
  conformMechanicId,
  type MaterialRefSchemaShape,
} from "@/lib/mechanics-reference-schema";
import type { JournalActorRef, JournalPath } from "@/types/action-journal";
import type {
  HomebrewDefinitionOwnerRef,
  MechanicsCapabilityInstallationRef,
  MechanicsCapabilityRef,
  MechanicsDefinitionRef,
  MechanicsInvocationRef,
  MechanicsSourceRef,
  TableDeclarationMechanicsDefinitionRef,
} from "@/types/mechanics-authority-ref";
import type {
  EntityRef,
  MaterialEntityRef,
  MaterialRef,
} from "@/types/mechanics-reference";

type MechanicsAuthorityRefSchemaRefTypes = {
  readonly "material-ref": MaterialRefSchemaShape;
};

function conformPositiveInteger(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    !Object.is(value, -0)
    ? value
    : null;
}

/** Shared custom bindings for schemas that embed an authority-reference schema. */
export const MECHANICS_AUTHORITY_REF_SCHEMA_CUSTOMS: ExactSchemaCustomConformers<MechanicsAuthorityRefSchemaCustomTypes> =
  {
    id: conformMechanicId,
    "material-entity-id": conformMaterialEntityId,
    "mechanics-revision": conformCanonicalFingerprint,
    "positive-integer": conformPositiveInteger,
  };

/** Shared named schemas for schemas that embed an authority-reference schema. */
export const MECHANICS_AUTHORITY_REF_SCHEMA_REFS = {
  "material-ref": MATERIAL_REF_SCHEMA,
} as const;

const SCHEMA_CONTEXT: ExactSchemaContext<
  MechanicsAuthorityRefSchemaCustomTypes,
  MechanicsAuthorityRefSchemaRefTypes
> = {
  customs: MECHANICS_AUTHORITY_REF_SCHEMA_CUSTOMS,
  refs: MECHANICS_AUTHORITY_REF_SCHEMA_REFS,
};

const conformHomebrewDefinitionOwnerRefStructure = exactConformer(
  HOMEBREW_DEFINITION_OWNER_REF_SCHEMA,
  SCHEMA_CONTEXT
);
const conformMechanicsDefinitionRefStructure = exactConformer(
  MECHANICS_DEFINITION_REF_SCHEMA,
  SCHEMA_CONTEXT
);
const conformTableDeclarationMechanicsDefinitionRefStructure = exactConformer(
  TABLE_DECLARATION_MECHANICS_DEFINITION_REF_SCHEMA,
  SCHEMA_CONTEXT
);
const conformMechanicsCapabilityRefStructure = exactConformer(
  MECHANICS_CAPABILITY_REF_SCHEMA,
  SCHEMA_CONTEXT
);
const conformMechanicsSourceRefStructure = exactConformer(
  MECHANICS_SOURCE_REF_SCHEMA,
  SCHEMA_CONTEXT
);
const conformMechanicsCapabilityInstallationRefStructure = exactConformer(
  MECHANICS_CAPABILITY_INSTALLATION_REF_SCHEMA,
  SCHEMA_CONTEXT
);
const conformMechanicsInvocationRefStructure = exactConformer(
  MECHANICS_INVOCATION_REF_SCHEMA,
  SCHEMA_CONTEXT
);

export function conformHomebrewDefinitionOwnerRef(
  value: unknown
): Readonly<HomebrewDefinitionOwnerRef> | null {
  return conformHomebrewDefinitionOwnerRefStructure(value);
}

export function conformMechanicsDefinitionRef(
  value: unknown
): Readonly<MechanicsDefinitionRef> | null {
  return conformMechanicsDefinitionRefStructure(value);
}

export function conformTableDeclarationMechanicsDefinitionRef(
  value: unknown
): Readonly<TableDeclarationMechanicsDefinitionRef> | null {
  return conformTableDeclarationMechanicsDefinitionRefStructure(value);
}

export function conformMechanicsCapabilityRef(
  value: unknown
): Readonly<MechanicsCapabilityRef> | null {
  return conformMechanicsCapabilityRefStructure(value);
}

export function conformMechanicsSourceRef(
  value: unknown
): Readonly<MechanicsSourceRef> | null {
  return conformMechanicsSourceRefStructure(value);
}

export function conformMechanicsCapabilityInstallationRef(
  value: unknown
): Readonly<MechanicsCapabilityInstallationRef> | null {
  return conformMechanicsCapabilityInstallationRefStructure(value);
}

export function conformMechanicsInvocationRef(
  value: unknown
): Readonly<MechanicsInvocationRef> | null {
  return conformMechanicsInvocationRefStructure(value);
}

export function homebrewDefinitionOwnerRefKey(value: HomebrewDefinitionOwnerRef): string {
  return canonicalJson(value);
}

export function mechanicsDefinitionRefKey(value: MechanicsDefinitionRef): string {
  return canonicalJson(value);
}

export function tableDeclarationMechanicsDefinitionRefKey(
  value: TableDeclarationMechanicsDefinitionRef
): string {
  return canonicalJson(value);
}

export function mechanicsCapabilityRefKey(value: MechanicsCapabilityRef): string {
  return canonicalJson(value);
}

export function mechanicsSourceRefKey(value: MechanicsSourceRef): string {
  return canonicalJson(value);
}

export function mechanicsCapabilityInstallationRefKey(
  value: MechanicsCapabilityInstallationRef
): string {
  return canonicalJson({
    capability: value.capability,
    generation: value.generation,
    installationId: value.installationId,
    owner: journalActorRefKey(value.owner),
  });
}

export function mechanicsInvocationRefKey(value: MechanicsInvocationRef): string {
  return canonicalJson(value);
}

function isEntityActor(owner: JournalActorRef): owner is EntityRef {
  return !("kind" in owner);
}

function materialAddressSegments(material: MaterialRef): readonly string[] {
  return material.kind === "character-play"
    ? [material.kind, material.uid, material.characterId]
    : [material.kind, material.campaignId];
}

function entityAddressSegments(entity: MaterialEntityRef): readonly string[] {
  return [
    ...materialAddressSegments(entity.material),
    entity.entityId,
    positiveIntegerSegment(entity.ordinal),
  ];
}

function positiveIntegerSegment(value: number): string {
  return String(value);
}

function conformCounter(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    !Object.is(value, -0)
    ? value
    : null;
}

function conformSemanticPath(value: unknown): readonly string[] | null {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > 14
  ) {
    return null;
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || keys.at(-1) !== "length") return null;
  const result: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (keys[index] !== String(index)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor?.enumerable !== true || !("value" in descriptor)) return null;
    const segment = conformMechanicId(descriptor.value);
    if (!segment) return null;
    result.push(segment);
  }
  return result;
}

function freezePath(segments: readonly string[]): JournalPath {
  return Object.freeze([...segments]) as JournalPath;
}

/** Stable physical installation slot; generation lives in the guarded closure. */
export function mechanicsInstallationFactAddress(
  value: MechanicsCapabilityInstallationRef
): JournalPath {
  const installation = conformMechanicsCapabilityInstallationRef(value);
  if (!installation) throw new TypeError("Invalid mechanics capability installation");
  const ownerSegments = isEntityActor(installation.owner)
    ? ["entity", installation.owner.entityId]
    : ["material-authority", installation.owner.authority];
  return freezePath([
    "mechanics-installation",
    ...materialAddressSegments(installation.owner.material),
    ...ownerSegments,
    installation.installationId,
  ]);
}

/** Address of one immutable authoritative definition fact. */
export function mechanicsDefinitionFactAddress(
  value: MechanicsDefinitionRef
): JournalPath {
  const definition = conformMechanicsDefinitionRef(value);
  if (!definition) throw new TypeError("Invalid mechanics definition reference");
  if (definition.kind === "catalogue") {
    return freezePath([
      "mechanics-definition",
      definition.kind,
      definition.catalogueKind,
      definition.entityId,
      "revision",
      definition.mechanicsRevision,
    ]);
  }
  if (definition.kind === "table-declaration") {
    return freezePath([
      "mechanics-definition",
      definition.kind,
      ...materialAddressSegments(definition.material),
      definition.authority,
      definition.declarationId,
      positiveIntegerSegment(definition.generation),
    ]);
  }
  const prefix = ["mechanics-definition", definition.kind] as const;
  const generation = positiveIntegerSegment(definition.generation);
  if (definition.owner.kind === "character-build") {
    return freezePath([
      ...prefix,
      definition.owner.kind,
      ...materialAddressSegments(definition.owner.character),
      definition.owner.collection,
      definition.owner.entryId,
      generation,
    ]);
  }
  if (definition.owner.kind === "inventory-item") {
    return freezePath([
      ...prefix,
      definition.owner.kind,
      ...materialAddressSegments(definition.owner.character),
      definition.owner.instanceId,
      positiveIntegerSegment(definition.owner.instanceOrdinal),
      generation,
    ]);
  }
  return freezePath([
    ...prefix,
    definition.owner.kind,
    ...entityAddressSegments(definition.owner.entity),
    generation,
  ]);
}

/** Address of one resource definition below its immutable authority definition. */
export function mechanicsResourceFactAddress(
  definition: MechanicsDefinitionRef,
  resourceId: string
): JournalPath {
  const id = conformMechanicId(resourceId);
  if (!id) throw new TypeError("Invalid mechanics resource id");
  return freezePath([...mechanicsDefinitionFactAddress(definition), "resource", id]);
}

/** Address of one semantic fact inside an exact character-build revision. */
export function mechanicsBuildFactAddress(
  buildRevision: number,
  semanticPath: readonly string[] = []
): JournalPath {
  const revision = conformCounter(buildRevision);
  if (revision === null) throw new TypeError("Invalid build revision");
  const path = conformSemanticPath(semanticPath);
  if (!path) throw new TypeError("Invalid semantic build path");
  return freezePath(["build", String(revision), ...path]);
}
