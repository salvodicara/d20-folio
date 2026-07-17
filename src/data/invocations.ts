/**
 * SRD Eldritch Invocations (2024 PHB).
 *
 * Source: http://dnd2024.wikidot.com/warlock:eldritch-invocation. The
 * localized display strings (name, prerequisite, description) live id-keyed in
 * the SRD i18n catalogue (`invocation.<id>.*`, EN + IT). The `prerequisite`
 * field kept here is the ENGINE FACT the eligibility gate parses (min Warlock
 * level + required-invocation ids) — never rendered directly.
 *
 * Warlock at L1 picks 1 invocation, gains a new pick at L2 / L5 / L7 /
 * L9 / L12 / L15 / L18 per the class's `invocationsKnown` schedule.
 * Whenever a level is gained, one invocation may be swapped for another.
 *
 * Three Pact options (Blade, Chain, Tome) live here too — in 2024 RAW
 * they are invocations rather than a separate L3 choice.
 */

export interface SrdEldritchInvocation {
  id: string;
  /** Prerequisite text in English ("" when none). */
  prerequisite: string;
  /**
   * Declarative mechanics the invocation confers (senses, speeds, skill
   * proficiencies, at-will casts, …). When a chosen invocation carries grants
   * they flow through `resolveGrantSourcesForInvocations` → `evaluateGrants`
   * exactly like a class feature / feat / magic-item source.
   *
   * At-will free-cast invocations (Armor of Shadows → Mage Armor, Mask of Many
   * Faces → Disguise Self, …) pair an `always-prepared-spell` grant (so the
   * spell becomes visible/prepared on the Spells page) with an
   * `at-will-cast-spell` grant (the unbounded slotless cast option). Warlock's
   * spellcasting ability is CHA, pinned via `casterAbility`. Inline `import(...)`
   * mirrors the SRD-type pattern in `src/data/types.ts` (avoids the
   * grants.ts ⇄ data circular import).
   */
  grants?: ReadonlyArray<import("@/lib/grants").Grant>;
  /**
   * S10 (Gaze of Two Minds) — mechanical effects reached via the ACTION economy
   * (a Bonus/Reaction/… use) rather than a standing `grants` effect. Reuses the
   * EXACT `SrdActionDef` shape a class feature / feat / race trait carries under
   * its own `mechanics.actions` — resolved by a sibling invocation pass in
   * `resolveFeatureActions` (smart-tracker.ts) that mirrors the race-trait branch
   * (an invocation lives outside `character.features[]`, exactly like a race
   * trait): same owning-class (Warlock) scaling level, same cost/cross-tracker/
   * summary resolution, feeding the ONE Play-board action pipeline — never a
   * parallel model. No `tracker` sibling (unlike the race-trait shape): every
   * current invocation action is a bare economy row with no resource pool of its
   * own; add one only alongside a real consumer when an invocation actually needs
   * it (never a half-wired, untested primitive). Optional — most invocations
   * model their whole benefit as `grants` (an at-will cast, a sense, a passive
   * rider) and never need this.
   */
  mechanics?: {
    actions?: import("@/data/types").SrdActionDef[];
  };
}

export const SRD_INVOCATIONS: SrdEldritchInvocation[] = [
  {
    id: "agonizing-blast",
    prerequisite: "Level 2+ Warlock, a Warlock Cantrip That Deals Damage",
    // +CHA mod to the damage rolls of the chosen damaging Warlock cantrip. The
    // chosen cantrip is parameterised via `choiceKey` (the invocation picker
    // writes the picked cantrip id to `session.grantBundleChoices`); until a
    // pick is recorded it auto-targets Eldritch Blast — the canonical choice
    // every Warlock takes this invocation for — so the bonus computes by
    // default and the choice merely re-targets it (override-first).
    grants: [
      {
        type: "cantrip-damage-bonus",
        choiceKey: "agonizing-blast-cantrip",
        defaultSpellId: "eldritch-blast",
        ability: "CHA",
        value: "modifier",
        min: 0,
      },
    ],
  },
  {
    id: "armor-of-shadows",
    prerequisite: "",
    // At-will Mage Armor on yourself. always-prepared makes the spell visible;
    // at-will-cast-spell adds the unbounded slotless cast option (CHA).
    grants: [
      { type: "always-prepared-spell", spellId: "mage-armor", spellAbility: "CHA" },
      { type: "at-will-cast-spell", spellId: "mage-armor", casterAbility: "CHA" },
    ],
  },
  {
    id: "ascendant-step",
    prerequisite: "Level 5+ Warlock",
    grants: [
      { type: "always-prepared-spell", spellId: "levitate", spellAbility: "CHA" },
      { type: "at-will-cast-spell", spellId: "levitate", casterAbility: "CHA" },
    ],
  },
  {
    id: "devils-sight",
    prerequisite: "Level 2+ Warlock",
    // Functionally darkvision (see in darkness within range); the closest
    // existing sense grant. The magical-darkness nuance stays in the prose —
    // there is no separate "sees-in-magical-darkness" sense in the model.
    grants: [{ type: "darkvision", range: 120 }],
  },
  {
    id: "devouring-blade",
    prerequisite: "Level 12+ Warlock, Thirsting Blade Invocation",
    // Upgrades Thirsting Blade — "two extra attacks rather than one" (3 total).
    // MAX merge means this wins over Thirsting Blade's count:1.
    grants: [{ type: "extra-attack", count: 2 }],
  },
  {
    id: "eldritch-mind",
    prerequisite: "",
    // 2024 RAW (warlock:eldritch-invocation, Eldritch Mind): "You have
    // Advantage on Constitution saving throws that you make to maintain
    // Concentration." Same primitive as War Caster (feats.ts).
    grants: [
      {
        type: "advantage-on",
        rollType: "save",
        vs: "concentration-con-save",
      },
    ],
  },
  {
    id: "eldritch-smite",
    prerequisite: "Level 5+ Warlock, Pact of the Blade Invocation",
    // On-hit rider on the conjured pact weapon ONLY (not every weapon attack) →
    // the `pact-weapon-rider` primitive. Spend a Pact Magic slot for an extra
    // 1d8 Force, PLUS another 1d8 per slot LEVEL (scalesPerSlotLevel — the
    // consumer resolves the warlock's pact-slot level and emits (slotLevel+1)d8),
    // plus Prone (Huge or smaller). `dice: "1d8"` is BOTH the base die and the
    // per-slot-level die (they are the same in the SRD). Override-first: the
    // engine never auto-spends the slot — it surfaces the option on the row.
    grants: [
      {
        type: "pact-weapon-rider",
        id: "eldritch-smite",
        dice: "1d8",
        damageType: "force",
        costsPactSlot: true,
        scalesPerSlotLevel: true,
        prone: "huge-or-smaller",
      },
    ],
  },
  {
    id: "eldritch-spear",
    prerequisite: "Level 2+ Warlock, a Warlock Cantrip That Deals Damage",
    // The chosen damaging cantrip's range grows by 30 ft × Warlock level → the
    // `cantrip-range-bonus` primitive (numeric sibling of `cantrip-effect-rider`).
    // Like Agonizing/Repelling Blast, the chosen cantrip is parameterised via
    // `choiceKey` (the invocation picker writes the picked cantrip id to
    // `session.grantBundleChoices`); until a pick is recorded it auto-targets
    // Eldritch Blast — the canonical pick (range 120 ft, ≥10 ft, deals damage) —
    // so the bonus computes by default and the choice merely re-targets it
    // (override-first). REPEATABLE: a second copy declares another grant targeting
    // a different eligible cantrip. The evaluator records the per-level scaling;
    // the consumer (`resolveCantripRangeBonus`) multiplies by the Warlock level.
    grants: [
      {
        type: "cantrip-range-bonus",
        choiceKey: "eldritch-spear-cantrip",
        defaultSpellId: "eldritch-blast",
        bonusPerLevel: 30,
        scalesWith: "warlock",
      },
    ],
  },
  {
    id: "fiendish-vigor",
    prerequisite: "Level 2+ Warlock",
    // At-will False Life on yourself, AND the auto-max temp-HP rule is now
    // modelled declaratively: casting via this feature you don't roll — you
    // automatically get the highest number on the die. The 2024 False Life
    // formula is "2d4 + 4" (verified against the spell scrape), so the
    // maximized Temporary HP is 2*4 + 4 = 12. The evaluator resolves
    // `autoMaxTempHpFormula` to a concrete `autoMaxTempHp` on the at-will entry;
    // the cast-options consumer surfaces it on the at-will row. Temp HP are
    // still applied override-first (the engine never auto-sets HP).
    grants: [
      { type: "always-prepared-spell", spellId: "false-life", spellAbility: "CHA" },
      {
        type: "at-will-cast-spell",
        spellId: "false-life",
        casterAbility: "CHA",
        autoMaxTempHpFormula: "2d4+4",
      },
    ],
  },
  {
    // S10 CLOSED (2026-07-07) — 2024 RAW (warlock:eldritch-invocation, verified
    // against dnd2024.wikidot.com): "You can use a Bonus Action to touch a willing
    // creature and perceive through its senses until the end of your next turn. As
    // long as the creature is on the same plane of existence as you, you can take a
    // Bonus Action on subsequent turns to maintain this connection…" No slot/tracker
    // cost — a bare Bonus Action row. `mechanics.actions` surfaces it on the Play
    // board via the invocation pass in `resolveFeatureActions`; the remote-sensing/
    // senses-swap EFFECT itself stays narrative (no perception-swap primitive in the
    // engine — override-first/display where a primitive would exist).
    id: "gaze-of-two-minds",
    prerequisite: "Level 5+ Warlock",
    mechanics: {
      actions: [{ type: "bonus" }],
    },
  },
  {
    id: "gift-of-the-depths",
    prerequisite: "Level 5+ Warlock",
    // 2024 RAW (warlock:eldritch-invocation, Gift of the Depths): a Swim Speed
    // equal to your walking Speed, you can breathe underwater, AND you can cast
    // Water Breathing once per Long Rest without a slot. The cast is BOUNDED 1/LR
    // (not at-will) — modeled as `always-prepared-spell` (so it's visible/prepared)
    // + a 1/LR `free-cast-spell` (Warlock spellcasting is CHA), the same bounded
    // free-cast pattern the feats use (Fey-Touched → Misty Step 1/LR).
    grants: [
      { type: "swim-speed", amount: "equal-to-walking" },
      { type: "always-prepared-spell", spellId: "water-breathing", spellAbility: "CHA" },
      {
        type: "free-cast-spell",
        spellId: "water-breathing",
        chargesPerRest: 1,
        rest: "long",
        casterAbility: "CHA",
      },
    ],
  },
  {
    id: "gift-of-the-protectors",
    prerequisite: "Level 9+ Warlock, Pact of the Tome Invocation",
  },
  {
    id: "investment-of-the-chain-master",
    prerequisite: "Level 5+ Warlock, Pact of the Chain Invocation",
    // familiar-enhancement primitive: the five buffs this invocation layers on a
    // familiar summoned by Find Familiar (the familiar's own stat block lives on
    // the spell, so it can't be a feature-declared `companion`). Verified verbatim
    // against dnd2024.wikidot.com/warlock:eldritch-invocation:
    //  - Aerial or Aquatic → Fly OR Swim 40 ft (player picks one mode);
    //  - Quick Attack → Bonus-Action command to take the Attack action;
    //  - Necrotic or Radiant Damage → convert B/P/S to Necrotic or Radiant;
    //  - Your Save DC → the familiar uses the OWNER's spell save DC;
    //  - Resistance → owner Reaction-grants Resistance to damage taken.
    // Override-first: the consumer (`resolveFamiliarEnhancements`) only surfaces
    // the available options; the engine never auto-commands the familiar.
    grants: [
      {
        type: "familiar-enhancement",
        extraSpeedFt: 40,
        extraSpeedModes: ["fly", "swim"],
        bonusActionAttack: true,
        damageTypeConversion: ["necrotic", "radiant"],
        usesOwnerSaveDc: true,
        reactionResistance: true,
      },
    ],
  },
  {
    id: "lessons-of-the-first-ones",
    prerequisite: "Level 2+ Warlock",
    // choice-feat (origin-feat grant): grants ONE Origin feat of the player's
    // choice. The grant surfaces a pending feat pick the picker resolves into a
    // feat ref on `character.features`; the chosen feat's own grants/tracker/
    // actions then flow through the feat pipeline. Repeatable — taking the
    // invocation again opens another `choice-feat` slot, and the picker excludes
    // already-known (non-repeatable) Origin feats so each pick is a different one.
    grants: [{ type: "choice-feat", category: "origin", amount: 1 }],
  },
  {
    id: "lifedrinker",
    prerequisite: "Level 9+ Warlock, Pact of the Blade Invocation",
    // On-hit rider on the conjured pact weapon ONLY → the `pact-weapon-rider`
    // primitive. +1d6 of a player-chosen type (Necrotic/Psychic/Radiant) PLUS the
    // on-hit self-heal (HD-spend): `healFromHitDie` drives the consumer to emit a
    // structured `onHitHeal` facet on the pact-weapon row — expend a Hit Die,
    // regain (Hit Die roll + CON mod, min 1). Override-first: the engine never
    // auto-spends a Hit Die; it surfaces the computed heal as a player-chosen
    // on-hit option.
    grants: [
      {
        type: "pact-weapon-rider",
        id: "lifedrinker",
        dice: "1d6",
        damageTypeChoices: ["necrotic", "psychic", "radiant"],
        healFromHitDie: true,
      },
    ],
  },
  {
    id: "mask-of-many-faces",
    prerequisite: "Level 2+ Warlock",
    grants: [
      { type: "always-prepared-spell", spellId: "disguise-self", spellAbility: "CHA" },
      { type: "at-will-cast-spell", spellId: "disguise-self", casterAbility: "CHA" },
    ],
  },
  {
    id: "master-of-myriad-forms",
    prerequisite: "Level 5+ Warlock",
    grants: [
      { type: "always-prepared-spell", spellId: "alter-self", spellAbility: "CHA" },
      { type: "at-will-cast-spell", spellId: "alter-self", casterAbility: "CHA" },
    ],
  },
  {
    id: "misty-visions",
    prerequisite: "Level 2+ Warlock",
    grants: [
      { type: "always-prepared-spell", spellId: "silent-image", spellAbility: "CHA" },
      { type: "at-will-cast-spell", spellId: "silent-image", casterAbility: "CHA" },
    ],
  },
  {
    id: "one-with-shadows",
    prerequisite: "Level 5+ Warlock",
    // The "while in Dim Light or Darkness" environmental gate stays in the
    // prose (the engine has no lighting state); the at-will cast is modelled.
    grants: [
      { type: "always-prepared-spell", spellId: "invisibility", spellAbility: "CHA" },
      { type: "at-will-cast-spell", spellId: "invisibility", casterAbility: "CHA" },
    ],
  },
  {
    id: "otherworldly-leap",
    prerequisite: "Level 2+ Warlock",
    grants: [
      { type: "always-prepared-spell", spellId: "jump", spellAbility: "CHA" },
      { type: "at-will-cast-spell", spellId: "jump", casterAbility: "CHA" },
    ],
  },
  {
    id: "pact-of-the-blade",
    prerequisite: "",
    // Pact of the Blade conjures a Simple/Martial Melee weapon of the player's
    // CHOICE — so the engine models the rules of the bond (proficiency + CHA
    // attack/damage + damage-type switch + Spellcasting Focus) via the
    // `pact-weapon` primitive, and the player configures the actual weapon
    // form / damage type override-first (session.pactWeaponConfig). The default
    // is a generic conjured blade (1d8 Slashing, like a longsword).
    grants: [
      {
        type: "pact-weapon",
        id: "pact-of-the-blade",
        attackAbility: "CHA",
        damageTypeChoices: ["necrotic", "psychic", "radiant"],
        isFocus: true,
        conjureSlot: "bonus",
        defaultDamageDie: "1d8",
        defaultDamageType: "slashing",
      },
    ],
  },
  {
    id: "pact-of-the-chain",
    prerequisite: "",
    // "You learn the Find Familiar spell and can cast it as a Magic action without
    // expending a spell slot." → the at-will slotless self-cast primitive, exactly
    // like the other at-will invocations (Armor of Shadows, …). always-prepared
    // makes Find Familiar visible/prepared on the Spells page; at-will-cast-spell
    // adds the unbounded slotless cast option (Warlock CHA). The special familiar
    // forms + "forgo an attack to let the familiar attack" are creature-companion
    // narrative (no stat-block engine in scope) and stay prose in the description.
    grants: [
      { type: "always-prepared-spell", spellId: "find-familiar", spellAbility: "CHA" },
      { type: "at-will-cast-spell", spellId: "find-familiar", casterAbility: "CHA" },
    ],
  },
  {
    id: "pact-of-the-tome",
    prerequisite: "",
    // Book of Shadows (warlock:eldritch-invocations): "choose three cantrips, and
    // choose two level 1 spells that have the Ritual tag. The spells can be from
    // any class's spell list … you have the chosen spells prepared, and they
    // function as Warlock spells for you." So:
    //   • 3 cantrips from ANY class list (no `classSpellList` → unrestricted pool).
    //   • 2 level-1 Ritual-tagged spells from ANY class list (`ritualOnly: true`,
    //     `maxLevel: 1`) — the new choice-spell ritualOnly constraint.
    // Both pin CHA (function as Warlock spells); the picks land alwaysPrepared
    // (they don't count against the prepared budget). The book also serves as a
    // Spellcasting Focus — a cosmetic note carried in the prose (SpellcastingConfig
    // .focus is free-text and override-first), not a derived stat.
    grants: [
      { type: "choice-cantrip", amount: 3, spellAbility: "CHA" },
      {
        type: "choice-spell",
        maxLevel: 1,
        amount: 2,
        ritualOnly: true,
        spellAbility: "CHA",
      },
    ],
  },
  {
    id: "repelling-blast",
    prerequisite:
      "Level 2+ Warlock, a Warlock Cantrip That Deals Damage via an Attack Roll",
    // On a HIT with the chosen attack-roll cantrip, push a Large-or-smaller
    // creature up to 10 ft straight away — a `cantrip-effect-rider` with the
    // `forced-movement` clause. Like Agonizing Blast, the chosen cantrip is
    // parameterised via `choiceKey` (the invocation picker writes the picked
    // cantrip id to `session.grantBundleChoices`); until a pick is recorded it
    // auto-targets Eldritch Blast — the canonical pick for this invocation — so
    // the rider applies by default and the choice merely re-targets it
    // (override-first). REPEATABLE: a second copy declares another grant
    // targeting a different eligible cantrip.
    grants: [
      {
        type: "cantrip-effect-rider",
        effect: "forced-movement",
        choiceKey: "repelling-blast-cantrip",
        defaultSpellId: "eldritch-blast",
        direction: "push",
        distanceFt: 10,
        maxTargetSize: "Large",
      },
    ],
  },
  {
    id: "thirsting-blade",
    prerequisite: "Level 5+ Warlock, Pact of the Blade Invocation",
    // Extra Attack ("attack twice") for the pact weapon → 1 EXTRA attack.
    // Devouring Blade (below) upgrades this to 2 via the MAX merge.
    grants: [{ type: "extra-attack", count: 1 }],
  },
  {
    id: "visions-of-distant-realms",
    prerequisite: "Level 9+ Warlock",
    grants: [
      { type: "always-prepared-spell", spellId: "arcane-eye", spellAbility: "CHA" },
      { type: "at-will-cast-spell", spellId: "arcane-eye", casterAbility: "CHA" },
    ],
  },
  {
    id: "whispers-of-the-grave",
    prerequisite: "Level 7+ Warlock",
    grants: [
      { type: "always-prepared-spell", spellId: "speak-with-dead", spellAbility: "CHA" },
      { type: "at-will-cast-spell", spellId: "speak-with-dead", casterAbility: "CHA" },
    ],
  },
  {
    id: "witch-sight",
    prerequisite: "Level 15+ Warlock",
    grants: [{ type: "truesight", range: 30 }],
  },
];
