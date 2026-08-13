/** Exact, locale-free contracts for the terminal 2024 turn-economy kernel. */

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

const ID_SCHEMA = customSchema<"id", string>("id");
const NONNEGATIVE_INTEGER_SCHEMA = customSchema<"nonnegative-integer", number>(
  "nonnegative-integer"
);
const POSITIVE_INTEGER_SCHEMA = customSchema<"positive-integer", number>(
  "positive-integer"
);

export const TURN_ACTION_KINDS = [
  "attack",
  "dash",
  "disengage",
  "dodge",
  "help",
  "hide",
  "influence",
  "magic",
  "ready",
  "search",
  "study",
  "utilize",
] as const;

export const TURN_ACTION_KIND_SCHEMA = unionSchema([
  literalSchema("attack"),
  literalSchema("dash"),
  literalSchema("disengage"),
  literalSchema("dodge"),
  literalSchema("help"),
  literalSchema("hide"),
  literalSchema("influence"),
  literalSchema("magic"),
  literalSchema("ready"),
  literalSchema("search"),
  literalSchema("study"),
  literalSchema("utilize"),
]);

export const TURN_MOVEMENT_MODES = ["burrow", "climb", "fly", "swim", "walk"] as const;

export const TURN_MOVEMENT_MODE_SCHEMA = unionSchema([
  literalSchema("burrow"),
  literalSchema("climb"),
  literalSchema("fly"),
  literalSchema("swim"),
  literalSchema("walk"),
]);

const NULLABLE_POSITIVE_INTEGER_SCHEMA = unionSchema([
  POSITIVE_INTEGER_SCHEMA,
  literalSchema(null),
]);

const SCALAR_OVERRIDE_SCHEMA = objectSchema({
  reasonId: ID_SCHEMA,
  value: NONNEGATIVE_INTEGER_SCHEMA,
});

const POSITIVE_SCALAR_OVERRIDE_SCHEMA = objectSchema({
  reasonId: ID_SCHEMA,
  value: POSITIVE_INTEGER_SCHEMA,
});

const OVERRIDABLE_NONNEGATIVE_SCHEMA = objectSchema({
  base: NONNEGATIVE_INTEGER_SCHEMA,
  override: unionSchema([SCALAR_OVERRIDE_SCHEMA, literalSchema(null)]),
});

const OVERRIDABLE_ONE_SCHEMA = objectSchema({
  base: literalSchema(1),
  override: unionSchema([SCALAR_OVERRIDE_SCHEMA, literalSchema(null)]),
});

const OVERRIDABLE_POSITIVE_ONE_SCHEMA = objectSchema({
  base: literalSchema(1),
  override: unionSchema([POSITIVE_SCALAR_OVERRIDE_SCHEMA, literalSchema(null)]),
});

const OVERRIDABLE_POSITIVE_SCHEMA = objectSchema({
  base: POSITIVE_INTEGER_SCHEMA,
  override: unionSchema([POSITIVE_SCALAR_OVERRIDE_SCHEMA, literalSchema(null)]),
});

export const TURN_ACTION_SLOT_SCHEMA = objectSchema({
  allowedActions: arraySchema(TURN_ACTION_KIND_SCHEMA),
  attackLimit: NULLABLE_POSITIVE_INTEGER_SCHEMA,
  slotId: ID_SCHEMA,
  sourceId: ID_SCHEMA,
});

const TURN_ACTION_SLOTS_OVERRIDE_SCHEMA = objectSchema({
  reasonId: ID_SCHEMA,
  slots: arraySchema(TURN_ACTION_SLOT_SCHEMA),
});

export const TURN_WEAPON_ATTACK_FACTS_SCHEMA = objectSchema({
  classification: unionSchema([literalSchema("melee"), literalSchema("ranged")]),
  instanceId: ID_SCHEMA,
  light: booleanSchema,
  nickMastery: booleanSchema,
  twoHanded: booleanSchema,
});

const TURN_LIMITED_ATTACK_OPTION_FIELDS = {
  maximumPerAttackAction: NULLABLE_POSITIVE_INTEGER_SCHEMA,
  maximumPerTurn: NULLABLE_POSITIVE_INTEGER_SCHEMA,
  optionId: ID_SCHEMA,
} as const;

export const TURN_ATTACK_OPTION_SCHEMA = discriminatedUnionSchema("kind", {
  "feature-replacement": objectSchema({
    kind: literalSchema("feature-replacement"),
    ...TURN_LIMITED_ATTACK_OPTION_FIELDS,
  }),
  "unarmed-attack": objectSchema({
    kind: literalSchema("unarmed-attack"),
    ...TURN_LIMITED_ATTACK_OPTION_FIELDS,
  }),
  "weapon-attack": objectSchema({
    kind: literalSchema("weapon-attack"),
    ...TURN_LIMITED_ATTACK_OPTION_FIELDS,
    weapon: TURN_WEAPON_ATTACK_FACTS_SCHEMA,
  }),
});

const TURN_NON_ATTACK_ACTION_KIND_SCHEMA = unionSchema([
  literalSchema("dash"),
  literalSchema("disengage"),
  literalSchema("dodge"),
  literalSchema("help"),
  literalSchema("hide"),
  literalSchema("influence"),
  literalSchema("magic"),
  literalSchema("ready"),
  literalSchema("search"),
  literalSchema("study"),
  literalSchema("utilize"),
]);

export const TURN_BONUS_ACTION_REQUIREMENT_SCHEMA = objectSchema({
  actionKind: unionSchema([TURN_NON_ATTACK_ACTION_KIND_SCHEMA, literalSchema(null)]),
  requirementId: ID_SCHEMA,
});

export const TURN_REACTION_REQUIREMENT_SCHEMA = objectSchema({
  requirementId: ID_SCHEMA,
});

export const TURN_MOVEMENT_REQUIREMENT_SCHEMA = objectSchema({
  kind: literalSchema("stand-from-prone"),
  mode: TURN_MOVEMENT_MODE_SCHEMA,
  requirementId: ID_SCHEMA,
});

export const TURN_MOVEMENT_MODE_CAPABILITY_SCHEMA = objectSchema({
  mode: TURN_MOVEMENT_MODE_SCHEMA,
  speedFt: OVERRIDABLE_NONNEGATIVE_SCHEMA,
});

/**
 * A current capability projection, not a second rules language. It declares
 * option facts and durable capabilities; the reducer alone decides whether a
 * conditional use is legal in the current ledger.
 */
export const TURN_ECONOMY_PROJECTION_SCHEMA = objectSchema({
  actions: objectSchema({
    extraSlots: arraySchema(TURN_ACTION_SLOT_SCHEMA),
    override: unionSchema([TURN_ACTION_SLOTS_OVERRIDE_SCHEMA, literalSchema(null)]),
  }),
  attacks: objectSchema({
    options: arraySchema(TURN_ATTACK_OPTION_SCHEMA),
    perAttackAction: OVERRIDABLE_POSITIVE_SCHEMA,
  }),
  bonusActions: objectSchema({
    dualWielder: booleanSchema,
    limit: OVERRIDABLE_ONE_SCHEMA,
    requirements: arraySchema(TURN_BONUS_ACTION_REQUIREMENT_SCHEMA),
  }),
  freeInteractions: objectSchema({
    limit: OVERRIDABLE_ONE_SCHEMA,
  }),
  incapacitated: booleanSchema,
  movement: objectSchema({
    costPerFoot: OVERRIDABLE_POSITIVE_ONE_SCHEMA,
    modes: arraySchema(TURN_MOVEMENT_MODE_CAPABILITY_SCHEMA, 1),
    requirements: arraySchema(TURN_MOVEMENT_REQUIREMENT_SCHEMA),
  }),
  reactions: objectSchema({
    limit: OVERRIDABLE_ONE_SCHEMA,
    requirements: arraySchema(TURN_REACTION_REQUIREMENT_SCHEMA),
  }),
});

const TURN_ATTACK_OPTION_USE_SCHEMA = discriminatedUnionSchema("kind", {
  "feature-replacement": objectSchema({
    kind: literalSchema("feature-replacement"),
    optionId: ID_SCHEMA,
  }),
  "unarmed-attack": objectSchema({
    kind: literalSchema("unarmed-attack"),
    optionId: ID_SCHEMA,
  }),
  "weapon-attack": objectSchema({
    kind: literalSchema("weapon-attack"),
    optionId: ID_SCHEMA,
    weapon: TURN_WEAPON_ATTACK_FACTS_SCHEMA,
  }),
});

const TURN_NICK_AUTHORIZATION_SCHEMA = objectSchema({
  kind: literalSchema("light-nick"),
  qualifyingAttackClaimId: ID_SCHEMA,
});

const TURN_ATTACK_USE_SCHEMA = objectSchema({
  authorization: unionSchema([TURN_NICK_AUTHORIZATION_SCHEMA, literalSchema(null)]),
  claimId: ID_SCHEMA,
  option: TURN_ATTACK_OPTION_USE_SCHEMA,
});

const TURN_ACTION_CLAIM_SCHEMA = discriminatedUnionSchema("kind", {
  attack: objectSchema({
    attacks: arraySchema(TURN_ATTACK_USE_SCHEMA, 1),
    claimId: ID_SCHEMA,
    kind: literalSchema("attack"),
  }),
  dash: objectSchema({ claimId: ID_SCHEMA, kind: literalSchema("dash") }),
  disengage: objectSchema({
    claimId: ID_SCHEMA,
    kind: literalSchema("disengage"),
  }),
  dodge: objectSchema({ claimId: ID_SCHEMA, kind: literalSchema("dodge") }),
  help: objectSchema({ claimId: ID_SCHEMA, kind: literalSchema("help") }),
  hide: objectSchema({ claimId: ID_SCHEMA, kind: literalSchema("hide") }),
  influence: objectSchema({
    claimId: ID_SCHEMA,
    kind: literalSchema("influence"),
  }),
  magic: objectSchema({ claimId: ID_SCHEMA, kind: literalSchema("magic") }),
  ready: objectSchema({
    claimId: ID_SCHEMA,
    kind: literalSchema("ready"),
    preparationId: ID_SCHEMA,
  }),
  search: objectSchema({ claimId: ID_SCHEMA, kind: literalSchema("search") }),
  study: objectSchema({ claimId: ID_SCHEMA, kind: literalSchema("study") }),
  utilize: objectSchema({
    claimId: ID_SCHEMA,
    kind: literalSchema("utilize"),
  }),
});

const TURN_BONUS_ACTION_CLAIM_SCHEMA = discriminatedUnionSchema("kind", {
  action: objectSchema({
    actionKind: unionSchema([TURN_NON_ATTACK_ACTION_KIND_SCHEMA, literalSchema(null)]),
    claimId: ID_SCHEMA,
    kind: literalSchema("action"),
    requirementId: ID_SCHEMA,
  }),
  "dual-wielder-extra-attack": objectSchema({
    claimId: ID_SCHEMA,
    kind: literalSchema("dual-wielder-extra-attack"),
    option: TURN_ATTACK_OPTION_USE_SCHEMA,
    qualifyingAttackClaimId: ID_SCHEMA,
  }),
  "light-extra-attack": objectSchema({
    claimId: ID_SCHEMA,
    kind: literalSchema("light-extra-attack"),
    option: TURN_ATTACK_OPTION_USE_SCHEMA,
    qualifyingAttackClaimId: ID_SCHEMA,
  }),
});

const TURN_REACTION_CLAIM_SCHEMA = discriminatedUnionSchema("kind", {
  program: objectSchema({
    claimId: ID_SCHEMA,
    kind: literalSchema("program"),
    requirementId: ID_SCHEMA,
  }),
  ready: objectSchema({
    claimId: ID_SCHEMA,
    kind: literalSchema("ready"),
    preparationId: ID_SCHEMA,
    readyActionClaimId: ID_SCHEMA,
  }),
});

const TURN_MOVEMENT_CLAIM_SCHEMA = objectSchema({
  claimId: ID_SCHEMA,
  costFt: POSITIVE_INTEGER_SCHEMA,
  distanceFt: POSITIVE_INTEGER_SCHEMA,
  mode: TURN_MOVEMENT_MODE_SCHEMA,
});

const TURN_MOVEMENT_REQUIREMENT_CLAIM_SCHEMA = objectSchema({
  claimId: ID_SCHEMA,
  costFt: NONNEGATIVE_INTEGER_SCHEMA,
  requirementId: ID_SCHEMA,
});

const TURN_FREE_INTERACTION_CLAIM_SCHEMA = objectSchema({
  claimId: ID_SCHEMA,
  interactionId: ID_SCHEMA,
  timingBoundary: objectSchema({
    authority: unionSchema([literalSchema("environment"), literalSchema("table")]),
    boundaryId: ID_SCHEMA,
  }),
});

const TURN_MANUAL_BOUNDARY_SCHEMA = objectSchema({
  authority: unionSchema([literalSchema("environment"), literalSchema("table")]),
  boundaryId: ID_SCHEMA,
  claimId: ID_SCHEMA,
});

/** One ledger survives after the turn so a readied action can react before next start. */
export const TURN_ECONOMY_STATE_SCHEMA = objectSchema({
  actions: arraySchema(TURN_ACTION_CLAIM_SCHEMA),
  bonusActions: arraySchema(TURN_BONUS_ACTION_CLAIM_SCHEMA),
  freeInteractions: arraySchema(TURN_FREE_INTERACTION_CLAIM_SCHEMA),
  manualBoundaries: arraySchema(TURN_MANUAL_BOUNDARY_SCHEMA),
  movement: arraySchema(TURN_MOVEMENT_CLAIM_SCHEMA),
  movementRequirements: arraySchema(TURN_MOVEMENT_REQUIREMENT_CLAIM_SCHEMA),
  phase: unionSchema([literalSchema("between-turns"), literalSchema("own-turn")]),
  reactions: arraySchema(TURN_REACTION_CLAIM_SCHEMA),
  schema: literalSchema(1),
  turnId: ID_SCHEMA,
});

const CLAIM_ACTION_PAYLOAD_SCHEMA = discriminatedUnionSchema("kind", {
  attack: objectSchema({
    firstAttack: objectSchema({
      claimId: ID_SCHEMA,
      optionId: ID_SCHEMA,
    }),
    kind: literalSchema("attack"),
  }),
  dash: objectSchema({ kind: literalSchema("dash") }),
  disengage: objectSchema({ kind: literalSchema("disengage") }),
  dodge: objectSchema({ kind: literalSchema("dodge") }),
  help: objectSchema({ kind: literalSchema("help") }),
  hide: objectSchema({ kind: literalSchema("hide") }),
  influence: objectSchema({ kind: literalSchema("influence") }),
  magic: objectSchema({ kind: literalSchema("magic") }),
  ready: objectSchema({
    kind: literalSchema("ready"),
    preparationId: ID_SCHEMA,
  }),
  search: objectSchema({ kind: literalSchema("search") }),
  study: objectSchema({ kind: literalSchema("study") }),
  utilize: objectSchema({ kind: literalSchema("utilize") }),
});

const CLAIM_REACTION_PAYLOAD_SCHEMA = discriminatedUnionSchema("kind", {
  program: objectSchema({
    kind: literalSchema("program"),
    requirementId: ID_SCHEMA,
  }),
  ready: objectSchema({
    kind: literalSchema("ready"),
    readyActionClaimId: ID_SCHEMA,
  }),
});

export const TURN_ECONOMY_COMMAND_SCHEMA = discriminatedUnionSchema("kind", {
  "start-turn": objectSchema({
    kind: literalSchema("start-turn"),
    turnId: ID_SCHEMA,
  }),
  "end-turn": objectSchema({ kind: literalSchema("end-turn") }),
  "claim-action": objectSchema({
    action: CLAIM_ACTION_PAYLOAD_SCHEMA,
    claimId: ID_SCHEMA,
    kind: literalSchema("claim-action"),
  }),
  "claim-attack": objectSchema({
    attackActionClaimId: ID_SCHEMA,
    authorization: unionSchema([TURN_NICK_AUTHORIZATION_SCHEMA, literalSchema(null)]),
    claimId: ID_SCHEMA,
    kind: literalSchema("claim-attack"),
    optionId: ID_SCHEMA,
  }),
  "claim-bonus-action": objectSchema({
    bonusAction: discriminatedUnionSchema("kind", {
      action: objectSchema({
        kind: literalSchema("action"),
        requirementId: ID_SCHEMA,
      }),
      "dual-wielder-extra-attack": objectSchema({
        kind: literalSchema("dual-wielder-extra-attack"),
        optionId: ID_SCHEMA,
        qualifyingAttackClaimId: ID_SCHEMA,
      }),
      "light-extra-attack": objectSchema({
        kind: literalSchema("light-extra-attack"),
        optionId: ID_SCHEMA,
        qualifyingAttackClaimId: ID_SCHEMA,
      }),
    }),
    claimId: ID_SCHEMA,
    kind: literalSchema("claim-bonus-action"),
  }),
  "claim-reaction": objectSchema({
    claimId: ID_SCHEMA,
    kind: literalSchema("claim-reaction"),
    reaction: CLAIM_REACTION_PAYLOAD_SCHEMA,
  }),
  move: objectSchema({
    claimId: ID_SCHEMA,
    distanceFt: POSITIVE_INTEGER_SCHEMA,
    kind: literalSchema("move"),
    mode: TURN_MOVEMENT_MODE_SCHEMA,
  }),
  "claim-movement-requirement": objectSchema({
    claimId: ID_SCHEMA,
    kind: literalSchema("claim-movement-requirement"),
    requirementId: ID_SCHEMA,
  }),
  "claim-free-interaction": objectSchema({
    claimId: ID_SCHEMA,
    interactionId: ID_SCHEMA,
    kind: literalSchema("claim-free-interaction"),
    timingBoundary: objectSchema({
      authority: unionSchema([literalSchema("environment"), literalSchema("table")]),
      boundaryId: ID_SCHEMA,
    }),
  }),
  "record-manual-boundary": objectSchema({
    authority: unionSchema([literalSchema("environment"), literalSchema("table")]),
    boundaryId: ID_SCHEMA,
    claimId: ID_SCHEMA,
    kind: literalSchema("record-manual-boundary"),
  }),
});

export type TurnEconomySchemaCustomTypes = {
  readonly id: string;
  readonly "nonnegative-integer": number;
  readonly "positive-integer": number;
};

export type TurnActionKind = (typeof TURN_ACTION_KINDS)[number];
export type TurnMovementMode = (typeof TURN_MOVEMENT_MODES)[number];
export type TurnActionSlot = InferExactSchema<
  typeof TURN_ACTION_SLOT_SCHEMA,
  TurnEconomySchemaCustomTypes
>;
export type TurnAttackOption = InferExactSchema<
  typeof TURN_ATTACK_OPTION_SCHEMA,
  TurnEconomySchemaCustomTypes
>;
export type TurnEconomyProjection = InferExactSchema<
  typeof TURN_ECONOMY_PROJECTION_SCHEMA,
  TurnEconomySchemaCustomTypes
>;
export type TurnEconomyState = InferExactSchema<
  typeof TURN_ECONOMY_STATE_SCHEMA,
  TurnEconomySchemaCustomTypes
>;
export type TurnEconomyCommand = InferExactSchema<
  typeof TURN_ECONOMY_COMMAND_SCHEMA,
  TurnEconomySchemaCustomTypes
>;
export type TurnEconomyClaimCommand = Extract<
  TurnEconomyCommand,
  { readonly claimId: string }
>;

export interface TurnEconomyEffectiveScalar {
  readonly base: number;
  readonly effective: number;
  readonly overrideReasonId: string | null;
}

export interface TurnEconomyBudget {
  readonly actionSlots: readonly TurnActionSlot[];
  readonly actionSlotsOverrideReasonId: string | null;
  readonly attacksPerAttackAction: TurnEconomyEffectiveScalar;
  readonly bonusActions: TurnEconomyEffectiveScalar;
  readonly freeInteractions: TurnEconomyEffectiveScalar;
  readonly movementCostPerFoot: TurnEconomyEffectiveScalar;
  readonly movementModes: readonly TurnMovementModeBudget[];
  readonly reactions: TurnEconomyEffectiveScalar;
}

export interface TurnMovementModeBudget {
  readonly mode: TurnMovementMode;
  readonly speedFt: TurnEconomyEffectiveScalar;
}

export type TurnEconomyRejection =
  | "invalid-state"
  | "invalid-projection"
  | "invalid-command"
  | "claim-collision"
  | "not-own-turn"
  | "incapacitated"
  | "action-unavailable"
  | "action-restricted"
  | "attack-action-unavailable"
  | "attack-option-unavailable"
  | "attack-limit"
  | "extra-attack-unavailable"
  | "extra-attack-limit"
  | "bonus-action-unavailable"
  | "bonus-action-requirement-unavailable"
  | "reaction-unavailable"
  | "reaction-requirement-unavailable"
  | "ready-action-unavailable"
  | "movement-unavailable"
  | "movement-requirement-unavailable"
  | "free-interaction-unavailable"
  | "invalid-after";

export type TurnEconomyNoChangeReason =
  | "already-claimed"
  | "already-ended"
  | "already-started";

export type TurnEconomyResult =
  | {
      readonly after: Readonly<TurnEconomyState>;
      readonly before: Readonly<TurnEconomyState>;
      readonly budget: Readonly<TurnEconomyBudget>;
      readonly command: Readonly<TurnEconomyCommand>;
      readonly status: "planned";
    }
  | {
      readonly command: Readonly<TurnEconomyCommand>;
      readonly reason: TurnEconomyNoChangeReason;
      readonly state: Readonly<TurnEconomyState>;
      readonly status: "no-change";
    }
  | {
      readonly reason: TurnEconomyRejection;
      readonly status: "rejected";
    };
