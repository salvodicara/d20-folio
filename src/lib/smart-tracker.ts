/**
 * Smart Tracker Resolution
 *
 * Core intelligence of the app. Given a character's class, level, subclass,
 * and feature list, this module:
 *
 * 1. Resolves SRD feature references → full feature data with mechanics
 * 2. Extracts trackers from features with mechanics.tracker
 * 3. Extracts combat actions from features with mechanics.actions
 * 4. Resolves tracker total formulas ("PB", "CHA", "level*5", etc.)
 * 5. Combines with spell data to produce the full Combat action card list
 *
 * The result is what populates:
 * - Resources panel (tracker pips + spell slots)
 * - Combat page action cards (weapons + spells + feature actions)
 */

import type { CharacterDoc, TrackerData } from "@/types/character";
import type { ProficiencyToken } from "@/types/ids";
import type {
  ActionType,
  ActionHeal,
  ActionAttack,
  DiceCount,
  HealTerm,
  Recovery,
  BiText,
  TrackerSpec,
  SrdClassFeatureData,
  SrdFeatData,
  AbilityCode,
  ConditionId,
  DamageType,
  SrdEquipmentData,
  SpellRecurrence,
  TrackerUnit,
  AltRecoveryCost,
} from "@/data/types";
import { isPoolAltRecovery, isSlotAltRecovery } from "@/data/types";
import { classFeatureIndex, getClassTable, pactSlotLevel } from "@/data/classes";
import { getBeast } from "@/data/beasts";
import {
  totalLevel,
  classEntryLevel,
  primaryClassId,
  allEntryPicks,
  getClasses,
} from "@/lib/classes";
import {
  evaluateGrants,
  countTopLevelFreeCasts,
  type Grant,
  type AggregatedGrants,
  type AdvantageClause,
  type DamageDieModifierEntry,
  type ManifestedWeapon,
  type FormAttack,
  type PactWeapon,
  type PactWeaponRider,
} from "@/lib/grants";
import {
  resolveGrantSourcesForFeatures,
  resolveGrantSourcesForRace,
  resolveGrantSourcesForInvocations,
  resolveGrantSourcesForSpells,
  resolveGrantSourcesForEquipment,
  resolveAllGrantSources,
  raceTraitSessionId,
} from "@/lib/resolve-grant-sources";
import {
  effectiveMaxHp,
  bloodiedFromHp,
  aggregateCharacterGrants,
} from "@/lib/aggregate-character";
import { slotUsageKey } from "@/lib/cast-options";
import { getRace, rawRaceTraitCatKey, type RaceFeatureEntry } from "@/data/races";
import type { CreatureSize, SrdRaceTrait } from "@/data/types";
import { SRD_INVOCATIONS } from "@/data/invocations";
import { getSrdFeatureSource, srdRefForFeatureSource } from "@/lib/srd-feature-lookup";
import { spellIndex, spells } from "@/data/spells";
import { WEAPONS_BY_ID } from "@/data/weapons";
import { getEquipment } from "@/data/equipment";
import { getMagicItem } from "@/data/magic-items";
import { resolveItemConsumable, consumableActionSlot } from "@/lib/srd-resolve";
import {
  appendAbilityModToDice,
  scaleCantripDice,
  pickDiceByLevel,
  spellInstanceCount,
} from "@/lib/utils";
import {
  abilityModifier,
  unarmedStrikeSaveDc,
  effectiveAbilityScores,
  effectiveProficiencyBonus,
  effectiveSpellSaveDc,
  effectiveSpellAttackBonus,
  featureSaveDc,
  isWeaponProficient,
  exhaustionPenalty,
  resolveWeaponAttackStat,
  resolveWeaponAttackCantrip,
  effectiveUnarmedStrike,
  effectiveWeaponDie,
  resolveSpellDamageBonus,
  resolveHealBonus,
  resolveCastingModifier,
  resolveCantripDamageBonus,
  resolveCantripForcedMovement,
  resolveCantripRangeBonus,
  resolveSpellDamageTypeOverrides,
  resolveComponentWaiver,
  resolveItemBoundWeaponBonus,
  attacksPerAction,
  maxTableExtraAttacks,
  isHeavyArmorEquipped,
} from "@/lib/compute";
import { srdEn, type SrdKind } from "@/i18n/srd-en";
import { srdKey } from "@/i18n/srd-key";
import type { LocText } from "@/lib/loc-text";
import { srdText, customText, litText, uiText } from "@/lib/loc-text";
import type { BreakdownLine, RawBreakdownPart } from "@/lib/value-breakdown";
import { abilityPart, locPart, termPart, breakdownTotal } from "@/lib/value-breakdown";
import { resolveEffectiveSpells } from "@/lib/expanded-spells";
import { resolveSpellAbility } from "@/lib/resolve-spell-ability";
import { resolveSpellOwningClassId } from "@/lib/spell-owning-class";
import { isSpellCombatCastable } from "@/lib/spell-combat-castable";
import { resolveArmorEffects } from "@/lib/condition-effects";
import { effectiveArmorProficiencies } from "@/lib/feat-prereq";
import type { CostSpec } from "@/lib/cost-engine";

/** Supported locale keys matching BiText */
type Locale = keyof BiText;

// ============================================================
// Types
// ============================================================

/**
 * A resolved resource tracker as the ENGINE emits it — locale-FREE. `label` and
 * `description` are carried as `BiText` DATA (never read by locale here);
 * `lib/views/tracker-view.localizeTrackers` resolves them into the display
 * `ResolvedTracker` at the presenter edge (docs/ARCHITECTURE.md). Every other
 * field is identical between the raw and display shapes.
 */
export interface RawResolvedTracker extends Omit<
  ResolvedTracker,
  "label" | "description"
> {
  /** Localizable display label (a {@link LocText} ref — localized in the view). */
  label: LocText;
  /** Localizable one-line reminder (a {@link LocText} ref). Optional. */
  description?: LocText;
}

/** A resolved resource tracker ready for UI display (localized at the view edge). */
export interface ResolvedTracker {
  /** Unique ID (feature ID): "bard-bardic-inspiration" */
  id: string;
  /** Display label: "Bardic Inspiration" */
  label: string;
  /**
   * Localized one-line reminder of what the resource does (D37) — surfaced as the
   * rail tracker's hover tooltip so a player remembers e.g. what Bardic Inspiration
   * grants without opening the Features tab. Derived from the SRD feature text.
   */
  description?: string;
  /** Resolved total (computed number) */
  total: number;
  /** Recovery timing */
  recovery: Recovery;
  /** Die type (optional) */
  die?: string;
  /** Whether this is a pool (HP-like) resource */
  isPool?: boolean;
  /** Stable unit token for pools (localized at the render boundary). */
  unit?: TrackerUnit;
  /**
   * How many uses recover on a Short Rest.
   * "all" = recover full total; number = recover exactly N uses.
   * Only meaningful when recovery is "short-rest" or "short-or-long-rest".
   */
  shortRestRecovery?: number | string;
  /**
   * H10 — Generic scaling-rider chip. A small bilingual label + value
   * surfaced from the class table's `classSpecific` map (e.g. Barbarian
   * Rage Damage 2/3/4 at L1/9/16). Lets the UI show non-die scaling
   * values without inventing a separate widget per feature.
   */
  rider?: { label: LocText; value: string };
  /**
   * Alternate activation/recovery cost — when this tracker is exhausted, a use
   * can still be activated WITHOUT waiting for the normal rest recovery, by
   * paying the alternate cost: spend `amount` units of the `fromTracker` pool
   * (the six Sorcerer "spend N Sorcery Points" trackers) OR expend a spell slot
   * of level ≥ `fromSpellSlot` (Cleric Divine Foreknowledge → 6, Ranger
   * Persistent Wrath → 4). Surfaced for the consumer / UI; the engine never
   * auto-deducts the pool/slot (override-first). Undefined when the tracker has
   * no alternate cost.
   */
  altRecoveryCost?: AltRecoveryCost;
  /** Current usage from session state */
  used: number;
}

/** Structured summary data for combat action cards */
export interface ActionSummary {
  /** Attack bonus: +9 to hit */
  attackBonus?: number;
  /** Damage formula: "8d6", "1d8+5", "3×(1d4+1)" */
  damage?: string;
  /**
   * The TWO-HANDED damage formula for a Versatile weapon (item g) — the larger
   * die from the weapon's "Versatile (1dX)" property, with the same ability mod
   * folded in as `damage` (the one-handed formula). Lets the Play action card
   * offer a stance toggle showing the two-handed damage, reading the SAME
   * versatile die the inventory WeaponCard parses (single source). Omitted for
   * non-versatile weapons.
   */
  versatileDamage?: string;
  /**
   * S12b — the number of SEPARATE damage instances a multi-instance spell creates
   * (Magic Missile's 3 darts, Scorching Ray's 3 rays), each dealing `damage` as
   * its OWN roll/attack. Carried alongside the per-instance `damage` (so any flat
   * rider folds per instance) — the UI renders "N × {damage}". Resolved at the
   * spell's BASE level here (the per-slot upcast bump is layered at the cast
   * modal). Omitted (or 1) for a single-roll spell.
   */
  instances?: number;
  /**
   * G24 — the self-side cadence on which this spell's damage RE-APPLIES (a moving
   * area's per-turn save, a bonus-action-moved hazard, a re-fired bolt). The
   * stable {@link SpellRecurrence} token (ids only — golden rule 7); the
   * combat card renders it as a localized cadence note. Omitted for a once-at-cast
   * spell.
   */
  recurrence?: SpellRecurrence;
  /** Damage type: "fire", "piercing", "force" */
  damageType?: string;
  /**
   * Multiple damage types this action can deal — for spells the single
   * `damageType` cannot represent. Two cases (see {@link multiDamageTypeFlavor}):
   *  - SIMULTANEOUS (`flavor: "all"`): every type applies at once (Prismatic
   *    Spray's eight rays, Prismatic Wall's layers, Storm of Vengeance's rounds);
   *  - CHOICE (`flavor: "choice"`): the caster picks ONE of these (Chromatic Orb,
   *    Dragon's Breath, Glyph of Warding's Explosive Rune).
   * Carries the full list so the (UI-owned) renderer can show every chromatic
   * chip. Omitted for single-type spells (use `damageType`). Override-first —
   * the engine never picks; for `flavor: "choice"` it surfaces the options only.
   */
  damageTypes?: string[];
  /** Whether `damageTypes` are dealt all at once or are a player's pick. */
  multiDamageTypeFlavor?: "all" | "choice";
  /**
   * A SECOND simultaneous damage instance with its OWN dice + type, for the few
   * spells whose two components have DIFFERENT dice the single `damage`/
   * `damageType` pair can't hold (Ice Storm 2d10 Bldg + 4d6 Cold, Ice Knife 1d10
   * Prc + 2d6 Cold, Meteor Swarm 20d6 Fire + 20d6 Bldg). The combat verdict
   * appends "+ {dice} {type}" after the primary chip. `dice` is the BASE-level
   * roll (per-slot upcast is previewed in the cast modal); the type is a stable
   * {@link DamageType} id, localized at the render edge. Omitted otherwise.
   */
  secondaryDamage?: { dice: string; damageType: string };
  /**
   * Self-contained extra-damage riders that apply on a hit with this attack
   * (Paladin Radiant Strikes +1d8 Radiant, etc.). Rendered as extra damage
   * chips. `oncePerTurn` is informational (the rider applies once per turn).
   */
  extraDamage?: Array<{
    dice: string;
    damageType: string;
    oncePerTurn: boolean;
    /**
     * The tracker this rider spends on each use (Psi Warrior Psionic Strike →
     * Psionic Energy Dice). Present only for riders with a `resourceCost`; the
     * combat UI debits it (the engine never auto-spends — override-first).
     */
    resourceTrackerId?: string;
  }>;
  /**
   * How this weapon's OWN damage dice are manipulated when rolled (Great Weapon
   * Fighting "treat 1-2 as 3", Savage Attacker "roll twice keep higher"). Pure
   * annotations the player applies when rolling externally — the engine never
   * rolls dice. Omitted when no such modifier applies. The off-hand ability-mod
   * (Two-Weapon Fighting) and the Unarmed Strike (Unarmed Fighting) are NOT
   * here — they fold directly into the `damage` formula / emit their own row.
   */
  dieModifiers?: Array<{
    mode: "floor" | "reroll-keep-higher";
    /** "floor": the highest replaced face (2). */
    floorBelow?: number;
    /** "floor": the value it becomes (3). */
    floorTo?: number;
    /** "reroll-keep-higher": once per turn. */
    oncePerTurn?: boolean;
  }>;
  /** Save DC (for save-based effects) */
  saveDC?: number;
  /** Save ability: "DEX", "WIS" */
  saveAbility?: string;
  /** Range: "120 feet", "Touch", "Self" */
  range?: string;
  /** Duration (omitted if Instantaneous) */
  duration?: string;
  /** Spell components (important for silence/restrained checks) */
  components?: { v: boolean; s: boolean; m: boolean };
  /**
   * Components a feature lets the caster WAIVE for this spell (Great Old One
   * Psychic Spells: cast Warlock Enchantment/Illusion spells without V/S). The
   * UI strikes/annotates these — the player CAN cast without them (e.g. while
   * Silenced). Omitted when nothing is waived.
   */
  componentsWaived?: ReadonlyArray<"v" | "s" | "m">;
  /**
   * Extra Weapon Mastery properties available on this attack beyond the
   * weapon's own mastery — a feature-granted extra (Battering Roots' Push /
   * Topple). Rendered as mastery chips in the unified weapon facts block.
   * Omitted when there are none. (A weapon's OWN owned mastery rides
   * {@link RawActionSummary.weaponMastery} instead.)
   */
  extraMasteries?: string[];
  /** Tracker uses remaining: { current: 2, total: 4, isPool?: true, unit?: "hp" } */
  uses?: { current: number; total: number; isPool?: boolean; unit?: TrackerUnit };
  /** Feature die: "d6", "d8", "d10" */
  die?: string;
  /** Trigger condition (for reactions): "when hit by attack", "when creature casts spell" */
  trigger?: string;
  /** Healing formula: "1d10+9", "5×level" */
  healing?: string;
  /**
   * Provenance lines for the heal chip's breakdown tip — present only on the
   * LOCALIZED summary (composed by `localizeHealBreakdown` from the engine's
   * evaluated {@link ResolvedActionHeal}), riding the SAME {@link BreakdownLine}
   * register as the weapon-damage tip + every value breakdown, so heal chips and
   * damage labels share ONE tip component (golden rule 3). Omitted when the heal
   * carries no provenance worth a tip (flat / dice-only).
   */
  healingBreakdown?: BreakdownLine[];
  /**
   * S8 ROLL-ENTRY — the self-heal a feature ACTION grants, structured so the card
   * can offer a roll-entry-then-apply affordance (golden rule 21: the app NEVER
   * rolls the die). `dice` is the rolled portion the PLAYER supplies (e.g. "1d10"
   * — Second Wind); `bonus` is the DETERMINISTIC part the engine resolved (the
   * Fighter level), added to the entered roll on apply. Present ONLY when the
   * action's heal targets the user (a `heal:` declaration, always self) AND carries
   * a die — a dice-free deterministic heal would be a true one-tap, but no such
   * self-heal exists in data yet. Mirrors `summary.heal`'s structure but survives
   * localization (the raw `heal` does not pass to the display summary). The card
   * applies `enteredRoll + bonus` via the store `applyHealing` seam (clamped, undoable).
   */
  healApply?: { dice: string; bonus: number };
  /**
   * On-hit self-heal paid for by EXPENDING a Hit Point Die (Lifedrinker: "expend
   * one of your Hit Point Dice … regain Hit Points equal to the roll plus your
   * Constitution modifier, minimum of 1"). Distinct from `healing` (a free heal):
   * this one COSTS a Hit Die, so the consumer surfaces it as a player-chosen
   * on-hit option, never auto-spent (override-first). `formula` is the
   * locale-agnostic display string ("1d8 + 2, min 1"), `dice` the Hit Die rolled
   * (the character's class Hit Die — d8 for a Warlock), `abilityMod` the flat
   * Constitution modifier added, `minimum` the SRD floor (1). Omitted unless a
   * rider declares `healFromHitDie`.
   */
  onHitHeal?: {
    formula: string;
    dice: string;
    abilityMod: number;
    minimum: number;
    spendsHitDie: boolean;
  };
  /**
   * Lowest natural d20 that CRITS on this weapon attack (`crit-range` —
   * Champion Improved/Superior Critical: 19 / 18). Omitted at the default 20.
   * Display-only — the player rolls externally (AX exposure audit).
   */
  critRange?: number;
  /**
   * On-crit movement rider (`on-crit-movement` — Champion Remarkable Athlete:
   * move up to this many feet without provoking after a crit). Omitted when no
   * rider applies. Display-only (AX exposure audit).
   */
  onCritMoveFt?: number;
  /**
   * Forced-movement rider on a hit with THIS cantrip (`cantrip-effect-rider` —
   * Warlock Repelling Blast: push a Large-or-smaller creature 10 ft). Resolved
   * per spell id by `resolveCantripForcedMovement`; the UI renders it as an
   * on-hit note. Informational — the player adjudicates; no RNG, no geometry.
   */
  forcedMovement?: {
    direction: "push" | "pull";
    distanceFt: number;
    maxTargetSize: CreatureSize;
  };
  /**
   * Grant-derived range INCREASE in feet for this cantrip (`cantrip-range-bonus`
   * — Warlock Eldritch Spear: +30 ft × Warlock level). Annotates the printed
   * `range` (which stays the spell's catalogue string); the UI shows "+N ft".
   */
  rangeBonusFt?: number;
  /** Brief effect text (for non-damage actions): "+5 AC", "Invisible", "Extra action" */
  effect?: string;
  /**
   * G23 — a "spend a resource to add a die to a FAILED ability check" affordance
   * (Fighter Tactical Mind: expend a use of Second Wind, roll `dice`, add it to a
   * failed check; `refundOnFail` ⇒ the use is NOT expended if the check still
   * fails). Locale-FREE structured data (carried unchanged through localization):
   * `dice` is the roll-entry die (the app never rolls — golden rule 21), and the
   * presenter composes the localized "spend → +1d10 to a failed check (refunded on
   * a fail)" line from it. Omitted for non-check actions.
   */
  checkBonus?: { dice: string; refundOnFail: boolean };
  /**
   * G19 — conditions this action can NEUTRALIZE by expending pool HP (Paladin Lay
   * On Hands: 5 HP ends Poisoned; +Restoring Touch's six conditions at Paladin
   * 14). Locale-FREE: `condition` is a stable {@link ConditionId} the presenter
   * localizes via `conditionLabel`, `costHp` the HP drawn from the pool. The pool
   * is never auto-debited (override-first). Already filtered to the conditions
   * available at the character's level. Omitted when the action cures nothing.
   */
  cureOptions?: Array<{ condition: ConditionId; costHp: number }>;
  /**
   * G22 — a die-rolled Temporary-HP gain that RIDES this action (Monk Heightened
   * Focus: spending a Focus Point on Patient Defense grants Temp HP equal to two
   * rolls of the Martial Arts die). The engine resolves the die at the action's
   * OWNING-class level and emits the concrete formula (`{ dice: "2d8" }` at Monk
   * L10, "2d10" at L11, …) — a ROLL-ENTRY the player supplies (golden rule 21 —
   * the app never rolls). Level-gated at emission (a Monk below L10 gets no field).
   * Override-first: the presenter shows the formula; the temp HP is never
   * auto-applied (temp HP don't stack). Omitted when the action grants no rolled
   * temp HP.
   */
  tempHpRoll?: { dice: string };
  /**
   * Per-spell Temporary-HP APPLY seam (False Life: 2d4 + 4, +5/slot level above
   * 1st) — the roll-entry-then-apply sibling of {@link healApply}, but for Temp HP.
   * `dice` is the portion the PLAYER rolls (golden rule 21 — the app never rolls);
   * `bonus` is the DETERMINISTIC part the app adds to the entered roll (False Life's
   * +4). When the caster casts via a MAXIMIZING at-will source (Warlock Fiendish
   * Vigor), the engine emits a dice-FREE `{ bonus: 12 }` instead — the deterministic
   * maximum one-taps (S8). Locale-free (dice string + numbers): it survives
   * localization untouched (unlike `healApply`, which the view derives from `heal`).
   * The card applies `enteredRoll + bonus` (or the flat one-tap) via the store
   * `gainTempHp` seam (max-wins, undoable). Omitted for spells with no rolled Temp HP.
   */
  tempHpApply?: { dice?: string; bonus: number };
}

/** A resolved combat action card */
export interface ResolvedAction {
  /** Unique ID */
  id: string;
  /** Display name (localized) */
  name: string;
  /**
   * English name, when the source has one. Carried alongside the localized
   * `name` so the combat action search can match either language (an IT player
   * typing "dash" finds "Scatto"). Omitted for custom/player-named entries that
   * have no separate English title.
   */
  nameEn?: string;
  /**
   * The action's NAME as the engine's localizable {@link LocText} reference — the
   * SAME `name` ref the raw action carried (an `srd` catalogue id-ref for an SRD
   * spell/weapon/feature, a `lit` bilingual constant for a base action like Dash,
   * a `custom` string for homebrew). Carried so the combat LOG can store a stable,
   * re-localizable reference (golden rule 7) and resolve it via
   * `localizeText` — never the economy-suffixed row `id` nor the frozen localized
   * `name`. (The dual-wield off-hand "(off-hand)" suffix is appended to the display
   * `name` AFTER localization, so this base ref logs the bare weapon name without
   * the suffix — an acceptable minor residual.)
   */
  nameLoc: LocText;
  /** Action economy type */
  type: ActionType;
  /** Source: "spell", "weapon", "feature" */
  source: "spell" | "weapon" | "feature";
  /** Spell level (null for non-spells) */
  spellLevel: number | null;
  /** SRD spell id (set for SRD spell actions) — lets the Combat page build the
   *  spell's cast options (upcast / free-cast) for rich in-combat casting. */
  spellId?: string;
  /** SRD weapon id (set for equipped SRD weapon actions, incl. their off-hand
   *  rows) — lets the combat card pick the per-weapon-type seal glyph
   *  (`weaponSealIcon`). Undefined for custom / manifested / pact weapons (→
   *  generic sword). */
  weaponId?: string;
  /** True for the dual-wield OFF-HAND bonus attack (Two-Weapon Fighting). The UI
   *  surfaces it ONLY once a Light-weapon Attack has been committed this turn —
   *  RAW 2024: the off-hand attack follows the Attack action with a Light weapon.
   *  (Data declares the mechanic; the UI enforces the turn-state prerequisite.) */
  offhand?: boolean;
  /** True for a Light melee weapon's MAIN attack row — committing it as the
   *  Attack action is what unlocks the {@link offhand} bonus attack. */
  lightWeapon?: boolean;
  /** True for a natural-weapon attack a FORM grants (Wild Shape beast bite,
   *  Starry Form attack, Armorer Thunder Pulse / Lightning Launcher). Present
   *  ONLY while the form toggle is lit (the row retracts when toggled off); lets
   *  the board tag it as a form weapon. */
  formAttack?: boolean;
  /** Is concentration spell */
  concentration: boolean;
  /** Structured summary for at-a-glance display */
  summary: ActionSummary;
  /** Whether it costs a spell slot */
  costsSlot: boolean;
  /** Spell slot level required (if costsSlot) */
  slotLevel?: number;
  /** Tracker ID consumed (if feature with tracker) */
  costTracker?: string;
  /** Whether the associated tracker is a pool resource (Lay on Hands, etc.) */
  costTrackerIsPool?: boolean;
  /** Stable pool unit token (e.g. "hp", "points") — localized at the render boundary. */
  costTrackerUnit?: TrackerUnit;
  /**
   * Number of tracker uses consumed when this action fires.
   * Defaults to 1 if omitted.
   */
  trackerCost?: number;
  /** Whether this action is pinned */
  pinned: boolean;
  /**
   * Whether this action is pinned by default (e.g. weapons).
   * Controls which list `togglePinnedAction` targets:
   * true → unpinnedActions blacklist; false → pinnedActions whitelist.
   */
  defaultPinned: boolean;
  /** Full description text (for expanded view) */
  description?: string;
  /**
   * Equipment lookup key consumed on End Turn (potions only).
   * Format: srdId for SRD items, `custom-${name}` for custom.
   * Distinct from `id` which has an `item-` prefix.
   */
  costEquipment?: string;
  /**
   * Alternate-action-cost — a SECOND, independent payment route the player may
   * pick INSTEAD of the primary cost (Wild Companion: "expend a spell slot OR a
   * use of Wild Shape"). Carried verbatim from `SrdActionDef.alternateCost`;
   * `getActionCostOptions` enumerates it alongside the primary cost.
   */
  alternateCost?: CostSpec;
  /**
   * The `while-active` toggle key this action ESTABLISHES when used (Rage →
   * "barbarian-rage", Bladesong, Innate Sorcery, …). INFERRED, never declared
   * twice: an SRD feature whose `mechanics.actions` sit beside a `while-active`
   * grant is an activation feature — using its action IS entering the state
   * (declare the least). The combat commit loop flips the key into the session
   * active set (lighting the rail chip + every while-active grant) and its
   * reverse-applier clears it on undo; the player taps the lit chip to end the
   * state. Omitted for actions on features with no `while-active` grant.
   */
  activatesKey?: string;
  /**
   * USE-APPLIES (2026-06-12) — deterministic, dice-free effects this action
   * AUTO-APPLIES to session state on use (Task 1): a same-source slot-gated
   * `temp-hp` grant resolved to a number (Orc Adrenaline Rush → PB temp HP).
   * The combat commit loop applies each one with undo (reverse-applier restores
   * the prior value); override-first — the applied value stays editable. Omitted
   * when the action has no deterministic side-effect. Carried identically on the
   * raw {@link RawResolvedAction} (the values are already locale-free numbers).
   */
  useEffects?: ReadonlyArray<ResolvedUseEffect>;
}

/**
 * A weapon's range as locale-FREE structured DATA (feet numbers, never a
 * formatted string). The engine emits this; `lib/views/weapon-facts-view.
 * formatWeaponRange` turns it into the localized "5 ft", "30/120", "1,5 m"
 * display string at the presenter edge (docs/ARCHITECTURE.md, domain rule D3
 * — unit formatting is a view concern). One shape for every weapon resolver
 * (carried, manifested, pact, unarmed) so the formatting lives in ONE place.
 */
export type WeaponRangeSpec =
  | {
      /** Melee weapon: a single reach (5 / 10 / + reach-bonus), with an optional
       *  thrown near/far pair appended (" / 20/60"). */
      kind: "melee";
      reachFt: number;
      thrown?: { nearFt: number; farFt: number };
    }
  | {
      /** Ranged weapon: a near/far pair ("80/320"). */
      kind: "ranged";
      nearFt: number;
      farFt: number;
    };

/**
 * The engine-emitted (locale-FREE) action summary. Identical to
 * {@link ActionSummary} EXCEPT the fields that used to carry a localized string
 * are carried as DATA: `range`/`duration`/`effect`/`trigger` as `BiText`,
 * weapon range as a structured {@link WeaponRangeSpec}, plus the RAW weapon
 * facts (`properties` / `weaponCategory` / `weaponMastery`) the presenter
 * turns into the unified weapon facts block. Every numeric / token / formula
 * field is identical to {@link ActionSummary}.
 */
/**
 * An authored {@link ActionHeal} EVALUATED against the owning character. Every
 * additive term the data can declare (owning-class level, ability mod, flat)
 * is a quantity the engine KNOWS, so it resolves to a NUMBER at emission — the
 * chip reads "1d10+5", never "1d10 + Fighter level" (a value the player would
 * have to compute; owner doctrine 2026-06-12). `term` keeps the provenance so
 * the view can compose the breakdown tip; a flat term carries none (the number
 * IS its own provenance). Locale-free by construction (digits + the dice
 * token), like every engine emission.
 */
export interface ResolvedActionHeal {
  /** The rolled portion ("1d10", "2d4") — rolled externally, never by the app. */
  dice?: string;
  /** The evaluated additive bonus; 0 when the heal is dice-only. */
  bonus: number;
  /** Provenance of `bonus` for the breakdown tip (class-level / ability-mod). */
  term?: Extract<HealTerm, { kind: "class-level" | "ability-mod" }>;
}

/**
 * USE-APPLIES (2026-06-12) — a DETERMINISTIC (dice-free) effect that using an
 * action AUTO-APPLIES to session state, with the same immediate-commit-with-undo
 * model the combat economy already uses (Task 1). Resolved to a NUMBER at
 * emission (locale-free), so the commit loop just applies it — no per-feature
 * special case, no prose parsing. Override-first: the applied value stays
 * user-editable (temp HP is an editable rail field). Currently one kind — the
 * slot-gated temp-HP grant (Orc Adrenaline Rush, Shifter Shifting, Chef) — the
 * register the field is built to grow (self-heal, self-condition) without a new
 * commit path. Dice-bearing quantities are NEVER auto-applied (golden rule 21):
 * those stay on the manual path (e.g. Second Wind's `1d10`), so this register
 * carries only the resolved, deterministic amount.
 */
export type ResolvedUseEffect = {
  /**
   * Temporary HP the action grants on use — resolved from a same-source
   * `temp-hp` grant carrying a `slot` (the deliberate-spend marker). `amount`
   * is `resolveTempHp(formula)`; temp HP never stack, so the consumer applies
   * `max(current, amount)`. `sourceId` is provenance for the toast.
   */
  kind: "temp-hp";
  amount: number;
  sourceId: string;
};

/**
 * Resolve a VARIABLE {@link DiceCount} (`"PB"` or an ability mod) plus a die face
 * into a concrete dice string — the ONE place a variable die COUNT is multiplied
 * out (shared by the heal side AND the save-attack side). PB derives from the
 * TOTAL level (override-aware), matching every other PB use; an ability mod is
 * floored at 1 (Sear Undead's "minimum of 1d8"). Emits a number the player never
 * has to compute (owner doctrine 2026-06-12): `WIS` mod 3 → `"3d8"`.
 */
function resolveDiceCount(
  count: DiceCount,
  dieFace: string,
  charData: CharacterDoc["character"],
  scores: Record<AbilityCode, number>
): string {
  const n =
    count === "PB"
      ? effectiveProficiencyBonus(totalLevel(charData), charData.proficiencyBonusOverride)
      : Math.max(1, abilityModifier(scores[count]));
  return `${n}${dieFace}`;
}

/**
 * Evaluate a declared heal term against the character — the ONE place an
 * {@link ActionHeal} becomes numbers. The class-level term reads the OWNING
 * class entry's level (multiclass-correct: Fighter 3 / Wizard 5 → +3); the
 * ability term reads the current ability modifier.
 */
function resolveActionHeal(
  heal: ActionHeal,
  charData: CharacterDoc["character"],
  // D2 — the EFFECTIVE ability scores (set-score item floors), so a heal-on-action
  // ability term (e.g. +WIS) reflects an equipped set-score item. Passed in from the
  // resolution ctx (the single source).
  scores: Record<AbilityCode, number>
): ResolvedActionHeal {
  // A VARIABLE die count (PB, or an ability mod ≥1) is multiplied out to a
  // concrete dice string at emission via the shared resolver, so the chip reads
  // "3d4"/"3d8" — a number the player never has to compute (owner 2026-06-12).
  const dice =
    heal.diceCount && heal.dieFace
      ? resolveDiceCount(heal.diceCount, heal.dieFace, charData, scores)
      : heal.dice;
  const term = heal.plus;
  if (!term) return { dice, bonus: 0 };
  switch (term.kind) {
    case "class-level":
      return { dice, bonus: classEntryLevel(charData, term.classId), term };
    case "ability-mod":
      return {
        dice,
        bonus: abilityModifier(scores[term.ability]),
        term,
      };
    case "flat":
      return { dice, bonus: term.value };
  }
}

/**
 * G14 — resolve the ACTIVE Celestial-Revelation-style form's once-per-turn
 * `attack-or-spell` damage rider(s) into the {@link RawActionSummary.extraDamage}
 * chips that surface as a SELF-SIDE reminder on the transforming action's card.
 *
 * The signature payload is a flat +Proficiency-Bonus extra-damage rider the
 * player adds to ONE attack OR spell per turn while transformed (Radiant for
 * Heavenly Wings / Inner Radiance, Necrotic for Necrotic Shroud). It is a
 * `damage-rider` with `appliesTo: "attack-or-spell"` — DELIBERATELY excluded from
 * every weapon row (it isn't weapon-bound), so without this consumer the mechanic
 * aggregates and then renders NOWHERE. This surfaces it exactly when the form is
 * active: a generic walk of the trait's `choice-grant-bundle` for the option the
 * session currently has chosen, emitting its `attack-or-spell` riders.
 *
 * Generic (no species-specific branch): any race trait whose bundle option grants such a
 * rider gets the same reminder. The flat `amount: "PB"` resolves to a number
 * string (`"3"`) so the SHARED rider chip (`+3 Necrotic`, once-per-turn,
 * provenance = the trait's own name) renders it with zero new render code; the
 * `scope: "attack-or-spell"` qualifier disambiguates it from a weapon-bound rider
 * in the chip's tooltip ("on an attack or a spell"). The app rolls nothing
 * (golden rule 21).
 */
function resolveActiveFormRiders(
  trait: SrdRaceTrait,
  session: CharacterDoc["session"],
  charData: CharacterDoc["character"],
  traitName: LocText
): NonNullable<RawActionSummary["extraDamage"]> {
  const out: NonNullable<RawActionSummary["extraDamage"]> = [];
  for (const grant of trait.grants ?? []) {
    if (grant.type !== "choice-grant-bundle") continue;
    const chosen = session.grantBundleChoices?.[grant.bundleKey];
    if (chosen === undefined) continue;
    const option = grant.options.find((o) => o.id === chosen);
    if (!option) continue;
    for (const g of option.grants) {
      if (g.type !== "damage-rider" || g.appliesTo !== "attack-or-spell") continue;
      // The only non-dice rider is the flat PB sentinel (a species revelation form); a dice-bearing
      // `attack-or-spell` rider would surface its die unchanged. `same-as-weapon`
      // is meaningless off a weapon, so it never reaches here.
      const dice =
        g.amount === "PB"
          ? String(
              effectiveProficiencyBonus(
                totalLevel(charData),
                charData.proficiencyBonusOverride
              )
            )
          : (g.dice ?? "");
      out.push({
        dice,
        damageType: g.damageType === "same-as-weapon" ? "radiant" : g.damageType,
        oncePerTurn: g.oncePerTurn ?? false,
        scope: "attack-or-spell",
        source: traitName,
      });
    }
  }
  return out;
}

/**
 * USE-APPLIES (2026-06-12) — resolve the deterministic effects an action
 * AUTO-APPLIES on use (Task 1) from its OWNING source's grants. The clean,
 * generic discriminant (no per-feature branch): a `temp-hp` grant carrying a
 * `slot` is a DELIBERATE-spend gain tied to an action (Orc Adrenaline Rush:
 * `{ type: "temp-hp", formula: "PB", slot: "bonus" }` beside a bonus action) —
 * so using the action grants the temp HP. A slot-LESS temp-hp grant is a
 * triggered/passive gain (Dark One's Blessing fires "when you reduce an enemy to
 * 0 HP", Boon of the Bright Sun's emanation tick) and must NOT fire on a button,
 * so it is skipped here. The `slot` is matched to the action's economy type so a
 * feature whose temp-HP rides a bonus action only attaches to that action.
 *
 * `resolveTempHp` is deterministic + dice-free by construction (the `temp-hp`
 * grant grammar excludes dice — golden rule 21), so every emitted effect is a
 * concrete number the commit loop applies directly.
 */
function resolveActionUseEffects(
  grants: ReadonlyArray<import("@/lib/grants").Grant> | undefined,
  actionType: ActionType,
  character: CharacterDoc,
  sourceId: string
): ResolvedUseEffect[] {
  if (!grants) return [];
  const out: ResolvedUseEffect[] = [];
  for (const g of grants) {
    if (g.type === "temp-hp" && g.slot !== undefined && g.slot === actionType) {
      out.push({
        kind: "temp-hp",
        amount: resolveTempHp(g.formula, character),
        sourceId,
      });
    }
  }
  return out;
}

export interface RawActionSummary extends Omit<
  ActionSummary,
  | "range"
  | "duration"
  | "effect"
  | "trigger"
  | "properties"
  | "healingBreakdown"
  | "extraDamage"
  | "dieModifiers"
  | "onHitHeal"
> {
  /**
   * Self-contained extra-damage riders on a hit (Berserker Frenzy +2d6, Psi
   * Warrior Psionic Strike +1d8+INT Force, Lifedrinker +1d6 Necrotic). The
   * locale-FREE engine emission: each carries a `source` NAME ref ({@link LocText})
   * the presenter (`buildRiders`) resolves into the rider's provenance, on top of
   * the rendered fields ({@link ActionSummary.extraDamage}). A rider with a
   * `resourceTrackerId` is CONSUMABLE (the combat UI debits the tracker); one
   * without is always-on display-only.
   */
  extraDamage?: Array<{
    dice: string;
    damageType: string;
    oncePerTurn: boolean;
    resourceTrackerId?: string;
    /**
     * G14 — an `attack-or-spell` rider is NOT weapon-bound (a celestial-revelation
     * Revelation's +PB): it rides ONE attack OR spell per turn, surfaced as a
     * self-side reminder on the form's action card. The presenter routes this to
     * the chip tooltip ("on an attack or a spell") so it never reads as a
     * weapon-only bonus. Absent → a weapon-bound rider (the default scope).
     */
    scope?: "attack-or-spell";
    /**
     * A per-hit "vs a specific marked/cursed creature" rider (Hunter's Mark /
     * Hex) — the presenter appends a "vs marked / cursed target" label to the chip
     * so the player applies it only on the right hit (never auto-summed). The
     * token picks the localized noun. Absent → an always-applies rider.
     */
    vsMarkedTarget?: "marked" | "cursed";
    /** Source feature/feat/invocation NAME ref — provenance (e.g. "Frenzy"). */
    source: LocText;
    /**
     * `true` when the rider rides a `while-active` toggle that is currently up
     * (Rage's Brutal Strike, Divine Favor). The presenter appends a "· active"
     * suffix so the chip reads as conditional — mirrors the weapon-damage
     * breakdown note. Absent → an unconditional rider.
     */
    whileActive?: boolean;
  }>;
  /**
   * Damage-die roll manipulations on this weapon's own dice (Great Weapon
   * Fighting floor, Savage Attacker reroll). Locale-FREE; each carries its
   * `source` NAME ref ({@link LocText}) the presenter resolves.
   */
  dieModifiers?: Array<{
    mode: "floor" | "reroll-keep-higher";
    floorBelow?: number;
    floorTo?: number;
    oncePerTurn?: boolean;
    /** Source feature/feat NAME ref — provenance (e.g. "Savage Attacker"). */
    source: LocText;
  }>;
  /**
   * On-hit self-heal paid by expending a Hit Point Die (Lifedrinker). Locale-FREE;
   * carries the `source` NAME ref ({@link LocText}) the presenter resolves on top
   * of {@link ActionSummary.onHitHeal}.
   */
  onHitHeal?: NonNullable<ActionSummary["onHitHeal"]> & { source: LocText };
  /** Locale-free damage composition — `localizeAction` localizes each part's
   *  label and folds it onto `weaponFacts.breakdown` (the unified facts VM). */
  damageBreakdown?: ReadonlyArray<RawBreakdownPart>;
  /** Locale-free to-hit composition (#94) — `localizeAction` localizes each
   *  part's label and folds it onto `weaponFacts.attackBreakdown`. The to-hit
   *  total derives from `breakdownTotal(parts)` so they can't drift. */
  attackBreakdown?: ReadonlyArray<RawBreakdownPart>;
  /** Spell/feature range as a {@link LocText} ref (Touch / Self / 120 feet). */
  range?: LocText;
  /** Weapon range as structured feet (mutually exclusive with `range`). */
  weaponRange?: WeaponRangeSpec;
  /** Duration as a {@link LocText} ref. */
  duration?: LocText;
  /**
   * The one-line effect text as a {@link LocText} ref — for SRD sources this is
   * the catalogue ref {@link srdEffectText} chose (the authored `summary` when
   * present, else the full `description`); for engine literals/custom content it
   * is the text itself. The presenter NEVER slices it: a resolved line longer
   * than `EFFECT_LINE_BUDGET` is omitted from the collapsed card (the full
   * description stays one tap away in the accordion) — mid-sentence "…" is a
   * deleted mechanism (owner mandate 2026-06-12). The subtitle-budget guard
   * makes an over-budget SRD line unrepresentable at CI time.
   */
  effect?: LocText;
  /**
   * Pact-weapon Prone-rider NAME refs (Eldritch Smite). The engine can't compose
   * the bilingual "<rider>: spend a Pact Magic slot; target Prone …" note (no
   * locale), so it surfaces the rider name refs and the view composes the note
   * into `effect` at the presenter edge (`localizeSummary`). Omitted when none.
   */
  pactProneRiders?: ReadonlyArray<LocText>;
  /** Reaction trigger as a {@link LocText} ref (engine-parsed phrase / custom). */
  trigger?: LocText;
  /** RAW (untranslated) weapon-property tokens, AS PRINTED on the weapon
   *  (incl. "Thrown (Range 20/60)" / "Ammunition (…)") — the presenter turns
   *  them into the unified facts block's chips (`buildWeaponFacts`). */
  properties?: string[];
  /** The weapon's category id ("simple" / "martial"), when known. */
  weaponCategory?: string;
  /**
   * The weapon's OWN mastery token ("Vex") — present ONLY when the character
   * actually owns it: a `classes[].weaponMasteries` pick covering this weapon,
   * or a free mastery (Soulknife Psychic Blades). The unowned case is simply
   * never emitted, so no surface can show an unowned mastery chip (owner
   * mandate 2026-06-12). Feature-granted EXTRAS ride {@link extraMasteries}.
   */
  weaponMastery?: string;
  /**
   * STRUCTURED heal amount for a feature/trait action chip, EVALUATED against
   * the owning character (Second Wind on a Fighter 5: `{ dice: "1d10",
   * bonus: 5, term: { kind: "class-level", classId: "fighter" } }`). The
   * authored {@link ActionHeal} term names a quantity the engine KNOWS (the
   * class entry's level, an ability mod), so `resolveActionHeal` resolves it to
   * a NUMBER at emission — a derived value the user must compute is a defect
   * (owner doctrine 2026-06-12). The presenter renders the compact chip
   * ("1d10+5") and composes the provenance into the breakdown tip from `term`.
   * Mutually exclusive with the word-free string `healing` (spells/potions set
   * that directly — pure dice+flat). Omitted for non-heal rows.
   */
  heal?: ResolvedActionHeal;
}

/**
 * A resolved combat action as the ENGINE emits it — locale-FREE. `name` and
 * `description` are `LocText` REFS (the display `nameEn` is `localizeText(name,
 * "en")`), and the summary is a {@link RawActionSummary}. The view's
 * `localizeAction` resolves it to the display {@link ResolvedAction} at the
 * presenter edge — and carries this raw `name` ref through unchanged as the
 * display action's `nameLoc` (the stable, re-localizable reference the combat LOG
 * stores). So the raw shape needs no separate `nameLoc`: its `name` IS that ref.
 * Every other field is identical between the two shapes.
 */
export interface RawResolvedAction extends Omit<
  ResolvedAction,
  "name" | "nameEn" | "nameLoc" | "description" | "summary"
> {
  /**
   * Localizable display name (a {@link LocText} ref — localized in the view).
   * The view derives both the display name and `nameEn` (the search FACT) from
   * this ref via `localizeText(name, locale)` / `localizeText(name, "en")`.
   */
  name: LocText;
  /** Localizable full description (a {@link LocText} ref). */
  description?: LocText;
  /** Locale-free structured summary. */
  summary: RawActionSummary;
}

/**
 * Build a weapon's structured range from its property tokens — PURE + locale-FREE
 * (no formatting, just feet numbers). Mirrors the three weapon resolvers' inline
 * logic verbatim so they share ONE source of truth: ranged weapons read a
 * `range N/M` property (default 80/320); melee weapons are 5 ft (10 with Reach)
 * plus `reachBonusFt`, with an optional thrown `N/M` pair appended.
 */
export function buildWeaponRange(
  properties: ReadonlyArray<string>,
  opts: { isRanged: boolean; reachBonusFt?: number }
): WeaponRangeSpec {
  if (opts.isRanged) {
    const rangeProp = properties.find((p) => /range\s+\d+\/\d+/i.test(p));
    const m = rangeProp?.match(/(\d+)\/(\d+)/);
    return {
      kind: "ranged",
      nearFt: m ? parseInt(m[1] ?? "0", 10) : 80,
      farFt: m ? parseInt(m[2] ?? "0", 10) : 320,
    };
  }
  const reachFt =
    (properties.some((p) => /\breach\b/i.test(p)) ? 10 : 5) + (opts.reachBonusFt ?? 0);
  const thrownProp = properties.find((p) => /\bthrown\b/i.test(p));
  const tm = thrownProp?.match(/(\d+)\/(\d+)/);
  return {
    kind: "melee",
    reachFt,
    ...(tm
      ? {
          thrown: {
            nearFt: parseInt(tm[1] ?? "0", 10),
            farFt: parseInt(tm[2] ?? "0", 10),
          },
        }
      : {}),
  };
}

/**
 * Sum the `weapon-reach-bonus` riders that apply to a melee attack (Barbarian
 * World Tree Battering Roots: +10 ft on Heavy/Versatile weapons; Monk Elemental
 * Attunement: +10 ft on every melee attack, including the Unarmed Strike, while
 * the toggle is lit). `isHeavyOrVersatile` gates the `"heavy-or-versatile"`
 * riders; `"all-melee"` always applies. The single source of truth shared by the
 * carried-weapon row and the Unarmed Strike rows (golden rule 6) — `extraMasteries`
 * are pooled for the weapon row that needs them.
 */
export function resolveMeleeReachBonus(
  reachBonuses: AggregatedGrants["weaponReachBonuses"],
  isHeavyOrVersatile: boolean
): { reachBonusFt: number; masteries: string[] } {
  let reachBonusFt = 0;
  const masteries: string[] = [];
  for (const r of reachBonuses) {
    if (r.appliesTo === "heavy-or-versatile" && !isHeavyOrVersatile) continue;
    reachBonusFt += r.bonusFt;
    for (const m of r.extraMasteries) {
      if (!masteries.includes(m)) masteries.push(m);
    }
  }
  return { reachBonusFt, masteries };
}

// ============================================================
// Universal Base Combat Actions
// ============================================================

/**
 * Actions every character can take regardless of class or equipment.
 * Injected at the end of resolveActions() so they always appear in the
 * combat panel. defaultPinned = false — players pin the ones they want.
 */
// Exported for the subtitle-budget guard: every base-action effect/trigger is a
// collapsed-card line and must fit `EFFECT_LINE_BUDGET` in both locales.
export const BASE_ACTIONS: ReadonlyArray<{
  id: string;
  name: Record<Locale, string>;
  type: ActionType;
  effect: Record<Locale, string>;
  trigger?: Record<Locale, string>;
}> = [
  {
    id: "base-dash",
    name: { en: "Dash", it: "Scatto" },
    type: "action",
    effect: { en: "Double movement speed", it: "Raddoppia il movimento" },
  },
  {
    id: "base-dodge",
    name: { en: "Dodge", it: "Schivata" },
    type: "action",
    effect: {
      en: "Attacks vs you have Disadvantage",
      it: "Attacchi su di te in svantaggio",
    },
  },
  {
    id: "base-disengage",
    name: { en: "Disengage", it: "Disimpegno" },
    type: "action",
    effect: { en: "Movement doesn't provoke OA", it: "Mov. non provoca AA" },
  },
  {
    id: "base-help",
    name: { en: "Help", it: "Aiuto" },
    type: "action",
    effect: {
      en: "Ally gains Advantage on next attack or check",
      it: "Alleato ottiene Vantaggio",
    },
  },
  {
    id: "base-hide",
    name: { en: "Hide", it: "Nascondersi" },
    type: "action",
    effect: { en: "Stealth check", it: "Prova Furtività" },
  },
  {
    id: "base-ready",
    name: { en: "Ready", it: "Prepararsi" },
    type: "action",
    effect: { en: "Set trigger → reaction", it: "Imposta innesco → reazione" },
  },
  {
    id: "base-search",
    name: { en: "Search", it: "Cercare" },
    type: "action",
    effect: {
      en: "Perception or Investigation check",
      it: "Prova Percezione o Investigazione",
    },
  },
  {
    // RA-04 — 2024 Unarmed Strike option: the target makes a Strength or
    // Dexterity save vs 8 + STR + PB (the concrete DC is stamped per-character in
    // the resolver via `unarmedStrikeSaveDc`), NOT the 2014 STR contest.
    id: "base-grapple",
    name: { en: "Grapple", it: "Afferrare" },
    type: "action",
    effect: {
      en: "Unarmed Strike: Str/Dex save or Grappled",
      it: "Colpo Senz'armi: TS For/Des o Afferrato",
    },
  },
  {
    // RA-04 — 2024 Unarmed Strike option (save vs 8 + STR + PB), not a contest.
    id: "base-shove",
    name: { en: "Shove", it: "Spingere" },
    type: "action",
    effect: {
      en: "Unarmed Strike: Str/Dex save → push 5 ft or Prone",
      it: "Colpo Senz'armi: TS For/Des → 1,5 m o Prono",
    },
  },
  {
    id: "base-opportunity-attack",
    name: { en: "Opportunity Attack", it: "Attacco di Opportunità" },
    type: "reaction",
    effect: {
      en: "Enemy leaves melee reach without Disengaging",
      it: "Nemico lascia portata senza Disimpegnarsi",
    },
    trigger: { en: "enemy leaves reach", it: "nemico lascia portata" },
  },
] as const;

// ============================================================
// Resolution Functions
// ============================================================

/**
 * Resolve a tracker total formula to a concrete number.
 *
 * Formulas: "PB", "CHA", "INT", "WIS", "STR", "DEX", "CON",
 *           "level", "level*5", "PB*2", "INT*2",
 *           "floor(EXPR/N)", "ceil(EXPR/N)", "A-B", "A/N" (CQ5 — supports half-level patterns
 *             like Wizard Arcane Recovery "ceil(level/2)"),
 *           or a numeric string.
 *
 * Unknown formulas fall back to 1 but emit a dev-time console warning so data
 * typos aren't silently masked.
 */
/**
 * Per-character evaluation context for `resolveTrackerExpr`. Built ONCE in the
 * public `resolveTrackerTotal` entry point so the 6-key abilityMap is allocated
 * a single time per call tree rather than once per recursion level / per term.
 */
interface TrackerExprCtx {
  level: number;
  pb: number;
  abilityMap: Record<string, number>;
}

/**
 * Resolve a free-cast `chargesFormula` to a concrete per-rest charge count. The
 * formula is the SAME tracker-expression vocabulary `resolveTrackerTotal`
 * understands (`"PB"`, an ability code like `"WIS"`/`"INT"`, `"level"`, and the
 * arithmetic forms) — so a Star-Map / Misty-Wanderer / Mapping-Magic free cast
 * scaled by an ability modifier resolves through the one shared resolver rather
 * than a per-site literal match (single source of truth — golden rule 6). A
 * blank/absent formula falls back to the grant's fixed `chargesPerRest`.
 */
export function resolveChargesFormula(
  formula: string | undefined,
  chargesPerRest: number,
  character: CharacterDoc
): number {
  if (!formula) return chargesPerRest;
  // LATENT (B2 lesson): this passes NO `scalingLevel`, so a `"level"` term resolves
  // on the TOTAL character level. That is correct for every shipped `chargesFormula`
  // (race/feat/subclass free casts, which scale on character level by RAW). If a
  // MULTICLASS magic-item charge formula ever references CLASS level, it must resolve
  // on the OWNING-class level instead — thread `featureScalingLevel(...)` as the
  // 3rd arg here, exactly as `resolveTrackerTotal` already does for class trackers.
  // No shipped item triggers this today; see docs/AUTOMATION_BACKLOG.md (W11).
  return resolveTrackerTotal(formula, character);
}

/**
 * @param scalingLevel the level a tracker's `total` formula's `"level"` term
 *   scales on — the feature's OWNING-class level for a class feature
 *   (multiclass-correct, via {@link featureScalingLevel}), the TOTAL character
 *   level (the default) for a feat / race trait / custom tracker, which scale on
 *   character level by RAW. Note `pb` stays on the TOTAL character level: a
 *   character's proficiency bonus is set by total level even in a multiclass.
 */
export function resolveTrackerTotal(
  formula: string,
  character: CharacterDoc,
  scalingLevel?: number
): number {
  const { character: charData } = character;
  const characterLevel = totalLevel(charData);
  const level = scalingLevel ?? characterLevel;
  const pb = effectiveProficiencyBonus(characterLevel, charData.proficiencyBonusOverride);
  // D2 — tracker totals (a maneuver/feature save DC, a uses formula) read the
  // EFFECTIVE scores so a set-score item (Gauntlets / Headband / Amulet / Belt)
  // reaches everything that ability drives. Behaviour-preserving with no such item.
  const scores = combatAbilityScores(character);
  const abilityMap: Record<string, number> = {
    STR: abilityModifier(scores.STR),
    DEX: abilityModifier(scores.DEX),
    CON: abilityModifier(scores.CON),
    INT: abilityModifier(scores.INT),
    WIS: abilityModifier(scores.WIS),
    CHA: abilityModifier(scores.CHA),
  };
  return resolveTrackerExpr(formula, { level, pb, abilityMap });
}

/**
 * Recursive tracker-formula evaluator. Reuses the one-shot `ctx` (level / pb /
 * abilityMap) across every recursion site so per-term object allocation stays
 * flat. Behavior is identical to the previous inline implementation, including
 * every `Math.max(1, …)` per-term floor.
 */
function resolveTrackerExpr(formula: string, ctx: TrackerExprCtx): number {
  const { level, pb, abilityMap } = ctx;

  // Pure number
  const num = parseInt(formula, 10);
  if (!isNaN(num) && formula === String(num)) return num;

  if (formula in abilityMap) return Math.max(1, abilityMap[formula] ?? 0);
  if (formula === "PB") return pb;
  if (formula === "level") return level;

  // max(EXPR,EXPR) — "the modifier of the ability increased by this feat"
  // patterns where the feat offers two abilities (Inspiring Leader: character
  // level + Wis-or-Cha modifier → "level+max(WIS,CHA)"). The higher of the two
  // is the auto-default; override-first covers the off-stat pick.
  const maxMatch = formula.match(/^max\(([^,()]+),([^,()]+)\)$/);
  if (maxMatch) {
    return Math.max(
      resolveTrackerExpr((maxMatch[1] ?? "0").trim(), ctx),
      resolveTrackerExpr((maxMatch[2] ?? "0").trim(), ctx)
    );
  }

  // floor(EXPR/N) / ceil(EXPR/N) — half-level and similar patterns (CQ5).
  const roundMatch = formula.match(/^(floor|ceil)\((.+)\/(\d+)\)$/);
  if (roundMatch) {
    const op = roundMatch[1];
    const inner = resolveTrackerExpr(roundMatch[2] ?? "0", ctx);
    const divisor = parseInt(roundMatch[3] ?? "1", 10) || 1;
    const v = inner / divisor;
    return Math.max(1, op === "ceil" ? Math.ceil(v) : Math.floor(v));
  }

  // Multiplication: "level*5", "PB*2", "INT*2"
  const mulMatch = formula.match(/^(\w+)\*(\d+)$/);
  if (mulMatch) {
    const base = mulMatch[1] ?? "";
    const m = parseInt(mulMatch[2] ?? "1", 10);
    if (base === "level") return level * m;
    if (base === "PB") return pb * m;
    if (base in abilityMap) return Math.max(1, (abilityMap[base] ?? 0) * m);
  }

  /** Read a bare term ("level", "PB", "CHA", or a numeric literal). */
  function readTerm(s: string): number {
    if (s === "level") return level;
    if (s === "PB") return pb;
    if (s in abilityMap) return abilityMap[s] ?? 0;
    return parseInt(s, 10) || 0;
  }

  // Addition: "1+level", "level*2+INT", "PB+CHA", "level+INT"
  const addMatch = formula.match(/^(.+)\+(\w+)$/);
  if (addMatch) {
    const left = resolveTrackerExpr(addMatch[1] ?? "0", ctx);
    const rightVal = readTerm(addMatch[2] ?? "");
    return Math.max(1, left + rightVal);
  }

  // Subtraction: "level-1", "PB-1" (CQ5).
  // Matched after `+` and after `*` to avoid clashing with multiplication.
  const subMatch = formula.match(/^(.+)-(\w+)$/);
  if (subMatch) {
    const left = resolveTrackerExpr(subMatch[1] ?? "0", ctx);
    const rightVal = readTerm(subMatch[2] ?? "");
    return Math.max(1, left - rightVal);
  }

  // Top-level division: "level/2", "PB/3" — floored (CQ5). For ceil semantics use ceil(EXPR/N).
  const divMatch = formula.match(/^(\w+)\/(\d+)$/);
  if (divMatch) {
    const left = readTerm(divMatch[1] ?? "");
    const n = parseInt(divMatch[2] ?? "1", 10) || 1;
    return Math.max(1, Math.floor(left / n));
  }

  // CQ5 — dev-warn on fallback so SRD data typos aren't silently masked.
  if (import.meta.env.MODE !== "production") {
    console.warn(
      `[smart-tracker] Unknown tracker formula "${formula}" — falling back to 1`
    );
  }
  return 1;
}

/**
 * Resolve a Temporary-HP grant formula (`temp-hp` Grant kind) to a concrete
 * number. Pure — deterministic, NO dice, NO RNG.
 *
 * Distinct from `resolveTrackerTotal` because Temporary-HP grants always carry
 * a single "minimum of 1" floor on the WHOLE total (2024 RAW), not a per-term
 * floor. e.g. Warlock Fiend "Dark One's Blessing" = CHA modifier + Warlock
 * level (minimum 1): for a level-3 Warlock with CHA 8 (mod −1) RAW gives
 * max(1, −1 + 3) = 2, whereas a per-term-floored tracker formula would
 * wrongly give max(1, −1) + 3 = 4. So intermediate ability modifiers stay
 * signed and the floor applies once at the end.
 *
 * Supported grammar (a small superset of the common temp-HP patterns):
 *   ability mod ("CHA", "WIS", …), "PB", "level", a numeric literal,
 *   "A+B", "A-B", "N*TERM" / "TERM*N" (e.g. "2*WIS", "3*level"),
 *   and parenthesis-free chains thereof. Unknown tokens resolve to 0 (the
 *   final max(1, …) keeps the result a legal temp-HP value).
 */
export function resolveTempHp(formula: string, character: CharacterDoc): number {
  const { character: charData } = character;
  const level = totalLevel(charData);
  const pb = effectiveProficiencyBonus(level, charData.proficiencyBonusOverride);
  // D2 — temp-HP formulas (e.g. a CON-based grant) read the EFFECTIVE scores so an
  // Amulet of Health's set CON reaches them. Behaviour-preserving with no such item.
  const scores = combatAbilityScores(character);
  const abilityMap: Record<string, number> = {
    STR: abilityModifier(scores.STR),
    DEX: abilityModifier(scores.DEX),
    CON: abilityModifier(scores.CON),
    INT: abilityModifier(scores.INT),
    WIS: abilityModifier(scores.WIS),
    CHA: abilityModifier(scores.CHA),
  };

  /** A bare token, or "N*TERM" / "TERM*N" — signed, no floor. */
  function readTerm(raw: string): number {
    const s = raw.trim();
    if (s === "") return 0;
    const mul = s.match(/^(\w+)\*(\w+)$/);
    if (mul) return readToken(mul[1] ?? "") * readToken(mul[2] ?? "");
    return readToken(s);
  }
  function readToken(s: string): number {
    if (s === "level") return level;
    if (s === "PB") return pb;
    if (s in abilityMap) return abilityMap[s] ?? 0;
    const n = parseInt(s, 10);
    return isNaN(n) ? 0 : n;
  }

  // max(A,B) — substitute the higher of two terms in place (Inspiring Leader:
  // "your character level plus the modifier of the ability you increased with
  // this feat", a Wis-or-Cha pick → "max(WIS,CHA)+level"; the higher modifier
  // is the auto-default, override-first covers an off-stat pick). Signed, no
  // per-term floor — the single RAW floor still applies once at the end.
  const resolved = formula.replace(
    /max\(([^,()]+),([^,()]+)\)/g,
    (_, a: string, b: string) => String(Math.max(readTerm(a), readTerm(b)))
  );

  // Split on + / − at the top level (no parentheses in temp-HP formulas), then
  // sum the signed terms. e.g. "CHA+level" → CHA mod + level; "2*WIS" → one term.
  let total = 0;
  for (const m of resolved.matchAll(/([+-]?)\s*([^+-]+)/g)) {
    const sign = m[1] === "-" ? -1 : 1;
    total += sign * readTerm(m[2] ?? "");
  }
  return Math.max(1, total);
}

/**
 * Apply level-gated `levels[]` overrides to a TrackerSpec.
 * Returns a new spec with the highest applicable override merged in.
 */
function resolveTrackerSpec(spec: TrackerSpec, level: number): TrackerSpec {
  if (!spec.levels || spec.levels.length === 0) return spec;

  // Collect all overrides whose `from` ≤ current level, sorted ascending
  const applicable = spec.levels
    .filter((o) => level >= o.from)
    .sort((a, b) => a.from - b.from);

  if (applicable.length === 0) return spec;

  // Merge all applicable overrides into base spec (later overrides win)
  let result: TrackerSpec = { ...spec };
  for (const override of applicable) {
    result = {
      ...result,
      ...(override.total !== undefined && { total: override.total }),
      ...(override.recovery !== undefined && { recovery: override.recovery }),
      ...(override.die !== undefined && { die: override.die }),
      ...(override.shortRestRecovery !== undefined && {
        shortRestRecovery: override.shortRestRecovery,
      }),
    };
  }
  return result;
}

/**
 * Normalize an `altRecoveryCost` to `undefined` when it is the "no cost"
 * sentinel: a pool-funded `{ amount: 0 }` CLEARS the alternate recovery (the
 * documented override-clear sentinel). A slot-funded cost has no amount and
 * always applies. Returns the cost unchanged otherwise.
 */
function nonZeroAltRecovery(cost: AltRecoveryCost): AltRecoveryCost | undefined {
  if (isPoolAltRecovery(cost)) return cost.amount > 0 ? cost : undefined;
  return cost;
}

/**
 * Merge per-character `trackerOverrides` onto an already level-resolved spec.
 * Every defined override field (total / recovery / die / isPool / unit /
 * shortRestRecovery) wins over the base. Applied ON TOP of the level-resolved
 * base — do NOT re-run `resolveTrackerSpec` after this, or the feature's
 * `levels[]` would clobber a user's die/total override on a scaling tracker.
 */
function applyTrackerOverrides(
  spec: TrackerSpec,
  overrides?: Partial<TrackerData>
): TrackerSpec {
  if (!overrides) return spec;
  return {
    ...spec,
    ...(overrides.total !== undefined && { total: overrides.total }),
    ...(overrides.recovery !== undefined && { recovery: overrides.recovery }),
    ...(overrides.die !== undefined && { die: overrides.die }),
    ...(overrides.isPool !== undefined && { isPool: overrides.isPool }),
    ...(overrides.unit !== undefined && { unit: overrides.unit }),
    ...(overrides.shortRestRecovery !== undefined && {
      shortRestRecovery: overrides.shortRestRecovery,
    }),
    // Override-first for the alternate-recovery cost: a defined override wins.
    // For a pool-funded override, `{ amount: 0 }` is the documented sentinel that
    // CLEARS the inherited cost (an exhausted use can no longer be spent-
    // restored), so it maps to `undefined`. A slot-funded override always applies.
    ...(overrides.altRecoveryCost !== undefined && {
      altRecoveryCost: nonZeroAltRecovery(overrides.altRecoveryCost),
    }),
  };
}

/**
 * Unified lookup: class feature index first, then feats, then race traits.
 * Returns the feature's name, mechanics, or undefined if not found.
 */
function getSrdFeatureMechanics(
  srdId: string
): SrdClassFeatureData | SrdFeatData | RaceFeatureEntry | undefined {
  return getSrdFeatureSource(srdId);
}

/**
 * A {@link LocText} `srd` ref for one field of an SRD feature source (R6+R3 SLICE
 * 7c) — the catalogue key the codemod wrote for this class-feature / feat / race
 * trait. The engine emits these on the resolved trackers/actions; the view
 * resolves them. No display-string read (golden rule 7).
 */
function featLoc(
  src: SrdClassFeatureData | SrdFeatData | RaceFeatureEntry,
  field: string
): LocText {
  const ref = srdRefForFeatureSource(src);
  return srdText(ref.kind, ref.key, field);
}

/** A {@link LocText} `srd` ref for one field of a race trait. */
function raceTraitLoc(raceId: string, trait: SrdRaceTrait, field: string): LocText {
  return srdText("race", rawRaceTraitCatKey(raceId, trait), field);
}

/**
 * Provenance NAME ref for a damage-rider / die-modifier — the granting
 * feature/feat's ONE catalogue name (golden rule 6), so a rider token can read
 * "+2d6 (Frenzy)" by the feature's canonical title. Resolves the source id
 * through the shared feature lookup; an absent/unknown id (defensive — every SRD
 * rider carries a `sourceId`) falls back to the id literal, never a thrown
 * resolver. The view materializes it via `localizeText`.
 */
function riderSourceLoc(sourceId: string | undefined): LocText {
  if (!sourceId) return litText({ en: "Extra damage", it: "Danni extra" });
  const src = getSrdFeatureMechanics(sourceId);
  return src ? featLoc(src, "name") : customText(sourceId);
}

/**
 * The collapsed-card EFFECT ref for one SRD catalogue entry: the authored
 * one-line `summary` when the catalogue carries one (a FACT gate via
 * {@link srdEn} — the field either exists in both locales or in neither, the
 * parity guard pins that), else the full `description`. ONE chooser shared by
 * every action emitter (feat / class-feature / race-trait / item) AND the
 * subtitle-budget guard test, so the line a card shows and the line the guard
 * measures are identical by construction (golden rule 6). The guard fails CI
 * when the chosen line exceeds the presenter's `EFFECT_LINE_BUDGET` in either
 * locale — i.e. any new SRD action whose description doesn't fit MUST ship an
 * authored summary; a sliced/ellipsized subtitle is unrepresentable.
 */
export function srdEffectText(kind: SrdKind, key: string): LocText {
  return srdText(kind, key, srdEn(kind, key, "summary") ? "summary" : "description");
}

/** The composite catalogue key of a race trait's nested action. */
function raceActionKey(raceId: string, trait: SrdRaceTrait, actionIndex: number): string {
  return srdKey(
    rawRaceTraitCatKey(raceId, trait),
    "mechanics",
    "actions",
    String(actionIndex)
  );
}

/**
 * R4 — the class-progression `classSpecific` row that applies to a class FEATURE on
 * this character: the feature's OWNING class (`SrdClassFeatureData.class`) resolved
 * at the character's level IN that class (`classEntryLevel`). So a Monk Unarmored
 * Movement rider reads the Monk class level, a Rogue feature the Rogue level — RAW
 * for a multiclass character, identical to the single class for a single-class one.
 * Returns `undefined` when the feature isn't a class feature or the class is absent.
 */
export function featureClassRow(
  featureId: string,
  character: CharacterDoc
): Record<string, string | number> | undefined {
  const feat = classFeatureIndex.get(featureId);
  if (!feat) return undefined;
  const classLevel = classEntryLevel(character.character, feat.class);
  if (classLevel <= 0) return undefined;
  const table = getClassTable(feat.class);
  const row = table?.levels.find((l) => l.level === classLevel)?.classSpecific;
  // Subclass override: Circle of the Moon's Circle Forms (L3+) raises the Wild
  // Shape max Challenge Rating from the base druid cap (1/4 → 1/2 → 1) to
  // floor(Druid level / 3). The base table is subclass-agnostic, so we patch
  // the one `wildShapeMaxCR` key here on a FRESH row (never mutate the static
  // table) when the owning druid entry is Circle of the Moon. Branches on the
  // stable subclassId (golden rule 7), resolved at the druid class level.
  return moonWildShapeMaxCROverride(feat.class, classLevel, character, row);
}

/**
 * Circle of the Moon raises the Wild Shape max CR to floor(Druid level / 3) from
 * level 3 (Circle Forms), superseding the base druid cap. Returns the row with
 * only `wildShapeMaxCR` patched when the owning class is druid, the entry's
 * subclass is Circle of the Moon, and the druid level is ≥ 3; otherwise the row
 * is returned unchanged. Pure — the static class table is never mutated.
 */
function moonWildShapeMaxCROverride(
  owningClassId: string,
  classLevel: number,
  character: CharacterDoc,
  row: Record<string, string | number> | undefined
): Record<string, string | number> | undefined {
  if (owningClassId !== "druid" || classLevel < 3 || !row) return row;
  const isMoon = getClasses(character.character).some(
    (e) => e.classId === "druid" && e.subclassId === "circle-of-the-moon"
  );
  if (!isMoon) return row;
  return { ...row, wildShapeMaxCR: String(Math.floor(classLevel / 3)) };
}

/**
 * The level a level-SCALING effect borne by a source feature should resolve at:
 * a CLASS feature scales by the character's level IN its OWNING class
 * (`classEntryLevel`) — Ranger Colossus Slayer's `diceByLevel` upgrade fires at
 * Ranger level 11, not the total character level (multiclass-correct). A
 * non-class source (feat/race/item — not in `classFeatureIndex`, or a class the
 * character doesn't have) has no per-class progression, so it falls back to the
 * TOTAL character level.
 */
function featureScalingLevel(
  sourceId: string | undefined,
  character: CharacterDoc
): number {
  const feat = sourceId ? classFeatureIndex.get(sourceId) : undefined;
  if (!feat) return totalLevel(character.character);
  const classLevel = classEntryLevel(character.character, feat.class);
  return classLevel > 0 ? classLevel : totalLevel(character.character);
}

/**
 * H10 / Phase D — Compute the rider chip (if any) for a given SRD feature
 * on this character. Reads the feature's **declarative** `mechanics.rider`
 * (formerly the hard-coded `FEATURE_RIDERS` map), looks up
 * `classSpecific[sourceKey]` on the character's class-table level row,
 * and formats it per the declared `format`.
 *
 * Exported so non-tracker passive features can surface their rider
 * (e.g. Monk Unarmored Movement, Monk Martial Arts die) on the Features
 * page without needing a fake tracker.
 */
export function resolveFeatureRider(
  featureId: string,
  character: CharacterDoc
): { label: LocText; value: string } | undefined {
  const srdFeature = getSrdFeatureMechanics(featureId);
  if (!srdFeature || !("mechanics" in srdFeature)) return undefined;
  // Riders live on SrdClassFeatureData.mechanics only; feats + race traits
  // don't carry one. We narrow with `"rider" in mechanics` so the type-checker
  // accepts the conditional read across the discriminated union.
  const mechanics = srdFeature.mechanics;
  const rider = mechanics && "rider" in mechanics ? mechanics.rider : undefined;
  if (!rider) return undefined;

  // R4 — resolve against the feature's OWNING class at the character's level IN it.
  return resolveRiderFromRow(
    rider,
    featureClassRow(featureId, character),
    riderLabel(featureId)
  );
}

/**
 * The full LIST of rider chips for a feature — the primary rider PLUS any
 * `rider.extra[]` entries, each resolved from the SAME owning-class row and
 * formatted by the SAME `resolveRiderFromRow` recipe. One feature can thus
 * surface several scaling values as sibling chips (Artificer Replicate Magic
 * Item: "Plans Known N" + "Magic Items N") without a parallel widget. Each
 * resolved chip is `{ label, value }` exactly like {@link resolveFeatureRider};
 * a chip resolving to 0/undefined (not yet unlocked) is dropped. Returns `[]`
 * when the feature has no rider.
 */
export function resolveFeatureRiders(
  featureId: string,
  character: CharacterDoc
): { label: LocText; value: string }[] {
  const srdFeature = getSrdFeatureMechanics(featureId);
  if (!srdFeature || !("mechanics" in srdFeature)) return [];
  const mechanics = srdFeature.mechanics;
  const rider = mechanics && "rider" in mechanics ? mechanics.rider : undefined;
  if (!rider) return [];

  const row = featureClassRow(featureId, character);
  const chips: { label: LocText; value: string }[] = [];
  // The primary chip reads `<featureId>.mechanics.rider.label`; each extra
  // chip its own id-derived `<featureId>.mechanics.rider.<sourceKey>.label`.
  const primary = resolveRiderFromRow(rider, row, riderLabel(featureId));
  if (primary) chips.push(primary);
  for (const e of rider.extra ?? []) {
    const chip = resolveRiderFromRow(e, row, riderLabel(featureId, e.sourceKey));
    if (chip) chips.push(chip);
  }
  return chips;
}

/**
 * The `LocText` for a rider chip's label. The primary rider's label lives at
 * `<featureId>.mechanics.rider.label`; an `extra` rider keys its label by its
 * stable `sourceKey` — `<featureId>.mechanics.rider.<sourceKey>.label` (rule 7:
 * a stable id-derived key, never a display string).
 */
function riderLabel(featureId: string, sourceKey?: string): LocText {
  const key = sourceKey
    ? srdKey(featureId, "mechanics", "rider", sourceKey)
    : srdKey(featureId, "mechanics", "rider");
  return srdText("class-feature", key, "label");
}

/** One `weapon-damage-bonus` entry resolved against a concrete weapon attack. */
export interface ResolvedWeaponDamageBonus {
  /** The concrete flat bonus (a `sourceKey` already resolved to its number). */
  amount: number;
  /** Source feature id (provenance). */
  sourceId: string;
  /** Source feature NAME ref — the breakdown's display label. */
  label: LocText;
  /** True when the bonus rides a `while-active` toggle (it is currently up —
   *  an inactive toggle's grants never reach the aggregate at all). */
  whileActive: boolean;
}

/**
 * Resolve the aggregated `weapon-damage-bonus` entries against ONE weapon
 * attack: keep the scope-matching entries and resolve each `sourceKey` to its
 * number on the source feature's OWNING class table at the character's level
 * IN that class — the SAME `classSpecific` row the feature's tracker `rider`
 * chip reads (Rage Damage 2/3/4), so the chip and the damage formula resolve
 * from ONE value (issue #27, golden rule 6). An unresolvable entry is skipped
 * (declare the least — never guess a number).
 */
export function resolveWeaponDamageBonuses(
  entries: AggregatedGrants["weaponDamageBonuses"],
  character: CharacterDoc,
  opts: { attackStat: AbilityCode; isRanged: boolean; isHeavy?: boolean }
): ResolvedWeaponDamageBonus[] {
  const out: ResolvedWeaponDamageBonus[] = [];
  for (const e of entries) {
    const applies =
      e.scope === "any" ||
      (e.scope === "ranged" && opts.isRanged) ||
      (e.scope === "melee" && !opts.isRanged) ||
      (e.scope === "strength" && opts.attackStat === "STR") ||
      (e.scope === "heavy" && (opts.isHeavy ?? false));
    if (!applies) continue;
    // `amount` is a flat number, the "PB" sentinel (→ the character's
    // Proficiency Bonus — GWM Heavy Weapon Mastery's +PB), or a `sourceKey`
    // resolved against the source feature's owning class table (Rage Damage).
    let amount: number | undefined;
    if (e.amount === "PB") {
      amount = effectiveProficiencyBonus(
        totalLevel(character.character),
        character.character.proficiencyBonusOverride
      );
    } else {
      amount = e.amount;
    }
    if (amount === undefined && e.sourceKey) {
      const raw = featureClassRow(e.sourceId, character)?.[e.sourceKey];
      if (typeof raw === "number") amount = raw;
    }
    if (amount === undefined || amount === 0) continue;
    const src = getSrdFeatureMechanics(e.sourceId);
    out.push({
      amount,
      sourceId: e.sourceId,
      // The feature's catalogue name ref; an unknown source falls back to its id.
      label: src ? featLoc(src, "name") : customText(e.sourceId),
      whileActive: e.whileActiveKey !== undefined,
    });
  }
  return out;
}

/**
 * Compose a weapon row's damage-breakdown parts — the ONE place the per-source
 * composition of a weapon damage formula is assembled (combat attack rows AND
 * the inventory WeaponCard call this, so the tooltip always matches the
 * formula). Returns `[]` when a per-weapon `damageOverride` pins the figure —
 * a hand-pinned value has no engine composition to explain (override-first).
 */
export function buildWeaponDamageBreakdown(opts: {
  /** The (one-handed) damage die, e.g. "2d6". */
  damageDie: string;
  /** The weapon NAME ref — labels the die line. */
  weaponName: LocText;
  attackStat: AbilityCode;
  abilityMod: number;
  /** The bound magic enchant's +N and its item NAME ref (0/absent = none). */
  enchantBonus?: number;
  enchantName?: LocText;
  /** Resolved scope-matching `weapon-damage-bonus` entries (Rage). */
  featureBonuses?: ReadonlyArray<ResolvedWeaponDamageBonus>;
  /** A pinned per-weapon damageOverride suppresses the whole breakdown. */
  hasOverride?: boolean;
}): RawBreakdownPart[] {
  if (opts.hasOverride) return [];
  // The die row is a `loc` part whose `dice` string the tip shows verbatim
  // (it is not summed into a scalar total — damage HAS no scalar total, it is a
  // formula). The ability mod + named bonuses are signed numeric parts.
  const parts: RawBreakdownPart[] = [
    { label: { loc: opts.weaponName }, dice: opts.damageDie },
  ];
  if (opts.abilityMod !== 0) {
    parts.push(abilityPart(opts.attackStat, opts.abilityMod));
  }
  if (opts.enchantBonus && opts.enchantName) {
    parts.push(locPart(opts.enchantName, opts.enchantBonus));
  }
  for (const b of opts.featureBonuses ?? []) {
    parts.push(
      locPart(b.label, b.amount, b.whileActive ? { whileActive: true } : undefined)
    );
  }
  return parts;
}

/** One `weapon-attack-bonus` entry resolved against a concrete weapon attack —
 *  the to-hit counterpart of {@link ResolvedWeaponDamageBonus}. */
export interface ResolvedWeaponAttackBonus {
  /** The concrete to-hit bonus (Archery → +2; Sacred Weapon's +CHA mod already
   *  resolved to its number with the min floor applied). */
  amount: number;
  /** Source feature/feat id (provenance). */
  sourceId: string;
  /** Source feature NAME ref — the to-hit breakdown's display label. */
  label: LocText;
  /** True when the bonus rides a `while-active` toggle (it is currently up — an
   *  inactive toggle's grants never reach the aggregate at all). Mirrors
   *  {@link ResolvedWeaponDamageBonus.whileActive}. */
  whileActive: boolean;
}

/**
 * Resolve the aggregated `weapon-attack-bonus` entries against ONE weapon
 * attack: keep the scope-matching entries (the SAME scope predicate the attack
 * row already applies to compute `flatAtkBonus`) and attribute each to its
 * granting entity's ONE catalogue name (golden rule 6) — so the to-hit
 * breakdown labels Archery's +2 by the Archery feat's canonical name, never a
 * bespoke term. Mirrors {@link resolveWeaponDamageBonuses}; `flatAtkBonus`
 * remains `sum(amount)` so the headline can't drift from the breakdown.
 *
 * `amount` is EITHER a flat number OR the ability-derived `{ ability, min }`
 * variant (Sacred Weapon → +CHA mod, min +1) — the evaluator can't resolve the
 * latter (no scores), so it lands here and is resolved against the EFFECTIVE
 * ability scores (passed in, already computed once by the caller) with the min
 * floor clamped UP (`max(modifier, min)`, the SAME clamp `saveBonusFromAbilities`
 * applies to Aura of Protection). A resolved 0 is dropped.
 */
export function resolveWeaponAttackBonuses(
  entries: AggregatedGrants["weaponAttackBonuses"],
  opts: { isRanged: boolean; scores: Record<AbilityCode, number> }
): ResolvedWeaponAttackBonus[] {
  const out: ResolvedWeaponAttackBonus[] = [];
  for (const e of entries) {
    const applies =
      e.scope === "any" ||
      (e.scope === "ranged" && opts.isRanged) ||
      (e.scope === "melee" && !opts.isRanged);
    if (!applies) continue;
    // Flat amount, or +ability modifier clamped up to `min` (default 0).
    const amount =
      typeof e.amount === "number"
        ? e.amount
        : Math.max(abilityModifier(opts.scores[e.amount.ability]), e.amount.min ?? 0);
    if (amount === 0) continue;
    const src = getSrdFeatureMechanics(e.sourceId);
    out.push({
      amount,
      sourceId: e.sourceId,
      // The feature's catalogue name ref; an unknown source falls back to its id.
      label: src ? featLoc(src, "name") : customText(e.sourceId),
      whileActive: e.whileActiveKey !== undefined,
    });
  }
  return out;
}

/**
 * Compose a weapon row's to-hit (attack-bonus) breakdown parts — the to-hit
 * sibling of {@link buildWeaponDamageBreakdown} (issue #94). The exact source
 * values the to-hit total already sums: the attack ability modifier, the
 * Proficiency Bonus (only when proficient), each named flat bonus (Archery and
 * other fighting styles), the magic-weapon enchant +N (named by its item), and
 * the exhaustion penalty. The displayed to-hit is `breakdownTotal(parts)`, so
 * the number a player sees and the tip's decomposition are the same arithmetic
 * by construction (golden rule 6; the AC pattern). Returns `[]` when a pinned
 * per-weapon `attackBonusOverride` replaces the figure — a hand-set value has no
 * composition to explain (override-first).
 */
export function buildWeaponAttackBreakdown(opts: {
  attackStat: AbilityCode;
  abilityMod: number;
  /** Proficiency Bonus contribution (already 0 when not proficient). */
  proficiencyBonus: number;
  /** The bound magic enchant's +N and its item NAME ref (0/absent = none). */
  enchantBonus?: number;
  enchantName?: LocText;
  /** Resolved scope-matching `weapon-attack-bonus` entries (Archery, …). */
  featureBonuses?: ReadonlyArray<ResolvedWeaponAttackBonus>;
  /** Exhaustion to-hit penalty (≤ 0). */
  exhaustionPenalty?: number;
  /** A pinned per-weapon attackBonusOverride suppresses the whole breakdown. */
  hasOverride?: boolean;
}): RawBreakdownPart[] {
  if (opts.hasOverride) return [];
  const parts: RawBreakdownPart[] = [abilityPart(opts.attackStat, opts.abilityMod)];
  if (opts.proficiencyBonus !== 0) {
    parts.push(termPart("character.proficiencyBonus", opts.proficiencyBonus));
  }
  for (const b of opts.featureBonuses ?? []) {
    parts.push(
      locPart(b.label, b.amount, b.whileActive ? { whileActive: true } : undefined)
    );
  }
  if (opts.enchantBonus && opts.enchantName) {
    parts.push(locPart(opts.enchantName, opts.enchantBonus));
  }
  if (opts.exhaustionPenalty && opts.exhaustionPenalty !== 0) {
    parts.push(termPart("character.exhaustion", opts.exhaustionPenalty));
  }
  return parts;
}

/**
 * A Rogue Cunning Strike option resolved against the character — the aggregated
 * catalogue entry plus the concrete save DC. `saveDc` is `null` when the option
 * forces no save (Withdraw / Stealth Attack); otherwise it is the character's
 * Cunning Strike DC = 8 + DEX modifier + Proficiency Bonus (honoring the PB
 * override). Override-first — purely informational; the engine never deducts
 * dice or imposes effects on its own.
 */
export interface ResolvedCunningStrikeOption {
  sourceId: string;
  optionId: string;
  name: LocText;
  /** Sneak Attack dice forgone to add this effect. */
  cost: number;
  description: LocText;
  /** Ability the TARGET saves with, or `null` if the option forces no save. */
  saveAbility: AbilityCode | null;
  /** Resolved save DC, or `null` when there is no save. */
  saveDc: number | null;
  condition?: ConditionId;
}

/**
 * Resolve the Rogue Cunning Strike catalogue the character knows into display
 * rows with the concrete save DC. Aggregates every `cunning-strike-option`
 * grant (base L5 Poison/Trip/Withdraw, Devious Strikes L14, plus subclass
 * adders like Thief Supreme Sneak "Stealth Attack" and Scion "Terrify"), then
 * computes the shared DC. Pure — no session/RNG; the consumer never auto-spends
 * dice (override-first). Returns `[]` for non-Rogues / pre-L5 Rogues.
 *
 * The DC formula (rogue:main Cunning Strike) is **8 + DEX mod + PB**; the
 * `proficiencyBonusOverride` is honored so a manual PB flows through.
 *
 * `maxSimultaneous` is 2 when the character has Improved Cunning Strike (L11)
 * and 1 otherwise — the engine surfaces how many options can stack per Sneak
 * Attack so the UI/player can plan dice spend without combat-code.
 */
export function resolveCunningStrikeOptions(character: CharacterDoc): {
  options: ResolvedCunningStrikeOption[];
  maxSimultaneous: number;
} {
  const { character: charData } = character;
  const agg = evaluateGrants(
    resolveGrantSourcesForFeatures(charData.features),
    new Set(character.session.activeFeatures ?? []),
    new Map(Object.entries(character.session.grantBundleChoices ?? {}))
  );
  if (agg.cunningStrikeOptions.length === 0) {
    return { options: [], maxSimultaneous: 1 };
  }

  // Cunning Strike's save DC is a generic feature DC (8 + PB + DEX mod) — routed
  // through the shared `featureSaveDc` so it can never drift from the formula. D2 —
  // the DEX read is the EFFECTIVE score (set-score item floor applied).
  const dc = featureSaveDc(
    totalLevel(charData),
    combatAbilityScores(character).DEX,
    charData.proficiencyBonusOverride
  );

  // Stable display order: by cost ascending, then by EN name — so the cheap
  // options surface first regardless of which source contributed them.
  const options = agg.cunningStrikeOptions
    .map((o) => ({
      sourceId: o.sourceId,
      optionId: o.optionId,
      name: o.name,
      cost: o.cost,
      description: o.description,
      saveAbility: o.save ?? null,
      saveDc: o.save ? dc : null,
      ...(o.condition ? { condition: o.condition } : {}),
    }))
    // Stable order by cost, then by the stable `optionId` (golden rule 7 — the
    // engine never sorts on a display string; the view re-sorts by the localized
    // label if it must). Locale-free + strip-safe.
    .sort((a, b) => a.cost - b.cost || a.optionId.localeCompare(b.optionId));

  const hasImproved = charData.features.some(
    (f) => !("custom" in f) && f.srdId === "rogue-improved-cunning-strike"
  );

  return { options, maxSimultaneous: hasImproved ? 2 : 1 };
}

/**
 * D4 — a resolved free-cast-FROM-LIST pool the Play board's guided picker renders.
 * The player picks ONE spell from `spellIds` (a class list ≤ a level cap) and casts
 * it without a slot, debiting the `trackerId` pool (Cleric Divine Intervention →
 * any Cleric spell ≤ 5th, 1/Long Rest). `remaining` is the per-rest charges left.
 */
export interface FreeCastFromListPool {
  sourceId: string;
  trackerId: string;
  /** The eligible spell ids (class list ≤ maxSpellLevel, sorted by level then id). */
  spellIds: string[];
  maxSpellLevel: number;
  rest: "short" | "long";
  /** Per-rest charge cap (Divine Intervention = 1). */
  charges: number;
  /** Charges remaining this rest (charges − tracker used). */
  remaining: number;
  /**
   * S9 — per-spell charge cost, keyed by spell id, with a value for EVERY eligible
   * spell (default 1 — single source, golden rule 6). A feature pool is uniform 1;
   * a variable-cost item pool (Wand of Binding → Hold Monster 5 / Hold Person 2)
   * carries the real costs. The confirm debits `costBySpell[spellId]` charges and
   * the picker disables a row when `remaining < costBySpell[spellId]`.
   */
  costBySpell: Record<string, number>;
  casterAbility?: AbilityCode;
}

/**
 * Resolve every free-cast-FROM-LIST pool the character has (Cleric Divine
 * Intervention). For each `free-cast-from-list` grant, the eligible spell ids are
 * the grant's class list at level ≤ `maxSpellLevel`. The L20 Greater Divine
 * Intervention extends the SAME pool to include Wish (cleric:main, "you can cast
 * the Wish spell") — single source of truth (no separate L20 tracker). Pure — the
 * consumer (Play board) opens a picker; casting debits the tracker (override-first,
 * never auto-cast). Returns `[]` when the character has no such grant.
 */
export function resolveFreeCastFromList(character: CharacterDoc): FreeCastFromListPool[] {
  const { character: charData, session } = character;
  const agg = evaluateGrants(
    resolveAllGrantSources(charData),
    new Set(session.activeFeatures ?? []),
    new Map(Object.entries(session.grantBundleChoices ?? {}))
  );
  if (agg.freeCastFromList.length === 0) return [];

  // L20 Greater Divine Intervention adds Wish to the Cleric Divine Intervention pool.
  const hasGreaterDI = charData.features.some(
    (f) => !("custom" in f) && f.srdId === "cleric-improved-divine-intervention"
  );

  // When a pool omits `chargesPerRest`/`rest`, its cap IS the debited tracker's
  // resolved total (War God's Blessing rides the whole Channel Divinity pool —
  // 2/3/4 by level — single source of truth; golden rules 2/6). Resolved once.
  const trackerById = new Map(resolveTrackers(character).map((tr) => [tr.id, tr]));

  return agg.freeCastFromList.map((entry) => {
    // Two pool shapes: a FIXED set of named ids (War God's Blessing) or a class
    // list ≤ a level cap (Divine Intervention).
    const eligible = entry.spellIds
      ? entry.spellIds.filter((id) => spellIndex.has(id))
      : spells
          .filter(
            (s) =>
              s.level >= 1 &&
              s.level <= (entry.maxSpellLevel ?? 0) &&
              s.classes.some((c) => c.toLowerCase() === entry.spellList?.toLowerCase())
          )
          .map((s) => s.id);
    // L20 — Greater Divine Intervention's Wish addition (a 9th-level spell off the
    // Cleric list, so it isn't picked up by the class-list filter above).
    if (
      hasGreaterDI &&
      entry.sourceId === "cleric-divine-intervention" &&
      spellIndex.has("wish") &&
      !eligible.includes("wish")
    ) {
      eligible.push("wish");
    }
    // Stable order: by level then stable id (golden rule 7 — never a display string).
    eligible.sort((a, b) => {
      const la = spellIndex.get(a)?.level ?? 0;
      const lb = spellIndex.get(b)?.level ?? 0;
      return la - lb || a.localeCompare(b);
    });
    // The level cap the modal groups by: the declared cap, or (fixed set) the
    // highest level among the eligible spells.
    const maxSpellLevel =
      entry.maxSpellLevel ??
      eligible.reduce((max, id) => Math.max(max, spellIndex.get(id)?.level ?? 0), 0);
    // Charge cap + rest cadence: explicit on the pool, else inferred from the
    // debited tracker (Channel Divinity = 2/3/4; recovers on short-or-long rest).
    const tracker = trackerById.get(entry.trackerId);
    const charges = entry.chargesPerRest ?? tracker?.total ?? 1;
    const rest: "short" | "long" =
      entry.rest ?? (tracker?.recovery === "long-rest" ? "long" : "short");
    const used = session.trackers[entry.trackerId]?.used ?? 0;
    // S9 — per-spell cost for EVERY eligible spell (default 1). Feature pools carry
    // no `spellCosts`, so every entry defaults to 1 and the two existing consumers
    // are unaffected; a variable-cost item pool overlays its real per-spell costs.
    const costBySpell: Record<string, number> = {};
    for (const id of eligible) {
      costBySpell[id] = entry.spellCosts?.[id] ?? 1;
    }
    return {
      sourceId: entry.sourceId,
      trackerId: entry.trackerId,
      spellIds: eligible,
      maxSpellLevel,
      rest,
      charges,
      remaining: Math.max(0, charges - used),
      costBySpell,
      ...(entry.casterAbility ? { casterAbility: entry.casterAbility } : {}),
    };
  });
}

/** Exhaustiveness guard local to this pure module (do NOT import the
 * cost-engine one — that would pull combat-engine into the tracker module
 * and trip the pure-modules-guard test). */
function assertNever(x: never): never {
  throw new Error(`Unhandled rider format: ${String(x)}`);
}

/**
 * Format a feature rider from an already-resolved `classSpecific` map. Pure —
 * takes the precomputed per-level map so the caller can hoist the class-id
 * resolution + table lookup + level-row find out of a per-tracker loop. The
 * `format` switch is exhaustive: a future 4th `format` value becomes a compile
 * error rather than silently rendering as passthrough.
 */
function resolveRiderFromRow(
  rider: { sourceKey: string; format: "additive" | "feet" | "passthrough" },
  classSpecific: Record<string, number | string> | undefined,
  label: LocText
): { label: LocText; value: string } | undefined {
  const raw = classSpecific?.[rider.sourceKey];

  // classSpecific entries are typed `number | string`. Numbers are formatted
  // per the declared format; strings are passed through as-is (the display
  // value IS the string, e.g. martialArtsDie = "d8").
  if (typeof raw === "number") {
    // 0 means "not yet unlocked" (e.g. Monk Unarmored Movement at L1) → hide.
    if (raw === 0) return undefined;
    let value: string;
    switch (rider.format) {
      case "additive":
        value = `+${raw}`;
        break;
      case "feet":
        value = `+${raw} ft`;
        break;
      case "passthrough":
        value = `${raw}`;
        break;
      default:
        value = assertNever(rider.format);
    }
    return { label, value };
  }
  if (typeof raw === "string") {
    return { label, value: raw };
  }
  return undefined;
}

/**
 * Sum every active speed bonus granted by feature riders whose
 * `appliesTo === "speed"`. Reads the per-level classSpecific value from
 * each feature's source class table — so the sheet header's displayed
 * Speed picks up Monk Unarmored Movement's +10/+15/+20/+25/+30 ft tier
 * automatically as the character levels up, with no Monk-specific code
 * in the consumer.
 */
export function resolveActiveSpeedRiderBonus(character: CharacterDoc): number {
  let total = 0;
  for (const f of character.character.features) {
    if ("custom" in f) continue;
    const srdFeature = classFeatureIndex.get(f.srdId);
    if (!srdFeature?.mechanics) continue;
    const rider =
      "rider" in srdFeature.mechanics ? srdFeature.mechanics.rider : undefined;
    if (rider?.appliesTo !== "speed") continue;
    // R4 — read each rider's tier from its OWNING class at the character's level IN
    // that class (a multiclass Monk's Unarmored Movement uses the Monk level).
    const raw = featureClassRow(f.srdId, character)?.[rider.sourceKey];
    if (typeof raw === "number" && raw > 0) total += raw;
  }
  return total;
}

/**
 * Extract all resolved trackers for a character.
 * Reads mechanics.tracker from each SRD feature referenced by the character.
 */
export function resolveTrackers(character: CharacterDoc): RawResolvedTracker[] {
  const { character: charData } = character;

  // Total character level — the fallback scaling level for feats / race-trait
  // trackers (a class feature scales by its OWNING class level, resolved per
  // feature in the loop via `featureClassRow`).
  const level = totalLevel(charData);

  // Coordinator: feature-derived trackers (custom + SRD, with the cross-feature
  // alternate-recovery overlay) then race-trait trackers — same order the
  // monolith emitted (docs/ARCHITECTURE.md).
  //
  // Dedup by STABLE tracker id (first-emission-wins, order preserved) — the SAME
  // by-construction invariant `resolveActions` enforces (golden rule 7). A
  // tracker id (the feature srdId, the `race:<id>:<trait.id>` session id) names
  // ONE resource pool; two emissions are the SAME pool surfaced twice (an
  // over-declared doc whose stored `features[]` hand-declares a race-trait pool
  // the engine already auto-grants → the "Adrenaline Rush appears twice in the
  // rail" report). One pip row per distinct id can never reach the rail.
  const seen = new Set<string>();
  const out: RawResolvedTracker[] = [];
  for (const t of [
    ...resolveSrdTrackers(character),
    ...resolveRaceTrackers(character, level),
    ...resolveFreeCastItemTrackers(character),
    ...resolveFreeCastFeatTrackers(character),
  ]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

/**
 * The largest `free-cast-spell` per-rest charge count on a grant list — a
 * charged magic item's charge-pool CAP (multiple grants on one item share the
 * one pool, first-charge-count wins). ONE derivation shared by the rail's
 * item tracker (`resolveFreeCastItemTrackers`) and the Inventory row's charge
 * display, so the two surfaces can never disagree (golden rule 6). Returns 0
 * when the grants carry no pool.
 */
export function freeCastItemChargeMax(grants: ReadonlyArray<Grant> | undefined): number {
  let charges = 0;
  for (const g of grants ?? []) {
    // A single-fixed-spell wand's `free-cast-spell` pool OR a multi-spell item's
    // `free-cast-from-list` pool (Wand of Binding / Fear, Ring of Animal Influence,
    // Staff of Charming) — both key their SHARED charge pool by the item id, so a
    // charged multi-spell item surfaces its pool row the same way (S9).
    const perRest =
      g.type === "free-cast-spell"
        ? g.chargesPerRest
        : g.type === "free-cast-from-list"
          ? (g.chargesPerRest ?? 0)
          : 0;
    if (perRest > charges) charges = perRest;
  }
  return charges;
}

/**
 * S9 — CHARGE trackers for equipped charged magic items (Wand of Magic
 * Missiles, Staff of Healing, …). A charged item carries a `free-cast-spell`
 * grant whose implicit per-rest counter (`chargesPerRest`) IS the item's
 * charge pool; that counter is already created+debited by the cast flow
 * (`freeCastSourcesForSpell` + the cost-engine `free-cast` op keyed by the
 * source id), but it never surfaced in the rail. This emits ONE resolved
 * tracker per such grant, keyed by the ITEM id (the same id the cast debits),
 * so the charge pool shows + is editable in Resources with zero new state.
 *
 * Walks ONLY equipped, attunement-satisfied magic-item sources (the same gate
 * `resolveGrantSourcesForEquipment` applies for every other item effect), so
 * an unequipped wand contributes no phantom row. Recovery is `dawn` (charged
 * items regain at dawn) — informational; the engine never auto-refills.
 * Deduped by item id at the caller; multiple grants on one item (rare) share
 * the one pool, first-charge-count wins.
 */
function resolveFreeCastItemTrackers(character: CharacterDoc): RawResolvedTracker[] {
  const out: RawResolvedTracker[] = [];
  const seen = new Set<string>();
  for (const source of resolveGrantSourcesForEquipment(character.character.equipment)) {
    if (source.ref?.kind !== "magic-item") continue;
    if (seen.has(source.id)) continue;
    const charges = freeCastItemChargeMax(source.grants);
    if (charges <= 0) continue;
    seen.add(source.id);
    out.push({
      id: source.id,
      // The charge pool's label is the magic item's own name (single source —
      // the rail and the cast row attribute the same item, golden rule 6).
      label: srdText("magic-item", source.id, "name"),
      total: charges,
      recovery: "dawn",
      isPool: true,
      // No raw `unit`: the rail falls back to the localized "uses"/usesWord word
      // (a charge IS a use of the pool) — keeps the unit i18n-clean (no English
      // leak) and consistent with every other pool row.
      used: character.session.trackers[source.id]?.used ?? 0,
    });
  }
  return out;
}

/**
 * S9 — the item→multi-spell-pool ACTION bridge. A charged magic item that casts ONE
 * OF several spells from a shared charge pool (Wand of Binding / Wand of Fear, Ring
 * of Animal Influence, Staff of Charming) carries a `free-cast-from-list` grant but
 * NO `mechanics.actions`, so — unlike a class feature — its pool never surfaces a
 * Play-board card. This emits ONE `RawResolvedAction` per such equipped, attunement-
 * satisfied item, keyed `item-cast-<itemId>` with `costTracker = <itemId>` (the SAME
 * item-charge tracker `resolveFreeCastItemTrackers` surfaces and the cast debits). The
 * card routes through the EXISTING `costTracker`→`free-cast-from-list` picker seam
 * (`TurnEconomyProvider.handleSelect` → `DivineInterventionModal`), so no new picker
 * is built (golden rule 3). Walks the SAME equipped/attuned gate as every other item
 * effect; an unattuned/unequipped item contributes no card.
 */
function resolveItemPoolCastActions(character: CharacterDoc): RawResolvedAction[] {
  const { session } = character;
  const pinnedSet = new Set(session.pinnedActions);
  const out: RawResolvedAction[] = [];
  const seen = new Set<string>();
  for (const source of resolveGrantSourcesForEquipment(character.character.equipment)) {
    if (source.ref?.kind !== "magic-item") continue;
    if (seen.has(source.id)) continue;
    const hasPool = (source.grants ?? []).some((g) => g.type === "free-cast-from-list");
    if (!hasPool) continue;
    const charges = freeCastItemChargeMax(source.grants);
    if (charges <= 0) continue;
    seen.add(source.id);
    const used = session.trackers[source.id]?.used ?? 0;
    const remaining = Math.max(0, charges - used);
    const id = `item-cast-${source.id}`;
    out.push({
      id,
      // The card title is the item's own name (single source — the rail row, the
      // cast action, and the picker rubric all attribute the same item, rule 6);
      // the description says WHAT the card does (a chrome hint, both locales).
      name: srdText("magic-item", source.id, "name"),
      description: uiText("combat.itemPoolCastActionHint"),
      type: "action",
      // Not a real spell/weapon row — a pool picker opener, like the Divine
      // Intervention feature action it reuses.
      source: "feature",
      spellLevel: null,
      concentration: false,
      // The pool spends item CHARGES, never a spell slot.
      costsSlot: false,
      costTracker: source.id,
      costTrackerIsPool: true,
      pinned: pinnedSet.has(id),
      defaultPinned: false,
      // The charge pool shown as the card's uses chip (isPool → the rail-style pool
      // display); `current <= 0` greys the card via `isDepletedAction`.
      summary: { uses: { current: remaining, total: charges, isPool: true } },
    });
  }
  return out;
}

/**
 * One feat/feature/species free-cast spell, resolved to its INDEPENDENT per-spell
 * tracker spec. The single iterator that drives BOTH the visible rail row
 * (`resolveFreeCastFeatTrackers`) and the short-rest recovery map
 * (`getShortRestRecoveries`) — so the row, the cap gate (spell-cast-sources), the
 * spend (characterStore) and the recovery can never desync on the `${featId}:
 * ${spellId}` key (the lifecycle desync risk).
 *
 * Two origins, both keyed `${featId}:${spellId}`:
 *  (a) FIXED `free-cast-spell` grants on a feat/feature/species source (Fey-Touched
 *      Misty Step, a heritage feat's granted spells, Magic Initiate's spell once
 *      its grant is modeled) — NOT magic items (their shared charge pool is
 *      `resolveFreeCastItemTrackers`).
 *  (b) CHOSEN free-cast spells (the player's div/ench pick) — stamped on the spell
 *      ref's `freeCastSource` (already `${featId}:${spellId}` at pick time), so
 *      resolved from `character.spells`, not from a grant.
 */
interface FeatFreeCastSpec {
  /** The per-spell tracker key `${featId}:${spellId}` every consumer debits. */
  id: string;
  /** The granting feat/feature id (the source-name tooltip). */
  sourceId: string;
  /** The free-cast spell id (the row label). */
  spellId: string;
  total: number;
  rest: "short" | "long";
}

function forEachFeatFreeCast(
  character: CharacterDoc,
  cb: (spec: FeatFreeCastSpec) => void
): void {
  const charData = character.character;
  const level = totalLevel(charData);
  const seen = new Set<string>();

  // (a) Fixed free-cast-spell grants on MULTI-free-cast sources only — feats,
  //     class features, species traits whose tracker we replace with per-spell
  //     rows. A SINGLE-free-cast source keeps its own `mechanics.tracker` (bare
  //     key), so it is NOT re-emitted here (that would phantom-duplicate it).
  for (const source of [
    ...resolveGrantSourcesForFeatures(charData.features),
    ...resolveGrantSourcesForRace(charData.race),
  ]) {
    if (source.ref?.kind === "magic-item") continue;
    if (countTopLevelFreeCasts(source.grants) < 2) continue;
    for (const g of source.grants ?? []) {
      if (g.type !== "free-cast-spell") continue;
      if (g.minLevel != null && level < g.minLevel) continue;
      const id = `${source.id}:${g.spellId}`;
      if (seen.has(id)) continue;
      const total = resolveChargesFormula(g.chargesFormula, g.chargesPerRest, character);
      if (total <= 0) continue;
      seen.add(id);
      cb({ id, sourceId: source.id, spellId: g.spellId, total, rest: g.rest });
    }
  }

  // (b) Chosen free-cast spells (the player's pick). Only the MULTI case is a
  //     derived row — its stamp is the suffixed `${featId}:${spellId}` key (it has
  //     a `:`). A single-chosen feat (Genie Magic, …) stamps the bare feat id and
  //     keeps its own `mechanics.tracker`, so skip those.
  for (const ref of charData.spells) {
    if ("custom" in ref || !ref.freeCastSource) continue;
    const { sourceId: id, usesPerRest, rest } = ref.freeCastSource;
    if (!id.includes(":") || seen.has(id) || usesPerRest <= 0) continue;
    seen.add(id);
    cb({
      id,
      sourceId: id.split(":")[0] ?? id,
      spellId: ref.srdId,
      total: usesPerRest,
      rest,
    });
  }
}

/**
 * Visible rail rows for every feat/feature/species free-cast spell — ONE
 * INDEPENDENT pip row per spell (RAW "cast EACH of these spells once per rest"),
 * DERIVED from the grants/stamps (golden rules 2 + 6) rather than a hand-declared
 * `mechanics.tracker` that mirrored "how many free-casts" by hand (which collapsed
 * two spells onto one shared 0/2 pool where casting either locked both). The
 * generalization of `resolveFreeCastItemTrackers` to feats — same RawResolvedTracker
 * shape, same debit key, no new tracker concept. Row label = the SPELL name; the
 * granting feat name rides along as the hover tooltip (`description`).
 */
export function resolveFreeCastFeatTrackers(
  character: CharacterDoc
): RawResolvedTracker[] {
  const out: RawResolvedTracker[] = [];
  forEachFeatFreeCast(character, (fc) => {
    const src = getSrdFeatureMechanics(fc.sourceId);
    out.push({
      id: fc.id,
      label: srdText("spell", fc.spellId, "name"),
      ...(src ? { description: featLoc(src, "name") } : {}),
      total: fc.total,
      recovery: fc.rest === "short" ? "short-rest" : "long-rest",
      isPool: false,
      used: character.session.trackers[fc.id]?.used ?? 0,
    });
  });
  return out;
}

/**
 * Resolve the cross-feature alternate-recovery overlay for one SRD feature's
 * tracker: a `tracker-alt-recovery` grant (Sorcery Incarnate → Innate Sorcery)
 * indexed by target id wins over the tracker's own inline `altRecoveryCost` (the
 * self-contained Sorcerer trackers). Returns `undefined` when neither applies.
 */
function resolveTrackerWithAltRecovery(
  srdFeatureId: string,
  inlineCost: AltRecoveryCost | undefined,
  altRecoveryByTarget: Map<string, { amount: number; fromTracker: string }>
): AltRecoveryCost | undefined {
  return altRecoveryByTarget.get(srdFeatureId) ?? inlineCost;
}

/**
 * Feature-derived trackers: inline custom-feature trackers + SRD class-feature /
 * feat trackers (with multiclass-correct class-level scaling, overrides, the
 * cross-feature alternate-recovery overlay, riders, and `extraTrackers`). Mirrors
 * the original `features[]` loop verbatim — same emit order.
 */
function resolveSrdTrackers(character: CharacterDoc): RawResolvedTracker[] {
  const { character: charData, session } = character;
  const trackers: RawResolvedTracker[] = [];

  // Cross-feature alternate-recovery grants (Sorcery Incarnate L7 declares the
  // "spend 2 Sorcery Points" gate on the L1 Innate Sorcery tracker). Evaluate
  // the aggregate once and index by target tracker id (last grant wins) so the
  // per-tracker loop can overlay the alternate cost onto its target.
  const altRecoveryByTarget = new Map<string, { amount: number; fromTracker: string }>();
  for (const entry of evaluateGrants(
    resolveGrantSourcesForFeatures(charData.features),
    new Set(session.activeFeatures ?? []),
    new Map(Object.entries(session.grantBundleChoices ?? {}))
  ).trackerAltRecoveries) {
    altRecoveryByTarget.set(entry.targetTracker, {
      amount: entry.amount,
      fromTracker: entry.fromTracker,
    });
  }

  for (const featureRef of charData.features) {
    if ("custom" in featureRef) {
      // Custom features with inline trackers
      if (featureRef.trackers) {
        for (const t of featureRef.trackers) {
          trackers.push({
            id: t.id,
            // Custom-feature trackers carry a single user string (no translation).
            label: customText(t.label),
            total: resolveTrackerTotal(t.total, character),
            recovery: t.recovery,
            die: t.die,
            isPool: t.isPool,
            unit: t.unit,
            ...(t.altRecoveryCost &&
              nonZeroAltRecovery(t.altRecoveryCost) && {
                altRecoveryCost: t.altRecoveryCost,
              }),
            used: session.trackers[t.id]?.used ?? 0,
          });
        }
      }
      continue;
    }

    // SRD feature — look up in class feature index, then feats
    const srdFeature = getSrdFeatureMechanics(featureRef.srdId);
    if (!srdFeature?.mechanics?.tracker) continue;

    // B2 — scale a CLASS feature's tracker (both its `levels[]` gating AND its
    // `total` formula's `"level"` term) by the character's level IN that
    // feature's OWNING class (Bardic Inspiration scales with Bard level, not
    // total); a feat / race trait has no class entry, so it falls back to the
    // total level. ONE shared resolver — `featureScalingLevel` — fed to BOTH
    // `resolveTrackerSpec` and `resolveTrackerTotal`, so the rail, the action
    // card, and short-rest recovery can't disagree (golden rule 6).
    const scalingLevel = featureScalingLevel(featureRef.srdId, character);
    const baseTracker = resolveTrackerSpec(srdFeature.mechanics.tracker, scalingLevel);
    const tracker = applyTrackerOverrides(baseTracker, featureRef.trackerOverrides);

    const resolvedTotal = resolveTrackerTotal(tracker.total, character, scalingLevel);
    // Level-gated features (e.g. a species revelation trait, available
    // from L3) use `total: "0"` at the base + a `levels[]` entry that
    // promotes to a positive number once the threshold is reached. Skip
    // emitting the tracker entirely when it resolves to 0 so the UI
    // doesn't render a phantom "0/0" row at lower levels.
    if (resolvedTotal <= 0) continue;

    // Resolve the rider from the feature's OWNING class row (R4 — multiclass-correct;
    // single-class reduces to the same primary row). The rider lives on
    // SrdClassFeatureData.mechanics only.
    const riderSpec =
      "rider" in srdFeature.mechanics ? srdFeature.mechanics.rider : undefined;
    const rider = riderSpec
      ? resolveRiderFromRow(
          riderSpec,
          featureClassRow(featureRef.srdId, character),
          riderLabel(featureRef.srdId)
        )
      : undefined;

    // Alternate-recovery cost: a cross-feature `tracker-alt-recovery` grant
    // (Sorcery Incarnate → Innate Sorcery) wins over an inline
    // `TrackerSpec.altRecoveryCost`; otherwise fall back to the inline cost the
    // tracker's own feature declared (the 5 self-contained Sorcerer trackers).
    const altRecoveryCost = resolveTrackerWithAltRecovery(
      srdFeature.id,
      tracker.altRecoveryCost,
      altRecoveryByTarget
    );

    trackers.push({
      id: srdFeature.id,
      label: featLoc(srdFeature, "name"),
      description: featLoc(srdFeature, "description"),
      total: resolvedTotal,
      recovery: tracker.recovery,
      die: tracker.die,
      isPool: tracker.isPool,
      unit: tracker.unit,
      shortRestRecovery: tracker.shortRestRecovery,
      rider,
      ...(altRecoveryCost && { altRecoveryCost }),
      used: session.trackers[srdFeature.id]?.used ?? 0,
    });

    // Multi-tracker features (Psi Warrior Psionic Power → Telekinetic Movement
    // recharge gate): emit each `extraTrackers` entry as its own resolved row,
    // keyed by its OWN id so session state stays distinct from the primary pool.
    // `extraTrackers` lives on class-feature mechanics only (narrow the union).
    const extraTrackers =
      "extraTrackers" in srdFeature.mechanics
        ? (srdFeature.mechanics.extraTrackers ?? [])
        : [];
    for (const extraSpec of extraTrackers) {
      // An extra tracker rides the SAME owning class feature → same scaling level.
      const extra = resolveTrackerSpec(extraSpec, scalingLevel);
      const extraTotal = resolveTrackerTotal(extra.total, character, scalingLevel);
      if (extraTotal <= 0) continue;
      trackers.push({
        id: extraSpec.id,
        label: srdText(
          "class-feature",
          srdKey(srdFeature.id, "mechanics", "extraTrackers", extraSpec.id),
          "name"
        ),
        total: extraTotal,
        recovery: extra.recovery,
        die: extra.die,
        isPool: extra.isPool,
        unit: extra.unit,
        shortRestRecovery: extra.shortRestRecovery,
        used: session.trackers[extraSpec.id]?.used ?? 0,
      });
    }
  }

  return trackers;
}

/**
 * Race-trait trackers (Orc Adrenaline Rush = PB uses/short-or-long, Relentless
 * Endurance = 1/long). Race traits live OUTSIDE features[] — resolved via
 * resolveGrantSourcesForRace for their GRANTS — so their `mechanics.tracker`
 * never reached the features loop; surfaced here, mirroring the SRD-feature
 * branch. Keyed by the same `race:<id>:<trait.id>` id the grant pipeline +
 * session use.
 */
function resolveRaceTrackers(
  character: CharacterDoc,
  level: number
): RawResolvedTracker[] {
  const { character: charData, session } = character;
  const trackers: RawResolvedTracker[] = [];

  const race = getRace(charData.race) ?? getRace(charData.race.toLowerCase());
  if (race) {
    for (const trait of race.traits) {
      if (!trait.mechanics?.tracker) continue;
      const spec = resolveTrackerSpec(trait.mechanics.tracker, level);
      const total = resolveTrackerTotal(spec.total, character);
      if (total <= 0) continue;
      // `race:<id>:<trait.id>` — the persisted session id (live data); the third
      // segment is the trait's stable slug, never an English display name (GR 12+22).
      const id = raceTraitSessionId(race.id, trait);
      trackers.push({
        id,
        label: raceTraitLoc(race.id, trait, "name"),
        description: raceTraitLoc(race.id, trait, "description"),
        total,
        recovery: spec.recovery,
        die: spec.die,
        isPool: spec.isPool,
        unit: spec.unit,
        shortRestRecovery: spec.shortRestRecovery,
        used: session.trackers[id]?.used ?? 0,
      });
    }
  }

  return trackers;
}

/** The resolved alternate-recovery state of a single tracker for one character. */
export interface AltRecoveryState {
  /** Units spent from the pool to restore one use. */
  amount: number;
  /** The funding pool's tracker id (e.g. `"sorcerer-font-of-magic"`). */
  fromTracker: string;
  /**
   * `true` when the owning tracker is currently exhausted (no normal uses left)
   * AND the pool holds at least `amount` units — i.e. the player can pay the
   * alternate cost right now. `false` when there are still normal uses, or the
   * pool can't cover the cost.
   */
  canRestore: boolean;
  /** Remaining units in the funding pool after a hypothetical restore (≥ 0). */
  poolAfter: number;
}

/**
 * CONSUMER for the POOL-funded `alt-recovery-cost` primitive. Given a resolved
 * tracker that carries a pool-funded `altRecoveryCost`, the pool tracker it draws
 * from, and the funding pool's current remaining units, report whether an
 * exhausted use can be restored by paying the alternate cost — and what the pool
 * would hold after.
 *
 * Pure / override-first: this NEVER mutates session state and NEVER auto-spends
 * the pool. It only answers "can the player pay?" so the UI can offer the
 * "Spend N {pool} to restore" affordance. Returns `null` when the tracker has
 * no alternate cost OR its cost is slot-funded (use {@link resolveSlotAltRecovery}
 * for that). Edge cases:
 *  - tracker still has normal uses → `canRestore: false` (no need to pay yet);
 *  - pool short of `amount` → `canRestore: false`, `poolAfter` floored at 0.
 *
 * @param tracker   the owning tracker (must be the resolved `ResolvedTracker`).
 * @param poolRemaining  units left in the funding pool (pool.total − pool.used).
 */
export function resolveAltRecovery(
  tracker: Pick<ResolvedTracker, "total" | "used" | "altRecoveryCost">,
  poolRemaining: number
): AltRecoveryState | null {
  const cost = tracker.altRecoveryCost;
  if (!cost || !isPoolAltRecovery(cost)) return null;
  const remaining = tracker.total - tracker.used;
  const exhausted = remaining <= 0;
  const canAfford = poolRemaining >= cost.amount;
  return {
    amount: cost.amount,
    fromTracker: cost.fromTracker,
    canRestore: exhausted && canAfford,
    poolAfter: canAfford ? poolRemaining - cost.amount : Math.max(0, poolRemaining),
  };
}

/** The resolved slot-funded alternate-recovery state of a single tracker. */
export interface SlotAltRecoveryState {
  /** Minimum spell-slot level that can fund the restore. */
  minSlotLevel: number;
  /**
   * `true` when the owning tracker is currently exhausted (no normal uses left)
   * AND an unspent spell slot of level ≥ `minSlotLevel` exists — i.e. the player
   * can pay the alternate cost right now.
   */
  canRestore: boolean;
  /** The cheapest fundable slot level (the lowest eligible unspent slot), or
   *  `null` when none is available. */
  slotLevel: number | null;
}

/**
 * CONSUMER for the SLOT-funded `alt-recovery-cost` primitive. Given a resolved
 * tracker that carries a slot-funded `altRecoveryCost` and the list of currently
 * UNSPENT spell-slot levels, report whether an exhausted use can be restored by
 * expending an eligible slot (level ≥ `fromSpellSlot`).
 *
 * Pure / override-first: NEVER mutates session state and NEVER auto-spends a
 * slot — it only answers "can the player pay?" so the UI can offer the "spend a
 * spell slot to restore" affordance, and surfaces the cheapest eligible slot.
 * Returns `null` when the tracker has no alternate cost OR its cost is
 * pool-funded (use {@link resolveAltRecovery} for that).
 *
 * @param tracker  the owning tracker (must be the resolved `ResolvedTracker`).
 * @param availableSlotLevels  unspent spell-slot levels (any order).
 */
export function resolveSlotAltRecovery(
  tracker: Pick<ResolvedTracker, "total" | "used" | "altRecoveryCost">,
  availableSlotLevels: readonly number[]
): SlotAltRecoveryState | null {
  const cost = tracker.altRecoveryCost;
  if (!cost || !isSlotAltRecovery(cost)) return null;
  const exhausted = tracker.total - tracker.used <= 0;
  // Cheapest unspent slot of level ≥ the minimum the feature requires.
  const eligible = availableSlotLevels
    .filter((lvl) => lvl >= cost.fromSpellSlot)
    .sort((a, b) => a - b);
  const slotLevel = eligible[0] ?? null;
  return {
    minSlotLevel: cost.fromSpellSlot,
    canRestore: exhausted && slotLevel !== null,
    slotLevel,
  };
}

/**
 * Resolve a damage rider's effective dice string at a character level.
 *
 * Fixed riders (Paladin Radiant Strikes: `dice: "1d8"`, no `diceByLevel`)
 * return `dice` unchanged. Dynamic riders (Berserker Frenzy: a number of d6s
 * equal to the Rage Damage bonus) declare a level-keyed `diceByLevel` map
 * (`{ 1: "2d6", 9: "3d6", 16: "4d6" }`); we pick the entry whose threshold is
 * the highest one ≤ `level`, falling back to `dice` when no threshold applies
 * (level below the lowest key). Thresholds and ties resolve numerically — key
 * order is irrelevant.
 */
export function resolveRiderDice(
  rider: { dice?: string; diceByLevel?: Readonly<Record<number, string>> },
  level: number
): string {
  // A flat `amount: "PB"` rider (a species revelation form) carries no `dice`;
  // it never reaches the weapon consumer (it's an "attack-or-spell" rider), so the
  // empty fallback here is defensive — every weapon rider declares `dice`.
  if (!rider.diceByLevel) return rider.dice ?? "";
  let best: { from: number; dice: string } | null = null;
  for (const [key, dice] of Object.entries(rider.diceByLevel)) {
    const from = Number(key);
    if (Number.isNaN(from) || from > level) continue;
    if (!best || from > best.from) best = { from, dice };
  }
  return best ? best.dice : (rider.dice ?? "");
}

/**
 * G25 — THE one resolver for the self-contained `damage-rider`s that ride a
 * melee attack (Radiant Strikes, Colossus Slayer, Berserker Frenzy, Zealot Divine
 * Fury …), shared by BOTH the carried-weapon row AND the Monk/Bard Unarmed-Strike
 * row — so an applicable rider shows on Unarmed Strike BY CONSTRUCTION (2024 RAW:
 * a "weapon OR an Unarmed Strike" rider rides the Unarmed Strike too).
 *
 * Scope semantics (mirrors {@link AggregatedGrants.damageRiders}.appliesTo):
 *   - `"attack-or-spell"` — never a per-attack chip (a revelation form +PB rides ONE
 *     attack/spell per turn; surfaced by `resolveActiveFormRiders`). Always skipped.
 *   - `"melee-weapon"` — Melee weapon OR Unarmed Strike. Rides a melee weapon and
 *     Unarmed Strike; skips a Ranged weapon.
 *   - `"weapon"` — any WEAPON attack (melee or ranged). Does NOT ride an Unarmed
 *     Strike (it isn't a weapon).
 *   - `"one-handed-melee"` — a Melee weapon held in ONE hand (Dueling): rides a
 *     melee weapon that is NEITHER Ranged NOR a Two-Handed-property weapon, and
 *     NEVER an Unarmed Strike. A Versatile weapon qualifies via its one-handed
 *     grip (the rider rides the primary, one-handed damage; the two-handed
 *     `versatileDamage` stance is a separate display formula it doesn't touch).
 *     The "no other weapons" clause is informational — the engine can't know the
 *     live wielded set, so only the determinable grip is gated (override-first).
 *
 * `target` is the attack the riders ride: a carried `weapon` (with `isRanged`,
 * `isTwoHanded` for the one-handed-grip gate, + its own `damageType` for a
 * `"same-as-weapon"` rider) or the `unarmed` strike (its own `damageType`, e.g.
 * Bludgeoning). Pure; the engine rolls nothing. Exported for unit testing of the
 * scope semantics.
 */
export function resolveAttackDamageRiders(
  damageRiders: AggregatedGrants["damageRiders"],
  target:
    | { kind: "weapon"; isRanged: boolean; isTwoHanded?: boolean; damageType: DamageType }
    | { kind: "unarmed"; damageType: DamageType },
  character: CharacterDoc,
  scores: Record<AbilityCode, number>
): NonNullable<RawActionSummary["extraDamage"]> {
  return damageRiders
    .filter((r) => {
      if (r.appliesTo === "attack-or-spell") return false;
      if (target.kind === "unarmed") return r.appliesTo === "melee-weapon";
      // Carried weapon. "one-handed-melee" (Dueling): a melee weapon that isn't
      // Two-Handed (a Versatile weapon's one-handed grip qualifies). "melee-weapon"
      // skips ranged. "weapon" rides all.
      if (r.appliesTo === "one-handed-melee")
        return !target.isRanged && !target.isTwoHanded;
      return r.appliesTo === "weapon" || !target.isRanged;
    })
    .map((r) => {
      // Fold an optional ability modifier into the surfaced die (Psi Warrior
      // Psionic Strike: `1d6` → `1d6+3`); a +0 modifier shows the bare die. A
      // `diceByLevel` rider scales by ITS source feature's OWNING class level
      // (Ranger Colossus Slayer → Ranger 11), not the total character level.
      const dice = appendAbilityModToDice(
        resolveRiderDice(r, featureScalingLevel(r.sourceId, character)),
        r.addAbilityMod === undefined
          ? undefined
          : // D2 — effective score (set-score item floor) for the rider's ability mod.
            abilityModifier(scores[r.addAbilityMod])
      );
      return {
        dice,
        // "same-as-weapon" (Colossus Slayer) resolves to the attack's OWN damage
        // type so the UI receives a real type, never the sentinel.
        damageType: r.damageType === "same-as-weapon" ? target.damageType : r.damageType,
        oncePerTurn: r.oncePerTurn,
        // A per-hit "vs marked/cursed target" rider (Hunter's Mark, Hex) — carried
        // so the presenter labels the chip; the player applies it only when the hit
        // lands on the marked creature (never auto-summed — no modeled enemy).
        ...(r.vsMarkedTarget ? { vsMarkedTarget: r.vsMarkedTarget } : {}),
        // Each use spends a tracker (Psionic Energy Dice) — surfaced so the combat
        // UI can debit it; the engine never auto-spends (override-first).
        ...(r.resourceCost ? { resourceTrackerId: r.resourceCost.trackerId } : {}),
        // Provenance NAME ref (the source feature/feat/invocation) — the view
        // resolves it into the rider token's "(Frenzy)" attribution. A rider with
        // no `sourceId` (defensive — every SRD rider carries one) falls back to a
        // generic "extra damage" label resolved at the edge.
        source: riderSourceLoc(r.sourceId),
        // A rider gated on a `while-active` toggle that is up marks the chip as a
        // conditional, currently-active source ("· active") — same flag the
        // weapon-damage breakdown reads from `whileActiveKey`.
        ...(r.whileActiveKey ? { whileActive: true } : {}),
      };
    });
}

/**
 * Resolve the marked-target damage riders (Hex "+1d6 Necrotic vs cursed target",
 * Hunter's Mark "+1d6 Force vs marked target") that ride a SPELL ATTACK row —
 * Eldritch Blast + Hex is the canonical pair. RAW: Hex / Hunter's Mark deal their
 * extra die "each time you hit the target with an attack roll", which includes a
 * SPELL attack — not only weapon attacks. The shipped `resolveAttackDamageRiders`
 * surfaces these on WEAPON rows (they carry `appliesTo: "weapon"`); this sibling
 * surfaces the SAME riders on a spell-attack card, keyed purely off the
 * `vsMarkedTarget` flag (so the `appliesTo` scope stays weapon-only and the marked
 * chip appears on BOTH surfaces by construction, rule 6). DISPLAY-ONLY — the die
 * is NEVER auto-summed into the spell's damage (the app models no enemy, so it
 * can't know which beam hits the marked creature; the player applies it on the
 * right hit). Pure; the engine rolls nothing. Exported for unit testing.
 */
export function resolveSpellAttackMarkedRiders(
  damageRiders: AggregatedGrants["damageRiders"],
  character: CharacterDoc
): NonNullable<RawActionSummary["extraDamage"]> {
  return damageRiders.flatMap((r) => {
    // Only the marked-target riders ride a spell attack, and never the
    // "same-as-weapon" sentinel (a spell attack has no wielded weapon type). The
    // early return narrows `r.damageType` to a concrete `DamageType` below.
    if (r.vsMarkedTarget == null || r.damageType === "same-as-weapon") return [];
    return [
      {
        dice: resolveRiderDice(r, featureScalingLevel(r.sourceId, character)),
        damageType: r.damageType,
        oncePerTurn: r.oncePerTurn,
        // The "vs marked / cursed target" label the render edge shows so the
        // player applies the die only when the spell attack lands on the marked
        // creature (never auto-summed — the app models no enemy).
        vsMarkedTarget: r.vsMarkedTarget,
        source: riderSourceLoc(r.sourceId),
        ...(r.whileActiveKey ? { whileActive: true } : {}),
      },
    ];
  });
}

/**
 * Resolve the FLAG-style damage-die annotations (`floor`, `reroll-keep-higher`)
 * that apply to one weapon's own damage roll, from the aggregate's
 * `damageDieModifiers`. These are the Great Weapon Fighting "treat 1-2 as 3"
 * floor (scoped to a two-handed-capable Melee weapon) and the Savage Attacker
 * "roll twice, keep higher" reroll (any weapon attack). They are pure
 * annotations the UI shows beside the damage — the engine never rolls dice.
 *
 * The off-hand ability-mod and the Unarmed Strike modes are NOT returned here
 * (they fold into a damage formula / emit their own attack row).
 *
 * @param modifiers the aggregate's `damageDieModifiers`
 * @param weapon    `isRanged` (a Ranged weapon is excluded from melee-only
 *                  floors) and `isTwoHandedCapable` (has the Two-Handed or
 *                  Versatile property — required for the Great Weapon Fighting
 *                  floor). Both default to "not applicable" when omitted.
 * Pure: no I/O, no mutation. Exported for unit testing.
 */
export function resolveWeaponDieModifiers(
  modifiers: ReadonlyArray<DamageDieModifierEntry>,
  weapon: { isRanged: boolean; isTwoHandedCapable: boolean }
): NonNullable<RawActionSummary["dieModifiers"]> {
  const out: NonNullable<RawActionSummary["dieModifiers"]> = [];
  for (const m of modifiers) {
    if (m.mode === "floor") {
      // Great Weapon Fighting: Melee weapon held in two hands (Two-Handed or
      // Versatile property). Skip ranged weapons and weapons that can't be
      // wielded two-handed.
      if (
        m.appliesTo === "two-handed-melee" &&
        !weapon.isRanged &&
        weapon.isTwoHandedCapable
      ) {
        out.push({
          mode: "floor",
          ...(m.floorBelow !== undefined ? { floorBelow: m.floorBelow } : {}),
          ...(m.floorTo !== undefined ? { floorTo: m.floorTo } : {}),
          source: riderSourceLoc(m.sourceId),
        });
      }
    } else if (m.mode === "reroll-keep-higher") {
      // Savage Attacker: any weapon attack (melee or ranged) — "a weapon".
      if (m.appliesTo === "weapon") {
        out.push({
          mode: "reroll-keep-higher",
          ...(m.oncePerTurn !== undefined ? { oncePerTurn: m.oncePerTurn } : {}),
          source: riderSourceLoc(m.sourceId),
        });
      }
    }
  }
  return out;
}

/**
 * Resolve the Unarmed Strike attack row from an `unarmed-strike` damage-die
 * modifier (Unarmed Fighting fighting style). RAW: the Unarmed Strike deals
 * Bludgeoning = `baseDie` (1d6) + the wielder's `abilityMod` (STR) modifier,
 * upgraded to `unburdenedDie` (1d8) when not holding any weapon or Shield. Plus
 * a start-of-turn `grappleDie` (1d4) to one creature Grappled by you.
 *
 * Returns the resolved action row, or `null` when the modifier carries no
 * `unarmed-strike` mode (defensive — the caller already filters). To-hit =
 * abilityMod + PB (an Unarmed Strike is always proficient) + exhaustion penalty.
 * The "unburdened d8" and "1d4 to a Grappled creature" are surfaced as a note +
 * extra-damage chip since the engine can't know the live holding/grapple state
 * (override-first — the player applies the right die). NO dice are rolled.
 *
 * Pure: no character mutation, no I/O. Exported for unit testing.
 */
export function resolveUnarmedFightingAttack(
  mod: DamageDieModifierEntry,
  ctx: {
    abilityScores: Record<AbilityCode, number>;
    pb: number;
    exPenalty: number;
    unpinnedSet: ReadonlySet<string>;
    /** Self-contained damage riders that ride an Unarmed Strike (Zealot Divine
     *  Fury — a "melee-weapon" rider rides the Unarmed Strike too). Routed through
     *  the SAME {@link resolveAttackDamageRiders} the carried-weapon + Monk rows
     *  use (golden rule 6); omitted (or empty) → only the grapple die. */
    damageRiders?: AggregatedGrants["damageRiders"];
    character?: CharacterDoc;
  }
): RawResolvedAction | null {
  if (mod.mode !== "unarmed-strike") return null;
  const ability: AbilityCode = mod.abilityMod ?? "STR";
  const abilityMod = abilityModifier(ctx.abilityScores[ability]);
  const baseDie = mod.baseDie ?? "1d6";
  const unburdenedDie = mod.unburdenedDie ?? "1d8";
  const damageType = mod.damageType ?? "bludgeoning";
  const attackBonus = abilityMod + ctx.pb + ctx.exPenalty;
  const damage = appendAbilityModToDice(baseDie, abilityMod);
  const id = "unarmed-strike";
  // Engine-authored bilingual literal (not SRD data).
  const name: LocText = litText({ en: "Unarmed Strike", it: "Colpo Senz'armi" });
  // G25 — self-contained riders that ride this Unarmed Strike (Zealot Divine
  // Fury), via the SAME shared resolver as the carried-weapon + Monk rows
  // (golden rule 6): "melee-weapon" rides an Unarmed Strike, "weapon" does not.
  const riderDamage =
    ctx.damageRiders && ctx.character
      ? resolveAttackDamageRiders(
          ctx.damageRiders,
          { kind: "unarmed", damageType },
          ctx.character,
          ctx.abilityScores
        )
      : [];
  // The start-of-turn 1d4 to a Grappled creature is Unarmed Fighting's OWN
  // recurring extra-damage option — kept alongside any feature riders (merge,
  // never drop either).
  const extraDamage = [
    ...(mod.grappleDie
      ? [
          {
            dice: mod.grappleDie,
            damageType,
            oncePerTurn: true,
            source: riderSourceLoc(mod.sourceId),
          },
        ]
      : []),
    ...riderDamage,
  ];
  // "If you aren't holding any weapon or Shield, the d6 becomes a d8" — a live
  // holding-state condition the engine can't auto-resolve, surfaced as a note.
  const summary: RawActionSummary = {
    attackBonus,
    damage,
    damageType,
    // Melee 5 ft reach — structured; the view formats it.
    weaponRange: { kind: "melee", reachFt: 5 },
    effect: litText({
      en: `${unburdenedDie} if not holding a weapon or Shield`,
      it: `${unburdenedDie} se non impugni armi o Scudo`,
    }),
    ...(extraDamage.length > 0 ? { extraDamage } : {}),
  };
  return {
    id,
    name,
    type: "action",
    source: "weapon",
    spellLevel: null,
    concentration: false,
    summary,
    costsSlot: false,
    pinned: !ctx.unpinnedSet.has(id),
    defaultPinned: true,
  };
}

/**
 * Resolve a pact-weapon rider's effective extra-damage dice.
 *
 * Fixed riders (Lifedrinker: `1d6`, `scalesPerSlotLevel: false`) return `dice`
 * unchanged.
 *
 * Slot-cost-scaled riders (Eldritch Smite: `1d8`, `scalesPerSlotLevel: true`)
 * encode the 2024 PHB rule verbatim: "an extra **1d8** Force damage … **plus
 * another 1d8 per level of the spell slot**". The base die is dealt IN ADDITION
 * TO the per-slot-level dice, so the count is `baseCount × (slotLevel + 1)` —
 * NOT `baseCount × slotLevel`. For a Warlock the spent slot's level is the Pact
 * Magic slot level, so:
 *   slot L1 → 2d8 · L2 → 3d8 · L3 (Warlock 5) → 4d8 · L4 → 5d8 · L5 (Warlock 9) → 6d8.
 * `pactSlotLevel` ≤ 0 (no slots) degrades to the base `1d8`; the die FACE
 * (`d8`) is preserved — only the count scales.
 *
 * Pure: no character mutation, no dice rolled (only the formula STRING is
 * produced). Exported for unit testing.
 */
export function resolvePactWeaponRiderDice(
  rider: Pick<PactWeaponRider, "dice" | "scalesPerSlotLevel">,
  pactSlotLevelValue: number
): string {
  if (!rider.scalesPerSlotLevel) return rider.dice;
  const match = /^(\d+)d(\d+)$/.exec(rider.dice);
  if (!match) return rider.dice;
  const baseCount = Number(match[1]);
  const face = match[2];
  // Base die + one die per slot level → (slotLevel + 1) instances. Clamp to the
  // base die when there is no slot to spend (slot level ≤ 0).
  const slotLevel = Math.max(0, pactSlotLevelValue);
  const totalCount = baseCount * (slotLevel + 1);
  return `${totalCount}d${face}`;
}

/**
 * Resolve the player-facing damage TYPE of a pact-weapon rider, override-first.
 * A fixed-type rider (Eldritch Smite → Force) returns its type. A multi-type
 * rider (Lifedrinker → Necrotic / Psychic / Radiant) returns the player's pick
 * when it is one of the offered choices, else the first choice as the default.
 * Returns `""` only for the (data-invalid) case of no type at all.
 */
export function resolvePactWeaponRiderType(
  rider: Pick<PactWeaponRider, "damageType" | "damageTypeChoices">,
  chosen?: string | null
): string {
  if (rider.damageType) return rider.damageType;
  const choices = rider.damageTypeChoices ?? [];
  if (chosen && choices.some((t) => t === chosen)) return chosen;
  return choices[0] ?? "";
}

/**
 * The on-hit self-heal facet of the `healFromHitDie` pact-weapon rider
 * (Lifedrinker). The 2024 PHB rule: "you can EXPEND one of your Hit Point Dice
 * to roll it and regain a number of Hit Points equal to the roll plus your
 * Constitution modifier (minimum of 1 Hit Point)." So the heal is the
 * character's class Hit Die (`hitDieFace` — 8 for a Warlock → `1d8`) PLUS the
 * flat Constitution modifier, clamped to a 1-HP minimum.
 *
 * `spendsHitDie: true` records that taking the heal COSTS a Hit Die — the
 * marker the (UI-owned) renderer uses to gate the option behind an explicit
 * spend, and the reason the engine never auto-applies it (override-first: no
 * Hit Die is spent, no die is rolled here — only the formula STRING is built).
 *
 * The `+ N` clause is omitted when the Constitution modifier is 0, and rendered
 * as `- N` for a negative modifier (a low-CON character). The `min 1` floor is
 * always shown because a single Hit Die roll plus a negative modifier can fall
 * below 1. Pure: no character mutation, no dice rolled. Exported for testing.
 */
export function resolvePactWeaponRiderHeal(
  hitDieFace: number,
  conMod: number
): {
  formula: string;
  dice: string;
  abilityMod: number;
  minimum: number;
  spendsHitDie: boolean;
} {
  const dice = `1d${hitDieFace}`;
  const modClause =
    conMod === 0 ? "" : conMod > 0 ? ` + ${conMod}` : ` - ${Math.abs(conMod)}`;
  return {
    formula: `${dice}${modClause}, min 1`,
    dice,
    abilityMod: conMod,
    minimum: 1,
    spendsHitDie: true,
  };
}

/**
 * Resolve the attack rows for a feature-MANIFESTED weapon (Soulknife's Psychic
 * Blades). A manifested weapon is not in `character.weapons`, so the carried-
 * weapon loop never sees it — this turns each `manifestedWeapon` aggregate
 * entry into one (or two — main + bonus-action second blade) `ResolvedAction`
 * attack rows, computing to-hit / damage from the character's scores exactly
 * like a carried weapon:
 *
 *   • attack stat = best of STR/DEX for Finesse (ranged → DEX), unioned with any
 *     `weapon-attack-ability` grant (Bladesong-style INT) like the carried loop;
 *   • to-hit = ability mod + PB (when proficient) + exhaustion penalty;
 *   • damage = `damageDie` + ability mod (the second blade uses its smaller die);
 *   • range = melee reach / thrown / ranged string from the declared properties;
 *   • a free mastery (`masteryIsFree`) is surfaced as an `extraMasteries` chip so
 *     it lights up even when the class has no Weapon Mastery feature or its slots
 *     are full.
 *
 * Override-first: when `session.manifestedWeaponOverrides[id]` (or `…[bonusId]`)
 * pins an `attackBonus` / `damage`, those values replace the computed ones —
 * mirroring a carried weapon's `attackBonusOverride` / `damageOverride`.
 *
 * Pure: no character mutation, no dice. Exported so it can be unit-tested in
 * isolation and reused by any future manifested-weapon consumer.
 */
/**
 * A 2024 "Monk weapon": a Simple Melee weapon, or a Martial Melee weapon with the
 * Light property. Used to scope Martial Arts' DEX-for-attack to those weapons only
 * (so DEX never leaks to a Greatsword). Custom / unknown weapons → false (no SRD
 * category to classify; a custom weapon already carries its own `attackStat`).
 */
export function isMonkMeleeWeapon(weapon?: {
  weaponType?: string;
  weaponCategory?: string;
  properties?: ReadonlyArray<string>;
}): boolean {
  if (!weapon || weapon.weaponType !== "melee") return false;
  if (weapon.weaponCategory === "simple") return true;
  if (weapon.weaponCategory === "martial") {
    return (weapon.properties ?? []).some((p) => p.toLowerCase() === "light");
  }
  return false;
}

export function resolveManifestedWeaponAttacks(
  manifestedWeapons: ReadonlyArray<ManifestedWeapon>,
  ctx: {
    abilityScores: Record<AbilityCode, number>;
    classWeaponProfs: ReadonlyArray<ProficiencyToken>;
    weaponAttackAbilities: ReadonlyArray<{
      ability: AbilityCode;
      magicOnly: boolean;
      weaponScope?: "monk-melee";
    }>;
    pb: number;
    exPenalty: number;
    overrides?: Record<string, { attackBonus?: number | null; damage?: string | null }>;
    unpinnedSet: ReadonlySet<string>;
    /** Self-contained damage riders that ride this weapon. A Psychic Blade IS a
     *  weapon (RAW), so a "weapon"/"melee-weapon" rider rides it — routed through
     *  the SAME {@link resolveAttackDamageRiders} the carried-weapon row uses
     *  (golden rule 6); omitted (or empty) → no extra-damage chip. */
    damageRiders?: AggregatedGrants["damageRiders"];
    character?: CharacterDoc;
  }
): RawResolvedAction[] {
  const rows: RawResolvedAction[] = [];

  for (const mw of manifestedWeapons) {
    const properties = [...mw.properties];
    const isRanged = mw.weaponType === "ranged";

    // Attack stat through the SHARED authority (the SAME `resolveWeaponAttackStat`
    // the carried-weapon + inventory rows use — golden rule 6): ranged → DEX;
    // finesse → best of STR/DEX; Monk Martial Arts' DEX swap on Monk weapons; the
    // best of any Bladesong-style `weapon-attack-ability`.
    const attackStat: AbilityCode = resolveWeaponAttackStat({
      weaponType: isRanged ? "ranged" : "melee",
      properties,
      scores: ctx.abilityScores,
      weaponAttackAbilities: ctx.weaponAttackAbilities,
      isMonkMelee: isMonkMeleeWeapon(mw),
    });

    const mod = abilityModifier(ctx.abilityScores[attackStat]);
    const proficient =
      mw.proficient &&
      // A manifested weapon has no SRD id — only the tier/property tokens apply,
      // never a weapon-type group (golden rule 7).
      isWeaponProficient(mw.category, undefined, mw.weaponType, properties, [
        ...ctx.classWeaponProfs,
      ]);
    const computedAtkBonus = mod + (proficient ? ctx.pb : 0) + ctx.exPenalty;

    // Structured range (feet) — the view formats it (mirrors the carried loop).
    const range = buildWeaponRange(properties, { isRanged });

    // Raw property tokens AS PRINTED — the presenter localizes them.
    const displayProps = [...properties];
    // A free mastery (Psychic Blades' Vex) doesn't count against Weapon Mastery
    // picks — it IS the weapon's own, always-owned mastery, so it rides the
    // `weaponMastery` field like a picked mastery does.
    const weaponMastery = mw.mastery && mw.masteryIsFree ? mw.mastery : undefined;

    // G25 — a manifested weapon (Psychic Blade) IS a weapon (RAW), so feature
    // riders ride it via the SAME shared resolver as the carried-weapon row
    // (golden rule 6). A thrown-but-melee blade is `isRanged: false`, so a
    // "melee-weapon" rider rides it like any thrown melee weapon. Same chip on
    // both the main and the bonus-action blade (one weapon, one rider).
    const extraDamage =
      ctx.damageRiders && ctx.character
        ? resolveAttackDamageRiders(
            ctx.damageRiders,
            {
              kind: "weapon",
              isRanged,
              isTwoHanded: properties.some((p) => /\btwo-?handed\b/i.test(p)),
              damageType: mw.damageType,
            },
            ctx.character,
            ctx.abilityScores
          )
        : [];

    const mainId = `manifested-weapon-${mw.id}`;
    const mainOverride = ctx.overrides?.[mainId];
    const mainBonus = mainOverride?.attackBonus ?? computedAtkBonus;
    const mainDamage = mainOverride?.damage ?? appendAbilityModToDice(mw.damageDie, mod);

    rows.push({
      id: mainId,
      name: mw.name,
      type: "action",
      source: "weapon",
      spellLevel: null,
      concentration: false,
      summary: {
        attackBonus: mainBonus,
        damage: mainDamage,
        damageType: mw.damageType,
        weaponRange: range,
        properties: displayProps,
        weaponCategory: mw.category,
        ...(weaponMastery ? { weaponMastery } : {}),
        ...(extraDamage.length > 0 ? { extraDamage } : {}),
      },
      costsSlot: false,
      pinned: !ctx.unpinnedSet.has(mainId),
      defaultPinned: true,
    });

    // Optional second blade (Bonus Action) at the smaller die — same to-hit.
    if (mw.bonusAction) {
      const bonusId = `${mainId}-bonus`;
      const bonusOverride = ctx.overrides?.[bonusId];
      rows.push({
        id: bonusId,
        name: mw.bonusAction.name,
        type: mw.bonusAction.slot,
        source: "weapon",
        spellLevel: null,
        concentration: false,
        summary: {
          attackBonus: bonusOverride?.attackBonus ?? mainBonus,
          damage:
            bonusOverride?.damage ??
            appendAbilityModToDice(mw.bonusAction.damageDie, mod),
          damageType: mw.damageType,
          weaponRange: range,
          properties: displayProps,
          weaponCategory: mw.category,
          ...(weaponMastery ? { weaponMastery } : {}),
          ...(extraDamage.length > 0 ? { extraDamage } : {}),
        },
        costsSlot: false,
        pinned: !ctx.unpinnedSet.has(bonusId),
        defaultPinned: true,
      });
    }
  }

  return rows;
}

/**
 * Resolve the attack rows for the character's ACTIVE transformation forms (Druid
 * Wild Shape beast bite/claw, Stars Druid Starry Form attack, Artificer Armorer
 * Thunder Pulse / Lightning Launcher). A form swaps the available attacks
 * while it is lit — the AC is ALREADY swapped by a `while-active` `ac-formula`
 * grant (untouched here); this fills the matching ATTACK row. The aggregate's
 * `formAttacks` contains rows ONLY from currently-active forms (the evaluator
 * collects them inside the active `while-active` branch), so this returns the
 * form's rows while the toggle is lit and the EMPTY array when no form is active
 * — no extra gating needed in this resolver (it just maps what is active).
 *
 * To-hit / damage compute from the character's scores exactly like a carried /
 * manifested weapon:
 *   • attack stat = the form's mandated `attackAbility` (Armorer INT) when set,
 *     else ranged → DEX / Finesse → best-of STR/DEX / else STR;
 *   • to-hit = mod + PB (when proficient) + exhaustion penalty;
 *   • damage = `damageDie` + the attack mod;
 *   • range = melee reach / thrown / ranged string from the declared properties.
 *
 * Override-first: each row honours `session.manifestedWeaponOverrides[id]` (the
 * SAME session weapon-swap store the Soulknife manifested weapon uses — the
 * precedent), keyed by the stable row id `form-attack-${id}`, so a player can
 * pin custom numbers exactly like a carried weapon's override.
 *
 * Pure: no character mutation, no dice. Exported for unit testing + reuse.
 */
export function resolveFormAttacks(
  formAttacks: ReadonlyArray<FormAttack>,
  ctx: {
    /** RAW stored physical scores — what a PHYSICAL Wild Shape natural weapon (a
     *  beast's STR-keyed bite/claw, no mandated ability) attacks with. A set-score
     *  item (Gauntlets STR 19) sets YOUR Strength, but in beast form you use the
     *  FORM's body, so an item STR floor does NOT carry to a physical natural weapon. */
    abilityScores: Record<AbilityCode, number>;
    /** B7 — EFFECTIVE scores (set-score floors + additive item bonuses) — what a
     *  MENTAL / spellcasting form attack (a form-mandated `attackAbility`: Armorer's
     *  Thunder Pulse INT, Starry Form Archer WIS) uses, since those keep your own
     *  mind: a Headband of Intellect Armorer attacks at the boosted INT, like every
     *  other INT-keyed combat row (rule 6). */
    effectiveScores: Record<AbilityCode, number>;
    pb: number;
    exPenalty: number;
    /** S12b — the character level the form-attack die scales on (Stars Archer
     *  1d8→2d8 at L10 via {@link FormAttack.damageDieByLevel}). */
    level: number;
    overrides?: Record<string, { attackBonus?: number | null; damage?: string | null }>;
    unpinnedSet: ReadonlySet<string>;
  }
): RawResolvedAction[] {
  const rows: RawResolvedAction[] = [];

  for (const fa of formAttacks) {
    const properties = [...fa.properties];
    const isRanged = fa.weaponType === "ranged";
    const isFinesse = properties.some((p) => p.toLowerCase() === "finesse");

    // B7 — a form-MANDATED ability (Armorer INT, Starry WIS) is a MENTAL/spellcasting
    // form: it keeps your own mind, so it reads the EFFECTIVE scores (a Headband of
    // Intellect lifts it) like every sibling combat row. A physical natural weapon
    // (no mandated ability) uses the FORM's body → the RAW stored physical scores (an
    // item STR floor does not carry into beast form). Selected per row, NOT a blanket
    // swap — the deeper "model the beast's own STR" gap is separate (out of scope).
    const scores = fa.attackAbility ? ctx.effectiveScores : ctx.abilityScores;

    // Attack stat: a form-mandated ability (Armorer INT) wins outright; else the
    // weapon rule — ranged → DEX, finesse → best of STR/DEX, otherwise STR.
    let attackStat: AbilityCode;
    if (fa.attackAbility) {
      attackStat = fa.attackAbility;
    } else if (isRanged) {
      attackStat = "DEX";
    } else if (isFinesse) {
      attackStat =
        abilityModifier(scores.DEX) >= abilityModifier(scores.STR) ? "DEX" : "STR";
    } else {
      attackStat = "STR";
    }

    const mod = abilityModifier(scores[attackStat]);
    // A form's natural weapon is proficient BY THE FORM (a beast is proficient
    // with its natural weapons, Armorer with its model weapons, a Starry Form
    // spell attack always) — no class weapon-proficiency lookup, unlike a carried
    // weapon. `proficient: false` (a data opt-out) drops the PB.
    const proficient = fa.proficient;
    const computedAtkBonus = mod + (proficient ? ctx.pb : 0) + ctx.exPenalty;

    const range = buildWeaponRange(properties, { isRanged });
    const displayProps = [...properties];

    const rowId = `form-attack-${fa.id}`;
    const override = ctx.overrides?.[rowId];
    const atkBonus = override?.attackBonus ?? computedAtkBonus;
    // S12b — the form-attack die scales by level when a `damageDieByLevel` map is
    // present (Stars Archer 1d8→2d8 at L10), via the SAME shared "highest
    // threshold ≤ level" helper the aura + action resolvers use; `damageDie` is
    // the floor below the first threshold.
    const formDie = pickDiceByLevel(fa.damageDieByLevel, ctx.level) ?? fa.damageDie;
    const damage = override?.damage ?? appendAbilityModToDice(formDie, mod);

    rows.push({
      id: rowId,
      name: fa.name,
      type: "action",
      source: "weapon",
      spellLevel: null,
      concentration: false,
      formAttack: true,
      summary: {
        attackBonus: atkBonus,
        damage,
        damageType: fa.damageType,
        weaponRange: range,
        properties: displayProps,
        weaponCategory: fa.category,
        // A once-per-turn extra-damage rider on the form weapon (Infiltrator
        // Lightning Launcher +1d6 Lightning) surfaces as the SAME self-side
        // extra-damage chip a `damage-rider` does, sourced to the weapon's own
        // name (no modeled enemy — golden rule 21).
        ...(fa.oncePerTurnExtra
          ? {
              extraDamage: [
                {
                  dice: fa.oncePerTurnExtra.dice,
                  damageType: fa.oncePerTurnExtra.damageType,
                  oncePerTurn: true,
                  source: fa.name,
                },
              ],
            }
          : {}),
        // An on-hit self-side reminder (Guardian Disadvantage, Dreadnaught
        // push/pull) rides the one-line `effect` channel.
        ...(fa.note ? { effect: fa.note } : {}),
      },
      costsSlot: false,
      pinned: !ctx.unpinnedSet.has(rowId),
      defaultPinned: true,
    });
  }

  return rows;
}

/**
 * S7 — the attack rows of an ACTIVE Polymorph SELF-form, resolved DIRECTLY from
 * the Beast catalogue at the render edge (keeps `form-attack` unchanged). Unlike
 * a Wild-Shape `FormAttack` (whose to-hit/damage the engine derives from the
 * character's scores), a Beast form REPLACES the caster's statistics wholesale, so
 * every row is the Beast's own PRINTED value — `toHit` + `damageDice` verbatim,
 * never re-scaled. Returns `[]` when the character is not polymorphed (the common
 * case) or the stored form id is unknown. Pinned by default (a form's attacks are
 * the caster's headline actions while transformed).
 */
export function resolveBeastFormAttacks(
  session: CharacterDoc["session"],
  unpinnedSet: ReadonlySet<string>
): RawResolvedAction[] {
  const form = session.polymorphForm;
  if (!form) return [];
  const beast = getBeast(form.beastId);
  if (!beast) return [];

  return beast.attacks.map((atk, i): RawResolvedAction => {
    const rowId = `beast-attack-${beast.id}-${i}`;
    const weaponRange: WeaponRangeSpec = atk.range
      ? { kind: "ranged", nearFt: atk.range.nearFt, farFt: atk.range.farFt }
      : { kind: "melee", reachFt: atk.reachFt ?? 5 };
    return {
      id: rowId,
      name: srdText("beasts", atk.nameKey, "name"),
      type: "action",
      source: "weapon",
      spellLevel: null,
      concentration: false,
      formAttack: true,
      summary: {
        attackBonus: atk.toHit,
        damage: atk.damageDice,
        damageType: atk.damageType,
        weaponRange,
      },
      costsSlot: false,
      pinned: !unpinnedSet.has(rowId),
      defaultPinned: true,
    };
  });
}

/**
 * Resolve the attack row for a feature-CONJURED pact weapon (Warlock's Pact of
 * the Blade). Unlike a manifested weapon (a fixed profile), the pact weapon's
 * form is a player choice, so this reads the per-character `pactWeaponConfig`
 * (override-first) and falls back to a generic conjured blade:
 *
 *   • attack stat = the grant's `attackAbility` (CHA) — the pact lets you use
 *     it for attack AND damage rolls "instead of using Strength or Dexterity",
 *     so it is used outright (not best-of) for this row;
 *   • to-hit = CHA mod + PB (always proficient — the bond grants proficiency) +
 *     exhaustion penalty;
 *   • damage = the configured/`defaultDamageDie` + CHA mod;
 *   • damage type = the player's `chosenDamageType` (one of the grant's
 *     `damageTypeChoices`: Necrotic/Psychic/Radiant) if set, else the weapon's
 *     normal type (`baseDamageType` / `defaultDamageType`);
 *   • the conjure action's economy (Bonus Action) is surfaced via the grant.
 *
 * Override-first: `pactWeaponConfig[id]` can pin `weaponName`, `damageDie`,
 * `baseDamageType`, `chosenDamageType`, and full numeric `attackBonus` /
 * `damage` (mirroring a carried weapon's overrides). An out-of-catalogue
 * `chosenDamageType` is ignored (falls back to the normal type) so a stale
 * config can never produce an illegal element.
 *
 * Pact-of-the-Blade RIDERS (Eldritch Smite, Lifedrinker — the `pactWeaponRiders`
 * aggregate) fire only on a pact-weapon hit, so they attach HERE, not to every
 * weapon attack. Each becomes an `extraDamage` chip on this row (Eldritch
 * Smite's base `1d8` PLUS `1d8` per slot level scales to `(slotLevel + 1)d8` at
 * the warlock's pact-slot level — passed in as `pactSlotLevel`). Their secondary
 * clauses: Eldritch Smite's Prone surfaces in the row `effect` text;
 * Lifedrinker's on-hit self-heal (HD-spend) is MODELED as a structured
 * `summary.onHitHeal` facet (Hit Die + CON mod, min 1 — see
 * {@link resolvePactWeaponRiderHeal}). Override-first: the rider is never
 * auto-applied — it is a player-chosen on-hit option (no slot / Hit Die is
 * spent by the engine, no dice rolled).
 *
 * Pure: no character mutation, no dice. Exported for unit testing + reuse.
 */
export function resolvePactWeaponAttacks(
  pactWeapons: ReadonlyArray<PactWeapon>,
  ctx: {
    abilityScores: Record<AbilityCode, number>;
    pb: number;
    exPenalty: number;
    config?: Record<
      string,
      {
        weaponName?: string;
        damageDie?: string;
        baseDamageType?: string;
        chosenDamageType?: string | null;
        attackBonus?: number | null;
        damage?: string | null;
      }
    >;
    unpinnedSet: ReadonlySet<string>;
    /**
     * On-hit pact-weapon riders (Eldritch Smite, Lifedrinker). Empty when the
     * character has no Pact-of-the-Blade rider invocations.
     */
    riders?: ReadonlyArray<PactWeaponRider>;
    /**
     * The warlock's Pact Magic slot level (all slots share one level). Drives
     * Eldritch Smite's per-slot-level dice scaling. Defaults to 1.
     */
    pactSlotLevel?: number;
    /**
     * Per-rider chosen damage type (Lifedrinker's Necrotic/Psychic/Radiant
     * pick), keyed by rider id. Override-first; an out-of-set value falls back
     * to the rider's first offered type.
     */
    riderTypeChoices?: Record<string, string | null | undefined>;
    /**
     * The character's Constitution modifier — the flat bonus added to a
     * `healFromHitDie` rider's self-heal (Lifedrinker). Defaults to 0.
     */
    conMod?: number;
    /**
     * The character's class Hit Die face (8 for a Warlock) — the die rolled
     * (and Hit Point Die expended) by a `healFromHitDie` rider. Defaults to 8
     * (Pact of the Blade is a Warlock feature, d8).
     */
    hitDieFace?: number;
  }
): RawResolvedAction[] {
  const rows: RawResolvedAction[] = [];
  const riders = ctx.riders ?? [];
  const slotLevel = ctx.pactSlotLevel ?? 1;

  // The riders fire only with a pact weapon, so they ride EVERY pact-weapon row.
  const extraDamage = riders.map((r) => ({
    dice: resolvePactWeaponRiderDice(r, slotLevel),
    damageType: resolvePactWeaponRiderType(r, ctx.riderTypeChoices?.[r.id]),
    // Every Pact-of-the-Blade rider is "Once per turn" per the SRD.
    oncePerTurn: true,
    // Provenance — the invocation's own NAME ref (Lifedrinker / Eldritch Smite).
    source: r.name,
  }));

  // Secondary, non-damage rider clauses. `prone` stays a prose note (no
  // creature-size engine). `healFromHitDie` (Lifedrinker) is MODELED as a
  // structured on-hit self-heal facet — the heal formula (Hit Die + CON mod,
  // min 1) the (UI-owned) renderer surfaces behind an explicit Hit-Die spend.
  // Prone-rider NAME refs (Eldritch Smite) — the view composes the localized
  // "<rider>: spend a Pact Magic slot; target Prone …" note (engine can't, no
  // locale). `healFromHitDie` (Lifedrinker) stays a structured on-hit-heal facet.
  const pactProneRiders: LocText[] = [];
  let onHitHeal: RawActionSummary["onHitHeal"];
  for (const r of riders) {
    if (r.prone) {
      pactProneRiders.push(r.name);
    } else if (r.healFromHitDie && !onHitHeal) {
      // First heal rider wins (only Lifedrinker exists; the SRD never stacks two).
      // Carries the invocation NAME ref as provenance for the on-hit heal token.
      onHitHeal = {
        ...resolvePactWeaponRiderHeal(ctx.hitDieFace ?? 8, ctx.conMod ?? 0),
        source: r.name,
      };
    }
  }

  for (const pw of pactWeapons) {
    const rowId = `pact-weapon-${pw.id}`;
    const cfg = ctx.config?.[rowId];

    // The pact lets you use the spellcasting ability for attack + damage rolls
    // "instead of" STR/DEX — used outright, always with proficiency.
    const mod = abilityModifier(ctx.abilityScores[pw.attackAbility]);
    const computedAtkBonus = mod + ctx.pb + ctx.exPenalty;
    const attackBonus = cfg?.attackBonus ?? computedAtkBonus;

    const damageDie = cfg?.damageDie ?? pw.defaultDamageDie;
    const damage = cfg?.damage ?? appendAbilityModToDice(damageDie, mod);

    // Damage type: chosen elemental (must be one the grant allows) > weapon's
    // normal type (configured base) > the grant default.
    const baseType = cfg?.baseDamageType ?? pw.defaultDamageType;
    const chosen = cfg?.chosenDamageType ?? null;
    const damageType =
      chosen && pw.damageTypeChoices.some((t) => t === chosen) ? chosen : baseType;

    // A configured custom weapon name is user text (both locales); otherwise the
    // pact weapon's own SRD name ref (its EN still feeds the search via the view).
    const name: LocText = cfg?.weaponName ? customText(cfg.weaponName) : pw.name;

    rows.push({
      id: rowId,
      name,
      type: "action",
      source: "weapon",
      spellLevel: null,
      concentration: false,
      summary: {
        attackBonus,
        damage,
        damageType,
        // Pact weapons are melee (5 ft reach) — structured; view formats it.
        weaponRange: { kind: "melee", reachFt: 5 },
        ...(extraDamage.length > 0 ? { extraDamage } : {}),
        ...(onHitHeal ? { onHitHeal } : {}),
        ...(pactProneRiders.length > 0 ? { pactProneRiders } : {}),
      },
      costsSlot: false,
      pinned: !ctx.unpinnedSet.has(rowId),
      defaultPinned: true,
    });
  }

  return rows;
}

/**
 * The damage-type facet a spell exposes to the combat action summary.
 *
 *  - `single` — exactly one fixed `DamageType` (Fireball → Fire). Surfaced via
 *    the legacy `summary.damageType` string.
 *  - `multi` — several SIMULTANEOUS types (`spell.damageTypes`: Prismatic Spray,
 *    Prismatic Wall, Storm of Vengeance). All apply at once.
 *  - `choice` — a player-CHOSEN set (`spell.damageChoice`: Chromatic Orb,
 *    Dragon's Breath, Glyph of Warding Explosive Rune). The caster picks ONE.
 *  - `null` — the spell deals no typed damage.
 *
 * `damageTypes` carries the list verbatim for the `multi`/`choice` cases. Pure
 * (no character context, no I/O): the action-summary consumer and any picker UI
 * share it. Precedence: `single` wins over `multi`/`choice` if a spell sets both
 * (it shouldn't — the fields are mutually exclusive by data convention), and
 * `multi` wins over `choice` (a fixed multi-element spell is not a choice).
 */
export type SpellDamageTypeFacet =
  | { kind: "single"; damageType: DamageType }
  | { kind: "multi"; damageTypes: ReadonlyArray<DamageType> }
  | { kind: "choice"; damageTypes: ReadonlyArray<DamageType> }
  | null;

/**
 * Resolve a spell's damage-type facet from its three (mutually exclusive) data
 * fields — `damageType` (single), `damageTypes` (simultaneous multi-element),
 * `damageChoice` (player picks one). Empty arrays are treated as absent (so a
 * stray `damageTypes: []` never reports a degenerate facet). Pure helper shared
 * by the consumer + tests.
 */
export function resolveSpellDamageTypes(spell: {
  damageType?: DamageType;
  damageTypes?: ReadonlyArray<DamageType>;
  damageChoice?: ReadonlyArray<DamageType>;
}): SpellDamageTypeFacet {
  if (spell.damageType) return { kind: "single", damageType: spell.damageType };
  if (spell.damageTypes && spell.damageTypes.length > 0) {
    return { kind: "multi", damageTypes: spell.damageTypes };
  }
  if (spell.damageChoice && spell.damageChoice.length > 0) {
    return { kind: "choice", damageTypes: spell.damageChoice };
  }
  return null;
}

/**
 * Shared, once-derived context for the combat-action resolvers. `resolveActions`
 * computes this once from the character + session and threads the SAME instance
 * into each section resolver so the per-section derivations (level, PB, exhaustion
 * penalty, the pinned/unpinned id sets) are identical by construction — never
 * recomputed (and never drifting) per resolver.
 */
interface ActionResolveCtx {
  /** The character sheet shape (`character.character`). */
  charData: CharacterDoc["character"];
  /** The play-state shape (`character.session`). */
  session: CharacterDoc["session"];
  /** D2 — the EFFECTIVE ability scores (set-score item floors applied), the SINGLE
   *  source every combat-math read in the resolution tree uses for attack/damage/
   *  save/DC/cast-score. Computed once per `resolveActions` call so a Gauntlets /
   *  Headband / Amulet / Belt user's rows reflect the set score. */
  abilityScores: Record<AbilityCode, number>;
  /** Total character level (multiclass-summed) — the fallback scaling level. */
  level: number;
  /** Proficiency bonus (override-aware). */
  pb: number;
  /** Exhaustion to-hit penalty (≤ 0). */
  exPenalty: number;
  /** Ids the player explicitly pinned (non-default actions surface when present). */
  pinnedSet: Set<string>;
  /** Ids the player explicitly unpinned (default-pinned rows hidden when present). */
  unpinnedSet: Set<string>;
}

/**
 * Extract all combat actions for a character.
 * Sources: features with mechanics.actions, spells, weapons.
 *
 * Thin coordinator: derive the shared context once, then concatenate the four
 * section resolvers (feature → spell → weapon → base/temp-HP) in the SAME order
 * the monolithic implementation emitted them. The public signature and output
 * ORDER are preserved — consumers and the smart-tracker test suite must not
 * notice the internal decomposition (docs/ARCHITECTURE.md).
 */
export function resolveActions(character: CharacterDoc): RawResolvedAction[] {
  const { character: charData, session } = character;
  const level = totalLevel(charData);
  const ctx: ActionResolveCtx = {
    charData,
    session,
    // D2 — effective scores (set-score item floors) computed ONCE for the whole
    // resolution tree; every attack/damage/save/DC/cast read below uses ctx.abilityScores.
    abilityScores: combatAbilityScores(character),
    level,
    pb: effectiveProficiencyBonus(level, charData.proficiencyBonusOverride),
    exPenalty: exhaustionPenalty(session.exhaustion),
    pinnedSet: new Set(session.pinnedActions),
    unpinnedSet: new Set(session.unpinnedActions ?? []),
  };
  // Dedup by STABLE action id (golden rule 7 — never by display string). An
  // action id (`<featureId>-<type>` / `spell-<id>` / `weapon-<id>` …) uniquely
  // identifies ONE card; two emissions of the same id are the SAME action surfaced
  // twice (e.g. a feat materialized twice in `features[]` by an upstream build path,
  // the "bonus action card appears twice" report). One card per distinct id is an
  // invariant of the board BY CONSTRUCTION — first emission wins, order preserved —
  // not a render-side filter, so the duplicate can never reach any consumer.
  const seenIds = new Set<string>();
  const deduped: RawResolvedAction[] = [];
  for (const a of [
    ...resolveFeatureActions(character, ctx),
    ...resolveSpellActions(character, ctx),
    ...resolveWeaponActions(character, ctx),
    ...resolveTemporaryHpActions(character, ctx),
    // S9 — charged multi-spell items (Wand of Binding/Fear, Ring of Animal
    // Influence, Staff of Charming) surface a pool-picker cast card.
    ...resolveItemPoolCastActions(character),
  ]) {
    if (seenIds.has(a.id)) continue;
    seenIds.add(a.id);
    deduped.push(a);
  }
  return deduped;
}

/**
 * S11 — the damage type a Breath-Weapon-style action deals, DERIVED from the
 * chosen option of a `choice-grant-bundle` on the SAME source (single source of
 * truth — the damage type is declared ONCE on the ancestry's `damage-resistance`
 * grant; the action reuses it). Reads `session.grantBundleChoices[bundleKey]` →
 * that option's `damage-resistance` grant. `undefined` until the player picks
 * (no damage type then). Race traits are the only `damageTypeFromBundle` source
 * today (Dragonborn ancestry), so it scans the character's race traits.
 */
function resolveBundleDamageType(
  bundleKey: string,
  character: CharacterDoc
): DamageType | undefined {
  const chosen = character.session.grantBundleChoices?.[bundleKey];
  if (!chosen) return undefined;
  const race = getRace(character.character.race);
  for (const trait of race?.traits ?? []) {
    for (const grant of trait.grants ?? []) {
      if (grant.type !== "choice-grant-bundle" || grant.bundleKey !== bundleKey) {
        continue;
      }
      const option = grant.options.find((o) => o.id === chosen);
      const res = option?.grants.find((g) => g.type === "damage-resistance");
      if (res) return res.damageType;
    }
  }
  return undefined;
}

/**
 * S11 — resolve an action's SAVE + ATTACK halves onto its summary, SHARED by the
 * SRD-feature loop AND the race-trait loop so a save-based attack surfaces
 * identically wherever the action lives (single source of truth — golden rule 6).
 * The save half routes the DC through the one `featureSaveDc` formula (8 + PB +
 * mod, override-aware); the attack half resolves the dice at `scalingLevel` and
 * the damage type (fixed id / player-choice / ancestry-bundle-derived) onto the
 * SAME `summary.damage`/`damageType`(`/damageTypes`) a damage spell uses — so the
 * existing chip + facts recipe renders "2d10 Fire · DC N DEX" with no view code.
 */
function applySaveAttackSummary(
  summary: RawActionSummary,
  action: {
    saveAbility?: AbilityCode;
    saveDcAbility?: AbilityCode;
    attack?: ActionAttack;
  },
  character: CharacterDoc,
  ctx: ActionResolveCtx,
  scalingLevel: number
): void {
  // Save-forcing SELF-SIDE affordance: the action declares the TARGET's save
  // ability + the character ability that GOVERNS the DC. The DC routes through
  // the ONE `featureSaveDc` formula (PB derives from TOTAL level) so it can't
  // drift; the app never models the enemy (BG3 on-rails — golden rule 21).
  if (action.saveAbility && action.saveDcAbility) {
    summary.saveAbility = action.saveAbility;
    summary.saveDC = featureSaveDc(
      ctx.level,
      ctx.abilityScores[action.saveDcAbility],
      character.character.proficiencyBonusOverride
    );
  }
  // Declarative damage half (S11) — dice scale from the class/feature table at
  // the action's scaling level (golden rule 5 — scale from data, never hardcode);
  // the damage type is an id resolved at the render edge (golden rule 7).
  const attack = action.attack;
  if (attack) {
    const charData = character.character;
    // The rolled portion: a variable die COUNT (S11b — Sear Undead's WIS-many d8,
    // resolved via the SHARED helper the heal side uses), else the level-scaled
    // table, else a fixed die.
    const baseDice =
      attack.diceCount && attack.dieFace
        ? resolveDiceCount(attack.diceCount, attack.dieFace, charData, ctx.abilityScores)
        : (pickDiceByLevel(attack.diceByLevel, scalingLevel) ?? attack.dice);
    // S11b — the additive total folded into the rolled dice (Divine Spark +WIS,
    // Radiance +Cleric level), resolved to a NUMBER so the chip reads "1d8+3" /
    // "2d10+5" — never a value the player must compute (owner 2026-06-12). The
    // level additive resolves on the OWNING-class `scalingLevel` (B2 lesson).
    const bonus =
      (attack.addMod ? abilityModifier(ctx.abilityScores[attack.addMod]) : 0) +
      (attack.addLevel ? scalingLevel : 0);
    if (baseDice) {
      // `appendAbilityModToDice` is the SAME flat-fold the spell/heal formulas use.
      summary.damage = appendAbilityModToDice(baseDice, bonus);
    }
    if (attack.damageType) {
      summary.damageType = attack.damageType;
    } else if (attack.damageTypeChoices && attack.damageTypeChoices.length > 0) {
      // Player picks one each use — surface every option (the chip joins them
      // "/"); the primary `damageType` keeps the damage chip + facts row lit.
      summary.damageType = attack.damageTypeChoices[0];
      summary.damageTypes = [...attack.damageTypeChoices];
      summary.multiDamageTypeFlavor = "choice";
    } else if (attack.damageTypeFromBundle) {
      const derived = resolveBundleDamageType(attack.damageTypeFromBundle, character);
      if (derived) summary.damageType = derived;
    }
    // S11b — heal-or-damage (Divine Spark): the SAME resolved total is ALSO a heal
    // the player may apply instead. Surface BOTH chips on the one card — the heal
    // rides the existing `summary.heal` register (so it formats + applies through
    // the same seam as Second Wind), carrying the SAME `baseDice` + `bonus`. The
    // player picks one each use; the engine never chooses (override-first).
    if (attack.mode === "heal-or-damage" && baseDice) {
      summary.heal = {
        dice: baseDice,
        bonus,
        ...(attack.addMod
          ? { term: { kind: "ability-mod", ability: attack.addMod } as const }
          : {}),
      };
    }
  }
}

/** Invocation id → row, for the 1c invocation-action pass below (mirrors the
 *  `INVOCATION_BY_ID` lookup `resolve-grant-sources.ts` builds for the grant seam). */
const INVOCATION_BY_ID = new Map(SRD_INVOCATIONS.map((inv) => [inv.id, inv]));

/**
 * Section 1 + 1b + 1c — feature actions: SRD class-feature / feat
 * `mechanics.actions`, inline custom-feature actions, race-trait actions, and
 * invocation actions (which live outside `features[]`). Each row's uses/die/
 * cost is gated on its OWNING tracker (the own-feature override, the primary
 * tracker, or a cross-feature reference).
 */
function resolveFeatureActions(
  character: CharacterDoc,
  ctx: ActionResolveCtx
): RawResolvedAction[] {
  const { charData, session, pinnedSet } = ctx;
  const actions: RawResolvedAction[] = [];

  // 1. Feature actions (from mechanics.actions)
  for (const featureRef of charData.features) {
    if ("custom" in featureRef) {
      if (featureRef.actions) {
        for (const a of featureRef.actions) {
          const id = `custom-${featureRef.title}-${a.type}`;
          // Build summary from custom feature data. Custom content carries a
          // single user string (no translation); surface it in both locales so
          // the BiText contract holds.
          const summary: RawActionSummary = {};
          // Custom user text (no translation) — emit the full string; the
          // presenter's budget gate OMITS (never slices) a line that doesn't
          // fit the collapsed card, and the full text stays in the accordion.
          summary.effect = customText(a.description);
          // Check for custom trackers
          if (featureRef.trackers && featureRef.trackers.length > 0) {
            const cTracker = featureRef.trackers[0];
            if (cTracker) {
              const total = resolveTrackerTotal(cTracker.total, character);
              const used = session.trackers[cTracker.id]?.used ?? 0;
              summary.uses = {
                current: Math.max(0, total - used),
                total,
                isPool: cTracker.isPool,
                unit: cTracker.unit,
              };
              if (cTracker.die) summary.die = cTracker.die;
            }
          }
          // CQ8 — honor ActionData.costTracker / trackerCost (added in the
          // unification). If the custom action doesn't specify a costTracker
          // but the feature has trackers, fall back to the first one (mirrors
          // SRD-feature behavior).
          actions.push({
            id,
            name: customText(featureRef.title),
            type: a.type,
            source: "feature",
            spellLevel: null,
            concentration: false,
            summary,
            costsSlot: false,
            costTracker: a.costTracker ?? featureRef.trackers?.[0]?.id,
            trackerCost: a.trackerCost,
            pinned: pinnedSet.has(id),
            defaultPinned: false,
            description: customText(a.description),
          });
        }
      }
      continue;
    }

    const srdFeature = getSrdFeatureMechanics(featureRef.srdId);
    if (!srdFeature?.mechanics?.actions) continue;
    // The catalogue base key for this feature's strings (name/desc/action descs).
    const featRef = srdRefForFeatureSource(srdFeature);

    // Activation inference (issue #27 dogfood) — an SRD feature carrying BOTH
    // `mechanics.actions` AND a `while-active` grant is an ACTIVATION feature
    // (Rage, Bladesong, Innate Sorcery, Starry Form…): using its action IS
    // entering the state. Inferred from the two facts the data already
    // declares — no second declaration (declare the least). The combat commit
    // loop flips this key into `session.activeFeatures` (lighting the rail
    // chip + every while-active grant) and clears it on undo.
    let activatesKey: string | undefined;
    if ("grants" in srdFeature) {
      for (const g of srdFeature.grants ?? []) {
        if (g.type === "while-active") {
          activatesKey = g.activeKey;
          break;
        }
      }
    }

    // B2 — a CLASS feature's tracker + scaling dice scale by its OWNING-class
    // level (Wild Shape uses scale with Druid level, not the total; Divine Spark's
    // d8 count is the Cleric level); a feat / race trait falls back to the total
    // level. The SAME `featureScalingLevel` the rail + short-rest + S11 dice use.
    // The PB-derived feature save DC uses the TOTAL level (`ctx.level`) inside the
    // shared `applySaveAttackSummary`.
    const scalingLevel = featureScalingLevel(featureRef.srdId, character);
    const resolvedTracker = srdFeature.mechanics.tracker
      ? resolveTrackerSpec(srdFeature.mechanics.tracker, scalingLevel)
      : undefined;

    let actionIndex = -1;
    for (const action of srdFeature.mechanics.actions) {
      actionIndex += 1;
      const id = `${srdFeature.id}-${action.type}`;
      // Build structured summary for feature action
      const summary: RawActionSummary = {};

      // Effect = the authored one-line summary when the catalogue carries one,
      // else the description (the srdEffectText chooser — never sliced).
      // Keyed by the composite catalogue key `<featKey>.mechanics.actions.<i>`.
      const actionDescKey = srdKey(
        featRef.key,
        "mechanics",
        "actions",
        String(actionIndex)
      );
      summary.effect = srdEffectText(featRef.kind, actionDescKey);

      // Per-action NAME — a feature whose mechanics declare MULTIPLE distinct
      // actions (e.g. Polearm Master: a Bonus-Action "Pole Strike" + a Reaction
      // "Reactive Strike") names each card by its own `name` field on the action's
      // catalogue key, so the two cards read as the two SEPARATE abilities they are
      // instead of both inheriting the feat name (the "appears twice" report). The
      // name is a FACT gate via `srdEn`: present ⇒ the per-action name; absent ⇒ the
      // feature name (single-action features keep one card titled by the feature).
      const actionNameEn = srdEn(featRef.kind, actionDescKey, "name");
      const actionName: LocText = actionNameEn
        ? srdText(featRef.kind, actionDescKey, "name")
        : featLoc(srdFeature, "name");

      // `costTrackerOverride` binds THIS action to a specific tracker on its own
      // feature (Psi Warrior Telekinetic Movement → the recharge gate) instead
      // of the primary `mechanics.tracker`. Honored only when the named extra
      // tracker actually exists; otherwise the primary tracker applies (the cost
      // is never silently dropped).
      const overrideExtra =
        action.costTrackerOverride !== undefined &&
        "extraTrackers" in srdFeature.mechanics
          ? srdFeature.mechanics.extraTrackers?.find(
              (e) => e.id === action.costTrackerOverride
            )
          : undefined;

      // If a tracker exists, show uses remaining + die. The override extra wins
      // over the primary tracker for the uses/die summary.
      if (overrideExtra) {
        const extra = resolveTrackerSpec(overrideExtra, scalingLevel);
        const total = resolveTrackerTotal(extra.total, character, scalingLevel);
        const used = session.trackers[overrideExtra.id]?.used ?? 0;
        summary.uses = {
          current: Math.max(0, total - used),
          total,
          isPool: extra.isPool,
          unit: extra.unit,
        };
        if (extra.die) summary.die = extra.die;
      } else if (resolvedTracker) {
        const effectiveTracker = applyTrackerOverrides(
          resolvedTracker,
          featureRef.trackerOverrides
        );
        const total = resolveTrackerTotal(
          effectiveTracker.total,
          character,
          scalingLevel
        );
        const used = session.trackers[srdFeature.id]?.used ?? 0;
        summary.uses = {
          current: Math.max(0, total - used),
          total,
          isPool: effectiveTracker.isPool,
          unit: effectiveTracker.unit,
        };
        if (effectiveTracker.die) {
          summary.die = effectiveTracker.die;
        }
      }

      // Trigger for reactions (replaces verbose effect) — the STRUCTURED
      // `action.trigger` token (golden rule 7), localized at the render edge via
      // `combat.reactionTrigger_<token>`. No English prose is parsed: the engine
      // emits a stable id; a reaction without a token simply shows no trigger line.
      if (action.type === "reaction") {
        if (action.trigger) {
          summary.trigger = uiText(`combat.reactionTrigger_${action.trigger}`);
        }
        // Don't show effect text for reactions — trigger + name is enough
        summary.effect = undefined;
      }

      // Heal chip is DECLARATIVE — and EVALUATED here: the data carries the
      // i18n-free term (Second Wind: `1d10 + fighter class-level`) and the
      // engine, which KNOWS the class entry's level / ability mod, resolves it
      // to a number at emission (chip-compact, owner 2026-06-12: a value the
      // player must compute is a defect). The provenance term rides along for
      // the breakdown tip. No prose parsing remains (golden rules 5 + 10).
      if (action.heal) {
        summary.heal = resolveActionHeal(action.heal, charData, ctx.abilityScores);
      }

      // G23 — Tactical Mind: spend a Second Wind use to add 1d10 to a FAILED
      // ability check (refunded if the check still fails). Carried verbatim onto
      // the summary; the die is roll-entry (golden rule 21) and the presenter
      // composes the localized "spend → +1d10 to a failed check (refunded on a
      // fail)" line. The Second Wind uses + the d10 show via the `costTracker`
      // pool block below.
      if (action.checkBonus) {
        summary.checkBonus = {
          dice: action.checkBonus.dice,
          refundOnFail: action.checkBonus.refundOnFail ?? false,
        };
      }

      // G19 — Lay On Hands cure options: expend pool HP to neutralize a condition
      // (those points don't also restore HP — RAW). Level-gated cures (Restoring
      // Touch's extra conditions at Paladin 14) surface only at/above their
      // `fromLevel`, resolved on the action's OWNING-class level (the SAME
      // `scalingLevel` the tracker uses, so a low-level Paladin sees the base
      // Poisoned cure alone). Condition ids stay stable (golden rule 7) — the
      // label is localized at the render edge. The pool is never auto-debited.
      if (action.cureConditions) {
        const cures = action.cureConditions
          .filter((c) => c.fromLevel === undefined || scalingLevel >= c.fromLevel)
          .map((c) => ({ condition: c.condition, costHp: c.costHp }));
        if (cures.length > 0) summary.cureOptions = cures;
      }

      // G22 — Monk Heightened Focus (L10): spending a Focus Point on Patient
      // Defense ALSO grants Temporary HP equal to TWO rolls of the Martial Arts
      // die (RAW, monk:main). The die is roll-entry (golden rule 21 — the app
      // never rolls); it SCALES with the Monk's level, so the `classSpecific`
      // sentinel resolves against the OWNING-class table at `scalingLevel` (d8 at
      // L10 → "2d8", d10 at L11 → "2d10"). Gated by `fromLevel` on the SAME
      // owning-class level the cures use, so a Monk below L10 gets no field.
      // Override-first — a display-only formula, never auto-applied (temp HP don't
      // stack; the player enters the higher pool).
      if (
        action.tempHpRoll &&
        (action.tempHpRoll.fromLevel === undefined ||
          scalingLevel >= action.tempHpRoll.fromLevel)
      ) {
        const sentinelKey = /^classSpecific:(.+)$/.exec(action.tempHpRoll.die)?.[1];
        const die = sentinelKey
          ? featureClassRow(featureRef.srdId, character)?.[sentinelKey]
          : action.tempHpRoll.die;
        if (typeof die === "string" && die.length > 0) {
          summary.tempHpRoll = { dice: `${action.tempHpRoll.rolls}${die}` };
        }
      }

      // Save-forcing SELF-SIDE affordance (Monk Stunning Strike → CON save vs the
      // WIS-based DC) + S11 declarative save-based ATTACK (Cleric Divine Spark →
      // 1d8 Necrotic/Radiant on a CON save; Radiance of the Dawn → 2d10 Radiant on
      // a CON save). The shared resolver routes the DC through the ONE
      // `featureSaveDc` formula and the dice through the class/feature table at the
      // owning-class scaling level; the app never models the enemy (BG3 on-rails —
      // golden rule 21). Dice scale on `scalingLevel` (owning-class for a class
      // feature) — Divine Spark's d8 count is the CLERIC level, not the total.
      applySaveAttackSummary(summary, action, character, ctx, scalingLevel);

      // Determine cost tracker: an own-feature override (Telekinetic Movement
      // gate), the feature's own primary tracker, or a cross-feature reference.
      let actionCostTracker: string | undefined;
      let actionCostIsPool: boolean | undefined;
      let actionCostUnit: TrackerUnit | undefined;

      if (overrideExtra) {
        // Bound to a specific extra tracker on this feature.
        actionCostTracker = overrideExtra.id;
        actionCostIsPool = overrideExtra.isPool;
        actionCostUnit = overrideExtra.unit;
      } else if (resolvedTracker) {
        // Feature has its own tracker — use it
        actionCostTracker = srdFeature.id;
        actionCostIsPool = resolvedTracker.isPool;
        actionCostUnit = resolvedTracker.unit;
      } else if (action.costTracker) {
        // Action references another feature's tracker (e.g. monk-focus)
        actionCostTracker = action.costTracker;
        const crossFeature = getSrdFeatureMechanics(action.costTracker);
        if (crossFeature?.mechanics?.tracker) {
          actionCostIsPool = crossFeature.mechanics.tracker.isPool;
          actionCostUnit = crossFeature.mechanics.tracker.unit;
          // Also show uses remaining from the cross-referenced tracker —
          // scaled on the CROSS-REFERENCED tracker's OWNING-class level (B2),
          // not the total. A Monk 5 / Rogue 3 Flurry-of-Blows card references
          // the Focus pool: it must read 5 (Monk level), matching the Focus
          // tracker card + rail, never 8 (total). The SAME owning-class
          // resolver the rail + own-feature action card + short-rest use, fed
          // the cross-referenced feature id (`action.costTracker`).
          const crossTotal = resolveTrackerTotal(
            crossFeature.mechanics.tracker.total,
            character,
            featureScalingLevel(action.costTracker, character)
          );
          const crossUsed = session.trackers[action.costTracker]?.used ?? 0;
          summary.uses = {
            current: Math.max(0, crossTotal - crossUsed),
            total: crossTotal,
            isPool: crossFeature.mechanics.tracker.isPool,
            unit: crossFeature.mechanics.tracker.unit,
          };
        }
      }

      // USE-APPLIES — deterministic side-effects this action grants on use
      // (a same-source slot-gated temp-hp grant matching this action's economy
      // type). Read from the feature's own grants ("grants" in srdFeature).
      const srdUseEffects = resolveActionUseEffects(
        "grants" in srdFeature ? srdFeature.grants : undefined,
        action.type,
        character,
        srdFeature.id
      );

      actions.push({
        id,
        name: actionName,
        type: action.type,
        source: "feature",
        spellLevel: null,
        concentration: false,
        summary,
        costsSlot: false,
        costTracker: actionCostTracker,
        costTrackerIsPool: actionCostIsPool,
        costTrackerUnit: actionCostUnit,
        trackerCost: action.trackerCost,
        pinned: pinnedSet.has(id),
        defaultPinned: false,
        description: featLoc(srdFeature, "description"),
        // Alternate-cost primitive — carried verbatim so `getActionCostOptions`
        // can offer it as a second payment route (Wild Companion: slot OR Wild Shape).
        ...(action.alternateCost ? { alternateCost: action.alternateCost } : {}),
        // Using this action establishes its feature's while-active state (Rage).
        ...(activatesKey ? { activatesKey } : {}),
        // USE-APPLIES — deterministic effects this action auto-applies on use
        // (a slot-gated same-source temp-hp grant: Chef's PB temp HP).
        ...(srdUseEffects.length ? { useEffects: srdUseEffects } : {}),
      });
    }
  }

  // 1b. Race-trait actions (Orc Adrenaline Rush = bonus-action Dash + PB temp HP).
  // Race traits live OUTSIDE features[], so their `mechanics.actions` are surfaced
  // here, mirroring the SRD-feature branch and gated on the trait's own tracker
  // (the `race:<id>:<trait.id>` id the trait's tracker + session state share).
  const raceForActions = getRace(charData.race) ?? getRace(charData.race.toLowerCase());
  if (raceForActions) {
    for (const trait of raceForActions.traits) {
      if (!trait.mechanics?.actions?.length) continue;
      // `race:<id>:<trait.id>` — the persisted session id (live data); the third
      // segment is the trait's stable slug, never an English display name (GR 12+22).
      const trackerId = raceTraitSessionId(raceForActions.id, trait);
      const tspec = trait.mechanics.tracker
        ? resolveTrackerSpec(trait.mechanics.tracker, totalLevel(charData))
        : undefined;
      let raceActionIndex = -1;
      for (const action of trait.mechanics.actions) {
        raceActionIndex += 1;
        // S11b — a form-gated sub-action (Necrotic Shroud's CHA save) surfaces ONLY
        // when its bundle option is the active selection; the other forms force no
        // save. The index still advanced above so the remaining actions' i18n keys
        // stay stable.
        if (
          action.requiresBundleOption &&
          session.grantBundleChoices?.[action.requiresBundleOption.bundleKey] !==
            action.requiresBundleOption.optionId
        ) {
          continue;
        }
        const id = `${trackerId}-${action.type}`;
        const summary: RawActionSummary = {
          // Effect = the trait action's summary-or-description ref (never sliced).
          effect: srdEffectText(
            "race",
            raceActionKey(raceForActions.id, trait, raceActionIndex)
          ),
        };
        if (tspec) {
          const total = resolveTrackerTotal(tspec.total, character);
          const used = session.trackers[trackerId]?.used ?? 0;
          summary.uses = {
            current: Math.max(0, total - used),
            total,
            isPool: tspec.isPool,
            unit: tspec.unit,
          };
        }
        // G18 — a race-trait action's DECLARATIVE heal (a species healing trait:
        // PB×d4), resolved to a number string at emission exactly like the
        // SRD-feature loop (single source — `resolveActionHeal`), so the SAME heal
        // chip renders "3d4". Without this the race loop dropped `action.heal`.
        if (action.heal) {
          summary.heal = resolveActionHeal(action.heal, charData, ctx.abilityScores);
        }
        // S11 — a race-trait action's save + declarative save-based ATTACK
        // (Dragonborn Breath Weapon → 1d10→4d10 by CHARACTER level on a DEX save,
        // damage type from the chosen Draconic Ancestry; Lupin Howl → WIS save vs
        // the CON-based DC). Race traits scale on the TOTAL character level — the
        // SAME `featureScalingLevel` fallback (no owning class), passed explicitly.
        applySaveAttackSummary(summary, action, character, ctx, totalLevel(charData));
        // G14 — the TRANSFORM action (a species revelation's Bonus Action,
        // the activation that picks the form) surfaces the ACTIVE form's
        // once-per-turn +PB `attack-or-spell` rider as a self-side reminder chip:
        // it isn't weapon-bound, so the weapon rows DELIBERATELY skip it and it
        // would otherwise render nowhere. Gated on the active bundle choice, so the
        // chip appears only while a form is up — and shows the chosen form's type
        // (Radiant / Necrotic).
        if (action.type === "bonus") {
          const formRiders = resolveActiveFormRiders(
            trait,
            session,
            charData,
            raceTraitLoc(raceForActions.id, trait, "name")
          );
          if (formRiders.length) summary.extraDamage = formRiders;
        }
        actions.push({
          id,
          name: raceTraitLoc(raceForActions.id, trait, "name"),
          type: action.type,
          source: "feature",
          spellLevel: null,
          concentration: false,
          summary,
          costsSlot: false,
          costTracker: tspec ? trackerId : action.costTracker,
          costTrackerIsPool: tspec?.isPool,
          costTrackerUnit: tspec?.unit,
          trackerCost: action.trackerCost,
          pinned: pinnedSet.has(id),
          defaultPinned: false,
          description: raceTraitLoc(raceForActions.id, trait, "description"),
          // USE-APPLIES — Orc Adrenaline Rush: the bonus-action Dash grants PB
          // temp HP (its same-trait `temp-hp` grant carries `slot: "bonus"`).
          ...(() => {
            const eff = resolveActionUseEffects(
              trait.grants,
              action.type,
              character,
              trackerId
            );
            return eff.length ? { useEffects: eff } : {};
          })(),
        });
      }
    }
  }

  // 1c. Invocation actions (Gaze of Two Minds, …). Invocations live outside
  // `features[]` on the flattened per-class-entry `invocationChoices`
  // (`allEntryPicks`), so their `mechanics.actions` are surfaced here —
  // mirroring the race-trait branch (1b) field-for-field (own-tracker aside:
  // no invocation declares one, see the type doc in `data/invocations.ts`).
  // Every invocation is Warlock-only, so the owning-class scaling level is
  // always the character's Warlock level (falls back to the total, matching
  // `featureScalingLevel`'s own defensive fallback, for the unreachable edge
  // case of a stray pick surviving a full Warlock respec).
  const knownInvocationIds = allEntryPicks(charData, "invocationChoices");
  if (knownInvocationIds.length > 0) {
    const warlockLevel = classEntryLevel(charData, "warlock") || totalLevel(charData);
    for (const invId of knownInvocationIds) {
      const inv = INVOCATION_BY_ID.get(invId);
      if (!inv?.mechanics?.actions?.length) continue;
      let invActionIndex = -1;
      for (const action of inv.mechanics.actions) {
        invActionIndex += 1;
        const id = `${inv.id}-${action.type}`;
        const summary: RawActionSummary = {
          effect: srdEffectText(
            "invocation",
            srdKey(inv.id, "mechanics", "actions", String(invActionIndex))
          ),
        };
        if (action.type === "reaction") {
          if (action.trigger) {
            summary.trigger = uiText(`combat.reactionTrigger_${action.trigger}`);
          }
          summary.effect = undefined;
        }
        if (action.heal) {
          summary.heal = resolveActionHeal(action.heal, charData, ctx.abilityScores);
        }
        applySaveAttackSummary(summary, action, character, ctx, warlockLevel);
        actions.push({
          id,
          name: srdText("invocation", inv.id, "name"),
          type: action.type,
          source: "feature",
          spellLevel: null,
          concentration: false,
          summary,
          costsSlot: false,
          costTracker: action.costTracker,
          trackerCost: action.trackerCost,
          pinned: pinnedSet.has(id),
          defaultPinned: false,
          description: srdText("invocation", inv.id, "description"),
          ...(() => {
            const eff = resolveActionUseEffects(
              inv.grants,
              action.type,
              character,
              inv.id
            );
            return eff.length ? { useEffects: eff } : {};
          })(),
        });
      }
    }
  }

  return actions;
}

/**
 * Section 2 — spells → combat actions. Filters to the spells the character can
 * actually cast on their turn (`isSpellCombatCastable`), resolves the per-spell
 * attack/DC and the spell-damage / heal / damage-type-override / component-waiver
 * riders (aggregated once), and surfaces custom (homebrew) spells too.
 */
function resolveSpellActions(
  character: CharacterDoc,
  ctx: ActionResolveCtx
): RawResolvedAction[] {
  const { charData, session, level, pinnedSet } = ctx;
  const actions: RawResolvedAction[] = [];

  // 2. Spells → combat actions
  const castAbility = charData.spellcasting?.ability ?? "CHA";
  // D2 — effective score (set-score item floor applied), so a Headband of Intellect
  // wizard's spell rows derive their cast modifier from INT 19.
  const castScore = ctx.abilityScores[castAbility];

  // Spell-damage riders (Draconic Sorcery Elemental Affinity → +CHA on the chosen
  // element, Celestial Radiant Soul → +CHA on Radiant/Fire, Cleric Potent
  // Spellcasting → +WIS on any Cleric cantrip). Aggregated once so each spell row
  // can append the resolved modifier to its damage formula. `while-active` /
  // bundle-gated riders (Elemental Affinity is a chosen bundle option) flow through
  // the same active-feature + bundle-choice context as the weapon-row aggregate.
  // AX exposure audit — the sources are the CANONICAL `resolveAllGrantSources`
  // assembler (features + equipped/attuned items + invocations + background +
  // standing spell buffs), so item-borne casting riders (Rod of the Pact Keeper)
  // reach the combat cards too — previously features+invocations only.
  const spellGrantAggregate = evaluateGrants(
    resolveAllGrantSources(charData),
    new Set(session.activeFeatures ?? []),
    new Map(Object.entries(session.grantBundleChoices ?? {}))
  );

  // Grant-derived bumps to the save DC / spell attack (`spell-save-dc-bonus` /
  // `spell-attack-bonus` — Rod of the Pact Keeper, "+1 to your Sorcerer spells").
  // Added ONLY when no manual override is set (override-first: an override
  // replaces the whole number). Previously aggregated but never consumed.
  const dcGrantBonus = resolveCastingModifier(
    spellGrantAggregate.spellSaveDcBonus,
    primaryClassId(charData)
  );
  const atkGrantBonus = resolveCastingModifier(
    spellGrantAggregate.spellAttackBonus,
    primaryClassId(charData)
  );
  const dc = charData.spellcasting
    ? effectiveSpellSaveDc(
        level,
        castScore,
        dcGrantBonus,
        charData.spellcasting.saveDCOverride,
        charData.proficiencyBonusOverride
      )
    : null;
  const atkBonus = charData.spellcasting
    ? effectiveSpellAttackBonus(
        level,
        castScore,
        atkGrantBonus,
        charData.spellcasting.attackBonusOverride,
        session.exhaustion,
        charData.proficiencyBonusOverride
      )
    : null;
  const spellDamageBonuses = spellGrantAggregate.spellDamageBonuses;
  // Heal-amount riders (Cleric Disciple of Life: +2 + spell level) — appended to
  // a healing spell's heal verdict below, mirroring the damage-bonus path.
  const healBonuses = spellGrantAggregate.healBonuses;
  // Spell damage-type overrides (Great Old One Psychic Spells → Psychic) — folded
  // into a damaging spell's damage-type CHOICE chip below.
  const spellDamageTypeOverrides = spellGrantAggregate.spellDamageTypeOverrides;
  // Component waivers (Great Old One Psychic Spells: Enchantment/Illusion without
  // V/S) — marked on the spell's verdict below so the UI can strike them.
  const componentWaivers = spellGrantAggregate.componentWaivers;
  // The casting class scopes a rider (Elemental Affinity → sorcerer); resolved once.
  const castClassId = primaryClassId(charData);
  // Per-class levels — feeds the level-scaled cantrip range bonus (Eldritch
  // Spear: +30 ft × Warlock level). Resolved once.
  const classLevels: Partial<Record<string, number>> = Object.fromEntries(
    charData.classes.map((e) => [e.classId, e.level])
  );

  // Only spells the character can actually cast on their turn belong in the
  // combat panel. For a prepared caster (Cleric/Wizard/…) that excludes
  // unprepared level-1+ spells — cantrips, always-prepared grants, Spell
  // Mastery / Signature picks, and free-cast spells stay castable; known-style
  // casters show their whole list. See `isSpellCombatCastable`.
  const preparedCaster = charData.spellcasting?.preparedCaster === true;

  // Effective spells = stored + always-prepared inferred from grants (subclass
  // expanded spells, species legacy spells like Tiefling Fire Bolt, etc.) — so a
  // granted/inferred spell is castable even when it was never written into
  // `spells[]` (minimal representation; imported docs). Deduped by srd id.
  for (const spellRef of resolveEffectiveSpells(charData, character.session)) {
    const srdId = "custom" in spellRef ? undefined : spellRef.srdId;
    const spell = srdId ? spellIndex.get(srdId) : undefined;

    // ── Custom spell path ────────────────────────────────────────────────────
    if ("custom" in spellRef) {
      const customSpell = spellRef;
      // Unprepared homebrew spell on a prepared caster → not castable in combat.
      if (
        !isSpellCombatCastable({
          level: customSpell.level,
          preparedCaster,
          prepared: customSpell.prepared,
        })
      ) {
        continue;
      }
      const ct = customSpell.castingTime.toLowerCase();
      let customActionType: ActionType = "action";
      if (ct.includes("bonus")) customActionType = "bonus";
      else if (ct.includes("reaction")) customActionType = "reaction";

      // Custom (homebrew) spells carry single user strings (no translation).
      const customSummary: RawActionSummary = {};
      if (customSpell.range) customSummary.range = customText(customSpell.range);
      if (
        customSpell.duration &&
        customSpell.duration.toLowerCase() !== "instantaneous"
      ) {
        customSummary.duration = customText(customSpell.duration);
      }
      customSummary.components = {
        v: customSpell.components.v,
        s: customSpell.components.s,
        m: customSpell.components.m,
      };
      if (customActionType === "reaction") {
        // The lazy 5–40-char match already bounds the phrase at the first
        // period/comma — no hard slice (a mid-word cut is the same sin as an
        // ellipsized subtitle; the trigger is a complete phrase or nothing).
        const match = ct.match(/when\s+(?:you\s+)?(.{5,40}?)(?:\s*\.|,|$)/i);
        if (match?.[1]) {
          customSummary.trigger = customText(match[1].trim());
        }
      }

      const customSpellId = `custom-spell-${customSpell.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      actions.push({
        id: customSpellId,
        name: customText(customSpell.name),
        type: customActionType,
        source: "spell",
        spellLevel: customSpell.level,
        concentration: customSpell.concentration,
        summary: customSummary,
        costsSlot: customSpell.level > 0,
        slotLevel: customSpell.level > 0 ? customSpell.level : undefined,
        pinned: pinnedSet.has(customSpellId),
        defaultPinned: false,
        description: customText(customSpell.description),
      });
      continue;
    }

    if (!spell) continue;

    // Unprepared level-1+ spell on a prepared caster → not castable in combat.
    // Cantrips, always-prepared grants, Spell Mastery / Signature picks, and
    // free-cast spells all stay castable (see `isSpellCombatCastable`).
    if (
      !isSpellCombatCastable({
        level: spell.level,
        preparedCaster,
        prepared: spellRef.prepared,
        alwaysPrepared: spellRef.alwaysPrepared,
        wizardSpellMastery: spellRef.wizardSpellMastery,
        wizardSignatureSpell: spellRef.wizardSignatureSpell,
        hasFreeCast: spellRef.freeCastSource != null,
      })
    ) {
      continue;
    }

    // Per-spell casting ability (MULTICLASS RAW + feat/species pins). A
    // Cleric / Wizard's Guiding Bolt uses WIS, their Fireball INT — derived from
    // the spell's owning caster class. Single-class casters resolve to the one
    // ability (== `castAbility`), so `spellDc`/`spellAtkBonus` equal the global
    // `dc`/`atkBonus` and nothing changes. Override-first: a per-spell ability
    // override (Magic Initiate) wins; a GLOBAL DC/attack override still pins the
    // whole number; the class-scoped grant bump matches the OWNING class.
    const spellCastAbility =
      resolveSpellAbility(spellRef, charData, spell.classes) ?? castAbility;
    const spellOwningClassId =
      spellRef.spellAbilityOverride != null || spellRef.speciesSpellAbility
        ? castClassId
        : resolveSpellOwningClassId(spell.classes, charData, castClassId);
    // Recompute when the ability OR the owning class diverges from the primary
    // (B6): the global `dc`/`atkBonus` fold the PRIMARY-class-scoped bump, so a
    // class-scoped grant (Innate Sorcery → `scope:"sorcerer"`, Rod of the Pact
    // Keeper → `scope:"warlock"`) on a non-primary owning class would be dropped —
    // or OVER-counted on a primary-owned spell — if we gated on ability alone.
    const spellDiverges =
      spellCastAbility !== castAbility || spellOwningClassId !== castClassId;
    // D2 — effective score (set-score item floor applied) for a per-spell divergent
    // casting ability (multiclass / item-granted spell with its own ability).
    const spellCastScore = ctx.abilityScores[spellCastAbility];
    const sc = charData.spellcasting;
    const spellDc =
      spellDiverges && sc
        ? effectiveSpellSaveDc(
            level,
            spellCastScore,
            resolveCastingModifier(
              spellGrantAggregate.spellSaveDcBonus,
              spellOwningClassId
            ),
            sc.saveDCOverride,
            charData.proficiencyBonusOverride
          )
        : dc;
    const spellAtkBonus =
      spellDiverges && sc
        ? effectiveSpellAttackBonus(
            level,
            spellCastScore,
            resolveCastingModifier(
              spellGrantAggregate.spellAttackBonus,
              spellOwningClassId
            ),
            sc.attackBonusOverride,
            session.exhaustion,
            charData.proficiencyBonusOverride
          )
        : atkBonus;

    // Determine action type from casting time
    let actionType: ActionType = "action";
    const castTime = spell.castingTime.toLowerCase();
    if (castTime.includes("bonus")) actionType = "bonus";
    else if (castTime.includes("reaction")) actionType = "reaction";

    // Build structured summary
    const summary: RawActionSummary = {};

    // Range (always useful for positioning) — a spell-catalogue ref. The EN
    // presence is a FACT gate (a blank range emits nothing) via `srdEn`.
    if (srdEn("spell", spell.id, "range")) {
      summary.range = srdText("spell", spell.id, "range");
      // Cantrip range bonus (`cantrip-range-bonus` — Eldritch Spear): annotate
      // the printed range with the level-scaled increase. AX exposure audit —
      // previously aggregated but never consumed.
      const rangeBonusFt = resolveCantripRangeBonus(
        spellGrantAggregate.cantripRangeBonuses,
        spell.id,
        classLevels
      );
      if (rangeBonusFt > 0) summary.rangeBonusFt = rangeBonusFt;
    }

    // Weapon-attack cantrip (2024 True Strike) — its entire effect is "make ONE
    // attack with a held weapon, using the spellcasting ability, dealing Radiant
    // OR the weapon's normal type (choice), with level-scaled extra Radiant".
    // Resolve it FIRST so it shapes the attack/damage facets the generic blocks
    // below would otherwise leave bare. Override-first: this only surfaces the
    // facts; a manual per-spell override (UI-owned) wins. No RNG.
    const watCantrip = spell.weaponAttackCantrip;
    if (watCantrip) {
      const resolved = resolveWeaponAttackCantrip(watCantrip, level, spellCastAbility);
      // The attack uses the spellcasting ability → reuse the spell attack bonus.
      if (resolved.attackAbility != null && spellAtkBonus != null) {
        summary.attackBonus = spellAtkBonus;
      }
      // The damage type is the player's choice between Radiant and the wielded
      // weapon's normal type — the weapon's own type isn't known here (it's the
      // weapon the caster holds), so surface the override element as a single
      // choice the renderer can pair with the weapon's type. Mark as a choice.
      summary.damageTypes = [...resolved.damageTypeChoices];
      summary.multiDamageTypeFlavor = "choice";
      const firstChoice = resolved.damageTypeChoices[0];
      if (firstChoice) summary.damageType = firstChoice;
      // Scaling extra Radiant (levels 5/11/17) as an extra-damage chip — the
      // cantrip itself (True Strike) is its provenance.
      if (resolved.extraDamage) {
        summary.extraDamage = [
          {
            dice: resolved.extraDamage.dice,
            damageType: resolved.extraDamage.damageType,
            oncePerTurn: false,
            source: srdText("spell", spell.id, "name"),
          },
        ];
      }
    }

    // Attack bonus (for attack spells)
    if (spell.attackType && spellAtkBonus != null) {
      summary.attackBonus = spellAtkBonus;
    }

    // Damage + damage type. A spell exposes ONE of three facets (see
    // `resolveSpellDamageTypes`): a single fixed type, several simultaneous
    // types (Prismatic Spray/Wall, Storm of Vengeance), or a player-chosen set
    // (Chromatic Orb, Dragon's Breath, Glyph of Warding's Explosive Rune). The
    // multi/choice spells previously stored null and showed no damage type.
    // Skipped for weapon-attack cantrips (handled above — their damage IS the
    // wielded weapon's, not a spell facet).
    const damageFacet = watCantrip ? null : resolveSpellDamageTypes(spell);
    if (damageFacet) {
      if (damageFacet.kind === "single") {
        summary.damageType = damageFacet.damageType;
      } else {
        // Multi-element / player-choice: carry the full list + the flavor so
        // the (UI-owned) renderer can show every chromatic chip. Keep the legacy
        // `damageType` string set to the FIRST type so existing single-chip
        // consumers still render something meaningful.
        summary.damageTypes = [...damageFacet.damageTypes];
        summary.multiDamageTypeFlavor = damageFacet.kind === "multi" ? "all" : "choice";
        const first = damageFacet.damageTypes[0];
        if (first) summary.damageType = first;
      }
      // Spell damage-type override (Great Old One Psychic Spells → Psychic): the
      // player may deal an alternate type INSTEAD of the spell's own. Fold the
      // in-scope alternates into a damage-type CHOICE chip (reusing the multi/
      // choice rendering) so both the spell's own type and the override are
      // offered. Skipped for "multi" (simultaneous-type) spells, where a single
      // swap can't be shown as a per-type pick without misrepresenting the spell.
      const typeOverrides = resolveSpellDamageTypeOverrides(
        spellDamageTypeOverrides,
        spellOwningClassId
      );
      if (typeOverrides.length > 0 && damageFacet.kind !== "multi") {
        const base =
          damageFacet.kind === "single"
            ? [damageFacet.damageType]
            : [...damageFacet.damageTypes];
        const merged = [...base];
        for (const t of typeOverrides) if (!merged.includes(t)) merged.push(t);
        summary.damageTypes = merged;
        summary.multiDamageTypeFlavor = "choice";
        summary.damageType = merged[0] ?? summary.damageType;
      }
      // Damage dice come from the STRUCTURED `spell.damageDice` FACT (S12) — the
      // SAME field the spell cards read, so both surfaces show identical dice by
      // construction (no more English-prose regex). A cantrip's stored die is its
      // single-die base; scale it by character level (5/11/17 → ×1/×2/×3/×4). A
      // leveled spell's stored value is its base-level dice verbatim (slot-upcast
      // is layered elsewhere).
      const dmgDice =
        spell.level === 0 ? scaleCantripDice(spell.damageDice, level) : spell.damageDice;
      if (dmgDice) summary.damage = dmgDice;

      // S12b — a multi-instance spell (Magic Missile 3 darts, Scorching Ray 3
      // rays) carries its instance COUNT so the card shows "N × {damage}". Resolved
      // at the spell's BASE level (the per-slot upcast bump is layered at the cast
      // modal); kept separate from `summary.damage` so a per-instance flat rider
      // folds onto the bare die first, then the UI multiplies.
      const instances = spellInstanceCount(spell);
      if (instances && instances > 1) summary.instances = instances;

      // Dual-damage-instance spells (Ice Storm 2d10 Bldg + 4d6 Cold, Ice Knife
      // 1d10 Prc + 2d6 Cold, Meteor Swarm 20d6 Fire + 20d6 Bldg) carry a SECOND
      // simultaneous instance with different dice the single damageType pair
      // can't represent. Surface its BASE-level dice + type so the combat chip
      // shows the FULL damage (the per-slot upcast is previewed in the cast
      // modal via the shared scaleUpcastDice helper). Both instances always apply.
      if (spell.secondaryDamage) {
        summary.secondaryDamage = {
          dice: spell.secondaryDamage.dice,
          damageType: spell.secondaryDamage.damageType,
        };
      }

      // Spell-damage rider (Elemental Affinity +CHA / Radiant Soul +CHA / Potent
      // Spellcasting +WIS): append the resolved flat modifier to the damage chip
      // when the spell's damage type (and, for `cantripOnly` riders, its being a
      // cantrip) matches. Override-first: a manual per-spell `overrides.damage`
      // pins the whole formula, so the rider is skipped to avoid double-counting.
      // No RNG — we only annotate the formula the player rolls externally.
      const damageOverride =
        typeof spellRef.overrides?.damage === "string" ? spellRef.overrides.damage : null;
      if (damageOverride != null) {
        summary.damage = damageOverride;
      } else if (summary.damage) {
        const spellTypes: DamageType[] =
          damageFacet.kind === "single"
            ? [damageFacet.damageType]
            : [...damageFacet.damageTypes];
        const bonus =
          resolveSpellDamageBonus(
            spellDamageBonuses,
            spellTypes,
            ctx.abilityScores, // D2 — effective scores (set-score floors)
            spellOwningClassId,
            spell.level,
            spell.school
          ) +
          // Per-cantrip flat damage bonus (`cantrip-damage-bonus` — Agonizing
          // Blast: +CHA mod on the chosen cantrip's damage rolls). AX exposure
          // audit — previously aggregated but never consumed.
          resolveCantripDamageBonus(
            spellGrantAggregate.cantripDamageBonuses,
            spell.id,
            ctx.abilityScores // D2 — effective scores (set-score floors)
          );
        if (bonus > 0) summary.damage = `${summary.damage}+${bonus}`;
      }
    }

    // Marked-target rider on a SPELL ATTACK row (Eldritch Blast + Hex, a spell
    // attack + Hunter's Mark). RAW: Hex / Hunter's Mark deal their extra die "each
    // time you hit the target with an attack roll" — a spell attack counts. Surface
    // the SAME while-active marked-target rider the weapon rows show, keyed off the
    // `vsMarkedTarget` flag, on any attack-roll spell. DISPLAY-ONLY chip, never
    // auto-summed (the app models no enemy — the player applies the die on the hit
    // that lands on the marked creature).
    if (spell.attackType) {
      const markedRiders = resolveSpellAttackMarkedRiders(
        spellGrantAggregate.damageRiders,
        character
      );
      if (markedRiders.length > 0) {
        summary.extraDamage = [...(summary.extraDamage ?? []), ...markedRiders];
      }
    }

    // G24 — a spell whose damage RE-APPLIES on a self-side cadence (Moonbeam /
    // Spirit Guardians per-turn area save, Flaming Sphere bonus-action move, Call
    // Lightning re-fire) carries its `recurrence` token so the combat card shows a
    // "when it recurs" note. A stable id (golden rule 7) — the presenter
    // localizes it. Informational; the engine tracks no geometry (golden rule 21).
    if (spell.recurrence) summary.recurrence = spell.recurrence;

    // Forced-movement rider (`cantrip-effect-rider` — Repelling Blast: push a
    // Large-or-smaller creature 10 ft on a hit with the chosen cantrip). AX
    // exposure audit — previously aggregated but never consumed. Informational.
    const forcedMovement = resolveCantripForcedMovement(
      spellGrantAggregate.cantripEffectRiders,
      spell.id
    );
    if (forcedMovement) summary.forcedMovement = forcedMovement;

    // Save DC + ability
    if (spell.saveAbility && spellDc != null) {
      summary.saveDC = spellDc;
      summary.saveAbility = spell.saveAbility;
    }

    // Duration (skip "Instantaneous" — not useful info). The "is it instantaneous"
    // test is the STRUCTURED `instantaneous` FACT (golden rule 7 — never branch on
    // prose); the displayed duration is carried as bilingual DATA and localized in
    // the view (R6 §3.3).
    if (!spell.instantaneous) {
      summary.duration = srdText("spell", spell.id, "duration");
    }

    // Components (important for Silence, restrained, etc.)
    summary.components = {
      v: spell.components.v,
      s: spell.components.s,
      m: spell.components.m,
    };
    // Component waiver (Great Old One Psychic Spells: cast Enchantment/Illusion
    // Warlock spells without V/S) — mark which of the spell's OWN components the
    // caster may drop, so the UI can strike them. Only flag components the spell
    // actually has.
    const waived = resolveComponentWaiver(
      componentWaivers,
      spell.school,
      castClassId
    ).filter((c) => spell.components[c]);
    if (waived.length > 0) summary.componentsWaived = waived;

    // Trigger for reactions (e.g. Counterspell) — the STRUCTURED
    // `spell.reactionTrigger` token (golden rule 7), localized at the render edge
    // via `combat.reactionTrigger_<token>` (the SAME key family the FEATURE-action
    // path uses). No casting-time prose is parsed: the engine emits a stable id; a
    // reaction spell without a token simply shows no trigger line.
    if (actionType === "reaction" && spell.reactionTrigger) {
      summary.trigger = uiText(`combat.reactionTrigger_${spell.reactionTrigger}`);
    }

    // Healing — read the STRUCTURED `spell.healDice` FACT (S12), the SAME field
    // the spell cards read, so both surfaces show identical base dice by
    // construction (no more English-prose regex). Gated like before: only when the
    // spell exposes NO damage facet and is not an attack/save/weapon-attack-cantrip
    // spell, so a damaging spell never doubles as a healer.
    if (!damageFacet && !watCantrip && !spell.attackType && !spell.saveAbility) {
      if (spell.healDice) {
        // The combat chip folds the caster's spellcasting modifier into the
        // formula for the 2024 "regains NdM + your spellcasting ability modifier"
        // family (`healAddsCastMod`), plus the Disciple-of-Life heal-amount rider.
        // Both are FLAT — combine into ONE trailing modifier so the verdict reads
        // "2d8+7", not "2d8+4+3". The spell card shows the base `healDice` only.
        // Engine rolls no dice.
        const baseMod = spell.healAddsCastMod ? abilityModifier(spellCastScore) : 0;
        const healBonus = resolveHealBonus(healBonuses, spellOwningClassId, spell.level);
        const flat = baseMod + healBonus;
        summary.healing = appendAbilityModToDice(spell.healDice, flat);
      }
      // No verbose effect text for spells — name + range + duration is enough.
      // The spell name already communicates what it does (Fly, Invisibility, etc.)
    }

    // Per-spell Temporary-HP roll-entry (False Life: 2d4 + 4). The dice are
    // ROLL-ENTRY (golden rule 21 — the app never rolls); the +4 is the
    // deterministic part the card adds to the entered roll (applied max-wins via
    // `gainTempHp`). When THIS caster casts the spell through a MAXIMIZING at-will
    // source (Warlock Fiendish Vigor → `autoMaxTempHpFormula`), the maximum is
    // dice-free (2d4+4 → 12), so emit a one-tap `{ bonus }` (no dice) instead —
    // the deterministic-number one-tap the S8 doctrine allows. The signal comes
    // from the SAME evaluated grant the Spells-page at-will row reads
    // (`atWillCasts[].autoMaxTempHp`), so the two surfaces can't disagree.
    if (spell.tempHpRoll) {
      const maximized = spellGrantAggregate.atWillCasts.find(
        (e) => e.spellId === spell.id && e.autoMaxTempHp !== undefined
      )?.autoMaxTempHp;
      summary.tempHpApply =
        maximized !== undefined
          ? { bonus: maximized }
          : { dice: spell.tempHpRoll.dice, bonus: spell.tempHpRoll.bonus };
    }

    // S1 — a while-active BUFF spell (Shield of Faith's +2 AC, Divine Favor's
    // +1d4 radiant, Mage Armor, Haste, Fly…) carries its standing effect as a
    // `while-active` grant on `spell.grants` (a stable `activeKey`). Casting it
    // IS entering that state — so stamp `activatesKey` on the action exactly like
    // a FEATURE action (Rage/Bladesong) does, and the source-agnostic combat
    // commit/undo seam (TurnEconomyProvider) auto-lights/clears its rail chip in
    // one tap. A normal attack/utility cast carries no such grant ⇒ no key ⇒
    // lights nothing. Read the grant's stable `activeKey`, NEVER the spell name
    // (golden rule 7). Mirrors the feature derivation at :3033-3041; a
    // spell's `grants` is a plain optional array (no `in` narrowing needed).
    // A TARGET-ONLY buff (Warding Bond — the CASTER never benefits) opts out via
    // `autoActivateOnCast: false`: no key is stamped, so casting never self-buffs;
    // the warded creature's sheet lights the toggle manually from the rail.
    let spellActivatesKey: string | undefined;
    for (const g of spell.grants ?? []) {
      if (g.type === "while-active" && g.autoActivateOnCast !== false) {
        spellActivatesKey = g.activeKey;
        break;
      }
    }

    actions.push({
      id: `spell-${spell.id}`,
      name: srdText("spell", spell.id, "name"),
      type: actionType,
      source: "spell",
      spellLevel: spell.level,
      spellId: spell.id,
      concentration: spell.concentration,
      summary,
      costsSlot: spell.level > 0,
      slotLevel: spell.level > 0 ? spell.level : undefined,
      pinned: pinnedSet.has(`spell-${spell.id}`),
      defaultPinned: false,
      description: srdText("spell", spell.id, "description"),
      // Casting establishes the spell's while-active state (Shield of Faith's AC).
      ...(spellActivatesKey ? { activatesKey: spellActivatesKey } : {}),
    });
  }

  return actions;
}

/**
 * Section 3 + 4 + 5 — weapon & item actions: carried-weapon attack rows (incl.
 * Finesse/ability overrides, flat to-hit & damage riders, reach bonuses, dual-
 * wield off-hand, Unarmed Fighting/Strike), feature-conjured manifested & pact
 * weapons, and inventory potions/consumables. The grant aggregate (weapon profs,
 * damage riders, ability overrides, manifested/pact weapons) is evaluated once.
 */
function resolveWeaponActions(
  character: CharacterDoc,
  ctx: ActionResolveCtx
): RawResolvedAction[] {
  const { charData, session, level, pb, exPenalty, pinnedSet, unpinnedSet } = ctx;
  const actions: RawResolvedAction[] = [];

  // 3. Weapons → attack actions
  /** Side list for dual-wield detection — light melee weapons only */
  interface LightMeleeEntry {
    weaponId: string;
    /** SRD weapon id for the per-weapon seal glyph (undefined for custom). */
    srdWeaponId?: string;
    /** Weapon name as a {@link LocText} ref — localized in the view. */
    name: LocText;
    damageDie: string;
    damageFormula: string; // full formula including ability mod
    damageType: DamageType;
    attackBonus: number;
    /** Per-source to-hit composition (#94) — the off-hand attack shares the
     *  main hand's to-hit, so it carries the SAME breakdown (golden rule 6). */
    attackBreakdown: RawBreakdownPart[];
    /** Structured weapon range (feet) — formatted in the view. */
    range: WeaponRangeSpec;
    /** RAW (untranslated) property tokens — localized in the view. */
    properties: string[];
    /** Weapon category id ("simple"/"martial") for the off-hand row's chips. */
    weaponCategory?: string;
    /** The weapon's OWNED mastery token (mastery rides every attack with it). */
    weaponMastery?: string;
    /** How many of this weapon the character carries. A Light weapon held in
     *  quantity ≥2 is itself two weapons, so it enables Two-Weapon Fighting on
     *  its own — the dual-wield gate sums quantities, not entries. */
    quantity: number;
  }
  const lightMeleeEntries: LightMeleeEntry[] = [];

  // Feature/feat grant aggregate (computed once): weapon proficiencies the
  // attack rows union with the class list, the self-contained damage riders
  // (Radiant Strikes, etc.), and the weapon-attack-ability overrides (Bladesong
  // → INT). The session active-feature set is passed so `while-active` grants
  // (Bladesong's INT weapon stat) apply only while toggled on.
  const grantAgg = evaluateGrants(
    [
      ...resolveGrantSourcesForFeatures(charData.features),
      // Chosen Eldritch Invocations carry combat-bearing grants too (Warlock's
      // Pact of the Blade conjured pact weapon, etc.). They must flow into the
      // attack-row aggregate or the invocation's mechanic would never appear on
      // the Combat page.
      ...resolveGrantSourcesForInvocations(allEntryPicks(charData, "invocationChoices")),
      // Prepared while-active BUFF spells carry weapon-row grants too — a
      // `damage-rider` (Divine Favor +1d4 Radiant; Hunter's Mark +1d6 Force / Hex
      // +1d6 Necrotic "vs marked/cursed target", S10). Without this the spell's
      // per-hit die never reaches the weapon rows (only feature/invocation riders
      // did). Gated by the SAME `activeFeatures` set below, so the rider surfaces
      // only while the spell's toggle is lit (auto-lit on cast, retracts on
      // concentration drop). Cast-time damage stays on the spell's own card.
      ...resolveGrantSourcesForSpells(charData.spells),
    ],
    new Set(character.session.activeFeatures ?? []),
    // Bundle-gated weapon riders (Hunter Colossus Slayer) only apply once the
    // player has picked that option, so the chosen bundle option must flow into
    // the attack-row aggregate the same way `while-active` toggles do.
    new Map(Object.entries(character.session.grantBundleChoices ?? {}))
  );
  // Class weapon proficiencies — so the combat panel matches the Equipment page
  // (no PB on weapons the character isn't proficient with) instead of assuming it.
  // On-crit movement distance (max across riders; 0 = none) — resolved once.
  const onCritMoveFt = resolveOnCritMovement(character).reduce(
    (best, r) => Math.max(best, r.distanceFt),
    0
  );
  // Weapon proficiencies union across ALL classes (a multiclass character keeps
  // every class's weapon training — never just the primary's), plus grants.
  const classWeaponProfs = [
    ...getClasses(charData).flatMap(
      (e) => getClassTable(e.classId)?.weaponProficiencies ?? []
    ),
    ...grantAgg.weaponProficiencies,
  ];
  // The SRD weapon ids the character has MASTERED (union of every class
  // entry's weaponMasteries picks) — the ONE ownership truth the mastery chip
  // gates on. A weapon not in this set never emits `weaponMastery`, so no
  // surface can show an unowned mastery (owner mandate 2026-06-12).
  const masteredIds = new Set(allEntryPicks(charData, "weaponMasteries"));

  for (const weaponRef of charData.weapons) {
    const isCustom = "custom" in weaponRef;
    const srdWeapon = isCustom ? undefined : WEAPONS_BY_ID.get(weaponRef.srdId);
    // Weapon name. `nameEn` is the canonical English FACT (action id + proficiency
    // lookup) — from the equipment catalogue via `srdEn`, else an id-derived title.
    // `name` is the localizable ref: a custom weapon carries user text; an SRD
    // weapon resolves from the equipment catalogue.
    const idTitle = isCustom
      ? weaponRef.name
      : weaponRef.srdId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const nameEn = isCustom
      ? weaponRef.name
      : (srdEn("equipment", weaponRef.srdId, "name") ?? idTitle);
    const name: LocText =
      isCustom || !srdWeapon
        ? customText(idTitle)
        : srdText("equipment", weaponRef.srdId, "name");

    // Attack stat through the SHARED authority (golden rule 6 — the SAME
    // function the Inventory weapon row uses): ranged → DEX; finesse → best of
    // STR/DEX (by modifier); Monk Martial Arts' DEX swap on Monk weapons; the
    // best of any Bladesong-style `weapon-attack-ability`. D2 effective scores.
    // A custom weapon already carries its own `attackStat`.
    const attackStat: AbilityCode = isCustom
      ? weaponRef.attackStat
      : resolveWeaponAttackStat({
          weaponType: srdWeapon?.weaponType,
          properties: srdWeapon?.properties ?? [],
          scores: ctx.abilityScores,
          weaponAttackAbilities: grantAgg.weaponAttackAbilities,
          isMonkMelee: isMonkMeleeWeapon(srdWeapon),
        });

    // D2 — the attack/damage modifier reads the EFFECTIVE score (set-score item floor),
    // so a Gauntlets/Belt user's weapon to-hit + damage reflect the set STR.
    const score = ctx.abilityScores[attackStat];
    const mod = abilityModifier(score);
    // Custom weapons assume proficiency; SRD weapons are checked against the class
    // list by their STABLE id (group tokens map `longswords` → `longsword`), never
    // the localized name (golden rule 7).
    const proficient = isCustom
      ? true
      : isWeaponProficient(
          srdWeapon?.weaponCategory,
          srdWeapon ? weaponRef.srdId : undefined,
          srdWeapon?.weaponType,
          srdWeapon?.properties ?? [],
          classWeaponProfs
        );
    // Flat to-hit bonuses on weapon attacks (Archery fighting style → +2 with
    // Ranged weapons). Ranged weapons key off `weaponType === "ranged"`; every
    // other weapon (incl. Thrown used in melee, custom weapons) is melee for
    // this purpose. "any" rides all. Resolved with provenance so the to-hit
    // breakdown can NAME each one by its feat's canonical key (golden rule 6).
    const isRangedWeapon = !isCustom && srdWeapon?.weaponType === "ranged";
    const weaponAtkBonuses = resolveWeaponAttackBonuses(grantAgg.weaponAttackBonuses, {
      isRanged: isRangedWeapon,
      scores: ctx.abilityScores,
    });
    // PRIM-item-bound-bonus — the +N of a magic-item enchant bound to THIS
    // weapon (`weaponRef.enchantItemId` → the item's `item-bound-bonus` grant).
    // Auto-flows into BOTH the to-hit and the damage, superseding the manual
    // `attackBonusOverride`/`damageOverride` seam (which still wins when the
    // player pins a value by hand — override-first). 0 for a mundane weapon.
    const enchantItemId = isCustom ? undefined : weaponRef.enchantItemId;
    const itemBoundBonus = resolveItemBoundWeaponBonus(
      enchantItemId ? getMagicItem(enchantItemId)?.grants : undefined
    );
    const hasAtkOverride = weaponRef.attackBonusOverride != null;
    // Per-source to-hit composition for the breakdown tip (ability + PB + named
    // fighting styles + magic enchant + exhaustion) — empty under an override.
    // The to-hit total DERIVES from `breakdownTotal(parts)` so the headline and
    // the tip are the same arithmetic by construction (golden rule 6; the AC
    // pattern). The override branch pins the figure directly (no composition).
    const attackBreakdown = buildWeaponAttackBreakdown({
      attackStat,
      abilityMod: mod,
      proficiencyBonus: proficient ? pb : 0,
      enchantBonus: itemBoundBonus,
      ...(enchantItemId && itemBoundBonus !== 0
        ? { enchantName: srdText("magic-item", enchantItemId, "name") }
        : {}),
      featureBonuses: weaponAtkBonuses,
      exhaustionPenalty: exPenalty,
      hasOverride: hasAtkOverride,
    });
    // Override-first: a pinned per-weapon `attackBonusOverride` replaces the
    // entire to-hit, so the flat grant bonus is NOT re-added on top (it would
    // double-count what the player already baked into their pinned value).
    const weaponAtkBonus = hasAtkOverride
      ? (weaponRef.attackBonusOverride ?? 0) + exPenalty
      : breakdownTotal(attackBreakdown);
    // Monk Martial Arts die upgrade: the MA die REPLACES the printed die when
    // larger, on Monk weapons (a Dagger 1d4 → 1d6, a Shortsword 1d6 → 1d8 at
    // Monk L5). Resolved against the Monk's OWN level (multiclass-correct) via
    // the same `featureClassRow` deferred resolver the Unarmed Strike row uses.
    const printedDie = isCustom ? weaponRef.damageDie : (srdWeapon?.damage?.die ?? "1d8");
    const damageDie = isCustom
      ? printedDie
      : effectiveWeaponDie(
          printedDie,
          isMonkMeleeWeapon(srdWeapon),
          grantAgg.weaponAttackAbilities,
          (sid, key) => (sid ? featureClassRow(sid, character)?.[key] : undefined)
        );
    const damageType = isCustom
      ? weaponRef.damageType
      : (srdWeapon?.damage?.type ?? "bludgeoning");
    const properties = isCustom
      ? weaponRef.properties
        ? weaponRef.properties
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean)
        : []
      : (srdWeapon?.properties ?? []);
    const isHeavyWeapon = properties.some((p) => /\bheavy\b/i.test(p));
    // Flat damage bonuses on weapon attacks (`weapon-damage-bonus` — Barbarian
    // Rage Damage while raging, issue #27; GWM Heavy Weapon Mastery's +PB on a
    // Heavy-weapon hit, "heavy" scope). Scope-matched against THIS attack
    // (Rage's "strength" scope keys off the resolved attack ability, so a
    // thrown Handaxe qualifies and a DEX-resolved Finesse blade does not) and
    // `sourceKey`/"PB"-resolved against the source feature's class table / the PB.
    const weaponDmgBonuses = resolveWeaponDamageBonuses(
      grantAgg.weaponDamageBonuses,
      character,
      { attackStat, isRanged: isRangedWeapon, isHeavy: isHeavyWeapon }
    );
    const flatDmgBonus = weaponDmgBonuses.reduce((sum, b) => sum + b.amount, 0);
    // Override-first: a per-weapon `damageOverride` (a +1 magic weapon's
    // "1d8+4") replaces the computed formula entirely — mirroring how
    // `attackBonusOverride` replaces the to-hit above. Previously dropped, so a
    // magic weapon's bonus damage never showed. Absent an override, the
    // item-bound +N and the flat grant bonuses fold into the damage modifier.
    const damageMod = mod + itemBoundBonus + flatDmgBonus;
    const damageFormula =
      weaponRef.damageOverride != null && weaponRef.damageOverride !== ""
        ? weaponRef.damageOverride
        : appendAbilityModToDice(damageDie, damageMod);

    // Weapon-reach-bonus riders (Barbarian World Tree Battering Roots: +10 ft
    // reach + Push/Topple on Heavy/Versatile melee weapons). Only melee weapons
    // qualify; "heavy-or-versatile" further gates on the property. The matching
    // riders sum their `bonusFt` onto the base reach and pool their masteries.
    const isHeavyOrVersatile =
      isHeavyWeapon || properties.some((p) => /\bversatile\b/i.test(p));
    const { reachBonusFt, masteries: reachMasteries } = isRangedWeapon
      ? { reachBonusFt: 0, masteries: [] as string[] }
      : resolveMeleeReachBonus(grantAgg.weaponReachBonuses, isHeavyOrVersatile);

    // Structured weapon range (feet) — the view formats it (domain rule D3).
    const range = buildWeaponRange(properties, {
      isRanged: srdWeapon?.weaponType === "ranged",
      reachBonusFt,
    });

    // Build structured summary. The action id keys off the STABLE EN name so it
    // is locale-INDEPENDENT (golden rule 7 — pinned/unpinned session state must
    // not differ between EN and IT). Previously derived from the localized name.
    const weaponId = `weapon-${nameEn.toLowerCase().replace(/\s+/g, "-")}`;
    // The stable SRD weapon id (e.g. "longsword") for the per-weapon seal glyph;
    // undefined for custom weapons (→ generic sword fallback). Distinct from the
    // name-derived `weaponId` action id above.
    const srdWeaponId = isCustom ? undefined : weaponRef.srdId;

    // Dual-wield candidate: must be melee + have Light property
    const isLight = properties.some((p) => p.toLowerCase() === "light");
    if (isLight && !isRangedWeapon) {
      lightMeleeEntries.push({
        weaponId,
        srdWeaponId,
        name,
        damageDie,
        damageFormula,
        damageType,
        attackBonus: weaponAtkBonus,
        attackBreakdown,
        range,
        // Raw property tokens AS PRINTED — the presenter localizes them.
        properties: [...properties],
        ...(srdWeapon?.weaponCategory
          ? { weaponCategory: srdWeapon.weaponCategory }
          : {}),
        ...(!isCustom && srdWeapon?.mastery && masteredIds.has(weaponRef.srdId)
          ? { weaponMastery: srdWeapon.mastery }
          : {}),
        quantity: weaponRef.quantity,
      });
    }

    // Self-contained damage riders (Radiant Strikes, Colossus Slayer, Frenzy …)
    // that apply on a hit with THIS weapon — resolved through the SHARED
    // `resolveAttackDamageRiders` (the SAME resolver the Unarmed Strike row uses,
    // golden rule 6). "melee-weapon" riders skip ranged weapons; "weapon" riders
    // apply to all; "one-handed-melee" (Dueling) further skips Two-Handed weapons
    // (a Versatile weapon's one-handed grip still qualifies); an "attack-or-spell"
    // rider surfaces elsewhere (excluded here). A strict Two-Handed-property check
    // (NOT the Versatile-inclusive `isTwoHandedCapable` below) gates the grip.
    const isTwoHandedOnly = properties.some((p) => /\btwo-?handed\b/i.test(p));
    const extraDamage = resolveAttackDamageRiders(
      grantAgg.damageRiders,
      {
        kind: "weapon",
        isRanged: isRangedWeapon,
        isTwoHanded: isTwoHandedOnly,
        damageType,
      },
      character,
      ctx.abilityScores
    );

    // Flag-style die manipulations on this weapon's own damage roll (Great
    // Weapon Fighting floor / Savage Attacker reroll). The GWF floor needs a
    // two-handed-capable weapon (Two-Handed or Versatile property).
    const isTwoHandedCapable = properties.some((p) =>
      /\b(two-?handed|versatile)\b/i.test(p)
    );
    const dieModifiers = resolveWeaponDieModifiers(grantAgg.damageDieModifiers, {
      isRanged: isRangedWeapon,
      isTwoHandedCapable,
    });

    // Versatile two-handed die (item g): parse "Versatile (1dX)" exactly as the
    // inventory WeaponCard does — ONE source — and fold in the same damage
    // modifier as the one-handed `damageFormula` (ability mod + bound enchant +
    // flat grant bonuses — the two stances differ ONLY by die), so the Play
    // card can offer a stance toggle. A per-weapon damageOverride takes
    // precedence (it already replaced the one-handed formula), so don't offer
    // a stance against an override.
    const rawVersatileDie = properties
      .map((p) => /Versatile\s*\(([^)]+)\)/i.exec(p)?.[1])
      .find((m): m is string => !!m);
    // The Monk Martial Arts die replaces a Monk weapon's printed die in EITHER
    // grip, so the two-handed die runs through the SAME `effectiveWeaponDie`
    // (max with the MA die, gated on `isMonkMeleeWeapon`, resolved at the Monk's
    // own level) the one-handed `damageDie` already uses — a Quarterstaff
    // (Versatile (1d8), a Monk weapon) two-handed at Monk L11+ shows the larger
    // MA die. A non-Monk versatile weapon (Longsword) is unaffected.
    const versatileDie =
      rawVersatileDie && !isCustom
        ? effectiveWeaponDie(
            rawVersatileDie,
            isMonkMeleeWeapon(srdWeapon),
            grantAgg.weaponAttackAbilities,
            (sid, key) => (sid ? featureClassRow(sid, character)?.[key] : undefined)
          )
        : rawVersatileDie;
    // The SAME damage modifier as the one-handed formula (incl. the item-bound
    // enchant +N — previously the bare ability mod, so a +1 longsword read
    // "1d8+4 / 1d10+3"; regression-pinned).
    const versatileDamage =
      versatileDie &&
      !(weaponRef.damageOverride != null && weaponRef.damageOverride !== "")
        ? appendAbilityModToDice(versatileDie, damageMod)
        : undefined;

    // Per-source damage composition for the damage tooltip (die + ability +
    // enchant + Rage-style flat bonuses) — empty under a damageOverride.
    const damageBreakdown = buildWeaponDamageBreakdown({
      damageDie,
      weaponName: name,
      attackStat,
      abilityMod: mod,
      enchantBonus: itemBoundBonus,
      ...(enchantItemId && itemBoundBonus !== 0
        ? { enchantName: srdText("magic-item", enchantItemId, "name") }
        : {}),
      featureBonuses: weaponDmgBonuses,
      hasOverride: weaponRef.damageOverride != null && weaponRef.damageOverride !== "",
    });

    const summary: RawActionSummary = {
      attackBonus: weaponAtkBonus,
      damage: damageFormula,
      ...(versatileDamage ? { versatileDamage } : {}),
      ...(damageBreakdown.length > 0 ? { damageBreakdown } : {}),
      // Per-source to-hit composition for the attack-bonus tooltip (ability + PB
      // + named fighting styles + magic enchant + exhaustion) — empty under an
      // attackBonusOverride. The to-hit headline DERIVES from this (golden rule
      // 6b), so the figure and the tip can never disagree.
      ...(attackBreakdown.length > 0 ? { attackBreakdown } : {}),
      damageType,
      weaponRange: range,
      // Expanded crit range on weapon attacks (`crit-range` — Champion
      // Improved/Superior Critical: 19/18). AX exposure audit — previously
      // aggregated but never surfaced. Display-only; the player rolls.
      ...(grantAgg.critThreshold < 20 ? { critRange: grantAgg.critThreshold } : {}),
      // On-crit movement rider (`on-crit-movement` — Champion Remarkable
      // Athlete: move half your Speed without provoking after a crit). AX
      // exposure audit — the resolver existed but nothing surfaced it.
      ...(onCritMoveFt > 0 ? { onCritMoveFt } : {}),
      ...(extraDamage.length > 0 ? { extraDamage } : {}),
      ...(dieModifiers.length > 0 ? { dieModifiers } : {}),
      // Extra masteries a reach-bonus rider activates on this weapon (Battering
      // Roots → Push/Topple). Surfaced only when a matching rider applied.
      ...(reachMasteries.length > 0 ? { extraMasteries: reachMasteries } : {}),
      // Raw property tokens AS PRINTED on the weapon (incl. thrown/ammunition
      // ranges) — the presenter localizes them into the unified facts chips.
      properties: [...properties],
      ...(srdWeapon?.weaponCategory ? { weaponCategory: srdWeapon.weaponCategory } : {}),
      // The weapon's OWN mastery — emitted ONLY when the character mastered
      // this weapon (an unowned mastery is never surfaced, by construction).
      ...(!isCustom && srdWeapon?.mastery && masteredIds.has(weaponRef.srdId)
        ? { weaponMastery: srdWeapon.mastery }
        : {}),
    };

    actions.push({
      id: weaponId,
      weaponId: srdWeaponId,
      name,
      type: "action",
      source: "weapon",
      spellLevel: null,
      // Tag Light melee main attacks — taking one as the Attack action unlocks
      // the dual-wield off-hand bonus attack (gated in the UI).
      ...(isLight && !isRangedWeapon ? { lightWeapon: true } : {}),
      concentration: false,
      summary,
      costsSlot: false,
      pinned: !unpinnedSet.has(weaponId),
      defaultPinned: true,
    });
  }

  // 3b. Manifested weapons (Soulknife Psychic Blades): feature-created weapons
  //     that aren't in `character.weapons`, so the carried-weapon loop misses
  //     them. Resolve their attack rows (main + optional bonus-action blade)
  //     from the character's scores like a real weapon.
  for (const row of resolveManifestedWeaponAttacks(grantAgg.manifestedWeapons, {
    abilityScores: ctx.abilityScores, // D2 — effective scores (set-score floors)
    classWeaponProfs,
    weaponAttackAbilities: grantAgg.weaponAttackAbilities,
    pb,
    exPenalty,
    overrides: session.manifestedWeaponOverrides,
    unpinnedSet,
    // G25 — a Psychic Blade is a weapon (RAW), so a "weapon"/"melee-weapon" rider
    // rides it via the SHARED resolver (golden rule 6).
    damageRiders: grantAgg.damageRiders,
    character,
  })) {
    actions.push(row);
  }

  // 3b-bis. Form attacks (Wild Shape / Arcane Armor / Starry Form): natural
  //     weapons a form grants while its toggle is lit. `grantAgg.formAttacks`
  //     already contains ONLY the rows of currently-active forms (the evaluator
  //     gates them inside the active `while-active` branch), so this augments the
  //     board with the form's attacks while active and contributes nothing
  //     otherwise. The mundane weapon rows stay available per the player's
  //     adjudication (override-first — the form is a player toggle).
  for (const row of resolveFormAttacks(grantAgg.formAttacks, {
    // B7 — RAW physical scores for a beast's natural weapon; EFFECTIVE for a
    // mental/spellcasting form attack (Armorer INT, Starry WIS). The resolver picks
    // per row on `fa.attackAbility`, so an item INT/WIS floor reaches those forms
    // (matching every sibling row) while a physical bite stays on the form's body.
    abilityScores: charData.abilityScores,
    effectiveScores: ctx.abilityScores,
    pb,
    exPenalty,
    // S12b — the level the form-attack die scales on (Stars Archer 1d8→2d8 at L10).
    level,
    overrides: session.manifestedWeaponOverrides,
    unpinnedSet,
  })) {
    actions.push(row);
  }

  // 3b-ter. Polymorph SELF-form beast attacks (S7): while the caster is
  //     polymorphed, the Beast's own PRINTED attack rows render on the Play board,
  //     resolved directly from the Beast catalogue (self-contained to-hit + dice).
  //     `[]` when not polymorphed.
  for (const row of resolveBeastFormAttacks(session, unpinnedSet)) {
    actions.push(row);
  }

  // 3c. Pact weapons (Warlock Pact of the Blade): a CONJURED weapon whose form
  //     is a player choice. Emit its configurable attack row (CHA attack +
  //     damage, player-chosen weapon/damage-type), override-first from
  //     session.pactWeaponConfig.
  for (const row of resolvePactWeaponAttacks(grantAgg.pactWeapons, {
    abilityScores: ctx.abilityScores, // D2 — effective scores (set-score floors)
    pb,
    exPenalty,
    config: session.pactWeaponConfig,
    unpinnedSet,
    // Pact-of-the-Blade riders (Eldritch Smite, Lifedrinker) ride the pact
    // weapon. Eldritch Smite's per-slot-level scaling reads the warlock's
    // Pact Magic slot level (all slots share one level for a Warlock).
    riders: grantAgg.pactWeaponRiders,
    pactSlotLevel: pactSlotLevel(level),
    riderTypeChoices: session.pactWeaponRiderTypes,
    // Lifedrinker's on-hit self-heal = a Hit Die roll + CON mod (min 1). The
    // Hit Die is the character's class die; Pact of the Blade is a Warlock
    // feature → d8 by default, but read the sheet's actual `hitDieType`.
    conMod: abilityModifier(ctx.abilityScores.CON), // D2 — effective CON (Amulet of Health)
    hitDieFace: charData.hitDieType,
  })) {
    actions.push(row);
  }

  // 4. Dual-Wield: if the character carries ≥2 Light melee weapons, emit an
  //    off-hand bonus action for each TYPE. Counted by QUANTITY, not entries —
  //    a pair of daggers stored as one entry (quantity 2) is two weapons and
  //    enables Two-Weapon Fighting exactly like two different Light weapons do.
  //    Off-hand damage = die only (no ability modifier) per RAW, UNLESS a source
  //    declares the "offhand-ability-mod" die modifier (Two-Weapon Fighting
  //    fighting style), which adds the wielder's ability modifier back.
  const lightMeleeCount = lightMeleeEntries.reduce((n, w) => n + w.quantity, 0);
  if (lightMeleeCount >= 2) {
    const hasTWF = grantAgg.damageDieModifiers.some(
      (m) => m.mode === "offhand-ability-mod" && m.appliesTo === "light-melee"
    );
    for (const w of lightMeleeEntries) {
      const offHandId = `${w.weaponId}-offhand`;
      // Self-contained damage riders ride the off-hand hit too, through the SAME
      // shared `resolveAttackDamageRiders` the main-hand row uses (golden rule
      // 6b). A light off-hand weapon is always MELEE (the dual-wield gate excludes
      // ranged), so it sees "weapon" + "melee-weapon" riders alike. We then drop
      // ONCE-PER-TURN riders (Zealot Divine Fury): they fire once per turn and are
      // already surfaced on the main row — double-listing them on the off-hand
      // would wrongly imply they apply on both hits in a turn. PER-HIT riders
      // (Divine Favor / Hunter's Mark — "each time you hit") correctly ride here.
      const offHandExtraDamage = resolveAttackDamageRiders(
        grantAgg.damageRiders,
        { kind: "weapon", isRanged: false, damageType: w.damageType },
        character,
        ctx.abilityScores
      ).filter((d) => !d.oncePerTurn);
      actions.push({
        id: offHandId,
        weaponId: w.srdWeaponId,
        // The weapon's own name ref; the "(off-hand)" suffix is appended by the
        // view (it's a fixed bilingual token, composed at the presenter edge from
        // the `offhand` flag below — the engine can't localize).
        name: w.name,
        type: "bonus",
        source: "weapon",
        offhand: true,
        spellLevel: null,
        concentration: false,
        summary: {
          attackBonus: w.attackBonus,
          // The off-hand shares the main hand's to-hit, so it carries the SAME
          // breakdown (#94) — surfaced on its own to-hit value.
          ...(w.attackBreakdown.length > 0 ? { attackBreakdown: w.attackBreakdown } : {}),
          damage: hasTWF ? w.damageFormula : w.damageDie,
          damageType: w.damageType,
          weaponRange: w.range,
          properties: w.properties,
          ...(w.weaponCategory ? { weaponCategory: w.weaponCategory } : {}),
          // The mastery rides every attack with the weapon, off-hand included.
          ...(w.weaponMastery ? { weaponMastery: w.weaponMastery } : {}),
          ...(offHandExtraDamage.length > 0 ? { extraDamage: offHandExtraDamage } : {}),
        },
        costsSlot: false,
        pinned: !unpinnedSet.has(offHandId),
        defaultPinned: true,
      });
    }
  }

  // 4b. Unarmed Fighting (fighting style): the Unarmed Strike deals 1d6/1d8 +
  //     STR Bludgeoning, plus 1d4 to a Grappled creature each turn. Emit its
  //     attack row from the `unarmed-strike` die modifier — there is no carried
  //     "weapon" for it, so the carried-weapon loop never produces this row.
  for (const m of grantAgg.damageDieModifiers) {
    const row = resolveUnarmedFightingAttack(m, {
      abilityScores: ctx.abilityScores, // D2 — effective scores (set-score floors)
      pb,
      exPenalty,
      unpinnedSet,
      // G25 — route feature riders through the SHARED resolver here too (block 4b
      // and 4c are mutually exclusive, so without this an Unarmed-Fighting build's
      // Divine Fury rider would silently vanish). The grapple die is merged in.
      damageRiders: grantAgg.damageRiders,
      character,
    });
    if (row) actions.push(row);
  }

  // 4c. Unarmed Strike from an `unarmed-strike-die` upgrade (Monk Martial Arts,
  //     College of Dance Bardic Damage). A Monk's Unarmed Strike is their MAIN
  //     attack, yet no carried "weapon" produces a row — so without this a Monk
  //     had no attack row in Combat at all (the Martial Arts die only showed as a
  //     Features-page chip). `effectiveUnarmedStrike` resolves the best die +
  //     attack ability (DEX vs STR) + scaled `classSpecific:martialArtsDie`.
  //     Skipped when 4b already produced an Unarmed Strike row (Unarmed Fighting).
  if (
    grantAgg.unarmedStrikeDice.length > 0 &&
    !actions.some((a) => a.id === "unarmed-strike")
  ) {
    // Resolve each upgrade's deferred `classSpecific:<key>` die against ITS OWN
    // source feature's owning class at the character's level in that class (Monk
    // Martial Arts → Monk level, College of Dance → Bard level) — never one
    // shared primary-class row read at the total character level (multiclass-
    // correct). `featureClassRow` already does the per-class own-level lookup.
    const deferredResolve = (sourceId: string | undefined, key: string) =>
      sourceId ? featureClassRow(sourceId, character)?.[key] : undefined;
    const profile = effectiveUnarmedStrike(
      grantAgg.unarmedStrikeDice,
      ctx.abilityScores, // D2 — effective scores (set-score floors)
      level,
      deferredResolve,
      charData.proficiencyBonusOverride
    );
    const id = "unarmed-strike";
    // Empowered Strikes (Monk L6) etc. let the strike deal an ALTERNATE type at the
    // player's choice — fold the options into a damage-type CHOICE chip (reusing the
    // multi/choice rendering), so the row reads "d8+4 Bldg/Force". Dedup the base.
    const altTypes = grantAgg.unarmedStrikeDamageTypeOptions.filter(
      (t) => t !== profile.damageType
    );
    // G25 — self-contained damage riders that ride the Unarmed Strike too, via the
    // SAME `resolveAttackDamageRiders` the carried-weapon row uses (golden rule 6):
    // a "melee-weapon" rider ("a weapon OR an Unarmed Strike" — Zealot Divine Fury)
    // DOES ride; a "weapon"-only rider does NOT (an Unarmed Strike isn't a weapon).
    const extraDamage = resolveAttackDamageRiders(
      grantAgg.damageRiders,
      { kind: "unarmed", damageType: profile.damageType },
      character,
      ctx.abilityScores
    );
    // Elemental Attunement (+10 ft while active) — a `weapon-reach-bonus` rider
    // rides the Unarmed Strike too (RAW: the reach buff names Unarmed Strikes).
    // An Unarmed Strike is never Heavy/Versatile, so only `all-melee` riders apply.
    const { reachBonusFt } = resolveMeleeReachBonus(grantAgg.weaponReachBonuses, false);
    const summary: RawActionSummary = {
      attackBonus: profile.attackBonus + exPenalty,
      damage: profile.damage,
      damageType: profile.damageType,
      // Melee reach — 5 ft base + any active reach rider; the view formats it.
      weaponRange: { kind: "melee", reachFt: 5 + reachBonusFt },
      // 2024 Improved/Superior Critical covers Unarmed Strikes too.
      ...(grantAgg.critThreshold < 20 ? { critRange: grantAgg.critThreshold } : {}),
      ...(extraDamage.length > 0 ? { extraDamage } : {}),
    };
    if (altTypes.length > 0) {
      summary.damageTypes = [profile.damageType, ...altTypes];
      summary.multiDamageTypeFlavor = "choice";
    }
    actions.push({
      id,
      name: litText({ en: "Unarmed Strike", it: "Colpo Senz'armi" }),
      type: "action",
      source: "weapon",
      spellLevel: null,
      concentration: false,
      summary,
      costsSlot: false,
      pinned: !unpinnedSet.has(id),
      defaultPinned: true,
    });
  }

  // 5. Potions from the inventory (Bonus Action to drink — 2024 rules).
  //    Potion-ness + heal formula are DERIVED from the SRD catalogue via the SHARED
  //    `resolveItemConsumable` (the SAME source the inventory panel uses — golden
  //    rule 6), NOT read off the ref: the minimal/imported ref carries only quantity,
  //    so a freshly imported `potion-of-healing` (a magic item) still surfaces here.
  //    Consuming one spends the item's quantity (the cost-engine `equipment` cost).
  for (const itemRef of charData.equipment) {
    const { isPotion, potionFormula, isConsumable } = resolveItemConsumable(itemRef);
    if (!isPotion) continue;
    const qty = itemRef.quantity ?? 1;
    if (qty <= 0) continue;

    const isCustomItem = "custom" in itemRef;
    const id = isCustomItem
      ? `item-custom-${itemRef.name.toLowerCase().replace(/\s+/g, "-")}`
      : `item-${itemRef.srdId}`;
    // Resolve the name through the MAGIC-ITEM index too (Potion of Healing is a
    // magic item, not gear) so the action localizes off the catalogue. Custom
    // items carry user text; the SRD fallback derives a title from the id.
    let name: LocText;
    if (isCustomItem) {
      name = customText(itemRef.name);
    } else if (getMagicItem(itemRef.srdId)) {
      name = srdText("magic-item", itemRef.srdId, "name");
    } else if (getEquipment(itemRef.srdId)) {
      name = srdText("equipment", itemRef.srdId, "name");
    } else {
      name = customText(
        itemRef.srdId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      );
    }

    const equipmentKey = isCustomItem ? `custom-${itemRef.name}` : itemRef.srdId;

    // A healing potion shows its heal verdict; any other potion (Giant Strength,
    // Fire Breath, …) shows a short effect from its SRD description (BiText data).
    const summary: RawActionSummary = { uses: { current: qty, total: qty } };
    if (potionFormula) {
      summary.healing = potionFormula;
    } else if (!isCustomItem && srdEn("magic-item", itemRef.srdId, "description")) {
      // The item's summary-or-description ref (never sliced) — every potion
      // without a heal formula carries an authored `summary` (guard-enforced).
      summary.effect = srdEffectText("magic-item", itemRef.srdId);
    }

    actions.push({
      id,
      name,
      // Economy slot from the SHARED helper (a potion is a Bonus Action) so the combat
      // card and the inventory badge derive the same economy + colour (golden rule 6).
      type: consumableActionSlot({ isPotion, isConsumable }),
      source: "feature",
      spellLevel: null,
      concentration: false,
      summary,
      costsSlot: false,
      pinned: pinnedSet.has(id),
      defaultPinned: false,
      costEquipment: equipmentKey,
    });
  }

  return actions;
}

/**
 * Section 6 + 7 — the universal action tail: the always-available base combat
 * actions (Dash, Dodge, Help, …) followed by the resolved temporary-HP grants
 * (Dark One's Blessing, Adrenaline Rush, …). Kept together as the final resolver
 * so `resolveActions`' output order is byte-for-byte identical to the monolith.
 */
/**
 * The set of GRANT-SOURCE ids that already emit their OWN combat action card
 * from `mechanics.actions` — SRD class-features / feats (keyed by the feature
 * srdId) and race traits (keyed by the `race:<id>:<trait.id>` session id, the
 * SAME identity a `temp-hp` grant on that trait carries as its `sourceId`).
 *
 * `resolveTemporaryHpActions` consults this so a temp-HP grant whose owner ALSO
 * declares a bonus/action card (Orc Adrenaline Rush: a `temp-hp` grant beside a
 * `mechanics.actions` Dash → the action card already conveys the temp-HP gain)
 * does NOT mint a SECOND, semantically-duplicate "Gain N temporary HP" card
 * (the four-Adrenaline-Rush-cards report). The standalone temp-HP card stays the
 * SOLE surfacing for a source with no action of its own (Dark One's Blessing).
 * Keyed on stable SEMANTIC identity, never a per-path action id (golden rule 7).
 */
function featureActionSourceIds(character: CharacterDoc): Set<string> {
  const { character: charData } = character;
  const ids = new Set<string>();
  for (const featureRef of charData.features) {
    if ("custom" in featureRef) continue;
    const srdFeature = getSrdFeatureMechanics(featureRef.srdId);
    if (srdFeature?.mechanics?.actions?.length) ids.add(srdFeature.id);
  }
  const race = getRace(charData.race) ?? getRace(charData.race.toLowerCase());
  if (race) {
    for (const trait of race.traits) {
      if (trait.mechanics?.actions?.length) {
        ids.add(raceTraitSessionId(race.id, trait));
      }
    }
  }
  return ids;
}

function resolveTemporaryHpActions(
  character: CharacterDoc,
  ctx: ActionResolveCtx
): RawResolvedAction[] {
  const { charData, session, pinnedSet } = ctx;
  const actions: RawResolvedAction[] = [];

  // RA-04 — the 2024 Unarmed Strike Grapple/Shove DC (8 + STR mod + PB), wiring the
  // previously-dead `unarmedStrikeSaveDc`. The target rolls a Strength or Dexterity
  // save against it (the app never models the enemy — golden rule 21). Displayed as
  // the save-DC chip on the two base cards below (STR is the governing ability).
  const unarmedStrikeDc = unarmedStrikeSaveDc(
    ctx.abilityScores.STR,
    ctx.level,
    charData.proficiencyBonusOverride
  );

  // 6. Universal base combat actions (always available, every character)
  for (const ba of BASE_ACTIONS) {
    // RA-04 — Grapple/Shove carry the live Unarmed Strike save DC (STR-governed);
    // every other base action forces no save.
    const isUnarmedStrikeOption = ba.id === "base-grapple" || ba.id === "base-shove";
    // The base action menu is an engine-authored bilingual table (not SRD data).
    actions.push({
      id: ba.id,
      name: litText(ba.name),
      type: ba.type,
      source: "feature",
      spellLevel: null,
      concentration: false,
      summary: {
        effect: litText(ba.effect),
        ...(ba.trigger ? { trigger: litText(ba.trigger) } : {}),
        ...(isUnarmedStrikeOption ? { saveDC: unarmedStrikeDc, saveAbility: "STR" } : {}),
      },
      costsSlot: false,
      pinned: pinnedSet.has(ba.id),
      defaultPinned: false,
    });
  }

  // 7. Temporary-HP grants (Dark One's Blessing, Adrenaline Rush, Defensive
  //    Field, Vitality Surge, …). Each resolves its formula to a concrete
  //    number and surfaces a deterministic "Gain N temporary HP" entry the
  //    player applies manually — override-first, the engine NEVER auto-applies
  //    temp HP (D&D temp HP don't stack; the player keeps the higher pool).
  //    Aggregated from the SAME feature+invocation grant sources the weapon and
  //    spell sections use, gated on the active-feature + bundle-choice context.
  const tempHpGrants = evaluateGrants(
    [
      ...resolveGrantSourcesForFeatures(charData.features),
      // Species traits live OUTSIDE features[] (Orc Adrenaline Rush, Shifter
      // Shifting grant temp HP) — resolve them from `character.race` exactly like
      // resolveActions/resolveTrackers do, so a race-trait temp-HP grant surfaces.
      ...resolveGrantSourcesForRace(charData.race),
      ...resolveGrantSourcesForInvocations(allEntryPicks(charData, "invocationChoices")),
    ],
    new Set(session.activeFeatures ?? []),
    new Map(Object.entries(session.grantBundleChoices ?? {}))
  ).tempHpGrants;
  // A race trait's grant `sourceId` is the `race:<id>:<trait.id>` session id (NOT a
  // raceFeatureIndex key), so `getSrdFeatureMechanics` can't resolve it — match it
  // back to its trait to localize the name/description off the race catalogue.
  const race = getRace(charData.race) ?? getRace(charData.race.toLowerCase());
  const raceTraitBySessionId = new Map<string, SrdRaceTrait>();
  if (race) {
    for (const trait of race.traits) {
      raceTraitBySessionId.set(raceTraitSessionId(race.id, trait), trait);
    }
  }
  // A temp-HP grant whose owning feature/trait ALREADY emits its own action card
  // (Orc Adrenaline Rush: the `temp-hp` grant sits beside a `mechanics.actions`
  // Dash) must NOT mint a second, duplicate "Gain N temporary HP" card — that
  // card's source is the SAME single bonus action (the four-card report). One
  // semantic mechanic = one card. The standalone temp-HP card remains the SOLE
  // surfacing for a source with no action of its own (Dark One's Blessing).
  const actionBearingSources = featureActionSourceIds(character);
  for (const thp of tempHpGrants) {
    // USE-APPLIES (2026-06-12) — a SLOT-gated temp-HP grant (Orc Adrenaline Rush,
    // Shifter Shifting, Chef) AUTO-APPLIES through its real action card
    // (`useEffects`), so the standalone "Gain N temporary HP" manual card is a
    // DUPLICATE (golden rule 10 — supersede ⇒ remove the old). Independently, a
    // source that already emits its OWN action card must never mint a twin card
    // (the four-card report). Only slot-LESS, triggered/passive gains on a source
    // with no action of its own (Dark One's Blessing, "when you reduce an enemy
    // to 0 HP") still surface a manual entry. The override-first temp HP field
    // stays editable in the rail.
    if (thp.slot !== undefined || actionBearingSources.has(thp.sourceId)) continue;
    const amount = resolveTempHp(thp.formula, character);
    const raceTrait = race ? raceTraitBySessionId.get(thp.sourceId) : undefined;
    const srdFeature = raceTrait ? undefined : getSrdFeatureMechanics(thp.sourceId);
    // Feature name = its catalogue ref (race trait → race catalogue; class
    // feature/feat → its own; fallback: the source id). The dynamic "Gain N temp
    // HP" effect is an engine literal (the number is a computed fact).
    const featureName: LocText =
      race && raceTrait
        ? raceTraitLoc(race.id, raceTrait, "name")
        : srdFeature
          ? featLoc(srdFeature, "name")
          : customText(thp.sourceId);
    const effect: LocText = litText({
      en: `Gain ${amount} temporary HP`,
      it: `Ottieni ${amount} PF temporanei`,
    });
    const id = `temphp-${thp.sourceId}`;
    actions.push({
      id,
      name: featureName,
      // Only slot-LESS (triggered/passive) gains reach here (the slot-gated ones
      // `continue` above — they auto-apply through their action). A triggered gain
      // surfaces as a FREE entry so it never consumes the action economy.
      type: "free",
      source: "feature",
      spellLevel: null,
      concentration: false,
      summary: {
        effect,
        ...(thp.trigger ? { trigger: thp.trigger } : {}),
      },
      // S8 ONE-TAP — carry the resolved amount as a STRUCTURED `useEffects` entry
      // (mirroring the slot-gated Adrenaline Rush path), so committing this card
      // AUTO-APPLIES the temp HP through the shared max-wins `gainTempHp` seam with
      // undo + the `useGainedTempHp` toast — no re-typing into the rail. The
      // amount is `resolveTempHp` (dice-free by construction, golden rule 21), so
      // every entry is a deterministic number safe to apply on tap. Override-first:
      // the temp-HP rail field stays editable.
      useEffects: [{ kind: "temp-hp", amount, sourceId: thp.sourceId }],
      costsSlot: false,
      pinned: pinnedSet.has(id),
      defaultPinned: false,
      ...(race && raceTrait
        ? { description: raceTraitLoc(race.id, raceTrait, "description") }
        : srdFeature
          ? { description: featLoc(srdFeature, "description") }
          : {}),
    });
  }

  return actions;
}

// ─── Short Rest Recovery ────────────────────────────────────────────────────

/**
 * Compute which trackers recover (and by how much) when a Short Rest is taken.
 *
 * Returns a Map of `{ trackerId → amount }` where:
 * - `"all"` means restore full uses (set used → 0)
 * - A number N means restore exactly N uses (reduce used by N, floor at 0)
 *
 * Only trackers whose effective recovery is "short-rest" or
 * "short-or-long-rest" are included.
 */
export function getShortRestRecoveries(
  character: CharacterDoc
): Map<string, number | "all"> {
  const result = new Map<string, number | "all">();

  // Add one tracker's short-rest recovery to the map when it recovers on a
  // short rest (or declares a partial short-rest recovery). Shared by the
  // primary tracker and any `extraTrackers` so multi-tracker features recover
  // every resource. `scalingLevel` is the feature's OWNING-class level (B2) so a
  // `shortRestRecovery` formula's `"level"` term scales correctly for a
  // multiclass character. Returns nothing — only sets the map when applicable.
  const addRecovery = (id: string, spec: TrackerSpec, scalingLevel: number): void => {
    if (
      spec.recovery === "short-rest" ||
      spec.recovery === "short-or-long-rest" ||
      spec.shortRestRecovery !== undefined
    ) {
      // CQ5 — formula-accepting shortRestRecovery: if it's a string other than
      // "all", evaluate it through the tracker-total formula language
      // (e.g. "ceil(level/2)" for Sorcerous Restoration).
      const raw = spec.shortRestRecovery;
      let resolved: number | "all";
      if (typeof raw === "string") {
        resolved =
          raw === "all" ? "all" : resolveTrackerTotal(raw, character, scalingLevel);
      } else {
        resolved = raw ?? "all";
      }
      result.set(id, resolved);
    }
  };

  for (const featureRef of character.character.features) {
    if ("custom" in featureRef) continue;

    const srdFeature = getSrdFeatureMechanics(featureRef.srdId);
    if (!srdFeature?.mechanics?.tracker) continue;

    // B2 — the feature's OWNING-class level gates its `levels[]` (Bard 5's Font
    // of Inspiration flips Bardic Inspiration's recovery to short-rest): a Bard 4
    // / Cleric 2 (total 6) must read Bard level 4, not the total. The SAME
    // `featureScalingLevel` the rail + action card use; feats / race traits fall
    // back to the total level by construction.
    const scalingLevel = featureScalingLevel(featureRef.srdId, character);
    const baseSpec = resolveTrackerSpec(srdFeature.mechanics.tracker, scalingLevel);
    // CQ5 — honor per-character trackerOverrides for shortRestRecovery so users
    // (and the level-up engine) can change short-rest semantics without forking
    // the SRD data.
    const spec = applyTrackerOverrides(baseSpec, featureRef.trackerOverrides);
    // Include trackers that recover on a short rest, OR that define a partial
    // short-rest recovery even when full recovery is on a long rest (e.g. Psi
    // Warrior / Soulknife / Wild Shape: regain 1 on a short rest).
    addRecovery(srdFeature.id, spec, scalingLevel);

    // Multi-tracker features recover their extra trackers too (Psi Warrior's
    // Telekinetic Movement gate → full recovery on a Short or Long Rest).
    const extraTrackers =
      "extraTrackers" in srdFeature.mechanics
        ? (srdFeature.mechanics.extraTrackers ?? [])
        : [];
    for (const extraSpec of extraTrackers) {
      addRecovery(
        extraSpec.id,
        resolveTrackerSpec(extraSpec, scalingLevel),
        scalingLevel
      );
    }
  }

  // Derived per-spell free-cast trackers (the short-rest heritage feats and
  // similar free-cast feats) recover their slotless cast on a SHORT rest —
  // driven by the SAME iterator that builds the rail rows so the recovery key and
  // the row key can never drift. Long-rest free-casts are wiped wholesale by
  // `longRest` (characterStore) and need no entry here.
  forEachFeatFreeCast(character, (fc) => {
    if (fc.rest === "short") result.set(fc.id, "all");
  });

  return result;
}

// ─── Long Rest Heroic Inspiration ──────────────────────────────────────────

/**
 * Whether finishing a Long Rest auto-grants the character Heroic Inspiration
 * (Human's Resourceful trait, via the `heroic-inspiration-on-rest` grant).
 *
 * This is the canonical CONSUMER of the `heroicInspirationOnLongRest` aggregate:
 * the Long Rest action sets `session.inspiration = true` when this returns true,
 * mirroring how the action reads `exhaustionRecoveryBonus`. It is override-first
 * — the result only flips the default; the player can still toggle Inspiration
 * off afterward (state lives on the existing `SessionState.inspiration` boolean,
 * which this never reads). Returns `false` for any character without a granting
 * source, so non-Humans are unaffected.
 */
export function gainsHeroicInspirationOnLongRest(character: CharacterDoc): boolean {
  // Resourceful is a RACE trait (Human), which lives in the race's trait list —
  // NOT in `character.features` — so the aggregate must be over the FULL grant
  // sources (race + features + …), or a real Human's trait never reaches the
  // consumer. `resolveAllGrantSources` is the same fan-in the other CharacterDoc
  // consumers (`resolveActiveMaintainedEffects`) already use.
  return evaluateGrants(
    resolveAllGrantSources(character.character),
    new Set(character.session.activeFeatures ?? []),
    new Map(Object.entries(character.session.grantBundleChoices ?? {}))
  ).heroicInspirationOnLongRest;
}

/**
 * D2 — the EFFECTIVE ability scores the COMBAT/CAST engine resolves against:
 * `effectiveAbilityScores(stored, floors, itemBonus, itemCaps)`. Set-score items
 * (Gauntlets of Ogre Power → STR 19, Headband of Intellect → INT 19, Amulet of
 * Health → CON 19, Belt of Giant Strength → STR 21-29) aggregate a FLOOR; ADDITIVE
 * items (Belt of Dwarvenkind +2 CON, +2 Ioun stones) aggregate a per-ability bonus
 * (magic-item-sourced ONLY). This is the SAME derivation the DISPLAY surfaces
 * (LeftHud / CombatHeader / PDF) use, so attack/damage/save/DC and the cast score
 * reflect both the set score AND the additive bonus (rule 6 — one source). The
 * channels come from `resolveAllGrantSources` (it sees equipped + attuned items),
 * NOT `resolveGrantSourcesForFeatures` (features only). Feat ASIs are baked into the
 * stored scores at creation, so the additive channel — magic-item-filtered in the
 * evaluator — can NEVER double-count them. Behaviour-preserving with no ability-
 * score item equipped (floors/bonus empty → an equal-valued copy of stored scores).
 */
function combatAbilityScores(character: CharacterDoc): Record<AbilityCode, number> {
  const agg = evaluateGrants(
    resolveAllGrantSources(character.character),
    new Set(character.session.activeFeatures ?? []),
    new Map(Object.entries(character.session.grantBundleChoices ?? {}))
  );
  return effectiveAbilityScores(
    character.character.abilityScores,
    agg.abilityScoreFloors,
    agg.itemAbilityScoreBonus,
    agg.itemAbilityScoreCap
  );
}

/**
 * Aggregate a character's feature grants, honouring the session's active-feature
 * toggles and choice bundles. Shared by the CharacterDoc-level consumers below.
 */
function aggregateForCharacter(character: CharacterDoc) {
  return evaluateGrants(
    resolveGrantSourcesForFeatures(character.character.features),
    new Set(character.session.activeFeatures ?? []),
    new Map(Object.entries(character.session.grantBundleChoices ?? {}))
  );
}

// ════════════════════════════════════════════════════════════════════════════
// HP-band helper + start-of-turn regen consumer
// ════════════════════════════════════════════════════════════════════════════

/**
 * Whether the character is Bloodied — `0 < current HP ≤ ⌊max HP / 2⌋` (2024 RAW).
 * Looks at HP only (NOT temporary HP). A degenerate max of 0 is never Bloodied, and
 * a character at 0 HP is DYING/unconscious — NOT Bloodied (the dying surface owns the
 * ≤ 0 band). This is the ONE Bloodied predicate every reader shares (rule 6): the
 * Heroic Rally regen consumer, the HP-control Bloodied mark, and the Bloodied boon
 * toggle gate. (The regen consumer ALSO gates on `requiresMinHp`, so this guard is
 * belt-and-suspenders there — but it is the SINGLE source for the UI band too.)
 */
export function isBloodied(character: CharacterDoc): boolean {
  // D1 — Bloodied is half of the EFFECTIVE max (stored base + hp-flat boons + Aid),
  // so a Draconic / Boon-of-Fortitude / Aided character's Bloodied threshold tracks
  // their real max, not the understated stored base (rule 6 — one source for max).
  // The band arithmetic itself lives in ONE pure helper (`bloodiedFromHp`) the UI
  // hook shares, so the two derivations can never drift (rule 6). A degenerate
  // `max ≤ 0` is handled inside the helper (the `> 0` band test fails).
  const max = effectiveMaxHp(character.character, character.session);
  return bloodiedFromHp(character.session.hp.current, max);
}

/** A resolved start-of-turn HP-regain entry the (UI-owned) renderer surfaces. */
export interface StartOfTurnRegenEntry {
  sourceId: string;
  amount: number;
  condition: "bloodied" | "always";
  active: boolean;
  /** `true` when the amount is TEMPORARY HP (Heroism), applied through the
   *  max-wins `gainTempHp` seam; `false` = a normal heal (Heroic Rally). */
  asTempHp: boolean;
}

/**
 * Resolve every `regen-at-turn-start` rider (Champion Survivor "Heroic Rally":
 * regain 5 + CON mod while Bloodied with ≥ 1 HP). Each entry reports the
 * resolved `amount` (so the UI can preview it even when dormant) and whether its
 * guard is met against the CURRENT session HP. Override-first — never mutates
 * `session.hp`; the player applies the heal.
 */
export function resolveStartOfTurnRegen(
  character: CharacterDoc
): StartOfTurnRegenEntry[] {
  const bloodied = isBloodied(character);
  const hasMinHp = character.session.hp.current >= 1;
  // Aggregate over the FULL source set (features + items + standing spell buffs),
  // so a while-active BUFF SPELL's start-of-turn temp-HP grant reaches here
  // (Heroism) — the features-only aggregate would drop it. Heroic Rally (a feature)
  // is a subset, so its behaviour is unchanged.
  return aggregateCharacterGrants(
    character.character,
    character.session
  ).startOfTurnRegen.map((r) => {
    const conditionMet = r.condition === "always" || bloodied;
    // A heal never fires from unconscious (`requiresMinHp`); TEMPORARY HP (Heroism)
    // is unguarded — temp HP don't revive you, so the ≥1-HP gate doesn't apply.
    const guardMet = r.asTempHp ? true : r.requiresMinHp ? hasMinHp : true;
    return {
      sourceId: r.sourceId,
      amount: resolveTempHp(r.amount, character),
      condition: r.condition,
      active: conditionMet && guardMet,
      asTempHp: r.asTempHp,
    };
  });
}

/** A resolved round-1 save-gated damage-doubler note (Assassin Death Strike). */
export interface Round1DamageDoubleEntry {
  sourceId: string;
  /** The TARGET's save ability (Death Strike: CON). */
  saveAbility: AbilityCode;
  /** The resolved save DC (8 + PB + the governing ability mod, via `featureSaveDc`). */
  saveDC: number;
}

/**
 * Resolve every `round1-damage-double` note (Death Strike): the target's save
 * ability + the concrete DC (routed through the ONE `featureSaveDc` formula, PB
 * from total level, over the EFFECTIVE scores so a set-score item lifts the DEX
 * DC). DISPLAY-ONLY — the engine never doubles anything (golden rule 21); the UI
 * shows these ONLY while combat round === 1 (the same round-1 gate Assassinate's
 * attack advantage uses). Empty for a character without the feature.
 */
export function resolveRound1DamageDoubles(
  character: CharacterDoc
): Round1DamageDoubleEntry[] {
  const agg = aggregateCharacterGrants(character.character, character.session);
  if (agg.round1DamageDoubles.length === 0) return [];
  const level = totalLevel(character.character);
  const scores = combatAbilityScores(character);
  return agg.round1DamageDoubles.map((r) => ({
    sourceId: r.sourceId,
    saveAbility: r.saveAbility,
    saveDC: featureSaveDc(
      level,
      scores[r.saveDcAbility],
      character.character.proficiencyBonusOverride
    ),
  }));
}

// ════════════════════════════════════════════════════════════════════════════
// USE-APPLIES (Task 2) — active maintained-effect resolver
// ════════════════════════════════════════════════════════════════════════════

/**
 * An active `while-active` state that carries a `"maintained"` duration (Rage),
 * resolved for the turn loop. The combat End-Turn handler reads these to decide
 * which states need a keep/end prompt when their maintenance condition wasn't met
 * this round. `timed` states (Innate Sorcery) are NOT returned — they have no
 * per-turn maintenance, so the turn loop never prompts them.
 */
export interface ActiveMaintainedEffect {
  /** The session toggle key (`session.activeFeatures` entry) — e.g. "barbarian-rage". */
  activeKey: string;
  /** Source feature id (provenance — the prompt label resolves off it). */
  sourceId: string;
  /** In-combat events that EXTEND the state for another round. */
  maintainedBy: ReadonlyArray<"attack" | "bonus-extend" | "damage-taken">;
  /** The cap past which the state auto-ends (Rage = 10 minutes). */
  maxMinutes?: number;
  /** FRONTIER-S3 — the same cap in ROUNDS the turn/round engine counts down. */
  maxRounds?: number;
}

/**
 * Resolve every CURRENTLY-ACTIVE `while-active` state that declares a
 * `"maintained"` duration (Task 2). Walks the character's full grant sources
 * (features + items + invocations + …) for `while-active` grants whose
 * `activeKey` is lit in `session.activeFeatures` AND whose `duration.kind` is
 * `"maintained"`. PURE + generic — Rage is found here purely as data; Bladesong
 * / Innate Sorcery (`timed`) are correctly excluded, and any future maintained
 * state lights up with zero new code. Dedupes by `activeKey` (a state declared
 * across several features — Rage's L11 immunity block — yields ONE entry).
 */
export function resolveActiveMaintainedEffects(
  character: CharacterDoc
): ActiveMaintainedEffect[] {
  const active = new Set(character.session.activeFeatures ?? []);
  if (active.size === 0) return [];
  const seen = new Set<string>();
  const out: ActiveMaintainedEffect[] = [];
  for (const source of resolveAllGrantSources(character.character)) {
    for (const g of source.grants ?? []) {
      if (g.type !== "while-active" || g.duration?.kind !== "maintained") continue;
      if (!active.has(g.activeKey) || seen.has(g.activeKey)) continue;
      seen.add(g.activeKey);
      out.push({
        activeKey: g.activeKey,
        sourceId: source.id,
        maintainedBy: g.duration.maintainedBy,
        ...(g.duration.maxMinutes !== undefined
          ? { maxMinutes: g.duration.maxMinutes }
          : {}),
        ...(g.duration.maxRounds !== undefined
          ? { maxRounds: g.duration.maxRounds }
          : {}),
      });
    }
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// FRONTIER-S3 — the duration / turn-round recovery engine
// ════════════════════════════════════════════════════════════════════════════

/**
 * Every TRACKER whose recovery cadence is `"per-turn"` AND that currently has at
 * least one expended use — the resolver the turn/round engine reads at the
 * OWNER's turn start to reset them to full (Sneak Attack's single "once per
 * turn" use). PURE + generic: reuses `resolveTrackers` (the SAME emitter the rail
 * reads — one source of truth, golden rule 6), so a per-turn tracker is found
 * here purely from its declared `recovery`, no per-feature branch. Returns only
 * the ids that need resetting, so the store action no-ops when nothing is spent.
 */
export function resolvePerTurnRecoveryTrackerIds(character: CharacterDoc): string[] {
  return resolveTrackers(character)
    .filter(
      (tr) =>
        tr.recovery === "per-turn" && (character.session.trackers[tr.id]?.used ?? 0) > 0
    )
    .map((tr) => tr.id);
}

/**
 * A `while-active` state with a ROUND-based duration cap (`maxRounds`) that is
 * currently ACTIVE — what the turn/round engine arms a countdown for and counts
 * down at each End Turn. Generic over `maintained` AND `timed` durations: both
 * may carry `maxRounds` (Rage's 100 rounds; a 1-minute Bladesong = 10). PURE — no
 * feature special case; a future timed state lights up with zero new code.
 */
export interface ActiveTimedEffect {
  /** The session toggle key (`session.activeFeatures` entry). */
  activeKey: string;
  /** Source feature id (provenance — the expiry log line resolves off it). */
  sourceId: string;
  /** The round cap the countdown arms to when the state lights. */
  maxRounds: number;
}

/**
 * Resolve every CURRENTLY-ACTIVE `while-active` state that declares a `maxRounds`
 * round-duration cap (FRONTIER-S3). Walks the full grant sources for `while-active`
 * grants whose `activeKey` is lit AND whose `duration.maxRounds` is set (either
 * `maintained` — Rage — or `timed`). Deduped by `activeKey` (a state spread across
 * features yields ONE entry). The turn/round engine reads these to arm + count down
 * each state's timer and AUTO-DROP it at 0. PURE + generic — Rage is found purely as
 * data.
 */
export function resolveActiveTimedEffects(character: CharacterDoc): ActiveTimedEffect[] {
  const active = new Set(character.session.activeFeatures ?? []);
  if (active.size === 0) return [];
  const seen = new Set<string>();
  const out: ActiveTimedEffect[] = [];
  for (const source of resolveAllGrantSources(character.character)) {
    for (const g of source.grants ?? []) {
      if (g.type !== "while-active" || g.duration?.maxRounds === undefined) continue;
      if (!active.has(g.activeKey) || seen.has(g.activeKey)) continue;
      seen.add(g.activeKey);
      out.push({
        activeKey: g.activeKey,
        sourceId: source.id,
        maxRounds: g.duration.maxRounds,
      });
    }
  }
  return out;
}

/** One state whose round timer reached 0 this End Turn — to drop + log. */
export interface ExpiredTimedEffect {
  activeKey: string;
  sourceId: string;
}

/**
 * The turn/round-engine countdown step (FRONTIER-S3) — PURE, applied at the
 * End-Turn seam. Given the character it computes the NEXT `effectTimers` map and
 * the states that EXPIRED:
 *
 *  1. Every active `maxRounds` state that has NO timer yet is ARMED to its cap
 *     (the state was lit since last End Turn — e.g. Rage just activated).
 *  2. Every armed timer DECREMENTS by one round.
 *  3. A timer that reaches 0 marks its state EXPIRED (the engine drops the
 *     toggle + logs the expiry) and is removed from the map.
 *  4. Stale timers for states no longer active are pruned (the player ended the
 *     state by hand, or it dropped via the maintenance prompt).
 *
 * The `maintained` rule is unchanged and lives in the consumer (the keep/end
 * prompt): a hard `maxRounds` expiry is a SEPARATE, automatic drop — a Rage that
 * is being maintained every round STILL ends at 100 rounds (RAW: "you can maintain
 * a Rage for up to 10 minutes" = 100 rounds). Override-first holds: the player can re-activate.
 */
export function advanceEffectTimers(character: CharacterDoc): {
  timers: Record<string, { roundsLeft: number }>;
  expired: ExpiredTimedEffect[];
} {
  const prev = character.session.effectTimers ?? {};
  const activeTimed = resolveActiveTimedEffects(character);
  const next: Record<string, { roundsLeft: number }> = {};
  const expired: ExpiredTimedEffect[] = [];
  for (const eff of activeTimed) {
    // Arm a fresh state to its cap; otherwise decrement its existing countdown.
    const current = prev[eff.activeKey]?.roundsLeft ?? eff.maxRounds;
    const roundsLeft = current - 1;
    if (roundsLeft <= 0) {
      // Timer elapsed → drop the state + log the expiry (handled by the engine
      // consumer). No timer entry survives.
      expired.push({ activeKey: eff.activeKey, sourceId: eff.sourceId });
    } else {
      next[eff.activeKey] = { roundsLeft };
    }
  }
  // S9 — SELF-SUSTAINING potion timers (`potion:<itemId>`): a consumed buff
  // potion has no persistent `while-active` source, so its countdown lives
  // PURELY in `effectTimers`. Carry every existing potion timer forward here,
  // decrementing + expiring it exactly like a while-active state. The expiry's
  // `sourceId` is the item id (parsed off the key) so the expiry log line
  // attributes the potion. Already-counted keys (a future overlap) are skipped.
  for (const [key, timer] of Object.entries(prev)) {
    if (!key.startsWith(POTION_TIMER_PREFIX) || next[key] !== undefined) continue;
    const roundsLeft = timer.roundsLeft - 1;
    if (roundsLeft <= 0) {
      expired.push({ activeKey: key, sourceId: key.slice(POTION_TIMER_PREFIX.length) });
    } else {
      next[key] = { roundsLeft };
    }
  }
  // Stale timers for states no longer active are simply not copied into `next`.
  return { timers: next, expired };
}

/** S9 — the `session.effectTimers` key prefix for a consumed buff-potion's
 *  self-sustaining round countdown (`potion:<itemId>`). */
export const POTION_TIMER_PREFIX = "potion:";

/** The `effectTimers` key for a consumed buff potion's duration countdown. */
export function potionTimerKey(itemId: string): string {
  return `${POTION_TIMER_PREFIX}${itemId}`;
}

/**
 * S9 — the round-duration a CONSUMED buff potion arms, or `undefined` for an
 * instant/non-timed potion. Reads the magic-item's `durationRounds` (1 minute =
 * 10 rounds, 1 hour = 600) straight from the SRD catalogue — PURE, no clock,
 * no RNG. The store's `consumePotionBuff` uses this to arm a `potion:<id>`
 * countdown in `effectTimers` (reusing the A2 cadence map); the cast/drink is
 * still the player's explicit act (override-first — the engine never auto-drinks
 * and never auto-applies the buff's stats).
 */
export function potionDurationRounds(itemId: string): number | undefined {
  const item = getMagicItem(itemId);
  return item?.durationRounds;
}

// ════════════════════════════════════════════════════════════════════════════
// B6 — per-turn extra-action budget (Action Surge / Haste)
// ════════════════════════════════════════════════════════════════════════════

/** Extra economy slots granted THIS turn beyond the default 1 of each. */
export interface ExtraActionBudget {
  /** Additional ACTION slots (Action Surge → 1). */
  action: number;
  /** Additional BONUS slots (Haste's limited action is modeled here). */
  bonus: number;
}

/**
 * The EXTRA action/bonus economy slots the character has THIS turn, summed from
 * every CURRENTLY-ACTIVE source that declares an `extra-action` grant (Fighter
 * Action Surge → +1 action; the Haste spell → +1 limited action). PURE + generic
 * — a source is found purely as data: an `extra-action` grant nested inside a
 * `while-active` block whose `activeKey` is lit in `session.activeFeatures`. The
 * budget is DERIVED on demand (never persisted — only round/initiative persist),
 * so it tracks the live active set and resets implicitly when the toggle drops.
 *
 * Override-first: the extra-action source is a player toggle (Action Surge lights
 * its `while-active` key when committed; the player drops it). The engine NEVER
 * auto-spends a slot — this resolver only RAISES the budget; the tap is the
 * explicit commit. Returns `{action:0, bonus:0}` when no source is active, so a
 * character without one keeps the default single-slot economy with zero new code.
 */
export function extraActionsThisTurn(character: CharacterDoc): ExtraActionBudget {
  const active = new Set(character.session.activeFeatures ?? []);
  let action = 0;
  let bonus = 0;
  if (active.size === 0) return { action, bonus };
  for (const source of resolveAllGrantSources(character.character)) {
    for (const g of source.grants ?? []) {
      // `extra-action` always rides a `while-active` toggle (the budget counts
      // only while the source is lit) — match the nesting, gated by the key.
      if (g.type !== "while-active" || !active.has(g.activeKey)) continue;
      for (const inner of g.grants) {
        if (inner.type !== "extra-action") continue;
        if (inner.slot === "action") action += inner.count;
        else bonus += inner.count;
      }
    }
  }
  return { action, bonus };
}

// ════════════════════════════════════════════════════════════════════════════
// Effective walking Speed (ft) + on-crit movement consumer
// ════════════════════════════════════════════════════════════════════════════

/**
 * The character's effective walking Speed in FEET (S13), in RAW order:
 *
 *   1. base Speed (parsed from the unit-bearing string);
 *   2. + the grant `speedBonusFt` (Mobile, Barbarian Fast Movement, Monk
 *      Unarmored Movement) + the gated `no-heavy-armor` bonus (Ranger Roving)
 *      when no Heavy armor is worn;
 *   3. × the aggregate `speedMultiplier` (Boots of Speed → ×2 while active) —
 *      multiplies (base + additive), rounded to whole feet (multipliers never
 *      stack in RAW; the evaluator already took the MAX factor);
 *   4. − the flat heavy-armor Strength penalty (−10 ft when worn body armor's
 *      `strengthReq` exceeds the wearer's EFFECTIVE Strength) − the Exhaustion
 *      reduction (−5 ft/level). Both are separate flat penalties applied AFTER
 *      the multiplier — the boots double your *Speed*, not the penalties.
 *
 * Floored at 0. `resolveSrd` (optional) lets the consumer inspect equipped armor
 * for the `no-heavy-armor` gate AND the Strength penalty. Override-first: with no
 * resolver the engine can't see armor, so it reports the more generous Speed
 * (applies the gated bonus, withholds the penalty) — and the UI pins the value
 * via `character.speedOverride` regardless.
 *
 * `round` (optional) is the combat round: when `1`, the round-1-only bonus
 * (`round1SpeedBonusFt` — Gloom Stalker Ambusher's Leap, +10 ft on the first
 * turn) is added, then auto-clears from round 2+. The SPEED counterpart of the
 * `advantage-on { round1 }` gate (Assassinate). Omitted / any other round = the
 * out-of-combat / later-round Speed (no first-turn bonus) — the persistent
 * stat-block surfaces leave it off; a combat-aware surface passes `round`.
 */
export function effectiveWalkingSpeedFt(
  character: CharacterDoc,
  resolveSrd?: (id: string) => SrdEquipmentData | undefined,
  round?: number
): number {
  const { character: charData } = character;
  const base = parseInt(charData.speed, 10);
  const baseFt = Number.isNaN(base) ? 0 : base;

  // Whole-character aggregate (sees EQUIPPED items) so item-sourced speed bonuses
  // AND the Boots-of-Speed `speed-multiplier` are honoured, not just feature ones.
  const agg = evaluateGrants(
    resolveAllGrantSources(charData),
    new Set(character.session.activeFeatures ?? []),
    new Map(Object.entries(character.session.grantBundleChoices ?? {}))
  );
  let bonus = agg.speedBonusFt;

  // Conditional `no-heavy-armor` bonus: apply unless we can confirm Heavy armor
  // is equipped (override-first — no resolver ⇒ apply the more generous Speed).
  const noHeavyBonus = agg.conditionalSpeedBonusFt["no-heavy-armor"] ?? 0;
  if (noHeavyBonus > 0) {
    const heavyEquipped = resolveSrd
      ? isHeavyArmorEquipped(charData.equipment, resolveSrd)
      : false;
    if (!heavyEquipped) bonus += noHeavyBonus;
  }

  // Round-1-only bonus (Ambusher's Leap, +10 ft) — applies ONLY on the first
  // combat turn; an additive walking-speed bonus like the others (pre-multiplier).
  if (round === 1) bonus += agg.round1SpeedBonusFt;

  const multiplied = Math.round((baseFt + bonus) * agg.speedMultiplier);

  // Heavy-armor Strength penalty (only when a resolver can confirm worn armor) —
  // resolved against the wearer's EFFECTIVE Strength (post-Gauntlets/Belt), the
  // same chokepoint the combat/score family uses.
  const armorPenaltyFt = resolveSrd
    ? resolveArmorEffects(
        charData.equipment,
        resolveSrd,
        combatAbilityScores(character).STR
      ).speedPenaltyFt
    : 0;

  const reduction = exhaustionSpeedReductionFt(character.session.exhaustion);
  const resolved = multiplied - armorPenaltyFt - reduction;

  // Walking-Speed FLOOR (Boots of Striding and Springing → 30): "Speed becomes
  // N unless it is already higher" — a MAX applied LAST, after the additive
  // bonuses, multiplier, and flat reductions, so an exhausted / armor-penalised
  // Speed still floors back up to `speedFloorFt`. Default 0 = no floor.
  return Math.max(0, resolved, agg.speedFloorFt);
}

/** Exhaustion walking-Speed reduction: −5 ft per Exhaustion level (2024 RAW). */
function exhaustionSpeedReductionFt(exhaustion: number): number {
  return Math.max(0, exhaustion) * 5;
}

/**
 * S13 — the self-side DISADVANTAGE the character has RIGHT NOW from wearing armor
 * their class lacks proficiency with (2024 RAW: Disadvantage on every STR + DEX
 * ability check, saving throw, and attack roll). The ONE doc-level resolver the
 * combat advantage/disadvantage list reads (PlayTab attack gloss + the rail's
 * Advantages section) — merged like the active-conditions clauses
 * (`resolveConditionEffects`). Resolves the EFFECTIVE armor-proficiency set
 * through the shared `effectiveArmorProficiencies` (the multiclass-aware
 * `featGateCtx` armor training layered with `armorProficiencyOverrides`) — the
 * SAME helper the Inventory per-item "Untrained" gloss reads, so the two
 * surfaces share BOTH the input set AND the `isArmorProficient` predicate and
 * are identical by construction (rule 6). Empty when the worn armor is all
 * proficient.
 */
export function armorDisadvantageClauses(
  character: CharacterDoc
): ReadonlyArray<AdvantageClause> {
  const { character: charData } = character;
  return resolveArmorEffects(
    charData.equipment,
    getEquipment,
    combatAbilityScores(character).STR,
    effectiveArmorProficiencies(charData)
  ).disadvantages;
}

/** A resolved on-crit movement option (Champion Remarkable Athlete). */
export interface OnCritMovementEntry {
  sourceId: string;
  distanceFt: number;
  ignoresOpportunityAttacks: boolean;
}

/**
 * Resolve every `on-crit-movement-rider` (Champion Remarkable Athlete: move up
 * to half your Speed without provoking Opportunity Attacks after a crit). The
 * distance is the rider's fraction of the effective walking Speed, rounded DOWN
 * (2024 RAW). Override-first — never moves the token.
 */
export function resolveOnCritMovement(character: CharacterDoc): OnCritMovementEntry[] {
  const speedFt = effectiveWalkingSpeedFt(character);
  return aggregateForCharacter(character).onCritMovement.map((r) => ({
    sourceId: r.sourceId,
    distanceFt: r.fraction === "full" ? speedFt : Math.floor(speedFt / 2),
    ignoresOpportunityAttacks: r.ignoresOpportunityAttacks,
  }));
}

// ════════════════════════════════════════════════════════════════════════════
// Replace-attack-with-cast consumer (Eldritch Knight War Magic)
// ════════════════════════════════════════════════════════════════════════════

/** A resolved replace-attack-with-cast option, capped at the character's attacks. */
export interface ReplaceAttackWithCastEntry {
  sourceId: string;
  attacks: number;
  classSpellList: string;
  minSpellLevel: number;
  maxSpellLevel: number;
  castTime: "action";
  totalAttacks: number;
}

/**
 * The number of weapon attacks a character makes with ONE Attack action — the
 * single derivation of `attacksPerAction` for a whole character (golden rule 6).
 * RAW multiclass: Extra Attack never stacks across classes, so take the MAX
 * class-table contribution (each class at its OWN level) OR the aggregate grant
 * source, whichever is larger. This is the value the attack-pips economy reads
 * (`attackBudget`) and the War-Magic affordance caps against.
 */
export function attacksPerActionForCharacter(character: CharacterDoc): number {
  const { character: charData } = character;
  const agg = aggregateForCharacter(character);
  return attacksPerAction(maxTableExtraAttacks(getClasses(charData), getClassTable), {
    extraAttacks: agg.extraAttacks,
  });
}

/**
 * Resolve every `replace-attack-with-cast` rider (Eldritch Knight War Magic /
 * Improved War Magic). Caps the rider's `attacks` at the character's actual
 * `attacksPerAction` — you can never replace more attacks than you make — and
 * reports the total for the (UI-owned) Attack-action affordance. Override-first
 * — never spends an attack or a slot.
 */
export function resolveReplaceAttackWithCast(
  character: CharacterDoc
): ReplaceAttackWithCastEntry[] {
  const agg = aggregateForCharacter(character);
  const totalAttacks = attacksPerActionForCharacter(character);
  return agg.replaceAttackWithCast.map((r) => ({
    sourceId: r.sourceId,
    attacks: Math.min(r.attacks, totalAttacks),
    classSpellList: r.classSpellList,
    minSpellLevel: r.minSpellLevel,
    maxSpellLevel: r.maxSpellLevel,
    castTime: r.castTime,
    totalAttacks,
  }));
}

// ════════════════════════════════════════════════════════════════════════════
// Spell-slot → tracker-use conversion (Bard Font of Inspiration)
// ════════════════════════════════════════════════════════════════════════════

/** A resolved spell-slot → tracker-use conversion option. */
export interface SpellSlotTrackerRecoveryOption {
  sourceId: string;
  usesPerSlot: number;
  total: number;
  currentUsed: number;
  newUsed: number;
  availableSlotLevels: number[];
}

/**
 * Resolve `spell-slot-tracker-recovery` conversions (Bard Font of Inspiration:
 * "expend a spell slot to regain a use of Bardic Inspiration"). Returns a map
 * keyed by tracker id — present ONLY when the conversion is currently useful (a
 * use is expended AND an unspent slot exists). Multiple sources targeting the
 * same tracker merge to the highest `usesPerSlot`. Override-first — never
 * mutates state; surfaces the post-recovery used count for the UI to apply.
 */
export function getSpellSlotTrackerRecovery(
  character: CharacterDoc
): Map<string, SpellSlotTrackerRecoveryOption> {
  const out = new Map<string, SpellSlotTrackerRecoveryOption>();
  const agg = aggregateForCharacter(character);
  if (agg.spellSlotTrackerRecoveries.length === 0) return out;

  // Slot levels that still have an unspent slot (sorted ascending).
  const availableSlotLevels = character.character.spellSlots
    .filter((s) => {
      const used = character.session.spellSlots[slotUsageKey(s)]?.used ?? 0;
      return s.total - used > 0;
    })
    .map((s) => s.level)
    .sort((a, b) => a - b);
  if (availableSlotLevels.length === 0) return out;

  const trackers = resolveTrackers(character);

  // Max-merge usesPerSlot per tracker (keep the first source id seen).
  const merged = new Map<string, { sourceId: string; usesPerSlot: number }>();
  for (const c of agg.spellSlotTrackerRecoveries) {
    const prev = merged.get(c.trackerId);
    if (!prev || c.usesPerSlot > prev.usesPerSlot) {
      merged.set(c.trackerId, { sourceId: c.sourceId, usesPerSlot: c.usesPerSlot });
    }
  }

  for (const [trackerId, { sourceId, usesPerSlot }] of merged) {
    const tracker = trackers.find((t) => t.id === trackerId);
    if (!tracker) continue;
    const currentUsed = tracker.used;
    if (currentUsed <= 0) continue; // nothing expended → no conversion offered
    out.set(trackerId, {
      sourceId,
      usesPerSlot,
      total: tracker.total,
      currentUsed,
      newUsed: Math.max(0, currentUsed - usesPerSlot),
      availableSlotLevels,
    });
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// Initiative-trigger tracker top-up (Bard Superior Inspiration)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Resolve `initiative-tracker-topup` grants (Bard Superior Inspiration: on
 * rolling Initiative, regain Bardic Inspiration up to two). Returns a map keyed
 * by tracker id → the NEW used count after the top-up — present ONLY when a
 * top-up is actually needed (remaining < the floor). The floor is capped at the
 * tracker's resolved total (never restores beyond full). Override-first — never
 * mutates state; honours a `trackerOverrides` total.
 */
export function getInitiativeTrackerTopUps(character: CharacterDoc): Map<string, number> {
  const out = new Map<string, number>();
  const agg = aggregateForCharacter(character);
  if (agg.initiativeTrackerTopUps.length === 0) return out;

  const trackers = resolveTrackers(character);

  // Max-merge the floor per tracker (the most generous top-up wins).
  const merged = new Map<string, number>();
  for (const t of agg.initiativeTrackerTopUps) {
    merged.set(t.trackerId, Math.max(merged.get(t.trackerId) ?? 0, t.upTo));
  }

  for (const [trackerId, upTo] of merged) {
    const tracker = trackers.find((t) => t.id === trackerId);
    if (!tracker) continue;
    const floor = Math.min(upTo, tracker.total); // never beyond full
    const remaining = tracker.total - tracker.used;
    if (remaining >= floor) continue; // already at/above the floor → no-op
    out.set(trackerId, tracker.total - floor); // new used count to reach the floor
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// At-0-HP interrupts (Relentless Endurance / Undying Sentinel / Misty Escape)
// ════════════════════════════════════════════════════════════════════════════

/** A resolved at-0-HP interrupt the (UI-owned) DyingBanner offers as a prompt. */
export interface AtZeroHpInterrupt {
  /** Source feature id (provenance — the prompt label resolves off it). */
  sourceId: string;
  /** The 1/rest tracker the interrupt debits. */
  trackerId: string;
}

/**
 * Resolve every AVAILABLE at-0-HP interrupt ("drop to 1 instead": Orc Relentless
 * Endurance, Paladin Undying Sentinel, Boon of Misty Escape). Returns one entry
 * per granting source whose tracker still has an UNSPENT use (`used < total`) —
 * so a spent interrupt never offers a prompt. PURE: never mutates HP/trackers;
 * the (UI-owned) `applyAtZeroHpInterrupt` store action performs the apply.
 * Dedupes nothing (each source is a distinct interrupt the player may choose).
 */
export function resolveAtZeroHpInterrupts(character: CharacterDoc): AtZeroHpInterrupt[] {
  // Relentless Endurance is a RACE trait (Orc) and Misty Escape a FEAT — neither
  // lives in `character.features` — so resolve over the FULL grant sources
  // (race + feats + features + …), mirroring `gainsHeroicInspirationOnLongRest`.
  const interrupts = evaluateGrants(
    resolveAllGrantSources(character.character),
    new Set(character.session.activeFeatures ?? []),
    new Map(Object.entries(character.session.grantBundleChoices ?? {}))
  ).atZeroHpInterrupts;
  if (interrupts.length === 0) return [];
  const trackers = resolveTrackers(character);
  const out: AtZeroHpInterrupt[] = [];
  for (const { trackerId, sourceId } of interrupts) {
    const tracker = trackers.find((t) => t.id === trackerId);
    if (!tracker) continue;
    if (tracker.total - tracker.used <= 0) continue; // no unspent use → no offer
    out.push({ sourceId, trackerId });
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// Short-Rest Exhaustion recovery (Ranger Tireless)
// ════════════════════════════════════════════════════════════════════════════

/**
 * How many Exhaustion levels the character removes on a SHORT Rest (Ranger
 * Tireless → 1). 0 for anyone without a `recovery: "short-rest"` grant. Reads
 * the dedicated short-rest channel — a Long-Rest-only source (Monk
 * Self-Restoration) never contributes here.
 */
export function getShortRestExhaustionRecovery(character: CharacterDoc): number {
  return aggregateForCharacter(character).exhaustionRecoveryShortRest;
}

/**
 * The character's Exhaustion level AFTER a Short Rest — current level minus the
 * short-rest recovery, floored at 0. Pure: never mutates the session (the
 * store/UI applies the returned level non-destructively — override-first).
 */
export function applyShortRestExhaustion(character: CharacterDoc): number {
  const current = character.session.exhaustion;
  return Math.max(0, current - getShortRestExhaustionRecovery(character));
}

// ════════════════════════════════════════════════════════════════════════════
// Action cost options (alternate-action-cost primitive)
// ════════════════════════════════════════════════════════════════════════════

/** A single way to pay for an action — the primary cost or a declared alternate. */
export interface ActionCostOption {
  kind: "primary" | "alternate";
  cost: CostSpec;
}

/**
 * Enumerate every way the player may pay for a resolved action — the primary
 * cost (a spell slot, a tracker spend, or an equipment charge, in that priority)
 * plus any declared `alternateCost` (Wild Companion: slot OR Wild Shape). Each
 * is a cost-engine `CostSpec` ready for `planCommit`. An at-will action with no
 * cost yields no options (combat auto-commits). Override-first — the alternate
 * rides through verbatim; the consumer never re-derives it.
 */
export function getActionCostOptions(
  // Reads only the cost-bearing fields, which are identical on the raw (engine)
  // and localized (view) action shapes — so either may be passed.
  action: RawResolvedAction | ResolvedAction
): ActionCostOption[] {
  const options: ActionCostOption[] = [];

  // Primary cost: slot ▸ tracker ▸ equipment (the first that applies).
  if (action.costsSlot) {
    options.push({
      kind: "primary",
      cost: { kind: "spell-slot", minLevel: action.slotLevel ?? 1 },
    });
  } else if (action.costTracker) {
    options.push({
      kind: "primary",
      cost: {
        kind: "tracker",
        trackerId: action.costTracker,
        amount: action.trackerCost ?? 1,
        pool: action.costTrackerIsPool ?? false,
      },
    });
  } else if (action.costEquipment) {
    options.push({
      kind: "primary",
      cost: { kind: "equipment", key: action.costEquipment },
    });
  }

  // Alternate cost (if declared) — verbatim, after the primary.
  if (action.alternateCost) {
    options.push({ kind: "alternate", cost: action.alternateCost });
  }
  return options;
}
