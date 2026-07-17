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
  if (level >= 10) return 6;
  if (level >= 4) return 5;
  return 4;
}

function spellsKnown(level: number): number {
  // 2024 PHB Sorcerer "Prepared Spells" column
  const table = [
    2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22,
  ];
  return table[level - 1] ?? 22;
}

function sorceryPoints(level: number): number {
  return level >= 2 ? level : 0;
}

function metamagicKnown(level: number): number {
  if (level < 2) return 0;
  if (level < 10) return 2;
  if (level < 17) return 4;
  return 6;
}

export const SORCERER_TABLE: SrdClassTable = {
  id: "sorcerer",
  hitDie: 6,
  primaryAbility: ["CHA"],
  savingThrows: ["CON", "CHA"],
  armorProficiencies: [],
  weaponProficiencies: [asProficiencyToken("simple-weapons")],
  skillChoices: {
    count: 2,
    from: ["Arcana", "Deception", "Insight", "Intimidation", "Persuasion", "Religion"],
  },
  // 2024 RAW (sorcerer:main): Choose A or B — (A) Spear, 2 Daggers, Arcane
  // Focus (crystal), Dungeoneer's Pack, and 28 GP; or (B) 50 GP. (2014 led with
  // a Light Crossbow; the "crystal" form is cosmetic — modelled as arcane-focus.)
  startingEquipment: [
    {
      label: "A",
      items: [
        { srdId: "spear" },
        { srdId: "dagger", quantity: 2 },
        { srdId: "arcane-focus" },
        { srdId: "dungeoneers-pack" },
      ],
      gold: 28,
    },
    { label: "B", items: [], gold: 50 },
  ],
  spellcasting: { ability: "CHA", preparedCaster: true },
  canSwapSpell: true,
  subclassLevel: 3,
  // Spellfire Sorcery grants always-prepared subclass spells at these levels.
  subclassSpellLevels: [3, 5, 7, 9],
  subclasses: [
    {
      id: "draconic-sorcery",
      featureIds: [
        "sorcerer-draconic-sorcery-resilience",
        "sorcerer-draconic-sorcery-spells",
        "sorcerer-draconic-sorcery-elemental-affinity",
        "sorcerer-draconic-sorcery-dragon-wings",
        "sorcerer-draconic-sorcery-dragon-companion",
      ],
      // H7 — Draconic Sorcery / Draconic Spells (2024 PHB). Verified
      // against http://dnd2024.wikidot.com/sorcerer:draconic-sorcery.
      expandedSpells: {
        3: ["alter-self", "chromatic-orb", "command", "dragons-breath"],
        5: ["fear", "fly"],
        7: ["arcane-eye", "charm-monster"],
        9: ["legend-lore", "summon-dragon"],
      },
    },
  ],
  levels: Array.from({ length: 20 }, (_, i) => {
    const level = i + 1;
    const featureIds: string[] = [];
    if (level === 1) featureIds.push("sorcerer-spellcasting", "sorcerer-innate-sorcery");
    if (level === 2) featureIds.push("sorcerer-font-of-magic", "sorcerer-metamagic");
    if (level === 4 || level === 8 || level === 12 || level === 16)
      featureIds.push("sorcerer-asi");
    if (level === 19) featureIds.push("sorcerer-epic-boon");
    if (level === 5) featureIds.push("sorcerer-sorcerous-restoration");
    if (level === 7) featureIds.push("sorcerer-sorcery-incarnate");
    if (level === 20) featureIds.push("sorcerer-arcane-apotheosis");
    const entry: SrdClassLevel = {
      level,
      featureIds,
      proficiencyBonus: proficiencyBonus(level),
      cantripsKnown: cantrips(level),
      spellsKnown: spellsKnown(level),
      spellSlots: SPELL_SLOTS[i],
      classSpecific: {
        sorceryPoints: sorceryPoints(level),
        metamagicKnown: metamagicKnown(level),
      },
    };
    if (level === 4 || level === 8 || level === 12 || level === 16 || level === 19)
      entry.asi = true;
    return entry;
  }),
};

export const SORCERER_FEATURES: SrdClassFeatureData[] = [
  {
    // 2024: every class gains an Epic Boon feat at level 19 (not a 5th ASI).
    id: "sorcerer-epic-boon",
    class: "sorcerer",
    level: 19,
    source: "SRD",
  },
  {
    id: "sorcerer-spellcasting",
    class: "sorcerer",
    level: 1,
    source: "SRD",
  },
  {
    id: "sorcerer-innate-sorcery",
    class: "sorcerer",
    level: 1,
    // L11 — while Innate Sorcery is active: +1 Sorcerer spell save DC and
    // Advantage on Sorcerer spell attack rolls. Toggle "sorcerer-innate-sorcery".
    grants: [
      {
        type: "while-active",
        activeKey: "sorcerer-innate-sorcery",
        // 2024 RAW (sorcerer:main, Level 1): "you can unleash that magic for 1
        // minute". A FIXED timer — no per-turn maintenance, so the turn loop
        // never auto-prompts it (the player ends it when the minute lapses).
        duration: { kind: "timed", minutes: 1 },
        grants: [
          { type: "spell-save-dc-bonus", amount: 1, scope: "sorcerer" },
          {
            type: "advantage-on",
            rollType: "attack",
            vs: "sorcerer-spells",
          },
        ],
      },
    ],
    mechanics: {
      tracker: { total: "2", recovery: "long-rest" },
      actions: [
        {
          type: "bonus",
        },
      ],
    },
    source: "SRD",
  },
  {
    id: "sorcerer-font-of-magic",
    class: "sorcerer",
    level: 2,
    mechanics: {
      tracker: { total: "level", recovery: "long-rest", isPool: true, unit: "points" },
    },
    // PRIM-resource-conversion — 2024 RAW (sorcerer:main, L2 Font of Magic): the
    // two converters between the Sorcery-Points pool and spell slots.
    //   • Creating Spell Slots — spend SP per the cost table to make a slot
    //     (1→2 / 2→3 / 3→5 / 4→6 / 5→7 SP; min Sorcerer level 2/3/5/7/9; max
    //     slot level 5). The created slot vanishes on a Long Rest.
    //   • Converting Spell Slots — expend a spell slot to gain SP equal to its
    //     level (credited back to this pool tracker).
    // The cost-engine (`planResourceConversion`) plans the reversible ops;
    // override-first — never auto-converted.
    grants: [
      {
        type: "resource-conversion",
        conversionId: "font-creating-spell-slots",
        produces: "spell-slot",
        fromTracker: "sorcerer-font-of-magic",
        maxSlotLevel: 5,
        costTable: [
          { slotLevel: 1, cost: 2, minLevel: 2 },
          { slotLevel: 2, cost: 3, minLevel: 3 },
          { slotLevel: 3, cost: 5, minLevel: 5 },
          { slotLevel: 4, cost: 6, minLevel: 7 },
          { slotLevel: 5, cost: 7, minLevel: 9 },
        ],
      },
      {
        type: "resource-conversion",
        conversionId: "font-converting-spell-slots",
        produces: "sorcery-points",
        toTracker: "sorcerer-font-of-magic",
      },
    ],
    source: "SRD",
  },
  {
    id: "sorcerer-metamagic",
    class: "sorcerer",
    level: 2,
    source: "SRD",
  },
  {
    id: "sorcerer-asi",
    class: "sorcerer",
    level: 4,
    source: "SRD",
  },
  {
    id: "sorcerer-sorcerous-restoration",
    class: "sorcerer",
    level: 5,
    mechanics: {
      // 1 use per Long Rest, formula-derived label on the action so the player
      // sees how many points they can recover. The action carries no
      // costTracker on the sorcery-points pool — the player manually spends the
      // recovery (we never auto-modify resource pools without explicit input).
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
    id: "sorcerer-arcane-apotheosis",
    class: "sorcerer",
    level: 20,
    source: "SRD",
  },
  {
    id: "sorcerer-sorcery-incarnate",
    class: "sorcerer",
    level: 7,
    // The alternate-activation half is the new mechanic: it adds an alt-recovery
    // cost to the L1 Innate Sorcery tracker (a cross-feature grant — the clause
    // lives here at L7 but the tracker is `sorcerer-innate-sorcery`). The
    // smart-tracker consumer overlays this onto that tracker's `altRecoveryCost`.
    // Override-first: surfaced as "spend 2 Sorcery Points to activate", never
    // auto-deducted.
    grants: [
      {
        type: "tracker-alt-recovery",
        targetTracker: "sorcerer-innate-sorcery",
        amount: 2,
        fromTracker: "sorcerer-font-of-magic",
      },
    ],
    source: "SRD",
  },
  {
    id: "sorcerer-draconic-sorcery-resilience",
    class: "sorcerer",
    subclass: "draconic-sorcery",
    level: 3,
    grants: [
      // Declarative AC formula — same pattern as Barbarian / Monk
      // Unarmored Defense. Draconic Resilience allows shields (RAW
      // doesn't forbid them), so condition is "no-armor".
      {
        type: "ac-formula",
        base: 10,
        bonuses: ["DEX", "CHA"],
        condition: "no-armor",
      },
      // Per-level HP grant (+1 HP per Sorcerer level).
      { type: "hp-per-level", amount: 1 },
      // 2024 RAW (draconic-sorcery, Draconic Resilience): "Your Hit Point
      // maximum increases by 3, and it increases by 1 whenever you gain another
      // Sorcerer level." The +3 acquisition bonus is a one-shot flat HP grant
      // (the hp-flat grant kind exists precisely for this — it was previously a
      // manual note).
      { type: "hp-flat", amount: 3 },
    ],
    source: "SRD",
  },
  {
    id: "sorcerer-draconic-sorcery-spells",
    class: "sorcerer",
    subclass: "draconic-sorcery",
    level: 3,
    // Descriptive header for the subclass spell table — the always-prepared
    // spells themselves flow from the subclass's `expandedSpells` map above.
    source: "SRD",
  },
  {
    id: "sorcerer-draconic-sorcery-elemental-affinity",
    class: "sorcerer",
    subclass: "draconic-sorcery",
    level: 6,
    // Draconic Sorcery L6 (dnd2024.wikidot.com/sorcerer:draconic-sorcery):
    // pick ONE of five draconic damage types. Two effects on the chosen type:
    //   1. permanent Resistance to it (`damage-resistance`);
    //   2. when you cast a spell that deals that damage, add your CHA modifier
    //      to one of its damage rolls (`spell-damage-bonus`).
    // Modelled as a single-select `choice-grant-bundle` (same pattern as the
    // druid land-terrain selector) so the picked option lights up BOTH grants in
    // the aggregated read model: the resistance set + `spellDamageBonuses` (the
    // consumer `resolveSpellDamageBonus` resolves +CHA mod for spells whose
    // damage matches the chosen type).
    grants: [
      {
        type: "choice-grant-bundle",
        bundleKey: "sorcerer-draconic-elemental-affinity",
        options: [
          {
            id: "acid",
            grants: [
              { type: "damage-resistance", damageType: "acid" },
              {
                type: "spell-damage-bonus",
                damageTypes: ["acid"],
                ability: "CHA",
                value: "modifier",
                scope: "sorcerer",
              },
            ],
          },
          {
            id: "cold",
            grants: [
              { type: "damage-resistance", damageType: "cold" },
              {
                type: "spell-damage-bonus",
                damageTypes: ["cold"],
                ability: "CHA",
                value: "modifier",
                scope: "sorcerer",
              },
            ],
          },
          {
            id: "fire",
            grants: [
              { type: "damage-resistance", damageType: "fire" },
              {
                type: "spell-damage-bonus",
                damageTypes: ["fire"],
                ability: "CHA",
                value: "modifier",
                scope: "sorcerer",
              },
            ],
          },
          {
            id: "lightning",
            grants: [
              { type: "damage-resistance", damageType: "lightning" },
              {
                type: "spell-damage-bonus",
                damageTypes: ["lightning"],
                ability: "CHA",
                value: "modifier",
                scope: "sorcerer",
              },
            ],
          },
          {
            id: "poison",
            grants: [
              { type: "damage-resistance", damageType: "poison" },
              {
                type: "spell-damage-bonus",
                damageTypes: ["poison"],
                ability: "CHA",
                value: "modifier",
                scope: "sorcerer",
              },
            ],
          },
        ],
      },
    ],
    source: "SRD",
  },
  {
    id: "sorcerer-draconic-sorcery-dragon-wings",
    class: "sorcerer",
    subclass: "draconic-sorcery",
    level: 14,
    mechanics: {
      // Alt-recovery (RAW): restore the single use for 3 Sorcery Points instead
      // of waiting for a Long Rest. Override-first — surfaced, never auto-spent.
      tracker: {
        total: "1",
        recovery: "long-rest",
        altRecoveryCost: { amount: 3, fromTracker: "sorcerer-font-of-magic" },
      },
      actions: [
        {
          type: "bonus",
        },
      ],
    },
    // 2024 RAW (draconic-sorcery, Dragon Wings): a Fly Speed of 60 ft while the
    // wings are active. Modeled as a `while-active` block (same pattern as
    // Bladesong / Rage) so the flying speed appears in the aggregated movement
    // view only when the player toggles the wings on.
    grants: [
      {
        type: "while-active",
        activeKey: "sorcerer-draconic-sorcery-dragon-wings",
        grants: [{ type: "fly-speed", amount: 60 }],
      },
    ],
    source: "SRD",
  },
  {
    id: "sorcerer-draconic-sorcery-dragon-companion",
    class: "sorcerer",
    subclass: "draconic-sorcery",
    level: 18,
    // 2024 RAW (sorcerer:draconic-sorcery, Level 18: Dragon Companion): you always
    // have Summon Dragon prepared and can cast it once per Long Rest without a
    // slot. The 1/LR tracker is the existing `mechanics`; the spell link makes it
    // prepared + slotless-castable (single free-cast → debits this feature's own
    // 1/LR tracker).
    mechanics: {
      tracker: { total: "1", recovery: "long-rest" },
    },
    grants: [
      { type: "always-prepared-spell", spellId: "summon-dragon" },
      {
        type: "free-cast-spell",
        spellId: "summon-dragon",
        chargesPerRest: 1,
        rest: "long",
      },
    ],
    source: "SRD",
  },
];
