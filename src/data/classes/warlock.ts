import type { SrdClassTable, SrdClassFeatureData, SrdClassLevel } from "../types";
import { asProficiencyToken } from "@/lib/proficiency-tokens";
import { proficiencyBonus } from "@/lib/proficiency";

function cantrips(level: number): number {
  if (level >= 10) return 4;
  if (level >= 4) return 3;
  return 2;
}

function spellsKnown(level: number): number {
  // 2024 PHB Warlock "Prepared Spells" column
  const table = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15];
  return table[level - 1] ?? 15;
}

function invocationsKnown(level: number): number {
  // 2024 RAW (warlock:main, Eldritch Invocations column): 1 / 3 (L2) / 5 (L5) /
  // 6 (L7) / 7 (L9) / 8 (L12) / 9 (L15) / 10 (L18). The 2014 progression
  // (1/2/3/4/5/6/7/8) granted far fewer invocations.
  if (level < 1) return 0;
  if (level < 2) return 1;
  if (level < 5) return 3;
  if (level < 7) return 5;
  if (level < 9) return 6;
  if (level < 12) return 7;
  if (level < 15) return 8;
  if (level < 18) return 9;
  return 10;
}

/**
 * The level of a 2024 Warlock's Pact Magic spell slots (all slots are the same
 * level). 1 (L1–2), 2 (L3–4), 3 (L5–6), 4 (L7–8), 5 (L9+). Exported because
 * slot-cost-scaled pact-weapon riders (Eldritch Smite: base 1d8 PLUS 1d8 per
 * slot level → (slotLevel + 1)d8) scale off the spent slot's level, which for a
 * Warlock is always this value.
 */
export function pactSlotLevel(level: number): number {
  if (level < 3) return 1;
  if (level < 5) return 2;
  if (level < 7) return 3;
  if (level < 9) return 4;
  return 5;
}

/**
 * 2024 Pact Magic: a few spell slots that are ALL the same level (the current
 * pact-slot level). Count: 1 (L1), 2 (L2–10), 3 (L11–16), 4 (L17–20). Returns the
 * 9-length per-spell-level slot array with only the pact level non-zero — unlike a
 * full caster (the old, incorrect behaviour) the Warlock never has multi-level slots.
 */
/**
 * The Pact Magic COUNT at a Warlock level: 1 (L1), 2 (L2–10), 3 (L11–16),
 * 4 (L17–20). Paired with {@link pactSlotLevel} this fully describes the Warlock's
 * separate Pact Magic pool — consumed by the multiclass slot composer
 * (`lib/multiclass-slots.ts`), which stacks it on the shared slots.
 */
function pactSlotCount(level: number): number {
  return level >= 17 ? 4 : level >= 11 ? 3 : level >= 2 ? 2 : 1;
}

/** The Warlock's Pact Magic pool as `{ slotLevel, slots }` (R4 multiclass seam). */
export function pactSlots(level: number): { slotLevel: number; slots: number } {
  return { slotLevel: pactSlotLevel(level), slots: pactSlotCount(level) };
}

function pactSlotArray(level: number): number[] {
  const slots = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  slots[pactSlotLevel(level) - 1] = pactSlotCount(level);
  return slots;
}

export const WARLOCK_TABLE: SrdClassTable = {
  id: "warlock",
  hitDie: 8,
  primaryAbility: ["CHA"],
  // #36 — 2024 multiclassing facts (dnd2024.wikidot.com <class>:main,
  // "As a Multiclass Character").
  multiclass: {
    armorTraining: [asProficiencyToken("light-armor")],
  },
  savingThrows: ["WIS", "CHA"],
  armorProficiencies: [asProficiencyToken("light-armor")],
  weaponProficiencies: [asProficiencyToken("simple-weapons")],
  skillChoices: {
    count: 2,
    from: [
      "Arcana",
      "Deception",
      "History",
      "Intimidation",
      "Investigation",
      "Nature",
      "Religion",
    ],
  },
  // 2024 RAW (warlock:main): Choose A or B — (A) Leather Armor, Sickle,
  // 2 Daggers, Arcane Focus (orb), Book (occult lore), Scholar's Pack, and
  // 15 GP; or (B) 100 GP.
  startingEquipment: [
    {
      label: "A",
      items: [
        { srdId: "leather-armor" },
        { srdId: "sickle" },
        { srdId: "dagger", quantity: 2 },
        { srdId: "arcane-focus" },
        { srdId: "book" },
        { srdId: "scholars-pack" },
      ],
      gold: 15,
    },
    { label: "B", items: [], gold: 100 },
  ],
  // 2024 RAW: Warlock IS a prepared caster (the class table has a
  // "Warlock Spells Prepared" column; preparedSpells(level) above
  // mirrors that column). Pact Magic is a separate mechanic and is
  // detected via the `pactMagic` flag on the spell-slot rows, not via
  // this flag. Previously flagged false (2014-era assumption) which
  // hid the prep toggle + over-cap warning from every Warlock player.
  spellcasting: { ability: "CHA", preparedCaster: true },
  canSwapSpell: true,
  subclassLevel: 3,
  subclassSpellLevels: [3, 5, 7, 9],
  subclasses: [
    {
      id: "fiend-patron",
      featureIds: [
        "warlock-fiend-patron-dark-ones-blessing",
        "warlock-fiend-patron-dark-ones-own-luck",
        "warlock-fiend-patron-fiendish-resilience",
        "warlock-fiend-patron-hurl-through-hell",
      ],
      // H7 — Fiend Patron Spells (2024 PHB). Verified against
      // http://dnd2024.wikidot.com/warlock:fiend-patron.
      expandedSpells: {
        3: ["burning-hands", "command", "scorching-ray", "suggestion"],
        5: ["fireball", "stinking-cloud"],
        7: ["fire-shield", "wall-of-fire"],
        9: ["geas", "insect-plague"],
      },
    },
  ],
  levels: Array.from({ length: 20 }, (_, i) => {
    const level = i + 1;
    const featureIds: string[] = [];
    if (level === 1)
      featureIds.push("warlock-pact-magic", "warlock-eldritch-invocations");
    if (level === 2) featureIds.push("warlock-magical-cunning");
    if (level === 4 || level === 8 || level === 12 || level === 16)
      featureIds.push("warlock-asi");
    if (level === 19) featureIds.push("warlock-epic-boon");
    if (level === 9) featureIds.push("warlock-contact-patron");
    if (level === 11) featureIds.push("warlock-mystic-arcanum-6th");
    if (level === 13) featureIds.push("warlock-mystic-arcanum-7th");
    if (level === 15) featureIds.push("warlock-mystic-arcanum-8th");
    if (level === 17) featureIds.push("warlock-mystic-arcanum-9th");
    if (level === 20) featureIds.push("warlock-eldritch-master");
    const entry: SrdClassLevel = {
      level,
      featureIds,
      proficiencyBonus: proficiencyBonus(level),
      cantripsKnown: cantrips(level),
      spellsKnown: spellsKnown(level),
      spellSlots: pactSlotArray(level),
      classSpecific: {
        invocationsKnown: invocationsKnown(level),
        pactSlotLevel: pactSlotLevel(level),
      },
    };
    if (level === 4 || level === 8 || level === 12 || level === 16 || level === 19)
      entry.asi = true;
    return entry;
  }),
};

export const WARLOCK_FEATURES: SrdClassFeatureData[] = [
  {
    // 2024: every class gains an Epic Boon feat at level 19 (not a 5th ASI).
    id: "warlock-epic-boon",
    class: "warlock",
    level: 19,
    source: "SRD",
  },
  {
    id: "warlock-pact-magic",
    class: "warlock",
    level: 1,
    source: "SRD",
  },
  {
    id: "warlock-eldritch-invocations",
    class: "warlock",
    level: 1,
    source: "SRD",
  },
  {
    id: "warlock-magical-cunning",
    class: "warlock",
    level: 2,
    // 2024 RAW (warlock:main, L2 Magical Cunning): a 1-minute esoteric rite that
    // regains expended Pact Magic spell slots, no more than ⌈max/2⌉, usable once
    // per Long Rest. The 1/Long-Rest cadence is the tracker; the restore itself
    // is wired as a PRIM-resource-conversion `pact-slot` produce path that spends
    // that one charge to un-expend the Pact-Magic slots (Eldritch Master at L20
    // upgrades the amount to the FULL pool — resolved live, no second tracker).
    // Override-first — never auto-converted.
    mechanics: { tracker: { total: "1", recovery: "long-rest" } },
    grants: [
      {
        type: "resource-conversion",
        conversionId: "magical-cunning",
        produces: "pact-slot",
        fromTracker: "warlock-magical-cunning",
      },
    ],
    source: "SRD",
  },
  {
    id: "warlock-contact-patron",
    class: "warlock",
    level: 9,
    // 2024 RAW (warlock:main, Contact Patron): "you always have the Contact
    // Other Plane spell prepared" + cast it once without a slot per Long Rest.
    // The auto-success on the spell's save is a play detail (description); the
    // always-prepared + 1/Long-Rest slotless cast are wired declaratively. The
    // free-cast tracker uses the Warlock's CHA spellcasting ability by default.
    grants: [
      { type: "always-prepared-spell", spellId: "contact-other-plane" },
      {
        type: "free-cast-spell",
        spellId: "contact-other-plane",
        chargesPerRest: 1,
        rest: "long",
      },
    ],
    source: "SRD",
  },
  {
    id: "warlock-asi",
    class: "warlock",
    level: 4,
    source: "SRD",
  },
  {
    id: "warlock-mystic-arcanum-6th",
    class: "warlock",
    level: 11,
    mechanics: { tracker: { total: "1", recovery: "long-rest" } },
    // Mystic Arcanum (warlock:main, Level 11): "Choose one level 6 Warlock spell
    // as this arcanum. You can cast your arcanum spell once without expending a
    // spell slot, and you must finish a Long Rest before you can cast it in this
    // way again." Modeled as a Warlock-list choice-spell whose pick is free-
    // castable 1/Long Rest via THIS feature's tracker (mirrors Aberrant
    // heritage feat's freeCastSource → its 1/LR tracker). NOTE: choice-spell has no
    // exact-level floor (only maxLevel), so the picker is permissive (≤6th); the
    // free-cast-1/Long-Rest core is fully wired.
    grants: [
      {
        type: "choice-spell",
        classSpellList: "warlock",
        maxLevel: 6,
        amount: 1,
        freeCastSource: {
          sourceId: "warlock-mystic-arcanum-6th",
          rest: "long",
          usesPerRest: 1,
        },
      },
    ],
    source: "SRD",
  },
  {
    id: "warlock-mystic-arcanum-7th",
    class: "warlock",
    level: 13,
    mechanics: { tracker: { total: "1", recovery: "long-rest" } },
    // Mystic Arcanum (7th level) — choose one level 7 Warlock spell, free-cast
    // 1/Long Rest via this feature's tracker (see the 6th-level note above).
    grants: [
      {
        type: "choice-spell",
        classSpellList: "warlock",
        maxLevel: 7,
        amount: 1,
        freeCastSource: {
          sourceId: "warlock-mystic-arcanum-7th",
          rest: "long",
          usesPerRest: 1,
        },
      },
    ],
    source: "SRD",
  },
  {
    id: "warlock-mystic-arcanum-8th",
    class: "warlock",
    level: 15,
    mechanics: { tracker: { total: "1", recovery: "long-rest" } },
    // Mystic Arcanum (8th level) — choose one level 8 Warlock spell, free-cast
    // 1/Long Rest via this feature's tracker (see the 6th-level note above).
    grants: [
      {
        type: "choice-spell",
        classSpellList: "warlock",
        maxLevel: 8,
        amount: 1,
        freeCastSource: {
          sourceId: "warlock-mystic-arcanum-8th",
          rest: "long",
          usesPerRest: 1,
        },
      },
    ],
    source: "SRD",
  },
  {
    id: "warlock-mystic-arcanum-9th",
    class: "warlock",
    level: 17,
    mechanics: { tracker: { total: "1", recovery: "long-rest" } },
    // Mystic Arcanum (9th level) — choose one level 9 Warlock spell, free-cast
    // 1/Long Rest via this feature's tracker (see the 6th-level note above).
    grants: [
      {
        type: "choice-spell",
        classSpellList: "warlock",
        maxLevel: 9,
        amount: 1,
        freeCastSource: {
          sourceId: "warlock-mystic-arcanum-9th",
          rest: "long",
          usesPerRest: 1,
        },
      },
    ],
    source: "SRD",
  },
  {
    id: "warlock-eldritch-master",
    class: "warlock",
    level: 20,
    // 2024 RAW (warlock:main, L20): "When you use your Magical Cunning feature,
    // you regain ALL your expended Pact Magic spell slots." Eldritch Master adds
    // NO new use — it UPGRADES Magical Cunning's restore from ⌈max/2⌉ to the full
    // pool. So it carries NO tracker of its own (its presence flips the live
    // `pactPool.restoresAll` flag the Magical-Cunning conversion reads).
    source: "SRD",
  },
  // Fiend Patron (2024) subclass features
  {
    id: "warlock-fiend-patron-dark-ones-blessing",
    class: "warlock",
    subclass: "fiend-patron",
    level: 3,
    // Triggered self-gain (no action cost) — override-first, player applies it.
    grants: [
      {
        type: "temp-hp",
        formula: "CHA+level",
      },
    ],
    source: "SRD",
  },
  {
    id: "warlock-fiend-patron-dark-ones-own-luck",
    class: "warlock",
    subclass: "fiend-patron",
    level: 6,
    mechanics: {
      tracker: { total: "CHA", recovery: "long-rest" },
    },
    source: "SRD",
  },
  {
    id: "warlock-fiend-patron-fiendish-resilience",
    class: "warlock",
    subclass: "fiend-patron",
    level: 10,
    // Fiendish Resilience (warlock:fiend-patron, Level 10): "Choose one damage
    // type, other than Force, whenever you finish a Short or Long Rest. You have
    // Resistance to that damage type until you choose a different one." A
    // re-selectable choice-resistance slot (amount 1, every damage type EXCEPT
    // Force) — mirrors the Paladin Genie's Aura of Elemental Shielding / the Boon
    // of Energy Resistance feat; the validated pick set-unions into
    // damageResistances (lit by the existing defenses consumer, no new code).
    grants: [
      {
        type: "choice-resistance",
        choiceKey: "warlock-fiend-patron-fiendish-resilience",
        options: [
          "acid",
          "bludgeoning",
          "cold",
          "fire",
          "lightning",
          "necrotic",
          "piercing",
          "poison",
          "psychic",
          "radiant",
          "slashing",
          "thunder",
        ],
        amount: 1,
      },
    ],
    source: "SRD",
  },
  {
    id: "warlock-fiend-patron-hurl-through-hell",
    class: "warlock",
    subclass: "fiend-patron",
    level: 14,
    mechanics: {
      tracker: { total: "1", recovery: "long-rest" },
    },
    source: "SRD",
  },
];
