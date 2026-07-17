/**
 * The Beast stat-block catalogue — Polymorph / True Polymorph forms.
 *
 * The FULL CR 0–8 Beast catalogue (91 forms): Phase 1's curated starter set of
 * 18 iconic combat forms (CR 1/4 → 8) plus Phase 2's fill of 73 more forms
 * spanning CR 0–6, against the SAME {@link BeastStatBlock} shape (a pure-data add).
 *
 * IDs + numbers ONLY (the §7 no-SRD-strings-in-data guard): every localized name
 * (the Beast, each attack, each trait) lives in `src/i18n/{en,it}/srd/beasts.json`
 * keyed by the id here (`giant-ape`, `attack.fist`, `trait.pack-tactics`).
 *
 * Attacks are SELF-CONTAINED: `toHit` + `damageDice` are the exact values AS
 * PRINTED (the ability modifier is already folded into the dice string) — a
 * Beast form REPLACES your statistics, so the render edge shows them verbatim,
 * never re-scaled by the caster's own scores. A handful of CR-0 beasts print a
 * FLAT damage value with no die (Badger/Bat/Rat/…: "Hit: 1 Piercing damage") —
 * `damageDice` carries the bare integer as a string in that case.
 *
 * SOURCE: the 5e SRD 5.1 / SRD 5.2.1 (2024) beast stat blocks (the 2024
 * numbers for these iconic beasts are the well-established SRD values). Each block
 * cites its source in a comment; verified via the D2 cascade (WebSearch over the
 * SRD aggregators — the wikidot per-creature pages are JS-rendered). Phase 2's 73
 * forms were verified against the CC-BY SRD 5.2.1 PDF text + cross-checked against
 * aidedd.org/5etools' 2024 XMM bestiary data.
 */
import type { BeastStatBlock } from "@/data/types";

export const BEASTS: ReadonlyArray<BeastStatBlock> = [
  // ── CR 0 ────────────────────────────────────────────────────
  // Baboon (2024 SRD 5.2.1). AC 12, HP 3, CR 0.
  {
    id: "baboon",
    cr: 0,
    size: "Small",
    ac: 12,
    hp: 3,
    speeds: { walk: 30, climb: 30 },
    abilityScores: { STR: 8, DEX: 14, CON: 11, INT: 4, WIS: 12, CHA: 6 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 1,
        damageDice: "1d4-1",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    traits: ["trait.pack-tactics"],
  },
  // Badger (2024 SRD 5.2.1). AC 11, HP 5, CR 0.
  {
    id: "badger",
    cr: 0,
    size: "Tiny",
    ac: 11,
    hp: 5,
    speeds: { walk: 20, burrow: 5 },
    abilityScores: { STR: 10, DEX: 11, CON: 16, INT: 2, WIS: 12, CHA: 5 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 2,
        damageDice: "1",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 30 },
  },
  // Bat (2024 SRD 5.2.1). AC 12, HP 1, CR 0.
  {
    id: "bat",
    cr: 0,
    size: "Tiny",
    ac: 12,
    hp: 1,
    speeds: { walk: 5, fly: 30 },
    abilityScores: { STR: 2, DEX: 15, CON: 8, INT: 2, WIS: 12, CHA: 4 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 4,
        damageDice: "1",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { blindsightFt: 60 },
  },
  // Cat (2024 SRD 5.2.1). AC 12, HP 2, CR 0.
  {
    id: "cat",
    cr: 0,
    size: "Tiny",
    ac: 12,
    hp: 2,
    speeds: { walk: 40, climb: 40 },
    abilityScores: { STR: 3, DEX: 15, CON: 10, INT: 3, WIS: 12, CHA: 7 },
    attacks: [
      {
        nameKey: "attack.scratch",
        toHit: 4,
        damageDice: "1",
        damageType: "slashing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 60 },
    traits: ["trait.jumper"],
  },
  // Crab (2024 SRD 5.2.1). AC 11, HP 3, CR 0.
  {
    id: "crab",
    cr: 0,
    size: "Tiny",
    ac: 11,
    hp: 3,
    speeds: { walk: 20, swim: 20 },
    abilityScores: { STR: 6, DEX: 11, CON: 12, INT: 1, WIS: 8, CHA: 2 },
    attacks: [
      {
        nameKey: "attack.claw",
        toHit: 2,
        damageDice: "1",
        damageType: "bludgeoning",
        reachFt: 5,
      },
    ],
    senses: { blindsightFt: 30 },
    traits: ["trait.amphibious"],
  },
  // Deer (2024 SRD 5.2.1). AC 13, HP 4, CR 0.
  {
    id: "deer",
    cr: 0,
    size: "Medium",
    ac: 13,
    hp: 4,
    speeds: { walk: 50 },
    abilityScores: { STR: 11, DEX: 16, CON: 11, INT: 2, WIS: 14, CHA: 5 },
    attacks: [
      {
        nameKey: "attack.ram",
        toHit: 2,
        damageDice: "1d4",
        damageType: "bludgeoning",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 60 },
    traits: ["trait.agile"],
  },
  // Eagle (2024 SRD 5.2.1). AC 12, HP 4, CR 0.
  {
    id: "eagle",
    cr: 0,
    size: "Small",
    ac: 12,
    hp: 4,
    speeds: { walk: 10, fly: 60 },
    abilityScores: { STR: 6, DEX: 15, CON: 12, INT: 2, WIS: 14, CHA: 7 },
    attacks: [
      {
        nameKey: "attack.talons",
        toHit: 4,
        damageDice: "1d4+2",
        damageType: "slashing",
        reachFt: 5,
      },
    ],
  },
  // Frog (2024 SRD 5.2.1). AC 11, HP 1, CR 0.
  {
    id: "frog",
    cr: 0,
    size: "Tiny",
    ac: 11,
    hp: 1,
    speeds: { walk: 20, swim: 20 },
    abilityScores: { STR: 1, DEX: 13, CON: 8, INT: 1, WIS: 8, CHA: 3 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 3,
        damageDice: "1",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 30 },
    traits: ["trait.amphibious", "trait.standing-leap"],
  },
  // Giant Fire Beetle (2024 SRD 5.2.1). AC 13, HP 4, CR 0.
  {
    id: "giant-fire-beetle",
    cr: 0,
    size: "Small",
    ac: 13,
    hp: 4,
    speeds: { walk: 30, climb: 30 },
    abilityScores: { STR: 8, DEX: 10, CON: 12, INT: 1, WIS: 7, CHA: 3 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 1,
        damageDice: "1",
        damageType: "fire",
        reachFt: 5,
      },
    ],
    senses: { blindsightFt: 30 },
    traits: ["trait.illumination"],
  },
  // Goat (2024 SRD 5.2.1). AC 10, HP 4, CR 0.
  {
    id: "goat",
    cr: 0,
    size: "Medium",
    ac: 10,
    hp: 4,
    speeds: { walk: 40, climb: 30 },
    abilityScores: { STR: 11, DEX: 10, CON: 11, INT: 2, WIS: 10, CHA: 5 },
    attacks: [
      {
        nameKey: "attack.ram",
        toHit: 2,
        damageDice: "1",
        damageType: "bludgeoning",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 60 },
    traits: ["trait.charge"],
  },
  // Hawk (2024 SRD 5.2.1). AC 13, HP 1, CR 0.
  {
    id: "hawk",
    cr: 0,
    size: "Tiny",
    ac: 13,
    hp: 1,
    speeds: { walk: 10, fly: 60 },
    abilityScores: { STR: 5, DEX: 16, CON: 8, INT: 2, WIS: 14, CHA: 6 },
    attacks: [
      {
        nameKey: "attack.talons",
        toHit: 5,
        damageDice: "1",
        damageType: "slashing",
        reachFt: 5,
      },
    ],
  },
  // Hyena (2024 SRD 5.2.1). AC 11, HP 5, CR 0.
  {
    id: "hyena",
    cr: 0,
    size: "Medium",
    ac: 11,
    hp: 5,
    speeds: { walk: 50 },
    abilityScores: { STR: 11, DEX: 13, CON: 12, INT: 2, WIS: 12, CHA: 5 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 2,
        damageDice: "1d6",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 60 },
    traits: ["trait.pack-tactics"],
  },
  // Jackal (2024 SRD 5.2.1). AC 12, HP 3, CR 0.
  {
    id: "jackal",
    cr: 0,
    size: "Small",
    ac: 12,
    hp: 3,
    speeds: { walk: 40 },
    abilityScores: { STR: 8, DEX: 15, CON: 11, INT: 3, WIS: 12, CHA: 6 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 1,
        damageDice: "1d4-1",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 90 },
  },
  // Lizard (2024 SRD 5.2.1). AC 10, HP 2, CR 0.
  {
    id: "lizard",
    cr: 0,
    size: "Tiny",
    ac: 10,
    hp: 2,
    speeds: { walk: 20, climb: 20 },
    abilityScores: { STR: 2, DEX: 11, CON: 10, INT: 1, WIS: 8, CHA: 3 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 2,
        damageDice: "1",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 30 },
    traits: ["trait.spider-climb"],
  },
  // Octopus (2024 SRD 5.2.1). AC 12, HP 3, CR 0.
  {
    id: "octopus",
    cr: 0,
    size: "Small",
    ac: 12,
    hp: 3,
    speeds: { walk: 5, swim: 30 },
    abilityScores: { STR: 4, DEX: 15, CON: 11, INT: 3, WIS: 10, CHA: 4 },
    attacks: [
      {
        nameKey: "attack.tentacles",
        toHit: 4,
        damageDice: "1",
        damageType: "bludgeoning",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 30 },
    traits: ["trait.compression", "trait.water-breathing", "trait.ink-cloud"],
  },
  // Owl (2024 SRD 5.2.1). AC 11, HP 1, CR 0.
  {
    id: "owl",
    cr: 0,
    size: "Tiny",
    ac: 11,
    hp: 1,
    speeds: { walk: 5, fly: 60 },
    abilityScores: { STR: 3, DEX: 13, CON: 8, INT: 2, WIS: 12, CHA: 7 },
    attacks: [
      {
        nameKey: "attack.talons",
        toHit: 3,
        damageDice: "1",
        damageType: "slashing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 120 },
    traits: ["trait.flyby"],
  },
  // Piranha (2024 SRD 5.2.1). AC 13, HP 1, CR 0.
  {
    id: "piranha",
    cr: 0,
    size: "Tiny",
    ac: 13,
    hp: 1,
    speeds: { walk: 5, swim: 40 },
    abilityScores: { STR: 2, DEX: 16, CON: 9, INT: 1, WIS: 7, CHA: 2 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 5,
        damageDice: "1",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 60 },
    traits: ["trait.water-breathing"],
  },
  // Rat (2024 SRD 5.2.1). AC 10, HP 1, CR 0.
  {
    id: "rat",
    cr: 0,
    size: "Tiny",
    ac: 10,
    hp: 1,
    speeds: { walk: 20, climb: 20 },
    abilityScores: { STR: 2, DEX: 11, CON: 9, INT: 2, WIS: 10, CHA: 4 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 2,
        damageDice: "1",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 30 },
    traits: ["trait.agile"],
  },
  // Raven (2024 SRD 5.2.1). AC 12, HP 2, CR 0.
  {
    id: "raven",
    cr: 0,
    size: "Tiny",
    ac: 12,
    hp: 2,
    speeds: { walk: 10, fly: 50 },
    abilityScores: { STR: 2, DEX: 14, CON: 10, INT: 5, WIS: 13, CHA: 6 },
    attacks: [
      {
        nameKey: "attack.beak",
        toHit: 4,
        damageDice: "1",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    traits: ["trait.mimicry"],
  },
  // Scorpion (2024 SRD 5.2.1). AC 11, HP 1, CR 0.
  {
    id: "scorpion",
    cr: 0,
    size: "Tiny",
    ac: 11,
    hp: 1,
    speeds: { walk: 10 },
    abilityScores: { STR: 2, DEX: 11, CON: 8, INT: 1, WIS: 8, CHA: 2 },
    attacks: [
      {
        nameKey: "attack.sting",
        toHit: 2,
        damageDice: "1d6+1",
        damageType: "poison",
        reachFt: 5,
      },
    ],
    senses: { blindsightFt: 10 },
  },
  // Seahorse (2024 SRD 5.2.1). AC 12, HP 1, CR 0.
  {
    id: "seahorse",
    cr: 0,
    size: "Tiny",
    ac: 12,
    hp: 1,
    speeds: { walk: 5, swim: 20 },
    abilityScores: { STR: 1, DEX: 12, CON: 8, INT: 1, WIS: 10, CHA: 2 },
    attacks: [],
    traits: ["trait.water-breathing", "trait.bubble-dash"],
  },
  // Spider (2024 SRD 5.2.1). AC 12, HP 1, CR 0.
  {
    id: "spider",
    cr: 0,
    size: "Tiny",
    ac: 12,
    hp: 1,
    speeds: { walk: 20, climb: 20 },
    abilityScores: { STR: 2, DEX: 14, CON: 8, INT: 1, WIS: 10, CHA: 2 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 4,
        damageDice: "1d4+1",
        damageType: "poison",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 30 },
    traits: ["trait.spider-climb", "trait.web-walker"],
  },
  // Vulture (2024 SRD 5.2.1). AC 10, HP 5, CR 0.
  {
    id: "vulture",
    cr: 0,
    size: "Medium",
    ac: 10,
    hp: 5,
    speeds: { walk: 10, fly: 50 },
    abilityScores: { STR: 7, DEX: 10, CON: 13, INT: 2, WIS: 12, CHA: 4 },
    attacks: [
      {
        nameKey: "attack.beak",
        toHit: 2,
        damageDice: "1d4",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    traits: ["trait.pack-tactics"],
  },
  // Weasel (2024 SRD 5.2.1). AC 13, HP 1, CR 0.
  {
    id: "weasel",
    cr: 0,
    size: "Tiny",
    ac: 13,
    hp: 1,
    speeds: { walk: 30, climb: 30 },
    abilityScores: { STR: 3, DEX: 16, CON: 8, INT: 2, WIS: 12, CHA: 3 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 5,
        damageDice: "1",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 60 },
  },
  // ── CR 1/8 ────────────────────────────────────────────────────
  // Blood Hawk (2024 SRD 5.2.1). AC 12, HP 7, CR 1/8.
  {
    id: "blood-hawk",
    cr: 0.125,
    size: "Small",
    ac: 12,
    hp: 7,
    speeds: { walk: 10, fly: 60 },
    abilityScores: { STR: 6, DEX: 14, CON: 10, INT: 3, WIS: 14, CHA: 5 },
    attacks: [
      {
        nameKey: "attack.beak",
        toHit: 4,
        damageDice: "1d4+2",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    traits: ["trait.pack-tactics"],
  },
  // Camel (2024 SRD 5.2.1). AC 10, HP 17, CR 1/8.
  {
    id: "camel",
    cr: 0.125,
    size: "Large",
    ac: 10,
    hp: 17,
    speeds: { walk: 50 },
    abilityScores: { STR: 15, DEX: 8, CON: 17, INT: 2, WIS: 11, CHA: 5 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 4,
        damageDice: "1d4+2",
        damageType: "bludgeoning",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 60 },
  },
  // Flying Snake (2024 SRD 5.2.1). AC 14, HP 5, CR 1/8.
  {
    id: "flying-snake",
    cr: 0.125,
    size: "Tiny",
    ac: 14,
    hp: 5,
    speeds: { walk: 30, fly: 60, swim: 30 },
    abilityScores: { STR: 4, DEX: 15, CON: 11, INT: 2, WIS: 12, CHA: 5 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 4,
        damageDice: "2d4+1",
        damageType: "poison",
        reachFt: 5,
      },
    ],
    senses: { blindsightFt: 10 },
    traits: ["trait.flyby"],
  },
  // Giant Crab (2024 SRD 5.2.1). AC 15, HP 13, CR 1/8.
  {
    id: "giant-crab",
    cr: 0.125,
    size: "Medium",
    ac: 15,
    hp: 13,
    speeds: { walk: 30, swim: 30 },
    abilityScores: { STR: 13, DEX: 13, CON: 11, INT: 1, WIS: 9, CHA: 3 },
    attacks: [
      {
        nameKey: "attack.claw",
        toHit: 3,
        damageDice: "1d6+1",
        damageType: "bludgeoning",
        reachFt: 5,
      },
    ],
    senses: { blindsightFt: 30 },
    traits: ["trait.amphibious"],
  },
  // Giant Rat (2024 SRD 5.2.1). AC 13, HP 7, CR 1/8.
  {
    id: "giant-rat",
    cr: 0.125,
    size: "Small",
    ac: 13,
    hp: 7,
    speeds: { walk: 30, climb: 30 },
    abilityScores: { STR: 7, DEX: 16, CON: 11, INT: 2, WIS: 10, CHA: 4 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 5,
        damageDice: "1d4+3",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 60 },
    traits: ["trait.pack-tactics"],
  },
  // Giant Weasel (2024 SRD 5.2.1). AC 13, HP 9, CR 1/8.
  {
    id: "giant-weasel",
    cr: 0.125,
    size: "Medium",
    ac: 13,
    hp: 9,
    speeds: { walk: 40, climb: 30 },
    abilityScores: { STR: 11, DEX: 17, CON: 10, INT: 4, WIS: 12, CHA: 5 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 5,
        damageDice: "1d4+3",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 60 },
  },
  // Mastiff (2024 SRD 5.2.1). AC 12, HP 5, CR 1/8.
  {
    id: "mastiff",
    cr: 0.125,
    size: "Medium",
    ac: 12,
    hp: 5,
    speeds: { walk: 40 },
    abilityScores: { STR: 13, DEX: 14, CON: 12, INT: 3, WIS: 12, CHA: 7 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 3,
        damageDice: "1d6+1",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 60 },
  },
  // Mule (2024 SRD 5.2.1). AC 10, HP 11, CR 1/8.
  {
    id: "mule",
    cr: 0.125,
    size: "Medium",
    ac: 10,
    hp: 11,
    speeds: { walk: 40 },
    abilityScores: { STR: 14, DEX: 10, CON: 13, INT: 2, WIS: 10, CHA: 5 },
    attacks: [
      {
        nameKey: "attack.hooves",
        toHit: 4,
        damageDice: "1d4+2",
        damageType: "bludgeoning",
        reachFt: 5,
      },
    ],
    traits: ["trait.beast-of-burden"],
  },
  // Pony (2024 SRD 5.2.1). AC 10, HP 11, CR 1/8.
  {
    id: "pony",
    cr: 0.125,
    size: "Medium",
    ac: 10,
    hp: 11,
    speeds: { walk: 40 },
    abilityScores: { STR: 15, DEX: 10, CON: 13, INT: 2, WIS: 11, CHA: 7 },
    attacks: [
      {
        nameKey: "attack.hooves",
        toHit: 4,
        damageDice: "1d4+2",
        damageType: "bludgeoning",
        reachFt: 5,
      },
    ],
  },
  // Venomous Snake (2024 SRD 5.2.1). AC 12, HP 5, CR 1/8.
  {
    id: "venomous-snake",
    cr: 0.125,
    size: "Tiny",
    ac: 12,
    hp: 5,
    speeds: { walk: 30, swim: 30 },
    abilityScores: { STR: 2, DEX: 15, CON: 11, INT: 1, WIS: 10, CHA: 3 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 4,
        damageDice: "1d4+2",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { blindsightFt: 10 },
  },
  // ── CR 1/4 ──────────────────────────────────────────────────────────────
  // Panther (SRD 5.1 — Miscellaneous Creatures). AC 12, HP 13 (3d8), CR 1/4.
  {
    id: "panther",
    cr: 0.25,
    size: "Medium",
    ac: 12,
    hp: 13,
    speeds: { walk: 50, climb: 40 },
    abilityScores: { STR: 14, DEX: 15, CON: 10, INT: 3, WIS: 14, CHA: 7 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 4,
        damageDice: "1d6+2",
        damageType: "piercing",
        reachFt: 5,
      },
      {
        nameKey: "attack.claw",
        toHit: 4,
        damageDice: "1d4+2",
        damageType: "slashing",
        reachFt: 5,
      },
    ],
    traits: ["trait.keen-smell", "trait.pounce"],
  },
  // Axe Beak (2024 SRD 5.2.1). AC 11, HP 19, CR 1/4.
  {
    id: "axe-beak",
    cr: 0.25,
    size: "Large",
    ac: 11,
    hp: 19,
    speeds: { walk: 50 },
    abilityScores: { STR: 14, DEX: 12, CON: 12, INT: 2, WIS: 10, CHA: 5 },
    attacks: [
      {
        nameKey: "attack.beak",
        toHit: 4,
        damageDice: "1d8+2",
        damageType: "slashing",
        reachFt: 5,
      },
    ],
  },
  // Boar (2024 SRD 5.2.1). AC 11, HP 13, CR 1/4.
  {
    id: "boar",
    cr: 0.25,
    size: "Medium",
    ac: 11,
    hp: 13,
    speeds: { walk: 40 },
    abilityScores: { STR: 13, DEX: 11, CON: 14, INT: 2, WIS: 9, CHA: 5 },
    attacks: [
      {
        nameKey: "attack.gore",
        toHit: 3,
        damageDice: "1d6+1",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    traits: ["trait.bloodied-fury"],
  },
  // Constrictor Snake (2024 SRD 5.2.1). AC 13, HP 13, CR 1/4.
  {
    id: "constrictor-snake",
    cr: 0.25,
    size: "Large",
    ac: 13,
    hp: 13,
    speeds: { walk: 30, swim: 30 },
    abilityScores: { STR: 15, DEX: 14, CON: 12, INT: 1, WIS: 10, CHA: 3 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 4,
        damageDice: "1d8+2",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { blindsightFt: 10 },
  },
  // Draft Horse (2024 SRD 5.2.1). AC 10, HP 15, CR 1/4.
  {
    id: "draft-horse",
    cr: 0.25,
    size: "Large",
    ac: 10,
    hp: 15,
    speeds: { walk: 40 },
    abilityScores: { STR: 18, DEX: 10, CON: 15, INT: 2, WIS: 11, CHA: 7 },
    attacks: [
      {
        nameKey: "attack.hooves",
        toHit: 6,
        damageDice: "1d4+4",
        damageType: "bludgeoning",
        reachFt: 5,
      },
    ],
  },
  // Elk (2024 SRD 5.2.1). AC 10, HP 11, CR 1/4.
  {
    id: "elk",
    cr: 0.25,
    size: "Large",
    ac: 10,
    hp: 11,
    speeds: { walk: 50 },
    abilityScores: { STR: 16, DEX: 10, CON: 11, INT: 2, WIS: 10, CHA: 6 },
    attacks: [
      {
        nameKey: "attack.ram",
        toHit: 5,
        damageDice: "1d6+3",
        damageType: "bludgeoning",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 60 },
  },
  // Giant Badger (2024 SRD 5.2.1). AC 13, HP 15, CR 1/4.
  {
    id: "giant-badger",
    cr: 0.25,
    size: "Medium",
    ac: 13,
    hp: 15,
    speeds: { walk: 30, burrow: 10 },
    abilityScores: { STR: 13, DEX: 10, CON: 17, INT: 2, WIS: 12, CHA: 5 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 3,
        damageDice: "2d4+1",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 60 },
    traits: ["trait.poison-resistance"],
  },
  // Giant Bat (2024 SRD 5.2.1). AC 13, HP 22, CR 1/4.
  {
    id: "giant-bat",
    cr: 0.25,
    size: "Large",
    ac: 13,
    hp: 22,
    speeds: { walk: 10, fly: 60 },
    abilityScores: { STR: 15, DEX: 16, CON: 11, INT: 2, WIS: 12, CHA: 6 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 5,
        damageDice: "1d6+3",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { blindsightFt: 120 },
  },
  // Giant Centipede (2024 SRD 5.2.1). AC 14, HP 9, CR 1/4.
  {
    id: "giant-centipede",
    cr: 0.25,
    size: "Small",
    ac: 14,
    hp: 9,
    speeds: { walk: 30, climb: 30 },
    abilityScores: { STR: 5, DEX: 14, CON: 12, INT: 1, WIS: 7, CHA: 3 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 4,
        damageDice: "1d4+2",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { blindsightFt: 30 },
  },
  // Giant Frog (2024 SRD 5.2.1). AC 11, HP 18, CR 1/4.
  {
    id: "giant-frog",
    cr: 0.25,
    size: "Medium",
    ac: 11,
    hp: 18,
    speeds: { walk: 30, swim: 30 },
    abilityScores: { STR: 12, DEX: 13, CON: 11, INT: 2, WIS: 10, CHA: 3 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 3,
        damageDice: "1d6+2",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 30 },
    traits: ["trait.amphibious", "trait.standing-leap"],
  },
  // Giant Lizard (2024 SRD 5.2.1). AC 12, HP 19, CR 1/4.
  {
    id: "giant-lizard",
    cr: 0.25,
    size: "Large",
    ac: 12,
    hp: 19,
    speeds: { walk: 40, climb: 40 },
    abilityScores: { STR: 15, DEX: 12, CON: 13, INT: 2, WIS: 10, CHA: 5 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 4,
        damageDice: "1d8+2",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 60 },
    traits: ["trait.spider-climb"],
  },
  // Giant Owl (2024 SRD 5.2.1). AC 12, HP 19, CR 1/4.
  {
    id: "giant-owl",
    cr: 0.25,
    size: "Large",
    ac: 12,
    hp: 19,
    speeds: { walk: 5, fly: 60 },
    abilityScores: { STR: 13, DEX: 15, CON: 12, INT: 10, WIS: 14, CHA: 10 },
    attacks: [
      {
        nameKey: "attack.talons",
        toHit: 4,
        damageDice: "1d10+2",
        damageType: "slashing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 120 },
    traits: ["trait.flyby"],
  },
  // Giant Venomous Snake (2024 SRD 5.2.1). AC 14, HP 11, CR 1/4.
  {
    id: "giant-venomous-snake",
    cr: 0.25,
    size: "Medium",
    ac: 14,
    hp: 11,
    speeds: { walk: 40, swim: 40 },
    abilityScores: { STR: 10, DEX: 18, CON: 13, INT: 2, WIS: 10, CHA: 3 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 6,
        damageDice: "1d4+4",
        damageType: "piercing",
        reachFt: 10,
      },
    ],
    senses: { blindsightFt: 10 },
  },
  // Giant Wolf Spider (2024 SRD 5.2.1). AC 13, HP 11, CR 1/4.
  {
    id: "giant-wolf-spider",
    cr: 0.25,
    size: "Medium",
    ac: 13,
    hp: 11,
    speeds: { walk: 40, climb: 40 },
    abilityScores: { STR: 12, DEX: 16, CON: 13, INT: 3, WIS: 12, CHA: 4 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 5,
        damageDice: "1d4+3",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 60, blindsightFt: 10 },
    traits: ["trait.spider-climb"],
  },
  // Pteranodon (2024 SRD 5.2.1). AC 13, HP 13, CR 1/4.
  {
    id: "pteranodon",
    cr: 0.25,
    size: "Medium",
    ac: 13,
    hp: 13,
    speeds: { walk: 10, fly: 60 },
    abilityScores: { STR: 12, DEX: 15, CON: 10, INT: 2, WIS: 9, CHA: 5 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 4,
        damageDice: "1d8+2",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    traits: ["trait.flyby"],
  },
  // Riding Horse (2024 SRD 5.2.1). AC 11, HP 13, CR 1/4.
  {
    id: "riding-horse",
    cr: 0.25,
    size: "Large",
    ac: 11,
    hp: 13,
    speeds: { walk: 60 },
    abilityScores: { STR: 16, DEX: 13, CON: 12, INT: 2, WIS: 11, CHA: 7 },
    attacks: [
      {
        nameKey: "attack.hooves",
        toHit: 5,
        damageDice: "1d8+3",
        damageType: "bludgeoning",
        reachFt: 5,
      },
    ],
  },
  // Wolf (2024 SRD 5.2.1). AC 12, HP 11, CR 1/4.
  {
    id: "wolf",
    cr: 0.25,
    size: "Medium",
    ac: 12,
    hp: 11,
    speeds: { walk: 40 },
    abilityScores: { STR: 14, DEX: 15, CON: 12, INT: 3, WIS: 12, CHA: 6 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 4,
        damageDice: "1d6+2",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 60 },
    traits: ["trait.pack-tactics"],
  },
  // ── CR 1/2 ──────────────────────────────────────────────────────────────
  // Ape (SRD 5.1). AC 12, HP 19 (3d8+6), CR 1/2. Multiattack: two fists.
  {
    id: "ape",
    cr: 0.5,
    size: "Medium",
    ac: 12,
    hp: 19,
    speeds: { walk: 30, climb: 30 },
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 6, WIS: 12, CHA: 7 },
    attacks: [
      {
        nameKey: "attack.fist",
        toHit: 5,
        damageDice: "1d6+3",
        damageType: "bludgeoning",
        reachFt: 5,
      },
      {
        nameKey: "attack.rock",
        toHit: 5,
        damageDice: "1d6+2",
        damageType: "bludgeoning",
        range: { nearFt: 25, farFt: 50 },
      },
    ],
  },
  // Black Bear (2024 SRD 5.2.1). AC 11, HP 19, CR 1/2.
  {
    id: "black-bear",
    cr: 0.5,
    size: "Medium",
    ac: 11,
    hp: 19,
    speeds: { walk: 30, climb: 30, swim: 30 },
    abilityScores: { STR: 15, DEX: 12, CON: 14, INT: 2, WIS: 12, CHA: 7 },
    attacks: [
      {
        nameKey: "attack.rend",
        toHit: 4,
        damageDice: "1d6+2",
        damageType: "slashing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 60 },
  },
  // Crocodile (2024 SRD 5.2.1). AC 12, HP 13, CR 1/2.
  {
    id: "crocodile",
    cr: 0.5,
    size: "Large",
    ac: 12,
    hp: 13,
    speeds: { walk: 20, swim: 30 },
    abilityScores: { STR: 15, DEX: 10, CON: 13, INT: 2, WIS: 10, CHA: 5 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 4,
        damageDice: "1d8+2",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    traits: ["trait.hold-breath"],
  },
  // Giant Goat (2024 SRD 5.2.1). AC 11, HP 19, CR 1/2.
  {
    id: "giant-goat",
    cr: 0.5,
    size: "Large",
    ac: 11,
    hp: 19,
    speeds: { walk: 40, climb: 30 },
    abilityScores: { STR: 17, DEX: 13, CON: 12, INT: 3, WIS: 12, CHA: 6 },
    attacks: [
      {
        nameKey: "attack.ram",
        toHit: 5,
        damageDice: "1d6+3",
        damageType: "bludgeoning",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 60 },
  },
  // Giant Seahorse (2024 SRD 5.2.1). AC 14, HP 16, CR 1/2.
  {
    id: "giant-seahorse",
    cr: 0.5,
    size: "Large",
    ac: 14,
    hp: 16,
    speeds: { walk: 5, swim: 40 },
    abilityScores: { STR: 15, DEX: 12, CON: 11, INT: 2, WIS: 12, CHA: 5 },
    attacks: [
      {
        nameKey: "attack.ram",
        toHit: 4,
        damageDice: "2d6+2",
        damageType: "bludgeoning",
        reachFt: 5,
      },
    ],
    traits: ["trait.water-breathing", "trait.charge"],
  },
  // Giant Wasp (2024 SRD 5.2.1). AC 13, HP 22, CR 1/2.
  {
    id: "giant-wasp",
    cr: 0.5,
    size: "Medium",
    ac: 13,
    hp: 22,
    speeds: { walk: 10, fly: 50 },
    abilityScores: { STR: 10, DEX: 14, CON: 10, INT: 1, WIS: 10, CHA: 3 },
    attacks: [
      {
        nameKey: "attack.sting",
        toHit: 4,
        damageDice: "1d6+2",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    traits: ["trait.flyby"],
  },
  // Reef Shark (2024 SRD 5.2.1). AC 12, HP 22, CR 1/2.
  {
    id: "reef-shark",
    cr: 0.5,
    size: "Medium",
    ac: 12,
    hp: 22,
    speeds: { walk: 5, swim: 30 },
    abilityScores: { STR: 14, DEX: 15, CON: 13, INT: 1, WIS: 10, CHA: 4 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 4,
        damageDice: "2d4+2",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { blindsightFt: 30 },
    traits: ["trait.pack-tactics", "trait.water-breathing"],
  },
  // Warhorse (2024 SRD 5.2.1). AC 11, HP 19, CR 1/2.
  {
    id: "warhorse",
    cr: 0.5,
    size: "Large",
    ac: 11,
    hp: 19,
    speeds: { walk: 60 },
    abilityScores: { STR: 18, DEX: 12, CON: 13, INT: 2, WIS: 12, CHA: 7 },
    attacks: [
      {
        nameKey: "attack.hooves",
        toHit: 6,
        damageDice: "2d4+4",
        damageType: "bludgeoning",
        reachFt: 5,
      },
    ],
    traits: ["trait.charge"],
  },
  // ── CR 1 ────────────────────────────────────────────────────────────────
  // Brown Bear (SRD 5.1). AC 11, HP 34 (4d10+12), CR 1. Multiattack: bite + claws.
  {
    id: "brown-bear",
    cr: 1,
    size: "Large",
    ac: 11,
    hp: 34,
    speeds: { walk: 40, climb: 30 },
    abilityScores: { STR: 19, DEX: 10, CON: 16, INT: 2, WIS: 13, CHA: 7 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 6,
        damageDice: "1d8+4",
        damageType: "piercing",
        reachFt: 5,
      },
      {
        nameKey: "attack.claws",
        toHit: 6,
        damageDice: "2d6+4",
        damageType: "slashing",
        reachFt: 5,
      },
    ],
    traits: ["trait.keen-smell"],
  },
  // Dire Wolf (SRD 5.1). AC 14 (natural), HP 37 (5d10+10), CR 1.
  {
    id: "dire-wolf",
    cr: 1,
    size: "Large",
    ac: 14,
    hp: 37,
    speeds: { walk: 50 },
    abilityScores: { STR: 17, DEX: 15, CON: 15, INT: 3, WIS: 12, CHA: 7 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 5,
        damageDice: "2d6+3",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    traits: ["trait.pack-tactics", "trait.keen-hearing-and-smell"],
  },
  // Giant Spider (SRD 5.1). AC 14 (natural), HP 26 (4d10+4), CR 1.
  {
    id: "giant-spider",
    cr: 1,
    size: "Large",
    ac: 14,
    hp: 26,
    speeds: { walk: 30, climb: 30 },
    abilityScores: { STR: 14, DEX: 16, CON: 12, INT: 2, WIS: 11, CHA: 4 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 5,
        damageDice: "1d8+3",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { blindsightFt: 10, darkvisionFt: 60 },
    traits: ["trait.spider-climb", "trait.web-walker"],
  },
  // Giant Eagle (SRD 5.1). AC 13, HP 26 (4d10+4), CR 1. Multiattack: beak + talons.
  {
    id: "giant-eagle",
    cr: 1,
    size: "Large",
    ac: 13,
    hp: 26,
    speeds: { walk: 10, fly: 80 },
    abilityScores: { STR: 16, DEX: 17, CON: 13, INT: 8, WIS: 14, CHA: 10 },
    attacks: [
      {
        nameKey: "attack.beak",
        toHit: 5,
        damageDice: "1d6+3",
        damageType: "piercing",
        reachFt: 5,
      },
      {
        nameKey: "attack.talons",
        toHit: 5,
        damageDice: "2d6+3",
        damageType: "slashing",
        reachFt: 5,
      },
    ],
    traits: ["trait.keen-sight"],
  },
  // Giant Vulture (SRD 5.1). AC 10, HP 22 (3d10+6), CR 1. Multiattack: beak + talons.
  {
    id: "giant-vulture",
    cr: 1,
    size: "Large",
    ac: 10,
    hp: 22,
    speeds: { walk: 10, fly: 60 },
    abilityScores: { STR: 15, DEX: 10, CON: 15, INT: 6, WIS: 12, CHA: 7 },
    attacks: [
      {
        nameKey: "attack.beak",
        toHit: 4,
        damageDice: "2d4+2",
        damageType: "piercing",
        reachFt: 5,
      },
      {
        nameKey: "attack.talons",
        toHit: 4,
        damageDice: "2d6+2",
        damageType: "slashing",
        reachFt: 5,
      },
    ],
    traits: ["trait.keen-sight-and-smell", "trait.pack-tactics"],
  },
  // Giant Octopus (SRD 5.1). AC 11, HP 52 (8d10+8), CR 1.
  {
    id: "giant-octopus",
    cr: 1,
    size: "Large",
    ac: 11,
    hp: 52,
    speeds: { walk: 10, swim: 60 },
    abilityScores: { STR: 17, DEX: 13, CON: 13, INT: 4, WIS: 10, CHA: 4 },
    attacks: [
      {
        nameKey: "attack.tentacles",
        toHit: 5,
        damageDice: "2d6+3",
        damageType: "bludgeoning",
        reachFt: 15,
      },
    ],
    senses: { darkvisionFt: 30 },
    traits: ["trait.hold-breath", "trait.water-breathing"],
  },
  // Giant Toad (SRD 5.1). AC 11, HP 39 (6d10+6), CR 1.
  {
    id: "giant-toad",
    cr: 1,
    size: "Large",
    ac: 11,
    hp: 39,
    speeds: { walk: 20, swim: 40 },
    abilityScores: { STR: 15, DEX: 13, CON: 13, INT: 2, WIS: 10, CHA: 3 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 4,
        damageDice: "1d10+2",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 30 },
    traits: ["trait.amphibious", "trait.standing-leap"],
  },
  // Giant Hyena (2024 SRD 5.2.1). AC 12, HP 45, CR 1.
  {
    id: "giant-hyena",
    cr: 1,
    size: "Large",
    ac: 12,
    hp: 45,
    speeds: { walk: 50 },
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 2, WIS: 12, CHA: 7 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 5,
        damageDice: "2d6+3",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 60 },
    traits: ["trait.rampage"],
  },
  // Lion (2024 SRD 5.2.1). AC 12, HP 22, CR 1.
  {
    id: "lion",
    cr: 1,
    size: "Large",
    ac: 12,
    hp: 22,
    speeds: { walk: 50 },
    abilityScores: { STR: 17, DEX: 15, CON: 11, INT: 3, WIS: 12, CHA: 8 },
    attacks: [
      {
        nameKey: "attack.rend",
        toHit: 5,
        damageDice: "1d8+3",
        damageType: "slashing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 60 },
    traits: ["trait.pack-tactics", "trait.running-leap", "trait.roar"],
  },
  // Tiger (2024 SRD 5.2.1). AC 13, HP 30, CR 1.
  {
    id: "tiger",
    cr: 1,
    size: "Large",
    ac: 13,
    hp: 30,
    speeds: { walk: 40 },
    abilityScores: { STR: 17, DEX: 16, CON: 14, INT: 3, WIS: 12, CHA: 8 },
    attacks: [
      {
        nameKey: "attack.rend",
        toHit: 5,
        damageDice: "2d6+3",
        damageType: "slashing",
        reachFt: 5,
      },
    ],
    senses: { darkvisionFt: 60 },
    traits: ["trait.nimble-escape"],
  },
  // ── CR 2 ────────────────────────────────────────────────────────────────
  // Allosaurus (SRD 5.1 — Dinosaurs). AC 13, HP 51 (6d10+18), CR 2.
  {
    id: "allosaurus",
    cr: 2,
    size: "Large",
    ac: 13,
    hp: 51,
    speeds: { walk: 60 },
    abilityScores: { STR: 19, DEX: 13, CON: 17, INT: 2, WIS: 12, CHA: 5 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 6,
        damageDice: "2d10+4",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    traits: ["trait.pounce"],
  },
  // Giant Elk (2014 MM / 2024). AC 14 (natural), HP 42 (5d12+10), CR 2.
  {
    id: "giant-elk",
    cr: 2,
    size: "Huge",
    ac: 14,
    hp: 42,
    speeds: { walk: 60 },
    abilityScores: { STR: 19, DEX: 16, CON: 14, INT: 7, WIS: 14, CHA: 10 },
    attacks: [
      {
        nameKey: "attack.ram",
        toHit: 6,
        damageDice: "2d6+4",
        damageType: "bludgeoning",
        reachFt: 10,
      },
      {
        nameKey: "attack.hooves",
        toHit: 6,
        damageDice: "4d8+4",
        damageType: "bludgeoning",
        reachFt: 5,
      },
    ],
    traits: ["trait.charge"],
  },
  // Polar Bear (SRD 5.1). AC 12 (natural), HP 42 (5d10+15), CR 2. Multiattack.
  {
    id: "polar-bear",
    cr: 2,
    size: "Large",
    ac: 12,
    hp: 42,
    speeds: { walk: 40, swim: 30 },
    abilityScores: { STR: 20, DEX: 10, CON: 16, INT: 2, WIS: 13, CHA: 7 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 7,
        damageDice: "1d8+5",
        damageType: "piercing",
        reachFt: 5,
      },
      {
        nameKey: "attack.claws",
        toHit: 7,
        damageDice: "2d6+5",
        damageType: "slashing",
        reachFt: 5,
      },
    ],
    traits: ["trait.keen-smell"],
  },
  // Giant Constrictor Snake (SRD 5.1). AC 12, HP 60 (8d12+8), CR 2.
  {
    id: "giant-constrictor-snake",
    cr: 2,
    size: "Huge",
    ac: 12,
    hp: 60,
    speeds: { walk: 30, swim: 30 },
    abilityScores: { STR: 19, DEX: 14, CON: 12, INT: 1, WIS: 10, CHA: 3 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 6,
        damageDice: "2d6+4",
        damageType: "piercing",
        reachFt: 10,
      },
      {
        nameKey: "attack.constrict",
        toHit: 6,
        damageDice: "2d8+4",
        damageType: "bludgeoning",
        reachFt: 5,
      },
    ],
    senses: { blindsightFt: 10 },
  },
  // Giant Boar (2014 MM / 2024). AC 12 (natural), HP 42 (5d10+15), CR 2.
  {
    id: "giant-boar",
    cr: 2,
    size: "Large",
    ac: 12,
    hp: 42,
    speeds: { walk: 40 },
    abilityScores: { STR: 17, DEX: 10, CON: 16, INT: 2, WIS: 7, CHA: 5 },
    attacks: [
      {
        nameKey: "attack.tusk",
        toHit: 5,
        damageDice: "2d6+3",
        damageType: "slashing",
        reachFt: 5,
      },
    ],
    traits: ["trait.charge", "trait.relentless"],
  },
  // Saber-Toothed Tiger (SRD 5.1). AC 12, HP 52 (7d10+14), CR 2. Multiattack.
  {
    id: "saber-toothed-tiger",
    cr: 2,
    size: "Large",
    ac: 12,
    hp: 52,
    speeds: { walk: 40 },
    abilityScores: { STR: 18, DEX: 14, CON: 15, INT: 3, WIS: 12, CHA: 8 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 6,
        damageDice: "1d10+5",
        damageType: "piercing",
        reachFt: 5,
      },
      {
        nameKey: "attack.claw",
        toHit: 6,
        damageDice: "2d6+5",
        damageType: "slashing",
        reachFt: 5,
      },
    ],
    traits: ["trait.keen-smell", "trait.pounce"],
  },
  // Hunter Shark (2024 SRD 5.2.1). AC 12, HP 45, CR 2.
  {
    id: "hunter-shark",
    cr: 2,
    size: "Large",
    ac: 12,
    hp: 45,
    speeds: { walk: 5, swim: 40 },
    abilityScores: { STR: 18, DEX: 14, CON: 15, INT: 1, WIS: 10, CHA: 4 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 6,
        damageDice: "3d6+4",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { blindsightFt: 60 },
    traits: ["trait.water-breathing"],
  },
  // Plesiosaurus (2024 SRD 5.2.1). AC 13, HP 68, CR 2.
  {
    id: "plesiosaurus",
    cr: 2,
    size: "Large",
    ac: 13,
    hp: 68,
    speeds: { walk: 20, swim: 40 },
    abilityScores: { STR: 18, DEX: 15, CON: 16, INT: 2, WIS: 12, CHA: 5 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 6,
        damageDice: "2d6+4",
        damageType: "piercing",
        reachFt: 10,
      },
    ],
    traits: ["trait.hold-breath"],
  },
  // Rhinoceros (2024 SRD 5.2.1). AC 13, HP 45, CR 2.
  {
    id: "rhinoceros",
    cr: 2,
    size: "Large",
    ac: 13,
    hp: 45,
    speeds: { walk: 40 },
    abilityScores: { STR: 21, DEX: 8, CON: 15, INT: 2, WIS: 12, CHA: 6 },
    attacks: [
      {
        nameKey: "attack.gore",
        toHit: 7,
        damageDice: "2d8+5",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
  },
  // ── CR 3 ────────────────────────────────────────────────────
  // Ankylosaurus (2024 SRD 5.2.1). AC 15, HP 68, CR 3.
  {
    id: "ankylosaurus",
    cr: 3,
    size: "Huge",
    ac: 15,
    hp: 68,
    speeds: { walk: 30 },
    abilityScores: { STR: 19, DEX: 11, CON: 15, INT: 2, WIS: 12, CHA: 5 },
    attacks: [
      {
        nameKey: "attack.tail",
        toHit: 6,
        damageDice: "1d10+4",
        damageType: "bludgeoning",
        reachFt: 10,
      },
    ],
  },
  // Giant Scorpion (2024 SRD 5.2.1). AC 15, HP 52, CR 3.
  {
    id: "giant-scorpion",
    cr: 3,
    size: "Large",
    ac: 15,
    hp: 52,
    speeds: { walk: 40 },
    abilityScores: { STR: 16, DEX: 13, CON: 15, INT: 1, WIS: 9, CHA: 3 },
    attacks: [
      {
        nameKey: "attack.claw",
        toHit: 5,
        damageDice: "1d6+3",
        damageType: "bludgeoning",
        reachFt: 5,
      },
      {
        nameKey: "attack.sting",
        toHit: 5,
        damageDice: "1d8+3",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { blindsightFt: 60 },
  },
  // Killer Whale (2024 SRD 5.2.1). AC 12, HP 90, CR 3.
  {
    id: "killer-whale",
    cr: 3,
    size: "Huge",
    ac: 12,
    hp: 90,
    speeds: { walk: 5, swim: 60 },
    abilityScores: { STR: 19, DEX: 14, CON: 13, INT: 3, WIS: 12, CHA: 7 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 6,
        damageDice: "5d6+4",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { blindsightFt: 120 },
    traits: ["trait.hold-breath"],
  },
  // ── CR 4 ────────────────────────────────────────────────────
  // Archelon (2024 SRD 5.2.1). AC 17, HP 90, CR 4.
  {
    id: "archelon",
    cr: 4,
    size: "Huge",
    ac: 17,
    hp: 90,
    speeds: { walk: 20, swim: 80 },
    abilityScores: { STR: 18, DEX: 16, CON: 13, INT: 4, WIS: 14, CHA: 6 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 6,
        damageDice: "3d6+4",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    traits: ["trait.amphibious"],
  },
  // Elephant (2024 SRD 5.2.1). AC 12, HP 76, CR 4.
  {
    id: "elephant",
    cr: 4,
    size: "Huge",
    ac: 12,
    hp: 76,
    speeds: { walk: 40 },
    abilityScores: { STR: 22, DEX: 9, CON: 17, INT: 3, WIS: 11, CHA: 6 },
    attacks: [
      {
        nameKey: "attack.gore",
        toHit: 8,
        damageDice: "2d8+6",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    traits: ["trait.charge", "trait.trample"],
  },
  // Hippopotamus (2024 SRD 5.2.1). AC 14, HP 82, CR 4.
  {
    id: "hippopotamus",
    cr: 4,
    size: "Large",
    ac: 14,
    hp: 82,
    speeds: { walk: 30, swim: 30 },
    abilityScores: { STR: 21, DEX: 7, CON: 15, INT: 2, WIS: 12, CHA: 4 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 7,
        damageDice: "2d10+5",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    traits: ["trait.hold-breath"],
  },
  // ── CR 5 ────────────────────────────────────────────────────
  // Giant Crocodile (2024 SRD 5.2.1). AC 14, HP 85, CR 5.
  {
    id: "giant-crocodile",
    cr: 5,
    size: "Huge",
    ac: 14,
    hp: 85,
    speeds: { walk: 30, swim: 50 },
    abilityScores: { STR: 21, DEX: 9, CON: 17, INT: 2, WIS: 10, CHA: 7 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 8,
        damageDice: "3d10+5",
        damageType: "piercing",
        reachFt: 5,
      },
      {
        nameKey: "attack.tail",
        toHit: 8,
        damageDice: "3d8+5",
        damageType: "bludgeoning",
        reachFt: 10,
      },
    ],
    traits: ["trait.hold-breath"],
  },
  // Giant Shark (2024 SRD 5.2.1). AC 13, HP 92, CR 5.
  {
    id: "giant-shark",
    cr: 5,
    size: "Huge",
    ac: 13,
    hp: 92,
    speeds: { walk: 5, swim: 60 },
    abilityScores: { STR: 23, DEX: 11, CON: 21, INT: 1, WIS: 10, CHA: 5 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 9,
        damageDice: "3d10+6",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    senses: { blindsightFt: 60 },
    traits: ["trait.water-breathing", "trait.blood-frenzy"],
  },
  // Triceratops (2024 SRD 5.2.1). AC 14, HP 114, CR 5.
  {
    id: "triceratops",
    cr: 5,
    size: "Huge",
    ac: 14,
    hp: 114,
    speeds: { walk: 50 },
    abilityScores: { STR: 22, DEX: 9, CON: 17, INT: 2, WIS: 11, CHA: 5 },
    attacks: [
      {
        nameKey: "attack.gore",
        toHit: 9,
        damageDice: "2d12+6",
        damageType: "piercing",
        reachFt: 5,
      },
    ],
    traits: ["trait.trampling-charge"],
  },
  // ── CR 6 ────────────────────────────────────────────────────────────────
  // Mammoth (SRD 5.1). AC 13 (natural), HP 126 (11d12+55), CR 6. Gore + Stomp.
  {
    id: "mammoth",
    cr: 6,
    size: "Huge",
    ac: 13,
    hp: 126,
    speeds: { walk: 40 },
    abilityScores: { STR: 24, DEX: 9, CON: 21, INT: 3, WIS: 11, CHA: 6 },
    attacks: [
      {
        nameKey: "attack.gore",
        toHit: 10,
        damageDice: "4d8+7",
        damageType: "piercing",
        reachFt: 10,
      },
      {
        nameKey: "attack.stomp",
        toHit: 10,
        damageDice: "4d10+7",
        damageType: "bludgeoning",
        reachFt: 5,
      },
    ],
    traits: ["trait.trampling-charge"],
  },
  // ── CR 7 ────────────────────────────────────────────────────────────────
  // Giant Ape (2024 MM / SRD). AC 12, HP 157, CR 7. Fist (reach 10) + Rock (50/100).
  {
    id: "giant-ape",
    cr: 7,
    size: "Huge",
    ac: 12,
    hp: 157,
    speeds: { walk: 40, climb: 40 },
    abilityScores: { STR: 23, DEX: 14, CON: 18, INT: 7, WIS: 12, CHA: 7 },
    attacks: [
      {
        nameKey: "attack.fist",
        toHit: 9,
        damageDice: "3d10+6",
        damageType: "bludgeoning",
        reachFt: 10,
      },
      {
        nameKey: "attack.rock",
        toHit: 9,
        damageDice: "7d6+6",
        damageType: "bludgeoning",
        range: { nearFt: 50, farFt: 100 },
      },
    ],
  },
  // ── CR 8 ────────────────────────────────────────────────────────────────
  // Tyrannosaurus Rex (SRD 5.1 — Dinosaurs). AC 13 (natural), HP 136 (13d12+52), CR 8.
  {
    id: "tyrannosaurus-rex",
    cr: 8,
    size: "Huge",
    ac: 13,
    hp: 136,
    speeds: { walk: 50 },
    abilityScores: { STR: 25, DEX: 10, CON: 19, INT: 2, WIS: 12, CHA: 9 },
    attacks: [
      {
        nameKey: "attack.bite",
        toHit: 10,
        damageDice: "4d12+7",
        damageType: "piercing",
        reachFt: 10,
      },
      {
        nameKey: "attack.tail",
        toHit: 10,
        damageDice: "3d8+7",
        damageType: "bludgeoning",
        reachFt: 10,
      },
    ],
  },
];
