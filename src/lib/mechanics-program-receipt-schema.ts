/** Exact low-dependency grammar for durable program-root authority receipts. */

import {
  customSchema,
  literalSchema,
  objectSchema,
  type InferExactSchema,
} from "@/lib/exact-schema";
import type { IntegerBindings } from "@/types/integer-expression";
import {
  MECHANICS_AUTHORITY_ANCHORS_SCHEMA,
  MECHANICS_CAPABILITY_INSTALLATION_REF_SCHEMA,
  MECHANICS_SOURCE_REF_SCHEMA,
} from "@/lib/mechanics-authority-ref-schema";
import {
  MECHANICS_CAPABILITY_SNAPSHOT_SCHEMA,
  type MechanicsCapabilitySchemaCustomTypes,
} from "@/lib/mechanics-capability-schema";

const INTEGER_BINDINGS_SCHEMA = customSchema<"integer-bindings", IntegerBindings>(
  "integer-bindings"
);

/** Immutable executable authority retained by a durable program occurrence. */
export const MECHANICS_PROGRAM_AUTHORITY_RECEIPT_SCHEMA = objectSchema({
  anchors: MECHANICS_AUTHORITY_ANCHORS_SCHEMA,
  installation: MECHANICS_CAPABILITY_INSTALLATION_REF_SCHEMA,
  schema: literalSchema(1),
  snapshot: MECHANICS_CAPABILITY_SNAPSHOT_SCHEMA,
  source: MECHANICS_SOURCE_REF_SCHEMA,
  staticBindings: INTEGER_BINDINGS_SCHEMA,
});

export type MechanicsProgramAuthorityReceiptSchemaShape = InferExactSchema<
  typeof MECHANICS_PROGRAM_AUTHORITY_RECEIPT_SCHEMA
>;

export type MechanicsProgramAuthorityReceiptSchemaCustomTypes =
  MechanicsCapabilitySchemaCustomTypes & {
    readonly "integer-bindings": IntegerBindings;
  };
