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
    grants: [
      {
        type: "damage-rider",
        dice: "1d6",
        diceByLevel: {
          3: "2d6",
          5: "3d6",
          7: "4d6",
          9: "5d6",
          11: "6d6",
          13: "7d6",
          15: "8d6",
          17: "9d6",
          19: "10d6",
        },
        damageType: "same-as-weapon",
        appliesTo: "finesse-or-ranged-weapon",
        oncePerTurn: true,
        resourceCost: { trackerId: "rogue-sneak-attack" },
      },
    ],
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
          id: "dash",
          type: "bonus",
          economyCategory: "dash",
        },
        {
          id: "disengage",
          type: "bonus",
          economyCategory: "disengage",
        },
        {
          id: "hide",
          type: "bonus",
          economyCategory: "hide",
          skillCheck: { dc: 15, skill: "stealth" },
          // 2024 (Hide action): a passed DC 15 DEX (Stealth) check grants the
          // Invisible condition; its end (attacking, casting, being found) is
          // circumstance-owned, so the lifetime stays with the table.
          conditionApplication: { options: ["invisible"], on: "passed-check" },
          targeting: { affinity: "self", maxTargets: 1 },
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
          grantsNextAttackAdvantage: true,
          locksMovement: true,
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
          // The click affirms the table-only visibility fact; the trigger still
          // excludes saves, hazards, and automatic damage at the data boundary.
          trigger: "hitByAttack",
          targeting: { affinity: "self", maxTargets: 1 },
          // The canonical-runtime authored program (supersedes `effectProgram`):
          // declaring the reaction claims the round's Reaction slot; the
          // damage-taken phase compiles the exact compensating reduction —
          // reduce the triggering attack's damage by ⌈half⌉, so the rogue TAKES
          // ⌊half⌋ (2024 RAW halving rounds down) — bounded by the triggering
          // resolution's effective damage, then the spent reaction ends. Fired
          // by the damage-entry runtime (`lib/damage-reaction.ts`), which
          // composes the table-entered hit around this program so the whole
          // exchange commits as ONE causal action; the attack-delivered fact is
          // affirmed by the player's pick, exactly like the legacy card's click.
          mechanicsProgram: {
            id: "action:rogue-uncanny-dodge:0",
            phases: [
              {
                inputs: [],
                phaseId: "resolve",
                steps: [
                  {
                    claim: {
                      claimId: "reaction.rogue-uncanny-dodge.0",
                      kind: "claim-reaction",
                      reaction: {
                        kind: "program",
                        // Must equal `damageReactionClaimId("rogue-uncanny-dodge",
                        // action, 0)` — the projection's requirement roster and
                        // this claim share that one identity (guard-tested).
                        requirementId: "reaction.rogue-uncanny-dodge.0",
                      },
                    },
                    combatant: "caster",
                    kind: "turn-claim",
                    stepId: "claim-reaction",
                    when: null,
                  },
                ],
                trigger: { kind: "invocation" },
              },
              {
                inputs: [],
                phaseId: "deflect",
                steps: [
                  {
                    amount: {
                      expression: {
                        dividend: { bindingId: "trigger.damage", kind: "binding" },
                        divisor: { kind: "fixed", value: 2 },
                        kind: "divide",
                        rounding: "ceil",
                      },
                      kind: "integer",
                    },
                    kind: "incoming-damage-adjustment",
                    selector: {
                      damageTypes: [],
                      deliveries: ["attack"],
                      forbiddenTraits: [],
                      requiredTraits: [],
                    },
                    sourceId: "reaction.rogue-uncanny-dodge.0",
                    stepId: "halve",
                    when: null,
                  },
                  { kind: "end-program", stepId: "spent", when: null },
                ],
                trigger: { kind: "damage-taken", target: "caster" },
              },
            ],
            registers: [],
            version: 1,
          },
          effectProgram: {
            version: 1,
            id: "feature.rogue-uncanny-dodge",
            phases: [
              {
                id: "resolve",
                trigger: { kind: "resolve" },
                steps: [
                  {
                    id: "halve-attack-damage",
                    kind: "damage-reduction",
                    scope: "program",
                    subject: "source",
                    amount: {
                      kind: "binding",
                      binding: "triggering-damage",
                      multiplier: 0.5,
                      rounding: "ceil",
                    },
                  },
                ],
              },
            ],
          },
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
    grants: [
      {
        type: "save-damage-rule",
        ability: "DEX",
        requiresDamageOnSuccess: "half",
        onSuccess: "none",
        onFailure: "half",
        suppressedByConditions: ["incapacitated"],
      },
    ],
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
