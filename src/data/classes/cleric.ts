import type { SrdClassTable, SrdClassFeatureData, SrdClassLevel } from "../types";
import { asProficiencyToken } from "@/lib/proficiency-tokens";
import { proficiencyBonus } from "@/lib/proficiency";

const FULL_CASTER_SLOTS: number[][] = [
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

export const CLERIC_TABLE: SrdClassTable = {
  id: "cleric",
  hitDie: 8,
  primaryAbility: ["WIS"],
  // #36 — 2024 multiclassing facts (dnd2024.wikidot.com <class>:main,
  // "As a Multiclass Character").
  multiclass: {
    armorTraining: [
      asProficiencyToken("light-armor"),
      asProficiencyToken("medium-armor"),
      asProficiencyToken("shields"),
    ],
  },
  savingThrows: ["WIS", "CHA"],
  armorProficiencies: [
    asProficiencyToken("light-armor"),
    asProficiencyToken("medium-armor"),
    asProficiencyToken("shields"),
  ],
  weaponProficiencies: [asProficiencyToken("simple-weapons")],
  skillChoices: {
    count: 2,
    from: ["History", "Insight", "Medicine", "Persuasion", "Religion"],
  },
  // 2024 RAW (cleric:main): Choose A or B — (A) Chain Shirt, Shield, Mace,
  // Holy Symbol, Priest's Pack, and 7 GP; or (B) 110 GP.
  startingEquipment: [
    {
      label: "A",
      items: [
        { srdId: "chain-shirt" },
        { srdId: "shield" },
        { srdId: "mace" },
        { srdId: "holy-symbol" },
        { srdId: "priests-pack" },
      ],
      gold: 7,
    },
    { label: "B", items: [], gold: 110 },
  ],
  spellcasting: { ability: "WIS", preparedCaster: true },
  subclassLevel: 3,
  subclassSpellLevels: [3, 5, 7, 9],
  subclasses: [
    {
      id: "life-domain",
      featureIds: [
        "cleric-life-disciple-of-life",
        "cleric-life-preserve-life",
        "cleric-life-blessed-healer",
        "cleric-life-supreme-healing",
      ],
      // H7 — Life Domain expanded spells (2024 PHB). Player gets these as
      // always-prepared at the listed character level; the level-up
      // wizard injects them incrementally via injectExpandedSpells.
      // Life Domain spells — dnd2024.wikidot.com/cleric:life-domain (2024;
      // was the 2014 progression — L3 now grants all four L1/L2 domain spells).
      expandedSpells: {
        3: ["aid", "bless", "cure-wounds", "lesser-restoration"],
        5: ["mass-healing-word", "revivify"],
        7: ["aura-of-life", "death-ward"],
        9: ["greater-restoration", "mass-cure-wounds"],
      },
    },
  ],
  levels: Array.from({ length: 20 }, (_, i) => {
    const level = i + 1;
    const featureIds: string[] = [];
    let asi = false;

    // BASE-CLASS features only. Subclass (Domain) features are NEVER listed
    // here — each subclass feature row carries its own `class` + `subclass` +
    // `level`, and the two resolution seams gate purely on those:
    //   • level-up (`getFeaturesAtLevel` → `applyNewFeatures`) returns every
    //     subclass's features at the target level, then keeps only the ones
    //     whose `subclass` matches the character's chosen Domain;
    //   • feature derivation (`inferFeatures` / `buildGrantedFeatures`) iterates
    //     this array and skips any `featureData.subclass` that doesn't match the
    //     character's Domain.
    // So a Domain's features reach a character via its `subclass` slug alone —
    // listing Life ids here (the old behaviour) was inert redundancy that this
    // base function couldn't gate (it can't see the chosen subclass), so it has
    // been removed. Life features now flow through the same subclass-gated seam
    // as Knowledge/Light/Trickery/War (verified: dnd2024.wikidot.com/cleric:life-domain
    // — Disciple of Life & Preserve Life L3, Blessed Healer L6, Supreme Healing L17).
    if (level === 1) featureIds.push("cleric-spellcasting", "cleric-divine-order");
    if (level === 2)
      featureIds.push(
        "cleric-channel-divinity",
        "cleric-divine-spark",
        "cleric-turn-undead"
      );
    if ([4, 8, 12, 16, 19].includes(level)) asi = true;
    if (level === 5) featureIds.push("cleric-sear-undead");
    if (level === 7) featureIds.push("cleric-blessed-strikes");
    if (level === 10) featureIds.push("cleric-divine-intervention");
    // 2024 RAW (cleric:main): Improved Blessed Strikes is a LEVEL-14 feature;
    // L11 has no base-class feature. There is no "Improved Sear Undead".
    if (level === 14) featureIds.push("cleric-improved-blessed-strikes");
    if (level === 19) featureIds.push("cleric-epic-boon");
    if (level === 20) featureIds.push("cleric-improved-divine-intervention");

    const cantripsKnown = level >= 10 ? 5 : level >= 4 ? 4 : 3;
    // 2024 PHB Cleric "Prepared Spells" column
    const PREPARED_SPELLS = [
      4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22,
    ];

    const entry: SrdClassLevel = {
      level,
      featureIds,
      proficiencyBonus: proficiencyBonus(level),
      cantripsKnown,
      spellsKnown: PREPARED_SPELLS[i],
      spellSlots: FULL_CASTER_SLOTS[i],
      // Channel Divinity uses (2/3/4 at L2/L6/L18) live SOLELY in the
      // `cleric-channel-divinity` feature's tracker (below) — the single
      // source of truth. A `classSpecific.channelDivinityUses` value used to
      // be computed here too but was dead (off-by-one vs RAW) and unconsumed
      // by any reader; removed rather than corrected (M11).
    };
    if (asi) entry.asi = true;
    return entry;
  }),
};

export const CLERIC_FEATURES: SrdClassFeatureData[] = [
  {
    // 2024: every class gains an Epic Boon feat at level 19 (not a 5th ASI).
    id: "cleric-epic-boon",
    class: "cleric",
    level: 19,
    source: "SRD",
  },
  {
    id: "cleric-spellcasting",
    class: "cleric",
    level: 1,
    source: "SRD",
  },
  {
    id: "cleric-divine-order",
    class: "cleric",
    level: 1,
    // 2024 RAW (cleric:main, Level 1: Divine Order): a one-time pick between
    // Protector (Martial weapons + Heavy armor training) and Thaumaturge
    // (one extra Cleric cantrip cast with WIS + an Arcana/Religion check
    // bonus = WIS mod, min +1). Modeled as a `choice-grant-bundle` so the
    // selected role's grants light up; the extra cantrip surfaces as a
    // Cleric-list cantrip picker pinned to WIS.
    grants: [
      {
        type: "choice-grant-bundle",
        bundleKey: "cleric-divine-order",
        options: [
          {
            id: "protector",
            grants: [
              {
                type: "weapon-proficiency",
                proficiency: asProficiencyToken("martial-weapons"),
              },
              {
                type: "armor-proficiency",
                proficiency: asProficiencyToken("heavy-armor"),
              },
            ],
          },
          {
            id: "thaumaturge",
            grants: [
              {
                type: "choice-cantrip",
                classSpellList: "cleric",
                amount: 1,
                spellAbility: "WIS",
              },
              {
                type: "ability-check-bonus",
                appliesTo: "arcana",
                ability: "WIS",
                value: "modifier",
                min: 1,
              },
              {
                type: "ability-check-bonus",
                appliesTo: "religion",
                ability: "WIS",
                value: "modifier",
                min: 1,
              },
            ],
          },
        ],
      },
    ],
    source: "SRD",
  },
  {
    id: "cleric-channel-divinity",
    class: "cleric",
    level: 2,
    mechanics: {
      // 2024 RAW (PHB Cleric L2, verified against
      // http://dnd2024.wikidot.com/cleric:main): "You can use this class's
      // Channel Divinity TWICE. You regain ONE of its expended uses when
      // you finish a Short Rest, and you regain all expended uses when you
      // finish a Long Rest. You gain additional uses when you reach
      // certain Cleric levels, as shown in the Channel Divinity column of
      // the Cleric Features table." The table is L2=2, L6=3, L18=4.
      // Previous data had `total: 1` (off by 1 at every tier) and
      // `recovery: "short-rest"` (full recovery on short rest — also
      // wrong per RAW). Fixed to 2/3/4 with partial 1-on-short, all-on-long.
      tracker: {
        total: "2",
        recovery: "short-rest",
        shortRestRecovery: 1,
        levels: [
          { from: 6, total: "3" },
          { from: 18, total: "4" },
        ],
      },
      actions: [
        {
          type: "action",
        },
      ],
    },
    source: "SRD",
  },
  {
    // 2024 RAW (cleric:main, verified against
    // http://dnd2024.wikidot.com/cleric:main): Divine Spark is the SECOND
    // base Channel Divinity option ("You start with two such effects: Divine
    // Spark and Turn Undead"). Previously MISSING — only Turn Undead existed.
    id: "cleric-divine-spark",
    class: "cleric",
    level: 2,
    // S11 + S11b — Divine Spark (2024): roll Nd8 (1/2/3/4 d8 at Cleric 2/7/13/18)
    // and ADD your Wisdom modifier; you EITHER restore that total in Hit Points to
    // a creature OR force a CON save vs the Cleric spell save DC (8 + PB + WIS mod,
    // the `featureSaveDc` formula) for Necrotic OR Radiant (your choice) damage =
    // that total, half on a save. `addMod: "WIS"` folds +WIS into the rolled total
    // (chip "1d8+3"); `mode: "heal-or-damage"` surfaces BOTH the heal chip and the
    // save-damage chip on the one card (player picks one each use — override-first).
    mechanics: {
      actions: [
        {
          type: "action",
          // M5 — Divine Spark consumes one Channel Divinity use.
          costTracker: "cleric-channel-divinity",
          saveAbility: "CON",
          saveDcAbility: "WIS",
          attack: {
            diceByLevel: { 2: "1d8", 7: "2d8", 13: "3d8", 18: "4d8" },
            addMod: "WIS",
            damageTypeChoices: ["necrotic", "radiant"],
            mode: "heal-or-damage",
          },
        },
      ],
    },
    source: "SRD",
  },
  {
    id: "cleric-turn-undead",
    class: "cleric",
    level: 2,
    mechanics: {
      actions: [
        {
          type: "action",
          // M5 — Turn Undead consumes one Channel Divinity use.
          costTracker: "cleric-channel-divinity",
        },
      ],
    },
    source: "SRD",
  },
  {
    id: "cleric-sear-undead",
    class: "cleric",
    level: 5,
    // S11b — Sear Undead (2024): whenever you Turn Undead, each undead that FAILS
    // its save takes Radiant damage = (WIS modifier, min 1) d8. It RIDES Turn
    // Undead (no separate Channel Divinity cost — so NO costTracker), but we
    // surface its own card so the WIS-many-d8 damage value actually renders.
    // `diceCount: "WIS"` resolves the die COUNT from the effective WIS mod (≥1)
    // via the SHARED resolver the heal side uses (chip "4d8" at WIS 18).
    mechanics: {
      actions: [
        {
          type: "action",
          attack: { diceCount: "WIS", dieFace: "d8", damageType: "radiant" },
        },
      ],
    },
    source: "SRD",
  },
  {
    id: "cleric-blessed-strikes",
    class: "cleric",
    level: 7,
    // 2024 RAW (cleric:main, Level 7: Blessed Strikes): a one-time pick between
    // Divine Strike and Potent Spellcasting. Divine Strike is a once-per-turn
    // weapon damage rider (extra 1d8 Necrotic OR Radiant — the per-hit element
    // choice is described; we surface Radiant as the representative type). The
    // dice scale to 2d8 at Cleric 14 (Improved Blessed Strikes) via diceByLevel,
    // so the L14 feature stays descriptive. Potent Spellcasting (add WIS to ANY
    // Cleric cantrip's damage) is a `spell-damage-bonus` scoped to cleric cantrips
    // (`cantripOnly: true`, blanket `damageTypes: []`): the consumer
    // `resolveSpellDamageBonus` resolves +WIS mod for every damaging Cleric cantrip
    // (level 0) and leaves levelled Cleric spells untouched.
    grants: [
      {
        type: "choice-grant-bundle",
        bundleKey: "cleric-blessed-strikes",
        options: [
          {
            id: "divine-strike",
            grants: [
              {
                type: "damage-rider",
                dice: "1d8",
                diceByLevel: { 7: "1d8", 14: "2d8" },
                damageType: "radiant",
                appliesTo: "weapon",
                oncePerTurn: true,
              },
            ],
          },
          {
            id: "potent-spellcasting",
            grants: [
              {
                type: "spell-damage-bonus",
                damageTypes: [],
                cantripOnly: true,
                ability: "WIS",
                value: "modifier",
                scope: "cleric",
              },
            ],
          },
        ],
      },
    ],
    source: "SRD",
  },
  {
    id: "cleric-divine-intervention",
    class: "cleric",
    level: 10,
    // D4 — 2024 RAW (cleric:main, L10 Divine Intervention): "take the Magic action to
    // cast any Cleric spell of level 5 or lower without expending a spell slot …
    // once per Long Rest." Modeled as a free-cast-FROM-LIST grant (a guided picker
    // over the Cleric list ≤ 5th) debiting the feature's own 1/LR tracker. L20
    // Greater Divine Intervention extends the SAME pool to include Wish (see
    // cleric-improved-divine-intervention) — single source of truth.
    mechanics: {
      tracker: { total: "1", recovery: "long-rest" },
      actions: [
        {
          type: "action",
        },
      ],
    },
    grants: [
      {
        type: "free-cast-from-list",
        spellList: "cleric",
        maxSpellLevel: 5,
        chargesPerRest: 1,
        rest: "long",
        trackerId: "cleric-divine-intervention",
      },
    ],
    source: "SRD",
  },
  {
    id: "cleric-improved-blessed-strikes",
    class: "cleric",
    // 2024 RAW: this is a LEVEL-14 feature (was wrongly L11).
    level: 14,
    // The Divine Strike dice bump is auto-applied via the diceByLevel map on the
    // L7 Blessed Strikes damage rider (2d8 at Cleric 14).
    // PROSE-SWEPT 2026-06-10 — the Potent Spellcasting upgrade ("when you deal
    // Cleric cantrip damage, give yourself or a creature within 60 ft
    // Temporary Hit Points equal to twice your Wisdom modifier") was hidden in
    // prose. Wired through the SAME bundleKey as the L7 pick (two features may
    // share a bundleKey), so the temp-HP grant applies ONLY when Potent
    // Spellcasting is the chosen option — and only from L14 (this feature's
    // class-table gate).
    grants: [
      {
        type: "choice-grant-bundle",
        bundleKey: "cleric-blessed-strikes",
        options: [
          { id: "divine-strike", grants: [] },
          {
            id: "potent-spellcasting",
            grants: [{ type: "temp-hp", formula: "2*WIS" }],
          },
        ],
      },
    ],
    source: "SRD",
  },
  {
    id: "cleric-improved-divine-intervention",
    class: "cleric",
    level: 20,
    // 2024 RAW (cleric:main, Level 20: Greater Divine Intervention): this is NOT
    // a separate per-rest feature — it simply lets the L10 Divine Intervention
    // pick Wish, at the cost of 2d4 Long Rests before the next use. The 2014
    // "succeeds automatically + its own 1/Long Rest tracker" reading was wrong;
    // the standalone tracker is dropped (the L10 Divine Intervention tracker is
    // the single source of truth, and the 2d4-Long-Rest recharge has no
    // TrackerSpec field yet — it stays in the description).
    source: "SRD",
  },
  // Life Domain features
  {
    id: "cleric-life-disciple-of-life",
    class: "cleric",
    subclass: "life-domain",
    level: 3,
    // +2 + spell level to any cleric healing spell of level 1+. The heal-bonus
    // grant aggregates into AggregatedGrants.healBonuses; the smart-tracker
    // consumer (resolveHealBonus) appends the resolved amount to the spell's heal
    // verdict. minSpellLevel:1 excludes cantrips; perSpellLevel adds the slot level.
    grants: [
      {
        type: "heal-bonus",
        amount: 2,
        perSpellLevel: true,
        minSpellLevel: 1,
        scope: "cleric",
      },
    ],
    source: "SRD",
  },
  {
    id: "cleric-life-preserve-life",
    class: "cleric",
    subclass: "life-domain",
    level: 3,
    mechanics: {
      actions: [
        {
          type: "action",
          // M5 — Preserve Life consumes one Channel Divinity use.
          costTracker: "cleric-channel-divinity",
        },
      ],
    },
    source: "SRD",
  },
  {
    id: "cleric-life-blessed-healer",
    class: "cleric",
    subclass: "life-domain",
    level: 6,
    source: "SRD",
  },
  {
    id: "cleric-life-supreme-healing",
    class: "cleric",
    subclass: "life-domain",
    level: 17,
    source: "SRD",
  },
];
