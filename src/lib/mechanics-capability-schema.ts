/** Exact low-dependency grammar for immutable executable capability bodies. */

import {
  arraySchema,
  customSchema,
  literalSchema,
  objectSchema,
  recordSchema,
  unionSchema,
  type InferExactSchema,
} from "@/lib/exact-schema";
import type { Grant } from "@/lib/grant-schema";
import {
  MECHANICS_CAPABILITY_REF_SCHEMA,
  type MechanicsAuthorityRefSchemaCustomTypes,
} from "@/lib/mechanics-authority-ref-schema";
import type { MechanicsProgram } from "@/types/mechanics-program-authoring";
import type { ResourceSpec } from "@/types/resource";

const ID_SCHEMA = customSchema<"id", string>("id");
const GRANT_SCHEMA = customSchema<"grant", Grant>("grant");
const MECHANICS_PROGRAM_VALUE_SCHEMA = customSchema<
  "mechanics-program",
  MechanicsProgram
>("mechanics-program");
const RESOURCE_SPEC_SCHEMA = customSchema<"resource-spec", ResourceSpec>("resource-spec");
/**
 * Blueprints travel as canonical plain records; the compiler re-proves each one
 * with the full material conformer at its exact point of use, so a malformed
 * blueprint fails the authored create step closed instead of the whole snapshot.
 */
const BLUEPRINT_RECORD_SCHEMA = customSchema<"blueprint-record", Record<string, unknown>>(
  "blueprint-record"
);

const CAPABILITY_GRANT_SCHEMA = objectSchema({
  grant: GRANT_SCHEMA,
  grantId: ID_SCHEMA,
});

/** Complete immutable executable body of one exact capability revision. */
export const MECHANICS_CAPABILITY_SNAPSHOT_SCHEMA = objectSchema(
  {
    grantGroups: recordSchema("string", arraySchema(CAPABILITY_GRANT_SCHEMA)),
    program: unionSchema([MECHANICS_PROGRAM_VALUE_SCHEMA, literalSchema(null)]),
    ref: MECHANICS_CAPABILITY_REF_SCHEMA,
    resources: recordSchema("string", RESOURCE_SPEC_SCHEMA),
    schema: literalSchema(1),
  },
  {
    /** Closed materializations for authored entity/inventory create steps. */
    blueprints: objectSchema({
      entities: recordSchema("string", BLUEPRINT_RECORD_SCHEMA),
      items: recordSchema("string", BLUEPRINT_RECORD_SCHEMA),
    }),
  }
);

export type MechanicsCapabilitySnapshotSchemaShape = InferExactSchema<
  typeof MECHANICS_CAPABILITY_SNAPSHOT_SCHEMA
>;

export type MechanicsCapabilitySchemaCustomTypes =
  MechanicsAuthorityRefSchemaCustomTypes & {
    readonly "blueprint-record": Record<string, unknown>;
    readonly grant: Grant;
    readonly "mechanics-program": MechanicsProgram;
    readonly "resource-spec": ResourceSpec;
  };
