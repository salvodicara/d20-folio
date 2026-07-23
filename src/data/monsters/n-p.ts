/**
 * SRD 5.2.1 monster corpus — the n–p tranche (ids beginning n–p).
 * IDs + numbers ONLY; every display string lives in the lazy `monster`
 * catalogue (`src/i18n/{en,it}/srd/monsters.json`). Cite "SRD 5.2.1" in a
 * per-entry source comment — never the book title, never an excluded creature.
 */
import type { MonsterStatBlock } from "@/data/types";

export const SRD_MONSTERS_N_P: ReadonlyArray<MonsterStatBlock> = [
  // Priest (2024 SRD 5.2.1). AC 13, HP 38, CR 2.
  {
    id: "priest",
    cr: 2,
    sizes: ["Medium", "Small"],
    type: "humanoid",
    typeTags: ["cleric"],
    alignment: "neutral",
    ac: 13,
    hp: { average: 38, formula: "7d8+7" },
    speeds: { walk: 30 },
    abilityScores: { STR: 16, DEX: 10, CON: 12, INT: 13, WIS: 16, CHA: 13 },
    skills: [
      { skill: "medicine", expertise: true },
      { skill: "perception" },
      { skill: "religion", expertise: true },
    ],
    languages: { ids: ["common"], plusAnyCount: 1 },
    gear: [{ id: "chain-shirt" }, { id: "holy-symbol" }, { id: "mace" }],
    actions: [
      { id: "multiattack", kind: "narrative" },
      {
        id: "mace",
        kind: "attack",
        attack: "melee",
        toHit: 5,
        reachFt: 5,
        damage: [
          { dice: "1d6+3", damageType: "bludgeoning" },
          { dice: "2d4", damageType: "radiant" },
        ],
      },
      {
        id: "radiant-flame",
        kind: "attack",
        attack: "ranged",
        toHit: 5,
        rangeFt: { near: 60 },
        damage: [{ dice: "2d10", damageType: "radiant" }],
      },
      {
        id: "spellcasting",
        kind: "spellcasting",
        ability: "WIS",
        dc: 13,
        atWill: ["light", "thaumaturgy"],
        perDay: [{ count: 1, spellIds: ["spirit-guardians"] }],
      },
    ],
    bonusActions: [
      { id: "divine-aid", kind: "narrative", uses: { count: 3, per: "day" } },
    ],
    source: "SRD",
  },
];
