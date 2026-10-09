/**
 * One Activity shape (docs/architecture/rules-model.html, "8 action dialects → 1
 * Activity"): everything a creature can DO — cast a spell, use a class feature,
 * make a monster's attack — declared as what it costs, who it targets, how it
 * resolves, what happens and how long it lasts.
 *
 * Rules of the shape:
 *  - Ids only. Labels, range and duration prose stay in the catalogue text and
 *    are localized at the render edge.
 *  - Declare the least: every field is optional unless the activity cannot be
 *    read without it, and an absent field means "the table decides".
 *  - No dice are rolled. A dice formula is a fact the player rolls at the table;
 *    the entered result carries its own provenance (`RollProvenance`).
 *  - Catalogue-level: nothing here depends on a character. Level-scaled dice,
 *    class-table dice and ability terms stay symbolic and are resolved by the
 *    reader that knows the character.
 *  - Durations reuse Phase 2's status vocabulary (`StatusLifetime`,
 *    `StatusEnd`): a status the activity lights is declared as the Status it
 *    starts as.
 */
import type {
  AbilityCode,
  ActionEconomyCategory,
  ActionType,
  CombatConditionApplication,
  CombatResolutionGate,
  ConditionId,
  CreatureType,
  DiceCount,
  HealTerm,
  ReactionTrigger,
  SpellRecurrence,
} from "@/data/types";
import type { CostSpec } from "@/lib/cost-engine";
import type { StatusEnd, StatusLifetime } from "@/lib/status-lifetime";
import type { CombatOutcomePredicate } from "@/types/combat-outcome";
import type { DamageType } from "@/types/damage";

/** Where an activity is declared. Ids only. */
export type ActivitySource =
  | { kind: "spell"; spellId: string; level: number }
  /** The action an active spell grants (Searing Smite's burn). */
  | { kind: "spell-follow-up"; spellId: string; level: number }
  | {
      kind: "feature";
      owner: FeatureOwnerKind;
      ownerId: string;
      /** Position in the owner's `mechanics.actions`. */
      index: number;
      /** The action's own stable suffix, when it declares one. */
      actionId?: string;
    }
  | { kind: "monster"; monsterId: string; section: MonsterSection; entryId: string }
  /** Activating a magic item's property (its `while-active` activation). */
  | { kind: "item-activation"; itemId: string; activeKey: string }
  | { kind: "beast"; beastId: string; attack: string }
  | { kind: "companion"; ownerId: string; attack: string };

export type FeatureOwnerKind =
  | "class-feature"
  /** A homebrew feature on one character, keyed by its instance id. */
  | "custom-feature"
  | "race-trait"
  | "feat"
  | "equipment"
  | "invocation";

export type MonsterSection =
  | "traits"
  | "actions"
  | "bonusActions"
  | "reactions"
  | "legendaryActions";

/**
 * When it can be done. `"time"` is a cast longer than an action (a ritual-length
 * spell), `"legendary"` a monster's legendary action and `"trait"` a monster
 * trait that happens on its own (an aura, a death burst).
 */
export type ActivityEconomy = ActionType | "time" | "legendary" | "trait";

/** One resource paid on use. Reuses the cost engine's {@link CostSpec}. */
export type ActivityResource =
  | Exclude<CostSpec, { kind: "none" }>
  /** One unit of a typed resource the item declares (a charge of this copy). */
  | { kind: "item-resource"; resourceId: string }
  /** "Recharge X–6": usable again when a d6 rolls `min` or higher. */
  | { kind: "recharge"; min: 2 | 3 | 4 | 5 | 6 }
  /** "(N/Day)" and rest-recharged limits printed on a stat block. */
  | { kind: "uses"; count: number; per: "day" | "short-or-long-rest" | "long-rest" };

export interface ActivityCost {
  economy: ActivityEconomy;
  /** The cast length in minutes, when `economy` is `"time"`. */
  minutes?: number;
  /** A second, longer way to do it (Cure Wounds' "1 action or 8 hours" family). */
  orMinutes?: number;
  /** The circumstance that lets a reaction be taken. */
  trigger?: ReactionTrigger;
  /** It can also be done as a ritual (no slot, ten minutes more). */
  ritual?: true;
  /** Spell components; `gp` is the first priced material, `consumed` if used up. */
  components?: { v?: true; s?: true; m?: true; gp?: number; consumed?: true };
  /** Everything paid on use. Absent: free. */
  pay?: ReadonlyArray<ActivityResource>;
  /** One alternative payment the player may choose instead of `pay`. */
  orPay?: ActivityResource;
  /** The rules category this use counts as (Cunning Action Dash, Hide). */
  economyCategory?: ActionEconomyCategory;
  /** A hard cap on uses per turn. */
  maxUsesPerTurn?: number;
}

/** What must already be true for the activity to be offered. */
export interface ActivityRequires {
  /** Another action id committed this turn (Hand of Healing inside Flurry). */
  actionThisTurn?: string;
  /** A turn-scoped outcome receipt that must already exist. */
  outcomeThisTurn?: CombatOutcomePredicate;
  /** Any committed action of this rules category this turn. */
  categoryThisTurn?: ActionEconomyCategory;
  /** A chosen option of a choice bundle (a species form). */
  bundleOption?: { bundleKey: string; optionId: string };
}

/** A creature count: a number, the Proficiency Bonus, or an ability modifier (min 1). */
export type ActivityCount = number | "PB" | AbilityCode;

/**
 * Who it affects. Absent: one creature the table picks. Self, selected or area
 * is inferred: `affinity: "self"` is the user, `area` everyone caught in it,
 * anything else the creatures the player selects.
 */
export interface ActivityTarget {
  /** Which creatures are legal. Absent: any. */
  affinity?: "ally" | "enemy" | "self" | "any";
  /** Every creature in an area, not a chosen few. */
  area?: true;
  /** The user is not a legal target even when the affinity matches. */
  excludeSelf?: true;
  /** Only creatures of these types. */
  creatureTypes?: ReadonlyArray<CreatureType>;
  /** How many may be chosen. Absent: one, or everyone in the area. */
  count?: ActivityCount;
  /** Extra creatures per spell slot level above the base. */
  countPerUpcast?: number;
  /** One amount is divided among the targets (Mass Heal). */
  sharedAmount?: true;
  /** Only the first target takes the primary damage; the rest only riders. */
  primaryOnly?: true;
  /** Melee reach in feet. */
  reachFt?: number;
  /** Ranged distance in feet (`far` for the long range). */
  rangeFt?: { near: number; far?: number };
}

/** Where an attack bonus comes from. */
export type AttackBasis =
  /** The user's spell attack modifier. */
  | { kind: "spell" }
  /** The bonus printed on a stat block. */
  | { kind: "printed"; value: number }
  /** Proficiency Bonus plus this ability's modifier (the bonus alone without one). */
  | { kind: "ability"; ability?: AbilityCode }
  /** A weapon profile the reader resolves (an Unarmed Strike). */
  | { kind: "weapon"; weapon: "unarmed-strike" };

/** Where a save DC comes from. */
export type DcBasis =
  /** The user's spell save DC. */
  | { kind: "spell" }
  /** The DC printed on a stat block. */
  | { kind: "printed"; value: number }
  /** 8 + Proficiency Bonus + this ability's modifier. */
  | { kind: "ability"; ability: AbilityCode };

/** An attack roll. */
export interface ActivityAttack {
  /** Absent: the table decides (a spell-attack follow-up). */
  mode?: "melee" | "ranged" | "melee-or-ranged";
  bonus: AttackBasis;
}

/** A saving throw the targets make. */
export interface ActivitySave {
  ability: AbilityCode;
  /** Absent: the DC is known only at the table. */
  dc?: DcBasis;
  /** A success has a special outcome the text describes. */
  successSpecial?: true;
}

/** A flat-DC ability check the user makes (Hide: DC 15 Stealth). */
export interface ActivitySkillCheck {
  skill: string;
  dc: number;
}

/** An additive term of a dice formula. */
export type DiceTerm =
  | HealTerm
  /** The user's spellcasting ability modifier. */
  | { kind: "spell-mod" }
  /** The level of the class that owns the activity. */
  | { kind: "owner-level" }
  /** A flat amount added per spell slot level above the base. */
  | { kind: "flat-per-upcast"; value: number };

/**
 * A dice formula, symbolic: the reader resolves it for a character. Every part
 * is optional; a formula with only `plus` is a flat amount.
 */
export interface ActivityDice {
  /** Fixed dice or amount ("8d6", "1d4+1", "70"), or a class-table die sentinel
   *  ("classSpecific:martialArtsDie"). */
  dice?: string;
  /** Dice by the owner's scaling level: the highest threshold ≤ level wins. */
  byLevel?: Readonly<Record<number, string>>;
  /** A variable die count (PB, or an ability modifier with a minimum of 1). */
  count?: { of: DiceCount; face: string };
  /** `dice` is rolled this many times (two rolls of the Martial Arts die). */
  rolls?: number;
  /** The rolled total is multiplied before `plus` is added. */
  multiplier?: number;
  /** Dice added per spell slot level above the base. */
  perUpcast?: string;
  /** Cantrip progression: the die count steps up at character levels 5/11/17. */
  cantrip?: true;
  plus?: ReadonlyArray<DiceTerm>;
}

/** The type of the damage dealt. */
export interface DamageTypes {
  /** The type(s); several types all apply unless `choose` is set. */
  types?: ReadonlyArray<DamageType>;
  /** The user picks one of `types` on each use. */
  choose?: true;
  /** A level-scaled choice list (the highest threshold ≤ level wins). */
  chooseByLevel?: Readonly<Record<number, ReadonlyArray<DamageType>>>;
  /** The type comes from the chosen option of this choice bundle (an ancestry). */
  fromBundle?: string;
}

/** Fields every effect may carry. */
interface EffectBase {
  /** The owner's class level from which this effect is available. */
  fromLevel?: number;
}

/** What happens. */
export type ActivityEffect =
  | (EffectBase &
      DamageTypes & {
        kind: "damage";
        /** Absent: the catalogue text states the amount. */
        dice?: ActivityDice;
        /** This component resolves differently from the activity's check. */
        gate?: CombatResolutionGate;
        /** Damage on a successful save / a missed attack. Absent: none. */
        onSave?: "half";
        onMiss?: "half";
        /** This component can reach several creatures even when the activity cannot. */
        area?: true;
        /** Only against creatures of these types (Divine Smite vs Fiends). */
        vsCreatureTypes?: ReadonlyArray<CreatureType>;
        /** The same total may be applied as healing instead (Divine Spark). */
        orHeal?: true;
      })
  | (EffectBase & {
      kind: "heal";
      dice?: ActivityDice;
      /** Restores every Hit Point (Heal's full mode). */
      full?: true;
      /** One amount divided among the targets. */
      pool?: number;
      /** The healing comes from a spent pool (Lay On Hands). */
      fromPool?: true;
      /** The user heals this fraction of the damage actually dealt. */
      fromDamage?: number;
      /** Conjures consumables that heal when eaten (Goodberry). */
      consumable?: { itemId: string; count: number; lifetimeHours: number };
    })
  | (EffectBase & {
      kind: "temp-hp";
      dice?: ActivityDice;
      /** One temporary-HP amount divided among the targets. */
      pool?: number;
    })
  | (EffectBase & { kind: "condition"; apply: CombatConditionApplication })
  | (EffectBase & {
      kind: "end-condition";
      options: ReadonlyArray<ConditionId>;
      max?: number;
      /** Hit Points spent from the activity's pool per condition ended. */
      costHp?: number;
    })
  | (EffectBase & {
      kind: "status";
      /** The status key `while-active` grants read. */
      key: string;
      recipient: "self" | "selected";
      /** The status binds the selected creature as marked or cursed. */
      markScope?: "marked" | "cursed";
      concentration?: true;
      lifetime: StatusLifetime;
      endsOn: ReadonlyArray<StatusEnd>;
    })
  | (EffectBase & {
      kind: "mark";
      scope: "marked" | "cursed" | "vowed";
      lifetime?: StatusLifetime;
    })
  | (EffectBase & { kind: "maintain"; key: string })
  | (EffectBase & { kind: "grant-die"; die: string })
  | (EffectBase & { kind: "heroic-inspiration" })
  | (EffectBase & { kind: "stabilize" })
  | (EffectBase & { kind: "restore-resource"; trackerId: string; upTo: number | "full" })
  | (EffectBase & {
      kind: "reduce-damage";
      dice: ActivityDice;
      typesByLevel: Readonly<Record<number, ReadonlyArray<DamageType>>>;
    })
  | (EffectBase & { kind: "check-bonus"; dice: string; refundOnFail?: true })
  | (EffectBase & { kind: "next-attack-advantage" })
  | (EffectBase & { kind: "speed-zero" });

export type ActivityEffectKind = ActivityEffect["kind"];

/** How often the activity repeats on one use (darts, rays, beams, strikes). */
export interface ActivityRepeats {
  count: number;
  perUpcast?: number;
  /** The count by the owner's scaling level (Flurry of Blows). */
  byLevel?: Readonly<Record<number, number>>;
  /** The count follows the cantrip progression (Eldritch Blast's beams). */
  cantrip?: true;
}

/** The one shape every active mechanic is declared in. */
export interface Activity {
  /** Stable id: the source kind plus its ids (`spell:fireball`). */
  id: string;
  source: ActivitySource;
  cost: ActivityCost;
  requires?: ActivityRequires;
  target?: ActivityTarget;
  /** How it resolves; an effect's `gate` picks one when both apply (Ice Knife).
   *  Neither: it just happens. */
  attack?: ActivityAttack;
  save?: ActivitySave;
  skill?: ActivitySkillCheck;
  repeats?: ActivityRepeats;
  effects: ReadonlyArray<ActivityEffect>;
  /** Held by the user's Concentration. */
  concentration?: true;
  /** Over as soon as it resolves. */
  instantaneous?: true;
  /** A successful save by a recurring target ends it on that target (the save
   *  may be a follow-up's, as with Searing Smite's burn). */
  endsOnSave?: true;
  /** Its damage happens again on this cadence after the cast. */
  recurrence?: SpellRecurrence;
  /** Casting only creates the effect; its first damage or save comes later. */
  resolveOnCast?: false;
  /** The outcome word a card leads with, when the catalogue names one. */
  tag?: "advantage" | "control" | "heal" | "buff" | "debuff" | "utility";
  /** The action an active spell grants without spending the slot again. */
  followUp?: Activity;
}

/** A source field the Activity cannot express yet, kept visible, never dropped. */
export interface ActivityGap {
  field: string;
  reason: string;
}

/** A translation: the Activity plus every source field it does not carry. */
export interface ActivityTranslation {
  activity: Activity;
  gaps: ReadonlyArray<ActivityGap>;
}
