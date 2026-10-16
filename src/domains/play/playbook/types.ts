/**
 * The combat playbook's data shape (docs/design/combat-playbook.md).
 *
 * A playbook is a deterministic, explainable recommendation of what a character
 * usually does on a turn, generated from its resolved actions. Ids and keys only:
 * labels, prose and icons belong to the view, which localizes every `why` key.
 */
import type { ReactionTrigger, Recovery } from "@/data/types";
import type { CombatAlgorithmStep } from "@/types/character";

/** The action-economy slot a step fills. Movement first, reaction last. */
export type EconomySlot = "movement" | "action" | "bonus" | "free" | "reaction";

export const ECONOMY_SLOTS: ReadonlyArray<EconomySlot> = [
  "movement",
  "action",
  "bonus",
  "free",
  "reaction",
];

/**
 * Where the playbook is read. `combat` follows the action economy turn by turn;
 * `exploration` (rituals, rests, downtime) has none: every step is `anytime`, no
 * reaction waits for a trigger and the plan lists everything that applies now.
 */
export type PlaybookMode = "combat" | "exploration";

/** A step's slot: an economy slot in combat, `anytime` out of combat. */
export type PlaybookSlot = EconomySlot | "anytime";

/** Every slot in display order. */
export const PLAYBOOK_SLOTS: ReadonlyArray<PlaybookSlot> = [...ECONOMY_SLOTS, "anytime"];

/** The generator rule that produced a step. Each rule has one fixed priority. */
export type PlaybookRuleId =
  | "position"
  | "heal-ally-down"
  | "self-heal-bloodied"
  | "area-when-grouped"
  | "burst-tough-foe"
  | "control-tough-foe"
  | "concentration-opener"
  | "default-attack"
  | "set-up-advantage"
  | "disengage-when-adjacent"
  | "hide-when-possible"
  | "dash-when-far"
  | "reaction-defense"
  | "opportunity-attack"
  // Exploration only.
  | "recover-hp"
  | "ritual-no-slot"
  | "exploration-check"
  | "utility-cantrip"
  | "short-rest-recovery";

/** When a step applies. `always` is the usual turn; every other kind is an "if". */
export type PlaybookTrigger =
  | { kind: "always" }
  | { kind: "fight-start" }
  | { kind: "self-bloodied" }
  /** Below the Hit Point maximum (exploration: heal before moving on). */
  | { kind: "self-hurt" }
  | { kind: "ally-down" }
  | { kind: "enemies-grouped"; min: number }
  | { kind: "tough-foe" }
  | { kind: "enemy-adjacent" }
  | { kind: "can-hide" }
  | { kind: "target-far" }
  | { kind: "not-moving" }
  | { kind: "advantage-or-ally-adjacent" }
  /** Off-turn: the enemy's move or attack fires it. */
  | { kind: "reaction"; on: ReactionTrigger | "creatureLeavesReach" };

/** Why a step or option is recommended, or why it is not available now. */
export type PlaybookWhyKey =
  | "move-to-melee"
  | "keep-range"
  | "best-damage"
  | "cantrip-no-cost"
  | "works-at-range"
  | "extra-attack"
  | "weapon-mastery"
  | "sneak-attack"
  | "area-hits-many"
  | "extra-action"
  | "limited-use"
  | "recharges"
  | "costs-slot"
  | "heals-ally-at-range"
  | "revives-ally"
  | "self-heal"
  | "keeps-action-free"
  | "one-concentration"
  | "controls-foe"
  | "advantage-next-attack"
  | "bonus-mobility"
  | "reaction-defense"
  | "opportunity-attack"
  | "already-concentrating"
  | "no-uses-left"
  | "no-slot-left"
  | "cannot-act"
  | "player-pinned"
  // Exploration only.
  | "ritual-no-slot"
  | "exploration-check"
  | "cheapest-first"
  | "uses-item"
  | "recovers-on-short-rest"
  | "hit-dice-heal";

/** Where a reason comes from: a feature, spell or weapon id, or a core rule id. */
export type PlaybookSource =
  | { kind: "feature"; id: string }
  | { kind: "spell"; id: string }
  | { kind: "weapon"; id: string }
  | { kind: "rule"; id: string };

export interface PlaybookWhy {
  key: PlaybookWhyKey;
  params?: Readonly<Record<string, string | number>>;
  source?: PlaybookSource;
  /** The reason holds only under this trigger (Sneak Attack needs Advantage). */
  when?: PlaybookTrigger;
}

/** The resource an option spends. Absent: free to use. */
export type PlaybookSpend =
  | { kind: "slot"; level: number }
  | { kind: "tracker"; trackerId: string; amount: number; recovery?: Recovery }
  /** One consumable from the pack (a Potion of Healing). */
  | { kind: "item"; itemId: string };

/** A turn-wide rule the planner enforces across slots. */
export type PlaybookLimit = "one-concentration" | "one-slot-spell";

export interface PlaybookOption {
  /** The resolved action id (`spell-fireball`, `weapon-longsword`, …). */
  actionId: string;
  spend?: PlaybookSpend;
  limits?: ReadonlyArray<PlaybookLimit>;
  /** The resource it spends is still there and nothing blocks it. */
  available: boolean;
}

/**
 * `ready`: can be done now. `spent`: every option's resource is used up.
 * `blocked`: a rule forbids it now (already concentrating, Incapacitated).
 */
export type PlaybookStatus = "ready" | "spent" | "blocked";

export interface PlaybookStep {
  /** Stable id: `<slot>:<rule>`. Overrides key on it. */
  id: string;
  slot: PlaybookSlot;
  rule: PlaybookRuleId;
  /** Options best first. Empty only for the movement and Short Rest steps. */
  options: ReadonlyArray<PlaybookOption>;
  when: PlaybookTrigger;
  /** The trigger read against the context: unknown when the context is silent. */
  applies: boolean | "unknown";
  status: PlaybookStatus;
  /** Higher first. The rule's fixed priority; a player pin adds PIN_BONUS. */
  priority: number;
  why: ReadonlyArray<PlaybookWhy>;
  origin: "generated";
  pinned?: true;
}

/** What the table knows right now. Every field optional: absent means unknown. */
export interface PlaybookContext {
  /** Absent: combat. */
  mode?: PlaybookMode;
  round?: number;
  /** Overrides the HP-derived Bloodied read. */
  selfBloodied?: boolean;
  /** Overrides the HP-derived "below the maximum" read. */
  selfHurt?: boolean;
  allyDown?: boolean;
  /** Enemies close enough together for one area spell. */
  enemiesGrouped?: number;
  toughFoe?: boolean;
  enemyAdjacent?: boolean;
  canHide?: boolean;
  targetFar?: boolean;
  /** The player plans to stay put this turn. */
  notMoving?: boolean;
}

/** Player edits on top of the generated steps, keyed by step id. */
export interface PlaybookOverrides {
  hidden?: ReadonlyArray<string>;
  /** Pinned steps go first in their slot, in this order. */
  pinned?: ReadonlyArray<string>;
  /** Step id → the action id the player wants first. */
  preferred?: Readonly<Record<string, string>>;
}

export type PlanSkipReason = "slot-taken" | PlaybookLimit;

/** One concrete turn for the context; out of combat, everything that applies now. */
export interface PlaybookPlan {
  picks: ReadonlyArray<{ slot: PlaybookSlot; stepId: string; actionId?: string }>;
  skipped: ReadonlyArray<{ stepId: string; reason: PlanSkipReason }>;
}

export interface Playbook {
  version: 1;
  mode: PlaybookMode;
  steps: ReadonlyArray<PlaybookStep>;
  /** Step ids the player hid, kept so the view can offer to show them again. */
  hidden: ReadonlyArray<string>;
  plan: PlaybookPlan;
  /** The player's hand-written playbook, read as stored (never rewritten). */
  authored: ReadonlyArray<CombatAlgorithmStep>;
}
