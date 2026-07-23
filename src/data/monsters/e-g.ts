/**
 * SRD 5.2.1 monster corpus — the e–g tranche (ids beginning e–g).
 * IDs + numbers ONLY; every display string lives in the lazy `monster`
 * catalogue (`src/i18n/{en,it}/srd/monsters.json`). Cite "SRD 5.2.1" in a
 * per-entry source comment — never the book title, never an excluded creature.
 */
import type { MonsterStatBlock } from "@/data/types";

export const SRD_MONSTERS_E_G: ReadonlyArray<MonsterStatBlock> = [
  // Ghost (2024 SRD 5.2.1). AC 11, HP 45, CR 4.
  {
    id: "ghost",
    cr: 4,
    sizes: ["Medium"],
    type: "undead",
    alignment: "neutral",
    ac: 11,
    hp: { average: 45, formula: "10d8" },
    speeds: { walk: 5, fly: 40 },
    hover: true,
    abilityScores: { STR: 7, DEX: 13, CON: 10, INT: 10, WIS: 12, CHA: 17 },
    damageResistances: [
      "acid",
      "bludgeoning",
      "cold",
      "fire",
      "lightning",
      "piercing",
      "slashing",
      "thunder",
    ],
    damageImmunities: ["necrotic", "poison"],
    conditionImmunities: [
      "charmed",
      "exhaustion",
      "frightened",
      "grappled",
      "paralyzed",
      "petrified",
      "poisoned",
      "prone",
      "restrained",
    ],
    senses: { darkvisionFt: 60 },
    languages: { ids: ["common"], plusAnyCount: 1 },
    traits: [
      { id: "ethereal-sight", kind: "narrative" },
      { id: "incorporeal-movement", kind: "narrative" },
    ],
    actions: [
      { id: "multiattack", kind: "narrative" },
      {
        id: "withering-touch",
        kind: "attack",
        attack: "melee",
        toHit: 5,
        reachFt: 5,
        damage: [{ dice: "3d10+3", damageType: "necrotic" }],
      },
      { id: "etherealness", kind: "narrative" },
      {
        id: "horrific-visage",
        kind: "save",
        save: "WIS",
        dc: 13,
        damage: [{ dice: "2d6+3", damageType: "psychic" }],
        onSuccess: "special",
      },
      {
        id: "possession",
        kind: "save",
        save: "CHA",
        dc: 13,
        recharge: 6,
        onSuccess: "special",
      },
    ],
    source: "SRD",
  },
  // Goblin Warrior (2024 SRD 5.2.1). AC 15, HP 10, CR 1/4.
  {
    id: "goblin-warrior",
    cr: 0.25,
    sizes: ["Small"],
    type: "fey",
    typeTags: ["goblinoid"],
    alignment: "chaotic-neutral",
    ac: 15,
    hp: { average: 10, formula: "3d6" },
    speeds: { walk: 30 },
    abilityScores: { STR: 8, DEX: 15, CON: 10, INT: 10, WIS: 8, CHA: 8 },
    skills: [{ skill: "stealth", expertise: true }],
    senses: { darkvisionFt: 60 },
    languages: { ids: ["common", "goblin"] },
    gear: [
      { id: "leather-armor" },
      { id: "scimitar" },
      { id: "shield" },
      { id: "shortbow" },
    ],
    actions: [
      {
        id: "scimitar",
        kind: "attack",
        attack: "melee",
        toHit: 4,
        reachFt: 5,
        damage: [{ dice: "1d6+2", damageType: "slashing" }],
      },
      {
        id: "shortbow",
        kind: "attack",
        attack: "ranged",
        toHit: 4,
        rangeFt: { near: 80, far: 320 },
        damage: [{ dice: "1d6+2", damageType: "piercing" }],
      },
    ],
    bonusActions: [{ id: "nimble-escape", kind: "narrative" }],
    source: "SRD",
  },
];
