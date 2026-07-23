/**
 * SRD 5.2.1 monster corpus — the a–b tranche (ids beginning a–b).
 * IDs + numbers ONLY; every display string lives in the lazy `monster`
 * catalogue (`src/i18n/{en,it}/srd/monsters.json`). Cite "SRD 5.2.1" in a
 * per-entry source comment — never the book title, never an excluded creature.
 */
import type { MonsterStatBlock } from "@/data/types";

export const SRD_MONSTERS_A_B: ReadonlyArray<MonsterStatBlock> = [
  // Adult Red Dragon (2024 SRD 5.2.1). AC 19, HP 256, CR 17.
  {
    id: "adult-red-dragon",
    cr: 17,
    sizes: ["Huge"],
    type: "dragon",
    typeTags: ["chromatic"],
    alignment: "chaotic-evil",
    ac: 19,
    initiative: 12,
    hp: { average: 256, formula: "19d12+133" },
    speeds: { walk: 40, climb: 40, fly: 80 },
    abilityScores: { STR: 27, DEX: 10, CON: 25, INT: 16, WIS: 13, CHA: 23 },
    saveProficiencies: ["DEX", "WIS"],
    skills: [{ skill: "perception", expertise: true }, { skill: "stealth" }],
    damageImmunities: ["fire"],
    senses: { blindsightFt: 60, darkvisionFt: 120 },
    languages: { ids: ["common", "draconic"] },
    xpInLair: 20000,
    traits: [{ id: "legendary-resistance", kind: "narrative" }],
    actions: [
      { id: "multiattack", kind: "narrative" },
      {
        id: "rend",
        kind: "attack",
        attack: "melee",
        toHit: 14,
        reachFt: 10,
        damage: [
          { dice: "1d10+8", damageType: "slashing" },
          { dice: "2d4", damageType: "fire" },
        ],
      },
      {
        id: "fire-breath",
        kind: "save",
        save: "DEX",
        dc: 21,
        recharge: 5,
        damage: [{ dice: "17d6", damageType: "fire" }],
        onSuccess: "half",
      },
      {
        id: "spellcasting",
        kind: "spellcasting",
        ability: "CHA",
        dc: 20,
        toHit: 12,
        atWill: ["command", "detect-magic", "scorching-ray"],
        perDay: [{ count: 1, spellIds: ["fireball"] }],
      },
    ],
    legendary: { uses: 3, usesInLair: 4 },
    legendaryActions: [
      { id: "commanding-presence", kind: "narrative" },
      { id: "fiery-rays", kind: "narrative" },
      { id: "pounce", kind: "narrative" },
    ],
    source: "SRD",
  },
  // Brown Bear (2024 SRD 5.2.1). AC 11, HP 22, CR 1.
  {
    id: "brown-bear",
    cr: 1,
    sizes: ["Large"],
    type: "beast",
    alignment: "unaligned",
    ac: 11,
    hp: { average: 22, formula: "3d10+6" },
    speeds: { walk: 40, climb: 30 },
    abilityScores: { STR: 17, DEX: 12, CON: 15, INT: 2, WIS: 13, CHA: 7 },
    skills: [{ skill: "perception" }],
    senses: { darkvisionFt: 60 },
    actions: [
      { id: "multiattack", kind: "narrative" },
      {
        id: "bite",
        kind: "attack",
        attack: "melee",
        toHit: 5,
        reachFt: 5,
        damage: [{ dice: "1d8+3", damageType: "piercing" }],
      },
      {
        id: "claw",
        kind: "attack",
        attack: "melee",
        toHit: 5,
        reachFt: 5,
        damage: [{ dice: "1d4+3", damageType: "slashing" }],
      },
    ],
    source: "SRD",
  },
];
