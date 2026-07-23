/**
 * SRD 5.2.1 monster corpus — the q–s tranche (ids beginning q–s).
 * IDs + numbers ONLY; every display string lives in the lazy `monster`
 * catalogue (`src/i18n/{en,it}/srd/monsters.json`). Cite "SRD 5.2.1" in a
 * per-entry source comment — never the book title, never an excluded creature.
 */
import type { MonsterStatBlock } from "@/data/types";

export const SRD_MONSTERS_Q_S: ReadonlyArray<MonsterStatBlock> = [
  // Rat (2024 SRD 5.2.1). AC 10, HP 1, CR 0.
  {
    id: "rat",
    cr: 0,
    sizes: ["Tiny"],
    type: "beast",
    alignment: "unaligned",
    ac: 10,
    hp: { average: 1, formula: "1d4-1" },
    speeds: { walk: 20, climb: 20 },
    abilityScores: { STR: 2, DEX: 11, CON: 9, INT: 2, WIS: 10, CHA: 4 },
    skills: [{ skill: "perception" }],
    senses: { darkvisionFt: 30 },
    traits: [{ id: "agile", kind: "narrative" }],
    actions: [
      {
        id: "bite",
        kind: "attack",
        attack: "melee",
        toHit: 2,
        reachFt: 5,
        damage: [{ dice: "1", damageType: "piercing" }],
      },
    ],
    source: "SRD",
  },
  // Skeleton (2024 SRD 5.2.1). AC 14, HP 13, CR 1/4.
  {
    id: "skeleton",
    cr: 0.25,
    sizes: ["Medium"],
    type: "undead",
    alignment: "lawful-evil",
    ac: 14,
    hp: { average: 13, formula: "2d8+4" },
    speeds: { walk: 30 },
    abilityScores: { STR: 10, DEX: 16, CON: 15, INT: 6, WIS: 8, CHA: 5 },
    damageVulnerabilities: ["bludgeoning"],
    damageImmunities: ["poison"],
    conditionImmunities: ["exhaustion", "poisoned"],
    senses: { darkvisionFt: 60 },
    languages: { ids: ["common"], understandsOnly: true, plusAnyCount: 1 },
    gear: [{ id: "shortbow" }, { id: "shortsword" }],
    actions: [
      {
        id: "shortsword",
        kind: "attack",
        attack: "melee",
        toHit: 5,
        reachFt: 5,
        damage: [{ dice: "1d6+3", damageType: "piercing" }],
      },
      {
        id: "shortbow",
        kind: "attack",
        attack: "ranged",
        toHit: 5,
        rangeFt: { near: 80, far: 320 },
        damage: [{ dice: "1d6+3", damageType: "piercing" }],
      },
    ],
    source: "SRD",
  },
  // Swarm of Rats (2024 SRD 5.2.1). AC 10, HP 14, CR 1/4.
  {
    id: "swarm-of-rats",
    cr: 0.25,
    sizes: ["Medium"],
    type: "beast",
    swarmOf: "Tiny",
    alignment: "unaligned",
    ac: 10,
    hp: { average: 14, formula: "4d8-4" },
    speeds: { walk: 30, climb: 30 },
    abilityScores: { STR: 9, DEX: 11, CON: 9, INT: 2, WIS: 10, CHA: 3 },
    saveProficiencies: ["DEX"],
    damageResistances: ["bludgeoning", "piercing", "slashing"],
    conditionImmunities: [
      "charmed",
      "frightened",
      "grappled",
      "paralyzed",
      "petrified",
      "prone",
      "restrained",
      "stunned",
    ],
    senses: { darkvisionFt: 30 },
    traits: [{ id: "swarm", kind: "narrative" }],
    actions: [
      {
        id: "bites",
        kind: "attack",
        attack: "melee",
        toHit: 2,
        reachFt: 5,
        damage: [{ dice: "2d4", damageType: "piercing" }],
      },
    ],
    source: "SRD",
  },
];
