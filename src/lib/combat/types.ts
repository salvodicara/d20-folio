/**
 * The Encounter aggregate — the one state model of combat for every creature at the table.
 *
 * Design: docs/superpowers/specs/2026-09-02-total-combat-automation-design.md §2–3.
 * Every union here is closed; the reducer handles each member and ends in `assertNever`.
 */
import type {
  ActionId,
  EffectId,
  EntityId,
  LabelId,
  MechanicId,
  Seq,
  WindowId,
} from "./ids";

// ── Entities ────────────────────────────────────────────────────────────────

export type EntityKind =
  | "pc"
  | "monster"
  | "npc"
  | "summon"
  | "companion"
  | "object"
  | "table";

export type Ability = "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";

export type DamageType =
  | "acid"
  | "bludgeoning"
  | "cold"
  | "fire"
  | "force"
  | "lightning"
  | "necrotic"
  | "piercing"
  | "poison"
  | "psychic"
  | "radiant"
  | "slashing"
  | "thunder";

export type ConditionId =
  | "blinded"
  | "charmed"
  | "deafened"
  | "exhaustion"
  | "frightened"
  | "grappled"
  | "incapacitated"
  | "invisible"
  | "paralyzed"
  | "petrified"
  | "poisoned"
  | "prone"
  | "restrained"
  | "stunned"
  | "unconscious";

export type LifeState = "alive" | "dying" | "stable" | "dead";

export interface DerivedStats {
  readonly ac: number;
  readonly maxHp: number;
  readonly speed: number;
  readonly proficiency: number;
  readonly abilities: Readonly<Record<Ability, number>>; // modifiers
  readonly saves: Readonly<Record<Ability, number>>;
  readonly spellSaveDc: number | null;
  readonly spellAttack: number | null;
  readonly attacksPerAction: number;
  readonly resistances: readonly DamageType[];
  readonly immunities: readonly DamageType[];
  readonly vulnerabilities: readonly DamageType[];
  readonly conditionImmunities: readonly ConditionId[];
}

export type EntityOrigin =
  | {
      readonly kind: "character";
      readonly uid: string;
      readonly characterId: string;
      readonly buildRevision: number;
    }
  | { readonly kind: "monster"; readonly srdId: string }
  | { readonly kind: "custom"; readonly label: LabelId }
  | { readonly kind: "table" };

export interface TurnLedger {
  readonly action: number; // slots used
  readonly bonus: number;
  readonly reaction: number;
  readonly attacksUsed: number;
  readonly movementUsed: number;
  readonly claims: readonly string[]; // once-per-turn keys already claimed this turn
}

export interface Resource {
  readonly current: number;
  readonly max: number;
  readonly recharge: "short" | "long" | "dawn" | "dusk" | "turn" | "round" | "never";
}

export interface Entity {
  readonly id: EntityId;
  readonly kind: EntityKind;
  readonly label: LabelId;
  readonly controllerUid: string;
  readonly controlledBy: EntityId | null;
  readonly origin: EntityOrigin;
  readonly stats: DerivedStats;
  readonly vitals: {
    readonly hp: number;
    readonly tempHp: { readonly amount: number; readonly source: EffectId | null } | null;
    readonly deathSaves: { readonly successes: number; readonly failures: number };
    readonly life: LifeState;
    readonly exhaustion: number;
  };
  readonly resources: Readonly<Record<string, Resource>>;
  readonly concentration: EffectId | null;
  readonly turn: TurnLedger;
  readonly overrides: Readonly<
    Record<
      string,
      { readonly value: unknown; readonly reason: string; readonly by: string }
    >
  >;
  readonly reveal: { readonly block: boolean; readonly hp: boolean };
  readonly mechanics: readonly MechanicId[]; // what this entity can invoke (weapons, spells, features, monster actions)
}

// ── Relations (declared tactical facts) ─────────────────────────────────────

export type RangeBand = "reach" | "near" | "far" | "out";

export type Relation =
  | { readonly kind: "adjacent"; readonly a: EntityId; readonly b: EntityId }
  | {
      readonly kind: "range";
      readonly a: EntityId;
      readonly b: EntityId;
      readonly band: RangeBand;
    }
  | {
      readonly kind: "visible";
      readonly a: EntityId;
      readonly b: EntityId;
      readonly value: boolean;
    }
  | {
      readonly kind: "cover";
      readonly target: EntityId;
      readonly from: EntityId | null; // null = from every attacker
      readonly degree: "half" | "three-quarters" | "total";
    }
  | { readonly kind: "engaged"; readonly a: EntityId; readonly b: EntityId }
  | { readonly kind: "aura-member"; readonly effect: EffectId; readonly member: EntityId }
  | {
      readonly kind: "mark";
      readonly effect: EffectId;
      readonly by: EntityId;
      readonly on: EntityId;
    };

// ── Effects and lifetimes ───────────────────────────────────────────────────

export type Lifetime =
  | { readonly kind: "manual" }
  | {
      readonly kind: "turn-edge";
      readonly entity: EntityId;
      readonly edge: "start" | "end";
      readonly round: number;
    }
  | { readonly kind: "rounds"; readonly remaining: number }
  | { readonly kind: "seconds"; readonly remaining: number }
  | {
      readonly kind: "rest";
      readonly rest: "short" | "long";
      readonly minimumOrdinal: number;
    }
  | {
      readonly kind: "day-phase";
      readonly phase: "dawn" | "dusk";
      readonly minimumOrdinal: number;
    }
  | { readonly kind: "source-end"; readonly effect: EffectId };

export interface Rider {
  readonly dice: string; // "1d6"
  readonly type: DamageType;
  readonly on: "weapon-hit" | "spell-hit" | "any-hit";
  readonly vs: { readonly mark: "self" };
}

export interface StandingFacts {
  readonly acBonus?: number;
  readonly advantageOnAttacks?: boolean;
  readonly resistances?: readonly DamageType[];
  readonly riders?: readonly Rider[];
}

export type EffectPayload =
  | { readonly kind: "condition"; readonly condition: ConditionId }
  | { readonly kind: "standing"; readonly facts: StandingFacts }
  | {
      readonly kind: "mark";
      readonly riders: readonly Rider[];
      readonly advantage: boolean;
    }
  | { readonly kind: "temp-hp" }
  | { readonly kind: "bond" };

export interface Effect {
  readonly id: EffectId;
  readonly source: {
    readonly entity: EntityId;
    readonly mechanic: MechanicId;
    readonly action: ActionId;
    readonly castLevel: number | null;
  };
  readonly target: EntityId;
  readonly payload: EffectPayload;
  readonly lifetime: Lifetime;
  readonly concentration: boolean;
}

// ── Clock and windows ───────────────────────────────────────────────────────

export interface Clock {
  readonly phase: "idle" | "gathering" | "turns" | "ended";
  readonly round: number;
  readonly order: readonly EntityId[];
  readonly current: EntityId | null;
  readonly initiative: Readonly<Record<EntityId, number>>;
  readonly restOrdinal: number;
  readonly dayPhaseOrdinal: number;
}

export type Outcome = "hit" | "crit" | "miss" | "save-fail" | "save-success";

export type CombatEvent =
  | { readonly kind: "turn-start"; readonly entity: EntityId }
  | { readonly kind: "turn-end"; readonly entity: EntityId }
  | { readonly kind: "round-start"; readonly round: number }
  | {
      readonly kind: "attack-declared";
      readonly attacker: EntityId;
      readonly target: EntityId;
      readonly action: ActionId;
    }
  | {
      readonly kind: "attack-resolved";
      readonly attacker: EntityId;
      readonly target: EntityId;
      readonly outcome: Outcome;
    }
  | { readonly kind: "damage-taken"; readonly entity: EntityId; readonly amount: number }
  | { readonly kind: "hp-zero"; readonly entity: EntityId }
  | { readonly kind: "effect-ended"; readonly effect: EffectId }
  | {
      readonly kind: "concentration-ended";
      readonly entity: EntityId;
      readonly effect: EffectId;
    }
  | {
      readonly kind: "entity-left-reach";
      readonly entity: EntityId;
      readonly from: EntityId;
    }
  | {
      readonly kind: "rest-completed";
      readonly rest: "short" | "long";
      readonly ordinal: number;
    };

export interface ReactionWindow {
  readonly id: WindowId;
  readonly event: CombatEvent;
  readonly eligible: readonly EntityId[];
  readonly declared: ActionId; // the action held open by this window
}

export interface PendingCheck {
  readonly id: string;
  readonly entity: EntityId;
  readonly kind: "concentration";
  readonly dc: number;
  readonly cause: ActionId;
}

// ── Actions (the only persisted mutation) ───────────────────────────────────

export type Answers = Readonly<
  Record<string, number | string | boolean | readonly number[]>
>;

export type PaymentChoice =
  | { readonly kind: "slot"; readonly level: number; readonly pool: "standard" | "pact" }
  | { readonly kind: "resource"; readonly id: string };

export type TableOp =
  | { readonly op: "start"; readonly epoch: number }
  | { readonly op: "add-entity"; readonly entity: Entity }
  | { readonly op: "remove-entity"; readonly entity: EntityId }
  | { readonly op: "set-initiative"; readonly entity: EntityId; readonly value: number }
  | { readonly op: "begin-turns"; readonly order: readonly EntityId[] }
  | { readonly op: "end-turn" }
  | { readonly op: "end" }
  | { readonly op: "rest"; readonly rest: "short" | "long" }
  | { readonly op: "settings"; readonly revealMonsterHp: boolean };

interface ActionBase {
  readonly id: ActionId;
  readonly seq: Seq;
  readonly by: string; // uid
}

export type Action =
  | (ActionBase & {
      readonly kind: "intent";
      readonly entity: EntityId;
      readonly mechanic: MechanicId;
      readonly program: string;
      readonly targets: readonly EntityId[];
      readonly answers: Answers;
      readonly payment: readonly PaymentChoice[];
      readonly window: WindowId | null;
      readonly basedOn: number;
    })
  | (ActionBase & {
      readonly kind: "declare";
      readonly relation: Relation;
      readonly remove: boolean;
    })
  | (ActionBase & {
      readonly kind: "override";
      readonly entity: EntityId;
      readonly path: string;
      readonly value: unknown;
      readonly reason: string;
    })
  | (ActionBase & { readonly kind: "resolve"; readonly window: WindowId })
  | (ActionBase & {
      readonly kind: "check";
      readonly check: string;
      readonly answers: Answers;
    })
  | (ActionBase & {
      readonly kind: "undo";
      readonly of: ActionId;
      readonly reason: string | null;
    })
  | (ActionBase & { readonly kind: "table"; readonly table: TableOp });

// ── Folded state, receipts, rejections ──────────────────────────────────────

export interface FoldedState {
  readonly epoch: number;
  readonly clock: Clock;
  readonly entities: Readonly<Record<EntityId, Entity>>;
  readonly relations: readonly Relation[];
  readonly effects: Readonly<Record<EffectId, Effect>>;
  readonly windows: readonly ReactionWindow[];
  readonly checks: readonly PendingCheck[];
  readonly declared: Readonly<Record<ActionId, Action>>; // intents held open by a window
  readonly nextOrdinal: number; // monotonic allocator for entity/effect ids
  readonly revision: number; // applied actions
  readonly settings: { readonly revealMonsterHp: boolean };
}

export interface Encounter {
  readonly schema: 1;
  readonly id: string;
  readonly host:
    | { readonly kind: "personal"; readonly uid: string; readonly characterId: string }
    | { readonly kind: "campaign"; readonly campaignId: string };
  readonly log: readonly Action[];
  readonly checkpoint: { readonly through: Seq; readonly state: FoldedState } | null;
}

export type Rejection =
  | { readonly reason: "unknown-entity"; readonly entity: EntityId }
  | { readonly reason: "unknown-mechanic"; readonly mechanic: MechanicId }
  | { readonly reason: "not-in-turns" }
  | { readonly reason: "not-your-turn"; readonly entity: EntityId }
  | { readonly reason: "unaffordable"; readonly cost: string }
  | { readonly reason: "missing-answer"; readonly input: string }
  | { readonly reason: "no-window"; readonly window: WindowId }
  | {
      readonly reason: "not-eligible";
      readonly window: WindowId;
      readonly entity: EntityId;
    }
  | { readonly reason: "no-such-check"; readonly check: string }
  | { readonly reason: "invalid-table-op"; readonly detail: string }
  | { readonly reason: "already-undone"; readonly action: ActionId }
  | { readonly reason: "unknown-action"; readonly action: ActionId };

export interface Receipt {
  readonly action: ActionId;
  readonly outcome: "established" | "negated" | "applied";
  readonly paid: readonly string[];
  readonly events: readonly CombatEvent[];
  readonly summary: readonly string[]; // label ids, localized by presenters
}

export type Resolution =
  | { readonly kind: "applied"; readonly state: FoldedState; readonly receipt: Receipt }
  | { readonly kind: "rejected"; readonly rejection: Rejection };
