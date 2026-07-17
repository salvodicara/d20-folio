import type { SrdClassTable, SrdClassFeatureData, SrdClassLevel } from "../types";
import { asProficiencyToken } from "@/lib/proficiency-tokens";
import { proficiencyBonus } from "@/lib/proficiency";

// 2024 RAW: the Paladin is a spellcaster from level 1 (the 2014 Paladin gained
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

export const PALADIN_TABLE: SrdClassTable = {
  id: "paladin",
  hitDie: 10,
  primaryAbility: ["STR", "CHA"],
  // #36 — 2024 multiclassing facts (dnd2024.wikidot.com <class>:main,
  // "As a Multiclass Character").
  multiclass: {
    weaponProficiencies: [asProficiencyToken("martial-weapons")],
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
    asProficiencyToken("heavy-armor"),
    asProficiencyToken("shields"),
  ],
  weaponProficiencies: [
    asProficiencyToken("simple-weapons"),
    asProficiencyToken("martial-weapons"),
  ],
  skillChoices: {
    count: 2,
    from: ["Athletics", "Insight", "Intimidation", "Medicine", "Persuasion", "Religion"],
  },
  // 2024 RAW (paladin:main): Choose A or B — (A) Chain Mail, Shield, Longsword,
  // 6 Javelins, Holy Symbol, Priest's Pack, and 9 GP; or (B) 150 GP.
  startingEquipment: [
    {
      label: "A",
      items: [
        { srdId: "chain-mail" },
        { srdId: "shield" },
        { srdId: "longsword" },
        { srdId: "javelin", quantity: 6 },
        { srdId: "holy-symbol" },
        { srdId: "priests-pack" },
      ],
      gold: 9,
    },
    { label: "B", items: [], gold: 150 },
  ],
  spellcasting: { ability: "CHA", preparedCaster: true },
  subclassLevel: 3,
  subclassSpellLevels: [3, 5, 9, 13, 17],
  subclasses: [
    {
      id: "oath-of-devotion",
      featureIds: [
        // 2024 Oath of Devotion L3 grants Sacred Weapon ONLY — the 2014
        // "Turn the Unholy" Channel Divinity option was dropped in 2024.
        "paladin-devotion-sacred-weapon",
        "paladin-devotion-aura-of-devotion",
        "paladin-devotion-smite-of-protection",
        "paladin-devotion-holy-nimbus",
      ],
      // Oath of Devotion spells — dnd2024.wikidot.com/paladin:oath-of-devotion.
      // Paladin oath spells arrive at 3/5/9/13/17 (NOT the 3/5/7/9 cleric
      // pattern this previously used, which skewed L9+ spells and dropped L17).
      expandedSpells: {
        3: ["protection-from-evil-and-good", "shield-of-faith"],
        5: ["aid", "zone-of-truth"],
        9: ["beacon-of-hope", "dispel-magic"],
        13: ["freedom-of-movement", "guardian-of-faith"],
        17: ["commune", "flame-strike"],
      },
    },
  ],
  levels: Array.from({ length: 20 }, (_, i) => {
    const level = i + 1;
    const featureIds: string[] = [];
    let asi = false;

    // The base class `levels[]` table is subclass-AGNOSTIC (W10, golden rule 10):
    // it lists ONLY base Paladin features. Subclass features (Oath of Devotion et al.)
    // come from their own `f.subclass`-tagged rows, surfaced by `getFeaturesAtLevel`
    // + the subclass filter in level-up — never hardcoded here (a `paladin-devotion-*`
    // id in this table mis-describes the progression and is a trap). Guarded by
    // `base-levels-no-subclass.guard.test.ts`.
    if (level === 1)
      featureIds.push(
        "paladin-lay-on-hands",
        "paladin-spellcasting",
        "paladin-weapon-mastery"
      );
    if (level === 2) featureIds.push("paladin-fighting-style", "paladin-divine-smite");
    if (level === 3) featureIds.push("paladin-channel-divinity");
    if ([4, 8, 12, 16, 19].includes(level)) asi = true;
    if (level === 5) featureIds.push("paladin-extra-attack", "paladin-faithful-steed");
    if (level === 6) featureIds.push("paladin-aura-of-protection");
    if (level === 9) featureIds.push("paladin-abjure-foes");
    if (level === 10) featureIds.push("paladin-aura-of-courage");
    if (level === 11) featureIds.push("paladin-radiant-strikes");
    if (level === 14) featureIds.push("paladin-restoring-touch");
    if (level === 18) featureIds.push("paladin-aura-expansion");
    if (level === 19) featureIds.push("paladin-epic-boon");

    const layOnHandsPool = level * 5;
    // 2024 PHB Paladin "Prepared Spells" column
    const PREPARED_SPELLS = [
      2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15,
    ];

    const entry: SrdClassLevel = {
      level,
      featureIds,
      proficiencyBonus: proficiencyBonus(level),
      spellsKnown: PREPARED_SPELLS[i],
      // 2024 RAW (paladin:main): Weapon Mastery grants 2 weapons with no scaling
      // column — a flat 2 at every level (the table is the single source of truth).
      classSpecific: { layOnHandsPool, weaponMastery: 2 },
    };
    if (level >= 1) entry.spellSlots = HALF_CASTER_SLOTS[level - 1];
    if (asi) entry.asi = true;
    return entry;
  }),
};

export const PALADIN_FEATURES: SrdClassFeatureData[] = [
  {
    // 2024: every class gains an Epic Boon feat at level 19 (not a 5th ASI).
    id: "paladin-epic-boon",
    class: "paladin",
    level: 19,
    source: "SRD",
  },
  {
    id: "paladin-weapon-mastery",
    class: "paladin",
    level: 1,
    source: "SRD",
  },
  {
    id: "paladin-lay-on-hands",
    class: "paladin",
    level: 1,
    mechanics: {
      tracker: { total: "level*5", recovery: "long-rest", isPool: true, unit: "hp" },
      actions: [
        {
          type: "bonus",
          // G19 — as part of Lay On Hands you can expend HP from the pool to
          // NEUTRALIZE conditions (those points don't also restore HP — RAW).
          // Base (L1): 5 HP ends the Poisoned condition. L14 Restoring Touch
          // also ends Blinded/Charmed/Deafened/Frightened/Paralyzed/Stunned
          // (5 HP each) — gated on the Paladin level so a low-level Paladin sees
          // the Poisoned cure alone. The pool is never auto-debited (override-first).
          cureConditions: [
            { condition: "poisoned", costHp: 5 },
            { condition: "blinded", costHp: 5, fromLevel: 14 },
            { condition: "charmed", costHp: 5, fromLevel: 14 },
            { condition: "deafened", costHp: 5, fromLevel: 14 },
            { condition: "frightened", costHp: 5, fromLevel: 14 },
            { condition: "paralyzed", costHp: 5, fromLevel: 14 },
            { condition: "stunned", costHp: 5, fromLevel: 14 },
          ],
        },
      ],
    },
    source: "SRD",
  },
  {
    id: "paladin-spellcasting",
    class: "paladin",
    level: 1,
    source: "SRD",
  },
  {
    id: "paladin-fighting-style",
    class: "paladin",
    level: 2,
    source: "SRD",
  },
  {
    id: "paladin-fighting-style-defense",
    class: "paladin",
    level: 2,
    // The Defense fighting style's +1 AC, now flowing through the canonical AC
    // seam (a Paladin wears armor, so it applies). NOTE (follow-ups): the "while
    // wearing armor" gate is not yet a primitive (an unarmored Paladin would get
    // it), and the fighting style should be a player CHOICE rather than Defense
    // being auto-assigned — both tracked in docs/AUTOMATION_BACKLOG.md.
    grants: [{ type: "ac-bonus", amount: 1 }],
    source: "SRD",
  },
  {
    id: "paladin-divine-smite",
    class: "paladin",
    level: 2,
    grants: [
      { type: "always-prepared-spell", spellId: "divine-smite" },
      {
        type: "free-cast-spell",
        spellId: "divine-smite",
        chargesPerRest: 1,
        rest: "long",
      },
    ],
    source: "SRD",
  },
  {
    id: "paladin-channel-divinity",
    class: "paladin",
    level: 3,
    mechanics: {
      tracker: {
        total: "2",
        recovery: "short-rest",
        shortRestRecovery: 1,
        levels: [{ from: 11, total: "3" }],
      },
    },
    source: "SRD",
  },
  {
    id: "paladin-extra-attack",
    class: "paladin",
    level: 5,
    grants: [{ type: "extra-attack", count: 1 }],
    source: "SRD",
  },
  {
    id: "paladin-faithful-steed",
    class: "paladin",
    level: 5,
    grants: [
      { type: "always-prepared-spell", spellId: "find-steed" },
      { type: "free-cast-spell", spellId: "find-steed", chargesPerRest: 1, rest: "long" },
    ],
    source: "SRD",
  },
  {
    id: "paladin-aura-of-protection",
    class: "paladin",
    level: 6,
    // The aura is always active, so the paladin always adds max(CHA mod, 1) to
    // every save (the allies-in-aura half is a Phase-2 party feature).
    grants: [{ type: "save-bonus", ability: "CHA", min: 1 }],
    source: "SRD",
  },
  {
    id: "paladin-abjure-foes",
    class: "paladin",
    level: 9,
    mechanics: {
      actions: [
        {
          type: "action",
          costTracker: "paladin-channel-divinity",
        },
      ],
    },
    source: "SRD",
  },
  {
    id: "paladin-aura-of-courage",
    class: "paladin",
    level: 10,
    // L5 — immunity to the Frightened condition.
    grants: [{ type: "condition-immunity", condition: "frightened" }],
    source: "SRD",
  },
  {
    id: "paladin-radiant-strikes",
    class: "paladin",
    level: 11,
    // L9 damage-rider: +1d8 Radiant on every melee/unarmed hit (per-hit, not
    // once/turn). Surfaced as an extra damage chip on melee weapon attack rows.
    grants: [
      {
        type: "damage-rider",
        dice: "1d8",
        damageType: "radiant",
        appliesTo: "melee-weapon",
      },
    ],
    source: "SRD",
  },
  {
    id: "paladin-restoring-touch",
    class: "paladin",
    level: 14,
    source: "SRD",
  },
  {
    id: "paladin-aura-expansion",
    class: "paladin",
    level: 18,
    source: "SRD",
  },
  // Oath of Devotion
  {
    // 2024 rewrite — dnd2024.wikidot.com/paladin:oath-of-devotion, Level 3.
    // RAW (verbatim): "When you take the Attack action, you can expend one use of
    // your Channel Divinity to imbue one Melee weapon that you are holding with
    // positive energy. For 10 minutes or until you use this feature again, you add
    // your Charisma modifier to attack rolls you make with that weapon (minimum
    // bonus of +1), and each time you hit with it, you cause it to deal its normal
    // damage type or Radiant Damage. The weapon also emits Bright Light in a
    // 20-foot radius and Dim Light 20 feet beyond that. You can end this effect
    // early (no action required). This effect also ends if you aren't carrying the
    // weapon." The 2014 standalone-action / 1-min version (and the separate "Turn
    // the Unholy" CD option) are dropped.
    //
    // Modeled half: +CHA modifier (minimum +1) to attack rolls — the
    // ability-derived `weapon-attack-bonus` (`{ ability: "CHA", min: 1 }`, melee
    // scope) inside the `paladin-devotion-sacred-weapon` `while-active` wrapper
    // (rides only while the feature is lit — mirrors Rage Damage). Narrative
    // halves (prose by doctrine): the optional "deal Radiant instead of its normal
    // type" is a pure damage-TYPE election that changes no number (2024, like 2014,
    // does NOT add Radiant damage — RAW: "its normal damage type OR Radiant
    // Damage"); the 20-ft Bright / 20-ft Dim Light emission is light by doctrine.
    // Activation/duration/cost = the `mechanics` below (free action on the CD
    // tracker). `weapon-attack-bonus` carries the ability-derived amount; the
    // resolver clamps the modifier up to +1 and a per-weapon attackBonusOverride
    // still wins (override-first).
    id: "paladin-devotion-sacred-weapon",
    class: "paladin",
    subclass: "oath-of-devotion",
    level: 3,
    grants: [
      {
        type: "while-active",
        activeKey: "paladin-devotion-sacred-weapon",
        // Fixed 10-minute timer with no per-turn maintenance (like Innate
        // Sorcery / Bladesong) — 10 min = 100 combat rounds, which the turn/round
        // engine counts down and auto-drops at 0. Ends early when re-used, when
        // the player ends it (no action), or when the weapon is no longer carried;
        // those are narrative ends the player triggers by toggling it off.
        duration: { kind: "timed", minutes: 10, maxRounds: 100 },
        grants: [
          {
            // +CHA modifier (minimum +1) to attack rolls with the imbued Melee
            // weapon. Melee scope (RAW imbues a Melee weapon); the resolver clamps
            // `max(CHA mod, 1)` so a CHA-10 paladin still gets +1.
            type: "weapon-attack-bonus",
            amount: { ability: "CHA", min: 1 },
            scope: "melee",
          },
        ],
      },
    ],
    mechanics: {
      actions: [
        {
          // Triggered on the Attack action, so it spends no separate action
          // economy of its own — modelled as a "free" action note that consumes
          // a Channel Divinity use.
          type: "free",
          costTracker: "paladin-channel-divinity",
        },
      ],
    },
    source: "SRD",
  },
  {
    id: "paladin-devotion-aura-of-devotion",
    class: "paladin",
    subclass: "oath-of-devotion",
    level: 7,
    // L5 — immunity to the Charmed condition.
    grants: [{ type: "condition-immunity", condition: "charmed" }],
    source: "SRD",
  },
  {
    // 2024 replaces the 2014 "Purity of Spirit" with "Smite of Protection".
    // dnd2024.wikidot.com/paladin:oath-of-devotion — Level 15.
    id: "paladin-devotion-smite-of-protection",
    class: "paladin",
    subclass: "oath-of-devotion",
    level: 15,
    // The Divine Smite spell is always readied via L2 "Paladin's Smite"
    // (paladin-divine-smite grants always-prepared-spell). The half-cover aura
    // is an emanation tied to combat state — the cover system is resolved by
    // the combat-state layer, so it is left prose-only here (NOTE: no Grant for
    // the +2 AC / +2 DEX-save Half Cover; surface it when the cover/aura combat
    // model lands). We model only the always-readied fact + descriptive note.
    source: "SRD",
  },
  {
    // 2024 rewrite — dnd2024.wikidot.com/paladin:oath-of-devotion, Level 20.
    // Bonus Action toggle; 30-ft Emanation of Bright Light for 10 minutes;
    // Holy Ward (Advantage on saves forced by Fiends/Undead), Radiant Damage
    // (CHA mod + Proficiency Bonus to enemies starting their turn in it — per
    // the wikidot bodyText, NOT a flat 10), and Sunlight. 1/Long Rest, or
    // restore by expending a level-5 spell slot.
    id: "paladin-devotion-holy-nimbus",
    class: "paladin",
    subclass: "oath-of-devotion",
    level: 20,
    // While-active toggle: when on, you have Advantage on saving throws against
    // spells/effects from Fiends and Undead (Holy Ward). The 30-ft radiant
    // emanation (CHA mod + PB, start-of-turn) and the sunlight Bright Light are
    // emanation/combat-state effects — described in prose + the action note;
    // the cover/emanation combat model will surface the recurring damage.
    grants: [
      {
        type: "while-active",
        activeKey: "paladin-devotion-holy-nimbus",
        grants: [
          {
            type: "advantage-on",
            rollType: "save",
            vs: "fiend-undead-saves",
          },
        ],
      },
    ],
    mechanics: {
      // 1/Long Rest; can also be restored by expending a level-5 spell slot.
      tracker: { total: "1", recovery: "long-rest" },
      actions: [
        {
          type: "bonus",
        },
      ],
    },
    source: "SRD",
  },
];
