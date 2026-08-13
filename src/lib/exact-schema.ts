/**
 * Tiny runtime schema language for durable JSON authoring contracts.
 *
 * Schemas are plain `as const` data. Their TypeScript output is inferred from the
 * same value the runtime conformer interprets, so persistence validation and the
 * public type cannot drift into two grammars. Objects are exact, records and object
 * keys are canonicalized, and every accepted result is a fresh deeply-frozen tree.
 */

export type ExactJsonScalar = string | number | boolean | null;

export type ExactSchema =
  | { readonly kind: "string" }
  | { readonly kind: "number" }
  | { readonly kind: "boolean" }
  | { readonly kind: "literal"; readonly value: ExactJsonScalar }
  | {
      readonly kind: "array";
      readonly item: ExactSchema;
      readonly minItems?: number;
    }
  | {
      readonly kind: "tuple";
      readonly items: readonly ExactSchema[];
      readonly rest?: ExactSchema;
    }
  | {
      readonly kind: "record";
      readonly key: "string" | "number";
      readonly value: ExactSchema;
    }
  | {
      readonly kind: "object";
      readonly required: Readonly<Record<string, ExactSchema>>;
      readonly optional?: Readonly<Record<string, ExactSchema>>;
    }
  | { readonly kind: "union"; readonly variants: readonly ExactSchema[] }
  | {
      readonly kind: "discriminated-union";
      readonly key: string;
      readonly variants: Readonly<Record<string, ExactSchema>>;
    }
  | { readonly kind: "ref"; readonly name: string }
  | { readonly kind: "custom"; readonly name: string };

declare const exactSchemaOutput: unique symbol;
declare const exactSchemaUnresolvedRef: unique symbol;
declare const exactSchemaUnresolvedCustom: unique symbol;

/** Compile-time output cached on a schema node; the property is phantom at runtime. */
export interface ExactSchemaOutput<Output> {
  readonly [exactSchemaOutput]: Output;
}

/** Marker emitted when callers leave a named recursive reference unresolved. */
export interface ExactSchemaRef<Name extends string> {
  readonly [exactSchemaUnresolvedRef]: Name;
}

/** Marker emitted when callers leave a custom scalar output unresolved. */
export interface ExactSchemaCustom<Name extends string> {
  readonly [exactSchemaUnresolvedCustom]: Name;
}

type SchemaOutput<Schema extends ExactSchema> =
  Schema extends ExactSchemaOutput<infer Output> ? Output : never;

type SchemaWithOutput<Schema extends ExactSchema, Output> = Schema &
  ExactSchemaOutput<Output>;

type UnionKeys<Union> = Union extends unknown ? keyof Union : never;

type StrictObjectUnionMember<Member, Whole> = Member extends object
  ? Member & {
      readonly [Key in Exclude<UnionKeys<Whole>, keyof Member>]?: never;
    }
  : Member;

type StrictObjectUnion<Union, Whole = Union> = [Union] extends [object]
  ? Union extends unknown
    ? StrictObjectUnionMember<Union, Whole>
    : never
  : Union;

type ObjectOutput<
  Required extends Readonly<Record<string, ExactSchema>>,
  Optional extends Readonly<Record<string, ExactSchema>> = Record<never, never>,
> = {
  readonly [Key in keyof Required]: SchemaOutput<Required[Key]>;
} & {
  readonly [Key in keyof Optional]?: SchemaOutput<Optional[Key]>;
};

type TupleOutput<Items extends readonly ExactSchema[]> = {
  readonly [Index in keyof Items]: Items[Index] extends ExactSchema
    ? SchemaOutput<Items[Index]>
    : never;
};

export const stringSchema = { kind: "string" } as SchemaWithOutput<
  { readonly kind: "string" },
  string
>;
export const numberSchema = { kind: "number" } as SchemaWithOutput<
  { readonly kind: "number" },
  number
>;
export const booleanSchema = { kind: "boolean" } as SchemaWithOutput<
  { readonly kind: "boolean" },
  boolean
>;

export function literalSchema<const Value extends ExactJsonScalar>(
  value: Value
): SchemaWithOutput<{ readonly kind: "literal"; readonly value: Value }, Value> {
  return { kind: "literal", value } as SchemaWithOutput<
    { readonly kind: "literal"; readonly value: Value },
    Value
  >;
}

export function arraySchema<const Item extends ExactSchema>(
  item: Item
): SchemaWithOutput<
  { readonly kind: "array"; readonly item: Item },
  readonly SchemaOutput<Item>[]
>;
export function arraySchema<const Item extends ExactSchema>(
  item: Item,
  minItems: 1
): SchemaWithOutput<
  { readonly kind: "array"; readonly item: Item; readonly minItems: 1 },
  readonly [SchemaOutput<Item>, ...SchemaOutput<Item>[]]
>;
export function arraySchema<const Item extends ExactSchema, const Minimum extends number>(
  item: Item,
  minItems: Minimum
): SchemaWithOutput<
  { readonly kind: "array"; readonly item: Item; readonly minItems: Minimum },
  readonly SchemaOutput<Item>[]
>;
export function arraySchema(item: ExactSchema, minItems?: number): ExactSchema {
  return {
    kind: "array",
    item,
    ...(minItems === undefined ? {} : { minItems }),
  };
}

export function tupleSchema<const Items extends readonly ExactSchema[]>(
  items: Items
): SchemaWithOutput<
  { readonly kind: "tuple"; readonly items: Items },
  TupleOutput<Items>
>;
export function tupleSchema<
  const Items extends readonly ExactSchema[],
  const Rest extends ExactSchema,
>(
  items: Items,
  rest: Rest
): SchemaWithOutput<
  { readonly kind: "tuple"; readonly items: Items; readonly rest: Rest },
  readonly [...TupleOutput<Items>, ...SchemaOutput<Rest>[]]
>;
export function tupleSchema(
  items: readonly ExactSchema[],
  rest?: ExactSchema
): ExactSchema {
  return { kind: "tuple", items, ...(rest ? { rest } : {}) };
}

export function recordSchema<
  const Key extends "string" | "number",
  const Value extends ExactSchema,
>(
  key: Key,
  value: Value
): SchemaWithOutput<
  { readonly kind: "record"; readonly key: Key; readonly value: Value },
  Readonly<Record<Key extends "number" ? number : string, SchemaOutput<Value>>>
> {
  return { kind: "record", key, value } as SchemaWithOutput<
    { readonly kind: "record"; readonly key: Key; readonly value: Value },
    Readonly<Record<Key extends "number" ? number : string, SchemaOutput<Value>>>
  >;
}

export function objectSchema<
  const Required extends Readonly<Record<string, ExactSchema>>,
>(
  required: Required
): SchemaWithOutput<
  { readonly kind: "object"; readonly required: Required },
  ObjectOutput<Required>
>;
export function objectSchema<
  const Required extends Readonly<Record<string, ExactSchema>>,
  const Optional extends Readonly<Record<string, ExactSchema>>,
>(
  required: Required,
  optional: Optional
): SchemaWithOutput<
  {
    readonly kind: "object";
    readonly required: Required;
    readonly optional: Optional;
  },
  ObjectOutput<Required, Optional>
>;
export function objectSchema(
  required: Readonly<Record<string, ExactSchema>>,
  optional?: Readonly<Record<string, ExactSchema>>
): ExactSchema {
  return { kind: "object", required, ...(optional ? { optional } : {}) };
}

export function unionSchema<const Variants extends readonly ExactSchema[]>(
  variants: Variants
): SchemaWithOutput<
  { readonly kind: "union"; readonly variants: Variants },
  StrictObjectUnion<SchemaOutput<Variants[number]>>
> {
  return { kind: "union", variants } as SchemaWithOutput<
    { readonly kind: "union"; readonly variants: Variants },
    StrictObjectUnion<SchemaOutput<Variants[number]>>
  >;
}

export function discriminatedUnionSchema<
  const Key extends string,
  const Variants extends Readonly<Record<string, ExactSchema>>,
>(
  key: Key,
  variants: Variants
): SchemaWithOutput<
  {
    readonly kind: "discriminated-union";
    readonly key: Key;
    readonly variants: Variants;
  },
  SchemaOutput<Variants[keyof Variants]>
> {
  return { kind: "discriminated-union", key, variants } as SchemaWithOutput<
    {
      readonly kind: "discriminated-union";
      readonly key: Key;
      readonly variants: Variants;
    },
    SchemaOutput<Variants[keyof Variants]>
  >;
}

export function refSchema<const Name extends string, Output = ExactSchemaRef<Name>>(
  name: Name
): SchemaWithOutput<{ readonly kind: "ref"; readonly name: Name }, Output> {
  return { kind: "ref", name } as SchemaWithOutput<
    { readonly kind: "ref"; readonly name: Name },
    Output
  >;
}

export function customSchema<const Name extends string, Output = ExactSchemaCustom<Name>>(
  name: Name
): SchemaWithOutput<{ readonly kind: "custom"; readonly name: Name }, Output> {
  return { kind: "custom", name } as SchemaWithOutput<
    { readonly kind: "custom"; readonly name: Name },
    Output
  >;
}

/**
 * Rebind only a root schema's cached output. Used after a schema-inferred
 * recursive projection closes its named refs.
 */
export function bindExactSchemaOutput<Output>() {
  return <const Schema extends ExactSchema>(
    schema: Schema
  ): SchemaWithOutput<Schema, Output> => schema as SchemaWithOutput<Schema, Output>;
}

type ResolveDirectOutput<
  Output,
  Customs extends Readonly<Record<string, unknown>>,
  Refs extends Readonly<Record<string, unknown>>,
> =
  Output extends ExactSchemaRef<infer Name>
    ? Name extends keyof Refs
      ? Refs[Name]
      : Output
    : Output extends ExactSchemaCustom<infer Name>
      ? Name extends keyof Customs
        ? Customs[Name]
        : Output
      : Output;

/** Extract the immutable output cached by one exact runtime schema. */
export type InferExactSchema<
  Schema extends ExactSchema,
  Customs extends Readonly<Record<string, unknown>> = Record<never, never>,
  Refs extends Readonly<Record<string, unknown>> = Record<never, never>,
> = ResolveDirectOutput<SchemaOutput<Schema>, Customs, Refs>;

export type ExactSchemaCustomConformers<
  Customs extends Readonly<Record<string, unknown>>,
> = {
  readonly [Name in keyof Customs]: (value: unknown) => Customs[Name] | null;
};

export interface ExactSchemaContext<
  Customs extends Readonly<Record<string, unknown>>,
  Refs extends Readonly<Record<string, unknown>>,
> {
  readonly customs: ExactSchemaCustomConformers<Customs>;
  /** Runtime schemas matching the output-only `Refs` type binding. */
  readonly refs: { readonly [Name in keyof Refs]: ExactSchema };
}
const MAX_DEPTH = 64;
const MAX_VALUES = 50_000;
const MAX_COLLECTION = 2_048;
const MAX_TEXT = 16_384;
const MAX_KEY = 256;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

type UnknownRecord = Record<string, unknown>;
type ConformedValue =
  | ExactJsonScalar
  | ConformedValue[]
  | { [key: string]: ConformedValue };

function plainJson(value: unknown): boolean {
  const ancestors = new WeakSet<object>();
  let values = 0;

  const visit = (current: unknown, depth: number): boolean => {
    values += 1;
    if (values > MAX_VALUES || depth > MAX_DEPTH) return false;
    if (current === null || typeof current === "boolean") return true;
    if (typeof current === "string") return current.length <= MAX_TEXT;
    if (typeof current === "number") {
      return Number.isFinite(current) && !Object.is(current, -0);
    }
    if (typeof current !== "object" || ancestors.has(current)) return false;

    ancestors.add(current);
    if (Array.isArray(current)) {
      if (
        Object.getPrototypeOf(current) !== Array.prototype ||
        current.length > MAX_COLLECTION
      ) {
        return false;
      }
      const keys = Reflect.ownKeys(current);
      if (keys.length !== current.length + 1 || !keys.includes("length")) return false;
      for (let index = 0; index < current.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
        if (
          descriptor?.enumerable !== true ||
          !("value" in descriptor) ||
          !visit(descriptor.value, depth + 1)
        ) {
          return false;
        }
      }
    } else {
      if (Object.getPrototypeOf(current) !== Object.prototype) return false;
      const keys = Reflect.ownKeys(current);
      if (keys.length > MAX_COLLECTION) return false;
      for (const key of keys) {
        if (typeof key !== "string" || key.length > MAX_KEY || UNSAFE_KEYS.has(key)) {
          return false;
        }
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (
          descriptor?.enumerable !== true ||
          !("value" in descriptor) ||
          !visit(descriptor.value, depth + 1)
        ) {
          return false;
        }
      }
    }
    ancestors.delete(current);
    return true;
  };

  return visit(value, 0);
}

function record(value: unknown): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function canonicalKey(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function numberRecordKey(value: string): boolean {
  return /^(?:0|-?[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value));
}

type RuntimeContext = ExactSchemaContext<
  Readonly<Record<string, unknown>>,
  Readonly<Record<string, unknown>>
>;

function clonePlainJson(value: unknown): ConformedValue | undefined {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value.length <= MAX_TEXT ? value : undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) && !Object.is(value, -0) ? value : undefined;
  }
  if (Array.isArray(value)) {
    const result: ConformedValue[] = [];
    for (const child of value) {
      const parsed = clonePlainJson(child);
      if (parsed === undefined) return undefined;
      result.push(parsed);
    }
    return result;
  }
  if (!record(value)) return undefined;
  const result: Record<string, ConformedValue> = {};
  for (const key of Object.keys(value).sort(canonicalKey)) {
    const parsed = clonePlainJson(value[key]);
    if (parsed === undefined) return undefined;
    result[key] = parsed;
  }
  return result;
}

function conformNode(
  schema: ExactSchema,
  value: unknown,
  context: RuntimeContext,
  depth: number
): ConformedValue | undefined {
  if (depth > MAX_DEPTH) return undefined;
  switch (schema.kind) {
    case "string":
      return typeof value === "string" ? value : undefined;
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? value : undefined;
    case "boolean":
      return typeof value === "boolean" ? value : undefined;
    case "literal":
      return value === schema.value ? schema.value : undefined;
    case "array": {
      if (!Array.isArray(value) || value.length < (schema.minItems ?? 0)) {
        return undefined;
      }
      const result: ConformedValue[] = [];
      for (const entry of value) {
        const parsed = conformNode(schema.item, entry, context, depth + 1);
        if (parsed === undefined) return undefined;
        result.push(parsed);
      }
      return result;
    }
    case "tuple": {
      if (
        !Array.isArray(value) ||
        value.length < schema.items.length ||
        (schema.rest === undefined && value.length !== schema.items.length)
      ) {
        return undefined;
      }
      const result: ConformedValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const itemSchema = schema.items[index] ?? schema.rest;
        if (!itemSchema) return undefined;
        const parsed = conformNode(itemSchema, value[index], context, depth + 1);
        if (parsed === undefined) return undefined;
        result.push(parsed);
      }
      return result;
    }
    case "record": {
      if (!record(value)) return undefined;
      const result: Record<string, ConformedValue> = {};
      for (const key of Object.keys(value).sort(canonicalKey)) {
        if (schema.key === "number" && !numberRecordKey(key)) return undefined;
        const parsed = conformNode(schema.value, value[key], context, depth + 1);
        if (parsed === undefined) return undefined;
        result[key] = parsed;
      }
      return result;
    }
    case "object": {
      if (!record(value)) return undefined;
      const required = Object.keys(schema.required);
      const optional = Object.keys(schema.optional ?? {});
      const allowed = new Set([...required, ...optional]);
      const actual = Object.keys(value);
      if (
        required.some((key) => !Object.hasOwn(value, key)) ||
        actual.some((key) => !allowed.has(key))
      ) {
        return undefined;
      }
      const result: Record<string, ConformedValue> = {};
      for (const key of actual.sort(canonicalKey)) {
        const childSchema = schema.required[key] ?? schema.optional?.[key];
        if (!childSchema) return undefined;
        const parsed = conformNode(childSchema, value[key], context, depth + 1);
        if (parsed === undefined) return undefined;
        result[key] = parsed;
      }
      return result;
    }
    case "union":
      for (const variant of schema.variants) {
        const parsed = conformNode(variant, value, context, depth + 1);
        if (parsed !== undefined) return parsed;
      }
      return undefined;
    case "discriminated-union": {
      if (!record(value)) return undefined;
      const discriminator = value[schema.key];
      if (typeof discriminator !== "string") return undefined;
      const variant = schema.variants[discriminator];
      return variant ? conformNode(variant, value, context, depth + 1) : undefined;
    }
    case "ref": {
      const target = context.refs[schema.name];
      return target ? conformNode(target, value, context, depth + 1) : undefined;
    }
    case "custom": {
      const conformer = context.customs[schema.name];
      const parsed = conformer?.(value);
      return parsed == null || !plainJson(parsed) ? undefined : clonePlainJson(parsed);
    }
  }
}

function freezeDeep(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  for (const child of Object.values(value)) freezeDeep(child);
  if (!Object.isFrozen(value)) Object.freeze(value);
}

function conformExactRuntime(
  schema: ExactSchema,
  value: unknown,
  context: RuntimeContext
): ConformedValue | null {
  if (!plainJson(value)) return null;
  const parsed = conformNode(schema, value, context, 0);
  if (parsed === undefined) return null;
  freezeDeep(parsed);
  return parsed;
}

/** Validate, canonicalize, clone, and deep-freeze a JSON authoring value. */
export function conformExact<
  const Schema extends ExactSchema,
  Customs extends Readonly<Record<string, unknown>>,
  Refs extends Readonly<Record<string, unknown>>,
>(
  schema: Schema,
  value: unknown,
  context: ExactSchemaContext<Customs, Refs>
): InferExactSchema<Schema, Customs, Refs> | null {
  return conformExactRuntime(schema, value, context) as InferExactSchema<
    Schema,
    Customs,
    Refs
  > | null;
}

/** Bind a schema and its named extensions once, preserving the inferred output. */
export function exactConformer<
  const Schema extends ExactSchema,
  Customs extends Readonly<Record<string, unknown>>,
  Refs extends Readonly<Record<string, unknown>>,
>(schema: Schema, context: ExactSchemaContext<Customs, Refs>) {
  return (value: unknown): InferExactSchema<Schema, Customs, Refs> | null =>
    conformExactRuntime(schema, value, context) as InferExactSchema<
      Schema,
      Customs,
      Refs
    > | null;
}
