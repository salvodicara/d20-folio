/**
 * SRD Database Type Definitions
 * D&D 2024 System Reference Document
 *
 * These types define the shape of all pre-loaded SRD content.
 * Every SRD entry has bilingual text (EN + IT) and a unique string ID.
 */

// Type-only import — erased at compile time, so this introduces no runtime
// dependency on the (pure) cost-engine module. `CostSpec` is the canonical,
// serializable cost shape shared with the immediate-commit combat path.
import type { CostSpec } from "@/lib/cost-engine";
// Type-only — the stable weapon/armor proficiency token brand (golden rule 7 +
// 22): a class table references a proficiency KIND by id, never a display string.
import type { ProficiencyToken } from "@/types/ids";

/**
 * Source book/setting for an SRD entry. `"SRD"` = the CC-BY 5.2.1 subset; the
 * other members are non-SRD provenance tags — they drive the licensing
 * partition. (Everything in `src/data` is tagged `"SRD"` — the enforced public
 * invariant; the other members exist for the content pack's provenance tags.)
 */
export type SrdSource = "SRD" | "Wiki" | "Faerun" | "Eberron" | "Exotic" | "Lorwyn";

// ============================================================
// Shared Primitives
// ============================================================

/** Bilingual text — every user-visible string has both languages */
export interface BiText {
  en: string;
  it: string;
}

/** D&D ability score codes */
export type AbilityCode = "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";

/**
 * Compile-time exhaustiveness for a runtime tuple over a closed string union:
 * if the tuple `T` omits ANY member of `U`, `U` minus the tuple's members is a
 * non-`never` type, so this resolves to that missing member and the `satisfies`
 * site fails to type-check. The runtime tuple can therefore NEVER drift from its
 * union — adding a union member without extending the tuple is a build error.
 * (Used to give i18n's dynamic-key coverage guard an importable source of truth.)
 */
type ExhaustiveTuple<U extends string, T extends readonly U[]> =
  Exclude<U, T[number]> extends never ? T : Exclude<U, T[number]>;

/**
 * Canonical runtime list of the 6 ability codes (the `AbilityCode` union made
 * enumerable). The ONE source of truth for "every ability code" — iterate this
 * instead of re-spelling the list (golden rule 6). Stays exhaustive by
 * construction via {@link ExhaustiveTuple}.
 */
export const ALL_ABILITY_CODES = [
  "STR",
  "DEX",
  "CON",
  "INT",
  "WIS",
  "CHA",
] as const satisfies ExhaustiveTuple<
  AbilityCode,
  ["STR", "DEX", "CON", "INT", "WIS", "CHA"]
>;

/** Spell schools */
export type SpellSchool =
  | "abjuration"
  | "conjuration"
  | "divination"
  | "enchantment"
  | "evocation"
  | "illusion"
  | "necromancy"
  | "transmutation";

/**
 * Canonical runtime list of the 8 spell schools (the `SpellSchool` union made
 * enumerable) — the source of truth for "every school". Exhaustive by
 * construction; feeds the `srd.school_<school>` i18n keys.
 */
export const ALL_SPELL_SCHOOLS = [
  "abjuration",
  "conjuration",
  "divination",
  "enchantment",
  "evocation",
  "illusion",
  "necromancy",
  "transmutation",
] as const satisfies ExhaustiveTuple<
  SpellSchool,
  [
    "abjuration",
    "conjuration",
    "divination",
    "enchantment",
    "evocation",
    "illusion",
    "necromancy",
    "transmutation",
  ]
>;

/** Action types for features and abilities */
export type ActionType = "action" | "bonus" | "reaction" | "free";

/**
 * Canonical runtime list of the 4 action timings (the `ActionType` union made
 * enumerable) — the source of truth, exhaustive by construction; feeds the
 * `combat.<type>` i18n keys.
 */
export const ALL_ACTION_TYPES = [
  "action",
  "bonus",
  "reaction",
  "free",
] as const satisfies ExhaustiveTuple<ActionType, ["action", "bonus", "reaction", "free"]>;

/**
 * The STRUCTURED reaction-trigger token (golden rule 7) — a stable id, never
 * prose. A reaction action declares WHICH circumstance lets the player spend the
 * Reaction; the combat presenter localizes the token to a "Trigger: …" line via
 * the `combat.reactionTrigger_<token>` i18n key (EN + IT). Replaces the retired
 * `extractTrigger` English-prose parser (the last GR7 prose-read on actions):
 * the engine emits an id, the view resolves the localized phrase — no English
 * literal is ever derived from, or emitted as, a description. A reaction with no
 * concise structured trigger simply omits the field (its card shows name + effect,
 * exactly as the parser's `undefined` did). The token set is closed: extend it
 * (and add the matching `combat.reactionTrigger_<token>` key in BOTH locale
 * shards) when a genuinely new trigger circumstance appears.
 */
export type ReactionTrigger =
  | "allyFailsSave"
  | "creatureCastsSpell"
  | "creatureEntersReach"
  | "creatureHitsOther"
  // Barbarian World Tree "Branches of the Tree": a creature you can see starts
  // its turn within 30 ft of you while your Rage is active.
  | "creatureStartsTurnNear"
  | "enemyEndsTurnNear"
  // Ranger Fey Wanderer "Beguiling Twist": you or a creature within 120 ft
  // SUCCEEDS on a save to avoid or end the Charmed or Frightened condition.
  | "savedVsCharmOrFear"
  | "targetAttacks"
  | "takeDamage";

/** Runtime list of every {@link ReactionTrigger} token (exhaustive by construction). */
export const ALL_REACTION_TRIGGERS = [
  "allyFailsSave",
  "creatureCastsSpell",
  "creatureEntersReach",
  "creatureHitsOther",
  "creatureStartsTurnNear",
  "enemyEndsTurnNear",
  "savedVsCharmOrFear",
  "targetAttacks",
  "takeDamage",
] as const satisfies ExhaustiveTuple<
  ReactionTrigger,
  [
    "allyFailsSave",
    "creatureCastsSpell",
    "creatureEntersReach",
    "creatureHitsOther",
    "creatureStartsTurnNear",
    "enemyEndsTurnNear",
    "savedVsCharmOrFear",
    "targetAttacks",
    "takeDamage",
  ]
>;

/**
 * Resource recovery timing.
 *
 * NOTE: `"short-or-long-rest"` is a LEGACY ALIAS of `"short-rest"` — functionally
 * identical (a short rest recovers it, and a long rest, being a superset, does
 * too). It is kept ONLY so old exported/stored documents that carry the value on a
 * custom feature or `trackerOverride` still validate on import; every consumer
 * treats it exactly like `"short-rest"`. NEW SRD data must use `"short-rest"` — the
 * `recovery-consolidation.guard` test fails if `"short-or-long-rest"` reappears in
 * `src/data`.
 */
export type Recovery =
  | "long-rest"
  | "short-rest"
  | "short-or-long-rest"
  | "dawn"
  | "per-turn"
  | "manual";

/** Level-gated override for a tracker — applied when character level ≥ `from` */
export interface TrackerLevelOverride {
  /** Minimum character level for this override to apply */
  from: number;
  /** Override for total uses formula */
  total?: string;
  /** Override for primary recovery timing */
  recovery?: Recovery;
  /** Override for die type */
  die?: string;
  /** Override for short-rest partial recovery */
  shortRestRecovery?: number | string;
}

/**
 * Stable unit TOKENS for a tracker/pool (golden rule 7) — the code speaks
 * only these ids; the localized display string ("HP"/"PF", "pts"/"punti", …) is
 * resolved ONLY at the render boundary from `src/i18n/**` via `t("units.<token>")`.
 * A string-literal union, so a raw display string (`unit: "HP"`) is a COMPILE
 * error — a language leak is impossible by construction, caught at build.
 */
export const TRACKER_UNITS = ["hp", "points", "use", "uses", "dice", "treats"] as const;
export type TrackerUnit = (typeof TRACKER_UNITS)[number];

/** Trackable resource specification — uses, points, or die pool */
export interface TrackerSpec {
  /** Total uses — number or formula: "PB", "CHA", "level*5", "1+level" */
  total: string;
  /** Primary recovery timing */
  recovery: Recovery;
  /** Die type if applicable: "d6", "d8", "d10", "d12" */
  die?: string;
  /** Whether this is a spendable pool resource (ki points, sorcery points, HP) */
  isPool?: boolean;
  /** Stable unit token, e.g. 'hp' | 'points' | 'uses' — localized at the render boundary. */
  unit?: TrackerUnit;
  /**
   * How many uses recover on a Short Rest.
   * Only relevant when recovery is "short-rest" or "short-or-long-rest".
   * - "all" (default) — recover full total on short rest
   * - number — recover exactly N uses (e.g. 1 for Psionic Energy dice)
   */
  shortRestRecovery?: number | string;
  /**
   * Level-gated overrides applied in ascending `from` order.
   * The highest matching entry wins and is merged with the base tracker.
   * Example: [{ from: 6, total: "2" }, { from: 18, total: "3" }]
   */
  levels?: TrackerLevelOverride[];
  /**
   * Alternate activation/recovery cost — when this tracker is exhausted, a use
   * can still be activated (or its single use restored) WITHOUT waiting for the
   * normal rest recovery, by paying one of two costs (the `AltRecoveryCost`
   * discriminated union):
   *
   * - **pool-funded** (`{ fromTracker, amount }`): spend `amount` units from
   *   another resource pool. Six Sorcerer trackers carry this clause — the L7
   *   Sorcery Incarnate gate on Innate Sorcery (2 Sorcery Points, applied via a
   *   `tracker-alt-recovery` grant), plus Dragon Wings (3), Trance of Order /
   *   Crown of Spellfire / Warping Implosion (5), and Clockwork Cavalcade (7),
   *   all reading "Once used, requires a Long Rest OR spend N Sorcery Points to
   *   restore". `fromTracker` is the spendable pool's tracker id (e.g.
   *   `"sorcerer-font-of-magic"`).
   * - **slot-funded** (`{ fromSpellSlot }`): expend a spell slot of level ≥
   *   `fromSpellSlot` (no action required) to restore the use. Cleric Knowledge
   *   Domain "Divine Foreknowledge" (L17 → level 6+) and Ranger Hollow Warden
   *   "Persistent Wrath" (part of Ancient Might, L15 → level 4+) read "restore
   *   your use of this feature by expending a level N+ spell slot".
   *
   * Purely informational: the engine never auto-deducts the pool/slot — it
   * surfaces the alternate cost so the consumer/UI can offer the "spend N to
   * restore" / "spend a slot to restore" affordance. Override-first.
   */
  altRecoveryCost?: AltRecoveryCost;
}

/**
 * Alternate-recovery descriptor for a {@link TrackerSpec} — a discriminated
 * union over what FUNDS the restore of one exhausted use:
 *
 * - {@link PoolAltRecoveryCost} — spend `amount` units of another tracker pool.
 * - {@link SlotAltRecoveryCost} — expend a spell slot of level ≥ `fromSpellSlot`.
 */
export type AltRecoveryCost = PoolAltRecoveryCost | SlotAltRecoveryCost;

/**
 * Pool-funded alternate recovery: `amount` is the number of units spent from the
 * `fromTracker` pool to restore one use of the owning tracker when it is
 * exhausted (the six Sorcerer "spend N Sorcery Points" trackers).
 */
export interface PoolAltRecoveryCost {
  /** Units of the pool spent to restore one use (Sorcery Points). */
  amount: number;
  /** Tracker id of the spendable pool funding the restore. */
  fromTracker: string;
}

/**
 * Slot-funded alternate recovery: expend any spell slot of level ≥
 * `fromSpellSlot` (no action required) to restore one use of the owning tracker
 * (Cleric Divine Foreknowledge → 6, Ranger Persistent Wrath → 4).
 */
export interface SlotAltRecoveryCost {
  /** Minimum spell-slot level that can fund the restore. */
  fromSpellSlot: number;
}

/** Type guard — `true` when an {@link AltRecoveryCost} is pool-funded. */
export function isPoolAltRecovery(c: AltRecoveryCost): c is PoolAltRecoveryCost {
  return "fromTracker" in c;
}

/** Type guard — `true` when an {@link AltRecoveryCost} is slot-funded. */
export function isSlotAltRecovery(c: AltRecoveryCost): c is SlotAltRecoveryCost {
  return "fromSpellSlot" in c;
}

/**
 * An ADDITIONAL trackable resource declared on a feature that already carries
 * a primary `mechanics.tracker`. A single feature may model more than one
 * independent pool/use counter — e.g. the Psi Warrior's **Psionic Power**
 * carries the Psionic Energy Dice pool (`mechanics.tracker`) AND a separate
 * 1/Short-or-Long-Rest recharge gate for the Telekinetic Movement action.
 *
 * Each extra tracker needs its OWN stable `id` (session usage is keyed by
 * tracker id, so it must not collide with the feature id used by the primary
 * tracker) and its own `name` for display. Everything else is a normal
 * `TrackerSpec` (total/recovery/die/levels/shortRestRecovery/…), so it scales,
 * recovers on rest, and honors override-first exactly like a primary tracker.
 */
export interface ExtraTrackerSpec extends TrackerSpec {
  /** Stable, unique tracker id — keys `session.trackers[id]`. Must differ
   *  from the owning feature's id (which keys the primary tracker). */
  id: string;
}

/**
 * On-cast trigger spec (S4 follow-on, the narrow on-cast primitive) — declares a
 * deterministic side-effect that fires when the character casts a spell of a
 * given `school` with a spell slot ≥ `minSlotLevel`. School is matched as a
 * stable {@link SpellSchool} token (golden rule 7 — never a display string);
 * the spec is DISCRIMINATED on `effect` so each leg carries only its own data:
 *  - `"refill-tracker"` — the Wizard Abjurer **Arcane Ward refill**: casting an
 *    Abjuration spell of slot level N regains the owning feature's tracker by
 *    `refillTrackerPerSlotLevel × N` HP, clamped to its max (a reduction of `used`,
 *    floored at 0). The refilled tracker is the OWNING feature's own tracker (its
 *    srdId).
 *  - `"regain-lower-slot"` — the Wizard Diviner **Expert Divination**: casting a
 *    Divination spell (`minSlotLevel` 2) regains ONE expended spell slot of a
 *    level LOWER than the cast slot and no higher than `maxRegainLevel` (5). The
 *    seam un-expends the highest such expended slot (`restoreSpellSlot`).
 *  - `"wild-magic-surge"` — the Sorcerer Wild Magic **Wild Magic Surge**: a
 *    DISPLAY-ONLY post-cast REMINDER (no state mutation). School-agnostic (`school`
 *    omitted → any spell), `minSlotLevel` 1 (RAW "with a spell slot"); the consumer
 *    additionally requires the cast spell to be a Sorcerer spell. The cast-commit
 *    seam surfaces a quiet toast ("roll a d20 — on a 20, roll on the Wild Magic
 *    Surge table") — the app NEVER rolls, NEVER auto-triggers (golden rule 21).
 */
export type OnCastTriggerSpec =
  | OnCastRefillTrackerSpec
  | OnCastRegainLowerSlotSpec
  | OnCastWildMagicSurgeSpec;

/** Common discriminant fields every on-cast leg shares. */
interface OnCastTriggerBase {
  /** Only fires when the cast spell is of this school. Omitted = ANY school (the
   *  Wild Magic Surge leg fires on any Sorcerer spell, whatever its school). */
  school?: SpellSchool;
  /** Minimum spell-slot level that triggers the effect (Arcane Ward: 1 — a
   *  cantrip uses no slot, so it never triggers; Expert Divination: 2). */
  minSlotLevel: number;
}

/** Arcane-Ward-style tracker refill (reduce `used` by `multiplier × slotLevel`). */
export interface OnCastRefillTrackerSpec extends OnCastTriggerBase {
  effect: "refill-tracker";
  /** Refill the owning feature's tracker by this multiplier × the cast slot
   *  level (Arcane Ward: 2 → "twice the level of the spell slot"). The refill is
   *  applied as a reduction of `used`, clamped at 0 (= the ward at max HP). */
  refillTrackerPerSlotLevel: number;
}

/** Expert-Divination-style lower-slot regain (un-expend ONE eligible slot). */
export interface OnCastRegainLowerSlotSpec extends OnCastTriggerBase {
  effect: "regain-lower-slot";
  /** The regained slot can be no higher than this level (Expert Divination: 5). */
  maxRegainLevel: number;
}

/** Wild-Magic-Surge-style DISPLAY-ONLY post-cast reminder (no mutation). */
export interface OnCastWildMagicSurgeSpec extends OnCastTriggerBase {
  effect: "wild-magic-surge";
}

/** Damage types */
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

/**
 * Canonical runtime list of the 13 damage types (the `DamageType` union made
 * enumerable) — the source of truth, exhaustive by construction. Feeds the
 * `srd.damage_<type>` and `srd.damageShort_<type>` i18n keys. Iterate this
 * instead of re-spelling the list (golden rule 6).
 */
export const ALL_DAMAGE_TYPES = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
] as const satisfies ExhaustiveTuple<
  DamageType,
  [
    "acid",
    "bludgeoning",
    "cold",
    "fire",
    "force",
    "lightning",
    "necrotic",
    "piercing",
    "poison",
    "psychic",
    "radiant",
    "slashing",
    "thunder",
  ]
>;

/**
 * A damage SOURCE a creature can be resistant to — keyed to the *origin* of the
 * damage rather than its `DamageType`. Abjurer's Spell Resistance (L14) grants
 * "Resistance to the damage of spells": the damage halves whenever it comes from
 * a spell, regardless of whether that spell deals Fire, Force, Necrotic, etc.
 * This is orthogonal to `DamageType` resistance (which keys on the element), so
 * it gets its own union. Currently only `"spell"` exists in the 2024 SRD; the
 * union is open for future source-keyed resistances (e.g. a hypothetical
 * "resistance to the damage of your own weapons").
 */
export type DamageSource = "spell" | "ranged-weapon";

/**
 * Canonical runtime list of the damage sources — source of truth for the
 * `character.damageSource_<src>` i18n keys; the `DamageSource` union is derived
 * from this tuple, so a new source widens both at once (golden rule 6).
 */
export const ALL_DAMAGE_SOURCES = [
  "spell",
  "ranged-weapon",
] as const satisfies ExhaustiveTuple<DamageSource, ["spell", "ranged-weapon"]>;

/** 2024 SRD condition IDs — keep in sync with `src/data/conditions.ts`. */
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

/** Class IDs — keep in sync with class data files. */
export type ClassId =
  | "artificer"
  | "barbarian"
  | "bard"
  | "cleric"
  | "druid"
  | "fighter"
  | "monk"
  | "paladin"
  | "ranger"
  | "rogue"
  | "sorcerer"
  | "warlock"
  | "wizard";

/**
 * Canonical runtime list of the 13 class ids (the `ClassId` union made
 * enumerable) — source of truth for the `srd.class_<id>` + `create.tip_<id>`
 * i18n keys, exhaustive by construction. The class DATA (`classTables`) keys on
 * these ids; the display name is resolved per-id at the render boundary.
 */
export const ALL_CLASS_IDS = [
  "artificer",
  "barbarian",
  "bard",
  "cleric",
  "druid",
  "fighter",
  "monk",
  "paladin",
  "ranger",
  "rogue",
  "sorcerer",
  "warlock",
  "wizard",
] as const satisfies ExhaustiveTuple<
  ClassId,
  [
    "artificer",
    "barbarian",
    "bard",
    "cleric",
    "druid",
    "fighter",
    "monk",
    "paladin",
    "ranger",
    "rogue",
    "sorcerer",
    "warlock",
    "wizard",
  ]
>;

/** Weapon categories */
export type WeaponCategory = "simple" | "martial";

/** Runtime list of weapon categories — source of truth for `srd.weaponCategory_*`. */
export const ALL_WEAPON_CATEGORIES = [
  "simple",
  "martial",
] as const satisfies ExhaustiveTuple<WeaponCategory, ["simple", "martial"]>;

/** Weapon attack type */
export type WeaponType = "melee" | "ranged";

/** Runtime list of weapon attack types — source of truth for `srd.weaponType_*`. */
export const ALL_WEAPON_TYPES = ["melee", "ranged"] as const satisfies ExhaustiveTuple<
  WeaponType,
  ["melee", "ranged"]
>;

/** Weapon mastery properties (2024 PHB) */
export type WeaponMastery =
  | "Cleave"
  | "Graze"
  | "Nick"
  | "Push"
  | "Sap"
  | "Slow"
  | "Topple"
  | "Vex";

/**
 * Creature size categories (2024 PHB), smallest → largest. Used by mechanics
 * that gate on a target's size — e.g. the `cantrip-effect-rider`
 * forced-movement clause (Repelling Blast pushes a "Large or smaller"
 * creature). Ordered so `CREATURE_SIZE_ORDER` can compare "is X ≤ Y".
 */
export type CreatureSize = "Tiny" | "Small" | "Medium" | "Large" | "Huge" | "Gargantuan";

/** Ascending size index — smaller sizes first; lets consumers compare sizes. */
export const CREATURE_SIZE_ORDER: ReadonlyArray<CreatureSize> = [
  "Tiny",
  "Small",
  "Medium",
  "Large",
  "Huge",
  "Gargantuan",
];

/** Armor categories */
export type ArmorCategory = "light" | "medium" | "heavy" | "shield";

/** Runtime list of armor categories — source of truth for `srd.armorCategory_*`. */
export const ALL_ARMOR_CATEGORIES = [
  "light",
  "medium",
  "heavy",
  "shield",
] as const satisfies ExhaustiveTuple<
  ArmorCategory,
  ["light", "medium", "heavy", "shield"]
>;

/** Equipment categories */
export type EquipmentCategory = "weapon" | "armor" | "shield" | "gear" | "tool" | "pack";

/**
 * Runtime list of equipment categories — source of truth for the
 * `equipment.<category>s` i18n keys (the picker pluralizes each by appending "s").
 */
export const ALL_EQUIPMENT_CATEGORIES = [
  "weapon",
  "armor",
  "shield",
  "gear",
  "tool",
  "pack",
] as const satisfies ExhaustiveTuple<
  EquipmentCategory,
  ["weapon", "armor", "shield", "gear", "tool", "pack"]
>;

/** Feat categories */
export type FeatCategory =
  | "origin"
  | "general"
  | "fighting-style"
  | "epic-boon"
  | "heritage"
  | "planar-pact"
  // "Dark Gift" feats (a horror-campaign setting family — content-pack). A
  // character gains one, each a bundle of boons plus a "bane"
  // that triggers on a natural 1 (CON/WIS/CHA save vs DC 13 + PB). The bane's
  // d20-roll trigger has no passive-grant shape (it's a reactive table), so it
  // stays narrative on the feat description; the boons (proficiencies, spells,
  // PB-use trackers, senses) wire through the normal grant pipeline.
  | "dark-gift";

/**
 * Canonical runtime list of the feat categories (the `FeatCategory` union made
 * enumerable) — the source of truth, exhaustive by construction. Feeds the
 * `feats.category_<category>` i18n keys, so adding a category that has no key is
 * caught both at build (this tuple must extend) and by the i18n coverage guard.
 */
export const ALL_FEAT_CATEGORIES = [
  "origin",
  "general",
  "fighting-style",
  "epic-boon",
  "heritage",
  "planar-pact",
  "dark-gift",
] as const satisfies ExhaustiveTuple<
  FeatCategory,
  [
    "origin",
    "general",
    "fighting-style",
    "epic-boon",
    "heritage",
    "planar-pact",
    "dark-gift",
  ]
>;

/** Currency units */
export type CurrencyUnit = "gp" | "sp" | "cp" | "ep" | "pp";

// ============================================================
// SRD Spells
// ============================================================

/**
 * G24 — a spell whose damage RE-APPLIES on a self-side cadence rather than once
 * at cast, the spell analogue of the S3 FEATURE recurrence (the same per-turn /
 * bonus-action cadence the duration engine models for features). A stable TOKEN
 * (ids only — golden rule 7) the spell-card / combat presenter resolves to a
 * localized cadence note. Pulled verbatim from the 2024 SRD per spell:
 *  - `"on-enter-or-end-turn"` — an area whose creatures save/take damage "when a
 *    creature enters the area or ends its turn there" (2024 RAW: Moonbeam, Spirit
 *    Guardians, Cloudkill, Insect Plague, …). A per-turn cadence against intruders;
 *    the caster places it once.
 *  - `"bonus-action-move"` — a moving hazard the caster re-aims as a BONUS ACTION,
 *    damaging a creature that ends its turn near it (Flaming Sphere). The caster
 *    spends a Bonus Action each turn to re-trigger/relocate it.
 *  - `"action-retrigger"` — the caster re-fires the spell as a MAGIC ACTION on a
 *    later turn at a point of their choice (Call Lightning's repeated bolts).
 * Informational only — the engine tracks no geometry and rolls no dice (golden
 * rule 21); the note tells the player WHEN the damage recurs. Omit for a
 * once-at-cast spell.
 */
export type SpellRecurrence =
  | "on-enter-or-end-turn"
  | "bonus-action-move"
  | "action-retrigger";

/**
 * A SECOND, simultaneous damage instance a single casting deals with its OWN
 * dice + type — for the handful of 2024 spells whose two damage components have
 * DIFFERENT dice that the single {@link SrdSpellData.damageDice}/`damageType`
 * pair cannot represent: Ice Storm (2d10 Bludgeoning + 4d6 Cold), Ice Knife
 * (1d10 Piercing on hit + 2d6 Cold on a DEX save), Meteor Swarm (20d6 Fire +
 * 20d6 Bludgeoning). Distinct from {@link SrdSpellData.damageTypes} (several
 * types sharing ONE dice roll) and {@link SrdSpellData.damageChoice} (pick ONE
 * type). BOTH instances always apply — the spell card + combat card render the
 * primary followed by "+ {dice} {type}". Its own {@link dicePerUpcast} scales
 * this instance INDEPENDENTLY of the primary (Ice Knife's Cold scales while its
 * Piercing does not; Ice Storm's Bludgeoning scales while its Cold does not),
 * resolved by the SHARED {@link import("@/lib/utils").scaleUpcastDice} helper.
 */
export interface SpellDamageInstance {
  /** Base damage dice at the spell's own level ("4d6", "2d6", "20d6"). NdM[+K]. */
  dice: string;
  /** The damage type of this instance. */
  damageType: DamageType;
  /** Per-spell-slot-level dice increment when upcast (Ice Knife Cold: "1d6").
   *  Same NdM shape + face as {@link dice}; omit when this instance is fixed. */
  dicePerUpcast?: string;
}

/**
 * A die-rolled Temporary-HP grant a spell confers on the caster ({@link
 * SrdSpellData.tempHpRoll} — False Life: 2d4 + 4, +5/slot level above 1st). Pure
 * data; the engine resolves it onto `summary.tempHpApply` as a roll-entry (the
 * player supplies the die result — golden rule 21, the app never rolls) plus the
 * deterministic {@link bonus}. Mirrors the FEATURE-action {@link ActionTempHpRoll}
 * (Monk Heightened Focus) but keyed by a fixed dice string + flat bonus rather than
 * a class-scaling die, since a spell's Temp HP formula is level-independent (only
 * the flat part scales, via {@link bonusPerUpcast}).
 */
export interface SpellTempHpRoll {
  /** The dice the player rolls externally (False Life: "2d4"). NdM shape. */
  dice: string;
  /** The DETERMINISTIC flat bonus the app adds to the entered roll (False Life: 4). */
  bonus: number;
  /**
   * Extra deterministic Temporary HP per spell-slot level above the spell's base
   * (False Life: 5 — "+5 additional Temporary Hit Points for each spell slot level
   * above 1"). Omit when the Temp HP doesn't scale on upcast.
   */
  bonusPerUpcast?: number;
}

export interface SrdSpellData {
  /** Unique slug ID: "fireball", "cure-wounds" */
  id: string;
  /** 0 = cantrip, 1-9 for leveled spells */
  level: number;
  /** School of magic */
  school: SpellSchool;
  /** Class IDs that have access to this spell */
  classes: string[];
  /** Casting time description: "action", "bonus", "reaction", "1 minute", etc. */
  castingTime: string;
  /**
   * The STRUCTURED reaction-trigger token (golden rule 7) — a stable id, never
   * prose. Set on a `castingTime: "reaction"` spell whose Reaction is gated by a
   * concise circumstance (Counterspell: a creature within range casting a spell);
   * the combat presenter localizes it to a "Trigger: …" line via the SAME
   * {@link ReactionTrigger}-keyed `combat.reactionTrigger_<token>` i18n key (EN +
   * IT) the FEATURE-action path uses (R6). Replaces the retired `extractSpellTrigger`
   * English-prose parser over {@link castingTime} (the last GR7 prose-read on the
   * spell path): the engine emits an id, the view resolves the localized phrase —
   * no English literal is ever derived from, or emitted as, a casting-time string.
   * A reaction spell with no concise structured trigger simply omits the field (its
   * card shows name + effect, exactly as the parser's `undefined` did). Omit on every
   * non-reaction spell.
   */
  reactionTrigger?: ReactionTrigger;
  /** Whether this spell can be cast as a ritual */
  ritual: boolean;
  /**
   * Spell components. `costGp`/`consumed` (RA-23) are the STRUCTURED cost facts
   * for a Material (M) component with a GP price — the FIRST gp figure named in
   * the SRD Components line (the primary priced component; the compendium prose
   * carries the full breakdown) + whether the spell consumes it. Set together,
   * only on `m: true` spells. Omitted when the material has no gp cost; never
   * write `consumed: false` (lean data — absent means not consumed).
   */
  components: {
    v: boolean;
    s: boolean;
    m: boolean;
    costGp?: number;
    consumed?: boolean;
  };
  /** Whether the spell requires concentration */
  concentration: boolean;
  /**
   * Whether the spell's duration is "Instantaneous" — the STRUCTURED fact that
   * replaces the old English-prose duration branch (golden rule 7: the engine
   * never reads a localized/prose string for logic). Consumers that omit the
   * duration row for instantaneous spells read this boolean; the localized
   * duration DISPLAY string still lives in `src/i18n/<locale>/srd/spells.json`
   * and is resolved only at the render boundary. Derived once from the canonical
   * EN duration at edit time. Omit (falsy) for any non-instantaneous spell.
   */
  instantaneous?: boolean;
  /** Primary damage type (if applicable) */
  damageType?: DamageType;
  /**
   * Base damage dice at the spell's own level, e.g. "1d6" / "8d6" / "2d8".
   * Drives the outcome-forward verdict chip ("2d8 Fire") instead of a bare
   * type word. Omit when the spell deals no dice-based damage.
   */
  damageDice?: string;
  /**
   * S12c — the per-spell-slot-level damage-dice INCREMENT a leveled spell gains
   * when cast with a slot above its own level ("the damage increases by 1d6 for
   * each spell slot level above 3" → `"1d6"`). The SAME `NdM` shape as
   * {@link damageDice}; the shared {@link import("@/lib/utils").scaleUpcastDice}
   * helper resolves the scaled total at the chosen cast level (base count +
   * increment-count × steps-above-base, same die face). The cast modal's slot
   * rows preview the scaled dice; the spell card shows the bare base. The two
   * roll counts must share a die face (e.g. base "8d6" + "1d6"). A RAY-COUNT
   * spell whose upcast adds an extra instance (Scorching Ray, Magic Missile)
   * uses {@link instancesPerUpcast} instead — NEVER this. Omit for a leveled
   * damage spell that does NOT scale on upcast (Meteor Swarm, Harm) or a fixed-
   * count cantrip (which scales by character level via {@link damageDice}).
   */
  damageDicePerUpcast?: string;
  /**
   * A SECOND simultaneous damage instance with its OWN dice + type, for the few
   * spells whose two components have DIFFERENT dice the single
   * {@link damageDice}/{@link damageType} pair can't hold (Ice Storm 2d10 Bldg +
   * 4d6 Cold, Ice Knife 1d10 Prc + 2d6 Cold, Meteor Swarm 20d6 Fire + 20d6 Bldg).
   * Both apply at once; the surfaces render "{primary} + {dice} {type}". See
   * {@link SpellDamageInstance}. Omit for single-instance spells.
   */
  secondaryDamage?: SpellDamageInstance;
  /**
   * S12b — the number of SEPARATE damage instances a single casting creates, each
   * dealing {@link damageDice} as its OWN roll/attack (NOT one combined N×-die
   * roll): Magic Missile's 3 darts (each 1d4+1 Force, can target different
   * creatures), Scorching Ray's 3 rays (each its own 2d6 ranged attack). Both
   * surfaces show "{count} × {dice}" so the player reads three rolls, not one.
   * `instancesPerUpcast` adds instances per spell-slot level above the spell's own
   * (Magic Missile +1 dart, Scorching Ray +1 ray) — resolved at the cast level by
   * the shared {@link import("@/lib/utils").spellInstanceCount} helper. Omit for a
   * single-roll spell (the surfaces show the bare `damageDice`).
   */
  instances?: number;
  /** S12b — extra {@link instances} per spell-slot level above the spell's own
   *  (Magic Missile / Scorching Ray: 1). Ignored unless `instances` is set. */
  instancesPerUpcast?: number;
  /**
   * G24 — the self-side cadence on which this spell's damage RE-APPLIES (a moving
   * area's per-turn save, a bonus-action-moved hazard, a re-fired bolt). A stable
   * {@link SpellRecurrence} token the presenter renders as a cadence note on the
   * spell card / combat action — the spell analogue of the S3 feature recurrence.
   * Omit for a once-at-cast spell.
   */
  recurrence?: SpellRecurrence;
  /**
   * Base healing dice (or flat amount) at the spell's own level, e.g. "2d8" /
   * "2d4" / "70". Drives a verdigris "NdM Heal" verdict on the spell card and the
   * combat heal chip — the SINGLE source both surfaces read (S12). The card shows
   * this base; the combat chip adds the caster's spellcasting modifier on top when
   * {@link healAddsCastMod} is set, plus any heal-amount rider.
   */
  healDice?: string;
  /**
   * Whether the heal amount adds the caster's spellcasting ability modifier (the
   * 2024 "regains 2d8 + your spellcasting ability modifier" family: Cure Wounds,
   * Healing Word, Mass Healing Word, Mass Cure Wounds, Prayer of Healing). A
   * STRUCTURED fact replacing the old prose regex — the combat chip folds the mod
   * (and any Disciple-of-Life rider) into the formula; the spell card shows the
   * base dice only. Omit for fixed-amount heals (Regenerate, Aura of Vitality).
   */
  healAddsCastMod?: boolean;
  /**
   * RA-07 — the per-spell-slot-level HEALING-dice INCREMENT a leveled heal spell
   * gains when cast with a slot above its own ("the healing increases by 2d8 for
   * each spell slot level above 1" → `"2d8"`). The heal-side twin of
   * {@link damageDicePerUpcast}: the SAME `NdM` shape as {@link healDice}, resolved
   * by the SHARED {@link import("@/lib/utils").scaleUpcastDice} helper (base count +
   * increment-count × steps-above-base, same die face) — the cast modal's slot rows
   * preview the scaled heal; the spell card shows the bare base. Omit for a fixed-
   * amount heal (Heal, Mass Heal, Goodberry) or a leveled heal that does NOT scale
   * on upcast (Aura of Vitality, Regenerate).
   */
  healDicePerUpcast?: string;
  /**
   * A die-rolled Temporary-HP grant this spell confers ON THE CASTER (False Life:
   * "You gain 2d4 + 4 Temporary Hit Points", +5/slot level above 1st). The
   * `temp-hp` Grant grammar is dice-FREE by construction (its consumers resolve a
   * concrete number and auto-apply — golden rule 21 forbids that for a die), so a
   * ROLLED per-spell Temp HP rides this declarative field instead. The engine
   * resolves it onto `summary.tempHpApply` (a roll-entry-then-apply the player
   * supplies the die for — the app never rolls); the DETERMINISTIC {@link
   * SpellTempHpRoll.bonus} (+5/upcast level) is the part the app adds. When the
   * caster casts via a MAXIMIZING at-will source (Warlock **Fiendish Vigor** →
   * `autoMaxTempHpFormula`), that dice-free maximum one-taps instead (S8). Applied
   * max-wins via the store `gainTempHp` seam (temp HP don't stack), undoable.
   * Omit for spells that grant no rolled Temp HP.
   */
  tempHpRoll?: SpellTempHpRoll;
  /**
   * Structured outcome hint for non-damage spells so the verdict chip can show
   * a decision-useful WORD (the §11 / control palette) rather than the generic
   * "Save"/"Utility". "advantage" → gold, "control" (charmed/restrained/etc.)
   * → amethyst, "heal" → verdigris, "buff"/"debuff"/"utility" semantic colours.
   */
  effectTag?: "advantage" | "control" | "heal" | "buff" | "debuff" | "utility";
  /**
   * Multiple SIMULTANEOUS damage types a single casting deals — for spells the
   * single `damageType` field cannot represent because they roll/apply several
   * elements at once (Prismatic Spray's eight rays span Fire/Acid/Lightning/
   * Poison/Cold; Prismatic Wall's seven layers; Storm of Vengeance's
   * Thunder/Acid/Lightning/Bludgeoning/Cold rounds). These are NOT a player
   * choice — every listed type is part of the spell. Distinct from
   * {@link damageChoice} (pick ONE). The action-summary consumer surfaces all
   * of them so the combat card no longer shows a blank damage type. Omit for
   * single-element spells (use `damageType`).
   */
  damageTypes?: DamageType[];
  /**
   * Player-CHOSEN damage type — the caster picks exactly ONE of these elements
   * when casting (or, for Glyph of Warding's Explosive Rune, when inscribing).
   * Chromatic Orb (Acid/Cold/Fire/Lightning/Poison/Thunder), Dragon's Breath
   * (Acid/Cold/Fire/Lightning/Poison), Glyph of Warding Explosive Rune
   * (Acid/Cold/Fire/Lightning/Thunder). The single `damageType` field cannot
   * represent the open choice, so such spells stored null before this field.
   * Distinct from {@link damageTypes} (all apply at once). The action-summary
   * consumer surfaces the selectable set; override-first — the engine never
   * picks for the player. Omit for fixed-type spells.
   */
  damageChoice?: DamageType[];
  /** Saving throw ability (if spell forces a save) */
  saveAbility?: AbilityCode;
  /** Attack type (if spell requires an attack roll) */
  attackType?: "melee" | "ranged";
  /**
   * Weapon-attack-cantrip descriptor — for the small family of 2024 cantrips
   * whose entire effect is "make ONE attack with a held weapon, but with these
   * substitutions" (True Strike). Unlike `attackType` (a spell that has its own
   * attack roll & damage), this rider modifies the WEAPON the caster wields:
   *
   *  - the attack & damage rolls use the caster's SPELLCASTING ability instead
   *    of Strength/Dexterity (`useSpellcastingAbility`);
   *  - the damage type is the player's CHOICE between an override element and
   *    the weapon's own type (`damageTypeChoice`: e.g. Radiant or the weapon's
   *    normal type);
   *  - extra fixed-element damage scales by the CHARACTER's level via
   *    `extraDamageByLevel` (True Strike: +1d6 Radiant at 5, 2d6 at 11, 3d6 at
   *    17), of `extraDamageType`.
   *
   * The cantrip carries no `damageType`/`saveAbility`/`attackType` of its own
   * (its damage IS the weapon's). The consumer (`resolveWeaponAttackCantrip` in
   * `lib/compute.ts`, surfaced by the smart-tracker action summary) resolves the
   * scaled extra damage, the attack ability, and the damage-type options at
   * render — override-first. Omit for ordinary spells.
   */
  weaponAttackCantrip?: WeaponAttackCantripData;
  /**
   * PROSE sweep (2026-06-10) — STANDING effects the spell confers while it
   * runs (spell discipline (a)): a buff whose printed effect is a stat change
   * for the duration carries it as `while-active` grants (Mage Armor's AC
   * formula, Fly's Fly Speed, Stoneskin's resistances, Foresight's advantage).
   * A prepared spell with grants becomes a grant SOURCE
   * (`resolveGrantSourcesForSpells`), so its toggle surfaces through the same
   * `activatableGroups`/`session.activeFeatures` seam magic items use.
   * Cast-time effects (damage/heal/saves) stay on the structured fields above.
   */
  grants?: ReadonlyArray<import("@/lib/grants").Grant>;
  /**
   * Source book/setting. Non-`"SRD"` tags mark content outside the CC-BY SRD
   * 5.2.1 subset — such entries live in the content pack, never in `src/data`
   * (mirrors `SrdFeatData.source`).
   */
  source: SrdSource;
}

/**
 * The declarative facts of a weapon-attack cantrip (True Strike). Pure data —
 * no rolls, no character context. See {@link SrdSpellData.weaponAttackCantrip}.
 */
export interface WeaponAttackCantripData {
  /**
   * Attack & damage rolls use the caster's spellcasting ability modifier in
   * place of Strength/Dexterity. (True Strike: true.)
   */
  useSpellcastingAbility: boolean;
  /**
   * The damage-type element the player may choose INSTEAD of the weapon's own
   * normal type ("radiant" for True Strike). The other option is always the
   * weapon's normal type; the engine never picks (override-first).
   */
  damageTypeChoice: DamageType;
  /**
   * Extra fixed-element damage keyed by the threshold CHARACTER level at which
   * it begins to apply (True Strike: `{ 5: "1d6", 11: "2d6", 17: "3d6" }`). The
   * consumer resolves the highest threshold ≤ the character's level. Empty =
   * no scaling extra damage.
   */
  extraDamageByLevel: Readonly<Record<number, string>>;
  /** Damage type of the scaling extra damage ("radiant" for True Strike). */
  extraDamageType: DamageType;
}

// ============================================================
// SRD Class Features
// ============================================================

/**
 * A single action defined within a class feature or feat.
 * `trackerCost` specifies how many uses of the associated tracker
 * are consumed when this action is taken (defaults to 1 if omitted).
 */
/**
 * A structured additive term in a heal formula whose DISPLAY needs a locale word
 * (so it can never be authored as English prose — the leak class). The engine
 * carries the symbolic token; only the presenter (`lib/views/combat-action-view`)
 * renders the localized phrase ("+ Fighter level" / "+ livello da Guerriero").
 *
 *  - `class-level` — add the OWNING class's level (multiclass-correct via
 *    `classEntryLevel`); the word "level"/"livello da <Classe>" is presenter-owned.
 *    The Second Wind leak (`1d10 + Fighter level HP`) is exactly this term.
 *  - `ability-mod` — add an ability modifier (the word "+ WIS mod." etc.).
 *  - `flat` — add a constant (purely numeric, carries no word — but folded here so
 *    one shape covers the whole corpus).
 */
export type HealTerm =
  | { kind: "class-level"; classId: ClassId }
  | { kind: "ability-mod"; ability: AbilityCode }
  | { kind: "flat"; value: number };

/**
 * A VARIABLE die COUNT for a roll whose number of dice is a character quantity,
 * not a fixed integer — resolved to a concrete count at emission so the chip
 * reads a number the player never computes (owner doctrine 2026-06-12). Shared
 * by {@link ActionHeal} and {@link ActionAttack} (one shape, one resolver):
 *
 *  - `"PB"` — the Proficiency Bonus (e.g. a species trait healing "PB d4s").
 *  - an {@link AbilityCode} — that ability's MODIFIER, floored at 1 (Cleric Sear
 *    Undead: "a number of d8s equal to your Wisdom modifier, minimum of 1d8").
 *
 * Always pairs with `dieFace` (the die rolled — d4 / d8). The engine multiplies
 * it out (`WIS` mod 3 → `"3d8"`); mutually exclusive with a fixed `dice`.
 */
export type DiceCount = "PB" | AbilityCode;

/**
 * A declarative heal amount for a feature/trait action chip — the STRUCTURED
 * replacement for parsing "regain 1d10 + Fighter level HP" out of English prose
 * (the architecture's core law: never compute mechanics from prose; engine-core
 * is i18n-free; only `lib/views` localizes). The engine emits this verbatim onto
 * the action summary; the presenter formats it into the localized chip.
 *
 *  - `dice` — the rolled portion ("1d10", "2d4"); a locale-agnostic FACT rolled
 *    externally (no dice are ever rolled — golden rule 21). For a FIXED die count.
 *  - `diceCount` — a VARIABLE {@link DiceCount} (PB or an ability mod) the engine
 *    resolves to a concrete `dice` string at emission (`PB` 3 → `"3d4"`), so the
 *    chip reads a number the player never computes. Pairs with `dieFace` (the die
 *    rolled — d4 for Healing Hands); mutually exclusive with `dice`.
 *  - `plus` — an optional additive {@link HealTerm} whose display needs a locale
 *    word. The class-level term is the multiclass-correct owning-class level.
 */
export interface ActionHeal {
  dice?: string;
  /** Variable die COUNT — PB or an ability mod (Healing Hands: "PB d4s"). The
   *  resolver multiplies it out to a concrete `dice` string. Pairs with `dieFace`. */
  diceCount?: DiceCount;
  /** The die rolled when `diceCount` is set (Healing Hands: "d4"). */
  dieFace?: string;
  plus?: HealTerm;
}

export interface SrdActionDef {
  /** Action economy cost */
  type: ActionType;
  /**
   * The STRUCTURED reaction trigger (golden rule 7) — a stable
   * {@link ReactionTrigger} token, never prose. Set on a `type: "reaction"`
   * action to surface a localized "Trigger: …" line (the engine emits the token
   * as a `ui` `LocText` → `combat.reactionTrigger_<token>`; the presenter resolves
   * EN/IT at the render edge). Omitted ⇒ no trigger line (the card shows
   * name + effect). Replaces the retired `extractTrigger` prose parser; ignored on
   * non-reaction actions.
   */
  trigger?: ReactionTrigger;
  /**
   * Declarative heal amount surfaced as the action's heal chip (Second Wind:
   * `{ dice: "1d10", plus: { kind: "class-level", classId: "fighter" } }`). When
   * present the resolver emits `summary.heal` (structured, i18n-free) and the
   * presenter renders the localized "1d10 + Fighter level" / "1d10 + livello da
   * Guerriero" chip. Omitted for non-healing actions.
   */
  heal?: ActionHeal;
  /**
   * Number of tracker uses consumed when this action fires.
   * 1 is the implicit default. Set > 1 for abilities that cost multiple
   * resources (e.g. Quivering Palm = 4 Focus Points).
   */
  trackerCost?: number;
  /**
   * ID of another feature whose tracker this action consumes.
   * Used when the action lives on a separate feature from the pool
   * (e.g. Flurry of Blows → "monk-focus").
   */
  costTracker?: string;
  /**
   * Bind this action's PRIMARY cost to a specific tracker id on its OWN
   * feature, overriding the default "use the feature's primary
   * `mechanics.tracker`" rule. Needed when a feature carries several trackers
   * (`mechanics.extraTrackers`) and a particular action is gated by one of the
   * extras rather than the primary pool — e.g. Psi Warrior **Psionic Power**:
   * the Telekinetic Movement action is gated by its own 1/Short-or-Long-Rest
   * recharge tracker, while Protective Field / Psionic Strike spend the
   * Psionic Energy Dice pool (the primary tracker). Combine with
   * `alternateCost` to offer "or expend a Psionic Energy Die instead".
   */
  costTrackerOverride?: string;
  /**
   * Alternate-action-cost primitive — a SECOND, independent way to pay for
   * this action, chosen by the player at use-time. The action's primary cost
   * (its tracker via `costTracker`/`trackerCost`, or its own feature tracker)
   * stays as declared; `alternateCost` adds one more option the player may pick
   * INSTEAD. 2024 Wild Companion: "you can expend a spell slot OR a use of Wild
   * Shape to cast Find Familiar" — the primary cost is the Wild Shape tracker,
   * the `alternateCost` is `{ kind: "spell-slot", minLevel: 1 }`.
   *
   * Carried verbatim onto the resolved action; the pure helper
   * `getActionCostOptions` (smart-tracker) enumerates every payment option so
   * the combat consumer can offer the choice and commit exactly one. A
   * `CostSpec` (cost-engine) so it serializes through the same commit/undo path
   * as the primary cost. Override-first: a manual per-action override still
   * wins; this only widens the auto-computed set of legal ways to pay.
   */
  alternateCost?: CostSpec;
  /**
   * The ability a TARGET rolls when this action forces a saving throw (Monk
   * **Stunning Strike** → the target makes a CON save). A SELF-SIDE affordance
   * only: the engine resolves the DC (from `saveDcAbility`) and surfaces the
   * "CON save · DC N" line on the action card so the player/DM rolls externally —
   * the app NEVER models the enemy or applies a condition to it (BG3 on-rails:
   * no modeled enemies; golden rule 21). Omitted for non-save actions.
   */
  saveAbility?: AbilityCode;
  /**
   * The character's OWN ability that GOVERNS this action's save DC (Stunning
   * Strike's DC is WIS-based: 8 + PB + WIS mod). Distinct from `saveAbility`
   * (what the TARGET rolls). The engine reads this ability's effective score and
   * routes it through the one `featureSaveDc` formula (single source of truth —
   * golden rule 6). Ignored unless `saveAbility` is also set. Ids only — the
   * label is localized at the render edge (golden rule 7).
   */
  saveDcAbility?: AbilityCode;
  /**
   * S11 — the DECLARATIVE save-based ATTACK an action deals (Dragonborn Breath
   * Weapon 2d10 Fire on a DEX save, Cleric Divine Spark 1d8 Necrotic/Radiant on a
   * CON save). The STRUCTURED replacement for the dice/type/scaling living only in
   * i18n prose (the golden-rule-5 leak): the engine resolves it onto
   * `summary.damage`/`damageType`(`/damageTypes`) so the SAME chip + facts recipe
   * a damage spell uses renders "2d10 Fire · DC N DEX" with zero new view code.
   *
   * The SAVE half is the existing `saveAbility`/`saveDcAbility` pair (REUSED, not
   * duplicated) — set those alongside `attack` for a save-for-half effect; the DC
   * routes through the one `featureSaveDc` formula. `attack` carries only the
   * DAMAGE half (dice + type). Ids only (golden rule 7) — the damage-type label
   * is localized at the render edge. Override-first: the resolved dice/DC are
   * display facts the player rolls externally (golden rule 21). Omitted for
   * non-damaging actions (a pure save → Frightened action sets only the save pair).
   */
  attack?: ActionAttack;
  /**
   * S11b — gate this action so it surfaces ONLY when a `choice-grant-bundle`
   * option is the active selection (`session.grantBundleChoices[bundleKey] ===
   * optionId`). Example: a species revelation whose CHA-save → Frightened effect
   * belongs to the Necrotic Shroud FORM alone — the other two forms force no save,
   * so this gate hides the save-action until Necrotic Shroud is chosen. Ids only
   * (golden rule 7); the engine reads the session pick, never a display string.
   * Omitted for an always-available action.
   */
  requiresBundleOption?: { bundleKey: string; optionId: string };
  /**
   * G23 — a use that adds a rolled die to a FAILED ability check instead of an
   * attack/heal (Fighter **Tactical Mind**: spend a use of Second Wind to roll
   * 1d10 and add it to a failed check). Paid by the `costTracker` pool (the
   * Second Wind uses). The die is ROLL-ENTRY — the app never rolls (golden rule
   * 10); the engine surfaces only the formula + the refund rule. The engine
   * resolves it onto {@link ActionSummary.checkBonus}; the presenter composes the
   * localized "spend Second Wind → +1d10 to a failed check (refunded on a fail)".
   * Omitted for non-check actions.
   */
  checkBonus?: ActionCheckBonus;
  /**
   * G19 — conditions this action can NEUTRALIZE by spending HP FROM ITS OWN POOL
   * (Paladin **Lay On Hands**: expend 5 HP to end the Poisoned condition; at L14
   * **Restoring Touch** also ends Blinded/Charmed/Deafened/Frightened/Paralyzed/
   * Stunned, 5 HP each). Each entry costs `costHp` from the action's pool tracker
   * (those points DON'T also restore HP — RAW). Ids only (golden rule 7) — the
   * condition LABEL is localized at the render boundary via `conditionLabel`. A
   * `fromLevel` entry surfaces only once the action's OWNING-class level reaches it
   * (the SAME `scalingLevel` the tracker uses), so a low-level Paladin sees the
   * base Poisoned cure alone. The engine resolves it onto
   * {@link ActionSummary.cureOptions}; the pool is never auto-debited
   * (override-first). Omitted for actions with no cure clause.
   */
  cureConditions?: ReadonlyArray<ActionCureCondition>;
  /**
   * G22 — a die-rolled Temporary-HP gain that RIDES this action (Monk **Heightened
   * Focus**, L10: spending a Focus Point to use Patient Defense also grants
   * Temporary HP equal to TWO rolls of your Martial Arts die). The `temp-hp` Grant
   * grammar is dice-FREE by construction (its consumers resolve to a concrete
   * number and auto-apply — golden rule 21 forbids that for a die), so a rolled
   * temp-HP rides its action as a declarative roll-entry field instead — the SAME
   * shape {@link ActionCheckBonus} uses for a rolled check bonus. The die is
   * ROLL-ENTRY (the app never rolls); the engine resolves the `die` sentinel at the
   * action's OWNING-class level (Monk d8 at L10 → "2d8") onto
   * {@link ActionSummary.tempHpRoll} as a display-only formula, gated behind
   * `fromLevel` on that same level so a low-level Monk never sees it. Override-first
   * — never auto-applied (D&D temp HP don't stack; the player enters the higher
   * pool). Omitted for actions with no rolled temp-HP rider.
   */
  tempHpRoll?: ActionTempHpRoll;
}

/**
 * G22 — the declarative "gain N rolls of a die as Temporary HP" rider on an action
 * (Monk Heightened Focus → Patient Defense: two rolls of the Martial Arts die).
 * Pure data; the engine resolves `die` at the owning-class level and emits the
 * concrete formula onto {@link ActionSummary.tempHpRoll}. Roll-entry (golden rule
 * 21 — the app never rolls); the temp HP is never auto-applied (override-first).
 */
export interface ActionTempHpRoll {
  /** Number of die rolls added as Temporary HP (Heightened Focus: 2). */
  rolls: number;
  /**
   * The die rolled — a fixed face (`"d8"`) OR the deferred
   * `"classSpecific:<key>"` sentinel resolved at the action's owning-class level
   * (Heightened Focus: `"classSpecific:martialArtsDie"` → the scaling Monk die).
   */
  die: string;
  /**
   * Owning-class level at which this rider unlocks (Heightened Focus: 10). Omit
   * for an always-available rider.
   */
  fromLevel?: number;
}

/**
 * G23 — the declarative "add a die to a failed ability check" half of a
 * resource-spend action (Fighter Tactical Mind). Pure data; the engine carries it
 * verbatim onto {@link ActionSummary.checkBonus}. `refundOnFail` models the 2024
 * RAW that the resource is NOT expended if the check still fails ("If the check
 * still fails, this use of Second Wind isn't expended").
 */
export interface ActionCheckBonus {
  /** The die added to the failed check, rolled externally ("1d10"). */
  dice: string;
  /** When true, the spent resource use is refunded if the check still fails. */
  refundOnFail?: boolean;
}

/**
 * G19 — one condition an action can neutralize by spending pool HP (Lay On Hands).
 * `condition` is a stable {@link ConditionId} (localized at the render edge);
 * `costHp` is the HP drawn from the action's own pool tracker; `fromLevel` (when
 * set) gates the cure behind the action's owning-class level (Restoring Touch's
 * extra cures unlock at Paladin level 14).
 */
export interface ActionCureCondition {
  /** Stable condition id to neutralize ("poisoned", "frightened", …). */
  condition: ConditionId;
  /** HP spent from the action's pool to neutralize it (5 for Lay On Hands). */
  costHp: number;
  /** Owning-class level at which this cure unlocks (omit for an always-available cure). */
  fromLevel?: number;
}

/**
 * S11 — the declarative damage half of a save-based feature/trait action. Pure
 * data; the engine (`resolveFeatureActions`) resolves it to the locale-agnostic
 * `summary.damage` + the damage-type id at the character's level. The save half
 * rides {@link SrdActionDef.saveAbility}/`saveDcAbility` (reused), so this shape
 * adds ONLY the dice + the damage type (single source of truth — golden rule 6).
 */
export interface ActionAttack {
  /**
   * Fixed damage dice (`"2d10"`) when the action does not scale, OR the floor of
   * a scaling action (used below the first {@link diceByLevel} threshold). A
   * locale-agnostic FACT rolled externally (golden rule 21).
   */
  dice?: string;
  /**
   * Damage dice keyed by the threshold level at which they begin to apply
   * (Breath Weapon: `{ 1: "1d10", 5: "2d10", 11: "3d10", 17: "4d10" }`; Divine
   * Spark: `{ 2: "1d8", 7: "2d8", 13: "3d8", 18: "4d8" }`). The engine resolves
   * the highest threshold ≤ the action's SCALING level (owning-class level for a
   * class feature, character level for a race trait — the SAME
   * `featureScalingLevel` the tracker uses) via the shared `pickByLevel` helper —
   * the SAME "highest threshold ≤ level" rule cantrip `extraDamageByLevel` uses.
   * Omit for a fixed-dice action (set `dice`).
   */
  diceByLevel?: Readonly<Record<number, string>>;
  /** The fixed damage type id (one of {@link DamageType}). Mutually exclusive
   *  with `damageTypeChoices` / `damageTypeFromBundle`. */
  damageType?: DamageType;
  /**
   * The player CHOOSES one of these damage type ids each use (Divine Spark:
   * `["necrotic", "radiant"]`). The engine surfaces every option (the chip joins
   * them "/"); it never picks (override-first). Maps onto `summary.damageTypes` +
   * `multiDamageTypeFlavor: "choice"`. Mutually exclusive with `damageType`.
   */
  damageTypeChoices?: ReadonlyArray<DamageType>;
  /**
   * Derive the damage type from the chosen option of a `choice-grant-bundle` on
   * the SAME source — the `bundleKey` (Breath Weapon: `"dragonborn-ancestry"`).
   * The engine reads `session.grantBundleChoices[bundleKey]` → that option's
   * `damage-resistance` grant's `damageType` (declared ONCE on the ancestry —
   * single source of truth, golden rule 6). Resolves to nothing until the player
   * picks an ancestry (no damage type then). Mutually exclusive with `damageType`.
   */
  damageTypeFromBundle?: string;
  /**
   * S11b — a VARIABLE die COUNT for the damage (Cleric **Sear Undead**: "roll a
   * number of d8s equal to your Wisdom modifier, minimum of 1d8"). The engine
   * resolves the {@link DiceCount} (an ability mod, floored at 1, or PB) onto a
   * concrete `dice` string at emission via the SHARED `resolveDiceCount` helper
   * the heal side uses — so the chip reads "3d8", a number the player never
   * computes. Pairs with `dieFace` (the die rolled); mutually exclusive with
   * `dice` / `diceByLevel`.
   */
  diceCount?: DiceCount;
  /** The die rolled when `diceCount` is set (Sear Undead: "d8"). */
  dieFace?: string;
  /**
   * S11b — add an ability MODIFIER to the rolled total (Cleric **Divine Spark**:
   * "Roll 1d8 and add your Wisdom modifier"). The engine reads the EFFECTIVE
   * ability mod and folds it into the `dice` formula at emission (`1d8` + WIS 3 →
   * `"1d8+3"`) via the SAME `appendAbilityModToDice` the heal/spell formulas use —
   * so the damage chip reads "1d8+3", never a value the player must compute. Ids
   * only (golden rule 7) — the ability is a code, never a label. Omit when no
   * ability is added.
   */
  addMod?: AbilityCode;
  /**
   * S11b — add the OWNING class's level to the rolled total (Light-domain Cleric
   * **Radiance of the Dawn**: "2d10 plus your Cleric level"). The engine adds the
   * `scalingLevel` (the OWNING-class level, multiclass-correct — the B2 lesson:
   * resolve on the Cleric level, never the total) onto the `dice` formula at
   * emission (`2d10` + Cleric 5 → `"2d10+5"`). A boolean — the class is the
   * action's own (no id needed). Omit for actions that add no level.
   */
  addLevel?: boolean;
  /**
   * S11b — surface this save-attack ALSO as a heal option (Cleric **Divine
   * Spark**: "You either restore Hit Points to the creature equal to that total
   * or force the creature to make a Constitution saving throw … damage equal to
   * that total"). When `"heal-or-damage"`, the engine emits the SAME resolved
   * total (dice + `addMod`/`addLevel`) onto BOTH `summary.heal` (a heal chip the
   * player may apply) AND the damage half (the save-for-half damage chip) — the
   * player picks one each use (override-first; the engine never chooses). The two
   * chips render side by side on the one action card. Omit for a damage-only
   * save-attack.
   */
  mode?: "heal-or-damage";
}

export interface SrdClassFeatureData {
  /** Unique ID: "bard-bardic-inspiration", "fighter-extra-attack" */
  id: string;
  /** Class this feature belongs to */
  class: string;
  /** Subclass (undefined for base class features) */
  subclass?: string;
  /** Level at which this feature is gained */
  level: number;
  /** Mechanical effects (for features with trackers/actions) */
  mechanics?: {
    tracker?: TrackerSpec;
    /**
     * ADDITIONAL trackers beyond the primary `tracker`. A feature may model
     * several independent resources at once — e.g. Psi Warrior **Psionic
     * Power** has the Psionic Energy Dice pool (`tracker`) PLUS a separate
     * 1/Short-or-Long-Rest recharge gate for its Telekinetic Movement action.
     * Each entry carries its own stable `id` + `name` so session state and the
     * UI keep them distinct from the primary tracker. Resolved by
     * `resolveTrackers` / recovered by `getShortRestRecoveries` like any other.
     */
    extraTrackers?: ExtraTrackerSpec[];
    actions?: SrdActionDef[];
    /**
     * Phase D — Declarative rider chip. Replaces the hard-coded
     * FEATURE_RIDERS map that used to live in `smart-tracker.ts`. When set,
     * the resolver reads `classSpecific[sourceKey]` from the character's
     * class-table level row and formats it for the Features/Combat-page
     * chip. `format` controls rendering:
     *  - "additive"   → "+N"     (Barbarian Rage Damage +2)
     *  - "feet"       → "+N ft"  (Monk Unarmored Movement +10 ft)
     *  - "passthrough"→ raw      (Martial Arts die "d8")
     */
    rider?: {
      sourceKey: string;
      format: "additive" | "feet" | "passthrough";
      /**
       * When set, the rider value is ALSO applied as an active modifier
       * to a derived character stat. Without this, the rider is purely
       * an informational chip on the feature card.
       *
       *  - `"speed"` — adds the value (ft) to the displayed Speed via
       *    `formatSpeed`'s `bonusFt` parameter. Used by Monk Unarmored
       *    Movement (+10 ft at L2, +15 at L6, +20 at L10, +25 at L14,
       *    +30 at L18). The bonus only applies when the rider value is
       *    a number.
       */
      appliesTo?: "speed";
      /**
       * Additional rider chips on the SAME feature card, each reading its own
       * `classSpecific[sourceKey]` and rendered by the SAME chip consumer as the
       * primary rider. Lets one feature surface several scaling values without a
       * parallel widget — e.g. Artificer Replicate Magic Item shows BOTH
       * "Plans Known N" (the primary rider) and "Magic Items N" (this extra, the
       * attuned-item cap 2→6). Each entry's label lives at
       * `<featureId>.mechanics.rider.<sourceKey>.label` in the catalogue. Numeric
       * `0` (not yet unlocked) hides that chip, like the primary.
       */
      extra?: ReadonlyArray<{
        sourceKey: string;
        format: "additive" | "feet" | "passthrough";
      }>;
    };
    /**
     * On-cast trigger (S4 follow-on) — a deterministic side-effect that fires
     * when the character CASTS a spell matching `school` with a spell slot of
     * level ≥ `minSlotLevel`. The only modelled effect today is the **Wizard
     * Abjurer Arcane Ward refill** (`refillTrackerPerSlotLevel`): the feature's
     * own tracker (keyed by this feature's srdId) regains
     * `refillTrackerPerSlotLevel × slotLevel` Hit Points, clamped to its max
     * (the tracker's `used` floors at 0 = a full ward). The cast-commit seam
     * (`TurnEconomyProvider.commitCastOption`) reads it via
     * `resolveOnCastTrackerRefills` and applies it via `applyOnCastTrackerRefills`
     * with undo (override-first — the ward tracker stays editable). Branching is on the stable `school`
     * TOKEN + the stable feature srdId, never a display string (golden rules
     * 12/22). Narrow by design: the sibling on-cast legs (Expert Divination
     * slot-regain, Wild Magic Surge) are deferred — they would add their own
     * `effect` kind here.
     */
    onCast?: OnCastTriggerSpec;
  };
  /** A4 — Declarative effects this feature grants. See SrdRaceTrait.grants. */
  grants?: ReadonlyArray<import("@/lib/grants").Grant>;
  /**
   * A summoned companion's stat block (Artificer Steel Defender / Eldritch
   * Cannon). The sheet resolves AC + max HP from the character's level/ability
   * and tracks the companion's current HP in session. Actions stay in the
   * feature `description` (resolved combat actions are the player's, not the
   * companion's). `improves` lists later feature ids that buff this companion
   * (informational, for the card).
   */
  companion?: CompanionStatBlock;
  /** Source book/setting */
  source: SrdSource;
}

/**
 * A companion attack profile (Beast Master's Beast's Strike). Declarative — no
 * dice are rolled: the resolver derives the to-hit and a damage-formula string.
 *
 *   - `attackBonus` selects how the to-hit is derived:
 *       - `"spell-attack"` → the OWNER's spell attack modifier (Beast's Strike:
 *         "Bonus equals your spell attack modifier");
 *       - `"PB+ability"` → the owner's Proficiency Bonus + the companion's own
 *         `attackAbility` modifier (the classic NPC stat-block convention).
 *   - `dice` is the damage die expression ("1d8"); `addAbility`, when set, adds
 *     the OWNER's modifier (Beast's Strike: + WIS); `damageType` is the base
 *     type (a "your choice" attack carries its first listed option).
 *   - `reachFt` is the melee reach in feet (default 5).
 *   - `rider` is the conditional clause (Land's charge bonus, Sea's Grapple)
 *     surfaced as bilingual text only.
 */
export interface CompanionAttack {
  /** Stable id (`slug(name.en)`) — the attack's catalogue-key segment
   *  (`<featureKey>.companion.attacks.<id>`); name + rider live in the catalogue. */
  id: string;
  attackBonus: "spell-attack" | "PB+ability";
  /** Read only for `attackBonus: "PB+ability"`. */
  attackAbility?: AbilityCode;
  dice: string;
  /** Owner ability modifier added to the damage roll (Beast's Strike: WIS). */
  addAbility?: AbilityCode;
  damageType: DamageType;
  /** Distance in feet — melee reach (default 5) OR, with `ranged`, the range. */
  reachFt?: number;
  /** `true` for a ranged attack (Force Ballista 120 ft) → the view labels the
   *  distance "range" not "reach". Omitted for a melee attack. */
  ranged?: boolean;
}

/**
 * A level-gated companion trait an OWNER feature unlocks at a later level
 * (Beast Master's Exceptional Training L7, Bestial Fury L11). The resolver
 * surfaces it only when the owner's level ≥ `minLevel`.
 */
export interface CompanionUpgrade {
  /** Stable id (`slug(name.en)`) — the upgrade's catalogue-key segment
   *  (`<featureKey>.companion.upgrades.<id>`); name + description in the catalogue. */
  id: string;
  minLevel: number;
}

/** A summoned companion's resolvable stat block (Artificer constructs). */
export interface CompanionStatBlock {
  /** AC = `base` (+ the owner's `ability` modifier, if set). */
  ac: { base: number; ability?: AbilityCode };
  /** Max HP = `base` + `perLevel` × owner's class level. */
  hp: { base: number; perLevel: number };
  /**
   * The companion's Hit Die (one per scaling level), e.g. "d8" — display only.
   * 2024 companion stat blocks state "a number of hit dice equal to your level".
   */
  hitDie?: string;
  /** Speed string, e.g. "40 ft" (omit for stationary). */
  speed?: string;
  /**
   * Multi-mode speeds in feet, keyed by movement mode (Beast Master's Beast of
   * the Land: walk 40, climb 40). Distinct from the single `speed` string
   * (kept for the existing Artificer constructs). When set, the resolver
   * exposes the full map AND derives a `speed` summary string from `walk`.
   */
  speeds?: Readonly<
    Partial<Record<"walk" | "climb" | "fly" | "swim" | "burrow", number>>
  >;
  /**
   * Fixed ability scores (Beast Master beasts). The resolver derives each
   * modifier and a save bonus — when `pbToChecks` is set (Primal Bond), the
   * save ALSO adds the owner's PB. Omitted for the Artificer constructs (their
   * stat block doesn't surface ability scores in the app).
   */
  abilityScores?: Readonly<Record<AbilityCode, number>>;
  /**
   * Attack profiles the companion can make (Beast's Strike). Each is resolved
   * against the owner (spell-attack to-hit, owner-ability damage). The combat
   * UI surfaces them as data rows — no auto-roll.
   */
  attacks?: ReadonlyArray<CompanionAttack>;
  /**
   * Always-on bilingual traits printed in the stat block (Primal Bond, Flyby,
   * Amphibious). Distinct from `upgrades` (which are level-gated).
   */
  traits?: ReadonlyArray<{ id: string }>;
  /**
   * Level-gated upgrades unlocked by LATER owner features (Exceptional Training
   * L7, Bestial Fury L11). The resolver drops any whose `minLevel` exceeds the
   * owner's level. Declared on the base block so one block models the whole
   * companion's progression.
   */
  upgrades?: ReadonlyArray<CompanionUpgrade>;
  /**
   * Damage types the companion is immune to (Steel Defender → Poison).
   * Modeled so the resolved stat block exposes them as a set; the (UI-owned)
   * renderer surfaces them as immunity chips on the companion card.
   */
  damageImmunities?: ReadonlyArray<DamageType>;
  /**
   * Conditions the companion is immune to (Steel Defender → Charmed,
   * Exhaustion, Poisoned). Set-union with no character context.
   */
  conditionImmunities?: ReadonlyArray<ConditionId>;
  /**
   * The companion's own senses, in feet, beyond ordinary sight (Steel Defender
   * → Darkvision 60 ft). Mirrors the character senses model; only the kinds
   * present are listed. Passive Perception is fixed in the stat block (10) so
   * it isn't modeled here.
   */
  senses?: {
    darkvisionFt?: number;
    blindsightFt?: number;
    tremorsenseFt?: number;
    truesightFt?: number;
  };
  /**
   * `true` when the companion adds the OWNER's Proficiency Bonus to every
   * ability check and saving throw it makes (Steel Defender's "Steel Bond",
   * Beast Master's "Primal Bond"). The resolver returns the concrete PB so the
   * card can show the bonus, and — when `abilityScores` are present — folds it
   * into each derived save.
   * Override-first: the displayed PB still honours the character's PB override.
   */
  pbToChecks?: boolean;
  /**
   * Stable id of THIS stat block when it is one option among `variants`
   * (Beast Master: "beast-of-the-land"). The play-time selection is stored on
   * the session (`session.companionVariant[featureId]`); `selectCompanionVariant`
   * resolves the chosen one. Absent for single-block companions (Artificer).
   */
  variantId?: string;
  /**
   * Alternative stat blocks the player chooses ONE of (Beast Master: Beast of
   * the Land / Sea / Sky). When set, the `companion` field is the DEFAULT
   * variant (the one rendered until the player picks another); each entry —
   * including this default — carries a distinct `variantId`. `selectCompanionVariant`
   * returns the block whose `variantId` matches the session selection, defaulting
   * to this block. Single-block companions omit this entirely.
   */
  variants?: ReadonlyArray<CompanionStatBlock>;
}

// ============================================================
// Beast stat blocks (Polymorph / True Polymorph forms)
// ============================================================

/**
 * A FIXED attack row printed in a Beast's stat block (Polymorph forms). Unlike a
 * {@link CompanionAttack} (whose to-hit/damage are derived FROM THE OWNER at
 * render), a Beast form REPLACES your game statistics wholesale — so its attacks
 * are SELF-CONTAINED: the `toHit` and `damageDice` are the exact values as
 * PRINTED in the Beast's stat block (the ability modifier is already folded into
 * `damageDice`). The render edge shows them verbatim, never re-scaled by the
 * caster's own scores.
 */
export interface BeastAttack {
  /** Stable key into the `beasts` catalogue for this attack's localized name
   *  (`attack.bite`, `attack.fist`). Names shared across beasts are keyed once. */
  nameKey: string;
  /** To-hit bonus AS PRINTED in the stat block (+9). Self-contained (never re-scaled). */
  toHit: number;
  /** Damage dice AS PRINTED, the ability modifier already folded in ("3d10+6"). */
  damageDice: string;
  damageType: DamageType;
  /** Melee reach in feet (default 5). Ignored when `range` is set (a ranged attack). */
  reachFt?: number;
  /** Ranged near/far in feet (Giant Ape Rock 25/50) — present ⇒ the view labels
   *  the distance a "range", not a "reach". Omitted for a melee attack. */
  range?: { nearFt: number; farFt: number };
}

/**
 * A CR-indexed Beast stat block — the form a caster (or another creature) takes
 * on under *Polymorph* / *True Polymorph*. Self-contained by design: a form
 * REPLACES the target's game statistics with the Beast's, so every field is the
 * Beast's own printed value (never owner-scaled). The self-swap applicator stamps
 * `ac` / `speeds` / `abilityScores` into the character's override fields
 * (override-first) and applies `hp` as Temporary Hit Points; the read-only
 * reference card renders the block for a polymorphed OTHER creature.
 *
 * Phase 1 ships a starter set of iconic combat forms; Phase 2 fills the full
 * CR 0–8 Beast catalogue (a pure-data add against this same shape).
 */
export interface BeastStatBlock {
  /** Stable id (the catalogue key for the localized name: `giant-ape`). */
  id: string;
  /** Challenge Rating — fraction-capable (0.25, 0.5) so the CR cap can compare it. */
  cr: number;
  size: CreatureSize;
  /** The Beast's natural Armor Class (a per-block value, no formula). */
  ac: number;
  /** The Beast's Hit Points — applied as Temporary Hit Points on assuming the form. */
  hp: number;
  /**
   * Movement modes in feet (walk always present). Reuses the
   * {@link CompanionStatBlock.speeds} record shape. Stamped into the character's
   * `speedOverride` (walk) + `speedOverrides` (fly/swim/climb/burrow).
   */
  speeds: Readonly<Partial<Record<"walk" | "climb" | "fly" | "swim" | "burrow", number>>>;
  /** The Beast's six ability scores — stamped into `abilityScores` (STR/DEX/CON
   *  replace yours; the presenter's effective-score family reads from that field). */
  abilityScores: Readonly<Record<AbilityCode, number>>;
  /** The Beast's fixed attack rows (rendered directly on the Play board while the form is active). */
  attacks: ReadonlyArray<BeastAttack>;
  /** The Beast's own senses beyond ordinary sight (mirrors {@link CompanionStatBlock.senses});
   *  rendered on the read-only reference card. */
  senses?: {
    darkvisionFt?: number;
    blindsightFt?: number;
    tremorsenseFt?: number;
    truesightFt?: number;
  };
  /** Stable ids of the Beast's always-on traits (`trait.pack-tactics`); names in
   *  the `beasts` catalogue. Reference-card display only — narrative, never a grant. */
  traits?: ReadonlyArray<string>;
}

// ============================================================
// Monster stat blocks (the SRD 5.2.1 bestiary — first-class entity)
// ============================================================

/** 2024 creature types (SRD 5.2.1) — the statblock's identity-line noun. */
export type CreatureType =
  | "aberration"
  | "beast"
  | "celestial"
  | "construct"
  | "dragon"
  | "elemental"
  | "fey"
  | "fiend"
  | "giant"
  | "humanoid"
  | "monstrosity"
  | "ooze"
  | "plant"
  | "undead";

/** Runtime list — source of truth for the `srd.creatureType_<id>` i18n keys,
 *  exhaustive by construction (like {@link ALL_DAMAGE_TYPES}). */
export const ALL_CREATURE_TYPES = [
  "aberration",
  "beast",
  "celestial",
  "construct",
  "dragon",
  "elemental",
  "fey",
  "fiend",
  "giant",
  "humanoid",
  "monstrosity",
  "ooze",
  "plant",
  "undead",
] as const satisfies ExhaustiveTuple<
  CreatureType,
  [
    "aberration",
    "beast",
    "celestial",
    "construct",
    "dragon",
    "elemental",
    "fey",
    "fiend",
    "giant",
    "humanoid",
    "monstrosity",
    "ooze",
    "plant",
    "undead",
  ]
>;

/**
 * Alignment as a stable id (2024 prints a single alignment, no "typically").
 * Localized via `srd.alignment_<id>` chrome keys.
 */
export type AlignmentId =
  | "lawful-good"
  | "neutral-good"
  | "chaotic-good"
  | "lawful-neutral"
  | "neutral"
  | "chaotic-neutral"
  | "lawful-evil"
  | "neutral-evil"
  | "chaotic-evil"
  | "unaligned"
  | "any";

/** Runtime list — source of truth for the `srd.alignment_<id>` i18n keys. */
export const ALL_ALIGNMENTS = [
  "lawful-good",
  "neutral-good",
  "chaotic-good",
  "lawful-neutral",
  "neutral",
  "chaotic-neutral",
  "lawful-evil",
  "neutral-evil",
  "chaotic-evil",
  "unaligned",
  "any",
] as const satisfies ExhaustiveTuple<
  AlignmentId,
  [
    "lawful-good",
    "neutral-good",
    "chaotic-good",
    "lawful-neutral",
    "neutral",
    "chaotic-neutral",
    "lawful-evil",
    "neutral-evil",
    "chaotic-evil",
    "unaligned",
    "any",
  ]
>;

/**
 * One damage clause of a monster action — a FACT for machine consumers (the
 * beast projection, the future encounter tools). The printed average is NOT
 * stored: it is `Math.floor(diceMean(dice))` by 2024 print convention, and the
 * corpus guard pins the dice against the entry's localized text (D-3).
 * `dice` is compact ("1d6+2", "2d10"), or a bare integer string ("1") for the
 * flat-damage CR-0 prints — the exact BeastAttack.damageDice grammar.
 */
export interface MonsterDamage {
  dice: string;
  damageType: DamageType;
}

/** Shared spine of every named statblock entry (trait/action/bonus/reaction/legendary). */
export interface MonsterEntryBase {
  /** Stable id (`slug(name.en)`) — the catalogue-key segment; name + text live in
   *  the `monster` catalogue at `<monsterId>.<section>.<id>.{name,text}`. */
  id: string;
  /** "Recharge X–6": the minimum die face that recharges it (6 = "Recharge 6"). */
  recharge?: 2 | 3 | 4 | 5 | 6;
  /** "(N/Day)" and rest-recharge limits. */
  uses?: { count: number; per: "day" | "short-or-long-rest" | "long-rest" };
}

/** A prose-only entry (Multiattack, auras, most traits, legendary moves). */
export interface MonsterNarrativeEntry extends MonsterEntryBase {
  kind: "narrative";
}

/** A 2024 attack-roll entry: "Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6+2) …". */
export interface MonsterAttackEntry extends MonsterEntryBase {
  kind: "attack";
  attack: "melee" | "ranged" | "melee-or-ranged";
  /** To-hit bonus AS PRINTED (self-contained, like BeastAttack.toHit). */
  toHit: number;
  /** Melee reach in feet (present for melee + melee-or-ranged). */
  reachFt?: number;
  /** Ranged near/far in feet (far omitted for single-range prints). */
  rangeFt?: { near: number; far?: number };
  /**
   * Damage clauses in printed order — [0] is the PRIMARY "Hit:" clause, the
   * rest are "plus N (dice) X damage" riders. Conditional/save/miss clauses in
   * the sentence stay prose-only (D-3/D-10).
   */
  damage: ReadonlyArray<MonsterDamage>;
}

/** A save-based entry: "Dexterity Saving Throw: DC 13, … Failure: … Success: …". */
export interface MonsterSaveEntry extends MonsterEntryBase {
  kind: "save";
  save: AbilityCode;
  dc: number;
  /** Failure damage clauses (omit for effect-only saves). */
  damage?: ReadonlyArray<MonsterDamage>;
  /** The printed "Success:" outcome for the damage: half, none, or a special
   *  prose outcome (text carries it). */
  onSuccess: "half" | "none" | "special";
}

/**
 * The 2024 Spellcasting entry — spell references resolve against the spell DB.
 * A "(level N version)" upcast qualifier on a listed spell stays PROSE-ONLY (the
 * entry text carries it, D-3); a future cast-consumer would need a structured
 * slot-level field beside the spell id — deliberate YAGNI today (m3).
 */
export interface MonsterSpellcastingEntry extends MonsterEntryBase {
  kind: "spellcasting";
  ability: AbilityCode;
  /** Spell save DC as printed (present whenever the block prints one). */
  dc?: number;
  /** Spell attack bonus, only when printed ("+5 to hit with spell attacks"). */
  toHit?: number;
  /** At-will spell ids (SRD spell ids — `getSpellById` must resolve each). */
  atWill?: ReadonlyArray<string>;
  /** Per-day tiers in printed order: "1/Day Each:" → { count: 1, spellIds }. */
  perDay?: ReadonlyArray<{ count: number; spellIds: ReadonlyArray<string> }>;
}

export type MonsterEntry =
  | MonsterNarrativeEntry
  | MonsterAttackEntry
  | MonsterSaveEntry
  | MonsterSpellcastingEntry;

/** A skill row: bonus derives (mod + PB, ×2 PB with expertise); `bonus` is stored
 *  ONLY when the printed value deviates (guard-enforced, D-4). `skill` is an
 *  `ALL_SKILLS` id (src/lib/skills.ts). */
export interface MonsterSkill {
  skill: string;
  expertise?: true;
  bonus?: number;
}

/** The Languages line. `ids` reference `srd/languages.json`; special shapes are
 *  closed tokens localized via `monster.lang_<token>` chrome keys. */
export interface MonsterLanguages {
  ids?: ReadonlyArray<string>;
  /** "understands <ids> but can't speak" — applies to the whole `ids` list. */
  understandsOnly?: true;
  /** The split print: the creature SPEAKS its own tongue(s) in `ids` but only
   *  UNDERSTANDS these additional languages (e.g. Blink Dog: speaks "Blink Dog",
   *  understands Elvish and Sylvan). Each id resolves in `srd/languages.json`;
   *  renders as a separate "understands … but can't speak" clause. */
  understandsOnlyIds?: ReadonlyArray<string>;
  telepathyFt?: number;
  /** Telepathy "(doesn't allow the receiving creature to respond
   *  telepathically)" — the recurring one-way-telepathy print qualifier;
   *  renders as a text affix beside the telepathy distance (§A.4 closed-set
   *  qualifier, D-10). Only valid alongside `telepathyFt`. */
  telepathyOneWay?: true;
  /** "plus any N languages" (NPC-style prints). */
  plusAnyCount?: number;
  /** Irregular closed prints: "the languages it knew in life" (`knew-in-life`)
   *  and "Languages All" — knows every language (`all`; couatl, deva, and the
   *  other high-Celestial/planar prints). Rendered via `monster.lang_<token>`. */
  special?: "knew-in-life" | "all";
}
/* The "none" line (—) = the whole `languages` field omitted. */

/** A defense set carrying a 2024 qualifier print. Used ONLY when the SRD text
 *  qualifies the set; unqualified sets use the flat arrays below. */
export interface QualifiedDefense {
  kind: "resistance" | "immunity" | "vulnerability";
  damageTypes: ReadonlyArray<DamageType>;
  qualifier: "nonmagical" | "nonmagical-nonsilvered" | "nonmagical-nonadamantine";
}

/** A defense line whose "type" is a localized prose NOTE, not a closed-set
 *  `DamageType` — the SRD half-dragon's "Resistances Damage type chosen for the
 *  Draconic Origin trait", where the resisted element is GM-variable. `noteKey`
 *  is a closed token resolved verbatim via `monster.defenseNote_<noteKey>` (like
 *  `qualifier_`/`condNote_`); grow the set only when the SRD prints another. */
export interface QualifiedDefenseNote {
  kind: "resistance" | "immunity" | "vulnerability";
  noteKey: "draconic-origin";
}

/**
 * A condition-immunity line entry (m1). Almost always the bare ConditionId; the
 * qualified prints — "Charmed (with Mind Blank)" on the archmage-class entries —
 * carry a CLOSED note token, localized via `monster.condNote_<token>` and
 * rendered as a text affix beside the condition chip (§E.2). Grow the union
 * only when the SRD prints a new qualifier.
 */
export type MonsterConditionImmunity =
  | ConditionId
  | { id: ConditionId; note: "with-mind-blank" };

/**
 * A 2024 (SRD 5.2.1) monster statblock — the bestiary's first-class entity.
 * IDs + numbers ONLY (§7 data guard): every display string (name, entry names,
 * entry prose) lives in the LAZY `monster` catalogue
 * `src/i18n/{en,it}/srd/monsters.json`, keyed by the ids here (docs/ARCHITECTURE.md
 * → "SRD content strings" + the lazy-kind tier).
 *
 * DERIVED-NOT-STORED (guard-enforced): XP + PB (from `cr` via xpForCr/pbForCr),
 * saves (mod + PB × proficiency), skill bonuses, passive Perception, initiative
 * (DEX mod), printed dice averages. Each has a narrow deviation override; an
 * override equal to its derived value fails the corpus guard.
 */
export interface MonsterStatBlock {
  /** Stable id (`slug(name.en)`) — the catalogue key ("goblin-warrior"). */
  id: string;
  /** Challenge Rating — fraction-capable: 0, 0.125, 0.25, 0.5, 1…30. */
  cr: number;
  /** Printed size(s) — almost always one; the NPC prints ("Medium or Small
   *  Humanoid") carry both, printed order. */
  sizes: ReadonlyArray<CreatureSize>;
  type: CreatureType;
  /** Parenthesized type tags as slug ids ("goblinoid", "shapechanger", "demon",
   *  "devil", "angel", "titan"); localized via `srd.creatureTag_<id>`. */
  typeTags?: ReadonlyArray<string>;
  /** "Medium Swarm of Tiny Beasts" → sizes:["Medium"], type:"beast", swarmOf:"Tiny". */
  swarmOf?: CreatureSize;
  alignment: AlignmentId;

  ac: number;
  /** Initiative bonus, stored ONLY when the print deviates from the DEX mod
   *  (legendary bumps); `monsterInitiative()` derives the rest. The printed
   *  parenthetical score is always 10 + bonus. */
  initiative?: number;
  hp: { average: number; formula: string }; // formula compact: "9d8+18"
  /** Movement in feet; reuses the Beast/Companion record shape + hover. */
  speeds: Readonly<Partial<Record<"walk" | "climb" | "fly" | "swim" | "burrow", number>>>;
  /** "Fly 60 ft. (hover)". */
  hover?: true;

  abilityScores: Readonly<Record<AbilityCode, number>>;
  /** Save proficiencies — save = mod + PB for these; `saveOverrides` catches a
   *  deviating print (must differ from the derived value). */
  saveProficiencies?: ReadonlyArray<AbilityCode>;
  saveOverrides?: Readonly<Partial<Record<AbilityCode, number>>>;
  skills?: ReadonlyArray<MonsterSkill>;

  damageVulnerabilities?: ReadonlyArray<DamageType>;
  damageResistances?: ReadonlyArray<DamageType>;
  damageImmunities?: ReadonlyArray<DamageType>;
  conditionImmunities?: ReadonlyArray<MonsterConditionImmunity>;
  qualifiedDefenses?: ReadonlyArray<QualifiedDefense | QualifiedDefenseNote>;

  senses?: {
    darkvisionFt?: number;
    blindsightFt?: number;
    tremorsenseFt?: number;
    truesightFt?: number;
    /** "blindsight 60 ft. (blind beyond this radius)". */
    blindBeyond?: true;
    /** Darkvision "(unimpeded by magical Darkness)" — the recurring 2024
     *  fiend/undead print qualifier; renders as a text affix beside the
     *  darkvision distance (§A.4 closed-set qualifier, D-10). */
    unimpededByMagicalDarkness?: true;
  };
  /** Passive Perception derives (10 + Perception bonus); stored ONLY on a
   *  deviating print. */
  passivePerceptionOverride?: number;

  languages?: MonsterLanguages;
  /** The 2024 Gear line — equipment/weapon/armor catalogue ids (+ counts). */
  gear?: ReadonlyArray<{ id: string; qty?: number }>;
  /** XP stored ONLY when the print deviates from xpForCr(cr) (the CR-0
   *  harmless "XP 0" prints store `xp: 0`). */
  xp?: number;
  /**
   * The lair XP print — "XP 11,500, or 13,000 in lair" (M2; 27 corpus entries:
   * all adult/ancient dragons, aboleth, kraken, lich, mummy-lord, the sphinxes,
   * vampire). Stored AS PRINTED: the SRD states no derivation rule for it (the
   * apparent CR+1 pattern is an observation, not text — D-4 applies only to
   * stated rules). Pairs with `legendary.usesInLair`.
   */
  xpInLair?: number;

  traits?: ReadonlyArray<MonsterEntry>;
  actions: ReadonlyArray<MonsterEntry>; // may be [] (a genuine no-action print)
  bonusActions?: ReadonlyArray<MonsterEntry>;
  reactions?: ReadonlyArray<MonsterEntry>;
  /** "Legendary Action Uses: 3 (4 in Lair)." */
  legendary?: { uses: number; usesInLair?: number };
  legendaryActions?: ReadonlyArray<MonsterEntry>;

  source: SrdSource; // always "SRD" in the public repo (partition guard)
}

// ============================================================
// SRD Class Tables (Level Progression)
// ============================================================

export interface SrdClassTable {
  /** Class ID: "bard", "fighter" */
  id: string;
  /** Hit die size: 6, 8, 10, or 12 */
  hitDie: 6 | 8 | 10 | 12;
  /** Primary ability scores for the class */
  primaryAbility: AbilityCode[];
  /**
   * #36 — how the 2024 multiclass 13+ prerequisite reads `primaryAbility` when
   * it lists more than one: "all" (default — Monk/Paladin/Ranger "Dexterity AND
   * Wisdom") or "any" (Fighter "Strength OR Dexterity"). Verified against
   * dnd2024.wikidot.com (`multiclassing` + each `<class>:main`).
   */
  primaryAbilityMode?: "all" | "any";
  /**
   * #36 — the PARTIAL proficiency set gained on the FIRST level taken in this
   * class when it is NOT the character's initial class ("As a Multiclass
   * Character", dnd2024.wikidot.com `<class>:main`). Absent = the class grants
   * only its Hit Point Die (Monk/Sorcerer/Wizard). Weapon/armor are
   * {@link ProficiencyToken} ids (same vocabulary as `armorProficiencies` /
   * `weaponProficiencies`); tools are stable TOOL IDS (`thieves-tools`,
   * `tinkers-tools`, the `musical-instrument` umbrella) — the level-up wizard
   * appends the concrete ones to `toolProficiencyIds` and localizes the display
   * from the id (golden rule 7; an umbrella id surfaces as a CHOICE, never
   * stored as a finished proficiency). `skillChoice.fromClassList` scopes the
   * pick to `skillChoices.from`; absent = any skill (Bard).
   */
  multiclass?: {
    weaponProficiencies?: ProficiencyToken[];
    armorTraining?: ProficiencyToken[];
    toolProficiencies?: string[];
    skillChoice?: { count: number; fromClassList?: boolean };
  };
  /** Saving throw proficiencies */
  savingThrows: AbilityCode[];
  /** Armor proficiencies — stable {@link ProficiencyToken} ids (`light-armor`,
   *  `shields`); the display resolves via `localizeSrd("proficiency", id, …)`. */
  armorProficiencies: ProficiencyToken[];
  /** Weapon proficiencies — stable {@link ProficiencyToken} ids (`simple-weapons`,
   *  `longswords`); the display resolves via `localizeSrd("proficiency", id, …)`. */
  weaponProficiencies: ProficiencyToken[];
  /** Skill choices at character creation */
  skillChoices: {
    count: number;
    from: string[];
  };
  /**
   * Starting-equipment packages — the 2024 "Starting Equipment: Choose A or B"
   * structure, the SAME shape backgrounds use (`BackgroundEquipmentOption`).
   * Every class offers a gear-heavy Option A (items + leftover gold) and an
   * all-gold alternative; the Fighter offers three (A / B / C). CREATION-CONSUMED
   * data — the creation wizard resolves the player's chosen option into the new
   * character's `weapons` / `equipment` / `currency` via
   * {@link resolveStartingEquipment} (the source-agnostic resolver shared with
   * backgrounds). NEVER stored on the CharacterDoc and never re-derived, so
   * existing characters are unaffected by changes here. Override-first — the
   * player edits the resulting gear freely afterwards.
   */
  startingEquipment: ReadonlyArray<BackgroundEquipmentOption>;
  /**
   * A4 — Declarative effects this CLASS grants at level 1, beyond what its
   * features carry (mirrors `SrdBackgroundData.grants`). Used for the level-1
   * tool-proficiency CHOICE a few classes grant ("choose Artisan's Tools or a
   * Musical Instrument" — Monk; "choose 3 Musical Instruments" — Bard), modelled
   * as a `choice-tool-proficiency` grant so the proficiency is DERIVED + surfaced
   * as a creation pick and override-able. Optional — most classes omit it.
   */
  grants?: ReadonlyArray<import("@/lib/grants").Grant>;
  /** Spellcasting info (null for non-casters) */
  spellcasting?: {
    ability: AbilityCode;
    preparedCaster: boolean;
  };
  /** Per-level progression data */
  levels: SrdClassLevel[];
  /** Level at which subclass is chosen (usually 3) */
  subclassLevel: number;
  /** Available SRD subclasses */
  subclasses: SrdSubclassInfo[];
  /**
   * True for known-casters (Bard, Sorcerer, Ranger, Warlock) who may
   * replace exactly one known spell whenever they gain a level in this class.
   */
  canSwapSpell?: boolean;
  /**
   * Levels at which most subclasses grant bonus always-prepared spells.
   * Used for checklist reminders on level-up.
   * E.g. Paladin: [3, 5, 9, 13, 17], Cleric: [3, 5, 7, 9]
   */
  subclassSpellLevels?: number[];
}

export interface SrdClassLevel {
  /** Character level (1-20) */
  level: number;
  /** Feature IDs gained at this level */
  featureIds: string[];
  /** Proficiency bonus at this level */
  proficiencyBonus: number;
  /** Cantrips known at this level (for casters) */
  cantripsKnown?: number;
  /** Max prepared/known spells at this level (from class table — all casters in 2024) */
  spellsKnown?: number;
  /** Spell slots by level [1st, 2nd, 3rd, 4th, 5th, 6th, 7th, 8th, 9th] */
  spellSlots?: number[];
  /** Class-specific values: e.g. { rages: 2, rageDamage: 2 } for Barbarian */
  classSpecific?: Record<string, number | string>;
  /** Whether ASI/Feat is available at this level */
  asi?: boolean;
}

/**
 * L10 — a subclass that itself grants spellcasting (Eldritch Knight,
 * Arcane Trickster) when the base class isn't a caster. The cantrip/prepared
 * progressions are per character level (index 0 = level 1); the spell-slot
 * table comes from `casterFraction` (third-casters all share one table —
 * see `lib/subclass-spellcasting.ts`).
 */
export interface SubclassSpellcasting {
  /** Casting ability — Eldritch Knight / Arcane Trickster use Intelligence. */
  ability: AbilityCode;
  /** Spell list to draw from (both subclasses: the Wizard list). */
  spellList: ClassId;
  /** Restrict choices to these spell schools (omit = any school in the list). */
  schools?: string[];
  /** Always-known cantrips that don't count against the cantrip budget (Arcane Trickster: Mage Hand). */
  fixedCantrips?: string[];
  /** Cantrips known by character level (index 0 = level 1). */
  cantripsKnown: number[];
  /** Prepared level-1+ spells by character level. */
  preparedKnown: number[];
  /** Which shared spell-slot table to use. */
  casterFraction: "third";
}

export interface SrdSubclassInfo {
  /** Subclass ID: "college-of-lore", "champion" */
  id: string;
  /** All feature IDs belonging to this subclass */
  featureIds: string[];
  /**
   * H7 — "expanded spells" / "always-prepared spells" granted by the subclass.
   * Map of character-level → array of SRD spell IDs that the subclass adds to
   * the character's prepared list when that level is reached. Example for the
   * Cleric Life Domain: `{ 1: ["bless", "cure-wounds"], 3: ["lesser-restoration",
   * "spiritual-weapon"], 5: ["beacon-of-hope", "revivify"], … }`. Optional —
   * subclasses without expanded spells simply omit the field.
   */
  expandedSpells?: Record<number, string[]>;
  /** L10 — subclass-granted spellcasting (Eldritch Knight, Arcane Trickster). */
  spellcasting?: SubclassSpellcasting;
}

// ============================================================
// SRD Races / Species
// ============================================================

export interface SrdRaceData {
  /** Unique ID: "human", "elf", "dwarf" */
  id: string;
  /** Creature size */
  size: "Small" | "Medium" | "Small or Medium";
  /** Base walking speed in feet */
  speed: number;
  /** Racial traits */
  traits: SrdRaceTrait[];
  /** Source book/setting */
  source: SrdSource;
}

export interface SrdRaceTrait {
  /**
   * Stable id — `slug(name.en)`, the trait's catalogue-key segment
   * (`<raceId>.traits.<id>`). The ONLY locale-free handle for a trait once its
   * `name`/`description` BiText is stripped: both the catalogue keys AND the
   * persisted `race:<raceId>:<trait.id>` runtime session ids ARE this id — no
   * English display name is ever embedded in a stored key (golden rule 7).
   */
  id: string;
  /** Mechanical effects (for traits with tracked resources or actions) */
  mechanics?: {
    tracker?: TrackerSpec;
    actions?: SrdActionDef[];
  };
  /**
   * A4 — Declarative effects this trait grants. Read by `evaluateGrants`
   * to produce the character's `AggregatedGrants` view. This is the only
   * path: the declarative model is complete and the old regex parsers
   * (`deriveSenses`, `deriveResistances`) are deleted. Optional — a trait
   * with no mechanical effects simply omits it.
   */
  grants?: ReadonlyArray<import("@/lib/grants").Grant>;
}

// ============================================================
// SRD Backgrounds
// ============================================================

/**
 * One item line in a background's (or class's) starting-equipment package.
 *
 * Override-first / data-faithful: an entry is one of TWO forms —
 *   - `srdId` — a resolvable SRD item (`"dagger"`, `"leather-armor"`,
 *     `"parchment"`, `"iron-pot"`). EVERY explicit pack member is one — the
 *     2024 packs list only real SRD rows, so each resolves through the
 *     id→`localizeSrd` seam and can never leak an EN-baked custom string in
 *     Italian. There is NO name-only / inline-BiText form (the former "flavour"
 *     escape hatch is deleted): a parametric count ("Parchment (10 sheets)") is
 *     `quantity`, a decorative annotation ("Book (prayers)") is dropped.
 *   - `fromToolChoice` — a structural MARKER ("the tool(s) chosen for THIS
 *     source's `choice-tool-proficiency` grant"). The 2024 Monk pack lists
 *     "the Artisan's Tools or Musical Instrument chosen for the tool proficiency
 *     above" and the Bard pack "a Musical Instrument of your choice" — the
 *     chosen tool IS an explicit pack member, not a hardcoded item. The marker
 *     references the grant STRUCTURALLY (never a tool id, never a locale string)
 *     and `expandToolChoiceItem` (`background-equipment.ts`) expands it to the
 *     resolved picked tool(s) once chosen, or a localized PLACEHOLDER before a
 *     pick. ONE expansion drives BOTH the wizard preview AND the created
 *     character's inventory (golden rule 6 — no double-add).
 *
 * Every form carries a `quantity` (default 1). Exactly one of `srdId` /
 * `fromToolChoice` is set; the resolver branches on which is present.
 */
export type BackgroundEquipmentItem =
  | {
      /** A resolvable SRD item id (weapon / armor / gear). */
      srdId: string;
      /** How many of this item the package grants (default 1). */
      quantity?: number;
      fromToolChoice?: undefined;
    }
  | {
      /**
       * MARKER — "the tool(s) chosen for this source's `choice-tool-proficiency`
       * grant" (the Monk's chosen Artisan's Tools / Instrument; the Bard's chosen
       * Musical Instrument). A FIRST-CLASS, VISIBLE pack member that resolves
       * against the source's grant + the player's pick — never a hardcoded tool
       * id, never a locale string.
       */
      fromToolChoice: true;
      /**
       * How many tool ITEMS the package grants (default 1) — the SAME universal
       * "how many" field the `srdId` form carries. The Monk and Bard packs each
       * grant ONE physical tool (the Bard's `choice-tool-proficiency` is amount-3
       * for PROFICIENCY, but the pack item is a single "Musical Instrument of your
       * choice" — wiki-faithful). The first `quantity` of the player's picks
       * resolve into the pack.
       */
      quantity?: number;
      srdId?: undefined;
    };

/**
 * One selectable starting-equipment package for a background — the 2024
 * "Equipment: Choose A or B" structure. Every background offers a gear-heavy
 * Option A (items + leftover gold) and an all-gold Option B (50 GP). Carrying
 * the literal option `label` ("A" / "B") keeps the data a faithful mirror of
 * the source and lets a picker show the exact wording.
 */
export interface BackgroundEquipmentOption {
  /** Option label as printed in the source ("A", "B"). */
  label: string;
  /** Items in this package (empty for the all-gold option). */
  items: ReadonlyArray<BackgroundEquipmentItem>;
  /** Gold pieces (GP) granted alongside the items. */
  gold: number;
}

export interface SrdBackgroundData {
  /** Unique ID: "acolyte", "criminal", "sage" */
  id: string;
  /** Skill proficiencies granted */
  skillProficiencies: string[];
  /** Tool proficiency granted (if any) */
  toolProficiency?: string;
  /**
   * Origin feat granted (feat ID). This is the DEFAULT / fixed origin feat for
   * every fixed-feat background. When `featOptions` is present (a player-choice
   * origin feat — see Pact Seeker's "Choose one Planar Pact feat"), `feat` is
   * the override-first fallback: the slug applied when the player has not yet
   * made a pick. Always a concrete, level-1-eligible feat id (never a feat
   * CATEGORY slug — those don't resolve through `FEATS_BY_ID`).
   */
  feat: string;
  /**
   * PLAYER-CHOICE origin feat. When present, the background's Origin feat is
   * "Choose one of these N feats" (e.g. Pact Seeker → fey-pact | infernal-pact)
   * rather than a single fixed feat. The player picks one at creation; the
   * picker writes the chosen slug, and `getBackgroundOriginFeat(bg, choice)`
   * resolves the effective slug — the chosen option when it's one of these
   * `featOptions`, else the `feat` default (override-first).
   *
   * Modelled as a discrete field rather than a `choice-grant-bundle` because
   * the origin feat is a whole FEAT (its own grants/tracker/actions resolved by
   * the feat pipeline via `character.features`), not a loose bundle of grants on
   * the background source. Every entry MUST be a concrete, level-1-eligible feat
   * id; `feat` SHOULD be one of these options (the suggested default).
   */
  featOptions?: ReadonlyArray<string>;
  /** ASI options description: "+2/+1 or +1/+1/+1" */
  asiOptions: string;
  /**
   * The THREE ability scores this 2024 background's ability-score increase may
   * be assigned to (the "Ability Scores:" line on the background's page — e.g.
   * Acolyte = INT/WIS/CHA, Soldier = STR/DEX/CON). The +2/+1 (or +1/+1/+1)
   * `backgroundAsi` can ONLY land on these three; the creation picker disables
   * every other ability tile so an ineligible assignment is unreachable (golden
   * rule 20). Stable ability-code IDS (golden rule 7) — the localized label
   * is derived at render. Exactly three distinct {@link AbilityCode}s per
   * background; verified against dnd2024.wikidot.com `background:<id>` (the 16
   * SRD rows cross-checked against the official 2024 PHB list).
   */
  abilityOptions: readonly AbilityCode[];
  /**
   * Starting-equipment packages — the 2024 "Equipment: Choose A or B"
   * structure (Acolyte A = Calligrapher's Supplies, Book, Holy Symbol,
   * Parchment, Robe, 8 GP; or B = 50 GP). CREATION-CONSUMED data (not a
   * `Grant` — starting gear is a one-time creation snapshot, not an effect
   * re-aggregated every render): the creation wizard resolves the player's
   * chosen option into the character's `weapons` / `equipment` / `currency`
   * via `resolveStartingEquipment(options, choice)`. Override-first — the player
   * can edit the resulting gear freely afterwards; the engine never re-derives
   * it. Every 2024 background prints an Equipment block, so this is populated
   * across the set; kept optional so a future background without one stays
   * valid and consumers must handle the empty case.
   */
  startingEquipment?: ReadonlyArray<BackgroundEquipmentOption>;
  /**
   * A4 — Declarative SKILL grants this background carries (one `skill-proficiency`
   * per skill). The TOOL grant is NOT baked here: a background's `toolProficiency`
   * needs the SRD equipment catalogue (`@/i18n/srd-en`) to resolve the canonical
   * EN name / expand an umbrella, and reading that from a data module drags the EN
   * SRD corpus into the data bundle chunk — so the engine derives the tool grant in
   * `resolveGrantSourcesForBackground` (`backgroundToolGrant`). Languages aren't
   * modelled (2024 backgrounds grant none).
   */
  grants?: ReadonlyArray<import("@/lib/grants").Grant>;
  /**
   * Source book/setting. `"Wiki"` = official 2024 content outside the CC-BY SRD
   * subset (e.g. the horror-setting content-pack backgrounds), ingested from
   * dnd2024.wikidot.com (mirrors `SrdFeatData.source`).
   */
  source: SrdSource;
}

// ============================================================
// SRD Feats
// ============================================================

export interface SrdFeatData {
  /** Unique ID: "alert", "lucky", "magic-initiate" */
  id: string;
  /** Feat category */
  category: FeatCategory;
  /** Whether this feat can be taken multiple times */
  repeatable: boolean;
  /**
   * Structured prerequisite FACTS for eligibility gating (2024 RAW), verified
   * against dnd2024.wikidot.com. LEVEL gates are NOT stored here — they derive
   * from `category` (general → level 4+, epic-boon → level 19+, fighting-style
   * → the Fighting Style feature; origin → none). Absent = no prerequisite
   * beyond the category's. The localized prerequisite STRING shown in the UI
   * lives in the i18n catalogue (`feat.<id>.prerequisite`); this field is what
   * the engine BRANCHES on (ids/enums only — golden rule 7).
   */
  prereq?: {
    /**
     * Ability minimums: every entry must be satisfied by AT LEAST ONE of its
     * listed abilities ("Strength or Dexterity 13+" → one entry with
     * `{ anyOf: ["STR","DEX"], min: 13 }`).
     */
    abilities?: ReadonlyArray<{ anyOf: ReadonlyArray<AbilityCode>; min: number }>;
    /** Requires the Spellcasting or Pact Magic feature. */
    spellcasting?: boolean;
    /** Requires training with this armor kind ("Medium Armor Training", …). */
    armorTraining?: ArmorCategory;
  };
  /** Mechanical effects (for feats with tracked resources or actions) */
  mechanics?: {
    tracker?: TrackerSpec;
    /**
     * ADDITIONAL trackers beyond the primary `tracker` — the same primitive
     * class features use (Psi Warrior Psionic Power). A feat may carry several
     * independent limited-use benefits (Light Bringer: Sun's Healing 1/Short
     * Rest + Solar Luminance 1/Long Rest). Resolved by `resolveTrackers`
     * through the same `"extraTrackers" in mechanics` narrowing.
     */
    extraTrackers?: ExtraTrackerSpec[];
    actions?: SrdActionDef[];
  };
  /**
   * Fighting-style restriction to a single class (golden rule 7 — a stable
   * `ClassId`, never a display string). The two 2024 CASTER fighting styles are
   * class-locked: Blessed Warrior is a Paladin-only option, Druidic Warrior a
   * Ranger-only one. Absent = the universal styles offered to every Fighting
   * Style class (Fighter / Paladin / Ranger). Only meaningful for
   * `category: "fighting-style"` feats.
   */
  classScope?: ClassId;
  /** A4 — Declarative effects (e.g. Tough: +2 HP/level; Lucky: nothing data-driven). */
  grants?: ReadonlyArray<import("@/lib/grants").Grant>;
  /**
   * Content source. `"SRD"` = CC-BY 2024 SRD 5.2.1 (authoritative IT
   * translations available); non-`"SRD"` tags mark pack-side provenance —
   * such rows live in the content pack, never in `src/data`.
   */
  source: SrdSource;
}

// ============================================================
// SRD Equipment
// ============================================================

export interface SrdEquipmentData {
  /** Unique ID: "longsword", "chain-mail", "backpack" */
  id: string;
  /** Equipment category */
  category: EquipmentCategory;
  /** Cost */
  cost: {
    amount: number;
    unit: CurrencyUnit;
  };
  /** Weight in pounds (if applicable) */
  weight?: number;
  /**
   * Bundle size — the number of individual units the listed `cost` + `weight`
   * represent (the SRD lists ammunition by the bundle: "Crossbow Bolts (20) —
   * 1 GP — 1.5 lb"). Absent / 1 = sold individually. Per-unit weight is
   * `weight / bundleSize`, so 20 bolts weigh 1.5 lb, not 30. Adding the item
   * adds one whole bundle (quantity = bundleSize).
   */
  bundleSize?: number;
  /** Weapon damage (weapon-specific) */
  damage?: {
    die: string;
    type: DamageType;
  };
  /** Weapon properties: ["Finesse", "Light", "Thrown (Range 20/60)"] */
  properties?: string[];
  /** Weapon mastery property (2024 PHB, weapon-specific) */
  mastery?: WeaponMastery;
  /** Weapon category (weapon-specific) */
  weaponCategory?: WeaponCategory;
  /** Weapon type (weapon-specific) */
  weaponType?: WeaponType;
  /**
   * The gear id of the ammunition this weapon consumes — DECLARED, present iff
   * the weapon has the Ammunition property (a Longbow → `"arrows"`, a Musket →
   * `"firearm-bullets"`). The combat resolver reads this directly to stamp the
   * tracked-ammo row and to debit the right stock per attack; it is NEVER parsed
   * out of the `properties` prose (golden rules 2/5/7 — declare the fact, don't
   * regex English; the sling and the firearms both print "; Bullet", so the
   * printed token cannot disambiguate them). A data-integrity test guards that
   * every Ammunition-property weapon declares a valid gear id and no other
   * weapon carries one.
   */
  ammunitionId?: string;
  /** Armor class calculation (armor-specific) */
  ac?: {
    base: number;
    dexBonus: boolean;
    maxDex?: number;
  };
  /** Armor category (armor-specific) */
  armorCategory?: ArmorCategory;
  /** Whether armor imposes stealth disadvantage */
  stealthDisadvantage?: boolean;
  /** Minimum strength required for armor */
  strengthReq?: number;
  /** Whether this item is consumed on use (potion, acid, etc.) */
  isConsumable?: boolean;
  /**
   * Healing potion roll (e.g. "2d4+2"). Structured here so EVERY reference to the
   * item renders the same heal verdict — display is derived from SRD data, never
   * hand-declared on the inventory ref.
   */
  potionFormula?: string;
  /** Source book/setting */
  source: SrdSource;
}

// ============================================================
// SRD Conditions
// ============================================================

export interface SrdConditionData {
  /** Unique ID: "blinded", "charmed", "frightened" */
  id: string;
  // name / description / bullet-point effects live in the SRD catalogue
  // (`condition` kind), keyed by this id.
}

// ============================================================
// Aggregate Type (for search/filtering helpers)
// ============================================================

// ============================================================
// SRD Magic Items
// ============================================================

/** Magic item rarity tiers */
export type MagicItemRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "very-rare"
  | "legendary"
  | "artifact";

/** Runtime list of magic-item rarities — source of truth for `magicItems.rarity_*`. */
export const ALL_MAGIC_ITEM_RARITIES = [
  "common",
  "uncommon",
  "rare",
  "very-rare",
  "legendary",
  "artifact",
] as const satisfies ExhaustiveTuple<
  MagicItemRarity,
  ["common", "uncommon", "rare", "very-rare", "legendary", "artifact"]
>;

/** Magic item type categories */
export type MagicItemType =
  | "armor"
  | "weapon"
  | "wondrous"
  | "potion"
  | "ring"
  | "rod"
  | "scroll"
  | "staff"
  | "wand";

/** Runtime list of magic-item types — source of truth for `magicItems.type_*`. */
export const ALL_MAGIC_ITEM_TYPES = [
  "armor",
  "weapon",
  "wondrous",
  "potion",
  "ring",
  "rod",
  "scroll",
  "staff",
  "wand",
] as const satisfies ExhaustiveTuple<
  MagicItemType,
  ["armor", "weapon", "wondrous", "potion", "ring", "rod", "scroll", "staff", "wand"]
>;

export interface SrdMagicItemData {
  /** Unique slug ID: "bag-of-holding" */
  id: string;
  /** Rarity tier */
  rarity: MagicItemRarity;
  /** Item type category */
  type: MagicItemType;
  /** Whether attunement is required */
  attunement: boolean;
  /** Suggested price: "400 GP", "B+4000 GP" */
  price?: string;
  /** Healing potion roll (e.g. "2d4+2") — derived display, see SrdEquipmentData. */
  potionFormula?: string;
  /** Weight in pounds, when the item carries a meaningful one (e.g. a potion is
   *  0.5 lb). Most magic items are negligible and omit it (→ 0 in the bag). */
  weight?: number;
  /** Mechanical tags: ["+1 bonus", "charges: 7"] */
  properties?: string[];
  /** A4 — Declarative effects this item grants when equipped (AC bonus, etc.). */
  grants?: ReadonlyArray<import("@/lib/grants").Grant>;
  /**
   * S9 — a CONSUMED buff potion's timed duration, in COMBAT ROUNDS (1 round =
   * 6 seconds, so 1 minute = 10, 1 hour = 600). When set, drinking the potion
   * ARMS a `potion:<id>` round-countdown in `session.effectTimers` (the same
   * A2 cadence map a Rage uses) so its remaining duration counts down at each
   * End Turn and auto-expires — informational + override-editable; the engine
   * never auto-applies the buff's stats (override-first). Omit for an instant
   * potion (Healing) or a non-timed effect.
   */
  durationRounds?: number;
  /** Content source */
  source: SrdSource;
}

/** Map of SRD entity types by ID for fast lookup */
export type SrdIndex<T extends { id: string }> = Map<string, T>;
