/** Pure 2024 turn-economy planner: no RNG, localization, range, or line of sight. */

import { exactConformer, type ExactSchemaContext } from "@/lib/exact-schema";
import {
  TURN_ECONOMY_COMMAND_SCHEMA,
  TURN_ECONOMY_PROJECTION_SCHEMA,
  TURN_ECONOMY_STATE_SCHEMA,
  type TurnActionSlot,
  type TurnAttackOption,
  type TurnEconomyBudget,
  type TurnEconomyCommand,
  type TurnEconomyEffectiveScalar,
  type TurnEconomyProjection,
  type TurnEconomyResult,
  type TurnEconomySchemaCustomTypes,
  type TurnEconomyState,
  type TurnMovementMode,
} from "@/types/turn-economy";

const MAX_ID_LENGTH = 256;
const MAX_ECONOMY_VALUE = 1_000_000_000;
const MAX_ACTION_SLOTS = 64;
const CORE_ACTION_SLOT_ID = "core.action";
const UNSAFE_IDS = new Set(["__proto__", "constructor", "prototype"]);

type ActionClaim = TurnEconomyState["actions"][number];
type AttackActionClaim = Extract<ActionClaim, { readonly kind: "attack" }>;
type AttackUse = AttackActionClaim["attacks"][number];
type AttackOptionUse = AttackUse["option"];
type WeaponAttackUse = Extract<AttackOptionUse, { readonly kind: "weapon-attack" }>;
type BonusActionClaim = TurnEconomyState["bonusActions"][number];
type ReactionClaim = TurnEconomyState["reactions"][number];
type MovementClaim = TurnEconomyState["movement"][number];
type MovementRequirementClaim = TurnEconomyState["movementRequirements"][number];
type FreeInteractionClaim = TurnEconomyState["freeInteractions"][number];
type ManualBoundary = TurnEconomyState["manualBoundaries"][number];

function identifier(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    value.trim() === value &&
    !UNSAFE_IDS.has(value)
    ? value
    : null;
}

function integer(value: unknown, minimum: number): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= MAX_ECONOMY_VALUE &&
    !Object.is(value, -0)
    ? value
    : null;
}

const ECONOMY_CONTEXT: ExactSchemaContext<
  TurnEconomySchemaCustomTypes,
  Record<never, never>
> = {
  customs: {
    id: identifier,
    "nonnegative-integer": (value) => integer(value, 0),
    "positive-integer": (value) => integer(value, 1),
  },
  refs: {},
};

const conformProjectionStructure = exactConformer(
  TURN_ECONOMY_PROJECTION_SCHEMA,
  ECONOMY_CONTEXT
);
const conformStateStructure = exactConformer(TURN_ECONOMY_STATE_SCHEMA, ECONOMY_CONTEXT);
const conformCommandStructure = exactConformer(
  TURN_ECONOMY_COMMAND_SCHEMA,
  ECONOMY_CONTEXT
);

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function validSlotSet(slots: readonly TurnActionSlot[]): boolean {
  return (
    unique(slots.map(({ slotId }) => slotId)) &&
    slots.every(({ allowedActions }) => unique(allowedActions))
  );
}

function sameWeaponFacts(
  left: WeaponAttackUse["weapon"],
  right: WeaponAttackUse["weapon"]
): boolean {
  return (
    left.classification === right.classification &&
    left.light === right.light &&
    left.nickMastery === right.nickMastery &&
    left.twoHanded === right.twoHanded
  );
}

function validWeaponFacts(weapons: readonly WeaponAttackUse["weapon"][]): boolean {
  const factsByInstance = new Map<string, WeaponAttackUse["weapon"]>();
  for (const weapon of weapons) {
    if (weapon.nickMastery && !weapon.light) return false;
    const existing = factsByInstance.get(weapon.instanceId);
    if (existing && !sameWeaponFacts(existing, weapon)) return false;
    factsByInstance.set(weapon.instanceId, weapon);
  }
  return true;
}

function projectionWeaponFacts(
  options: readonly TurnAttackOption[]
): readonly WeaponAttackUse["weapon"][] {
  return options.flatMap((option) =>
    option.kind === "weapon-attack" ? [option.weapon] : []
  );
}

/** Exact hostile-input boundary for the current capability projection. */
export function conformTurnEconomyProjection(
  value: unknown
): Readonly<TurnEconomyProjection> | null {
  const projection = conformProjectionStructure(value);
  if (!projection) return null;
  if (
    !validSlotSet(projection.actions.extraSlots) ||
    projection.actions.extraSlots.length >= MAX_ACTION_SLOTS ||
    projection.actions.extraSlots.some(({ slotId }) => slotId === CORE_ACTION_SLOT_ID) ||
    (projection.actions.override !== null &&
      (!validSlotSet(projection.actions.override.slots) ||
        projection.actions.override.slots.length > MAX_ACTION_SLOTS)) ||
    !unique(projection.attacks.options.map(({ optionId }) => optionId)) ||
    !validWeaponFacts(projectionWeaponFacts(projection.attacks.options)) ||
    !unique(
      projection.bonusActions.requirements.map(({ requirementId }) => requirementId)
    ) ||
    !unique(
      projection.reactions.requirements.map(({ requirementId }) => requirementId)
    ) ||
    !unique(projection.movement.requirements.map(({ requirementId }) => requirementId)) ||
    !unique(projection.movement.modes.map(({ mode }) => mode)) ||
    projection.movement.requirements.some(
      (requirement) =>
        !projection.movement.modes.some(({ mode }) => mode === requirement.mode)
    )
  ) {
    return null;
  }
  return projection;
}

function weaponOption(value: AttackOptionUse): WeaponAttackUse | null {
  return value.kind === "weapon-attack" ? value : null;
}

function lightExtraPairIsValid(
  qualifying: AttackOptionUse,
  extra: AttackOptionUse,
  nickRequired: boolean
): boolean {
  const qualifyingWeapon = weaponOption(qualifying);
  const extraWeapon = weaponOption(extra);
  return Boolean(
    qualifyingWeapon?.weapon.light &&
    extraWeapon?.weapon.light &&
    (!nickRequired ||
      qualifyingWeapon.weapon.nickMastery ||
      extraWeapon.weapon.nickMastery) &&
    qualifyingWeapon.weapon.instanceId !== extraWeapon.weapon.instanceId
  );
}

function dualWielderPairIsValid(
  qualifying: AttackOptionUse,
  extra: AttackOptionUse
): boolean {
  const qualifyingWeapon = weaponOption(qualifying);
  const extraWeapon = weaponOption(extra);
  return Boolean(
    qualifyingWeapon?.weapon.light &&
    extraWeapon?.weapon.classification === "melee" &&
    !extraWeapon.weapon.twoHanded &&
    qualifyingWeapon.weapon.instanceId !== extraWeapon.weapon.instanceId
  );
}

function attackUseInState(
  state: Readonly<TurnEconomyState>,
  claimId: string
): AttackUse | null {
  for (const action of state.actions) {
    if (action.kind !== "attack") continue;
    const attack = action.attacks.find((candidate) => candidate.claimId === claimId);
    if (attack) return attack;
  }
  return null;
}

function lightExtraAttackUses(state: Readonly<TurnEconomyState>): number {
  return (
    state.actions.reduce(
      (count, action) =>
        count +
        (action.kind === "attack"
          ? action.attacks.filter(
              ({ authorization }) => authorization?.kind === "light-nick"
            ).length
          : 0),
      0
    ) + state.bonusActions.filter(({ kind }) => kind === "light-extra-attack").length
  );
}

function validNickLinks(action: Readonly<AttackActionClaim>): boolean {
  return action.attacks.every((attack, attackIndex) => {
    const authorization = attack.authorization;
    if (authorization === null) return true;
    const qualifyingIndex = action.attacks.findIndex(
      ({ claimId }) => claimId === authorization.qualifyingAttackClaimId
    );
    const qualifying = action.attacks[qualifyingIndex];
    return (
      qualifyingIndex >= 0 &&
      qualifyingIndex < attackIndex &&
      qualifying !== undefined &&
      lightExtraPairIsValid(qualifying.option, attack.option, true)
    );
  });
}

function validBonusActionLinks(
  state: Readonly<TurnEconomyState>,
  claim: Readonly<BonusActionClaim>
): boolean {
  if (claim.kind === "action") return true;
  const qualifying = attackUseInState(state, claim.qualifyingAttackClaimId);
  if (!qualifying) return false;
  return claim.kind === "light-extra-attack"
    ? lightExtraPairIsValid(qualifying.option, claim.option, false)
    : dualWielderPairIsValid(qualifying.option, claim.option);
}

function stateClaimIds(state: Readonly<TurnEconomyState>): string[] {
  return [
    ...state.actions.flatMap((action) => [
      action.claimId,
      ...(action.kind === "attack" ? action.attacks.map(({ claimId }) => claimId) : []),
    ]),
    ...state.bonusActions.map(({ claimId }) => claimId),
    ...state.reactions.map(({ claimId }) => claimId),
    ...state.movement.map(({ claimId }) => claimId),
    ...state.movementRequirements.map(({ claimId }) => claimId),
    ...state.freeInteractions.map(({ claimId }) => claimId),
    ...state.manualBoundaries.map(({ claimId }) => claimId),
  ];
}

function stateWeaponFacts(
  state: Readonly<TurnEconomyState>
): readonly WeaponAttackUse["weapon"][] {
  return [
    ...state.actions.flatMap((action) =>
      action.kind === "attack"
        ? action.attacks.flatMap(({ option }) => {
            const weapon = weaponOption(option);
            return weapon ? [weapon.weapon] : [];
          })
        : []
    ),
    ...state.bonusActions.flatMap((claim) => {
      if (claim.kind === "action") return [];
      const weapon = weaponOption(claim.option);
      return weapon ? [weapon.weapon] : [];
    }),
  ];
}

/** Exact state boundary plus ledger-wide identity and Ready-link invariants. */
export function conformTurnEconomyState(
  value: unknown
): Readonly<TurnEconomyState> | null {
  const state = conformStateStructure(value);
  if (
    !state ||
    !unique(stateClaimIds(state)) ||
    !unique(state.movementRequirements.map(({ requirementId }) => requirementId)) ||
    !validWeaponFacts(stateWeaponFacts(state)) ||
    state.actions.some((action) => action.kind === "attack" && !validNickLinks(action)) ||
    state.bonusActions.some((claim) => !validBonusActionLinks(state, claim)) ||
    lightExtraAttackUses(state) > 1 ||
    state.bonusActions.filter(({ kind }) => kind === "dual-wielder-extra-attack").length >
      1
  ) {
    return null;
  }
  if (
    state.actions.some(
      (action) => action.kind === "attack" && action.attacks[0].authorization !== null
    )
  ) {
    return null;
  }
  const readyActions = state.actions
    .filter((action) => action.kind === "ready")
    .map((action) => [action.claimId, action.preparationId] as const);
  const readyReactions = state.reactions.filter((reaction) => reaction.kind === "ready");
  return !unique(readyActions.map(([, preparationId]) => preparationId)) ||
    !unique(readyReactions.map(({ readyActionClaimId }) => readyActionClaimId)) ||
    readyReactions.some(
      (reaction) =>
        !readyActions.some(
          ([claimId, preparationId]) =>
            claimId === reaction.readyActionClaimId &&
            preparationId === reaction.preparationId
        )
    )
    ? null
    : state;
}

/** Exact hostile-input boundary for a proposed turn transition. */
export function conformTurnEconomyCommand(
  value: unknown
): Readonly<TurnEconomyCommand> | null {
  const command = conformCommandStructure(value);
  if (
    command?.kind === "claim-action" &&
    command.action.kind === "attack" &&
    command.claimId === command.action.firstAttack.claimId
  ) {
    return null;
  }
  return command;
}

function effectiveScalar(value: {
  readonly base: number;
  readonly override: { readonly reasonId: string; readonly value: number } | null;
}): TurnEconomyEffectiveScalar {
  return Object.freeze({
    base: value.base,
    effective: value.override?.value ?? value.base,
    overrideReasonId: value.override?.reasonId ?? null,
  });
}

function budgetFor(
  projection: Readonly<TurnEconomyProjection>
): Readonly<TurnEconomyBudget> {
  const coreAction: TurnActionSlot = Object.freeze({
    allowedActions: Object.freeze([]),
    attackLimit: null,
    slotId: CORE_ACTION_SLOT_ID,
    sourceId: CORE_ACTION_SLOT_ID,
  });
  const override = projection.actions.override;
  const actionSlots = Object.freeze(
    override ? [...override.slots] : [coreAction, ...projection.actions.extraSlots]
  );
  return Object.freeze({
    actionSlots,
    actionSlotsOverrideReasonId: override?.reasonId ?? null,
    attacksPerAttackAction: effectiveScalar(projection.attacks.perAttackAction),
    bonusActions: effectiveScalar(projection.bonusActions.limit),
    freeInteractions: effectiveScalar(projection.freeInteractions.limit),
    movementCostPerFoot: effectiveScalar(projection.movement.costPerFoot),
    movementModes: Object.freeze(
      projection.movement.modes.map(({ mode, speedFt }) =>
        Object.freeze({ mode, speedFt: effectiveScalar(speedFt) })
      )
    ),
    reactions: effectiveScalar(projection.reactions.limit),
  });
}

/** Resolve universal budgets plus all explicit projection overrides. */
export function deriveTurnEconomyBudget(
  value: unknown
): Readonly<TurnEconomyBudget> | null {
  const projection = conformTurnEconomyProjection(value);
  return projection ? budgetFor(projection) : null;
}

function createEconomyState(
  turnId: unknown,
  phase: TurnEconomyState["phase"]
): Readonly<TurnEconomyState> | null {
  const id = identifier(turnId);
  return id
    ? conformTurnEconomyState({
        actions: [],
        bonusActions: [],
        freeInteractions: [],
        manualBoundaries: [],
        movement: [],
        movementRequirements: [],
        phase,
        reactions: [],
        schema: 1,
        turnId: id,
      })
    : null;
}

/** Start the first own turn; later starts go through the reducer and refresh Reaction. */
export function createTurnEconomyState(
  turnId: unknown
): Readonly<TurnEconomyState> | null {
  return createEconomyState(turnId, "own-turn");
}

/** Initial off-turn ledger: Reaction is available before the creature's first turn. */
export function createBetweenTurnsEconomyState(
  turnId: unknown
): Readonly<TurnEconomyState> | null {
  return createEconomyState(turnId, "between-turns");
}

function slotAccepts(slot: TurnActionSlot, action: ActionClaim): boolean {
  if (slot.allowedActions.length > 0 && !slot.allowedActions.includes(action.kind)) {
    return false;
  }
  return (
    action.kind !== "attack" ||
    slot.attackLimit === null ||
    action.attacks.length <= slot.attackLimit
  );
}

function canAssignActions(
  actions: readonly ActionClaim[],
  slots: readonly TurnActionSlot[]
): boolean {
  if (actions.length > slots.length) return false;
  const ordered = [...actions].sort((left, right) => {
    const leftChoices = slots.filter((slot) => slotAccepts(slot, left)).length;
    const rightChoices = slots.filter((slot) => slotAccepts(slot, right)).length;
    if (leftChoices !== rightChoices) return leftChoices - rightChoices;
    const leftAttacks = left.kind === "attack" ? left.attacks.length : 0;
    const rightAttacks = right.kind === "attack" ? right.attacks.length : 0;
    return rightAttacks - leftAttacks;
  });
  const slotOwners = slots.map(() => -1);
  const assign = (actionIndex: number, seen: Set<number>): boolean => {
    const action = ordered[actionIndex];
    if (!action) return false;
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const slot = slots[slotIndex];
      if (!slot || seen.has(slotIndex) || !slotAccepts(slot, action)) continue;
      seen.add(slotIndex);
      const owner = slotOwners[slotIndex] ?? -1;
      if (owner === -1 || assign(owner, seen)) {
        slotOwners[slotIndex] = actionIndex;
        return true;
      }
    }
    return false;
  };
  return ordered.every((_, actionIndex) => assign(actionIndex, new Set()));
}

function attackOption(
  projection: Readonly<TurnEconomyProjection>,
  optionId: string
): TurnAttackOption | null {
  return (
    projection.attacks.options.find((option) => option.optionId === optionId) ?? null
  );
}

function attackOptionUse(option: Readonly<TurnAttackOption>): AttackOptionUse {
  return option.kind === "weapon-attack"
    ? {
        kind: option.kind,
        optionId: option.optionId,
        weapon: option.weapon,
      }
    : { kind: option.kind, optionId: option.optionId };
}

function turnOptionUses(state: Readonly<TurnEconomyState>, optionId: string): number {
  return (
    state.actions.reduce(
      (count, action) =>
        count +
        (action.kind === "attack"
          ? action.attacks.filter((attack) => attack.option.optionId === optionId).length
          : 0),
      0
    ) +
    state.bonusActions.filter(
      (claim) => claim.kind !== "action" && claim.option.optionId === optionId
    ).length
  );
}

function optionLimitReason(
  state: Readonly<TurnEconomyState>,
  option: TurnAttackOption,
  attackAction: Readonly<AttackActionClaim> | null
): "attack-limit" | null {
  if (
    option.maximumPerTurn !== null &&
    turnOptionUses(state, option.optionId) >= option.maximumPerTurn
  ) {
    return "attack-limit";
  }
  if (
    attackAction &&
    option.maximumPerAttackAction !== null &&
    attackAction.attacks.filter((attack) => attack.option.optionId === option.optionId)
      .length >= option.maximumPerAttackAction
  ) {
    return "attack-limit";
  }
  return null;
}

type ExistingClaim =
  | { readonly kind: "action"; readonly value: ActionClaim }
  | {
      readonly actionClaimId: string;
      readonly kind: "attack";
      readonly value: AttackUse;
    }
  | { readonly kind: "bonus"; readonly value: BonusActionClaim }
  | { readonly kind: "reaction"; readonly value: ReactionClaim }
  | { readonly kind: "movement"; readonly value: MovementClaim }
  | {
      readonly kind: "movement-requirement";
      readonly value: MovementRequirementClaim;
    }
  | { readonly kind: "free"; readonly value: FreeInteractionClaim }
  | { readonly kind: "manual"; readonly value: ManualBoundary };

function existingClaim(
  state: Readonly<TurnEconomyState>,
  claimId: string
): ExistingClaim | null {
  for (const action of state.actions) {
    if (action.claimId === claimId) return { kind: "action", value: action };
    if (action.kind === "attack") {
      const attack = action.attacks.find((entry) => entry.claimId === claimId);
      if (attack) {
        return {
          actionClaimId: action.claimId,
          kind: "attack",
          value: attack,
        };
      }
    }
  }
  const bonus = state.bonusActions.find((entry) => entry.claimId === claimId);
  if (bonus) return { kind: "bonus", value: bonus };
  const reaction = state.reactions.find((entry) => entry.claimId === claimId);
  if (reaction) return { kind: "reaction", value: reaction };
  const movement = state.movement.find((entry) => entry.claimId === claimId);
  if (movement) return { kind: "movement", value: movement };
  const movementRequirement = state.movementRequirements.find(
    (entry) => entry.claimId === claimId
  );
  if (movementRequirement) {
    return { kind: "movement-requirement", value: movementRequirement };
  }
  const free = state.freeInteractions.find((entry) => entry.claimId === claimId);
  if (free) return { kind: "free", value: free };
  const manual = state.manualBoundaries.find((entry) => entry.claimId === claimId);
  return manual ? { kind: "manual", value: manual } : null;
}

function sameClaim(
  existing: ExistingClaim,
  command: Readonly<TurnEconomyCommand>
): boolean {
  switch (command.kind) {
    case "claim-action":
      if (existing.kind !== "action" || existing.value.kind !== command.action.kind) {
        return false;
      }
      return command.action.kind === "attack"
        ? existing.value.kind === "attack" &&
            existing.value.attacks[0].claimId === command.action.firstAttack.claimId &&
            existing.value.attacks[0].option.optionId ===
              command.action.firstAttack.optionId
        : command.action.kind === "ready"
          ? existing.value.kind === "ready" &&
            existing.value.preparationId === command.action.preparationId
          : true;
    case "claim-attack":
      return (
        existing.kind === "attack" &&
        existing.actionClaimId === command.attackActionClaimId &&
        existing.value.option.optionId === command.optionId &&
        existing.value.authorization?.kind === command.authorization?.kind &&
        (command.authorization === null ||
          (existing.value.authorization !== null &&
            existing.value.authorization.qualifyingAttackClaimId ===
              command.authorization.qualifyingAttackClaimId))
      );
    case "claim-bonus-action":
      if (existing.kind !== "bonus" || existing.value.kind !== command.bonusAction.kind) {
        return false;
      }
      return command.bonusAction.kind === "action"
        ? existing.value.kind === "action" &&
            existing.value.requirementId === command.bonusAction.requirementId
        : existing.value.kind !== "action" &&
            existing.value.option.optionId === command.bonusAction.optionId &&
            existing.value.qualifyingAttackClaimId ===
              command.bonusAction.qualifyingAttackClaimId;
    case "claim-reaction":
      return (
        existing.kind === "reaction" &&
        existing.value.kind === command.reaction.kind &&
        (command.reaction.kind === "program"
          ? existing.value.kind === "program" &&
            existing.value.requirementId === command.reaction.requirementId
          : existing.value.kind === "ready" &&
            existing.value.readyActionClaimId === command.reaction.readyActionClaimId)
      );
    case "move":
      return (
        existing.kind === "movement" &&
        existing.value.distanceFt === command.distanceFt &&
        existing.value.mode === command.mode
      );
    case "claim-movement-requirement":
      return (
        existing.kind === "movement-requirement" &&
        existing.value.requirementId === command.requirementId
      );
    case "claim-free-interaction":
      return (
        existing.kind === "free" &&
        existing.value.interactionId === command.interactionId &&
        existing.value.timingBoundary.authority === command.timingBoundary.authority &&
        existing.value.timingBoundary.boundaryId === command.timingBoundary.boundaryId
      );
    case "record-manual-boundary":
      return (
        existing.kind === "manual" &&
        existing.value.authority === command.authority &&
        existing.value.boundaryId === command.boundaryId
      );
    case "start-turn":
    case "end-turn":
      return false;
    default:
      return command;
  }
}

function duplicateResult(
  state: Readonly<TurnEconomyState>,
  command: Readonly<TurnEconomyCommand>,
  claimId: string
): TurnEconomyResult | null {
  const existing = existingClaim(state, claimId);
  if (!existing) return null;
  return sameClaim(existing, command)
    ? {
        command,
        reason: "already-claimed",
        state,
        status: "no-change",
      }
    : { reason: "claim-collision", status: "rejected" };
}

function planned(
  before: Readonly<TurnEconomyState>,
  candidate: unknown,
  budget: Readonly<TurnEconomyBudget>,
  command: Readonly<TurnEconomyCommand>
): TurnEconomyResult {
  const after = conformTurnEconomyState(candidate);
  return after
    ? { after, before, budget, command, status: "planned" }
    : { reason: "invalid-after", status: "rejected" };
}

function reject(
  reason: Extract<TurnEconomyResult, { status: "rejected" }>["reason"]
): TurnEconomyResult {
  return { reason, status: "rejected" };
}

function requireOwnTurn(state: Readonly<TurnEconomyState>): TurnEconomyResult | null {
  return state.phase === "own-turn" ? null : reject("not-own-turn");
}

function claimAction(
  state: Readonly<TurnEconomyState>,
  projection: Readonly<TurnEconomyProjection>,
  budget: Readonly<TurnEconomyBudget>,
  command: Readonly<Extract<TurnEconomyCommand, { readonly kind: "claim-action" }>>
): TurnEconomyResult {
  const phase = requireOwnTurn(state);
  if (phase) return phase;
  if (projection.incapacitated) return reject("incapacitated");
  const duplicate = duplicateResult(state, command, command.claimId);
  if (duplicate) return duplicate;
  if (command.action.kind === "attack") {
    const firstCollision = existingClaim(state, command.action.firstAttack.claimId);
    if (firstCollision) return reject("claim-collision");
  }

  let action: ActionClaim;
  if (command.action.kind === "attack") {
    const option = attackOption(projection, command.action.firstAttack.optionId);
    if (!option) return reject("attack-option-unavailable");
    const optionLimit = optionLimitReason(state, option, null);
    if (optionLimit) return reject(optionLimit);
    action = {
      attacks: [
        {
          authorization: null,
          claimId: command.action.firstAttack.claimId,
          option: attackOptionUse(option),
        },
      ],
      claimId: command.claimId,
      kind: "attack",
    };
  } else if (command.action.kind === "ready") {
    action = {
      claimId: command.claimId,
      kind: "ready",
      preparationId: command.action.preparationId,
    };
  } else {
    action = { claimId: command.claimId, kind: command.action.kind };
  }
  const actions = [...state.actions, action];
  if (actions.length > budget.actionSlots.length) {
    return reject("action-unavailable");
  }
  if (!canAssignActions(actions, budget.actionSlots)) {
    return reject("action-restricted");
  }
  return planned(state, { ...state, actions }, budget, command);
}

function claimAttack(
  state: Readonly<TurnEconomyState>,
  projection: Readonly<TurnEconomyProjection>,
  budget: Readonly<TurnEconomyBudget>,
  command: Readonly<Extract<TurnEconomyCommand, { readonly kind: "claim-attack" }>>
): TurnEconomyResult {
  const phase = requireOwnTurn(state);
  if (phase) return phase;
  if (projection.incapacitated) return reject("incapacitated");
  const duplicate = duplicateResult(state, command, command.claimId);
  if (duplicate) return duplicate;
  const actionIndex = state.actions.findIndex(
    (action) => action.kind === "attack" && action.claimId === command.attackActionClaimId
  );
  const action = state.actions[actionIndex];
  if (!action || action.kind !== "attack") {
    return reject("attack-action-unavailable");
  }
  const option = attackOption(projection, command.optionId);
  if (!option) return reject("attack-option-unavailable");
  const optionLimit = optionLimitReason(state, option, action);
  if (optionLimit) return reject(optionLimit);

  if (command.authorization === null) {
    const regularAttacks = action.attacks.filter(
      ({ authorization }) => authorization === null
    ).length;
    if (regularAttacks >= budget.attacksPerAttackAction.effective) {
      return reject("attack-limit");
    }
  } else {
    const qualifyingIndex = action.attacks.findIndex(
      ({ claimId }) => claimId === command.authorization.qualifyingAttackClaimId
    );
    const qualifying = action.attacks[qualifyingIndex];
    if (
      qualifyingIndex < 0 ||
      !qualifying ||
      !lightExtraPairIsValid(qualifying.option, attackOptionUse(option), true)
    ) {
      return reject("extra-attack-unavailable");
    }
    if (lightExtraAttackUses(state) >= 1) return reject("extra-attack-limit");
  }

  const updatedAction: AttackActionClaim = {
    ...action,
    attacks: [
      ...action.attacks,
      {
        authorization: command.authorization,
        claimId: command.claimId,
        option: attackOptionUse(option),
      },
    ],
  };
  const actions = state.actions.map((candidate, index) =>
    index === actionIndex ? updatedAction : candidate
  );
  if (!canAssignActions(actions, budget.actionSlots)) {
    return reject("attack-limit");
  }
  return planned(state, { ...state, actions }, budget, command);
}

function claimBonusAction(
  state: Readonly<TurnEconomyState>,
  projection: Readonly<TurnEconomyProjection>,
  budget: Readonly<TurnEconomyBudget>,
  command: Readonly<Extract<TurnEconomyCommand, { readonly kind: "claim-bonus-action" }>>
): TurnEconomyResult {
  const phase = requireOwnTurn(state);
  if (phase) return phase;
  if (projection.incapacitated) return reject("incapacitated");
  const duplicate = duplicateResult(state, command, command.claimId);
  if (duplicate) return duplicate;
  if (state.bonusActions.length >= budget.bonusActions.effective) {
    return reject("bonus-action-unavailable");
  }
  const request = command.bonusAction;
  let claim: BonusActionClaim;
  if (request.kind === "action") {
    const requirement = projection.bonusActions.requirements.find(
      ({ requirementId }) => requirementId === request.requirementId
    );
    if (!requirement) return reject("bonus-action-requirement-unavailable");
    claim = {
      actionKind: requirement.actionKind,
      claimId: command.claimId,
      kind: "action",
      requirementId: request.requirementId,
    };
  } else {
    const option = attackOption(projection, request.optionId);
    if (!option) return reject("attack-option-unavailable");
    const optionLimit = optionLimitReason(state, option, null);
    if (optionLimit) return reject(optionLimit);
    const qualifying = attackUseInState(state, request.qualifyingAttackClaimId);
    const validPair =
      qualifying &&
      (request.kind === "light-extra-attack"
        ? lightExtraPairIsValid(qualifying.option, attackOptionUse(option), false)
        : dualWielderPairIsValid(qualifying.option, attackOptionUse(option)));
    if (
      !validPair ||
      (request.kind === "dual-wielder-extra-attack" &&
        !projection.bonusActions.dualWielder)
    ) {
      return reject("bonus-action-requirement-unavailable");
    }
    if (
      (request.kind === "light-extra-attack" && lightExtraAttackUses(state) >= 1) ||
      (request.kind === "dual-wielder-extra-attack" &&
        state.bonusActions.some(({ kind }) => kind === "dual-wielder-extra-attack"))
    ) {
      return reject("bonus-action-requirement-unavailable");
    }
    claim = {
      claimId: command.claimId,
      kind: request.kind,
      option: attackOptionUse(option),
      qualifyingAttackClaimId: request.qualifyingAttackClaimId,
    };
  }
  const bonusActions = [...state.bonusActions, claim];
  return planned(state, { ...state, bonusActions }, budget, command);
}

function claimReaction(
  state: Readonly<TurnEconomyState>,
  projection: Readonly<TurnEconomyProjection>,
  budget: Readonly<TurnEconomyBudget>,
  command: Readonly<Extract<TurnEconomyCommand, { readonly kind: "claim-reaction" }>>
): TurnEconomyResult {
  if (projection.incapacitated) return reject("incapacitated");
  const duplicate = duplicateResult(state, command, command.claimId);
  if (duplicate) return duplicate;
  if (state.reactions.length >= budget.reactions.effective) {
    return reject("reaction-unavailable");
  }
  let reaction: ReactionClaim;
  const request = command.reaction;
  if (request.kind === "program") {
    if (
      !projection.reactions.requirements.some(
        ({ requirementId }) => requirementId === request.requirementId
      )
    ) {
      return reject("reaction-requirement-unavailable");
    }
    reaction = {
      claimId: command.claimId,
      kind: "program",
      requirementId: request.requirementId,
    };
  } else {
    const readyAction = state.actions.find(
      (action) => action.kind === "ready" && action.claimId === request.readyActionClaimId
    );
    if (
      !readyAction ||
      readyAction.kind !== "ready" ||
      state.reactions.some(
        (candidate) =>
          candidate.kind === "ready" &&
          candidate.readyActionClaimId === request.readyActionClaimId
      )
    ) {
      return reject("ready-action-unavailable");
    }
    reaction = {
      claimId: command.claimId,
      kind: "ready",
      preparationId: readyAction.preparationId,
      readyActionClaimId: request.readyActionClaimId,
    };
  }
  return planned(
    state,
    { ...state, reactions: [...state.reactions, reaction] },
    budget,
    command
  );
}

function movementCapacity(
  state: Readonly<TurnEconomyState>,
  budget: Readonly<TurnEconomyBudget>,
  mode: TurnMovementMode
): number | null {
  const movementMode = budget.movementModes.find((candidate) => candidate.mode === mode);
  if (!movementMode) return null;
  const dashes =
    state.actions.filter(({ kind }) => kind === "dash").length +
    state.bonusActions.filter(
      (claim) => claim.kind === "action" && claim.actionKind === "dash"
    ).length;
  return movementMode.speedFt.effective * (1 + dashes);
}

function movementUsed(state: Readonly<TurnEconomyState>): number {
  return (
    state.movement.reduce((sum, claim) => sum + claim.costFt, 0) +
    state.movementRequirements.reduce((sum, claim) => sum + claim.costFt, 0)
  );
}

function move(
  state: Readonly<TurnEconomyState>,
  budget: Readonly<TurnEconomyBudget>,
  command: Readonly<Extract<TurnEconomyCommand, { readonly kind: "move" }>>
): TurnEconomyResult {
  const phase = requireOwnTurn(state);
  if (phase) return phase;
  const duplicate = duplicateResult(state, command, command.claimId);
  if (duplicate) return duplicate;
  const capacity = movementCapacity(state, budget, command.mode);
  if (capacity === null) return reject("movement-unavailable");
  const costFt = command.distanceFt * budget.movementCostPerFoot.effective;
  if (
    !Number.isSafeInteger(costFt) ||
    costFt > MAX_ECONOMY_VALUE ||
    movementUsed(state) + costFt > capacity
  ) {
    return reject("movement-unavailable");
  }
  return planned(
    state,
    {
      ...state,
      movement: [
        ...state.movement,
        {
          claimId: command.claimId,
          costFt,
          distanceFt: command.distanceFt,
          mode: command.mode,
        },
      ],
    },
    budget,
    command
  );
}

function claimMovementRequirement(
  state: Readonly<TurnEconomyState>,
  projection: Readonly<TurnEconomyProjection>,
  budget: Readonly<TurnEconomyBudget>,
  command: Readonly<
    Extract<TurnEconomyCommand, { readonly kind: "claim-movement-requirement" }>
  >
): TurnEconomyResult {
  const phase = requireOwnTurn(state);
  if (phase) return phase;
  const duplicate = duplicateResult(state, command, command.claimId);
  if (duplicate) return duplicate;
  const requirement = projection.movement.requirements.find(
    ({ requirementId }) => requirementId === command.requirementId
  );
  if (
    !requirement ||
    state.movementRequirements.some(
      ({ requirementId }) => requirementId === command.requirementId
    )
  ) {
    return reject("movement-requirement-unavailable");
  }
  const capacity = movementCapacity(state, budget, requirement.mode);
  if (capacity === null || capacity === 0) {
    return reject("movement-unavailable");
  }
  const speedFt =
    budget.movementModes.find(({ mode }) => mode === requirement.mode)?.speedFt
      .effective ?? 0;
  const costFt = Math.floor(speedFt / 2);
  if (movementUsed(state) + costFt > capacity) {
    return reject("movement-unavailable");
  }
  return planned(
    state,
    {
      ...state,
      movementRequirements: [
        ...state.movementRequirements,
        {
          claimId: command.claimId,
          costFt,
          requirementId: command.requirementId,
        },
      ],
    },
    budget,
    command
  );
}

function claimFreeInteraction(
  state: Readonly<TurnEconomyState>,
  budget: Readonly<TurnEconomyBudget>,
  command: Readonly<
    Extract<TurnEconomyCommand, { readonly kind: "claim-free-interaction" }>
  >
): TurnEconomyResult {
  const phase = requireOwnTurn(state);
  if (phase) return phase;
  const duplicate = duplicateResult(state, command, command.claimId);
  if (duplicate) return duplicate;
  if (state.freeInteractions.length >= budget.freeInteractions.effective) {
    return reject("free-interaction-unavailable");
  }
  return planned(
    state,
    {
      ...state,
      freeInteractions: [
        ...state.freeInteractions,
        {
          claimId: command.claimId,
          interactionId: command.interactionId,
          timingBoundary: command.timingBoundary,
        },
      ],
    },
    budget,
    command
  );
}

/**
 * Plan one immutable ledger transition. `planned.after` is the reducer output;
 * rejected and idempotent commands never mutate or replace the input state.
 */
export function reduceTurnEconomy(
  stateValue: unknown,
  projectionValue: unknown,
  commandValue: unknown
): TurnEconomyResult {
  const state = conformTurnEconomyState(stateValue);
  if (!state) return reject("invalid-state");
  const projection = conformTurnEconomyProjection(projectionValue);
  if (!projection) return reject("invalid-projection");
  const command = conformTurnEconomyCommand(commandValue);
  if (!command) return reject("invalid-command");
  const budget = budgetFor(projection);

  switch (command.kind) {
    case "start-turn":
      if (command.turnId === state.turnId) {
        return {
          command,
          reason: "already-started",
          state,
          status: "no-change",
        };
      }
      return planned(
        state,
        {
          actions: [],
          bonusActions: [],
          freeInteractions: [],
          manualBoundaries: [],
          movement: [],
          movementRequirements: [],
          phase: "own-turn",
          reactions: [],
          schema: 1,
          turnId: command.turnId,
        },
        budget,
        command
      );
    case "end-turn":
      return state.phase === "between-turns"
        ? {
            command,
            reason: "already-ended",
            state,
            status: "no-change",
          }
        : planned(state, { ...state, phase: "between-turns" }, budget, command);
    case "claim-action":
      return claimAction(state, projection, budget, command);
    case "claim-attack":
      return claimAttack(state, projection, budget, command);
    case "claim-bonus-action":
      return claimBonusAction(state, projection, budget, command);
    case "claim-reaction":
      return claimReaction(state, projection, budget, command);
    case "move":
      return move(state, budget, command);
    case "claim-movement-requirement":
      return claimMovementRequirement(state, projection, budget, command);
    case "claim-free-interaction":
      return claimFreeInteraction(state, budget, command);
    case "record-manual-boundary": {
      const duplicate = duplicateResult(state, command, command.claimId);
      if (duplicate) return duplicate;
      return planned(
        state,
        {
          ...state,
          manualBoundaries: [
            ...state.manualBoundaries,
            {
              authority: command.authority,
              boundaryId: command.boundaryId,
              claimId: command.claimId,
            },
          ],
        },
        budget,
        command
      );
    }
    default:
      return command;
  }
}
