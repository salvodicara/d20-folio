import type { SrdClassTable, SrdClassFeatureData, SrdClassLevel } from "../types";
import { asProficiencyToken } from "@/lib/proficiency-tokens";
import { proficiencyBonus } from "@/lib/proficiency";

const SPELL_SLOTS: number[][] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

function cantrips(level: number): number {
  if (level >= 10) return 5;
  if (level >= 4) return 4;
  return 3;
}

// 2024 PHB Wizard "Prepared Spells" column
function preparedSpells(level: number): number {
  const table = [
    4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25,
  ];
  return table[level - 1] ?? 25;
}

export const WIZARD_TABLE: SrdClassTable = {
  id: "wizard",
  hitDie: 6,
  primaryAbility: ["INT"],
  savingThrows: ["INT", "WIS"],
  armorProficiencies: [],
  weaponProficiencies: [asProficiencyToken("simple-weapons")],
  skillChoices: {
    count: 2,
    from: [
      "Arcana",
      "History",
      "Insight",
      "Investigation",
      "Medicine",
      "Nature",
      "Religion",
    ],
  },
  // 2024 RAW (wizard:main): Choose A or B — (A) 2 Daggers, Arcane Focus
  // (Quarterstaff), Robe, Spellbook, Scholar's Pack, and 5 GP; or (B) 55 GP.
  // The Arcane Focus IS the quarterstaff form, so it is modelled as arcane-focus
  // only (no separate bare quarterstaff).
  startingEquipment: [
    {
      label: "A",
      items: [
        { srdId: "dagger", quantity: 2 },
        { srdId: "arcane-focus" },
        { srdId: "robe" },
        { srdId: "spellbook" },
        { srdId: "scholars-pack" },
      ],
      gold: 5,
    },
    { label: "B", items: [], gold: 55 },
  ],
  spellcasting: { ability: "INT", preparedCaster: true },
  subclassLevel: 3,
  subclasses: [
    {
      id: "evoker",
      featureIds: [
        "wizard-evoker-evocation-savant",
        "wizard-evoker-potent-cantrip",
        "wizard-evoker-sculpt-spells",
        "wizard-evoker-empowered-evocation",
        "wizard-evoker-overchannel",
      ],
    },
  ],
  levels: Array.from({ length: 20 }, (_, i) => {
    const level = i + 1;
    const featureIds: string[] = [];
    if (level === 1)
      featureIds.push(
        "wizard-spellcasting",
        "wizard-arcane-recovery",
        "wizard-ritual-adept"
      );
    if (level === 2) featureIds.push("wizard-scholar");
    if (level === 4 || level === 8 || level === 12 || level === 16)
      featureIds.push("wizard-asi");
    if (level === 19) featureIds.push("wizard-epic-boon");
    if (level === 5) featureIds.push("wizard-memorize-spell");
    if (level === 18) featureIds.push("wizard-spell-mastery");
    if (level === 20) featureIds.push("wizard-signature-spells");
    const entry: SrdClassLevel = {
      level,
      featureIds,
      proficiencyBonus: proficiencyBonus(level),
      cantripsKnown: cantrips(level),
      spellsKnown: preparedSpells(level),
      spellSlots: SPELL_SLOTS[i],
    };
    if (level === 4 || level === 8 || level === 12 || level === 16 || level === 19)
      entry.asi = true;
    return entry;
  }),
};

export const WIZARD_FEATURES: SrdClassFeatureData[] = [
  {
    // 2024: every class gains an Epic Boon feat at level 19 (not a 5th ASI).
    id: "wizard-epic-boon",
    class: "wizard",
    level: 19,
    source: "SRD",
  },
  {
    id: "wizard-spellcasting",
    class: "wizard",
    level: 1,
    source: "SRD",
  },
  {
    id: "wizard-ritual-adept",
    class: "wizard",
    level: 1,
    // 2024 RAW (wizard:main, Level 1: Ritual Adept): cast any Ritual-tag spell
    // from your spellbook as a Ritual without preparing it. The `ritual-casting-
    // any` grant lets the Spells page decorate every Wizard-list ritual spell
    // with a ritual-cast button.
    grants: [{ type: "ritual-casting-any", classSpellList: "wizard" }],
    source: "SRD",
  },
  {
    id: "wizard-arcane-recovery",
    class: "wizard",
    level: 1,
    mechanics: {
      // 1 use per Long Rest, same pattern as Sorcerous Restoration. The action
      // surfaces the cap formula ("up to ⌈level/2⌉ total slot-levels, no slot
      // above 5"); the player picks which slots to restore via the existing
      // spell-slot edit UI on the Spells page. We never auto-modify slot pools
      // without explicit input (golden rule 21 — show formulas, no auto-dice).
      tracker: { total: "1", recovery: "long-rest", unit: "use" },
      actions: [
        {
          type: "action",
        },
      ],
    },
    source: "SRD",
  },
  {
    id: "wizard-asi",
    class: "wizard",
    level: 4,
    source: "SRD",
  },
  {
    id: "wizard-memorize-spell",
    class: "wizard",
    level: 5,
    source: "SRD",
  },
  {
    id: "wizard-spell-mastery",
    class: "wizard",
    level: 18,
    source: "SRD",
  },
  {
    id: "wizard-signature-spells",
    class: "wizard",
    level: 20,
    // 2024 RAW (wizard:main, Level 20: Signature Spells): choose two 3rd-level
    // Wizard spells FROM YOUR SPELLBOOK that are always prepared and free-castable
    // (once each per Short/Long Rest, no slot). Already FULLY automated by the
    // DEDICATED `signature-spells-pick.ts` picker (spellbook-constrained, exact-3rd
    // floor) + the `wizardSignatureSpell` flag (always-prepared + combat-castable)
    // + THIS short-rest tracker as the free-cast pool — wired through the Level-Up
    // wizard. A generic `choice-spell` grant would DUPLICATE that picker with a
    // strictly-worse, unconstrained one (no spellbook gate) — forbidden by golden
    // rules 3/6/10 (one source of truth, no parallel mechanism). So NO grants[]
    // here by design; the tracker is the pool the dedicated picker debits.
    mechanics: {
      tracker: { total: "2", recovery: "short-rest" },
    },
    source: "SRD",
  },
  {
    id: "wizard-scholar",
    class: "wizard",
    level: 2,
    // 2024 RAW (wizard:main, Level 2: Scholar): Expertise in ONE of {Arcana,
    // History, Investigation, Medicine, Nature, Religion} you're proficient in.
    // `choice-expertise` (consumed by feat-expertise-choices.ts) offers every
    // proficient skill — it can't constrain to the six-skill pool, but the grant
    // kind is correct (the prior 2014 "school of magic" Arcana-expertise text
    // was wrong, and the feature carried no grant so no picker ever surfaced).
    grants: [{ type: "choice-expertise", amount: 1 }],
    source: "SRD",
  },
  {
    id: "wizard-evoker-evocation-savant",
    class: "wizard",
    subclass: "evoker",
    level: 3,
    // School-filtered spellbook additions — Evocation Wizard spells ≤ L2.
    // Verified against dnd2024.wikidot.com/wizard:evoker.
    grants: [
      {
        type: "choice-spell",
        classSpellList: "wizard",
        spellSchool: "evocation",
        maxLevel: 2,
        amount: 2,
        toSpellbook: true,
        recurringPerSpellLevel: "wizard",
      },
    ],
    source: "SRD",
  },
  {
    id: "wizard-evoker-potent-cantrip",
    class: "wizard",
    subclass: "evoker",
    level: 3,
    source: "SRD",
  },
  {
    id: "wizard-evoker-sculpt-spells",
    class: "wizard",
    subclass: "evoker",
    level: 6,
    source: "SRD",
  },
  {
    id: "wizard-evoker-empowered-evocation",
    class: "wizard",
    subclass: "evoker",
    level: 10,
    // +INT to one damage roll of a Wizard EVOCATION spell → `spell-damage-bonus`
    // scoped by `schools: ["evocation"]` (the smart-tracker appends it to the
    // damage chip of any evocation spell). Override-first; engine rolls no dice.
    grants: [
      {
        type: "spell-damage-bonus",
        damageTypes: [],
        ability: "INT",
        value: "modifier",
        scope: "wizard",
        schools: ["evocation"],
      },
    ],
    source: "SRD",
  },
  {
    id: "wizard-evoker-overchannel",
    class: "wizard",
    subclass: "evoker",
    level: 14,
    mechanics: {
      tracker: { total: "1", recovery: "long-rest" },
    },
    source: "SRD",
  },
];
