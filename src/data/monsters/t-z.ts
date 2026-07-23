/**
 * SRD 5.2.1 monster corpus — the t–z tranche (ids beginning t–z).
 * IDs + numbers ONLY; every display string lives in the lazy `monster`
 * catalogue (`src/i18n/{en,it}/srd/monsters.json`). Cite "SRD 5.2.1" in a
 * per-entry source comment — never the book title, never an excluded creature.
 */
import type { MonsterStatBlock } from "@/data/types";

export const SRD_MONSTERS_T_Z: ReadonlyArray<MonsterStatBlock> = [
  // Young Red Dragon (2024 SRD 5.2.1). AC 18, HP 178, CR 10.
  {
    id: "young-red-dragon",
    cr: 10,
    sizes: ["Large"],
    type: "dragon",
    typeTags: ["chromatic"],
    alignment: "chaotic-evil",
    ac: 18,
    initiative: 4,
    hp: { average: 178, formula: "17d10+85" },
    speeds: { walk: 40, climb: 40, fly: 80 },
    abilityScores: { STR: 23, DEX: 10, CON: 21, INT: 14, WIS: 11, CHA: 19 },
    saveProficiencies: ["DEX", "WIS"],
    skills: [{ skill: "perception", expertise: true }, { skill: "stealth" }],
    damageImmunities: ["fire"],
    senses: { blindsightFt: 30, darkvisionFt: 120 },
    languages: { ids: ["common", "draconic"] },
    actions: [
      { id: "multiattack", kind: "narrative" },
      {
        id: "rend",
        kind: "attack",
        attack: "melee",
        toHit: 10,
        reachFt: 10,
        damage: [
          { dice: "2d6+6", damageType: "slashing" },
          { dice: "1d6", damageType: "fire" },
        ],
      },
      {
        id: "fire-breath",
        kind: "save",
        save: "DEX",
        dc: 17,
        recharge: 5,
        damage: [{ dice: "16d6", damageType: "fire" }],
        onSuccess: "half",
      },
    ],
    source: "SRD",
  },
  // Zombie (2024 SRD 5.2.1). AC 8, HP 15, CR 1/4.
  {
    id: "zombie",
    cr: 0.25,
    sizes: ["Medium"],
    type: "undead",
    alignment: "neutral-evil",
    ac: 8,
    hp: { average: 15, formula: "2d8+6" },
    speeds: { walk: 20 },
    abilityScores: { STR: 13, DEX: 6, CON: 16, INT: 3, WIS: 6, CHA: 5 },
    saveProficiencies: ["WIS"],
    damageImmunities: ["poison"],
    conditionImmunities: ["exhaustion", "poisoned"],
    senses: { darkvisionFt: 60 },
    languages: { ids: ["common"], understandsOnly: true, plusAnyCount: 1 },
    traits: [{ id: "undead-fortitude", kind: "narrative" }],
    actions: [
      {
        id: "slam",
        kind: "attack",
        attack: "melee",
        toHit: 3,
        reachFt: 5,
        damage: [{ dice: "1d8+1", damageType: "bludgeoning" }],
      },
    ],
    source: "SRD",
  },
];
