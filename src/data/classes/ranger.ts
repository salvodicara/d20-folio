import type { SrdClassTable, SrdClassFeatureData, SrdClassLevel } from "../types";
import { asProficiencyToken } from "@/lib/proficiency-tokens";
import { proficiencyBonus } from "@/lib/proficiency";

// 2024 RAW: the Ranger is a spellcaster from level 1 (the 2014 Ranger gained
// spellcasting at level 2). Index [level-1]; L1 has two level-1 slots.
const HALF_CASTER_SLOTS: number[][] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
];

export const RANGER_TABLE: SrdClassTable = {
  id: "ranger",
  hitDie: 10,
  primaryAbility: ["DEX", "WIS"],
  // #36 — 2024 multiclassing facts (dnd2024.wikidot.com <class>:main,
  // "As a Multiclass Character").
  multiclass: {
    weaponProficiencies: [asProficiencyToken("martial-weapons")],
    armorTraining: [
      asProficiencyToken("light-armor"),
      asProficiencyToken("medium-armor"),
      asProficiencyToken("shields"),
    ],
    skillChoice: { count: 1, fromClassList: true },
  },
  savingThrows: ["STR", "DEX"],
  armorProficiencies: [
    asProficiencyToken("light-armor"),
    asProficiencyToken("medium-armor"),
    asProficiencyToken("shields"),
  ],
  weaponProficiencies: [
    asProficiencyToken("simple-weapons"),
    asProficiencyToken("martial-weapons"),
  ],
  skillChoices: {
    count: 3,
    from: [
      "Animal Handling",
      "Athletics",
      "Insight",
      "Investigation",
      "Nature",
      "Perception",
      "Stealth",
      "Survival",
    ],
  },
  // 2024 RAW (ranger:main): Choose A or B — (A) Studded Leather Armor, Scimitar,
  // Shortsword, Longbow, 20 Arrows, Quiver, Druidic Focus (sprig of mistletoe),
  // Explorer's Pack, and 7 GP; or (B) 150 GP.
  startingEquipment: [
    {
      label: "A",
      items: [
        { srdId: "studded-leather-armor" },
        { srdId: "scimitar" },
        { srdId: "shortsword" },
        { srdId: "longbow" },
        { srdId: "arrows", quantity: 20 },
        { srdId: "quiver" },
        { srdId: "druidic-focus" },
        { srdId: "explorers-pack" },
      ],
      gold: 7,
    },
    { label: "B", items: [], gold: 150 },
  ],
  spellcasting: { ability: "WIS", preparedCaster: true },
  canSwapSpell: true,
  subclassLevel: 3,
  // 2024 Ranger subclass spells are PER-SUBCLASS, not class-wide: Fey Wanderer,
  // Gloom Stalker, and Winter Walker grant always-prepared spells at
  // 3/5/9/13/17 (modelled via each subclass's `expandedSpells` below), while
  // Hunter and Beast Master grant NONE. We therefore intentionally OMIT the class-wide
  // `subclassSpellLevels` field — setting it would make the level-up wizard
  // wrongly prompt "add your subclass bonus spells" for Hunter/Beast Master too.
  // The engine gates expanded-spell injection on each subclass's own
  // `expandedSpells` map (src/lib/expanded-spells.ts), so subclasses without it
  // grant nothing regardless of the class-wide field.
  subclasses: [
    {
      id: "hunter",
      featureIds: [
        "ranger-hunter-hunters-lore",
        "ranger-hunter-hunters-prey",
        "ranger-hunter-defensive-tactics",
        "ranger-hunter-superior-hunters-prey",
        "ranger-hunter-superior-hunters-defense",
      ],
    },
  ],
  levels: Array.from({ length: 20 }, (_, i) => {
    const level = i + 1;
    const featureIds: string[] = [];
    let asi = false;

    if (level === 1)
      featureIds.push(
        "ranger-favored-enemy",
        "ranger-weapon-mastery",
        "ranger-spellcasting"
      );
    if (level === 2) featureIds.push("ranger-deft-explorer", "ranger-fighting-style");
    if ([4, 8, 12, 16, 19].includes(level)) asi = true;
    if (level === 5) featureIds.push("ranger-extra-attack");
    if (level === 6) featureIds.push("ranger-roving");
    if (level === 9) featureIds.push("ranger-expertise");
    if (level === 10) featureIds.push("ranger-tireless");
    if (level === 13) featureIds.push("ranger-relentless-hunter");
    if (level === 14) featureIds.push("ranger-natures-veil");
    if (level === 17) featureIds.push("ranger-precise-hunter");
    if (level === 18) featureIds.push("ranger-feral-senses");
    if (level === 19) featureIds.push("ranger-epic-boon");
    if (level === 20) featureIds.push("ranger-foe-slayer");

    // 2024 PHB Ranger "Prepared Spells" column
    const PREPARED_SPELLS = [
      2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15,
    ];

    const entry: SrdClassLevel = {
      level,
      featureIds,
      proficiencyBonus: proficiencyBonus(level),
      spellsKnown: PREPARED_SPELLS[i],
      // 2024 RAW (ranger:main): Weapon Mastery grants 2 weapons with no scaling
      // column — a flat 2 at every level (the table is the single source of truth).
      classSpecific: { weaponMastery: 2 },
    };
    if (level >= 1) entry.spellSlots = HALF_CASTER_SLOTS[level - 1];
    if (asi) entry.asi = true;
    return entry;
  }),
};

export const RANGER_FEATURES: SrdClassFeatureData[] = [
  {
    // 2024: every class gains an Epic Boon feat at level 19 (not a 5th ASI).
    id: "ranger-epic-boon",
    class: "ranger",
    level: 19,
    source: "SRD",
  },
  {
    // 2024 RAW Ranger L1 Favored Enemy: "You always have the Hunter's Mark
    // spell prepared. You can cast it twice without expending a spell slot,
    // and you regain all expended uses when you finish a Long Rest." Higher
    // levels widen the slot-free cast count (see Ranger table). Surface the
    // always-prepared spell via the declarative grant so the spells page
    // injects it automatically + excludes it from the prepared count.
    id: "ranger-favored-enemy",
    class: "ranger",
    level: 1,
    mechanics: {
      // Slot-free casts of Hunter's Mark — the "Favored Enemy" column of the
      // 2024 Ranger table: 2 (L1-4), 3 (L5-8), 4 (L9-12), 5 (L13-16), 6 (L17+).
      tracker: {
        total: "2",
        recovery: "long-rest",
        levels: [
          { from: 5, total: "3" },
          { from: 9, total: "4" },
          { from: 13, total: "5" },
          { from: 17, total: "6" },
        ],
      },
    },
    grants: [{ type: "always-prepared-spell", spellId: "hunters-mark" }],
    source: "SRD",
  },
  {
    id: "ranger-deft-explorer",
    class: "ranger",
    level: 2,
    // 2024 RAW (ranger:main, Level 2: Deft Explorer): Expertise in one of your
    // skill proficiencies + two languages of your choice. (Roving at L6 and
    // Tireless at L10 are SEPARATE features — the prior description wrongly
    // folded them in and omitted the two-language clause entirely.) The
    // `choice-expertise` slot is consumed by feat-expertise-choices.ts and
    // `choice-language` by feat-language-choices.ts.
    grants: [
      { type: "choice-expertise", amount: 1 },
      { type: "choice-language", options: [], amount: 2 },
    ],
    source: "SRD",
  },
  {
    id: "ranger-weapon-mastery",
    class: "ranger",
    level: 1,
    source: "SRD",
  },
  {
    id: "ranger-spellcasting",
    class: "ranger",
    level: 1,
    source: "SRD",
  },
  {
    id: "ranger-fighting-style",
    class: "ranger",
    level: 2,
    source: "SRD",
  },
  {
    id: "ranger-extra-attack",
    class: "ranger",
    level: 5,
    grants: [{ type: "extra-attack", count: 1 }],
    source: "SRD",
  },
  {
    id: "ranger-roving",
    class: "ranger",
    level: 6,
    // The +10 ft is gated on NOT wearing Heavy Armor (ranger:main, Roving);
    // `effectiveWalkingSpeedFt` applies it only when no Heavy armor is equipped.
    grants: [
      { type: "speed", amount: 10, condition: "no-heavy-armor" },
      { type: "climb-speed", amount: "equal-to-walking" },
      { type: "swim-speed", amount: "equal-to-walking" },
    ],
    source: "SRD",
  },
  {
    id: "ranger-expertise",
    class: "ranger",
    level: 9,
    // 2024 RAW (ranger:main, Level 9: Expertise): two skills → Expertise. The
    // data-driven `choice-expertise` grant surfaces the picker (this feature was
    // previously not wired into EXPERTISE_FEATURE_IDS in expertise-pick.ts, so
    // no picker ever appeared); feat-expertise-choices.ts consumes it.
    grants: [{ type: "choice-expertise", amount: 2 }],
    source: "SRD",
  },
  {
    id: "ranger-tireless",
    class: "ranger",
    level: 10,
    mechanics: {
      tracker: { total: "WIS", recovery: "long-rest", die: "d8" },
      actions: [
        {
          type: "action",
        },
      ],
    },
    // Short-Rest Exhaustion recovery (ranger:main, Tireless): "Whenever you
    // finish a Short Rest, your Exhaustion level, if any, decreases by 1." RAW
    // removes Exhaustion only on a Long Rest, so this is a genuine extra channel.
    grants: [{ type: "exhaustion-recovery", amount: 1, recovery: "short-rest" }],
    source: "SRD",
  },
  {
    id: "ranger-relentless-hunter",
    class: "ranger",
    level: 13,
    source: "SRD",
  },
  {
    id: "ranger-natures-veil",
    class: "ranger",
    level: 14,
    mechanics: {
      tracker: { total: "WIS", recovery: "long-rest" },
      actions: [
        {
          type: "bonus",
        },
      ],
    },
    source: "SRD",
  },
  {
    id: "ranger-precise-hunter",
    class: "ranger",
    level: 17,
    // L1 — advantage chip: attacks against your Hunter's Mark target.
    grants: [
      {
        type: "advantage-on",
        rollType: "attack",
        vs: "hunters-mark-target",
      },
    ],
    source: "SRD",
  },
  {
    id: "ranger-feral-senses",
    class: "ranger",
    level: 18,
    // 2024 RAW (ranger:main, Level 18: Feral Senses): Blindsight 30 ft. Wired
    // through the `blindsight` grant so the sense aggregates into the senses
    // view (previously carried no grant).
    grants: [{ type: "blindsight", range: 30 }],
    source: "SRD",
  },
  {
    id: "ranger-foe-slayer",
    class: "ranger",
    level: 20,
    // 2024 RAW (ranger:main, L20 Foe Slayer): "The damage die of your Hunter's
    // Mark is a d10 rather than a d6." PRIM-spell-die-augment re-sizes the
    // spell's printed `damageDice` (1d6 → 1d10) at render — the engine rolls no
    // dice. Override-first.
    grants: [
      { type: "spell-die-augment", spellId: "hunters-mark", fromDie: 6, toDie: 10 },
    ],
    source: "SRD",
  },
  // Hunter subclass — 2024 PHB (verified http://dnd2024.wikidot.com/ranger:hunter).
  // The 2014 option-sets (Giant Killer / Steel Will / Volley & Whirlwind
  // "Multiattack") were removed in 2024. The new structure is:
  //   L3 Hunter's Lore (always-on) + Hunter's Prey (choose Colossus Slayer OR
  //   Horde Breaker), L7 Defensive Tactics (choose Escape the Horde OR
  //   Multiattack Defense), L11 Superior Hunter's Prey (REPLACES the stale
  //   Multiattack), L15 Superior Hunter's Defense.
  {
    id: "ranger-hunter-hunters-lore",
    class: "ranger",
    subclass: "hunter",
    level: 3,
    // Informational reveal only — no aggregatable mechanic (no grant kind models
    // "know a creature's defenses"). Descriptive, like Beast Master's companion.
    source: "SRD",
  },
  {
    id: "ranger-hunter-hunters-prey",
    class: "ranger",
    subclass: "hunter",
    level: 3,
    // RAW lets you swap the chosen option on any Short/Long Rest, so the
    // re-selectable `choice-grant-bundle` (not a one-time pick) is the right
    // primitive. Colossus Slayer surfaces as a once-per-turn weapon-typed
    // damage rider; Horde Breaker is an extra-attack granted action.
    grants: [
      {
        type: "choice-grant-bundle",
        bundleKey: "ranger-hunter-prey",
        options: [
          {
            id: "colossus-slayer",
            grants: [
              {
                type: "damage-rider",
                dice: "1d8",
                damageType: "same-as-weapon",
                appliesTo: "weapon",
                oncePerTurn: true,
              },
            ],
          },
          {
            id: "horde-breaker",
            grants: [
              {
                id: "horde-breaker",
                type: "granted-action",
                slot: "free",
              },
            ],
          },
        ],
      },
    ],
    source: "SRD",
  },
  {
    id: "ranger-hunter-defensive-tactics",
    class: "ranger",
    subclass: "hunter",
    level: 7,
    // Escape the Horde surfaces as a disadvantage clause on enemies' Opportunity
    // Attacks; Multiattack Defense is a conditional/triggered effect carried as a
    // granted-action chip (no per-attacker disadvantage-tracking grant kind).
    grants: [
      {
        type: "choice-grant-bundle",
        bundleKey: "ranger-hunter-defensive-tactics",
        options: [
          {
            id: "escape-the-horde",
            grants: [
              {
                type: "disadvantage-on",
                rollType: "attack",
                vs: "opportunity-attacks-against-you",
              },
            ],
          },
          {
            id: "multiattack-defense",
            grants: [
              {
                id: "multiattack-defense",
                type: "granted-action",
                slot: "free",
              },
            ],
          },
        ],
      },
    ],
    source: "SRD",
  },
  {
    id: "ranger-hunter-superior-hunters-prey",
    class: "ranger",
    subclass: "hunter",
    level: 11,
    // Conditional cleave of the Hunter's Mark bonus die — no numeric grant kind
    // models "copy this turn's Hunter's Mark damage to a second creature", so it
    // stays a descriptive feature (REPLACES the removed 2014 Volley/Whirlwind
    // "Multiattack" at this level).
    source: "SRD",
  },
  {
    id: "ranger-hunter-superior-hunters-defense",
    class: "ranger",
    subclass: "hunter",
    level: 15,
    // Reaction-granted, situational damage Resistance to an arbitrary incoming
    // type — surfaced as a Reaction action chip (Resistance is to whatever type
    // hit you, not a fixed `damage-resistance` grant).
    // PROSE-SWEPT 2026-06-10 — `granted-action` grants have no live UI consumer
    // (dormant); the combat row comes from `mechanics.actions`, added here.
    grants: [
      {
        id: "superior-hunters-defense",
        type: "granted-action",
        slot: "reaction",
      },
    ],
    mechanics: { actions: [{ type: "reaction", trigger: "takeDamage" }] },
    source: "SRD",
  },
];
