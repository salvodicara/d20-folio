/** Exact low-dependency grammar for authoritative mechanics identities. */

import type { CanonicalFingerprint } from "@/lib/canonical-fingerprint";
import {
  customSchema,
  discriminatedUnionSchema,
  literalSchema,
  objectSchema,
  unionSchema,
  type InferExactSchema,
} from "@/lib/exact-schema";
import {
  CHARACTER_MATERIAL_REF_SCHEMA,
  ENTITY_REF_SCHEMA,
  MATERIAL_ENTITY_REF_SCHEMA,
  MATERIAL_REF_SCHEMA,
  OCCURRENCE_GENERATION_REF_SCHEMA,
} from "@/lib/mechanics-reference-schema";

const ID_SCHEMA = customSchema<"id", string>("id");
const POSITIVE_INTEGER_SCHEMA = customSchema<"positive-integer", number>(
  "positive-integer"
);
const MECHANICS_REVISION_SCHEMA = customSchema<
  "mechanics-revision",
  CanonicalFingerprint
>("mechanics-revision");
const NULL_SCHEMA = literalSchema(null);

export type MechanicsRevisionSchemaShape = CanonicalFingerprint;

export type MechanicsAuthorityRefSchemaCustomTypes = {
  readonly id: string;
  readonly "material-entity-id": string;
  readonly "mechanics-revision": MechanicsRevisionSchemaShape;
  readonly "positive-integer": number;
};

export const JOURNAL_ACTOR_REF_SCHEMA = unionSchema([
  ENTITY_REF_SCHEMA,
  objectSchema({
    authority: unionSchema([literalSchema("environment"), literalSchema("table")]),
    kind: literalSchema("material-authority"),
    material: MATERIAL_REF_SCHEMA,
  }),
]);

export const CATALOGUE_KIND_SCHEMA = unionSchema([
  literalSchema("background"),
  literalSchema("class"),
  literalSchema("class-feature"),
  literalSchema("companion"),
  literalSchema("condition"),
  literalSchema("feat"),
  literalSchema("invocation"),
  literalSchema("item"),
  literalSchema("maneuver"),
  literalSchema("metamagic"),
  literalSchema("monster"),
  literalSchema("object"),
  literalSchema("species"),
  literalSchema("spell"),
  literalSchema("subclass"),
  literalSchema("system"),
  literalSchema("weapon"),
]);

export type CatalogueKindSchemaShape = InferExactSchema<typeof CATALOGUE_KIND_SCHEMA>;

export const HOMEBREW_DEFINITION_OWNER_REF_SCHEMA = discriminatedUnionSchema("kind", {
  "character-build": objectSchema({
    character: CHARACTER_MATERIAL_REF_SCHEMA,
    collection: unionSchema([
      literalSchema("condition"),
      literalSchema("feature"),
      literalSchema("spell"),
    ]),
    entryId: ID_SCHEMA,
    kind: literalSchema("character-build"),
  }),
  "inventory-item": objectSchema({
    character: CHARACTER_MATERIAL_REF_SCHEMA,
    instanceId: ID_SCHEMA,
    instanceOrdinal: POSITIVE_INTEGER_SCHEMA,
    kind: literalSchema("inventory-item"),
  }),
  "material-entity": objectSchema({
    entity: MATERIAL_ENTITY_REF_SCHEMA,
    kind: literalSchema("material-entity"),
  }),
});

export type HomebrewDefinitionOwnerRefSchemaShape = InferExactSchema<
  typeof HOMEBREW_DEFINITION_OWNER_REF_SCHEMA
>;

export const TABLE_DECLARATION_MECHANICS_DEFINITION_REF_SCHEMA = objectSchema({
  authority: unionSchema([literalSchema("environment"), literalSchema("table")]),
  declarationId: ID_SCHEMA,
  generation: POSITIVE_INTEGER_SCHEMA,
  kind: literalSchema("table-declaration"),
  material: MATERIAL_REF_SCHEMA,
});

export type TableDeclarationMechanicsDefinitionRefSchemaShape = InferExactSchema<
  typeof TABLE_DECLARATION_MECHANICS_DEFINITION_REF_SCHEMA
>;

export const MECHANICS_DEFINITION_REF_SCHEMA = discriminatedUnionSchema("kind", {
  catalogue: objectSchema({
    catalogueKind: CATALOGUE_KIND_SCHEMA,
    entityId: ID_SCHEMA,
    kind: literalSchema("catalogue"),
    mechanicsRevision: MECHANICS_REVISION_SCHEMA,
  }),
  homebrew: objectSchema({
    generation: POSITIVE_INTEGER_SCHEMA,
    kind: literalSchema("homebrew"),
    owner: HOMEBREW_DEFINITION_OWNER_REF_SCHEMA,
  }),
  "table-declaration": TABLE_DECLARATION_MECHANICS_DEFINITION_REF_SCHEMA,
});

export type MechanicsDefinitionRefSchemaShape = InferExactSchema<
  typeof MECHANICS_DEFINITION_REF_SCHEMA
>;

export const MECHANICS_CAPABILITY_REF_SCHEMA = objectSchema({
  capabilityId: ID_SCHEMA,
  definition: MECHANICS_DEFINITION_REF_SCHEMA,
  kind: unionSchema([
    literalSchema("attack"),
    literalSchema("cast"),
    literalSchema("grant-group"),
    literalSchema("program"),
    literalSchema("resource"),
    literalSchema("system"),
  ]),
});

export type MechanicsCapabilityRefSchemaShape = InferExactSchema<
  typeof MECHANICS_CAPABILITY_REF_SCHEMA
>;

export const MECHANICS_SOURCE_REF_SCHEMA = discriminatedUnionSchema("kind", {
  capability: objectSchema({
    capability: MECHANICS_CAPABILITY_REF_SCHEMA,
    kind: literalSchema("capability"),
    owner: ENTITY_REF_SCHEMA,
  }),
  entity: objectSchema({
    entity: ENTITY_REF_SCHEMA,
    kind: literalSchema("entity"),
  }),
  "inventory-item": objectSchema({
    instanceId: ID_SCHEMA,
    instanceOrdinal: POSITIVE_INTEGER_SCHEMA,
    kind: literalSchema("inventory-item"),
    owner: CHARACTER_MATERIAL_REF_SCHEMA,
  }),
  "table-declaration": TABLE_DECLARATION_MECHANICS_DEFINITION_REF_SCHEMA,
});

export type MechanicsSourceRefSchemaShape = InferExactSchema<
  typeof MECHANICS_SOURCE_REF_SCHEMA
>;

export const MECHANICS_CAPABILITY_INSTALLATION_REF_SCHEMA = objectSchema({
  capability: MECHANICS_CAPABILITY_REF_SCHEMA,
  generation: POSITIVE_INTEGER_SCHEMA,
  installationId: ID_SCHEMA,
  owner: JOURNAL_ACTOR_REF_SCHEMA,
});

export type MechanicsCapabilityInstallationRefSchemaShape = InferExactSchema<
  typeof MECHANICS_CAPABILITY_INSTALLATION_REF_SCHEMA
>;

export const MECHANICS_INVOCATION_REF_SCHEMA = discriminatedUnionSchema("kind", {
  "installed-capability": objectSchema({
    installation: MECHANICS_CAPABILITY_INSTALLATION_REF_SCHEMA,
    kind: literalSchema("installed-capability"),
  }),
  "program-root": objectSchema({
    kind: literalSchema("program-root"),
    occurrence: OCCURRENCE_GENERATION_REF_SCHEMA,
  }),
});

export type MechanicsInvocationRefSchemaShape = InferExactSchema<
  typeof MECHANICS_INVOCATION_REF_SCHEMA
>;

/** Static entity anchors resolved before execution; trigger roles are never stored here. */
export const MECHANICS_AUTHORITY_ANCHORS_SCHEMA = objectSchema({
  activator: unionSchema([ENTITY_REF_SCHEMA, NULL_SCHEMA]),
  caster: unionSchema([ENTITY_REF_SCHEMA, NULL_SCHEMA]),
  owner: unionSchema([ENTITY_REF_SCHEMA, NULL_SCHEMA]),
  source: unionSchema([ENTITY_REF_SCHEMA, NULL_SCHEMA]),
  target: unionSchema([ENTITY_REF_SCHEMA, NULL_SCHEMA]),
});

export type MechanicsAuthorityAnchorsSchemaShape = InferExactSchema<
  typeof MECHANICS_AUTHORITY_ANCHORS_SCHEMA
>;
