/**
 * The stat blocks SRD 5.2.1 summon spells print, as `SrdSpellData.companion`.
 * Values are at the spell's own level (`spellLevel.base`); the resolver adds the
 * per-level increments when the session knows a higher cast level. Names, kinds
 * and riders live in the spell catalogue under `<spellId>.companion…`.
 */
import type { CompanionStatBlock } from "../types";

// Find Steed (level 2) — Otherworldly Steed: AC 10 + 1 per spell level, HP 5 + 10
// per spell level, Speed 60 ft. (Fly 60 ft. from level 4, noted in the rider).
// The creature type (Celestial / Fey / Fiend) picks the Slam's damage type.
const otherworldlySteed = (
  variantId: "celestial" | "fey" | "fiend",
  damageType: "radiant" | "psychic" | "necrotic"
): CompanionStatBlock => ({
  variantId,
  ac: { base: 12 },
  hp: { base: 25, perLevel: 0 },
  spellLevel: { base: 2, acPer: 1, hpPer: 10 },
  speeds: { walk: 60 },
  abilityScores: { STR: 18, DEX: 12, CON: 14, INT: 6, WIS: 12, CHA: 8 },
  attacks: [
    {
      id: "otherworldly-slam",
      attackBonus: "spell-attack",
      dice: "1d8 + 2",
      damagePerSpellLevel: 1,
      damageType,
      reachFt: 5,
    },
  ],
});

export const OTHERWORLDLY_STEED = otherworldlySteed("celestial", "radiant");
OTHERWORLDLY_STEED.variants = [
  OTHERWORLDLY_STEED,
  otherworldlySteed("fey", "psychic"),
  otherworldlySteed("fiend", "necrotic"),
];

// Phantom Steed (level 3) — the Riding Horse stat block with a Speed of 100 ft.
// Its Hooves (+5, printed) is left out: the shape derives to-hit from the owner,
// and the spell ends as soon as the steed takes damage — it is a mount.
export const PHANTOM_STEED: CompanionStatBlock = {
  ac: { base: 11 },
  hp: { base: 13, perLevel: 0 },
  speeds: { walk: 100 },
  abilityScores: { STR: 16, DEX: 13, CON: 12, INT: 2, WIS: 11, CHA: 7 },
};

// Giant Insect (level 4) — AC 11 + the spell's level, HP 30 + 10 per level above
// 4, Speed 40 ft., Climb 40 ft. (Fly 40 ft. for the wasp). Poison Jab for every
// form, Web Bolt for the spider only.
const POISON_JAB = {
  id: "poison-jab",
  attackBonus: "spell-attack",
  dice: "1d6 + 7",
  damagePerSpellLevel: 1,
  damageType: "piercing",
  reachFt: 10,
} as const;

const giantInsect = (
  variantId: "centipede" | "spider" | "wasp",
  extra: Partial<CompanionStatBlock> = {}
): CompanionStatBlock => ({
  variantId,
  ac: { base: 15 },
  hp: { base: 30, perLevel: 0 },
  spellLevel: { base: 4, acPer: 1, hpPer: 10 },
  speeds: { walk: 40, climb: 40 },
  abilityScores: { STR: 17, DEX: 13, CON: 15, INT: 4, WIS: 14, CHA: 3 },
  senses: { darkvisionFt: 60 },
  attacks: [POISON_JAB],
  ...extra,
});

export const GIANT_INSECT = giantInsect("centipede");
GIANT_INSECT.variants = [
  GIANT_INSECT,
  giantInsect("spider", {
    attacks: [
      POISON_JAB,
      {
        id: "web-bolt",
        attackBonus: "spell-attack",
        dice: "1d10 + 7",
        damagePerSpellLevel: 1,
        damageType: "bludgeoning",
        reachFt: 60,
        ranged: true,
      },
    ],
  }),
  giantInsect("wasp", { speeds: { walk: 40, climb: 40, fly: 40 } }),
];

// Summon Dragon (level 5) — Draconic Spirit: AC 14 + the spell's level, HP 50 +
// 10 per level above 5, Rend 1d6 + 4 + the spell's level.
export const DRACONIC_SPIRIT: CompanionStatBlock = {
  ac: { base: 19 },
  hp: { base: 50, perLevel: 0 },
  spellLevel: { base: 5, acPer: 1, hpPer: 10 },
  speeds: { walk: 30, fly: 60, swim: 30 },
  abilityScores: { STR: 19, DEX: 14, CON: 17, INT: 10, WIS: 14, CHA: 14 },
  conditionImmunities: ["charmed", "frightened", "poisoned"],
  senses: { blindsightFt: 30, darkvisionFt: 60 },
  attacks: [
    {
      id: "rend",
      attackBonus: "spell-attack",
      dice: "1d6 + 9",
      damagePerSpellLevel: 1,
      damageType: "piercing",
      reachFt: 10,
    },
  ],
};

// Arcane Hand (level 5) — an object with AC 20 and Hit Points equal to the
// caster's Hit Point maximum. Its Clenched Fist / Forceful / Grasping /
// Interposing effects are the spell's own (the spell row), not the hand's.
export const ARCANE_HAND: CompanionStatBlock = {
  ac: { base: 20 },
  hp: { base: 0, perLevel: 0, ownerMax: true },
};
