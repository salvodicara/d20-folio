/** Exact transient input grammar for MechanicsProgram execution. */

import {
  arraySchema,
  booleanSchema,
  customSchema,
  discriminatedUnionSchema,
  literalSchema,
  objectSchema,
  unionSchema,
  type InferExactSchema,
} from "@/lib/exact-schema";
import type { ActionFactGuard } from "@/types/action-journal";
import type { D20TestObservation } from "@/types/d20-test";
import type { DiceObservation } from "@/types/dice-formula";
import type { MechanicsExecutionFrame } from "@/types/mechanics-command";
import type { CharacterMaterialRef, EntityRef } from "@/types/mechanics-reference";
import type { ResourceRef } from "@/types/resource";

const ID_SCHEMA = customSchema<"id", string>("id");
const SIGNED_INTEGER_SCHEMA = customSchema<"signed-integer", number>("signed-integer");
const POSITIVE_INTEGER_SCHEMA = customSchema<"positive-integer", number>(
  "positive-integer"
);
const DICE_OBSERVATION_VALUE_SCHEMA = customSchema<"dice-observation", DiceObservation>(
  "dice-observation"
);
const D20_OBSERVATION_VALUE_SCHEMA = customSchema<"d20-observation", D20TestObservation>(
  "d20-observation"
);
const RESOURCE_REF_VALUE_SCHEMA = customSchema<"resource-ref", ResourceRef>(
  "resource-ref"
);
const ENTITY_REF_VALUE_SCHEMA = customSchema<"entity-ref", EntityRef>("entity-ref");
const MECHANICS_EXECUTION_FRAME_VALUE_SCHEMA = customSchema<
  "mechanics-execution-frame",
  MechanicsExecutionFrame
>("mechanics-execution-frame");
const ACTION_FACT_VALUE_SCHEMA = customSchema<"action-fact", ActionFactGuard>(
  "action-fact"
);
const CHARACTER_MATERIAL_REF_VALUE_SCHEMA = customSchema<
  "character-material-ref",
  CharacterMaterialRef
>("character-material-ref");
/** Exact transient execution facts. */
export const MECHANICS_INTENT_SCHEMA = objectSchema({
  actionId: ID_SCHEMA,
  factGuards: arraySchema(ACTION_FACT_VALUE_SCHEMA),
  frame: MECHANICS_EXECUTION_FRAME_VALUE_SCHEMA,
});
export type MechanicsIntentSchemaShape = InferExactSchema<typeof MECHANICS_INTENT_SCHEMA>;

const PAYMENT_ANSWER_SCHEMA = objectSchema({
  resource: RESOURCE_REF_VALUE_SCHEMA,
  sourceId: ID_SCHEMA,
});

const REQUEST_IDENTITY_SCHEMA = objectSchema({
  binding: ENTITY_REF_VALUE_SCHEMA,
  ordinal: POSITIVE_INTEGER_SCHEMA,
});

/** Exact transient table answers; reviewed resolutions are deliberately not serialized. */
export const MECHANICS_ANSWERS_SCHEMA = arraySchema(
  discriminatedUnionSchema("kind", {
    entities: objectSchema({
      inputId: ID_SCHEMA,
      kind: literalSchema("entities"),
      targets: arraySchema(ENTITY_REF_VALUE_SCHEMA),
    }),
    d20: objectSchema({
      inputId: ID_SCHEMA,
      kind: literalSchema("d20"),
      requests: arraySchema(
        objectSchema({
          identity: REQUEST_IDENTITY_SCHEMA,
          observation: D20_OBSERVATION_VALUE_SCHEMA,
          payments: arraySchema(PAYMENT_ANSWER_SCHEMA),
        })
      ),
    }),
    dice: objectSchema({
      inputId: ID_SCHEMA,
      kind: literalSchema("dice"),
      requests: arraySchema(
        objectSchema({
          identity: REQUEST_IDENTITY_SCHEMA,
          observation: DICE_OBSERVATION_VALUE_SCHEMA,
          payments: arraySchema(PAYMENT_ANSWER_SCHEMA),
        })
      ),
    }),
    choice: objectSchema({
      choiceId: ID_SCHEMA,
      inputId: ID_SCHEMA,
      kind: literalSchema("choice"),
    }),
    integer: objectSchema(
      {
        inputId: ID_SCHEMA,
        kind: literalSchema("integer"),
      },
      {
        /** One chosen value per request of an entity-EXPANDED integer input
         *  (the pool-split law); exactly one of `value`/`requests` answers. */
        requests: arraySchema(
          objectSchema({
            identity: REQUEST_IDENTITY_SCHEMA,
            value: SIGNED_INTEGER_SCHEMA,
          })
        ),
        value: SIGNED_INTEGER_SCHEMA,
      }
    ),
    boolean: objectSchema({
      inputId: ID_SCHEMA,
      kind: literalSchema("boolean"),
      value: booleanSchema,
    }),
    table: objectSchema({
      authority: unionSchema([literalSchema("table"), literalSchema("environment")]),
      inputId: ID_SCHEMA,
      kind: literalSchema("table"),
      rowId: ID_SCHEMA,
    }),
    resource: objectSchema({
      inputId: ID_SCHEMA,
      kind: literalSchema("resource"),
      resource: RESOURCE_REF_VALUE_SCHEMA,
    }),
    item: objectSchema({
      inputId: ID_SCHEMA,
      instanceId: ID_SCHEMA,
      instanceOrdinal: POSITIVE_INTEGER_SCHEMA,
      kind: literalSchema("item"),
      owner: CHARACTER_MATERIAL_REF_VALUE_SCHEMA,
    }),
  })
);
export type MechanicsAnswersSchemaShape = InferExactSchema<
  typeof MECHANICS_ANSWERS_SCHEMA
>;

export type MechanicsProgramSchemaCustomTypes = {
  readonly "action-fact": ActionFactGuard;
  readonly "character-material-ref": CharacterMaterialRef;
  readonly "d20-observation": D20TestObservation;
  readonly "dice-observation": DiceObservation;
  readonly "entity-ref": EntityRef;
  readonly id: string;
  readonly "mechanics-execution-frame": MechanicsExecutionFrame;
  readonly "positive-integer": number;
  readonly "resource-ref": ResourceRef;
  readonly "signed-integer": number;
};
