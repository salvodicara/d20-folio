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

export const DRUID_TABLE: SrdClassTable = {
  id: "druid",
  hitDie: 8,
  primaryAbility: ["WIS"],
  // #36 — 2024 multiclassing facts (dnd2024.wikidot.com <class>:main,
  // "As a Multiclass Character").
  multiclass: {
    armorTraining: [asProficiencyToken("light-armor"), asProficiencyToken("shields")],
  },
  savingThrows: ["INT", "WIS"],
  armorProficiencies: [asProficiencyToken("light-armor"), asProficiencyToken("shields")],
  weaponProficiencies: [asProficiencyToken("simple-weapons")],
  skillChoices: {
    count: 2,
    from: [
      "Arcana",
      "Animal Handling",
      "Insight",
      "Medicine",
      "Nature",
      "Perception",
      "Religion",
      "Survival",
    ],
  },
  // 2024 RAW (druid:main): Choose A or B — (A) Leather Armor, Shield, Sickle,
  // Druidic Focus (Quarterstaff), Explorer's Pack, Herbalism Kit, and 9 GP; or
  // (B) 50 GP. The Druidic Focus's Quarterstaff form is a usable Simple weapon,
  // so both the focus and the quarterstaff are in the package. (The 2014
  // scimitar is now non-proficient — Druids are Simple-weapons-only in 2024.)
  startingEquipment: [
    {
      label: "A",
      items: [
        { srdId: "leather-armor" },
        { srdId: "shield" },
        { srdId: "sickle" },
        { srdId: "druidic-focus" },
        { srdId: "explorers-pack" },
        { srdId: "herbalism-kit" },
      ],
      gold: 9,
    },
    { label: "B", items: [], gold: 50 },
  ],
  spellcasting: { ability: "WIS", preparedCaster: true },
  subclassLevel: 3,
  subclassSpellLevels: [3, 5, 7, 9],
  subclasses: [
    {
      id: "circle-of-the-land",
      featureIds: [
        "druid-land-circle-spells",
        "druid-land-lands-aid",
        "druid-land-natural-recovery",
        "druid-land-natures-ward",
        "druid-land-natures-sanctuary",
      ],
    },
  ],
  levels: Array.from({ length: 20 }, (_, i) => {
    const level = i + 1;
    const featureIds: string[] = [];
    let asi = false;

    // The base class `levels[]` table is subclass-AGNOSTIC (W10, golden rule 10):
    // it lists ONLY base Druid features. Subclass features (Circle of the Land et al.)
    // come from their own `f.subclass`-tagged rows, surfaced by `getFeaturesAtLevel`
    // + the subclass filter in level-up — never hardcoded here (a `druid-land-*` id in
    // this table mis-describes the progression and is a trap). Guarded by
    // `base-levels-no-subclass.guard.test.ts`.
    if (level === 1)
      featureIds.push("druid-druidic", "druid-spellcasting", "druid-primal-order");
    if (level === 2) featureIds.push("druid-wild-shape", "druid-wild-companion");
    if ([4, 8, 12, 16, 19].includes(level)) asi = true;
    if (level === 5) featureIds.push("druid-wild-resurgence");
    if (level === 7) featureIds.push("druid-elemental-fury");
    if (level === 15) featureIds.push("druid-improved-elemental-fury");
    if (level === 18) featureIds.push("druid-beast-spells");
    if (level === 19) featureIds.push("druid-epic-boon");
    if (level === 20) featureIds.push("druid-archdruid");

    // Max beast CR for Wild Shape (surfaced as a rider chip on the Wild Shape
    // tracker). Uses count is the tracker's own total (2/3/4), not this. This is
    // the BASE druid cap; Circle of the Moon's Circle Forms (L3+) raises it to
    // floor(Druid level / 3) — applied subclass-aware in `featureClassRow`
    // (`moonWildShapeMaxCROverride`), not here (the table is subclass-agnostic).
    const wildShapeMaxCR =
      level >= 8 ? "1" : level >= 4 ? "1/2" : level >= 2 ? "1/4" : "0";
    const cantripsKnown = level >= 10 ? 4 : level >= 4 ? 3 : 2;
    // 2024 PHB Druid "Prepared Spells" column
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
      classSpecific: { wildShapeMaxCR },
    };
    if (asi) entry.asi = true;
    return entry;
  }),
};

export const DRUID_FEATURES: SrdClassFeatureData[] = [
  {
    // 2024: every class gains an Epic Boon feat at level 19 (not a 5th ASI).
    id: "druid-epic-boon",
    class: "druid",
    level: 19,
    source: "SRD",
  },
  {
    id: "druid-druidic",
    class: "druid",
    level: 1,
    // The feature AUTO-grants the secret tongue (granted by EN name — the FACT
    // anchor; the presenter resolves it to the language id and localizes). A player
    // may also add any language by hand from the Bio — automation by default,
    // override always.
    grants: [
      { type: "language", language: "Druidic" },
      // 2024 Druidic also grants Speak with Animals as an always-prepared spell
      // (druid:main). WIS is the Druid's spellcasting ability.
      {
        type: "always-prepared-spell",
        spellId: "speak-with-animals",
        spellAbility: "WIS",
      },
      // 2024 base Druid Tool Proficiency: Herbalism Kit (druid:main — "Tool
      // Proficiencies: Herbalism Kit"). SrdClassTable has no tool field, so the
      // class-baseline tool prof rides the always-granted level-1 Druidic
      // anchor (which already carries the baseline language grant), surfaced by
      // evaluateGrants via the `tool-proficiency` grant kind (see grants.ts).
      { type: "tool-proficiency", tool: "Herbalism Kit" },
    ],
    source: "SRD",
  },
  {
    id: "druid-spellcasting",
    class: "druid",
    level: 1,
    source: "SRD",
  },
  {
    id: "druid-primal-order",
    class: "druid",
    level: 1,
    // 2024 RAW (druid:main, Level 1: Primal Order): a one-time pick between
    // Magician (one extra Druid cantrip + an Arcana/Nature check bonus = WIS
    // mod, min +1) and Warden (Martial weapons + Medium armor training — NO
    // Shields; the prior description wrongly said "Medium armor and Shields").
    // Modeled as a `choice-grant-bundle`.
    grants: [
      {
        type: "choice-grant-bundle",
        bundleKey: "druid-primal-order",
        options: [
          {
            id: "magician",
            grants: [
              { type: "choice-cantrip", classSpellList: "druid", amount: 1 },
              {
                type: "ability-check-bonus",
                appliesTo: "arcana",
                ability: "WIS",
                value: "modifier",
                min: 1,
              },
              {
                type: "ability-check-bonus",
                appliesTo: "nature",
                ability: "WIS",
                value: "modifier",
                min: 1,
              },
            ],
          },
          {
            id: "warden",
            grants: [
              {
                type: "weapon-proficiency",
                proficiency: asProficiencyToken("martial-weapons"),
              },
              {
                type: "armor-proficiency",
                proficiency: asProficiencyToken("medium-armor"),
              },
            ],
          },
        ],
      },
    ],
    source: "SRD",
  },
  {
    id: "druid-wild-shape",
    class: "druid",
    level: 2,
    // 2024 RAW (druid:main, Level 2 Wild Shape — "Temporary Hit Points"):
    // "When you assume a Wild Shape form, you gain a number of Temporary Hit
    // Points equal to your Druid level." Override-first temp-hp grant — the
    // engine surfaces a manual "Gain N temporary HP" entry (Circle of the Moon's
    // Circle Forms grants the higher 3×level pool; temp HP never stack).
    grants: [
      {
        type: "temp-hp",
        formula: "level",
      },
    ],
    mechanics: {
      tracker: {
        total: "2",
        recovery: "short-rest",
        shortRestRecovery: 1,
        levels: [
          { from: 6, total: "3" },
          { from: 17, total: "4" },
        ],
      },
      actions: [
        {
          type: "bonus",
        },
      ],
      // Surface the max beast CR (1/4 → 1/2 at L4 → 1 at L8) as a chip on the
      // Wild Shape tracker, read from the class table's `wildShapeMaxCR`.
      rider: {
        sourceKey: "wildShapeMaxCR",
        format: "passthrough",
      },
    },
    source: "SRD",
  },
  {
    id: "druid-wild-companion",
    class: "druid",
    level: 2,
    mechanics: {
      // M5 — spending one Wild Shape use to cast Find Familiar. The costTracker
      // is the same key Wrath-of-the-Sea / Starry Form use so the central
      // druid-wild-shape tracker decrements consistently.
      //
      // alternate-action-cost (2024 druid:main, Level 2 Wild Companion):
      // "you can expend a spell slot OR a use of Wild Shape to cast Find
      // Familiar". The primary cost is the Wild Shape tracker; `alternateCost`
      // is the spell-slot option the player may pick instead — any slot of
      // level 1+ qualifies (Find Familiar is a level-1 spell), so minLevel 1.
      actions: [
        {
          type: "action",
          costTracker: "druid-wild-shape",
          trackerCost: 1,
          alternateCost: { kind: "spell-slot", minLevel: 1 },
        },
      ],
    },
    source: "SRD",
  },
  {
    id: "druid-wild-resurgence",
    class: "druid",
    level: 5,
    mechanics: {
      // The Wild-Shape → Level-1-slot conversion is once per Long Rest. The
      // slot → Wild Shape direction is once per turn (no tracker — gated by
      // having spell slots, not a per-rest pool).
      tracker: { total: "1", recovery: "long-rest" },
    },
    source: "SRD",
  },
  {
    id: "druid-elemental-fury",
    class: "druid",
    level: 7,
    // 2024 RAW (druid:main, Level 7: Elemental Fury): a one-time pick between
    // Potent Spellcasting (add WIS to ANY Druid cantrip's damage) and Primal
    // Strike (once-per-turn weapon damage rider, extra 1d8 Cold/Fire/Lightning/
    // Thunder — per-hit element choice; Cold is the representative type). Potent
    // Spellcasting is a `spell-damage-bonus` scoped to druid cantrips
    // (`cantripOnly: true`, blanket `damageTypes: []`) — the same shape Cleric
    // Blessed Strikes uses: the consumer `resolveSpellDamageBonus` resolves +WIS
    // mod for every damaging Druid cantrip (level 0) and leaves levelled Druid
    // spells untouched. The Primal Strike dice scale to 2d8 at Druid 15 (Improved
    // Elemental Fury) via diceByLevel, so the L15 feature stays descriptive.
    grants: [
      {
        type: "choice-grant-bundle",
        bundleKey: "druid-elemental-fury",
        options: [
          {
            id: "potent-spellcasting",
            grants: [
              {
                type: "spell-damage-bonus",
                damageTypes: [],
                cantripOnly: true,
                ability: "WIS",
                value: "modifier",
                scope: "druid",
              },
            ],
          },
          {
            id: "primal-strike",
            grants: [
              {
                type: "damage-rider",
                dice: "1d8",
                diceByLevel: { 7: "1d8", 15: "2d8" },
                damageType: "cold",
                appliesTo: "weapon",
                oncePerTurn: true,
              },
            ],
          },
        ],
      },
    ],
    source: "SRD",
  },
  {
    id: "druid-improved-elemental-fury",
    class: "druid",
    level: 15,
    // The Primal Strike dice bump is auto-applied via the diceByLevel map on the
    // L7 Elemental Fury damage rider (2d8 at Druid 15). This feature stays
    // descriptive — it only documents the per-option upgrade. (The earlier
    // "extra 2d6 of a chosen damage type on Druid spells" text was a 2014-style
    // invention not present in 2024 RAW.)
    source: "SRD",
  },
  {
    id: "druid-beast-spells",
    class: "druid",
    level: 18,
    source: "SRD",
  },
  {
    id: "druid-archdruid",
    class: "druid",
    level: 20,
    // PROSE-SWEPT 2026-06-10 — Evergreen Wild Shape: "When you roll Initiative
    // and have no uses of Wild Shape left, you regain one expended use" — the
    // initiative-tracker-topup kind (floor 1). Nature Magician now wires
    // PRIM-resource-conversion: convert N Wild Shape uses → one spell slot, each
    // use = 2 spell levels, capped at level 5 (no slot above 5 is creatable).
    // Longevity is narrative. Override-first — never auto-converted.
    grants: [
      { type: "initiative-tracker-topup", trackerId: "druid-wild-shape", upTo: 1 },
      {
        type: "resource-conversion",
        conversionId: "nature-magician",
        produces: "spell-slot",
        fromTracker: "druid-wild-shape",
        perUnitSlotLevels: 2,
        maxSlotLevel: 5,
      },
    ],
    source: "SRD",
  },
  // Circle of the Land — 2024 PHB (dnd2024.wikidot.com/druid:circle-of-the-land).
  // Terrain is re-chosen each Long Rest; the `druid-land-terrain` choice-grant-
  // bundle (shared by Circle Spells L3 + Nature's Ward L10) drives both the
  // always-prepared Circle Spells (level-gated 3/5/7/9 via `minLevel`) and the
  // Nature's Ward resistance.
  {
    id: "druid-land-circle-spells",
    class: "druid",
    subclass: "circle-of-the-land",
    level: 3,
    grants: [
      {
        type: "choice-grant-bundle",
        bundleKey: "druid-land-terrain",
        options: [
          {
            id: "arid",
            grants: [
              { type: "always-prepared-spell", spellId: "blur", minLevel: 3 },
              { type: "always-prepared-spell", spellId: "burning-hands", minLevel: 3 },
              { type: "always-prepared-spell", spellId: "fire-bolt", minLevel: 3 },
              { type: "always-prepared-spell", spellId: "fireball", minLevel: 5 },
              { type: "always-prepared-spell", spellId: "blight", minLevel: 7 },
              { type: "always-prepared-spell", spellId: "wall-of-stone", minLevel: 9 },
            ],
          },
          {
            id: "polar",
            grants: [
              { type: "always-prepared-spell", spellId: "fog-cloud", minLevel: 3 },
              { type: "always-prepared-spell", spellId: "hold-person", minLevel: 3 },
              { type: "always-prepared-spell", spellId: "ray-of-frost", minLevel: 3 },
              { type: "always-prepared-spell", spellId: "sleet-storm", minLevel: 5 },
              { type: "always-prepared-spell", spellId: "ice-storm", minLevel: 7 },
              { type: "always-prepared-spell", spellId: "cone-of-cold", minLevel: 9 },
            ],
          },
          {
            id: "temperate",
            grants: [
              { type: "always-prepared-spell", spellId: "misty-step", minLevel: 3 },
              { type: "always-prepared-spell", spellId: "shocking-grasp", minLevel: 3 },
              { type: "always-prepared-spell", spellId: "sleep", minLevel: 3 },
              { type: "always-prepared-spell", spellId: "lightning-bolt", minLevel: 5 },
              {
                type: "always-prepared-spell",
                spellId: "freedom-of-movement",
                minLevel: 7,
              },
              { type: "always-prepared-spell", spellId: "tree-stride", minLevel: 9 },
            ],
          },
          {
            id: "tropical",
            grants: [
              { type: "always-prepared-spell", spellId: "acid-splash", minLevel: 3 },
              { type: "always-prepared-spell", spellId: "ray-of-sickness", minLevel: 3 },
              { type: "always-prepared-spell", spellId: "web", minLevel: 3 },
              { type: "always-prepared-spell", spellId: "stinking-cloud", minLevel: 5 },
              { type: "always-prepared-spell", spellId: "polymorph", minLevel: 7 },
              { type: "always-prepared-spell", spellId: "insect-plague", minLevel: 9 },
            ],
          },
        ],
      },
    ],
    source: "SRD",
  },
  {
    id: "druid-land-lands-aid",
    class: "druid",
    subclass: "circle-of-the-land",
    level: 3,
    mechanics: {
      actions: [
        {
          type: "action",
          costTracker: "druid-wild-shape",
        },
      ],
    },
    source: "SRD",
  },
  {
    id: "druid-land-natural-recovery",
    class: "druid",
    subclass: "circle-of-the-land",
    level: 6,
    mechanics: {
      tracker: { total: "1", recovery: "long-rest" },
    },
    source: "SRD",
  },
  {
    id: "druid-land-natures-ward",
    class: "druid",
    subclass: "circle-of-the-land",
    level: 10,
    // Poisoned immunity is fixed; the per-terrain resistance is driven by the
    // same `druid-land-terrain` selection as Circle Spells (one selector).
    grants: [
      { type: "condition-immunity", condition: "poisoned" },
      {
        type: "choice-grant-bundle",
        bundleKey: "druid-land-terrain",
        options: [
          {
            id: "arid",
            grants: [{ type: "damage-resistance", damageType: "fire" }],
          },
          {
            id: "polar",
            grants: [{ type: "damage-resistance", damageType: "cold" }],
          },
          {
            id: "temperate",
            grants: [{ type: "damage-resistance", damageType: "lightning" }],
          },
          {
            id: "tropical",
            grants: [{ type: "damage-resistance", damageType: "poison" }],
          },
        ],
      },
    ],
    source: "SRD",
  },
  {
    id: "druid-land-natures-sanctuary",
    class: "druid",
    subclass: "circle-of-the-land",
    level: 14,
    mechanics: {
      actions: [
        {
          type: "action",
          costTracker: "druid-wild-shape",
        },
      ],
    },
    // PRIM-aura/emanation — 2024 RAW (druid:circle-of-the-land, L14 Nature's
    // Sanctuary): a 15-ft Cube where you and your allies have Half Cover and your
    // allies gain your current Nature's Ward Resistance. Battlefield geometry +
    // an ally buff, so informational: the rail surfaces the Half-Cover note.
    grants: [
      {
        type: "aura",
        auraId: "natures-sanctuary",
        radius: 15,
        affects: "allies-and-self",
        effect: { kind: "half-cover" },
      },
    ],
    source: "SRD",
  },
];
