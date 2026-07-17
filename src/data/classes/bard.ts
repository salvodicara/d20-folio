import type { SrdClassTable, SrdClassFeatureData, SrdClassLevel } from "../types";
import { asProficiencyToken } from "@/lib/proficiency-tokens";
import { MUSICAL_INSTRUMENT_IDS } from "@/lib/tools";
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
  if (level >= 10) return 4;
  if (level >= 4) return 3;
  return 2;
}

function inspirationDie(level: number): string {
  if (level >= 15) return "d12";
  if (level >= 10) return "d10";
  if (level >= 5) return "d8";
  return "d6";
}

function preparedSpells(level: number): number {
  // 2024 PHB Bard "Prepared Spells" column
  const table = [
    4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22,
  ];
  return table[level - 1] ?? 22;
}

export const BARD_TABLE: SrdClassTable = {
  id: "bard",
  hitDie: 8,
  primaryAbility: ["CHA"],
  // #36 — 2024 multiclassing facts (dnd2024.wikidot.com <class>:main,
  // "As a Multiclass Character").
  multiclass: {
    armorTraining: [asProficiencyToken("light-armor")],
    toolProficiencies: ["musical-instrument"],
    skillChoice: { count: 1 },
  },
  savingThrows: ["DEX", "CHA"],
  armorProficiencies: [asProficiencyToken("light-armor")],
  // 2024 RAW (bard:main, Core Bard Traits): Simple weapons only. The four martial
  // additions (hand crossbows, longswords, rapiers, shortswords) were the 2014 list.
  weaponProficiencies: [asProficiencyToken("simple-weapons")],
  skillChoices: {
    count: 3,
    from: [
      "Acrobatics",
      "Animal Handling",
      "Arcana",
      "Athletics",
      "Deception",
      "History",
      "Insight",
      "Intimidation",
      "Investigation",
      "Medicine",
      "Nature",
      "Perception",
      "Performance",
      "Persuasion",
      "Religion",
      "Sleight of Hand",
      "Stealth",
      "Survival",
    ],
  },
  // 2024 RAW (bard:main) Tool Proficiencies: "Choose 3 Musical Instruments."
  // A level-1 `choice-tool-proficiency` grant (amount 3) so the proficiencies
  // are DERIVED + surfaced as a creation pick. The Option-A pack item ("a
  // Musical Instrument of your choice", a SINGLE instrument) resolves against
  // this same grant via the `fromToolChoice` marker — so the pack shows the
  // player's actual chosen instrument, not a generic umbrella.
  grants: [
    {
      type: "choice-tool-proficiency",
      options: [...MUSICAL_INSTRUMENT_IDS],
      amount: 3,
    },
  ],
  // 2024 RAW (bard:main): Choose A or B — (A) Leather Armor, 2 Daggers, a
  // Musical Instrument of your choice, Entertainer's Pack, and 19 GP; or
  // (B) 90 GP. (The 2014 rapier is now non-proficient — Bards are
  // Simple-weapons-only in 2024.) The "Musical Instrument of your choice" is the
  // `fromToolChoice` marker — ONE physical instrument (default quantity 1),
  // though the proficiency choice above is amount-3; it resolves to the first
  // chosen instrument, with a localized placeholder before a pick.
  startingEquipment: [
    {
      label: "A",
      items: [
        { srdId: "leather-armor" },
        { srdId: "dagger", quantity: 2 },
        { fromToolChoice: true },
        { srdId: "entertainers-pack" },
      ],
      gold: 19,
    },
    { label: "B", items: [], gold: 90 },
  ],
  spellcasting: { ability: "CHA", preparedCaster: true },
  canSwapSpell: true,
  subclassLevel: 3,
  subclasses: [
    {
      id: "college-of-lore",
      featureIds: [
        "bard-lore-bonus-proficiencies",
        "bard-lore-cutting-words",
        "bard-lore-additional-magical-secrets",
        "bard-lore-peerless-skill",
      ],
    },
  ],
  levels: Array.from({ length: 20 }, (_, i) => {
    const level = i + 1;
    const featureIds: string[] = [];
    // The base class `levels[]` table is subclass-AGNOSTIC (W10, golden rule 10):
    // it lists ONLY base Bard features. Subclass features (College of Lore et al.)
    // come from their own `f.subclass`-tagged rows, surfaced by `getFeaturesAtLevel`
    // + the subclass filter in level-up — never hardcoded here (a `bard-lore-*` id in
    // this table mis-describes the progression and is a trap). Guarded by
    // `base-levels-no-subclass.guard.test.ts`.
    if (level === 1) featureIds.push("bard-spellcasting", "bard-bardic-inspiration");
    if (level === 2) featureIds.push("bard-jack-of-all-trades", "bard-expertise");
    if (level === 4 || level === 8 || level === 12 || level === 16)
      featureIds.push("bard-asi");
    if (level === 19) featureIds.push("bard-epic-boon");
    if (level === 5) featureIds.push("bard-font-of-inspiration");
    if (level === 7) featureIds.push("bard-countercharm");
    if (level === 9) featureIds.push("bard-expertise");
    if (level === 10) featureIds.push("bard-magical-secrets");
    if (level === 18) featureIds.push("bard-superior-inspiration");
    if (level === 20) featureIds.push("bard-words-of-creation");
    const entry: SrdClassLevel = {
      level,
      featureIds,
      proficiencyBonus: proficiencyBonus(level),
      cantripsKnown: cantrips(level),
      spellsKnown: preparedSpells(level),
      spellSlots: SPELL_SLOTS[i],
      classSpecific: {
        bardicInspirationDie: inspirationDie(level),
        bardicInspirationUses: "CHA",
      },
    };
    if (level === 4 || level === 8 || level === 12 || level === 16 || level === 19)
      entry.asi = true;
    return entry;
  }),
};

export const BARD_FEATURES: SrdClassFeatureData[] = [
  {
    // 2024: every class gains an Epic Boon feat at level 19 (not a 5th ASI).
    id: "bard-epic-boon",
    class: "bard",
    level: 19,
    source: "SRD",
  },
  {
    id: "bard-spellcasting",
    class: "bard",
    level: 1,
    source: "SRD",
  },
  {
    id: "bard-bardic-inspiration",
    class: "bard",
    level: 1,
    mechanics: {
      tracker: {
        total: "CHA",
        recovery: "long-rest",
        die: "d6",
        levels: [
          { from: 5, recovery: "short-rest", die: "d8" },
          { from: 10, die: "d10" },
          { from: 15, die: "d12" },
        ],
      },
      actions: [
        {
          type: "bonus",
        },
      ],
    },
    source: "SRD",
  },
  {
    id: "bard-jack-of-all-trades",
    class: "bard",
    level: 2,
    // Half-proficiency in every skill the Bard isn't otherwise proficient in —
    // DERIVED through `evaluateGrants` → `mergeSkillProficiencies`, never baked
    // into stored `skills` (#57), so it disappears the instant the feature does.
    grants: [{ type: "half-proficiency-all-skills" }],
    source: "SRD",
  },
  {
    id: "bard-expertise",
    class: "bard",
    level: 2,
    source: "SRD",
  },
  {
    id: "bard-asi",
    class: "bard",
    level: 4,
    source: "SRD",
  },
  {
    id: "bard-font-of-inspiration",
    class: "bard",
    level: 5,
    // Two declarative effects of Font of Inspiration (verified against
    // dnd2024.wikidot.com/bard:main: "You now regain all your expended uses of
    // Bardic Inspiration when you finish a Short or Long Rest. In addition, you
    // can expend a spell slot (no action required) to regain one expended use
    // of Bardic Inspiration."):
    //   (1) the Short-OR-Long-Rest recovery is already modeled on the L1
    //       Bardic Inspiration tracker (`levels: [{ from: 5, recovery:
    //       "short-rest", ... }]` — short-rest covers "short or long", since a
    //       long rest is a superset), so it is NOT re-declared here;
    //   (2) the spell-slot → tracker-use conversion is the gap this grant
    //       closes — `getSpellSlotTrackerRecovery` consumes it.
    grants: [
      {
        type: "spell-slot-tracker-recovery",
        trackerId: "bard-bardic-inspiration",
        usesPerSlot: 1,
      },
    ],
    source: "SRD",
  },
  {
    id: "bard-countercharm",
    class: "bard",
    level: 7,
    mechanics: {
      actions: [
        {
          type: "reaction",
          trigger: "allyFailsSave",
        },
      ],
    },
    source: "SRD",
  },
  {
    id: "bard-magical-secrets",
    class: "bard",
    level: 10,
    // choice-spell-multi-list: from L10, the Bard's prepared-spell picks may
    // draw from the UNION Bard ∪ Cleric ∪ Druid ∪ Wizard (not just Bard).
    // `amount: 0` — this widens the existing prepared-spell pool rather than
    // adding fixed extra spells; the level-up spell picker reads the union to
    // offer cross-list picks. maxLevel 9 = the Bard's eventual ceiling (the
    // picker still gates on the character's actual castable level).
    grants: [
      {
        type: "choice-spell",
        classSpellLists: ["bard", "cleric", "druid", "wizard"],
        maxLevel: 9,
        amount: 0,
      },
    ],
    source: "SRD",
  },
  {
    id: "bard-superior-inspiration",
    class: "bard",
    level: 18,
    // 2024 Superior Inspiration (bard:main): "When you roll Initiative, you
    // regain expended uses of Bardic Inspiration until you have two if you have
    // fewer than that." Modeled as an initiative-trigger top-up of the shared
    // Bardic Inspiration tracker to a floor of 2. (The 2014 version regained
    // only one — corrected here.)
    grants: [
      { type: "initiative-tracker-topup", trackerId: "bard-bardic-inspiration", upTo: 2 },
    ],
    source: "SRD",
  },
  {
    id: "bard-words-of-creation",
    class: "bard",
    level: 20,
    grants: [
      { type: "always-prepared-spell", spellId: "power-word-heal" },
      { type: "always-prepared-spell", spellId: "power-word-kill" },
    ],
    source: "SRD",
  },
  {
    id: "bard-lore-bonus-proficiencies",
    class: "bard",
    subclass: "college-of-lore",
    level: 3,
    source: "SRD",
    // L3 — "three skills of your choice" surfaces via the unified choice
    // engine the moment the player picks College of Lore at level-up.
    grants: [{ type: "choice-skill-proficiency", options: [], amount: 3 }],
  },
  {
    id: "bard-lore-cutting-words",
    class: "bard",
    subclass: "college-of-lore",
    level: 3,
    mechanics: {
      actions: [
        {
          type: "reaction",
          costTracker: "bard-bardic-inspiration",
        },
      ],
    },
    source: "SRD",
  },
  {
    // 2024 name is "Magical Discoveries" (the 2014 "Additional Magical
    // Secrets" is retired). Id kept stable to avoid breaking saved characters.
    id: "bard-lore-additional-magical-secrets",
    class: "bard",
    subclass: "college-of-lore",
    level: 6,
    // choice-spell-multi-list: two always-prepared picks from the UNION
    // Cleric ∪ Druid ∪ Wizard. `applySpellChoicePicks` stamps each pick
    // alwaysPrepared: true, so they sit OUTSIDE the prepared-spell budget,
    // matching "you always have the chosen spells prepared".
    grants: [
      {
        type: "choice-spell",
        classSpellLists: ["cleric", "druid", "wizard"],
        maxLevel: 9,
        amount: 2,
      },
    ],
    source: "SRD",
  },
  {
    id: "bard-lore-peerless-skill",
    class: "bard",
    subclass: "college-of-lore",
    level: 14,
    // 2024 RAW (bard:college-of-lore, Level 14: Peerless Skill): when you make an
    // ability check (or attack roll), you can expend one use of Bardic Inspiration
    // and add the rolled die to the d20. Modeled like Cutting Words — a reaction
    // that debits the Bardic Inspiration tracker.
    // ponytail/NOTE: RAW's "if the roll still fails, the use is not expended" is a
    // play-time conditional `costTracker` does not model (the player un-spends on a
    // failed roll). Not over-engineered — the action + spend are the automated core.
    mechanics: {
      actions: [
        {
          type: "reaction",
          costTracker: "bard-bardic-inspiration",
        },
      ],
    },
    source: "SRD",
  },
];
