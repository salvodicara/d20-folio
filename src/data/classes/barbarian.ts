import type { SrdClassTable, SrdClassFeatureData, SrdClassLevel } from "../types";
import { asProficiencyToken } from "@/lib/proficiency-tokens";
import { proficiencyBonus } from "@/lib/proficiency";

export const BARBARIAN_TABLE: SrdClassTable = {
  id: "barbarian",
  hitDie: 12,
  primaryAbility: ["STR"],
  // #36 — 2024 multiclassing facts (dnd2024.wikidot.com <class>:main,
  // "As a Multiclass Character").
  multiclass: {
    weaponProficiencies: [asProficiencyToken("martial-weapons")],
    armorTraining: [asProficiencyToken("shields")],
  },
  savingThrows: ["STR", "CON"],
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
    count: 2,
    from: [
      "Animal Handling",
      "Athletics",
      "Intimidation",
      "Nature",
      "Perception",
      "Survival",
    ],
  },
  // 2024 RAW (barbarian:main): Choose A or B — (A) Greataxe, 4 Handaxes,
  // Explorer's Pack, and 15 GP; or (B) 75 GP.
  startingEquipment: [
    {
      label: "A",
      items: [
        { srdId: "greataxe" },
        { srdId: "handaxe", quantity: 4 },
        { srdId: "explorers-pack" },
      ],
      gold: 15,
    },
    { label: "B", items: [], gold: 75 },
  ],
  subclassLevel: 3,
  subclasses: [
    {
      id: "berserker",
      featureIds: [
        "barbarian-berserker-frenzy",
        "barbarian-berserker-mindless-rage",
        "barbarian-berserker-intimidating-presence",
        "barbarian-berserker-retaliation",
      ],
    },
  ],
  levels: Array.from({ length: 20 }, (_, i) => {
    const level = i + 1;
    const featureIds: string[] = [];
    let asi = false;

    if (level === 1)
      featureIds.push(
        "barbarian-rage",
        "barbarian-unarmored-defense",
        "barbarian-weapon-mastery"
      );
    if (level === 2)
      featureIds.push("barbarian-danger-sense", "barbarian-reckless-attack");
    if (level === 3) featureIds.push("barbarian-primal-knowledge");
    if ([4, 8, 12, 16, 19].includes(level)) asi = true;
    if (level === 5) featureIds.push("barbarian-extra-attack", "barbarian-fast-movement");
    if (level === 7)
      featureIds.push("barbarian-feral-instinct", "barbarian-instinctive-pounce");
    if (level === 9) featureIds.push("barbarian-brutal-strike");
    if (level === 11) featureIds.push("barbarian-relentless-rage");
    if (level === 13) featureIds.push("barbarian-improved-brutal-strike");
    if (level === 15) featureIds.push("barbarian-persistent-rage");
    if (level === 17) featureIds.push("barbarian-greater-brutal-strike");
    if (level === 18) featureIds.push("barbarian-indomitable-might");
    if (level === 19) featureIds.push("barbarian-epic-boon");
    if (level === 20) featureIds.push("barbarian-primal-champion");

    // 2024 rage uses: 2 / 3 (L3) / 4 (L6) / 5 (L12) / 6 (L17+). 2014's "Unlimited"
    // at L20 was removed in 2024 — the cap is 6.
    const rages = level >= 17 ? 6 : level >= 12 ? 5 : level >= 6 ? 4 : level >= 3 ? 3 : 2;
    const rageDamage = level >= 16 ? 4 : level >= 9 ? 3 : 2;
    // 2024 RAW (barbarian:main, Weapon Mastery column): 2 / 3 (L4) / 4 (L10). The
    // count lives HERE on the class table (the single source of truth, beside the
    // other scaling columns), so the picker that reads it can never drift from RAW.
    const weaponMastery = level >= 10 ? 4 : level >= 4 ? 3 : 2;

    const entry: SrdClassLevel = {
      level,
      featureIds,
      proficiencyBonus: proficiencyBonus(level),
      classSpecific: {
        rages,
        rageDamage,
        weaponMastery,
        // L11 Relentless Rage derived-chip inputs (read by the feature's
        // `mechanics.rider`, only surfaced from L11): the INITIAL Constitution
        // save DC (a flat 10 — the +5-per-use escalation + rest-reset stay in the
        // description prose; a live use-counter→DC display is a deferred primitive)
        // and the on-success revive Hit Points = TWICE the Barbarian level
        // (2024 RAW: barbarian:main, Level 11). No dice (golden rule 21).
        relentlessRageDc: 10,
        relentlessRageHp: level * 2,
      },
    };
    if (asi) entry.asi = true;
    return entry;
  }),
};

export const BARBARIAN_FEATURES: SrdClassFeatureData[] = [
  {
    // 2024: every class gains an Epic Boon feat at level 19 (not a 5th ASI).
    id: "barbarian-epic-boon",
    class: "barbarian",
    level: 19,
    source: "SRD",
  },
  {
    id: "barbarian-rage",
    class: "barbarian",
    level: 1,
    // L11 — Rage's benefits apply only while raging ("barbarian-rage" in the
    // session active set — lit automatically when the Rage action is used).
    // The Rage Damage bonus is the `weapon-damage-bonus` below: it reads the
    // SAME class-table `classSpecific.rageDamage` the tracker `rider` chip
    // shows (2/3/4 — single source of truth) and rides every Strength-based
    // attack (weapon, thrown, Unarmed Strike) while active (issue #27).
    grants: [
      {
        type: "while-active",
        activeKey: "barbarian-rage",
        // 2024 RAW (barbarian:main → Duration): "The Rage lasts until the end of
        // your next turn … you can extend the Rage for another round by [making
        // an attack roll against an enemy / forcing an enemy to make a save /
        // TAKING DAMAGE / taking a Bonus Action to extend it]. … You can maintain
        // a Rage for up to 10 minutes." Ends early on Heavy armor or the
        // Incapacitated condition. Declared as DATA — the turn loop enforces it
        // generically (`"damage-taken"` is auto-detected from the HP setter, so a
        // round in which the barbarian was hit keeps the Rage with zero taps).
        duration: {
          kind: "maintained",
          maintainedBy: ["attack", "damage-taken", "bonus-extend"],
          maxMinutes: 10,
          // FRONTIER-S3 — the same 10-minute cap in combat ROUNDS. RAW: "up to 10
          // minutes"; a round is 6 seconds, so 10 min = 100 rounds. The turn/round
          // engine counts the Rage down over its full 100-round lifetime.
          maxRounds: 100,
          endsEarlyOn: ["heavy-armor", "incapacitated"],
        },
        grants: [
          { type: "damage-resistance", damageType: "bludgeoning" },
          { type: "damage-resistance", damageType: "piercing" },
          { type: "damage-resistance", damageType: "slashing" },
          {
            type: "advantage-on",
            rollType: "check",
            vs: "str",
          },
          {
            type: "advantage-on",
            rollType: "save",
            vs: "str",
          },
          // Rage Damage (#27) — LAST in this list: the advantage-on grants
          // above carry POSITIONAL catalogue description keys
          // (`grants.0.grants.<i>`), so new text-free grants append.
          { type: "weapon-damage-bonus", sourceKey: "rageDamage", scope: "strength" },
        ],
      },
    ],
    mechanics: {
      tracker: {
        total: "2",
        // 2024 RAW (barbarian:main, Level 1: Rage): "You regain one expended use
        // when you finish a Short Rest, and you regain all expended uses when you
        // finish a Long Rest." Mirror Druid Wild Shape — full recovery on a Long
        // Rest + a partial 1-use recovery on a Short Rest.
        recovery: "short-rest",
        shortRestRecovery: 1,
        levels: [
          { from: 3, total: "3" },
          { from: 6, total: "4" },
          { from: 12, total: "5" },
          { from: 17, total: "6" },
        ],
      },
      actions: [
        {
          type: "bonus",
        },
      ],
      rider: {
        sourceKey: "rageDamage",
        format: "additive",
      },
    },
    source: "SRD",
  },
  {
    id: "barbarian-unarmored-defense",
    class: "barbarian",
    level: 1,
    grants: [
      {
        // Barbarian Unarmored Defense — 10 + DEX + CON, shield allowed
        // (RAW: "You can use a shield and still gain this benefit"). The
        // existing computeAC shield-stacking path adds the shield bonus
        // on top, matching RAW.
        type: "ac-formula",
        base: 10,
        bonuses: ["DEX", "CON"],
        condition: "no-armor",
      },
    ],
    source: "SRD",
  },
  {
    id: "barbarian-weapon-mastery",
    class: "barbarian",
    level: 1,
    source: "SRD",
  },
  {
    id: "barbarian-primal-knowledge",
    class: "barbarian",
    level: 3,
    // 2024 RAW (barbarian:main, Level 3: Primal Knowledge): ONE skill from the
    // Barbarian level-1 list + the "Strength-check while Raging" ability. There
    // is NO second skill at Level 10 (the gap's claim was a 2014-ism — verified
    // against the Barbarian Features table, where Level 10 is "Subclass feature"
    // only). The prior description's "At 10th level, you gain proficiency in
    // another such skill" clause was wrong and is removed. The Strength-check-
    // while-Raging ability has no D20-derived grant kind and stays as prose.
    grants: [
      {
        type: "choice-skill-proficiency",
        options: [
          "animal-handling",
          "athletics",
          "intimidation",
          "nature",
          "perception",
          "survival",
        ],
        amount: 1,
      },
    ],
    source: "SRD",
  },
  {
    id: "barbarian-danger-sense",
    class: "barbarian",
    level: 2,
    // 2024 RAW: Advantage on DEX saves, suppressed only while Incapacitated (2014
    // also listed Blinded/Deafened). The engine can't auto-suppress it — that caveat
    // stays in the prose. Surfaced in the rail's Advantages section via `deriveAdvantageChips`.
    grants: [
      {
        type: "advantage-on",
        rollType: "save",
        vs: "dex-save",
      },
    ],
    source: "SRD",
  },
  {
    id: "barbarian-reckless-attack",
    class: "barbarian",
    level: 2,
    // 2024 RAW (barbarian:main, Level 2: Reckless Attack): "When you make your
    // first attack roll on your turn, you can decide to attack recklessly, giving
    // you Advantage on attack rolls using Strength until the start of your next
    // turn, but attack rolls against you have Advantage during that time." Wired as
    // a `while-active` toggle (own key) wrapping TWO clauses, so declaring Reckless
    // lights BOTH: the offensive `advantage-on` STR-attack chip AND the SELF-side
    // `incoming-attack-advantage` downside reminder (attacks against you have
    // Advantage). The downside is a player-facing note — no enemy/target modeling.
    grants: [
      {
        type: "while-active",
        activeKey: "barbarian-reckless-attack",
        grants: [
          {
            type: "advantage-on",
            rollType: "attack",
            vs: "strength-attacks",
          },
          { type: "incoming-attack-advantage" },
        ],
      },
    ],
    source: "SRD",
  },
  {
    id: "barbarian-extra-attack",
    class: "barbarian",
    level: 5,
    grants: [{ type: "extra-attack", count: 1 }],
    source: "SRD",
  },
  {
    id: "barbarian-fast-movement",
    class: "barbarian",
    level: 5,
    // Static +10 ft speed — declared via the standard grants pipeline; the
    // sheet header sums these into `formatSpeed`'s `bonusFt`. The
    // "not wearing heavy armor" condition is not auto-enforced (would
    // require a per-equipped-piece check); the player can override the
    // displayed Speed if they're in plate.
    grants: [{ type: "speed", amount: 10 }],
    source: "SRD",
  },
  {
    id: "barbarian-feral-instinct",
    class: "barbarian",
    level: 7,
    // 2024 RAW (barbarian:main, Level 7: Feral Instinct): "you have Advantage on
    // Initiative rolls." Initiative is a DEX check the engine computes separately
    // (`computeInitiative`); its advantage half rides this `advantage-on` grant
    // with `rollType: "initiative"` and is read off the aggregate by
    // `hasInitiativeAdvantage` (mirrors the Assassin's Assassinate wiring).
    grants: [
      {
        type: "advantage-on",
        rollType: "initiative",
        vs: "initiative",
      },
    ],
    source: "SRD",
  },
  {
    id: "barbarian-instinctive-pounce",
    class: "barbarian",
    level: 7,
    source: "SRD",
  },
  {
    id: "barbarian-brutal-strike",
    class: "barbarian",
    level: 9,
    source: "SRD",
  },
  {
    id: "barbarian-improved-brutal-strike",
    class: "barbarian",
    level: 13,
    source: "SRD",
  },
  {
    id: "barbarian-greater-brutal-strike",
    class: "barbarian",
    level: 17,
    source: "SRD",
  },
  {
    id: "barbarian-relentless-rage",
    class: "barbarian",
    level: 11,
    // 2024 RAW (barbarian:main, Level 11 — Relentless Rage): while Raging, on
    // dropping to 0 HP (and not dying outright) you may make a DC 10 Constitution
    // saving throw; on a success your Hit Points become TWICE your Barbarian
    // level. The DC starts at 10 and rises +5 for each use after the first,
    // resetting on a Short or Long Rest. Two DERIVED chips (`mechanics.rider`,
    // reading the class-table `classSpecific`) surface the cleanly-modelable
    // facts: the initial CON save DC (10) and the on-success revive HP
    // (2 × Barbarian level). The former placeholder tracker (total:1/short-rest)
    // MISMODELED an UNLIMITED-use feature as 1/rest — dangerously implying
    // "already used, can't survive again" — and is removed. The +5-per-use
    // escalation + rest-reset stay in the description prose; a LIVE escalating-DC
    // display (a use-counter→DC value) is a deferred primitive (no dice, GR21).
    mechanics: {
      rider: {
        sourceKey: "relentlessRageDc",
        format: "passthrough",
        extra: [{ sourceKey: "relentlessRageHp", format: "passthrough" }],
      },
    },
    source: "SRD",
  },
  {
    id: "barbarian-persistent-rage",
    class: "barbarian",
    level: 15,
    // PROSE-SWEPT 2026-06-10 — "When you roll Initiative, you can regain all
    // expended uses of Rage" (1/Long Rest): the initiative-tracker-topup
    // consumer clamps `upTo` to the live total, so 6 (the L17+ cap) restores
    // to FULL at any level. The once-per-Long-Rest limit on the top-up itself
    // stays player-adjudicated (override-first); the 10-minute Rage duration
    // is descriptive.
    grants: [{ type: "initiative-tracker-topup", trackerId: "barbarian-rage", upTo: 6 }],
    source: "SRD",
  },
  {
    id: "barbarian-indomitable-might",
    class: "barbarian",
    level: 18,
    source: "SRD",
  },
  {
    id: "barbarian-primal-champion",
    class: "barbarian",
    level: 20,
    // L7 lever — class-feature ability-score grant, auto-applied at level-up
    // (raising CON also bumps max HP retroactively; see applyClassFeatureAbilityScores).
    grants: [
      { type: "ability-score", ability: "STR", amount: 4, cap: 25 },
      { type: "ability-score", ability: "CON", amount: 4, cap: 25 },
    ],
    source: "SRD",
  },
  // Berserker subclass features
  {
    id: "barbarian-berserker-frenzy",
    class: "barbarian",
    subclass: "berserker",
    level: 3,
    // Dynamic damage rider: the d6 count scales with the Rage Damage bonus,
    // resolved at the character's level by `resolveRiderDice`. `dice` is the
    // L1 fallback. `damageType` shows the modal Strength-weapon type
    // (slashing — greataxe/greatsword); RAW the type matches the weapon used.
    // RAW (barbarian:path-of-the-berserker, L3 Frenzy): the extra damage applies
    // only "if you use Reckless Attack WHILE YOUR RAGE IS ACTIVE" — so the rider
    // is wrapped in the `barbarian-rage` `while-active` block (an inactive
    // while-active drops its inner grants), mirroring Zealot Divine Fury. The
    // "used Reckless Attack" condition stays narrative (no reckless-hit event).
    grants: [
      {
        type: "while-active",
        activeKey: "barbarian-rage",
        grants: [
          {
            type: "damage-rider",
            dice: "2d6",
            diceByLevel: { 1: "2d6", 9: "3d6", 16: "4d6" },
            damageType: "slashing",
            appliesTo: "melee-weapon",
            oncePerTurn: true,
          },
        ],
      },
    ],
    source: "SRD",
  },
  {
    id: "barbarian-berserker-mindless-rage",
    class: "barbarian",
    subclass: "berserker",
    level: 6,
    // L11 — Immunity applies only WHILE the Rage is active, so it gates on the
    // shared `barbarian-rage` toggle (same key the base Rage feature uses). When
    // Rage is on, Charmed/Frightened immunities light up in the aggregate.
    grants: [
      {
        type: "while-active",
        activeKey: "barbarian-rage",
        grants: [
          { type: "condition-immunity", condition: "charmed" },
          { type: "condition-immunity", condition: "frightened" },
        ],
      },
    ],
    source: "SRD",
  },
  {
    id: "barbarian-berserker-intimidating-presence",
    class: "barbarian",
    subclass: "berserker",
    // 2024 RAW (barbarian:berserker): Intimidating Presence is a level-14 feature
    // (was level 10 in 2014). The 2024 version is a Bonus Action that frightens
    // every chosen enemy in a 30-ft Emanation on a failed WIS save (DC = 8 + STR
    // mod + PB), usable 1/Long Rest or by expending a use of Rage — mirrors the
    // Zealot's Zealous Presence modelling (tracker 1/long-rest + bonus action).
    level: 14,
    mechanics: {
      tracker: { total: "1", recovery: "long-rest" },
      actions: [
        {
          type: "bonus",
        },
      ],
    },
    source: "SRD",
  },
  {
    id: "barbarian-berserker-retaliation",
    class: "barbarian",
    subclass: "berserker",
    // 2024 RAW (barbarian:berserker): Retaliation is a level-10 feature (was level 14 in 2014).
    level: 10,
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
];
