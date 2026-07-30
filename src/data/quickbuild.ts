/**
 * Quickbuild presets — one ready-made level-1 build per class.
 *
 * The quickbuild path (`features/creation`) asks the player for ONE decision —
 * the class — and fills every other creation choice from the preset here, so a
 * first-timer reaches a playable, RAW-legal character in a handful of taps.
 * Everything stays editable afterwards: a preset is a starting position, never
 * a lock.
 *
 * What a preset declares, and why each field exists:
 *   - `abilityOrder` — the class's conventional ability priority. The scores ARE
 *     the 2024 standard array [15, 14, 13, 12, 10, 8] handed out in this order;
 *     that array costs EXACTLY the 27-point point-buy budget, so the preset
 *     rides the wizard's existing point-buy state with no third mechanism
 *     (pinned by `quickbuild-presets.guard.test.ts`).
 *   - `boost` — the 2024 background ability increase (+2 to the first, +1 to the
 *     second); both MUST be among the background's three eligible abilities (D5).
 *   - `classSkills` / `cantrips` / `spells` — legal picks filling the class's own
 *     counts, chosen as the class's staples.
 *   - `choices` — the grant-driven `choice-*` slots (a gaming set, a bard's
 *     instruments, Magic Initiate's spells, Skilled's three proficiencies, the
 *     rogue's Thieves'-Cant language). Ids are consumed IN SLOT ORDER, per kind
 *     (`lib/quickbuild.ts`), so a preset never hand-writes a namespaced slot id.
 *   - `languages` — the two 2024 origin languages, chosen to fit the species.
 *   - `lineage` / `humanFeat` — the species' creation-time decisions, when its
 *     species has any.
 *
 * The picks are conventional quick-build guidance for the 2024 classes (the
 * class pages on `dnd2024.wikidot.com` — the same "primary ability first,
 * Constitution second" shape the class descriptions recommend), expressed as
 * ids only: no prose, no display strings (golden rule 7).
 *
 * The pack adds its own classes' presets through `packQuickbuildPresets`
 * (docs/ARCHITECTURE.md → "The content-pack seam"); EVERY composed class must
 * have one — the guard fails if a class is left without.
 */
import { overlayPackRecord } from "@/lib/pack-merge";
import type { AbilityCode } from "@/data/types";
import type { FeatureChoiceSlots } from "@/lib/feature-choices";
import { packQuickbuildPresets } from "@pack";

/** One class's ready-made level-1 build — keyed by the class it builds. */
export interface QuickbuildPreset {
  raceId: string;
  backgroundId: string;
  /** Standard-array priority: 15, 14, 13, 12, 10, 8 in this order — a
   *  permutation of all six codes (pinned by the preset guard). */
  abilityOrder: readonly AbilityCode[];
  /** The background ability increase: +2 to the first, +1 to the second (D5). */
  boost: readonly [AbilityCode, AbilityCode];
  /** Class skill proficiencies — from the class pool, never a background skill. */
  classSkills: readonly string[];
  /** The two 2024 origin languages (Common is granted separately). */
  languages: readonly [string, string];
  /** Class cantrip picks (omit for a non-caster). */
  cantrips?: readonly string[];
  /** Class leveled-spell picks (omit when the class prepares none at level 1). */
  spells?: readonly string[];
  /** Creation-time species lineage picks: bundleKey → optionId. */
  lineage?: Readonly<Record<string, string>>;
  /** The Human "Versatile" origin feat (Human only). */
  humanFeat?: string;
  /** Picks for the grant-driven choice slots, per kind, in slot order. */
  choices?: Partial<Record<keyof FeatureChoiceSlots, readonly string[]>>;
}

/** The class the creation page opens on (the wizard's default). */
export const DEFAULT_QUICKBUILD_CLASS = "fighter";

const SRD_QUICKBUILD_PRESETS = {
  barbarian: {
    raceId: "goliath",
    backgroundId: "soldier",
    abilityOrder: ["STR", "CON", "DEX", "WIS", "CHA", "INT"],
    boost: ["STR", "CON"],
    classSkills: ["perception", "survival"],
    languages: ["giant", "orc"],
    choices: { tool: ["dice-set"] },
  },
  bard: {
    raceId: "halfling",
    backgroundId: "acolyte",
    abilityOrder: ["CHA", "DEX", "CON", "WIS", "INT", "STR"],
    boost: ["CHA", "WIS"],
    classSkills: ["persuasion", "deception", "performance"],
    languages: ["halfling", "elvish"],
    cantrips: ["dancing-lights", "vicious-mockery"],
    spells: ["charm-person", "color-spray", "dissonant-whispers", "healing-word"],
    // The Bard's three instruments, then Magic Initiate (Cleric) from the
    // Acolyte: two cantrips and one level-1 spell, all distinct from the class
    // picks above.
    choices: {
      tool: ["lute", "flute", "drum"],
      spell: ["guidance", "sacred-flame", "bless"],
    },
  },
  cleric: {
    raceId: "dwarf",
    backgroundId: "acolyte",
    abilityOrder: ["WIS", "CON", "STR", "CHA", "DEX", "INT"],
    boost: ["WIS", "CHA"],
    classSkills: ["medicine", "persuasion"],
    languages: ["dwarvish", "giant"],
    cantrips: ["guidance", "sacred-flame", "thaumaturgy"],
    spells: ["bless", "cure-wounds", "guiding-bolt", "shield-of-faith"],
    choices: { spell: ["light", "spare-the-dying", "healing-word"] },
  },
  druid: {
    raceId: "gnome",
    backgroundId: "sage",
    abilityOrder: ["WIS", "CON", "DEX", "INT", "CHA", "STR"],
    boost: ["WIS", "CON"],
    classSkills: ["perception", "nature"],
    languages: ["gnomish", "elvish"],
    lineage: { "gnome-lineage": "forest-gnome" },
    cantrips: ["druidcraft", "produce-flame"],
    spells: ["animal-friendship", "cure-wounds", "faerie-fire", "thunderwave"],
    // Magic Initiate (Wizard), from the Sage.
    choices: { spell: ["light", "mage-hand", "detect-magic"] },
  },
  fighter: {
    raceId: "human",
    backgroundId: "soldier",
    abilityOrder: ["STR", "CON", "DEX", "WIS", "CHA", "INT"],
    boost: ["STR", "CON"],
    classSkills: ["perception", "survival"],
    languages: ["dwarvish", "orc"],
    // Human Versatile — Alert, the follow-up-free origin feat (the Soldier
    // already grants Savage Attacker; origin feats never repeat).
    humanFeat: "alert",
    choices: { tool: ["dice-set"] },
  },
  monk: {
    raceId: "elf",
    backgroundId: "criminal",
    abilityOrder: ["DEX", "WIS", "CON", "STR", "INT", "CHA"],
    boost: ["DEX", "CON"],
    classSkills: ["acrobatics", "athletics"],
    languages: ["elvish", "draconic"],
    lineage: { "elf-lineage": "wood-elf" },
    choices: { tool: ["calligraphers-supplies"] },
  },
  paladin: {
    raceId: "dragonborn",
    backgroundId: "acolyte",
    abilityOrder: ["STR", "CHA", "CON", "WIS", "DEX", "INT"],
    boost: ["CHA", "WIS"],
    classSkills: ["athletics", "persuasion"],
    languages: ["draconic", "dwarvish"],
    spells: ["heroism", "searing-smite"],
    // Magic Initiate (Cleric), from the Acolyte — Guidance and Sacred Flame are
    // the two cantrips the Paladin's own Blessed Warrior option recommends.
    choices: { spell: ["guidance", "sacred-flame", "bless"] },
  },
  ranger: {
    raceId: "elf",
    backgroundId: "soldier",
    abilityOrder: ["DEX", "WIS", "CON", "STR", "INT", "CHA"],
    boost: ["DEX", "CON"],
    classSkills: ["perception", "survival", "nature"],
    languages: ["elvish", "goblin"],
    lineage: { "elf-lineage": "wood-elf" },
    spells: ["cure-wounds", "ensnaring-strike"],
    choices: { tool: ["dice-set"] },
  },
  rogue: {
    raceId: "halfling",
    backgroundId: "criminal",
    abilityOrder: ["DEX", "CON", "WIS", "INT", "CHA", "STR"],
    boost: ["DEX", "CON"],
    classSkills: ["perception", "investigation", "deception", "acrobatics"],
    languages: ["halfling", "elvish"],
    // Thieves' Cant's extra language.
    choices: { language: ["goblin"] },
  },
  sorcerer: {
    raceId: "tiefling",
    backgroundId: "acolyte",
    abilityOrder: ["CHA", "CON", "DEX", "WIS", "INT", "STR"],
    boost: ["CHA", "WIS"],
    classSkills: ["arcana", "persuasion"],
    languages: ["draconic", "goblin"],
    cantrips: ["light", "prestidigitation", "shocking-grasp", "sorcerous-burst"],
    spells: ["burning-hands", "detect-magic"],
    // Magic Initiate (Cleric), from the Acolyte.
    choices: { spell: ["guidance", "spare-the-dying", "bless"] },
  },
  warlock: {
    raceId: "tiefling",
    backgroundId: "acolyte",
    abilityOrder: ["CHA", "CON", "DEX", "WIS", "INT", "STR"],
    boost: ["CHA", "WIS"],
    classSkills: ["arcana", "investigation"],
    languages: ["draconic", "elvish"],
    cantrips: ["eldritch-blast", "prestidigitation"],
    spells: ["charm-person", "hex"],
    // Magic Initiate (Cleric), from the Acolyte.
    choices: { spell: ["guidance", "spare-the-dying", "bless"] },
  },
  wizard: {
    raceId: "elf",
    backgroundId: "sage",
    abilityOrder: ["INT", "CON", "DEX", "WIS", "CHA", "STR"],
    boost: ["INT", "CON"],
    classSkills: ["investigation", "insight"],
    languages: ["elvish", "draconic"],
    lineage: { "elf-lineage": "high-elf" },
    cantrips: ["light", "mage-hand", "ray-of-frost"],
    // The PHB recommends SIX spellbook spells (Detect Magic, Feather Fall, Mage
    // Armor, Magic Missile, Sleep, Thunderwave); level 1 prepares four of them,
    // and Detect Magic + Feather Fall come free through the Sage's Magic
    // Initiate below.
    spells: ["mage-armor", "magic-missile", "sleep", "thunderwave"],
    // Magic Initiate (Wizard), from the Sage.
    choices: { spell: ["minor-illusion", "prestidigitation", "detect-magic"] },
  },
} satisfies Record<string, QuickbuildPreset>;

/**
 * Every composed class's quickbuild preset, keyed by class id.
 *
 * The pack may REPLACE a public preset, not just add its own classes
 * (`overlayPackRecord`): the public set is the SRD-legal projection — it can
 * only reach for the SRD's four backgrounds, so several classes fall back on
 * the Acolyte — while the composed build hands the player the background the
 * class is actually known by (golden rule D11: the split is licensing, never
 * scope).
 */
export const QUICKBUILD_PRESETS: Readonly<Record<string, QuickbuildPreset>> =
  overlayPackRecord<QuickbuildPreset>(SRD_QUICKBUILD_PRESETS, packQuickbuildPresets);

/**
 * The build the creation page OPENS with, so Quick Start is never a blank form.
 * Read straight off the public record (whose `satisfies` keeps the key total),
 * and pinned by the preset guard to BE the composed entry — so a future pack
 * override of the Fighter fails loudly there instead of being silently ignored
 * here.
 */
export const DEFAULT_QUICKBUILD_PRESET: QuickbuildPreset =
  SRD_QUICKBUILD_PRESETS[DEFAULT_QUICKBUILD_CLASS];
