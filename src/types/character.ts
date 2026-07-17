/**
 * Character Data Types
 *
 * Defines the complete shape of a character document stored in Firestore.
 * Characters use SRD references (srdId) for standard content, and inline
 * data for custom/homebrew content.
 */

import type {
  AbilityCode,
  ActionType,
  DamageType,
  Recovery,
  SpellSchool,
  TrackerUnit,
} from "@/data/types";
import type { CombatEvent } from "@/types/combat-log";
import type {
  StoredConcentration,
  RaceId,
  ProficiencyToken,
  AlignmentId,
} from "@/types/ids";
import type { NonEmptyString } from "@/lib/non-empty-string";

// ============================================================
// SRD Reference Types (stored on character, resolved at render)
// ============================================================

/** Reference to an SRD spell on a character */
export interface SrdSpellRef {
  /** SRD spell ID: "fireball", "cure-wounds" */
  srdId: string;
  /** Whether this spell is prepared (for prepared casters) */
  prepared?: boolean;
  /**
   * A2 — granted by a subclass / Domain / Oath / Circle and "always prepared"
   * per 2024 RAW: the player can't unprepare it and it does NOT count against
   * the class's `preparedMax`. The injector in `expanded-spells.ts` sets this
   * flag; the prepared-count helpers exclude it.
   */
  alwaysPrepared?: boolean;
  /** Player's personal notes */
  notes?: string;
  /** Custom tags */
  tags?: CharacterTag[];
  /** User overrides to SRD data fields */
  overrides?: Record<string, unknown>;
  /**
   * Per-spell casting-ability override. Set when the spell is granted by a
   * feat that pins the casting ability (Magic Initiate Cleric → Wisdom,
   * Magic Initiate Wizard → Intelligence, etc.) regardless of the
   * character's class spellcasting ability. Override-first: the player can
   * always edit it via the spell card. Falls back to the character's
   * spellcasting ability when unset.
   */
  spellAbilityOverride?: AbilityCode;
  /**
   * Wizard L18 Spell Mastery — the chosen 1st- and 2nd-level spell can be
   * cast at its base level without expending a spell slot, as long as it's
   * prepared. UI badges it as "MASTERY" and the cast modal can skip slot
   * deduction at base level. The player can change picks via the spell card.
   */
  wizardSpellMastery?: boolean;
  /**
   * Wizard L20 Signature Spells — two 3rd-level spells that are always
   * prepared (don't count against the prepared limit) and castable once
   * each at L3 without a slot per short or long rest. UI badges it as
   * "SIGNATURE". The wizard-signature-spells feature carries the 2-use
   * short-rest tracker; this flag identifies which two spells are signed.
   */
  wizardSignatureSpell?: boolean;
  /**
   * A chosen spell that's also free-castable via a feature's tracker (Aberrant
   * heritage feat's chosen 1st-level spell: 1/Long Rest without a slot). Set by
   * the choice resolver from the granting feat's `choice-spell.freeCastSource`;
   * the cast modal offers a slotless cast that decrements `sourceId`'s tracker.
   */
  freeCastSource?: { sourceId: string; rest: "short" | "long"; usesPerRest: number };
  /**
   * Species lineage innate spell whose casting ability is the "choose INT/WIS/
   * CHA" pick made when the player selected the species (2024 Tiefling Fiendish
   * Legacy + Otherworldly Presence). Unlike `spellAbilityOverride` (which pins a
   * concrete ability on the ref), this is a DEFERRED marker: `resolveSpellAbility`
   * reads the live `character.speciesSpellAbility` so changing the one species
   * choice updates every deferred spell at once — no re-injection needed. Stamped
   * by the always-prepared-spell injection from a grant's `spellAbilitySource:
   * "species"`. A literal `spellAbilityOverride` still takes precedence.
   */
  speciesSpellAbility?: boolean;
}

/** Custom/homebrew spell (not in SRD) */
export interface CustomSpell {
  custom: true;
  name: string;
  level: number;
  school: SpellSchool;
  castingTime: string;
  range: string;
  components: {
    v: boolean;
    s: boolean;
    m: boolean;
    material?: string;
  };
  duration: string;
  concentration: boolean;
  description: string;
  higherLevels?: string;
  prepared?: boolean;
  notes?: string;
  tags?: CharacterTag[];
  /** Per-spell casting-ability override (see SrdSpellRef.spellAbilityOverride). */
  spellAbilityOverride?: AbilityCode;
}

/** Reference to an SRD feature on a character */
export interface SrdFeatureRef {
  /** SRD feature ID: "bard-bardic-inspiration" */
  srdId: string;
  /** Player's personal notes */
  notes?: string;
  /** Custom tags */
  tags?: CharacterTag[];
  /** Override tracker settings */
  trackerOverrides?: Partial<TrackerData>;
  /** Override action settings */
  actionOverrides?: Partial<ActionData>[];
  /** Override content blocks */
  contentOverrides?: Partial<ContentBlockData>[];
  /** Generic field overrides */
  overrides?: Record<string, unknown>;
}

/** Custom/homebrew feature (not in SRD) */
export interface CustomFeature {
  custom: true;
  title: string;
  emoji: string;
  subtitle?: string;
  source: string;
  tags: CharacterTag[];
  contentBlocks: ContentBlockData[];
  trackers?: TrackerData[];
  actions?: ActionData[];
}

/** Reference to an SRD equipment item on a character */
export interface SrdEquipmentRef {
  /** SRD equipment ID: "longsword", "potion-of-healing" */
  srdId: string;
  /** Player's personal notes */
  notes?: string;
  /** Whether this armor/shield is currently worn/equipped */
  equipped?: boolean;
  /** Whether this item is consumed on use (quantity IS the tracker) */
  isConsumable?: boolean;
  /** Whether quantity is tracked */
  tracked?: boolean;
  /** Current quantity */
  quantity?: number;
  /** Recovery timing */
  recovery?: Recovery;
  /** Whether this is a potion */
  isPotion?: boolean;
  /** Potion healing formula (e.g., "2d4+2") */
  potionFormula?: string;
  /** Whether this is a pool resource */
  isPool?: boolean;
  /** Stable unit token for pool resources (localized at the render boundary). */
  unit?: TrackerUnit;
  /**
   * MAGIC-ITEMS — flat AC bonus when equipped (e.g. Ring of Protection +1,
   * Cloak of Protection +1, +1 Plate Armor). Stacks with any base armor +
   * shield and other equipped acBonus items. Optional.
   */
  acBonus?: number;
  /**
   * MAGIC-ITEMS — charges model for items like wands and staves
   * (Wand of Magic Missiles: 7 charges, regains 1d6+1 at dawn). When set the
   * UI surfaces a small "N/M" pip + a "Use 1" / "Recover" affordance.
   */
  charges?: {
    current: number;
    max: number;
    /** When charges restore (typically "long-rest" for "at dawn"). */
    recovery?: Recovery;
    /** Human-readable recovery formula shown in the tooltip ("1d6+1"). */
    recoveryFormula?: string;
  };
  /** MAGIC-ITEMS — true when the player has attuned to this item. */
  attuned?: boolean;
  /** User overrides to SRD data fields */
  overrides?: Record<string, unknown>;
}

/** Custom/homebrew equipment (not in SRD) */
export interface CustomEquipment {
  custom: true;
  name: string;
  description?: string;
  emoji?: string;
  notes?: string;
  /** Whether this armor/shield is currently worn/equipped */
  equipped?: boolean;
  /** Custom armor AC data (for homebrew armor) */
  ac?: { base: number; dexBonus: boolean; maxDex?: number };
  /** Custom armor category */
  armorCategory?: "light" | "medium" | "heavy" | "shield";
  /** Flat AC bonus when equipped (e.g. Ring of Protection +1, Cloak of Protection +1) */
  acBonus?: number;
  /** Whether this item is consumed on use (quantity IS the tracker) */
  isConsumable?: boolean;
  tracked?: boolean;
  quantity?: number;
  recovery?: Recovery;
  isPotion?: boolean;
  potionFormula?: string;
  isPool?: boolean;
  /** Stable unit token for pool resources (localized at the render boundary). */
  unit?: TrackerUnit;
  /** MAGIC-ITEMS — see SrdEquipmentRef.charges for shape and semantics. */
  charges?: {
    current: number;
    max: number;
    recovery?: Recovery;
    recoveryFormula?: string;
  };
  /** MAGIC-ITEMS — true when the player has attuned to this item. */
  attuned?: boolean;
}

/** Reference to an SRD weapon on a character */
export interface SrdWeaponRef {
  /** SRD equipment ID (weapons are a subset of equipment) */
  srdId: string;
  /** Weapon quantity */
  quantity: number;
  /** Player's personal notes */
  notes?: string;
  /** Custom tags */
  tags?: CharacterTag[];
  /** Override the calculated attack bonus */
  attackBonusOverride?: number | null;
  /** Override the damage string */
  damageOverride?: string | null;
  /**
   * The magic-item enchant bound to THIS weapon (PRIM-item-bound-bonus): the
   * `srdId` of a magic weapon item (`weapon-plus-1`, `vorpal-sword`, …) whose
   * `item-bound-bonus` grant adds its +N to THIS weapon's attack & damage
   * automatically — superseding the manual `attackBonusOverride`/`damageOverride`
   * seam. Additive + optional (undefined on every existing/migrated weapon, so
   * the change is invisible to live data); the engine adds the bonus only when
   * set. Override-first: an explicit `attackBonusOverride`/`damageOverride` still
   * wins (the player pinned a value by hand).
   */
  enchantItemId?: string;
  /** User overrides to SRD data fields */
  overrides?: Record<string, unknown>;
}

/** Custom/homebrew weapon (not in SRD) */
export interface CustomWeapon {
  custom: true;
  name: string;
  quantity: number;
  emoji?: string;
  damageDie: string;
  damageType: DamageType;
  attackStat: "STR" | "DEX";
  attackBonusOverride?: number | null;
  damageOverride?: string | null;
  properties: string;
  description?: string;
  notes?: string;
  tags?: CharacterTag[];
}

// ============================================================
// Supporting Types
// ============================================================

/** Custom tag for organizing character items */
export interface CharacterTag {
  label: string;
  color: string;
}

/** Feature tracker data (usage counters) */
export interface TrackerData {
  /** Resource ID (for state tracking) */
  id: string;
  /** Display label */
  label: string;
  /** Total uses — number or formula: "CHA", "PB", "5" */
  total: string;
  /** Recovery timing */
  recovery: Recovery;
  /** Die type if applicable: "d6", "d8" */
  die?: string;
  /** Whether this is a pool resource */
  isPool?: boolean;
  /** Stable unit token for pool resources (localized at the render boundary). */
  unit?: TrackerUnit;
  /**
   * How many uses recover on a Short Rest — number, "all", or a formula
   * (resolved through the same parser as `total`). Only meaningful when
   * the tracker's recovery is "short-rest" or "short-or-long-rest", or
   * when overriding a long-rest tracker to grant partial short-rest
   * recovery (Psi Warrior / Soulknife / Wild Shape).
   */
  shortRestRecovery?: number | string;
  /**
   * Alternate activation/recovery cost — an exhausted use can be restored by
   * spending `amount` units from the `fromTracker` pool instead of resting
   * (Sorcerer's "spend N Sorcery Points to restore"). Mirrors
   * `TrackerSpec.altRecoveryCost` so per-character `trackerOverrides` can set,
   * change, or clear it (override-first). Setting `amount: 0` clears it.
   */
  altRecoveryCost?: { amount: number; fromTracker: string };
}

/** Feature action data */
export interface ActionData {
  /** Action type */
  type: ActionType;
  /** Short label */
  label: string;
  /** Action description */
  description: string;
  /**
   * CQ8 — Number of tracker uses consumed when this action fires (default 1).
   * Mirrors `SrdActionDef.trackerCost` so custom features and overrides can
   * express the same multi-cost semantics (e.g. Quivering Palm = 4 Focus Points).
   */
  trackerCost?: number;
  /**
   * CQ8 — ID of another feature whose tracker this action consumes. Mirrors
   * `SrdActionDef.costTracker` so cross-feature pool linkage (Flurry of Blows
   * → Monk Focus) survives both custom features and `actionOverrides`.
   */
  costTracker?: string;
}

/** Content block within a feature */
export interface ContentBlockData {
  /** Block type */
  type: "text" | "table" | "list";
  /** Title for the block */
  title?: string;
  /** Text content (for text blocks) */
  text?: string;
  /** List items (for list blocks) */
  items?: string[];
  /** Table data (for table blocks) */
  table?: {
    headers: string[];
    rows: string[][];
  };
}

/** Combat algorithm step */
export interface CombatAlgorithmStep {
  emoji: string;
  title: string;
  steps: Array<{
    question?: string;
    indent?: boolean;
    bullets: string[];
  }>;
}

/** Level-up checklist item */
export interface LevelUpChecklistItem {
  text: string;
  done: boolean;
  /** i18n key for locale-aware display (falls back to text) */
  i18nKey?: string;
  /** Interpolation args for i18nKey */
  i18nArgs?: Record<string, string | number>;
}

// ============================================================
// Character Lore
// ============================================================

export interface CharacterLore {
  traits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  backstory: string;
  age: string;
  height: string;
  weight: string;
  eyes: string;
  hair: string;
  skin: string;
}

// ============================================================
// Spellcasting Configuration
// ============================================================

export interface SpellcastingConfig {
  ability: AbilityCode;
  preparedCaster: boolean;
  preparedMax: number;
  /** Override for preparedMax (null = use computed value from class table) */
  preparedMaxOverride?: number | null;
  saveDCOverride: number | null;
  attackBonusOverride: number | null;
}

// ============================================================
// Portrait Crop Metadata
// ============================================================

/**
 * Crop region stored as percentages of the original image dimensions.
 * Comes directly from react-easy-crop's `croppedArea` callback argument.
 *
 * CSS crop math (parent must be `position:relative; overflow:hidden`):
 *   img.width  = (100 / width) * 100%
 *   img.height = (100 / height) * 100%
 *   img.left   = -(x / width) * 100%
 *   img.top    = -(y / height) * 100%
 */
export interface PortraitCrop {
  /** Left edge of the crop as % of original image width (0–100) */
  x: number;
  /** Top edge of the crop as % of original image height (0–100) */
  y: number;
  /** Crop width as % of original image width (0–100) */
  width: number;
  /** Crop height as % of original image height (0–100) */
  height: number;
}

// ============================================================
// Character Document (Full Firestore Document)
// ============================================================

export interface CharacterDoc {
  /** Auto-generated Firestore document ID */
  id: string;
  /** Timestamp when character was created */
  createdAt: Date;
  /** Timestamp when character was last updated */
  updatedAt: Date;
  /**
   * Firebase Storage URL for the compressed original portrait.
   * Path: users/{uid}/portraits/{charId}.jpeg
   * Display uses CSS crop via portraitCrop; null = no portrait.
   */
  portraitUrl: string | null;
  /**
   * Crop region (percentages) from react-easy-crop.
   * null = no crop set (fall back to object-cover for display).
   */
  portraitCrop: PortraitCrop | null;
  /** If shared, links to /shared/{shareId} */
  shareId: string | null;
  /** Character lifecycle status */
  status: "active" | "retired" | "dead" | "archived";

  /** Character definition (static data, changed in edit mode) */
  character: CharacterData;

  /** Session state (mutable during play) */
  session: SessionState;
}

// ============================================================
// Multiclass — the `classes[]` model (R4 / docs/ARCHITECTURE.md)
// ============================================================

/**
 * R4 — one class a character has levels in. The 2024 multiclass model: a
 * character is an ARRAY of these (single-class = exactly one entry). IDs are the
 * only source of truth (golden rule 7) — `classId` / `subclassId` are stable
 * slugs; the display name is DERIVED via `classNameById` / the SRD resolver, never
 * stored. Class-SCOPED picks (weapon masteries, metamagic, invocations, maneuvers,
 * fighting styles) live on the entry that owns them, not at the character root.
 *
 * The character's TOTAL level is `sum(classes[].level)` — DERIVED via `totalLevel()`
 * (`src/lib/classes.ts`), never stored. PB, hit-dice total, ASI/feat gates all flow
 * from the total; spell slots from the 2024 multiclass caster table
 * (`lib/multiclass-slots.ts`); features/riders/scaling from EACH entry at ITS level.
 */
export interface ClassEntry {
  /** STABLE class id (e.g. "wizard") — REQUIRED. No display string is stored. */
  classId: string;
  /** STABLE subclass id (e.g. "college-of-lore"). Omitted before the subclass level. */
  subclassId?: string;
  /** Levels IN THIS class (≥ 1). */
  level: number;
  /** M1 — Weapon Mastery picks (SRD weapon ids) chosen for THIS class. */
  weaponMasteries?: string[];
  /** M1 — Metamagic ids (Sorcerer) chosen for THIS class. */
  metamagicChoices?: string[];
  /** M1 — Eldritch Invocation ids (Warlock) chosen for THIS class. */
  invocationChoices?: string[];
  /** Maneuver ids (the Fighter maneuver subclass) chosen for THIS class. */
  maneuverChoices?: string[];
  /** Fighting Style ids chosen for THIS class. */
  fightingStyles?: string[];
}

// ============================================================
// Character Definition (Edit Mode Data)
// ============================================================

export interface CharacterData {
  /**
   * The hero's display name — a {@link NonEmptyString}, so "a character with no
   * name" is UNREPRESENTABLE at the type level (owner directive 2026-06-15). A plain
   * `string` is NOT assignable here: the value MUST be minted through
   * `nonEmptyString()` at every construction site (the codec parse, the inline-edit
   * commit, the creation wizard). Reads stay transparent — a `NonEmptyString` IS a
   * `string`, so `t(..., { name })`, slugging, and JSX need no cast.
   */
  name: NonEmptyString;
  quote: string;
  race: RaceId;
  /**
   * R4 — the multiclass breakdown: one {@link ClassEntry} per class the character
   * has levels in (length ≥ 1; single-class = exactly one entry). This is the SOLE
   * source of truth for which classes/subclasses/levels the character has, and for
   * the class-scoped picks (weapon masteries / metamagic / invocations / maneuvers /
   * fighting styles), which live ON the owning entry.
   *
   * There is NO legacy `class`/`subclass`/`classId`/`subclassId`/`level` projection
   * (owner directive 2026-06-09 — a superseded field is removed COMPLETELY). Every
   * consumer DERIVES what it needs through `getClasses()` / `totalLevel()` /
   * `primaryClassEntry()` / `classEntryLevel()` (`src/lib/classes.ts`). The total
   * character level is `totalLevel(c)` (= sum of entry levels); the headline class
   * is `primaryClassEntry(c)` (highest-level, ties → first); display names derive
   * from the ids (`localizeClassName` in views, `primaryClassName` SRD-free).
   */
  classes: ClassEntry[];
  background: string;
  alignment: AlignmentId;
  playerName: string;
  /**
   * The character's BASE walking Speed (feet, no unit — the species/class
   * value). The EFFECTIVE walking Speed shown on the sheet is RENDER-DERIVED via
   * `effectiveWalkingSpeedFt` (base + grant `speedBonusFt` + the `no-heavy-armor`
   * conditional bonus, × `speedMultiplier` (Boots of Speed), − the heavy-armor
   * Strength penalty − exhaustion), so Mobile / Fast Movement / Unarmored
   * Movement / Roving / Boots of Speed / exhaustion all flow through live.
   * Override-first via `speedOverride`.
   */
  speed: string;
  /**
   * Manual EFFECTIVE-walking-Speed override (feet). `null`/absent = derive (the
   * default, reactive — `effectiveWalkingSpeedFt`). A number pins the walking
   * Speed regardless of grants/armor/exhaustion — mirrors `acOverride`.
   */
  speedOverride?: number | null;
  /**
   * Denormalized AC snapshot (kept for the character-list summary / share / PDF
   * + legacy docs). On the sheet, AC is RENDER-DERIVED via `effectiveAC`
   * (`acOverride ?? computeAC(...) + ability AC bonuses`) so it reflects
   * equipment / ability / Bladesong changes live.
   */
  ac: number;
  /**
   * Manual AC override. `null`/absent = derive (the default, reactive). A
   * number pins AC regardless of equipment/abilities — mirrors
   * `initiativeBonusOverride` / `passivePerceptionOverride`.
   */
  acOverride?: number | null;
  armorNote: string;
  hp: { max: number };
  hitDieType: 4 | 6 | 8 | 10 | 12;
  /**
   * Explicit user-supplied initiative bonus. `null` (or undefined on legacy
   * docs) means "use the live `computeInitiative(DEX, PB, Alert, exhaustion)`".
   * Splitting this off the old conflated `initiativeBonus` slot is what
   * makes Alert / DEX-on-ASI / PB-tier-up flow into Initiative automatically
   * without a manual reset.
   */
  initiativeBonusOverride?: number | null;
  /**
   * Explicit user override for *rolling Initiative with Advantage*. `null` /
   * undefined defers to the auto-computed result (`hasInitiativeAdvantage`,
   * which reads `advantage-on { rollType: "initiative" }` grants — e.g. the
   * Assassin's Assassinate). `true` forces Advantage on (a DM ruling / a
   * situational source the engine can't model); `false` suppresses it.
   * Advantage is a roll modifier, never an additive term, so it lives apart
   * from `initiativeBonusOverride` rather than folding into the number.
   */
  initiativeAdvantageOverride?: boolean | null;
  /**
   * The MANUAL language picks as STABLE SRD LANGUAGE IDS (`"common"`, `"gnomish"`,
   * `"undercommon"`, …) — the player's hand-added / `choice-language`-picked
   * tongues. NEVER a localized display string (the leak the owner saw: "gnomico"
   * stored verbatim renders identically in every locale). FIXED/auto-granted
   * languages (a Rogue's Thieves' Cant, a Druid's Druidic, a race trait) flow
   * through their `language` grant and are NOT stored here. The presenter
   * (`displayLanguages`) unions these ids with the aggregate's granted ids, dedups
   * by id, and localizes EACH id via `localizeSrd("language", id, …)` — so a tongue
   * reads the SAME canonical name on every surface in the active locale (golden
   * rules 6/7). Adding a new app language is JUST adding `languages.json`.
   */
  languageIds: string[];
  /**
   * Homebrew / off-catalogue languages as VERBATIM player labels — the ONE allowed
   * place a user-authored language string lives (like a custom spell/item name).
   * A token that resolves to no SRD language id lands here; the presenter appends
   * it verbatim (single-locale, by definition). Absent / `[]` = none.
   */
  customLanguages: string[];
  /**
   * The MANUAL tool-proficiency picks as STABLE TOOL IDS (`"smiths-tools"`,
   * `"disguise-kit"`, …) — the player's hand-added tools only. NEVER a localized
   * label (the leak: "Strumenti da Artigiano" stored verbatim) and NEVER a generic
   * UMBRELLA (`artisans-tools` / `gaming-set` / `musical-instrument` — an umbrella
   * is a "choose one kind of X" CHOICE, resolved into a `toolChoices` pick, never a
   * finished proficiency). FIXED tool grants (Rogue's Thieves' Tools, a background's
   * fixed tool) are DERIVED from their `tool-proficiency` grants; a "choose a tool"
   * CHOICE pick lives in {@link toolChoices} as STABLE IDS and is derived too. So
   * this array is ONLY the manual hand-add portion. `displayToolProficiencies`
   * unions these ids ∪ the derived set, localizes each by id, and gates umbrellas.
   */
  toolProficiencyIds: string[];
  /**
   * Homebrew / off-catalogue tool proficiencies as VERBATIM player labels — the ONE
   * allowed place a user-authored tool string lives. A token that resolves to no
   * catalogue tool id lands here; the presenter appends it verbatim. Absent / `[]`
   * = none.
   */
  customToolProficiencies: string[];
  /**
   * Tool-CHOICE picks as STABLE TOOL IDS — the id-based home for a class /
   * background / feat "choose a tool" decision (Monk "Artisan's Tools or Musical
   * Instrument", Bard "3 Musical Instruments", Entertainer "an instrument of your
   * choice"). Keyed by the namespaced choice SLOT id (`<sourceId>::tool-slot-N`,
   * the SAME id `collectChoiceSlots` mints — `class:<id>`/`<bgId>`/a feat id +
   * `tool-slot-N`); each value is the chosen catalogue tool ids (`smiths-tools`,
   * `lute`, …). This is the SINGLE SOURCE (golden rule 6) for a choice pick: the
   * tool PROFICIENCY (via a synthetic grant source in `resolveAllGrantSources`) AND
   * the `fromToolChoice` pack ITEM (via `ToolChoiceContext.pickedIds`) both derive
   * from THESE ids — never a baked locale string. Mirrors how the per-class picks
   * (weaponMasteries / metamagicChoices / …) persist as ids, but cross-source so it
   * lives at the character root (the slot id already namespaces the source).
   * Optional + empty-default: absent / `{}` means "no tool choice" (existing docs).
   */
  toolChoices?: Record<string, string[]>;
  abilityBudget: number;
  proficiencyBonusOverride: number | null;
  levelUpChecklist: LevelUpChecklistItem[] | null;
  backgroundAsi: Record<string, number>;
  humanOriginFeat: string;
  bgFeat: string;
  /**
   * The INT/WIS/CHA pick for species lineages whose innate-spell casting ability
   * is "choose when you select this species" (2024 Tiefling Fiendish Legacy +
   * Otherworldly Presence; future "choose-one" lineages). Resolved by
   * `resolveSpellAbility` for any spell ref carrying `speciesSpellAbility: true`.
   * Optional + safe default: when absent the resolver falls back to
   * `SPECIES_SPELL_ABILITY_DEFAULT` ("CHA"), so existing/legacy characters and
   * non-Tiefling species are unaffected. Override-first: the creation/level-up
   * wizard PICKER that sets this is a UI-layer follow-up.
   */
  speciesSpellAbility?: AbilityCode;

  lore: CharacterLore;

  abilityScores: Record<AbilityCode, number>;
  savingThrows: AbilityCode[];
  /** Per-ability saving throw bonus overrides (e.g., magic items) */
  savingThrowBonusOverrides?: Partial<Record<AbilityCode, number>>;
  skills: Record<string, "proficient" | "expertise" | "halfProficiency">;
  /** Per-skill bonus overrides (e.g., magic items, circumstantial bonuses) */
  skillBonusOverrides?: Record<string, number>;
  /** Override for passive Perception (null = use computed 10 + Perception bonus) */
  passivePerceptionOverride?: number | null;
  /** Override for passive Insight (null = computed 10 + Insight bonus) — #68 */
  passiveInsightOverride?: number | null;
  /** Override for passive Investigation (null = computed 10 + Investigation bonus) — #68 */
  passiveInvestigationOverride?: number | null;
  /**
   * Per-sense range overrides in FEET (#68 override-everything): keyed by sense
   * kind (darkvision/blindsight/tremorsense/truesight/…). A number replaces the
   * grant-derived range; `0` suppresses the sense; absent = use the computed range.
   */
  senseRangeOverrides?: Record<string, number | null>;
  /**
   * Per-NON-WALKING-speed overrides in FEET (#68), keyed by movement kind
   * (fly / swim / climb). A number replaces the grant-derived speed; `0` suppresses
   * it; absent = use the computed value. (The WALKING speed is the editable `speed`
   * field shown in the combat header — its own override knob.)
   */
  speedOverrides?: Record<string, number | null>;
  /**
   * Set-valued DEFENSE & PROFICIENCY overrides (#68 override-everything). Each maps
   * an id → `true` (force-ADD even if not granted) | `false` (force-REMOVE even if
   * granted by a class/feat/item). The effective set the sheet renders =
   * `(computed ∪ {ids set true}) \ {ids set false}`; an absent / empty map = the
   * pure computed set. Applied through the single `applySetOverride` seam in
   * `derive-sheet-views.ts` so every consumer (rail display + combat damage math)
   * reads the same effective set. Keys: `damage*` = DamageType, `conditionImmunity`
   * = ConditionId, `*Proficiency` = the stable {@link ProficiencyToken} id
   * (`light-armor`, `longswords`) — never an English label; a legacy doc's
   * English key is conformed to its token on read at the codec boundary (golden
   * rule 10). Serializes flat (stripUndefined-safe — no nested undefined).
   */
  damageResistanceOverrides?: Record<string, boolean>;
  damageImmunityOverrides?: Record<string, boolean>;
  damageVulnerabilityOverrides?: Record<string, boolean>;
  conditionImmunityOverrides?: Record<string, boolean>;
  armorProficiencyOverrides?: Record<ProficiencyToken, boolean>;
  weaponProficiencyOverrides?: Record<ProficiencyToken, boolean>;
  /** Override for total hit dice (null = use character level) */
  hitDiceTotalOverride?: number | null;

  spellcasting: SpellcastingConfig | null;
  spellSlots: Array<{ level: number; total: number; pactMagic?: boolean }>;

  /** Spells — SRD references or custom entries */
  spells: Array<SrdSpellRef | CustomSpell>;
  /** Weapons — SRD references or custom entries */
  weapons: Array<SrdWeaponRef | CustomWeapon>;
  /** Equipment — SRD references or custom entries */
  equipment: Array<SrdEquipmentRef | CustomEquipment>;
  /** Features — SRD references or custom entries */
  features: Array<SrdFeatureRef | CustomFeature>;

  /** Combat algorithm decision tree */
  combatAlgorithm: CombatAlgorithmStep[];

  /** Custom conditions the character can have */
  customConditions: string[];
  /** Sidebar layout configuration */
  sidebar: Array<string | { type: "sep" }>;
}

// ============================================================
// Session State (Play Mode Data)
// ============================================================

/**
 * The four defense kinds a play session can grant (PLAY-NO-EDIT). Stable
 * discriminants — they key `SessionState.sessionDefenses`, the store's
 * add/remove actions, and the `defense-removed` toast intent.
 */
export type SessionDefenseKind =
  | "resistance"
  | "immunity"
  | "vulnerability"
  | "conditionImmunity";

export interface SessionState {
  hp: {
    current: number;
    temp: number;
  };
  hitDice: {
    used: number;
  };
  /** Tracker usage state, keyed by tracker ID */
  trackers: Record<string, { used: number }>;
  /** Spell slot usage state, keyed by slot level */
  spellSlots: Record<string, { used: number }>;
  currency: {
    pp: number;
    gp: number;
    ep: number;
    sp: number;
    cp: number;
  };
  /** Concentration as a branded {@link StoredConcentration} (id / `custom:` / ""); a bare
   *  display name can't type-check here (golden rule 7 — leaks impossible at build). */
  concentration: StoredConcentration;
  initiative: string;
  conditions: string[];
  deathSucc: number;
  deathFail: number;
  inspiration: boolean;
  /**
   * D37 — a Bardic Inspiration DIE the character is currently HOLDING, granted by
   * an ally Bard. ANY character can hold one (it's a die added to a d20 Test or a
   * roll, then spent) — distinct from a Bard's own Bardic Inspiration RESOURCE
   * (the give-out tracker). Stores the die size ("d6" | "d8" | "d10" | "d12"); ""
   * / undefined when none held.
   */
  bardicInspirationDie?: string;
  exhaustion: number;
  /**
   * PLAY-NO-EDIT — defenses gained DURING play (a Potion of Fire Resistance,
   * Protection from Energy, a curse's vulnerability, Heroes' Feast's Frightened
   * immunity), layered ADDITIVELY on top of the build's permanent defenses
   * (grants + the #68 `damage*Overrides` maps). Session state exactly like
   * `conditions`: the player adds a chip when the effect starts and removes it
   * when it ends — the build is never touched, so a potion can't permanently
   * rewrite the sheet. Keyed by {@link SessionDefenseKind}; values are stable
   * ids (`DamageType` for the damage kinds, `ConditionId` for
   * `conditionImmunity`). NOT auto-cleared by rests (mirrors conditions — the
   * underlying cause, not the rest, ends the effect). Suppressing a PERMANENT
   * defense remains a build override (edit mode); this overlay is add-only.
   */
  sessionDefenses?: Partial<Record<SessionDefenseKind, string[]>>;
  /** Pinned action IDs for combat page */
  pinnedActions: string[];
  /** Explicitly unpinned action IDs (for default-pinned items like weapons) */
  unpinnedActions?: string[];
  /**
   * L11 — keys of activatable features currently toggled ON (Bladesong,
   * Innate Sorcery, Rage, …). Drives the `while-active` grants in
   * `evaluateGrants`. Optional for back-compat with pre-L11 saved docs.
   */
  activeFeatures?: string[];
  /**
   * FRONTIER-S3 — combat-round countdown for the `while-active` states that
   * declare a `maxRounds` duration (Rage = 100 rounds, a 1-minute buff = 10).
   * Keyed by the state's `activeKey`; `roundsLeft` is armed to the cap when the
   * state lights and the turn/round engine decrements it at each End Turn,
   * AUTO-DROPPING the state (clearing its `activeFeatures` toggle + logging an
   * `effect-expired` event) when it hits 0. Absent / no entry = the state has no
   * round timer (a `maintained` state with no `maxRounds`, a `timed` state with
   * no cap) — it lives until the player ends it. Optional for back-compat.
   */
  effectTimers?: Record<string, { roundsLeft: number }>;
  /**
   * L12 — single-select variant choices, `bundleKey → selected optionId`
   * (Circle of the Land terrain, re-chosen each Long Rest). Drives the
   * `choice-grant-bundle` grants. Optional for back-compat.
   */
  grantBundleChoices?: Record<string, string>;
  /**
   * Current HP of summoned companions (Steel Defender / Eldritch Cannon),
   * keyed by the granting feature id. Max HP + AC are render-derived from the
   * feature's `companion` stat block. Optional / absent = full HP.
   */
  companionHp?: Record<string, { current: number }>;
  /**
   * Override-first hook for manifested weapons (Soulknife Psychic Blades), keyed
   * by the manifested weapon's stable attack-row id. Mirrors a carried weapon's
   * `attackBonusOverride` / `damageOverride`: when set, the resolved attack row
   * uses these values instead of the computed ones. Optional / absent = auto.
   */
  manifestedWeaponOverrides?: Record<
    string,
    { attackBonus?: number | null; damage?: string | null }
  >;
  /**
   * Player configuration for a conjured pact weapon (Warlock Pact of the Blade),
   * keyed by the pact-weapon's stable attack-row id (`pact-weapon-${id}`). The
   * Warlock chooses what weapon they conjure and (each conjure) whether the
   * weapon deals its normal damage type or a chosen elemental type
   * (Necrotic/Psychic/Radiant). All fields optional / absent = engine default
   * (generic conjured blade). Override-first:
   *  - `weaponName` — display name of the conjured weapon ("Greatsword").
   *  - `damageDie` — the weapon's damage die ("2d6"); defaults to the grant's
   *    `defaultDamageDie`.
   *  - `baseDamageType` — the conjured weapon's normal damage type ("slashing");
   *    defaults to the grant's `defaultDamageType`.
   *  - `chosenDamageType` — the elemental type the player switches it to; null /
   *    absent = use the normal (`baseDamageType`) type.
   *  - `attackBonus` / `damage` — full numeric pins (mirror a carried weapon's
   *    overrides) that replace the computed values entirely.
   */
  pactWeaponConfig?: Record<
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
  /**
   * Player's chosen damage type for a multi-type pact-weapon rider
   * (Lifedrinker: Necrotic / Psychic / Radiant), keyed by the rider's invocation
   * id ("lifedrinker"). Override-first; absent / out-of-set values fall back to
   * the rider's first offered type. Fixed-type riders (Eldritch Smite → Force)
   * ignore this map.
   */
  pactWeaponRiderTypes?: Record<string, string | null>;
  /**
   * S7 — the active Polymorph / True Polymorph SELF-transformation, when the
   * caster is polymorphed into a Beast form. Absent (the default) ⇒ not
   * transformed; ADDITIVE-ONLY, so an existing doc that never sets it serializes
   * byte-identically (only a polymorph caster ever writes it). Parallel to
   * `activeFeatures` / `grantBundleChoices`.
   *
   * `beastId` is the assumed {@link BeastStatBlock} id (the Play board resolves its
   * attack rows from the catalogue); `spellId` is the concentration spell that
   * engaged the form (`polymorph` / `true-polymorph`) so a concentration break can
   * auto-retract it. `prior` snapshots the caster's OWN values the applicator
   * overwrote (AC/speed/scores/temp HP), so dropping the form restores them
   * exactly (override-first + undoable).
   */
  polymorphForm?: {
    beastId: string;
    spellId: string;
    prior: {
      acOverride: number | null;
      speedOverride: number | null;
      speedOverrides: Record<string, number | null>;
      abilityScores: Record<AbilityCode, number>;
      tempHp: number;
    };
  };
  notes: string;
  logEntries: LogEntry[];
}

/**
 * One action-/combat-log entry — the events-as-data shape (mirrors toasts-as-data).
 *
 * The entry stores a STRUCTURED {@link CombatEvent} (ids/tokens + numbers, NEVER a
 * pre-localized line) plus a timestamp and a stable id. The presenter
 * (`lib/views/combat-log-view.ts`) localizes the event to its display line + glyph
 * + hue at render, so the same stored log renders fully in the active language and
 * a language switch re-localizes the whole feed (the mixed-language bug's root-
 * cause fix). A legacy pre-events entry round-trips as a `legacy` event (its frozen
 * text rendered verbatim) — the bounded read-normalization boundary, golden rule 10.
 */
export interface LogEntry {
  /** The structured, locale-independent event this row records. */
  event: CombatEvent;
  /** Unix-ms timestamp the event was logged. */
  ts: number;
  /**
   * Stable unique handle for this entry — lets an undo remove EXACTLY the line it
   * appended (`removeLogEntry(id)`) instead of snapshot-restoring the whole array
   * (which used to clobber other slots' concurrently-committed entries).
   */
  id: string;
}

// ============================================================
// Type Guards
// ============================================================

export function isCustomSpell(spell: SrdSpellRef | CustomSpell): spell is CustomSpell {
  return "custom" in spell;
}

export function isCustomEquipment(
  equipment: SrdEquipmentRef | CustomEquipment
): equipment is CustomEquipment {
  return "custom" in equipment;
}
