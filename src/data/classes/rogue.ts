import type { SrdClassTable, SrdClassFeatureData, SrdClassLevel } from "../types";
import { asProficiencyToken } from "@/lib/proficiency-tokens";
import { proficiencyBonus } from "@/lib/proficiency";

export const ROGUE_TABLE: SrdClassTable = {
  id: "rogue",
  hitDie: 8,
  primaryAbility: ["DEX"],
  // #36 — 2024 multiclassing facts (dnd2024.wikidot.com <class>:main,
  // "As a Multiclass Character").
  multiclass: {
    armorTraining: [asProficiencyToken("light-armor")],
    toolProficiencies: ["thieves-tools"],
    skillChoice: { count: 1, fromClassList: true },
  },
  savingThrows: ["DEX", "INT"],
  armorProficiencies: [asProficiencyToken("light-armor")],
  // 2024 RAW (rogue:main, Core Rogue Traits → Weapon Proficiencies): "Simple
  // weapons and Martial weapons that have the Finesse or Light property." The
  // compound string reuses the same parser branch as the Monk in
  // `isWeaponProficient` (must contain "martial weapons" + "finesse or light").
  weaponProficiencies: [
    asProficiencyToken("simple-weapons"),
    asProficiencyToken("martial-weapons-finesse-or-light"),
  ],
  skillChoices: {
    count: 4,
    from: [
      "Acrobatics",
      "Athletics",
      "Deception",
      "Insight",
      "Intimidation",
      "Investigation",
      "Perception",
      "Persuasion",
      "Sleight of Hand",
      "Stealth",
    ],
  },
  // 2024 RAW (rogue:main): Choose A or B — (A) Leather Armor, 2 Daggers,
  // Shortsword, Shortbow, 20 Arrows, Quiver, Thieves' Tools, Burglar's Pack,
  // and 8 GP; or (B) 100 GP. (2014 led with a rapier; the 2024 default martial
  // weapon is the Shortsword.)
  startingEquipment: [
    {
      label: "A",
      items: [
        { srdId: "leather-armor" },
        { srdId: "dagger", quantity: 2 },
        { srdId: "shortsword" },
        { srdId: "shortbow" },
        { srdId: "arrows", quantity: 20 },
        { srdId: "quiver" },
        { srdId: "thieves-tools" },
        { srdId: "burglars-pack" },
      ],
      gold: 8,
    },
    { label: "B", items: [], gold: 100 },
  ],
  subclassLevel: 3,
  subclasses: [
    {
      id: "thief",
      featureIds: [
        "rogue-thief-fast-hands",
        "rogue-thief-second-story-work",
        "rogue-thief-supreme-sneak",
        "rogue-thief-use-magic-device",
        "rogue-thief-reflexes",
      ],
    },
  ],
  levels: Array.from({ length: 20 }, (_, i) => {
    const level = i + 1;
    const featureIds: string[] = [];
    let asi = false;

    if (level === 1)
      featureIds.push(
        "rogue-expertise",
        "rogue-sneak-attack",
        "rogue-thieves-cant",
        "rogue-weapon-mastery"
      );
    if (level === 2) featureIds.push("rogue-cunning-action");
    if (level === 3) featureIds.push("rogue-steady-aim");
    if ([4, 8, 10, 12, 16, 19].includes(level)) asi = true;
    if (level === 5) featureIds.push("rogue-uncanny-dodge", "rogue-cunning-strike");
    // 2024 Rogue gains Expertise again at L6 (two more skills) — same feature
    // re-granted, mirroring Bard's L2/L9 Expertise. The Expertise picker fires
    // for each grant occasion at level-up.
    if (level === 6) featureIds.push("rogue-expertise");
    if (level === 7) featureIds.push("rogue-evasion", "rogue-reliable-talent");
    if (level === 11) featureIds.push("rogue-improved-cunning-strike");
    // L13 grants only a Subclass Feature in 2024 — no base class feature. (The
    // former "Subtle Strikes" was non-RAW; removed.)
    if (level === 14) featureIds.push("rogue-devious-strikes");
    if (level === 15) featureIds.push("rogue-slippery-mind");
    if (level === 18) featureIds.push("rogue-elusive");
    if (level === 19) featureIds.push("rogue-epic-boon");
    if (level === 20) featureIds.push("rogue-stroke-of-luck");

    const sneakAttackDice = Math.ceil(level / 2);

    const entry: SrdClassLevel = {
      level,
      featureIds,
      proficiencyBonus: proficiencyBonus(level),
      // 2024 RAW (rogue:main): Weapon Mastery grants 2 weapons with no scaling
      // column — a flat 2 at every level (the table is the single source of truth).
      classSpecific: { sneakAttackDice, weaponMastery: 2 },
    };
    if (asi) entry.asi = true;
    return entry;
  }),
};

export const ROGUE_FEATURES: SrdClassFeatureData[] = [
  {
    // 2024: every class gains an Epic Boon feat at level 19 (not a 5th ASI).
    id: "rogue-epic-boon",
    class: "rogue",
    level: 19,
    source: "SRD",
  },
  {
    id: "rogue-expertise",
    class: "rogue",
    level: 1,
    // Core Rogue trait (2024 rogue:main, Core Rogue Traits → Tool Proficiencies:
    // Thieves' Tools). The class table has no tools field, so the proficiency
    // rides as a `tool-proficiency` grant: it aggregates through evaluateGrants
    // and surfaces via `displayToolProficiencies` (same seam as Assassin's Tools).
    // Set-union dedupes the L6 Expertise re-grant.
    grants: [{ type: "tool-proficiency", tool: "Thieves' Tools" }],
    source: "SRD",
  },
  {
    id: "rogue-sneak-attack",
    class: "rogue",
    level: 1,
    mechanics: {
      // Once per turn (the single "use"); the die field carries the scaling damage
      // (⌈level/2⌉d6) so the actual Sneak Attack dice are visible, not a flat "d6".
      // `recovery: "per-turn"` — the FRONTIER-S3 turn/round engine auto-resets the
      // spent use at the rogue's turn start (no manual un-ticking).
      tracker: {
        total: "1",
        recovery: "per-turn",
        die: "1d6",
        levels: [
          { from: 3, die: "2d6" },
          { from: 5, die: "3d6" },
          { from: 7, die: "4d6" },
          { from: 9, die: "5d6" },
          { from: 11, die: "6d6" },
          { from: 13, die: "7d6" },
          { from: 15, die: "8d6" },
          { from: 17, die: "9d6" },
          { from: 19, die: "10d6" },
        ],
      },
    },
    source: "SRD",
  },
  {
    id: "rogue-thieves-cant",
    class: "rogue",
    level: 1,
    // 2024 RAW (rogue:main, Level 1: Thieves' Cant): "You know Thieves' Cant and
    // one other language of your choice." The secret tongue is AUTO-granted by EN
    // name (the rail localizes it); the free language is a `choice-language` pick
    // (empty options = any language) the level-up picker resolves. Override-first:
    // every language is also freely pickable by hand from the Bio.
    grants: [
      { type: "language", language: "Thieves' Cant" },
      { type: "choice-language", options: [], amount: 1 },
    ],
    source: "SRD",
  },
  {
    id: "rogue-weapon-mastery",
    class: "rogue",
    level: 1,
    source: "SRD",
  },
  {
    id: "rogue-cunning-action",
    class: "rogue",
    level: 2,
    mechanics: {
      actions: [
        {
          type: "bonus",
        },
      ],
    },
    source: "SRD",
  },
  {
    id: "rogue-steady-aim",
    class: "rogue",
    level: 3,
    mechanics: {
      actions: [
        {
          type: "bonus",
        },
      ],
    },
    source: "SRD",
  },
  {
    id: "rogue-uncanny-dodge",
    class: "rogue",
    level: 5,
    mechanics: {
      actions: [
        {
          type: "reaction",
          trigger: "takeDamage",
        },
      ],
    },
    source: "SRD",
  },
  {
    id: "rogue-cunning-strike",
    class: "rogue",
    level: 5,
    // 2024 RAW (rogue:main, Level 5: Cunning Strike). Save DC = 8 + DEX mod + PB
    // (resolved by `resolveCunningStrikeOptions`). The three base options each
    // cost 1d6 of Sneak Attack damage.
    grants: [
      {
        type: "cunning-strike-option",
        optionId: "poison",
        cost: 1,
        save: "CON",
        condition: "poisoned",
      },
      {
        type: "cunning-strike-option",
        optionId: "trip",
        cost: 1,
        save: "DEX",
        condition: "prone",
      },
      {
        type: "cunning-strike-option",
        optionId: "withdraw",
        cost: 1,
      },
    ],
    source: "SRD",
  },
  {
    id: "rogue-evasion",
    class: "rogue",
    level: 7,
    source: "SRD",
  },
  {
    id: "rogue-reliable-talent",
    class: "rogue",
    level: 7,
    // Roll FLOOR on proficient ability checks (treat a d20 ≤9 as 10) → `roll-floor`.
    // Surfaced as a passive note in the rail (engine rolls no dice).
    grants: [
      {
        type: "roll-floor",
        rollType: "check",
        floor: 10,
        appliesTo: "proficient",
      },
    ],
    source: "SRD",
  },
  {
    id: "rogue-improved-cunning-strike",
    class: "rogue",
    level: 11,
    // 2024 RAW (rogue:main, Improved Cunning Strike): use up to TWO Cunning
    // Strike effects (pay each die cost). The Daze/Knock Out/Obscure effect list
    // belongs to Devious Strikes (L14) — the prior L11 text was simply wrong. No
    // grant kind models the Cunning Strike effects, so this is a text-only fix.
    source: "SRD",
  },
  {
    id: "rogue-devious-strikes",
    class: "rogue",
    level: 14,
    // 2024 RAW (rogue:main, Level 14: Devious Strikes). Three more Cunning
    // Strike options, all CON/DEX save vs DC 8 + DEX mod + PB.
    grants: [
      {
        type: "cunning-strike-option",
        optionId: "daze",
        cost: 2,
        save: "CON",
      },
      {
        type: "cunning-strike-option",
        optionId: "knock-out",
        cost: 6,
        save: "CON",
        condition: "unconscious",
      },
      {
        type: "cunning-strike-option",
        optionId: "obscure",
        cost: 3,
        save: "DEX",
        condition: "blinded",
      },
    ],
    source: "SRD",
  },
  {
    id: "rogue-slippery-mind",
    class: "rogue",
    level: 15,
    grants: [
      { type: "save-proficiency", ability: "WIS" },
      { type: "save-proficiency", ability: "CHA" },
    ],
    source: "SRD",
  },
  {
    id: "rogue-elusive",
    class: "rogue",
    level: 18,
    source: "SRD",
  },
  {
    id: "rogue-stroke-of-luck",
    class: "rogue",
    level: 20,
    mechanics: {
      tracker: { total: "1", recovery: "short-rest" },
    },
    source: "SRD",
  },
  // Thief subclass features
  {
    id: "rogue-thief-fast-hands",
    class: "rogue",
    subclass: "thief",
    level: 3,
    // 2024 RAW (rogue:thief, Fast Hands): use the Cunning Action Bonus Action to
    // make a Sleight of Hand check, use Thieves' Tools, or take the Use an Object
    // action — surfaced as a Bonus-Action row on the Play board.
    mechanics: {
      actions: [{ type: "bonus" }],
    },
    source: "SRD",
  },
  {
    id: "rogue-thief-second-story-work",
    class: "rogue",
    subclass: "thief",
    level: 3,
    // 2024 RAW (rogue:thief, Level 3: Second-Story Work). Climber → a Climb Speed
    // equal to walking Speed (the `climb-speed` grant with the "equal-to-walking"
    // sentinel, resolved against walking Speed at render). Jumper (jump distance
    // from DEX) has no grant kind, so it stays prose by design.
    grants: [{ type: "climb-speed", amount: "equal-to-walking" }],
    source: "SRD",
  },
  {
    id: "rogue-thief-supreme-sneak",
    class: "rogue",
    subclass: "thief",
    level: 9,
    // 2024 RAW (rogue:thief, Level 9: Supreme Sneak). The 2014 version
    // ("Advantage on Stealth if you move ≤ half speed") was replaced wholesale:
    // Supreme Sneak now grants a NEW Cunning Strike option (cost 1d6, no save).
    grants: [
      {
        type: "cunning-strike-option",
        optionId: "stealth-attack",
        cost: 1,
      },
    ],
    source: "SRD",
  },
  {
    id: "rogue-thief-use-magic-device",
    class: "rogue",
    subclass: "thief",
    level: 13,
    // 2024 RAW (rogue:thief, Level 13: Use Magic Device). Attunement → raise the
    // attunement-slot cap to 4 (the `attunement-slots` grant; merge = MAX). The
    // Charges (roll 1d6) and Spell Scrolls clauses have no grant kind — and the
    // engine never rolls dice — so they stay prose by design.
    grants: [{ type: "attunement-slots", amount: 4 }],
    source: "SRD",
  },
  {
    id: "rogue-thief-reflexes",
    class: "rogue",
    subclass: "thief",
    level: 17,
    source: "SRD",
  },
];
