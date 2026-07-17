import type { SrdClassTable, SrdClassFeatureData, SrdClassLevel } from "../types";
import { asProficiencyToken } from "@/lib/proficiency-tokens";
import { ARTISAN_TOOL_IDS, MUSICAL_INSTRUMENT_IDS } from "@/lib/tools";
import { proficiencyBonus } from "@/lib/proficiency";

export const MONK_TABLE: SrdClassTable = {
  id: "monk",
  hitDie: 8,
  primaryAbility: ["DEX", "WIS"],
  savingThrows: ["STR", "DEX"],
  armorProficiencies: [],
  // 2024 RAW (monk:main): Simple weapons + Martial weapons with the Light
  // property (NOT Finesse — that's the Rogue's set).
  weaponProficiencies: [
    asProficiencyToken("simple-weapons"),
    asProficiencyToken("martial-weapons-light"),
  ],
  skillChoices: {
    count: 2,
    from: ["Acrobatics", "Athletics", "History", "Insight", "Religion", "Stealth"],
  },
  // 2024 RAW (monk:main) Tool Proficiencies: "Choose one type of Artisan's Tools
  // or Musical Instrument." Modelled as a level-1 `choice-tool-proficiency` grant
  // so the proficiency is DERIVED + surfaced as a creation pick; the chosen
  // tool's ITEM is appended to the Option-A package at creation (one pick → both
  // surfaces, golden rule 6).
  grants: [
    {
      type: "choice-tool-proficiency",
      options: [...ARTISAN_TOOL_IDS, ...MUSICAL_INSTRUMENT_IDS],
      amount: 1,
    },
  ],
  // 2024 RAW (monk:main): Choose A or B — (A) Spear, 5 Daggers, the Artisan's
  // Tools or Musical Instrument chosen for the tool proficiency above,
  // Explorer's Pack, and 11 GP; or (B) 50 GP. The chosen tool is a FIRST-CLASS
  // pack member via the `fromToolChoice` marker — it resolves against the
  // `choice-tool-proficiency` grant below (one pick → both the proficiency AND
  // the visible pack item), so the wizard preview shows it and the created
  // character receives it EXACTLY once (golden rule 6).
  startingEquipment: [
    {
      label: "A",
      items: [
        { srdId: "spear" },
        { srdId: "dagger", quantity: 5 },
        { fromToolChoice: true },
        { srdId: "explorers-pack" },
      ],
      gold: 11,
    },
    { label: "B", items: [], gold: 50 },
  ],
  subclassLevel: 3,
  subclasses: [
    {
      id: "open-hand",
      featureIds: [
        "monk-open-hand-technique",
        "monk-open-hand-wholeness-of-body",
        "monk-open-hand-fleet-step",
        "monk-open-hand-quivering-palm",
      ],
    },
  ],
  levels: Array.from({ length: 20 }, (_, i) => {
    const level = i + 1;
    const featureIds: string[] = [];
    let asi = false;

    if (level === 1) featureIds.push("monk-martial-arts", "monk-unarmored-defense");
    if (level === 2)
      featureIds.push(
        "monk-focus",
        "monk-unarmored-movement",
        "monk-uncanny-metabolism",
        "monk-flurry-of-blows",
        "monk-patient-defense",
        "monk-step-of-the-wind"
      );
    if (level === 3) featureIds.push("monk-deflect-attacks");
    if ([4, 8, 12, 16, 19].includes(level)) asi = true;
    if (level === 4) featureIds.push("monk-slow-fall");
    if (level === 5) featureIds.push("monk-extra-attack", "monk-stunning-strike");
    if (level === 6) featureIds.push("monk-empowered-strikes");
    if (level === 7) featureIds.push("monk-evasion");
    if (level === 9) featureIds.push("monk-acrobatic-movement");
    if (level === 10) featureIds.push("monk-self-restoration", "monk-heightened-focus");
    if (level === 13) featureIds.push("monk-deflect-energy");
    if (level === 14) featureIds.push("monk-disciplined-survivor");
    if (level === 15) featureIds.push("monk-perfect-focus");
    // 2024 RAW (dnd2024.wikidot.com/monk:main): Superior Defense is L18,
    // Body and Mind is the L20 capstone. (Prior data mis-leveled both:
    // SD at 17, B&M at 18.) L17 has no base-class feature.
    if (level === 18) featureIds.push("monk-superior-defense");
    if (level === 19) featureIds.push("monk-epic-boon");
    if (level === 20) featureIds.push("monk-body-and-mind");

    const martialArtsDie =
      level >= 17 ? "d12" : level >= 11 ? "d10" : level >= 5 ? "d8" : "d6";
    const unarmoredMovement =
      level >= 18
        ? 30
        : level >= 14
          ? 25
          : level >= 10
            ? 20
            : level >= 6
              ? 15
              : level >= 2
                ? 10
                : 0;

    const entry: SrdClassLevel = {
      level,
      featureIds,
      proficiencyBonus: proficiencyBonus(level),
      classSpecific: { focusPoints: level, martialArtsDie, unarmoredMovement },
    };
    if (asi) entry.asi = true;
    return entry;
  }),
};

export const MONK_FEATURES: SrdClassFeatureData[] = [
  {
    // 2024: every class gains an Epic Boon feat at level 19 (not a 5th ASI).
    id: "monk-epic-boon",
    class: "monk",
    level: 19,
    source: "SRD",
  },
  {
    id: "monk-martial-arts",
    class: "monk",
    level: 1,
    mechanics: {
      actions: [
        {
          type: "bonus",
        },
      ],
      rider: {
        sourceKey: "martialArtsDie",
        format: "passthrough",
      },
    },
    // The general unarmed-strike-die primitive. Monk can USE DEX in place of
    // STR for the attack + damage rolls (best-of) and rolls the Martial Arts
    // die — resolved from the class table's martialArtsDie classSpecific key
    // (d6→d12) by `effectiveUnarmedStrike`. Subsumes the per-class workaround;
    // the `rider` above still drives the Features-page die chip independently.
    grants: [
      {
        type: "unarmed-strike-die",
        die: "classSpecific:martialArtsDie",
        attackAbility: "DEX",
        damageAbility: "DEX",
        damageType: "bludgeoning",
      },
      // "...use Dexterity for attack and damage rolls with MONK WEAPONS." Scoped
      // to Monk weapons (Simple Melee + Light Martial Melee) so DEX never leaks
      // to a Greatsword; the attack-row resolver takes best-of DEX vs the
      // weapon's default. (Unarmed strikes are covered by `unarmed-strike-die`.)
      // `dieUpgrade` carries the Martial Arts die: RAW "roll [the MA die] in place
      // of the normal damage of your Unarmed Strike OR Monk weapon" — the larger
      // die wins (a Dagger 1d4 → 1d6 at L1, a Shortsword 1d6 → 1d8 at L5),
      // resolved per the Monk's level (`effectiveWeaponDie`, multiclass-correct).
      {
        type: "weapon-attack-ability",
        ability: "DEX",
        weaponScope: "monk-melee",
        dieUpgrade: "classSpecific:martialArtsDie",
      },
    ],
    source: "SRD",
  },
  {
    id: "monk-unarmored-defense",
    class: "monk",
    level: 1,
    // Declarative AC formula: computeAC reads from features' grants
    // instead of a hardcoded id → ability map. The "no-armor-no-shield"
    // condition correctly forbids a Monk from stacking the UD with a
    // shield (a bug in the previous code path that would still grant
    // the Monk's UD + the shield bonus).
    grants: [
      {
        type: "ac-formula",
        base: 10,
        bonuses: ["DEX", "WIS"],
        condition: "no-armor-no-shield",
      },
    ],
    source: "SRD",
  },
  {
    id: "monk-focus",
    class: "monk",
    level: 2,
    mechanics: {
      tracker: { total: "level", recovery: "short-rest", isPool: true, unit: "points" },
    },
    source: "SRD",
  },
  {
    id: "monk-uncanny-metabolism",
    class: "monk",
    level: 2,
    // 2024 RAW (monk:main, Level 2): "When you roll Initiative, you can regain
    // all expended Focus Points" (once per Long Rest). Wired via the shared
    // `initiative-tracker-topup` primitive (Bard/Barbarian/Druid) targeting the
    // `monk-focus` pool — `upTo: 20` caps to the tracker total (= Monk level),
    // so it restores ALL expended points. The companion Martial-Arts-die + level
    // HP heal is a dice roll (golden rule 21) and stays override-first/narrative.
    grants: [{ type: "initiative-tracker-topup", trackerId: "monk-focus", upTo: 20 }],
    mechanics: {
      tracker: { total: "1", recovery: "long-rest" },
    },
    source: "SRD",
  },
  {
    id: "monk-flurry-of-blows",
    class: "monk",
    level: 2,
    mechanics: {
      actions: [
        {
          type: "bonus",
          costTracker: "monk-focus",
          trackerCost: 1,
        },
      ],
    },
    source: "SRD",
  },
  {
    // 2024 RAW (monk:main, L2): "You can take the Disengage action as a Bonus
    // Action. Alternatively, you can expend 1 Focus Point to take both the
    // Disengage and the Dodge actions as a Bonus Action." The BASE tier (a
    // free Bonus-Action Disengage) costs NO Focus — only the enhanced
    // (+Dodge) tier does. The one-action-per-(feature,type) resolver seam has
    // no way to surface a second, differently-costed Bonus-Action row for the
    // SAME feature (M19), so the action is modeled cost-free (the always-
    // available base tier) and the optional Focus spend for the extra Dodge
    // stays narrative — same "no engine-tracked cost" treatment other
    // optional, non-computation-affecting enhancements get elsewhere.
    id: "monk-patient-defense",
    class: "monk",
    level: 2,
    mechanics: {
      actions: [
        {
          type: "bonus",
          // 2024 RAW (monk:main, Level 10 — Heightened Focus): "When you expend a
          // Focus Point to use Patient Defense, you gain a number of Temporary Hit
          // Points equal to TWO rolls of your Martial Arts die." A DIE roll →
          // roll-entry (golden rule 21: the app never rolls). The rider rides this
          // bonus action, gated by `fromLevel: 10` on the Monk OWNING-class level
          // (so a low-level Monk never sees it); the die is the scaling
          // classSpecific Martial Arts die (d8 at L10 → "2d8"). Override-first — a
          // display-only formula the player rolls + enters (temp HP don't stack).
          tempHpRoll: { rolls: 2, die: "classSpecific:martialArtsDie", fromLevel: 10 },
        },
      ],
    },
    source: "SRD",
  },
  {
    // 2024 RAW (monk:main, L2): "You can take the Dash action as a Bonus
    // Action. Alternatively, you can expend 1 Focus Point to take both the
    // Disengage and Dash actions as a Bonus Action, and your jump distance is
    // doubled for the turn." Same free-base / optional-Focus-enhancement
    // split as Patient Defense (M20) — modeled cost-free.
    id: "monk-step-of-the-wind",
    class: "monk",
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
    id: "monk-unarmored-movement",
    class: "monk",
    level: 2,
    mechanics: {
      rider: {
        sourceKey: "unarmoredMovement",
        format: "feet",
        // Active modifier: the rider value also adds to the character's
        // displayed Speed (sheet header reads this and feeds it into
        // formatSpeed's bonusFt). Without this flag, the rider would be
        // a purely informational chip.
        appliesTo: "speed",
      },
    },
    source: "SRD",
  },
  {
    id: "monk-deflect-attacks",
    class: "monk",
    level: 3,
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
    id: "monk-extra-attack",
    class: "monk",
    level: 5,
    grants: [{ type: "extra-attack", count: 1 }],
    source: "SRD",
  },
  {
    id: "monk-stunning-strike",
    class: "monk",
    level: 5,
    // Stunning Strike is a SELF-SIDE affordance (cadence-unblocked 2026-06-24):
    // once per turn on a Monk-weapon / Unarmed Strike hit, spend 1 Focus Point to
    // attempt a stun. The target makes a CONSTITUTION save vs the Monk's Ki save
    // DC (8 + PB + WIS mod). The engine surfaces the "−1 Ki" debit affordance + the
    // "CON save · DC N" line on the action card; it NEVER models the enemy nor
    // applies a Stunned condition (BG3 on-rails — no modeled enemies; the DM/player
    // rolls the save externally, golden rule 21). `saveAbility` = the target's save
    // (CON); `saveDcAbility` = the Monk ability that governs the DC (WIS).
    mechanics: {
      actions: [
        {
          type: "free",
          costTracker: "monk-focus",
          trackerCost: 1,
          saveAbility: "CON",
          saveDcAbility: "WIS",
        },
      ],
    },
    source: "SRD",
  },
  {
    id: "monk-evasion",
    class: "monk",
    level: 7,
    source: "SRD",
  },
  {
    id: "monk-acrobatic-movement",
    class: "monk",
    level: 9,
    source: "SRD",
  },
  {
    id: "monk-self-restoration",
    class: "monk",
    level: 10,
    // 2024 RAW (monk:main, Level 10: Self-Restoration): end Charmed/Frightened/
    // Poisoned on yourself at end of turn (a manual choice), and forgoing food or
    // drink no longer causes Exhaustion. There is NO Long-Rest exhaustion-level
    // reduction in 2024 — the prior `exhaustion-recovery` grant was a 2014/hybrid
    // invention, so it is removed.
    source: "SRD",
  },
  {
    id: "monk-deflect-energy",
    class: "monk",
    level: 13,
    source: "SRD",
  },
  {
    id: "monk-disciplined-survivor",
    class: "monk",
    level: 14,
    // L4 — proficiency in ALL saving throws (one grant per ability).
    grants: [
      { type: "save-proficiency", ability: "STR" },
      { type: "save-proficiency", ability: "DEX" },
      { type: "save-proficiency", ability: "CON" },
      { type: "save-proficiency", ability: "INT" },
      { type: "save-proficiency", ability: "WIS" },
      { type: "save-proficiency", ability: "CHA" },
    ],
    source: "SRD",
  },
  {
    id: "monk-slow-fall",
    class: "monk",
    level: 4,
    // PROSE-SWEPT 2026-06-10 — a real Reaction (reduce Falling damage by
    // 5 × Monk level); surfaces as an at-will reaction row.
    mechanics: { actions: [{ type: "reaction", trigger: "takeDamage" }] },
    source: "SRD",
  },
  {
    id: "monk-empowered-strikes",
    class: "monk",
    level: 6,
    // 2024 RAW (monk:main, Level 6: Empowered Strikes): the strike can deal Force
    // damage instead of its normal type (your choice each hit). Modeled by the
    // unarmed-strike-damage-type-option grant — the smart-tracker folds Force into
    // the Unarmed Strike row's damage-type CHOICE chip ("d8+4 Bldg/Force").
    grants: [{ type: "unarmed-strike-damage-type-option", toType: "force" }],
    source: "SRD",
  },
  {
    id: "monk-heightened-focus",
    class: "monk",
    level: 10,
    // 2024 RAW (monk:main, Level 10 — Heightened Focus): upgrades Flurry of Blows
    // (3 strikes), Step of the Wind (move an ally), and Patient Defense, which now
    // also grants "Temporary Hit Points equal to TWO ROLLS of your Martial Arts
    // die". That Patient-Defense temp-HP is MODELED as an L10-gated `tempHpRoll`
    // rider on the `monk-patient-defense` bonus action (a rolled temp-HP can't ride
    // the dice-FREE `temp-hp` Grant grammar, whose consumers auto-apply a concrete
    // number — golden rule 21 forbids that for a die; it rides its action as a
    // declarative roll-entry field instead, the twin of the G23 checkBonus / G19
    // cureConditions action riders). The Flurry/Step upgrades stay narrative riders
    // on those L2 actions.
    source: "SRD",
  },
  {
    id: "monk-perfect-focus",
    class: "monk",
    level: 15,
    // 2024 RAW (monk:main, Level 15 — Perfect Focus): "When you roll Initiative
    // and don't use Uncanny Metabolism, you regain expended Focus Points until
    // you have 4 if you have 3 or fewer." Wired via the shared
    // `initiative-tracker-topup` primitive (Uncanny Metabolism, Bard/Barbarian/
    // Druid) on the `monk-focus` pool. `upTo: 4` IS the floor-restore-to-4
    // semantic (`getInitiativeTrackerTopUps` only RAISES toward the floor, caps
    // to pool, and no-ops when remaining ≥ 4) — an exact match for "until you
    // have 4 if you have 3 or fewer". The mutual exclusion with Uncanny
    // Metabolism (can't use both the same turn) stays narrative — the primitive
    // can't express "either/or this turn", and the higher upTo (20 → all) would
    // win the max-merge anyway, so a player who triggers both regains all Focus
    // (a strict superset of the +4), which is the harmless over-restore.
    grants: [{ type: "initiative-tracker-topup", trackerId: "monk-focus", upTo: 4 }],
    source: "SRD",
  },
  {
    id: "monk-superior-defense",
    class: "monk",
    level: 18,
    // L11 activatable: while the toggle is on, Resistance to every damage type
    // EXCEPT Force (12 of the 13 types). Same flat enumeration the Barbarian
    // Bear-form uses. The 3-Focus spend that turns it on stays a tracker action.
    grants: [
      {
        type: "while-active",
        activeKey: "monk-superior-defense",
        grants: [
          { type: "damage-resistance", damageType: "acid" },
          { type: "damage-resistance", damageType: "bludgeoning" },
          { type: "damage-resistance", damageType: "cold" },
          { type: "damage-resistance", damageType: "fire" },
          { type: "damage-resistance", damageType: "lightning" },
          { type: "damage-resistance", damageType: "necrotic" },
          { type: "damage-resistance", damageType: "piercing" },
          { type: "damage-resistance", damageType: "poison" },
          { type: "damage-resistance", damageType: "psychic" },
          { type: "damage-resistance", damageType: "radiant" },
          { type: "damage-resistance", damageType: "slashing" },
          { type: "damage-resistance", damageType: "thunder" },
        ],
      },
    ],
    mechanics: {
      actions: [
        {
          type: "bonus",
          costTracker: "monk-focus",
          trackerCost: 3,
        },
      ],
    },
    source: "SRD",
  },
  {
    id: "monk-body-and-mind",
    class: "monk",
    level: 20,
    // L7 lever — class-feature ability-score grant, auto-applied at level-up.
    grants: [
      { type: "ability-score", ability: "DEX", amount: 4, cap: 25 },
      { type: "ability-score", ability: "WIS", amount: 4, cap: 25 },
    ],
    source: "SRD",
  },
  // Open Hand subclass features
  {
    id: "monk-open-hand-technique",
    class: "monk",
    subclass: "open-hand",
    level: 3,
    source: "SRD",
  },
  {
    id: "monk-open-hand-wholeness-of-body",
    class: "monk",
    subclass: "open-hand",
    level: 6,
    // 2024 RAW (monk:warrior-of-the-open-hand, Level 6): Wholeness of Body costs
    // NO Focus Points. It has its OWN use pool — WIS-modifier uses per Long Rest
    // — and heals one Martial Arts die + WIS modifier. The action's cost tracker
    // resolves to this feature's own `tracker` (smart-tracker), so no monk-focus
    // costTracker. The prior model (spend Focus up to PB) was a 2014/hybrid read.
    mechanics: {
      tracker: { total: "WIS", recovery: "long-rest" },
      actions: [
        {
          type: "bonus",
          trackerCost: 1,
        },
      ],
    },
    source: "SRD",
  },
  {
    id: "monk-open-hand-fleet-step",
    class: "monk",
    subclass: "open-hand",
    level: 11,
    // 2024 RAW (monk:warrior-of-the-open-hand, Level 11: Fleet Step): this is an
    // L11 feature (not L10) and it is NOT a free Dash. It lets you also use Step
    // of the Wind right after taking any other Bonus Action. The prior data was a
    // 2014/hybrid "Dash as a Bonus Action" reading at the wrong level.
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
    id: "monk-open-hand-quivering-palm",
    class: "monk",
    subclass: "open-hand",
    level: 17,
    mechanics: {
      actions: [
        {
          type: "free",
          trackerCost: 4,
          costTracker: "monk-focus",
        },
      ],
    },
    source: "SRD",
  },
];
