/** Schema-first deterministic integer arithmetic shared by the full rules engine. */

import {
  arraySchema,
  bindExactSchemaOutput,
  customSchema,
  discriminatedUnionSchema,
  literalSchema,
  objectSchema,
  refSchema,
  unionSchema,
  type InferExactSchema,
} from "@/lib/exact-schema";

const ID_SCHEMA = customSchema<"id", string>("id");
const SIGNED_INTEGER_SCHEMA = customSchema<"signed-integer", number>("signed-integer");
const INTEGER_EXPRESSION_REF = refSchema("integer-expression");

const INTEGER_EXPRESSION_SCHEMA_DEFINITION = discriminatedUnionSchema("kind", {
  fixed: objectSchema({
    kind: literalSchema("fixed"),
    value: SIGNED_INTEGER_SCHEMA,
  }),
  binding: objectSchema({
    bindingId: ID_SCHEMA,
    kind: literalSchema("binding"),
  }),
  add: objectSchema({
    kind: literalSchema("add"),
    terms: arraySchema(INTEGER_EXPRESSION_REF, 1),
  }),
  multiply: objectSchema({
    factors: arraySchema(INTEGER_EXPRESSION_REF, 1),
    kind: literalSchema("multiply"),
  }),
  divide: objectSchema({
    dividend: INTEGER_EXPRESSION_REF,
    divisor: INTEGER_EXPRESSION_REF,
    kind: literalSchema("divide"),
    rounding: unionSchema([literalSchema("floor"), literalSchema("ceil")]),
  }),
  min: objectSchema({
    kind: literalSchema("min"),
    values: arraySchema(INTEGER_EXPRESSION_REF, 1),
  }),
  max: objectSchema({
    kind: literalSchema("max"),
    values: arraySchema(INTEGER_EXPRESSION_REF, 1),
  }),
});

type IntegerExpressionSchemaShape = InferExactSchema<
  typeof INTEGER_EXPRESSION_SCHEMA_DEFINITION,
  IntegerExpressionSchemaCustomTypes,
  IntegerExpressionSchemaRefs
>;
type IntegerExpressionLeaf = Exclude<
  IntegerExpressionSchemaShape,
  { readonly kind: "add" | "multiply" | "divide" | "min" | "max" }
>;

/** Closed recursive output of {@link INTEGER_EXPRESSION_SCHEMA}. */
export type IntegerExpression =
  | IntegerExpressionLeaf
  | {
      readonly kind: "add";
      readonly terms: readonly [IntegerExpression, ...IntegerExpression[]];
    }
  | {
      readonly kind: "multiply";
      readonly factors: readonly [IntegerExpression, ...IntegerExpression[]];
    }
  | {
      readonly dividend: IntegerExpression;
      readonly divisor: IntegerExpression;
      readonly kind: "divide";
      readonly rounding: "floor" | "ceil";
    }
  | {
      readonly kind: "min";
      readonly values: readonly [IntegerExpression, ...IntegerExpression[]];
    }
  | {
      readonly kind: "max";
      readonly values: readonly [IntegerExpression, ...IntegerExpression[]];
    };

/** Values supplied by a planner; the arithmetic layer owns no domain vocabulary. */
export type IntegerBindings = Readonly<Record<string, number>>;

export type IntegerExpressionSchemaCustomTypes = {
  readonly id: string;
  readonly "signed-integer": number;
};

export type IntegerExpressionSchemaRefs = {
  readonly "integer-expression": IntegerExpression;
};

/** The only authored integer-expression grammar in the application. */
export const INTEGER_EXPRESSION_SCHEMA = bindExactSchemaOutput<IntegerExpression>()(
  INTEGER_EXPRESSION_SCHEMA_DEFINITION
);
