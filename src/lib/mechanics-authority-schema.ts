/** Exact persisted identity grammar for authoritative mechanics definitions. */

import {
  arraySchema,
  customSchema,
  discriminatedUnionSchema,
  literalSchema,
  objectSchema,
  unionSchema,
  type InferExactSchema,
} from "@/lib/exact-schema";
import type { ActionFactGuard } from "@/types/action-journal";
import type { IntegerBindings } from "@/types/integer-expression";
import {
  JOURNAL_ACTOR_REF_SCHEMA,
  MECHANICS_AUTHORITY_ANCHORS_SCHEMA,
  MECHANICS_CAPABILITY_INSTALLATION_REF_SCHEMA,
  MECHANICS_SOURCE_REF_SCHEMA,
} from "@/lib/mechanics-authority-ref-schema";
import {
  MECHANICS_CAPABILITY_SNAPSHOT_SCHEMA,
  type MechanicsCapabilitySchemaCustomTypes,
} from "@/lib/mechanics-capability-schema";

const ACTION_FACT_SCHEMA = customSchema<"action-fact", ActionFactGuard>("action-fact");
const INTEGER_BINDINGS_SCHEMA = customSchema<"integer-bindings", IntegerBindings>(
  "integer-bindings"
);

export const MECHANICS_ACTOR_SPEC_SCHEMA = discriminatedUnionSchema("kind", {
  role: objectSchema({
    kind: literalSchema("role"),
    role: unionSchema([
      literalSchema("activator"),
      literalSchema("caster"),
      literalSchema("owner"),
      literalSchema("source"),
    ]),
  }),
  "table-declaration": objectSchema({ kind: literalSchema("table-declaration") }),
});

export type MechanicsActorSpecSchemaShape = InferExactSchema<
  typeof MECHANICS_ACTOR_SPEC_SCHEMA
>;

/** Resolved authority closure consumed by execution, never by an intent. */
export const MECHANICS_AUTHORITY_DEFINITION_SCHEMA = objectSchema({
  actorSpec: MECHANICS_ACTOR_SPEC_SCHEMA,
  anchors: MECHANICS_AUTHORITY_ANCHORS_SCHEMA,
  definitionGuards: arraySchema(ACTION_FACT_SCHEMA),
  installation: MECHANICS_CAPABILITY_INSTALLATION_REF_SCHEMA,
  installationGuards: arraySchema(ACTION_FACT_SCHEMA),
  owner: JOURNAL_ACTOR_REF_SCHEMA,
  snapshot: MECHANICS_CAPABILITY_SNAPSHOT_SCHEMA,
  source: MECHANICS_SOURCE_REF_SCHEMA,
  staticBindings: INTEGER_BINDINGS_SCHEMA,
});

export type MechanicsAuthorityDefinitionSchemaShape = InferExactSchema<
  typeof MECHANICS_AUTHORITY_DEFINITION_SCHEMA
>;

export const MECHANICS_AUTHORITY_SNAPSHOT_SCHEMA = objectSchema({
  definitions: arraySchema(MECHANICS_AUTHORITY_DEFINITION_SCHEMA),
});

export type MechanicsAuthoritySnapshotSchemaShape = InferExactSchema<
  typeof MECHANICS_AUTHORITY_SNAPSHOT_SCHEMA
>;

export type MechanicsAuthoritySchemaCustomTypes = MechanicsCapabilitySchemaCustomTypes & {
  readonly "action-fact": ActionFactGuard;
  readonly "integer-bindings": IntegerBindings;
};
