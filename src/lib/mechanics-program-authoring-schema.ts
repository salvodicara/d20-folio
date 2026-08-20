/**
 * Exact authored grammar for deterministic mechanics programs.
 *
 * The language names game operations, table facts and stable roles. It contains
 * no localized copy, document paths, arbitrary JSON mutations, or rolled values.
 */

import {
  arraySchema,
  bindExactSchemaOutput,
  booleanSchema,
  customSchema,
  discriminatedUnionSchema,
  literalSchema,
  objectSchema,
  refSchema,
  unionSchema,
  type InferExactSchema,
} from "@/lib/exact-schema";
import { NON_EXHAUSTION_CONDITION_ID_SCHEMA } from "@/types/condition";
import {
  DAMAGE_DELIVERY_SCHEMA,
  DAMAGE_TRAIT_SCHEMA,
  DAMAGE_TYPE_SCHEMA,
  type DamageDefenseRule,
  type DamageDefenseSelector,
} from "@/types/damage";
import type { D20TestRequest } from "@/types/d20-test";
import {
  DICE_ACCEPTANCE_POLICY_SCHEMA,
  DICE_REPLACEMENT_POLICY_SCHEMA,
  type DiceFormula,
} from "@/types/dice-formula";
import type { IntegerExpression } from "@/types/integer-expression";
import type { EntityRef } from "@/types/mechanics-reference";
import {
  RESOURCE_OWNER_ROLE_SCHEMA,
  type ResourceOwnerRole,
  type ResourceRecoveryTrigger,
  type ResourceSelector,
  type ResourceTerm,
} from "@/types/resource";
import { TURN_ECONOMY_COMMAND_SCHEMA } from "@/types/turn-economy";

type ProgramJsonScalar = string | number | boolean | null;

const ID_SCHEMA = customSchema<"id", string>("id");
const POSITIVE_INTEGER_SCHEMA = customSchema<"positive-integer", number>(
  "positive-integer"
);
const INTEGER_EXPRESSION_SCHEMA = customSchema<"integer-expression", IntegerExpression>(
  "integer-expression"
);
const DICE_FORMULA_VALUE_SCHEMA = customSchema<"dice-formula", DiceFormula>(
  "dice-formula"
);
const DAMAGE_DEFENSE_RULE_VALUE_SCHEMA = customSchema<
  "damage-defense-rule",
  DamageDefenseRule
>("damage-defense-rule");
const DAMAGE_DEFENSE_SELECTOR_VALUE_SCHEMA = customSchema<
  "damage-defense-selector",
  DamageDefenseSelector
>("damage-defense-selector");
const RESOURCE_SELECTOR_VALUE_SCHEMA = customSchema<
  "resource-selector",
  ResourceSelector
>("resource-selector");
const RESOURCE_TERM_VALUE_SCHEMA = customSchema<"resource-term", ResourceTerm>(
  "resource-term"
);
const RESOURCE_TRIGGER_VALUE_SCHEMA = customSchema<
  "resource-trigger",
  ResourceRecoveryTrigger
>("resource-trigger");
const JSON_SCALAR_VALUE_SCHEMA = customSchema<"json-scalar", ProgramJsonScalar>(
  "json-scalar"
);
const NULL_SCHEMA = literalSchema(null);

export const MECHANICS_ROLE_SCHEMA = RESOURCE_OWNER_ROLE_SCHEMA;
export type MechanicsRoleSchemaShape = ResourceOwnerRole;

type RoleRequest<Request extends D20TestRequest> = Request extends unknown
  ? Omit<Request, "actor" | "target"> & {
      readonly actor: ResourceOwnerRole;
      readonly target: Request["target"] extends null
        ? null
        : Request["target"] extends EntityRef | null
          ? ResourceOwnerRole | null
          : ResourceOwnerRole;
    }
  : never;

/** A D20 request whose runtime entities are bound through stable program roles. */
export type D20RequestSpecSchemaShape = RoleRequest<D20TestRequest>;
const D20_REQUEST_SPEC_VALUE_SCHEMA = customSchema<
  "d20-request-spec",
  D20RequestSpecSchemaShape
>("d20-request-spec");

const D20_OUTCOME_ID_SCHEMA = unionSchema([
  literalSchema("hit"),
  literalSchema("miss"),
  literalSchema("critical-hit"),
  literalSchema("success"),
  literalSchema("failure"),
  literalSchema("total-only"),
  literalSchema("ineligible"),
  literalSchema("death-save-success"),
  literalSchema("death-save-failure"),
  literalSchema("death-save-natural-one"),
  literalSchema("death-save-recovery"),
]);

const COMPARISON_SCHEMA = unionSchema([
  literalSchema("eq"),
  literalSchema("ne"),
  literalSchema("lt"),
  literalSchema("lte"),
  literalSchema("gt"),
  literalSchema("gte"),
]);

export const ENTITY_SELECTOR_SCHEMA = discriminatedUnionSchema("kind", {
  role: objectSchema({
    kind: literalSchema("role"),
    role: MECHANICS_ROLE_SCHEMA,
  }),
  input: objectSchema({
    inputId: ID_SCHEMA,
    kind: literalSchema("input"),
  }),
  "d20-outcome": objectSchema({
    cardinality: unionSchema([
      literalSchema("unique-entity"),
      literalSchema("per-request"),
    ]),
    inputId: ID_SCHEMA,
    kind: literalSchema("d20-outcome"),
    outcomeIds: arraySchema(D20_OUTCOME_ID_SCHEMA, 1),
    quantifier: unionSchema([literalSchema("any"), literalSchema("all")]),
  }),
  "dice-total": objectSchema({
    cardinality: unionSchema([
      literalSchema("unique-entity"),
      literalSchema("per-request"),
    ]),
    comparison: COMPARISON_SCHEMA,
    inputId: ID_SCHEMA,
    kind: literalSchema("dice-total"),
    quantifier: unionSchema([literalSchema("any"), literalSchema("all")]),
    value: INTEGER_EXPRESSION_SCHEMA,
  }),
});
export type EntitySelectorSchemaShape = InferExactSchema<typeof ENTITY_SELECTOR_SCHEMA>;

export const ITEM_SELECTOR_SCHEMA = discriminatedUnionSchema("kind", {
  "source-item": objectSchema({ kind: literalSchema("source-item") }),
  input: objectSchema({ inputId: ID_SCHEMA, kind: literalSchema("input") }),
});
export type ItemSelectorSchemaShape = InferExactSchema<typeof ITEM_SELECTOR_SCHEMA>;

const STANDING_MATCHER_SCHEMA = discriminatedUnionSchema("kind", {
  "active-key": objectSchema({ key: ID_SCHEMA, kind: literalSchema("active-key") }),
  "condition-immunity": objectSchema({
    conditionId: NON_EXHAUSTION_CONDITION_ID_SCHEMA,
    kind: literalSchema("condition-immunity"),
  }),
  "damage-defense": objectSchema({
    kind: literalSchema("damage-defense"),
    sourceId: ID_SCHEMA,
  }),
  "grant-group": objectSchema({
    groupId: ID_SCHEMA,
    kind: literalSchema("grant-group"),
  }),
  "program-fact": objectSchema({
    factId: ID_SCHEMA,
    kind: literalSchema("program-fact"),
  }),
  "target-mark": objectSchema({
    kind: literalSchema("target-mark"),
    markId: ID_SCHEMA,
  }),
});

const PREDICATE_REF = refSchema("mechanics-predicate");
const MECHANICS_PREDICATE_SCHEMA_DEFINITION = discriminatedUnionSchema("kind", {
  "answer-boolean": objectSchema({
    equals: booleanSchema,
    inputId: ID_SCHEMA,
    kind: literalSchema("answer-boolean"),
  }),
  "answer-choice": objectSchema({
    choiceId: ID_SCHEMA,
    inputId: ID_SCHEMA,
    kind: literalSchema("answer-choice"),
  }),
  "answer-d20": objectSchema({
    inputId: ID_SCHEMA,
    kind: literalSchema("answer-d20"),
    outcomeId: D20_OUTCOME_ID_SCHEMA,
    quantifier: unionSchema([literalSchema("any"), literalSchema("all")]),
  }),
  "answer-dice-total": objectSchema({
    comparison: COMPARISON_SCHEMA,
    inputId: ID_SCHEMA,
    kind: literalSchema("answer-dice-total"),
    quantifier: unionSchema([literalSchema("any"), literalSchema("all")]),
    value: INTEGER_EXPRESSION_SCHEMA,
  }),
  "answer-entity-count": objectSchema({
    comparison: COMPARISON_SCHEMA,
    inputId: ID_SCHEMA,
    kind: literalSchema("answer-entity-count"),
    value: INTEGER_EXPRESSION_SCHEMA,
  }),
  "answer-integer": objectSchema({
    comparison: COMPARISON_SCHEMA,
    inputId: ID_SCHEMA,
    kind: literalSchema("answer-integer"),
    value: INTEGER_EXPRESSION_SCHEMA,
  }),
  "answer-table": objectSchema({
    inputId: ID_SCHEMA,
    kind: literalSchema("answer-table"),
    rowId: ID_SCHEMA,
  }),
  binding: objectSchema({
    bindingId: ID_SCHEMA,
    comparison: COMPARISON_SCHEMA,
    kind: literalSchema("binding"),
    value: INTEGER_EXPRESSION_SCHEMA,
  }),
  "condition-present": objectSchema({
    conditionId: NON_EXHAUSTION_CONDITION_ID_SCHEMA,
    kind: literalSchema("condition-present"),
    present: booleanSchema,
    quantifier: unionSchema([literalSchema("any"), literalSchema("all")]),
    target: ENTITY_SELECTOR_SCHEMA,
  }),
  "entity-hit-points": objectSchema({
    comparison: COMPARISON_SCHEMA,
    kind: literalSchema("entity-hit-points"),
    quantifier: unionSchema([literalSchema("any"), literalSchema("all")]),
    target: ENTITY_SELECTOR_SCHEMA,
    value: INTEGER_EXPRESSION_SCHEMA,
  }),
  "entity-kind": objectSchema({
    entityKind: unionSchema([literalSchema("creature"), literalSchema("object")]),
    kind: literalSchema("entity-kind"),
    quantifier: unionSchema([literalSchema("any"), literalSchema("all")]),
    target: ENTITY_SELECTOR_SCHEMA,
  }),
  "landed-damage": objectSchema({
    comparison: COMPARISON_SCHEMA,
    kind: literalSchema("landed-damage"),
    partId: unionSchema([ID_SCHEMA, NULL_SCHEMA]),
    stepId: ID_SCHEMA,
    value: INTEGER_EXPRESSION_SCHEMA,
  }),
  "phase-executions": objectSchema({
    comparison: COMPARISON_SCHEMA,
    kind: literalSchema("phase-executions"),
    phaseId: ID_SCHEMA,
    value: INTEGER_EXPRESSION_SCHEMA,
  }),
  register: objectSchema({
    comparison: COMPARISON_SCHEMA,
    kind: literalSchema("register"),
    registerId: ID_SCHEMA,
    value: INTEGER_EXPRESSION_SCHEMA,
  }),
  resource: objectSchema({
    comparison: COMPARISON_SCHEMA,
    kind: literalSchema("resource"),
    selector: RESOURCE_SELECTOR_VALUE_SCHEMA,
    value: INTEGER_EXPRESSION_SCHEMA,
  }),
  "standing-present": objectSchema({
    fact: STANDING_MATCHER_SCHEMA,
    kind: literalSchema("standing-present"),
    present: booleanSchema,
    quantifier: unionSchema([literalSchema("any"), literalSchema("all")]),
    target: ENTITY_SELECTOR_SCHEMA,
  }),
  "trigger-critical-hit": objectSchema({
    equals: booleanSchema,
    kind: literalSchema("trigger-critical-hit"),
  }),
  "trigger-damage": objectSchema({
    comparison: COMPARISON_SCHEMA,
    kind: literalSchema("trigger-damage"),
    value: INTEGER_EXPRESSION_SCHEMA,
  }),
  "trigger-damage-delivery": objectSchema({
    delivery: DAMAGE_DELIVERY_SCHEMA,
    kind: literalSchema("trigger-damage-delivery"),
  }),
  "trigger-damage-trait": objectSchema({
    kind: literalSchema("trigger-damage-trait"),
    present: booleanSchema,
    trait: DAMAGE_TRAIT_SCHEMA,
  }),
  "trigger-damage-type": objectSchema({
    damageType: DAMAGE_TYPE_SCHEMA,
    kind: literalSchema("trigger-damage-type"),
  }),
  all: objectSchema({
    kind: literalSchema("all"),
    predicates: arraySchema(PREDICATE_REF, 1),
  }),
  any: objectSchema({
    kind: literalSchema("any"),
    predicates: arraySchema(PREDICATE_REF, 1),
  }),
  not: objectSchema({ kind: literalSchema("not"), predicate: PREDICATE_REF }),
});

type PredicateDefinitionShape = InferExactSchema<
  typeof MECHANICS_PREDICATE_SCHEMA_DEFINITION
>;
type PredicateLeaf = Exclude<
  PredicateDefinitionShape,
  { readonly kind: "all" | "any" | "not" }
>;

/** Closed, bounded predicate AST. Runtime conformance applies the bounds. */
export type MechanicsPredicateSchemaShape =
  | PredicateLeaf
  | {
      readonly kind: "all" | "any";
      readonly predicates: readonly [
        MechanicsPredicateSchemaShape,
        ...MechanicsPredicateSchemaShape[],
      ];
    }
  | { readonly kind: "not"; readonly predicate: MechanicsPredicateSchemaShape };

export const MECHANICS_PREDICATE_SCHEMA =
  bindExactSchemaOutput<MechanicsPredicateSchemaShape>()(
    MECHANICS_PREDICATE_SCHEMA_DEFINITION
  );

const NULLABLE_PREDICATE_SCHEMA = unionSchema([MECHANICS_PREDICATE_SCHEMA, NULL_SCHEMA]);

export const AMOUNT_SPEC_SCHEMA = discriminatedUnionSchema("kind", {
  integer: objectSchema({
    expression: INTEGER_EXPRESSION_SCHEMA,
    kind: literalSchema("integer"),
  }),
  "dice-input": objectSchema({
    cardinality: unionSchema([
      literalSchema("shared"),
      literalSchema("per-target-request"),
    ]),
    inputId: ID_SCHEMA,
    kind: literalSchema("dice-input"),
    transform: INTEGER_EXPRESSION_SCHEMA,
  }),
  /** A player-chosen integer per request (the pool-split law — Mass Heal's
   *  per-target portions). `shared` reads a single un-expanded integer input;
   *  `per-target-request` reads the entry whose identity matches the step's
   *  target request, exactly like a per-request dice amount. */
  "integer-input": objectSchema({
    cardinality: unionSchema([
      literalSchema("shared"),
      literalSchema("per-target-request"),
    ]),
    inputId: ID_SCHEMA,
    kind: literalSchema("integer-input"),
    transform: INTEGER_EXPRESSION_SCHEMA,
  }),
  "landed-damage": objectSchema({
    kind: literalSchema("landed-damage"),
    partId: unionSchema([ID_SCHEMA, NULL_SCHEMA]),
    stepId: ID_SCHEMA,
    transform: INTEGER_EXPRESSION_SCHEMA,
  }),
});
export type AmountSpecSchemaShape = InferExactSchema<typeof AMOUNT_SPEC_SCHEMA>;

const RESOURCE_PAYMENT_SCHEMA = objectSchema({
  sourceId: ID_SCHEMA,
  term: RESOURCE_TERM_VALUE_SCHEMA,
});

const COMMON_INPUT_FIELDS = {
  inputId: ID_SCHEMA,
  when: NULLABLE_PREDICATE_SCHEMA,
} as const;

export const MECHANICS_INPUT_SCHEMA = discriminatedUnionSchema("kind", {
  entities: objectSchema({
    ...COMMON_INPUT_FIELDS,
    eligibility: unionSchema([
      literalSchema("any"),
      literalSchema("creature"),
      literalSchema("object"),
    ]),
    kind: literalSchema("entities"),
    maximum: INTEGER_EXPRESSION_SCHEMA,
    minimum: INTEGER_EXPRESSION_SCHEMA,
    multiplicity: unionSchema([literalSchema("set"), literalSchema("slots")]),
  }),
  d20: objectSchema({
    ...COMMON_INPUT_FIELDS,
    expansion: discriminatedUnionSchema("kind", {
      single: objectSchema({
        binding: MECHANICS_ROLE_SCHEMA,
        kind: literalSchema("single"),
      }),
      entities: objectSchema({
        bind: unionSchema([literalSchema("actor"), literalSchema("target")]),
        inputId: ID_SCHEMA,
        kind: literalSchema("entities"),
      }),
    }),
    kind: literalSchema("d20"),
    payments: arraySchema(RESOURCE_PAYMENT_SCHEMA),
    request: D20_REQUEST_SPEC_VALUE_SCHEMA,
  }),
  dice: objectSchema({
    ...COMMON_INPUT_FIELDS,
    acceptancePolicy: DICE_ACCEPTANCE_POLICY_SCHEMA,
    expansion: discriminatedUnionSchema("kind", {
      single: objectSchema({
        binding: MECHANICS_ROLE_SCHEMA,
        kind: literalSchema("single"),
      }),
      entities: objectSchema({
        inputId: ID_SCHEMA,
        kind: literalSchema("entities"),
      }),
      "d20-outcomes": objectSchema({
        inputId: ID_SCHEMA,
        kind: literalSchema("d20-outcomes"),
        outcomeIds: arraySchema(D20_OUTCOME_ID_SCHEMA, 1),
      }),
      "dice-totals": objectSchema({
        comparison: COMPARISON_SCHEMA,
        inputId: ID_SCHEMA,
        kind: literalSchema("dice-totals"),
        value: INTEGER_EXPRESSION_SCHEMA,
      }),
    }),
    formula: DICE_FORMULA_VALUE_SCHEMA,
    kind: literalSchema("dice"),
    payments: arraySchema(RESOURCE_PAYMENT_SCHEMA),
    replacementPolicy: DICE_REPLACEMENT_POLICY_SCHEMA,
  }),
  choice: objectSchema({
    ...COMMON_INPUT_FIELDS,
    kind: literalSchema("choice"),
    options: arraySchema(ID_SCHEMA, 1),
  }),
  integer: objectSchema(
    {
      ...COMMON_INPUT_FIELDS,
      kind: literalSchema("integer"),
      maximum: INTEGER_EXPRESSION_SCHEMA,
      minimum: INTEGER_EXPRESSION_SCHEMA,
    },
    {
      /** One chosen integer per entity SLOT of the referenced entities input
       *  (the pool-split law). Absent ⇒ the classic single chosen amount. */
      expansion: discriminatedUnionSchema("kind", {
        entities: objectSchema({
          inputId: ID_SCHEMA,
          kind: literalSchema("entities"),
        }),
      }),
      /** Review-enforced ceiling on the SUM of every answered value (a healing
       *  pool's total). Per-answer bounds stay `minimum`/`maximum`. */
      totalMaximum: INTEGER_EXPRESSION_SCHEMA,
    }
  ),
  boolean: objectSchema({
    ...COMMON_INPUT_FIELDS,
    kind: literalSchema("boolean"),
  }),
  table: objectSchema({
    ...COMMON_INPUT_FIELDS,
    kind: literalSchema("table"),
    rows: arraySchema(ID_SCHEMA, 1),
  }),
  resource: objectSchema({
    ...COMMON_INPUT_FIELDS,
    kind: literalSchema("resource"),
    term: RESOURCE_TERM_VALUE_SCHEMA,
  }),
  item: objectSchema({
    ...COMMON_INPUT_FIELDS,
    kind: literalSchema("item"),
    owner: MECHANICS_ROLE_SCHEMA,
  }),
});
export type MechanicsInputSchemaShape = InferExactSchema<typeof MECHANICS_INPUT_SCHEMA>;

export const PHASE_TRIGGER_SCHEMA = discriminatedUnionSchema("kind", {
  invocation: objectSchema({ kind: literalSchema("invocation") }),
  "turn-boundary": objectSchema({
    combatant: MECHANICS_ROLE_SCHEMA,
    kind: literalSchema("turn-boundary"),
    phase: unionSchema([literalSchema("start"), literalSchema("end")]),
  }),
  "resource-depleted": objectSchema({
    kind: literalSchema("resource-depleted"),
    resource: RESOURCE_SELECTOR_VALUE_SCHEMA,
  }),
  "hit-points-zero": objectSchema({
    kind: literalSchema("hit-points-zero"),
    target: MECHANICS_ROLE_SCHEMA,
  }),
  "damage-taken": objectSchema({
    kind: literalSchema("damage-taken"),
    target: MECHANICS_ROLE_SCHEMA,
  }),
  "rest-completed": objectSchema({
    combatant: MECHANICS_ROLE_SCHEMA,
    kind: literalSchema("rest-completed"),
    rest: unionSchema([literalSchema("short"), literalSchema("long")]),
  }),
  "day-phase": objectSchema({
    kind: literalSchema("day-phase"),
    phase: unionSchema([literalSchema("dawn"), literalSchema("dusk")]),
  }),
  "source-end": objectSchema({ kind: literalSchema("source-end") }),
  "program-phase-end": objectSchema({
    kind: literalSchema("program-phase-end"),
    phaseId: ID_SCHEMA,
  }),
  "area-boundary": objectSchema({
    areaId: ID_SCHEMA,
    boundary: unionSchema([literalSchema("enter"), literalSchema("leave")]),
    entity: MECHANICS_ROLE_SCHEMA,
    kind: literalSchema("area-boundary"),
  }),
  "manual-table-event": objectSchema({
    eventId: ID_SCHEMA,
    kind: literalSchema("manual-table-event"),
  }),
  "root-pulse": objectSchema({
    eventId: ID_SCHEMA,
    kind: literalSchema("root-pulse"),
  }),
});
export type PhaseTriggerSchemaShape = InferExactSchema<typeof PHASE_TRIGGER_SCHEMA>;

export const LIFETIME_SPEC_SCHEMA = discriminatedUnionSchema("kind", {
  manual: objectSchema({ kind: literalSchema("manual") }),
  "source-end": objectSchema({ kind: literalSchema("source-end") }),
  "program-phase-end": objectSchema({
    kind: literalSchema("program-phase-end"),
    phaseId: ID_SCHEMA,
  }),
  "combat-end": objectSchema({ kind: literalSchema("combat-end") }),
  duration: objectSchema({
    kind: literalSchema("duration"),
    seconds: INTEGER_EXPRESSION_SCHEMA,
  }),
  "turn-boundary": objectSchema({
    combatant: MECHANICS_ROLE_SCHEMA,
    kind: literalSchema("turn-boundary"),
    offsetTurns: INTEGER_EXPRESSION_SCHEMA,
    phase: unionSchema([literalSchema("start"), literalSchema("end")]),
  }),
  "rest-completed": objectSchema({
    combatant: MECHANICS_ROLE_SCHEMA,
    kind: literalSchema("rest-completed"),
    rest: unionSchema([literalSchema("short"), literalSchema("long")]),
  }),
  "day-phase": objectSchema({
    kind: literalSchema("day-phase"),
    phase: unionSchema([literalSchema("dawn"), literalSchema("dusk")]),
  }),
  "temporary-hit-points-empty": objectSchema({
    kind: literalSchema("temporary-hit-points-empty"),
  }),
});
export type LifetimeSpecSchemaShape = InferExactSchema<typeof LIFETIME_SPEC_SCHEMA>;

const STANDING_FACT_TEMPLATE_SCHEMA = discriminatedUnionSchema("kind", {
  "active-key": objectSchema({ key: ID_SCHEMA, kind: literalSchema("active-key") }),
  "condition-immunity": objectSchema({
    conditionId: NON_EXHAUSTION_CONDITION_ID_SCHEMA,
    kind: literalSchema("condition-immunity"),
  }),
  "damage-defense": objectSchema({
    kind: literalSchema("damage-defense"),
    rule: DAMAGE_DEFENSE_RULE_VALUE_SCHEMA,
  }),
  /** Records that damage the holder takes is mirrored onto the resolved `to`
   *  entity (Warding Bond's transfer half — table-applied, kernel-recorded). */
  "damage-transfer": objectSchema({
    key: ID_SCHEMA,
    kind: literalSchema("damage-transfer"),
    to: ENTITY_SELECTOR_SCHEMA,
  }),
  "grant-group": objectSchema({
    groupId: ID_SCHEMA,
    kind: literalSchema("grant-group"),
  }),
  /** The authored max-HP raise; `amount` resolves against the cast's bindings
   *  when the standing materializes (Aid's +5 per slot level above 2). */
  "max-hp-delta": objectSchema({
    amount: INTEGER_EXPRESSION_SCHEMA,
    key: ID_SCHEMA,
    kind: literalSchema("max-hp-delta"),
  }),
  "program-fact": objectSchema({
    factId: ID_SCHEMA,
    kind: literalSchema("program-fact"),
    value: JSON_SCALAR_VALUE_SCHEMA,
  }),
  "target-mark": objectSchema({
    kind: literalSchema("target-mark"),
    markId: ID_SCHEMA,
    marked: ENTITY_SELECTOR_SCHEMA,
  }),
  /** The holder's first drop to 0 HP becomes 1 (Death Ward — single-use). */
  "zero-hp-floor": objectSchema({
    key: ID_SCHEMA,
    kind: literalSchema("zero-hp-floor"),
  }),
});

const ENTITY_TEMPLATE_SCHEMA = discriminatedUnionSchema("kind", {
  companion: objectSchema({
    kind: literalSchema("companion"),
    sourceId: ID_SCHEMA,
    variantId: ID_SCHEMA,
  }),
  monster: objectSchema({ kind: literalSchema("monster"), monsterId: ID_SCHEMA }),
  object: objectSchema({ kind: literalSchema("object"), objectId: ID_SCHEMA }),
});

const RESOURCE_STATE_OPERATION_SCHEMA = discriminatedUnionSchema("kind", {
  "set-disabled": objectSchema({
    disabled: booleanSchema,
    kind: literalSchema("set-disabled"),
  }),
  "override-capacity": objectSchema({
    capacity: INTEGER_EXPRESSION_SCHEMA,
    kind: literalSchema("override-capacity"),
  }),
  "clear-capacity-override": objectSchema({
    kind: literalSchema("clear-capacity-override"),
  }),
});

export type MechanicsProgramStepChildKind =
  | "concentration"
  | "condition"
  | "material-lifecycle"
  | "polymorph-form"
  | "standing";

/** The one authority mapping authored producers to their durable child kind. */
export function mechanicsProgramStepChildKind(
  step:
    | Readonly<{ readonly kind: string; readonly operation?: unknown }>
    | null
    | undefined
): MechanicsProgramStepChildKind | null {
  if (!step) return null;
  switch (step.kind) {
    case "temporary-hit-points":
      return "standing";
    case "condition":
      return step.operation === "apply" ? "condition" : null;
    case "standing":
      return step.operation === "start" ? "standing" : null;
    case "concentration":
      return step.operation === "start" ? "concentration" : null;
    case "polymorph":
      return step.operation === "start" ? "polymorph-form" : null;
    case "entity-create":
    case "inventory-create":
      return "material-lifecycle";
    default:
      return null;
  }
}

const INVENTORY_CHANGE_SCHEMA = discriminatedUnionSchema("kind", {
  quantity: objectSchema({
    kind: literalSchema("quantity"),
    quantity: INTEGER_EXPRESSION_SCHEMA,
  }),
  equipped: objectSchema({ equipped: booleanSchema, kind: literalSchema("equipped") }),
  attuned: objectSchema({ attuned: booleanSchema, kind: literalSchema("attuned") }),
});

const TURN_CLAIM_SCHEMA = discriminatedUnionSchema("kind", {
  "claim-action": TURN_ECONOMY_COMMAND_SCHEMA.variants["claim-action"],
  "claim-attack": TURN_ECONOMY_COMMAND_SCHEMA.variants["claim-attack"],
  "claim-bonus-action": TURN_ECONOMY_COMMAND_SCHEMA.variants["claim-bonus-action"],
  "claim-reaction": TURN_ECONOMY_COMMAND_SCHEMA.variants["claim-reaction"],
  move: TURN_ECONOMY_COMMAND_SCHEMA.variants.move,
  "claim-movement-requirement":
    TURN_ECONOMY_COMMAND_SCHEMA.variants["claim-movement-requirement"],
  "claim-free-interaction":
    TURN_ECONOMY_COMMAND_SCHEMA.variants["claim-free-interaction"],
  "record-manual-boundary":
    TURN_ECONOMY_COMMAND_SCHEMA.variants["record-manual-boundary"],
});

const COMMON_STEP_FIELDS = {
  stepId: ID_SCHEMA,
  when: NULLABLE_PREDICATE_SCHEMA,
} as const;

export const MECHANICS_STEP_SCHEMA = discriminatedUnionSchema("kind", {
  damage: objectSchema({
    ...COMMON_STEP_FIELDS,
    delivery: DAMAGE_DELIVERY_SCHEMA,
    kind: literalSchema("damage"),
    parts: arraySchema(
      objectSchema({
        amount: AMOUNT_SPEC_SCHEMA,
        damageType: DAMAGE_TYPE_SCHEMA,
        partId: ID_SCHEMA,
      }),
      1
    ),
    target: ENTITY_SELECTOR_SCHEMA,
    traits: arraySchema(DAMAGE_TRAIT_SCHEMA),
  }),
  heal: objectSchema({
    ...COMMON_STEP_FIELDS,
    amount: AMOUNT_SPEC_SCHEMA,
    kind: literalSchema("heal"),
    target: ENTITY_SELECTOR_SCHEMA,
  }),
  "temporary-hit-points": objectSchema({
    ...COMMON_STEP_FIELDS,
    amount: AMOUNT_SPEC_SCHEMA,
    decision: unionSchema([literalSchema("keep"), literalSchema("replace")]),
    kind: literalSchema("temporary-hit-points"),
    lifetime: LIFETIME_SPEC_SCHEMA,
    target: ENTITY_SELECTOR_SCHEMA,
  }),
  "clear-temporary-hit-points": objectSchema({
    ...COMMON_STEP_FIELDS,
    kind: literalSchema("clear-temporary-hit-points"),
    source: unionSchema([literalSchema("all"), literalSchema("root-child")]),
    target: ENTITY_SELECTOR_SCHEMA,
  }),
  "incoming-damage-adjustment": objectSchema({
    ...COMMON_STEP_FIELDS,
    amount: AMOUNT_SPEC_SCHEMA,
    kind: literalSchema("incoming-damage-adjustment"),
    selector: DAMAGE_DEFENSE_SELECTOR_VALUE_SCHEMA,
    sourceId: ID_SCHEMA,
  }),
  condition: objectSchema({
    ...COMMON_STEP_FIELDS,
    conditionId: NON_EXHAUSTION_CONDITION_ID_SCHEMA,
    kind: literalSchema("condition"),
    lifetime: unionSchema([LIFETIME_SPEC_SCHEMA, NULL_SCHEMA]),
    operation: unionSchema([literalSchema("apply"), literalSchema("remove")]),
    target: ENTITY_SELECTOR_SCHEMA,
  }),
  "exhaustion-change": objectSchema({
    ...COMMON_STEP_FIELDS,
    amount: INTEGER_EXPRESSION_SCHEMA,
    kind: literalSchema("exhaustion-change"),
    operation: unionSchema([literalSchema("gain"), literalSchema("remove")]),
    target: ENTITY_SELECTOR_SCHEMA,
  }),
  standing: objectSchema({
    ...COMMON_STEP_FIELDS,
    fact: STANDING_FACT_TEMPLATE_SCHEMA,
    kind: literalSchema("standing"),
    lifetime: unionSchema([LIFETIME_SPEC_SCHEMA, NULL_SCHEMA]),
    operation: unionSchema([literalSchema("start"), literalSchema("end")]),
    target: ENTITY_SELECTOR_SCHEMA,
  }),
  concentration: objectSchema({
    ...COMMON_STEP_FIELDS,
    kind: literalSchema("concentration"),
    lifetime: unionSchema([LIFETIME_SPEC_SCHEMA, NULL_SCHEMA]),
    operation: unionSchema([literalSchema("start"), literalSchema("end")]),
  }),
  polymorph: objectSchema({
    ...COMMON_STEP_FIELDS,
    formId: ID_SCHEMA,
    kind: literalSchema("polymorph"),
    lifetime: unionSchema([LIFETIME_SPEC_SCHEMA, NULL_SCHEMA]),
    operation: unionSchema([literalSchema("start"), literalSchema("end")]),
    target: ENTITY_SELECTOR_SCHEMA,
  }),
  stabilize: objectSchema({
    ...COMMON_STEP_FIELDS,
    kind: literalSchema("stabilize"),
    target: ENTITY_SELECTOR_SCHEMA,
  }),
  death: objectSchema({
    ...COMMON_STEP_FIELDS,
    kind: literalSchema("death"),
    target: ENTITY_SELECTOR_SCHEMA,
  }),
  "resource-change": objectSchema({
    ...COMMON_STEP_FIELDS,
    kind: literalSchema("resource-change"),
    operation: unionSchema([literalSchema("spend"), literalSchema("gain")]),
    term: RESOURCE_TERM_VALUE_SCHEMA,
  }),
  "resource-recover": objectSchema({
    ...COMMON_STEP_FIELDS,
    kind: literalSchema("resource-recover"),
    resource: RESOURCE_SELECTOR_VALUE_SCHEMA,
    trigger: RESOURCE_TRIGGER_VALUE_SCHEMA,
  }),
  "resource-state": objectSchema({
    ...COMMON_STEP_FIELDS,
    kind: literalSchema("resource-state"),
    operation: RESOURCE_STATE_OPERATION_SCHEMA,
    resource: RESOURCE_SELECTOR_VALUE_SCHEMA,
  }),
  "occurrence-end": objectSchema({
    ...COMMON_STEP_FIELDS,
    childStepId: ID_SCHEMA,
    kind: literalSchema("occurrence-end"),
  }),
  "entity-create": objectSchema({
    ...COMMON_STEP_FIELDS,
    controller: unionSchema([MECHANICS_ROLE_SCHEMA, NULL_SCHEMA]),
    entityKey: ID_SCHEMA,
    kind: literalSchema("entity-create"),
    lifetime: LIFETIME_SPEC_SCHEMA,
    template: ENTITY_TEMPLATE_SCHEMA,
  }),
  "entity-end": objectSchema({
    ...COMMON_STEP_FIELDS,
    kind: literalSchema("entity-end"),
    target: ENTITY_SELECTOR_SCHEMA,
  }),
  "entity-change": objectSchema({
    ...COMMON_STEP_FIELDS,
    availability: unionSchema([literalSchema("present"), literalSchema("dismissed")]),
    kind: literalSchema("entity-change"),
    target: ENTITY_SELECTOR_SCHEMA,
  }),
  "inventory-create": objectSchema({
    ...COMMON_STEP_FIELDS,
    instanceKey: ID_SCHEMA,
    itemId: ID_SCHEMA,
    kind: literalSchema("inventory-create"),
    lifetime: LIFETIME_SPEC_SCHEMA,
    owner: MECHANICS_ROLE_SCHEMA,
    quantity: INTEGER_EXPRESSION_SCHEMA,
  }),
  "inventory-end": objectSchema({
    ...COMMON_STEP_FIELDS,
    item: ITEM_SELECTOR_SCHEMA,
    kind: literalSchema("inventory-end"),
  }),
  "inventory-change": objectSchema({
    ...COMMON_STEP_FIELDS,
    change: INVENTORY_CHANGE_SCHEMA,
    item: ITEM_SELECTOR_SCHEMA,
    kind: literalSchema("inventory-change"),
  }),
  "turn-claim": objectSchema({
    ...COMMON_STEP_FIELDS,
    claim: TURN_CLAIM_SCHEMA,
    combatant: MECHANICS_ROLE_SCHEMA,
    kind: literalSchema("turn-claim"),
  }),
  register: objectSchema({
    ...COMMON_STEP_FIELDS,
    kind: literalSchema("register"),
    operation: discriminatedUnionSchema("kind", {
      add: objectSchema({
        kind: literalSchema("add"),
        value: INTEGER_EXPRESSION_SCHEMA,
      }),
      "set-integer": objectSchema({
        kind: literalSchema("set-integer"),
        value: INTEGER_EXPRESSION_SCHEMA,
      }),
      "set-scalar": objectSchema({
        kind: literalSchema("set-scalar"),
        value: JSON_SCALAR_VALUE_SCHEMA,
      }),
    }),
    registerId: ID_SCHEMA,
  }),
  "end-program": objectSchema({
    ...COMMON_STEP_FIELDS,
    kind: literalSchema("end-program"),
  }),
  "manual-relocation": objectSchema({
    ...COMMON_STEP_FIELDS,
    instructionId: ID_SCHEMA,
    kind: literalSchema("manual-relocation"),
    mode: unionSchema([literalSchema("teleport"), literalSchema("plane-transfer")]),
    target: ENTITY_SELECTOR_SCHEMA,
  }),
  "manual-table": objectSchema({
    ...COMMON_STEP_FIELDS,
    instructionId: ID_SCHEMA,
    kind: literalSchema("manual-table"),
    tableInputId: ID_SCHEMA,
  }),
});
export type MechanicsStepSchemaShape = InferExactSchema<typeof MECHANICS_STEP_SCHEMA>;

const PROGRAM_REGISTER_SCHEMA = objectSchema({
  initial: JSON_SCALAR_VALUE_SCHEMA,
  registerId: ID_SCHEMA,
});

const PROGRAM_PHASE_SCHEMA = objectSchema({
  inputs: arraySchema(MECHANICS_INPUT_SCHEMA),
  phaseId: ID_SCHEMA,
  steps: arraySchema(MECHANICS_STEP_SCHEMA),
  trigger: PHASE_TRIGGER_SCHEMA,
});

/** The only durable authored program format. */
export const MECHANICS_PROGRAM_SCHEMA = objectSchema(
  {
    id: ID_SCHEMA,
    phases: arraySchema(PROGRAM_PHASE_SCHEMA, 1),
    registers: arraySchema(PROGRAM_REGISTER_SCHEMA),
    version: POSITIVE_INTEGER_SCHEMA,
  },
  {
    /** The whole root's own lifetime; the coordinator resolves it at creation. */
    lifetime: arraySchema(LIFETIME_SPEC_SCHEMA, 1),
  }
);
export type MechanicsProgramSchemaShape = InferExactSchema<
  typeof MECHANICS_PROGRAM_SCHEMA
>;

/** Custom values interpreted by the program exact conformers. */
export type MechanicsProgramAuthoringSchemaCustomTypes = {
  readonly "d20-request-spec": D20RequestSpecSchemaShape;
  readonly "damage-defense-rule": DamageDefenseRule;
  readonly "damage-defense-selector": DamageDefenseSelector;
  readonly "dice-formula": DiceFormula;
  readonly id: string;
  readonly "integer-expression": IntegerExpression;
  readonly "json-scalar": ProgramJsonScalar;
  readonly "positive-integer": number;
  readonly "resource-selector": ResourceSelector;
  readonly "resource-term": ResourceTerm;
  readonly "resource-trigger": ResourceRecoveryTrigger;
  readonly "signed-integer": number;
  readonly "term-id": string;
};

export type MechanicsProgramAuthoringSchemaRefTypes = {
  readonly "mechanics-predicate": MechanicsPredicateSchemaShape;
};

export const MECHANICS_PROGRAM_AUTHORING_SCHEMA_REFS = {
  "mechanics-predicate": MECHANICS_PREDICATE_SCHEMA,
} as const;
