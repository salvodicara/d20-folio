/**
 * The level-up dry run's expectations, copied from the SRD 5.2.1 class tables and
 * class / subclass feature text — never from src/data. Levels 1–20 for the table
 * columns; the feature names cover levels 1–12 (the dry run checks a live level + 2).
 *
 * Shared with the pack's dry-run tests (`@tests/unit/level-up-dry-run/_srd`): a pack
 * subclass sits on an SRD class, so the class columns hold for it too.
 */

/** "Proficiency Bonus" column, the same for every class (by character level). */
export const SRD_PB = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6];

/** The Spell Slots per Spell Level of a full caster (and the Multiclass Spellcaster table). */
const FULL_SLOTS: number[][] = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];
/** Paladin and Ranger "Spell Slots per Spell Level". */
const HALF_SLOTS: number[][] = [
  [2],
  [2],
  [3],
  [3],
  [4, 2],
  [4, 2],
  [4, 3],
  [4, 3],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2],
];
/** Warlock "Spell Slots" and "Slot Level". */
const PACT_COUNT = [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4];
const PACT_LEVEL = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];

const FULL_PREPARED = [
  4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22,
];
const HALF_PREPARED = [
  2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15,
];

export type Caster = "full" | "half" | "pact" | null;

export interface SrdClass {
  hitDie: number;
  caster: Caster;
  /** "Cantrips" column (absent: the class has none). */
  cantrips?: number[];
  /** "Prepared Spells" column. */
  prepared?: number[];
  /** "Level 4: Ability Score Improvement … again at levels …". */
  asi: number[];
  /** "Level 3: <Class> Subclass". */
  subclassLevel: number;
  /** The levels whose Expertise feature has the player pick two skills. */
  expertise: number[];
  /** "Weapon Mastery" column (absent: the class has none). */
  weaponMastery?: number[];
  /** The levels the player picks a Fighting Style (base class). */
  fightingStyle: number[];
  /** "Eldritch Invocations" column. */
  invocations?: number[];
  /** Metamagic options known. */
  metamagic?: number[];
  /** Class feature names by class level ("Class Features" column). */
  features: Record<number, string[]>;
}

const UPTO = (n: number, v: number) =>
  Array.from({ length: 20 }, (_, i) => (i + 1 >= n ? v : 0));
const steps = (...pairs: [number, number][]) =>
  Array.from({ length: 20 }, (_, i) =>
    pairs.reduce((v, [lvl, n]) => (i + 1 >= lvl ? n : v), 0)
  );

export const SRD_CLASSES: Record<string, SrdClass> = {
  barbarian: {
    hitDie: 12,
    caster: null,
    asi: [4, 8, 12, 16],
    subclassLevel: 3,
    expertise: [],
    weaponMastery: steps([1, 2], [4, 3], [10, 4]),
    fightingStyle: [],
    features: {
      1: ["Rage", "Unarmored Defense", "Weapon Mastery"],
      2: ["Danger Sense", "Reckless Attack"],
      3: ["Primal Knowledge"],
      5: ["Extra Attack", "Fast Movement"],
      7: ["Feral Instinct", "Instinctive Pounce"],
      9: ["Brutal Strike"],
      11: ["Relentless Rage"],
    },
  },
  bard: {
    hitDie: 8,
    caster: "full",
    cantrips: steps([1, 2], [4, 3], [10, 4]),
    prepared: FULL_PREPARED,
    asi: [4, 8, 12, 16],
    subclassLevel: 3,
    expertise: [2, 9],
    fightingStyle: [],
    features: {
      1: ["Bardic Inspiration", "Spellcasting"],
      2: ["Expertise", "Jack of All Trades"],
      5: ["Font of Inspiration"],
      7: ["Countercharm"],
      10: ["Magical Secrets"],
    },
  },
  cleric: {
    hitDie: 8,
    caster: "full",
    cantrips: steps([1, 3], [4, 4], [10, 5]),
    prepared: FULL_PREPARED,
    asi: [4, 8, 12, 16],
    subclassLevel: 3,
    expertise: [],
    fightingStyle: [],
    features: {
      1: ["Spellcasting", "Divine Order"],
      2: ["Channel Divinity"],
      5: ["Sear Undead"],
      7: ["Blessed Strikes"],
      10: ["Divine Intervention"],
    },
  },
  druid: {
    hitDie: 8,
    caster: "full",
    cantrips: steps([1, 2], [4, 3], [10, 4]),
    prepared: FULL_PREPARED,
    asi: [4, 8, 12, 16],
    subclassLevel: 3,
    expertise: [],
    fightingStyle: [],
    features: {
      1: ["Spellcasting", "Druidic", "Primal Order"],
      2: ["Wild Shape", "Wild Companion"],
      5: ["Wild Resurgence"],
      7: ["Elemental Fury"],
    },
  },
  fighter: {
    hitDie: 10,
    caster: null,
    asi: [4, 6, 8, 12, 14, 16],
    subclassLevel: 3,
    expertise: [],
    weaponMastery: steps([1, 3], [4, 4], [10, 5], [16, 6]),
    fightingStyle: [1],
    features: {
      1: ["Fighting Style", "Second Wind", "Weapon Mastery"],
      2: ["Action Surge", "Tactical Mind"],
      5: ["Extra Attack", "Tactical Shift"],
      9: ["Indomitable", "Tactical Master"],
      11: ["Two Extra Attacks"],
    },
  },
  monk: {
    hitDie: 8,
    caster: null,
    asi: [4, 8, 12, 16],
    subclassLevel: 3,
    expertise: [],
    fightingStyle: [],
    features: {
      1: ["Martial Arts", "Unarmored Defense"],
      2: ["Monk's Focus", "Unarmored Movement", "Uncanny Metabolism"],
      3: ["Deflect Attacks"],
      4: ["Slow Fall"],
      5: ["Extra Attack", "Stunning Strike"],
      6: ["Empowered Strikes"],
      7: ["Evasion"],
      9: ["Acrobatic Movement"],
      10: ["Heightened Focus", "Self-Restoration"],
    },
  },
  paladin: {
    hitDie: 10,
    caster: "half",
    prepared: HALF_PREPARED,
    asi: [4, 8, 12, 16],
    subclassLevel: 3,
    expertise: [],
    weaponMastery: UPTO(1, 2),
    fightingStyle: [2],
    features: {
      1: ["Lay On Hands", "Spellcasting", "Weapon Mastery"],
      2: ["Fighting Style", "Paladin's Smite"],
      3: ["Channel Divinity"],
      5: ["Extra Attack", "Faithful Steed"],
      6: ["Aura of Protection"],
      9: ["Abjure Foes"],
      10: ["Aura of Courage"],
      11: ["Radiant Strikes"],
    },
  },
  ranger: {
    hitDie: 10,
    caster: "half",
    prepared: HALF_PREPARED,
    asi: [4, 8, 12, 16],
    subclassLevel: 3,
    expertise: [9],
    weaponMastery: UPTO(1, 2),
    fightingStyle: [2],
    features: {
      1: ["Spellcasting", "Favored Enemy", "Weapon Mastery"],
      2: ["Deft Explorer", "Fighting Style"],
      5: ["Extra Attack"],
      6: ["Roving"],
      9: ["Expertise"],
      10: ["Tireless"],
    },
  },
  rogue: {
    hitDie: 8,
    caster: null,
    asi: [4, 8, 10, 12, 16],
    subclassLevel: 3,
    expertise: [1, 6],
    weaponMastery: UPTO(1, 2),
    fightingStyle: [],
    features: {
      1: ["Expertise", "Sneak Attack", "Thieves' Cant", "Weapon Mastery"],
      2: ["Cunning Action"],
      3: ["Steady Aim"],
      5: ["Cunning Strike", "Uncanny Dodge"],
      6: ["Expertise"],
      7: ["Evasion", "Reliable Talent"],
      11: ["Improved Cunning Strike"],
    },
  },
  sorcerer: {
    hitDie: 6,
    caster: "full",
    cantrips: steps([1, 4], [4, 5], [10, 6]),
    prepared: [2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22],
    asi: [4, 8, 12, 16],
    subclassLevel: 3,
    expertise: [],
    fightingStyle: [],
    metamagic: steps([2, 2], [10, 4], [17, 6]),
    features: {
      1: ["Spellcasting", "Innate Sorcery"],
      2: ["Font of Magic", "Metamagic"],
      5: ["Sorcerous Restoration"],
      7: ["Sorcery Incarnate"],
    },
  },
  warlock: {
    hitDie: 8,
    caster: "pact",
    cantrips: steps([1, 2], [4, 3], [10, 4]),
    prepared: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
    asi: [4, 8, 12, 16],
    subclassLevel: 3,
    expertise: [],
    fightingStyle: [],
    invocations: [1, 3, 3, 3, 5, 5, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10],
    features: {
      1: ["Eldritch Invocations", "Pact Magic"],
      2: ["Magical Cunning"],
      9: ["Contact Patron"],
      11: ["Mystic Arcanum"],
    },
  },
  wizard: {
    hitDie: 6,
    caster: "full",
    cantrips: steps([1, 3], [4, 4], [10, 5]),
    prepared: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25],
    asi: [4, 8, 12, 16],
    subclassLevel: 3,
    expertise: [],
    fightingStyle: [],
    features: {
      1: ["Spellcasting", "Ritual Adept", "Arcane Recovery"],
      2: ["Scholar"],
      5: ["Memorize Spell"],
    },
  },
};

/** SRD subclass feature names by class level (each class's one SRD subclass). */
export const SRD_SUBCLASS_FEATURES: Record<string, Record<number, string[]>> = {
  berserker: { 3: ["Frenzy"], 6: ["Mindless Rage"], 10: ["Retaliation"] },
  "college-of-lore": {
    3: ["Bonus Proficiencies", "Cutting Words"],
    6: ["Magical Discoveries"],
  },
  "life-domain": {
    3: ["Disciple of Life", "Preserve Life"],
    6: ["Blessed Healer"],
  },
  "circle-of-the-land": {
    3: ["Circle of the Land Spells", "Land's Aid"],
    6: ["Natural Recovery"],
    10: ["Nature's Ward"],
  },
  champion: {
    3: ["Improved Critical", "Remarkable Athlete"],
    7: ["Additional Fighting Style"],
    10: ["Heroic Warrior"],
  },
  "open-hand": {
    3: ["Open Hand Technique"],
    6: ["Wholeness of Body"],
    11: ["Fleet Step"],
  },
  "oath-of-devotion": { 3: ["Sacred Weapon"], 7: ["Aura of Devotion"] },
  hunter: {
    3: ["Hunter's Lore", "Hunter's Prey"],
    7: ["Defensive Tactics"],
    11: ["Superior Hunter's Prey"],
  },
  thief: { 3: ["Fast Hands", "Second-Story Work"], 9: ["Supreme Sneak"] },
  "draconic-sorcery": { 3: ["Draconic Resilience"], 6: ["Elemental Affinity"] },
  "fiend-patron": {
    3: ["Dark One's Blessing"],
    6: ["Dark One's Own Luck"],
    10: ["Fiendish Resilience"],
  },
  evoker: {
    3: ["Evocation Savant", "Potent Cantrip"],
    6: ["Sculpt Spells"],
    10: ["Empowered Evocation"],
  },
};

/** Subclass levels that grant a Fighting Style ("Level 7: Additional Fighting Style"). */
export const SRD_SUBCLASS_FIGHTING_STYLE: Record<string, number[]> = {
  champion: [7],
};

/** The SRD subclass of each class, for the broad matrix. */
export const SRD_SUBCLASS: Record<string, string> = {
  barbarian: "berserker",
  bard: "college-of-lore",
  cleric: "life-domain",
  druid: "circle-of-the-land",
  fighter: "champion",
  monk: "open-hand",
  paladin: "oath-of-devotion",
  ranger: "hunter",
  rogue: "thief",
  sorcerer: "draconic-sorcery",
  warlock: "fiend-patron",
  wizard: "evoker",
};

/** Extra Hit Points per class level a subclass gives (Draconic Resilience: +1). */
export const SRD_SUBCLASS_HP_PER_LEVEL: Record<string, number> = {
  "draconic-sorcery": 1,
};

const at = (col: number[] | undefined, level: number) => col?.[level - 1] ?? 0;
export const srdAt = at;

/**
 * The non-pact spell slots of a build: one class reads its own table; several use
 * the Multiclass Spellcaster table (full levels + half levels ÷ 2 rounded up).
 */
export function srdSlots(
  classes: ReadonlyArray<{ classId: string; level: number }>
): number[] {
  const casters = classes.flatMap((e) => {
    const caster = SRD_CLASSES[e.classId]?.caster;
    return caster === "full" || caster === "half" ? [{ ...e, caster }] : [];
  });
  const [only] = casters;
  if (!only) return [];
  if (casters.length === 1 && classes.length === 1) {
    const table = only.caster === "full" ? FULL_SLOTS : HALF_SLOTS;
    return table[only.level - 1] ?? [];
  }
  const casterLevel = casters.reduce(
    (sum, e) => sum + (e.caster === "full" ? e.level : Math.ceil(e.level / 2)),
    0
  );
  return FULL_SLOTS[casterLevel - 1] ?? [];
}

/** The Warlock's Pact Magic slots: { count, level }, or null. */
export function srdPact(classes: ReadonlyArray<{ classId: string; level: number }>) {
  const w = classes.find((e) => SRD_CLASSES[e.classId]?.caster === "pact");
  return w ? { count: at(PACT_COUNT, w.level), level: at(PACT_LEVEL, w.level) } : null;
}
