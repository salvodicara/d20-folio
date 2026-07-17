import type { SrdClassTable, SrdClassFeatureData, SrdClassLevel } from "../types";
import { asProficiencyToken } from "@/lib/proficiency-tokens";
import { proficiencyBonus } from "@/lib/proficiency";

export const FIGHTER_TABLE: SrdClassTable = {
  id: "fighter",
  hitDie: 10,
  primaryAbility: ["STR", "DEX"],
  // #36 — 2024 multiclassing facts (dnd2024.wikidot.com <class>:main,
  // "As a Multiclass Character").
  primaryAbilityMode: "any",
  multiclass: {
    weaponProficiencies: [asProficiencyToken("martial-weapons")],
    armorTraining: [
      asProficiencyToken("light-armor"),
      asProficiencyToken("medium-armor"),
      asProficiencyToken("shields"),
    ],
  },
  savingThrows: ["STR", "CON"],
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
    from: [
      "Acrobatics",
      "Animal Handling",
      "Athletics",
      "History",
      "Insight",
      "Intimidation",
      "Perception",
      "Persuasion",
      "Survival",
    ],
  },
  // 2024 RAW (fighter:main): Choose A, B, or C —
  //   (A) Chain Mail, Greatsword, Flail, 8 Javelins, Dungeoneer's Pack, and 4 GP;
  //   (B) Studded Leather Armor, Scimitar, Shortsword, Longbow, 20 Arrows,
  //       Quiver, Dungeoneer's Pack, and 11 GP; or
  //   (C) 155 GP.
  // The only 3-option class — the shared BackgroundEquipmentOption[] shape
  // carries N options natively, no special-casing.
  startingEquipment: [
    {
      label: "A",
      items: [
        { srdId: "chain-mail" },
        { srdId: "greatsword" },
        { srdId: "flail" },
        { srdId: "javelin", quantity: 8 },
        { srdId: "dungeoneers-pack" },
      ],
      gold: 4,
    },
    {
      label: "B",
      items: [
        { srdId: "studded-leather-armor" },
        { srdId: "scimitar" },
        { srdId: "shortsword" },
        { srdId: "longbow" },
        { srdId: "arrows", quantity: 20 },
        { srdId: "quiver" },
        { srdId: "dungeoneers-pack" },
      ],
      gold: 11,
    },
    { label: "C", items: [], gold: 155 },
  ],
  subclassLevel: 3,
  subclasses: [
    {
      id: "champion",
      featureIds: [
        "fighter-champion-improved-critical",
        "fighter-champion-remarkable-athlete",
        "fighter-champion-additional-fighting-style",
        "fighter-champion-heroic-warrior",
        "fighter-champion-superior-critical",
        "fighter-champion-survivor",
      ],
    },
  ],
  levels: Array.from({ length: 20 }, (_, i) => {
    const level = i + 1;
    const featureIds: string[] = [];
    let asi = false;

    if (level === 1)
      featureIds.push(
        "fighter-fighting-style",
        "fighter-second-wind",
        "fighter-weapon-mastery"
      );
    if (level === 2) featureIds.push("fighter-action-surge", "fighter-tactical-mind");
    if ([4, 6, 8, 12, 14, 16, 19].includes(level)) asi = true;
    if (level === 5) featureIds.push("fighter-extra-attack", "fighter-tactical-shift");
    if (level === 9) featureIds.push("fighter-indomitable", "fighter-tactical-master");
    if (level === 11) featureIds.push("fighter-extra-attack-2");
    if (level === 13) featureIds.push("fighter-studied-attacks");
    if (level === 19) featureIds.push("fighter-epic-boon");
    if (level === 20) featureIds.push("fighter-extra-attack-3");

    // 2024 RAW (fighter:main, Second Wind column): 2 uses, 3 at L4, 4 at L10
    // (matches the fighter-second-wind tracker). The 1/2/3/4 ramp was a 2014 holdover.
    const secondWindUses = level >= 1 ? (level >= 10 ? 4 : level >= 4 ? 3 : 2) : 0;
    const actionSurgeUses = level >= 2 ? (level >= 17 ? 2 : 1) : 0;
    const indomitableUses = level >= 9 ? (level >= 17 ? 3 : level >= 13 ? 2 : 1) : 0;
    const extraAttacks = level >= 20 ? 3 : level >= 11 ? 2 : level >= 5 ? 1 : 0;
    // 2024 RAW (fighter:main, Weapon Mastery column): 3 / 4 (L4) / 5 (L10) / 6 (L16).
    // The count lives on the class table beside the other scaling columns so the
    // picker that reads it stays RAW-correct at every level by construction.
    const weaponMastery = level >= 16 ? 6 : level >= 10 ? 5 : level >= 4 ? 4 : 3;

    const entry: SrdClassLevel = {
      level,
      featureIds,
      proficiencyBonus: proficiencyBonus(level),
      classSpecific: {
        secondWindUses,
        actionSurgeUses,
        indomitableUses,
        extraAttacks,
        weaponMastery,
      },
    };
    if (asi) entry.asi = true;
    return entry;
  }),
};

export const FIGHTER_FEATURES: SrdClassFeatureData[] = [
  {
    // 2024: every class gains an Epic Boon feat at level 19 (not a 5th ASI).
    id: "fighter-epic-boon",
    class: "fighter",
    level: 19,
    source: "SRD",
  },
  {
    id: "fighter-fighting-style",
    class: "fighter",
    level: 1,
    source: "SRD",
  },
  {
    id: "fighter-second-wind",
    class: "fighter",
    level: 1,
    mechanics: {
      tracker: {
        total: "2",
        recovery: "short-rest",
        die: "d10",
        shortRestRecovery: 1,
        levels: [
          { from: 4, total: "3" },
          { from: 10, total: "4" },
        ],
      },
      actions: [
        {
          type: "bonus",
          // Heal chip is DECLARATIVE (was regex-extracted from the EN prose,
          // which leaked "Fighter level" into IT). `class-level` resolves the
          // OWNING class's level (multiclass-correct) and the presenter localizes
          // the word — "1d10 + Fighter level" / "1d10 + livello da Guerriero".
          heal: { dice: "1d10", plus: { kind: "class-level", classId: "fighter" } },
        },
      ],
    },
    source: "SRD",
  },
  {
    id: "fighter-action-surge",
    class: "fighter",
    level: 2,
    mechanics: {
      // H10 — Action Surge: 1 use → 2 uses at level 17.
      tracker: {
        total: "1",
        recovery: "short-rest",
        levels: [{ from: 17, total: "2" }],
      },
      actions: [
        {
          type: "free",
        },
      ],
    },
    // B6 — Action Surge grants ONE additional ACTION this turn. The free action
    // (above) LIGHTS this `while-active` toggle when committed (the activation
    // seam in the turn loop), so `extraActionsThisTurn` reads its `extra-action`
    // grant and raises the action budget to 2 for the turn. The `timed`
    // `maxRounds: 1` duration lets the FRONTIER-S3 turn/round engine AUTO-DROP the
    // toggle at the next End Turn — the extra action is available only THIS turn.
    grants: [
      {
        // The toggle label lives in the SRD i18n catalogue
        // (`fighter-action-surge.grants.0.label`), never inline (golden rule 9 /
        // the no-strings-in-data guard).
        type: "while-active",
        activeKey: "fighter-action-surge",
        duration: { kind: "timed", minutes: 0, maxRounds: 1 },
        grants: [{ type: "extra-action", slot: "action", count: 1 }],
      },
    ],
    source: "SRD",
  },
  {
    id: "fighter-tactical-mind",
    class: "fighter",
    level: 2,
    // G23 — when you FAIL an ability check you can expend a use of Second Wind to
    // roll 1d10 and add it to the check (`checkBonus`). RAW 2024: if the check
    // still fails the Second Wind use is NOT expended (`refundOnFail`). No action
    // economy cost — a "free" choice on a failed check; the spend draws from the
    // Second Wind pool via `costTracker`, so the card shows the live uses + d10.
    // Tactical Shift (the bonus-action half-Speed move on a Second Wind use) stays
    // narrative/positional — out of scope.
    mechanics: {
      actions: [
        {
          type: "free",
          costTracker: "fighter-second-wind",
          checkBonus: { dice: "1d10", refundOnFail: true },
        },
      ],
    },
    source: "SRD",
  },
  {
    id: "fighter-extra-attack",
    class: "fighter",
    level: 5,
    // Fighter also encodes this in `classSpecific.extraAttacks`; `attacksPerAction`
    // takes the MAX of the table count and this grant, so they never double-count.
    grants: [{ type: "extra-attack", count: 1 }],
    source: "SRD",
  },
  {
    id: "fighter-extra-attack-2",
    class: "fighter",
    level: 11,
    grants: [{ type: "extra-attack", count: 2 }],
    source: "SRD",
  },
  {
    id: "fighter-extra-attack-3",
    class: "fighter",
    level: 20,
    grants: [{ type: "extra-attack", count: 3 }],
    source: "SRD",
  },
  {
    id: "fighter-indomitable",
    class: "fighter",
    level: 9,
    mechanics: {
      tracker: {
        total: "1",
        recovery: "long-rest",
        levels: [
          { from: 13, total: "2" },
          { from: 17, total: "3" },
        ],
      },
    },
    source: "SRD",
  },
  {
    id: "fighter-studied-attacks",
    class: "fighter",
    level: 13,
    // 2024 RAW (fighter:main, Level 13: Studied Attacks): "If you make an attack
    // roll against a creature and miss, you have Advantage on your next attack
    // roll against that creature before the end of your next turn." There is NO
    // hit/miss outcome event in the immediate-commit combat model (the engine
    // never learns a roll missed — no dice, golden rule 21), so the engine cannot
    // auto-arm the Advantage. The honest model (cadence-unblocked 2026-06-24) is a
    // player-armed SELF-SIDE toggle (override-first): a `while-active` wrapping an
    // `advantage-on` attack clause the player flips ON after a miss, with a `timed`
    // duration of `maxRounds: 2` — the shipped S3 until-next-turn cadence. The
    // first End Turn (end of THIS turn) decrements 2→1; the next End Turn (end of
    // your NEXT turn) drops it at 0 via `advanceEffectTimers` — exactly "until the
    // end of your next turn". The "against that creature" scoping stays narrative
    // (no modeled enemies). `minutes: 0` marks a sub-minute, round-only timer.
    grants: [
      {
        type: "while-active",
        activeKey: "fighter-studied-attacks",
        grants: [
          {
            type: "advantage-on",
            rollType: "attack",
            vs: "missed-creature",
          },
        ],
        duration: { kind: "timed", minutes: 0, maxRounds: 2 },
      },
    ],
    source: "SRD",
  },
  {
    id: "fighter-weapon-mastery",
    class: "fighter",
    level: 1,
    source: "SRD",
  },
  {
    id: "fighter-tactical-shift",
    class: "fighter",
    level: 5,
    source: "SRD",
  },
  {
    id: "fighter-tactical-master",
    class: "fighter",
    level: 9,
    source: "SRD",
  },
  // Champion subclass features
  {
    id: "fighter-champion-improved-critical",
    class: "fighter",
    subclass: "champion",
    level: 3,
    grants: [{ type: "crit-range", threshold: 19 }],
    source: "SRD",
  },
  {
    id: "fighter-champion-remarkable-athlete",
    class: "fighter",
    subclass: "champion",
    // 2024 RAW (fighter:champion): Remarkable Athlete is a level-3 feature (was level 7 in 2014).
    level: 3,
    // Advantage chips: Initiative + Strength (Athletics) checks; plus the
    // on-crit half-Speed move rider (resolveOnCritMovement consumes the rider).
    grants: [
      {
        type: "advantage-on",
        rollType: "check",
        vs: "initiative",
      },
      {
        type: "advantage-on",
        rollType: "check",
        vs: "athletics",
      },
      // "immediately after you score a Critical Hit, you can move up to half
      // your Speed without provoking Opportunity Attacks" (fighter:champion).
      { type: "on-crit-movement-rider", fraction: "half" },
    ],
    source: "SRD",
  },
  {
    id: "fighter-champion-additional-fighting-style",
    class: "fighter",
    subclass: "champion",
    // 2024 RAW (fighter:champion): Additional Fighting Style is a level-7 feature (was level 10 in 2014).
    level: 7,
    source: "SRD",
  },
  {
    id: "fighter-champion-heroic-warrior",
    class: "fighter",
    subclass: "champion",
    level: 10,
    grants: [{ type: "heroic-inspiration-at-turn-start" }],
    source: "SRD",
  },
  {
    id: "fighter-champion-superior-critical",
    class: "fighter",
    subclass: "champion",
    level: 15,
    grants: [{ type: "crit-range", threshold: 18 }],
    source: "SRD",
  },
  {
    id: "fighter-champion-survivor",
    class: "fighter",
    subclass: "champion",
    level: 18,
    // Survivor is modelled as three declarative facts. Defy Death: the
    // "18-20 = 20" half on the dedicated `death-save-crit-range` primitive
    // (lowers the natural-d20 that a Death Save counts as a 20 — DISTINCT from
    // weapon crit-range), and the Advantage half on the shared `advantage-on`
    // save primitive (same chip pattern as Elf Fey Ancestry / Brave). Heroic
    // Rally: start-of-turn HP regen of 5 + CON modifier, gated on being Bloodied
    // (≤ half HP) with ≥ 1 HP, on the `regen-at-turn-start` primitive
    // (override-first — the consumer surfaces the heal, never auto-applies it).
    grants: [
      { type: "death-save-crit-range", threshold: 18 },
      {
        type: "advantage-on",
        rollType: "save",
        vs: "death-saving-throws",
      },
      {
        type: "regen-at-turn-start",
        amount: "5+CON",
        condition: "bloodied",
        requiresMinHp: true,
      },
    ],
    source: "SRD",
  },
];
