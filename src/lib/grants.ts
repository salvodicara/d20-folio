/**
 * A4 — Declarative SRD effect model.
 *
 * The uniform way for feats, race traits, class features, magic items,
 * invocations, metamagic, and backgrounds to declare their mechanical
 * effects as data (a `grants: Grant[]` field). A single evaluator walks
 * the character and aggregates every applicable grant into the
 * `AggregatedGrants` view the sheet reads. This is the ONLY path between
 * SRD data and the rendered mechanics — `grants[]` + an evaluator branch
 * + a consumer (golden rule 5); the declarative model is complete.
 *
 * The old regex parsers it replaced (`deriveSenses` / `deriveResistances`)
 * are deleted. Downstream consumers that turn the aggregate into concrete
 * numbers (`featAsi`, `effectiveWalkingSpeedFt`, the `attacksPerAction` reads, …)
 * read FROM this aggregate — they no longer parse English.
 */

import type {
  AbilityCode,
  ActionType,
  BiText,
  ClassId,
  ConditionId,
  CreatureSize,
  DamageSource,
  DamageType,
  FeatCategory,
  SpellSchool,
  WeaponCategory,
  WeaponMastery,
  WeaponType,
} from "@/data/types";
import type { CostSpec } from "@/lib/cost-engine";
import type { ProficiencyToken } from "@/types/ids";
import { asProficiencyToken } from "@/lib/proficiency-tokens";
import type { SrdKind } from "@/i18n/srd-en";
import { srdEn } from "@/i18n/srd-en";
import { srdKey, srdGrantSegment } from "@/i18n/srd-key";
import type { LocText } from "@/lib/loc-text";
import { srdText, litText } from "@/lib/loc-text";

/**
 * How a {@link Grant} `scoped-extra-spell-slot`'s level scales with the
 * character. Declarative — `resolveScopedSlotLevel` turns it + the character's
 * total level into a concrete slot level.
 *
 * - `half-level-round-up`: ⌈totalLevel / 2⌉, capped at `cap`. Potent
 *   a heritage feat's "the slot's level is half your level (round up), max 5".
 * - `fixed`: always `level` (kept for future scoped slots at a flat level).
 */
export type ScopedSlotLevelFormula =
  | { kind: "half-level-round-up"; cap: number }
  | { kind: "fixed"; level: number };

/**
 * Which prepared spells a {@link Grant} `scoped-extra-spell-slot` may cast.
 *
 * - `heritage-feat-spells`: only spells the character has prepared because of
 *   a heritage-category feat (its always-prepared spells). The cast-option
 *   consumer resolves the eligible set from the character's heritage feats.
 *   Extend the union for future scoped-slot mechanics.
 */
export type ScopedSlotSpellScope = "heritage-feat-spells";

// ─── Grant union — the language of declarative SRD effects ──────────────────

/**
 * A single discrete mechanical effect a feature can grant.
 *
 * Each kind documents its evaluator merge rule (the rule the aggregator uses
 * when multiple sources emit the same kind). The kinds are grouped by
 * domain — senses, defensive (resistance/immunity/vulnerability), movement,
 * derived stats, proficiencies/expertise/languages/tools, spell grants,
 * casting modifiers, and pending player choices.
 *
 * **Adding a new Grant kind:** see `docs/MECHANICS.md` for the canonical
 * taxonomy and the four-step recipe (declare → migrate data → evaluate →
 * consume). Every new kind ships with a unit test pinning its evaluator
 * branch.
 */
/**
 * USE-APPLIES (2026-06-12) — duration/maintenance metadata for a `while-active`
 * state, so the combat turn loop can enforce its lifetime (Task 2). Pure data
 * carried on the grant; Rage/Innate Sorcery/Bladesong each get the CORRECT rule
 * from their own declaration — no feature is special-cased in the engine.
 */
export type WhileActiveDuration =
  | {
      /**
       * Ends at the end of YOUR turn unless a maintaining event happened this
       * round (Barbarian Rage). `maintainedBy` lists the events the combat turn
       * loop tracks; `maxMinutes` is the cap in MINUTES (Rage = 10); `maxRounds`
       * is the SAME cap expressed in combat ROUNDS (Rage = 100 rounds = 10 min ×10),
       * which the FRONTIER-S3 turn/round engine counts down at each End Turn and
       * AUTO-DROPS the state at 0 (a hard expiry, distinct from the soft keep/end
       * maintenance prompt); `endsEarlyOn` (informational ConditionId /
       * `"heavy-armor"` tokens) names the immediate-drop conditions.
       */
      kind: "maintained";
      maintainedBy: ReadonlyArray<"attack" | "bonus-extend" | "damage-taken">;
      maxMinutes?: number;
      maxRounds?: number;
      endsEarlyOn?: ReadonlyArray<string>;
    }
  | {
      /**
       * A fixed-timer state with no per-turn maintenance (Innate Sorcery,
       * Bladesong = 1 minute). `minutes` is informational; `maxRounds`, when set,
       * is the combat-round cap the FRONTIER-S3 turn/round engine counts down and
       * AUTO-DROPS at 0 (a 1-minute spell = 10 rounds). Omit `maxRounds` to keep
       * the state purely informational (no auto-expiry — the player ends it).
       */
      kind: "timed";
      minutes: number;
      maxRounds?: number;
    };

export type Grant =
  // ── Senses (merge: max per kind) ─────────────────────────────────────────
  | { type: "darkvision"; range: number /* feet */ }
  /**
   * ADDITIVE darkvision (Gloom Stalker Umbral Sight: "Darkvision 60 ft; if you
   * already have Darkvision, its range increases by 60 ft"). Distinct from the
   * `darkvision` kind (which MERGES by max): the bonus SUMS atop the max base
   * range. RAW: with no prior darkvision the bonus still grants its own range
   * (so the finalize is `max(baseDarkvision, 0) + sum(bonuses)`). D6.
   */
  | { type: "darkvision-bonus"; amount: number /* feet */ }
  | { type: "blindsight"; range: number /* feet */ }
  | { type: "tremorsense"; range: number /* feet */ }
  | { type: "truesight"; range: number /* feet */ }
  | {
      /**
       * "See Invisible" — you can see Invisible creatures within `range` feet
       * that aren't behind Total Cover (Aberrant Sorcery's Revelation in Flesh
       * → "See the Invisible", 60 ft). NOT Truesight: it only reveals Invisible
       * creatures, not illusions / shapechangers / the Ethereal Plane, so it
       * gets its own aggregate field rather than folding into `truesightFt`.
       * Merge: MAX per kind (the largest range granted wins).
       */
      type: "see-invisible";
      range: number /* feet */;
    }

  // ── Defensive (merge: set-union per kind) ────────────────────────────────
  | { type: "damage-resistance"; damageType: DamageType }
  | { type: "damage-immunity"; damageType: DamageType }
  | { type: "damage-vulnerability"; damageType: DamageType }
  | { type: "condition-immunity"; condition: ConditionId }
  | {
      /**
       * Resistance keyed to a damage SOURCE rather than a `DamageType` — the
       * damage halves whenever it originates from `source`, regardless of the
       * element it deals. Abjurer's Spell Resistance (L14, wizard:abjurer):
       * "you have Resistance to the damage of spells" → `{ source: "spell" }`,
       * so a Fireball, a Disintegrate, or any other spell's damage is halved.
       *
       * Distinct from `damage-resistance` (which keys on a `DamageType`): a
       * spell can deal any element, so this can't be folded into the
       * per-DamageType set without over- or under-reporting. Merge: set-union
       * per source. Surfaced in its own aggregate field
       * (`damageSourceResistances`) the defenses consumer renders alongside the
       * element resistances, AND fed to the RA-05 damage-intake math
       * (`lib/damage-intake.ts`): a typed entry tagged with the source halves.
       * Override-first: applying it is the player's call — an untyped entry
       * always passes verbatim.
       */
      type: "damage-resistance-source";
      source: DamageSource;
    }
  | {
      /**
       * **Flat damage reduction** — subtract a fixed amount from incoming damage
       * of the listed types, optionally gated on a wearing-state condition. The
       * FLAT sibling of `damage-resistance` (which HALVES); this never multiplies.
       * Heavy Armor Master 2024 (feat:heavy-armor-master Damage Reduction): "When
       * you're hit while wearing Heavy armor, any Bludgeoning, Piercing, and
       * Slashing damage is reduced by your Proficiency Bonus" →
       * `{ damageTypes: ["bludgeoning","piercing","slashing"], amount: "PB",
       * condition: "wearing-heavy-armor" }`.
       *
       * `amount` is a flat number OR the `"PB"` sentinel (resolved to the
       * character's Proficiency Bonus at render). The app models no foe, so
       * this is SELF-SIDE only: a defenses-rail reminder line AND an input to
       * the RA-05 damage-intake math (`lib/damage-intake.ts` — subtracted
       * BEFORE the resistance halving, RAW order) when the player types the
       * incoming hit. REUSABLE: a future flat reducer (e.g. a
       * Heavy-armor-independent one) drops `condition`.
       *
       * The evaluator records every entry; the consumer
       * (`deriveFlatDamageReductions`) resolves `"PB"` + the wearing-state gate
       * and the defenses view renders the surviving lines. Merge: `[list]`.
       */
      type: "flat-damage-reduction";
      damageTypes: ReadonlyArray<DamageType>;
      amount: number | "PB";
      condition?: "wearing-heavy-armor";
    }
  | {
      /**
       * **Choice-resistance** — the character picks `amount` damage types from a
       * constrained `options` list and gains Resistance to each, and the picks
       * are **re-selectable** (Boon of Energy Resistance: "Resistance to two of
       * the following damage types of your choice … whenever you finish a Long
       * Rest, you can change your choices"). Unlike a fixed `damage-resistance`
       * (which names ONE element up front), the element set is player-controlled
       * play-time state, so it can't be a static grant.
       *
       * The picks live in the same re-selectable session store as the L12
       * single-select chooser — `session.grantBundleChoices[choiceKey]` — but
       * encoded as a COMMA-SEPARATED list of `DamageType` values (e.g.
       * `"fire,cold"`) so the existing `bundleChoices: Map<string,string>`
       * plumbing carries N picks without a new session field. The evaluator
       * splits that value, keeps only types that are in `options`, dedupes, caps
       * at `amount`, and adds each surviving type to `damageResistances` — so the
       * existing defenses consumer (`compute.ts`) lights up with ZERO new code.
       * It also records the slot in `choiceResistances` so a picker UI can
       * surface the constrained list + current picks (parallel to `grantBundles`).
       *
       * Merge: set-union into `damageResistances` (a type resisted via this slot
       * and via a fixed grant collapses to one entry). Override-first: the picks
       * are user-controllable; with nothing selected the slot contributes no
       * resistances.
       */
      type: "choice-resistance";
      choiceKey: string;
      options: ReadonlyArray<DamageType>;
      amount: number;
      label?: BiText;
    }

  // ── Movement (walking: sum / non-walking: max per kind) ──────────────────
  | {
      /**
       * Additive walking-Speed bonus in feet. By default it always applies
       * (`speedBonusFt`). The optional `condition` gates it on a wearing-state —
       * `"no-heavy-armor"` (Ranger Roving: +10 ft "while you aren't wearing Heavy
       * Armor") routes the bonus into `conditionalSpeedBonusFt["no-heavy-armor"]`
       * instead, and the consumer (`effectiveWalkingSpeedFt`) applies it only when
       * no Heavy armor is equipped.
       *
       * `round1` (FRONTIER-S3) marks a ROUND-1-ONLY clause — the SPEED counterpart
       * of the `advantage-on { round1 }` gate (Assassinate): it applies only on the
       * character's FIRST turn of each combat (Gloom Stalker Dread Ambusher's
       * Ambusher's Leap: "At the start of your first turn of each combat, your Speed
       * increases by 10 feet until the end of that turn"). It routes into the
       * dedicated `round1SpeedBonusFt` aggregate bucket; the consumer
       * (`effectiveWalkingSpeedFt`) adds it ONLY when passed `round === 1`. Omitted =
       * a permanent bonus (the default). Mutually exclusive with `condition`.
       */
      type: "speed";
      amount: number /* feet, additive */;
      condition?: "no-heavy-armor";
      round1?: boolean;
    }
  | {
      /**
       * Non-walking speed. `amount` may be a string sentinel:
       *  - `"equal-to-walking"` — "Swim/Fly Speed equal to your Speed" (Triton,
       *    Aquatic species, Draconic Dragon Wings).
       *  - `"twice-walking"` — twice your walking Speed (Aberrant Sorcery's
       *    Revelation in Flesh → Aquatic Adaptation grants Swim = 2× Speed).
       * Numeric values are absolute feet; the evaluator takes the max per kind
       * so a magic item granting Fly 60 doesn't get stacked over a trait granting
       * Fly 30. Sentinels resolve against walking speed at render time
       * (`resolveNonWalkingSpeed`), so `"twice-walking"` always beats
       * `"equal-to-walking"` in the merge.
       */
      type: "fly-speed";
      amount: NonWalkingSpeed;
    }
  | { type: "swim-speed"; amount: NonWalkingSpeed }
  | { type: "climb-speed"; amount: NonWalkingSpeed }
  | {
      /**
       * A MULTIPLIER on the character's effective WALKING Speed — the factor
       * counterpart of the flat-additive `speed` grant. Boots of Speed: "the
       * boots double your Speed" → `{ factor: 2 }`. Distinct from `speed` (which
       * adds a fixed number of feet): a multiplier expresses "× N of an arbitrary
       * base", so a character whose Speed is 25 or 40 doubles correctly rather
       * than gaining a hard-coded +30.
       *
       * Merge: MAX `factor` across grants (default 1 = no multiplier). Multipliers
       * never STACK in 2024 RAW — two doublings don't quadruple your Speed; the
       * most generous factor wins. The consumer (`effectiveWalkingSpeedFt` in
       * `lib/smart-tracker.ts`) applies it to `(base + additive speedBonusFt)` and
       * only then subtracts the flat reductions (exhaustion −5/level, heavy-armor
       * Strength penalty) — the boots double your *Speed*, while exhaustion and
       * armor are separate flat penalties, per RAW.
       *
       * Typically wrapped in a `while-active` block (Boots of Speed's heel-click
       * is a Bonus-Action toggle that lasts 10 minutes), so the multiplier only
       * applies while the player toggles it on. Override-first: the effective
       * Speed remains fully overridable in the UI; the timer + Long-Rest recharge
       * + Opportunity-Attack disadvantage stay descriptive (no engine field).
       */
      type: "speed-multiplier";
      factor: number;
    }
  | {
      /**
       * A walking-Speed FLOOR in feet — the character's effective walking Speed
       * is raised to at least `minFt` "unless it is already higher". Boots of
       * Striding and Springing: "your Speed becomes 30 feet unless your Speed is
       * higher" → `{ minFt: 30 }`. Distinct from the flat-additive `speed` grant
       * (which would wrongly stack — a +30 on a 30-ft base yields 60): a floor is
       * a MAX, so a 30-ft base stays 30 and a 40-ft base stays 40.
       *
       * Merge: MAX `minFt` across grants (default 0 = no floor). Floors don't
       * stack — the most generous floor wins. The consumer (`effectiveWalkingSpeedFt`
       * in `lib/smart-tracker.ts`) applies it LAST, after the additive bonuses,
       * multiplier, and flat reductions, so an exhausted / armor-penalised Speed
       * still floors back up to `minFt`. Reusable for any "Speed becomes N unless
       * higher" effect (Longstrider-style floors).
       */
      type: "speed-floor";
      minFt: number;
    }

  // ── Derived stats (merge: sum) ───────────────────────────────────────────
  | {
      /**
       * Additive AC bonus. `amount` is a flat bonus (Ring/Cloak of Protection,
       * +N armor — items). `ability` instead adds that ability's modifier
       * (Bladesong: +INT mod, `min` 1) — feature-only, kept separate from the
       * flat item bonuses so it never double-counts with `computeAC`'s
       * item-AC pass. The render-derived AC (`effectiveAC`) consumes it.
       */
      type: "ac-bonus";
      amount?: number /* flat, additive while equipped */;
      ability?: AbilityCode;
      min?: number;
    }
  | { type: "hp-per-level"; amount: number }
  | { type: "ability-score"; ability: AbilityCode; amount: number; cap?: number }
  | {
      /**
       * Lowers the natural-d20 threshold at which a weapon attack is a critical
       * hit (Champion Improved Critical → 19, Superior Critical → 18). Merge:
       * MIN across grants (the most generous range wins). Default 20.
       */
      type: "crit-range";
      threshold: number;
    }
  | {
      /**
       * Lowers the natural-d20 a DEATH SAVING THROW counts as a 20 (Champion
       * Survivor "Defy Death": "when you roll 18-20 on a Death Saving Throw, you
       * gain the benefit of rolling a 20"). DISTINCT from `crit-range` (weapon
       * attacks) — it never touches weapon crits, only death saves. Merge: the
       * most generous (lowest) threshold wins (mirrors `crit-range`). The
       * consumer is `deathSaveOutcome(roll, deathSaveCritThreshold)`.
       */
      type: "death-save-crit-range";
      threshold: number;
    }
  | {
      /**
       * Start-of-turn HP regain with a guard (Champion Survivor "Heroic Rally":
       * regain 5 + CON modifier at the start of each turn while Bloodied with ≥ 1
       * HP). `amount` is a temp-HP-grammar formula (`"5+CON"`, `"level"`, `"3"`).
       * `condition` gates the regain: `"bloodied"` (current HP ≤ half max) or
       * `"always"`. `requiresMinHp` (default true) blocks the heal at 0 HP — you
       * never regenerate from unconscious. Collected per source into
       * `startOfTurnRegen`; the consumer (`resolveStartOfTurnRegen`) resolves the
       * amount + reports whether the guard is met. Override-first — the engine
       * never auto-applies the heal.
       *
       * `asTempHp` (default false) redirects the start-of-turn amount to the
       * TEMPORARY-HP pool instead of healing (Heroism, 2024 RAW: "gains Temporary
       * Hit Points equal to your spellcasting ability modifier at the start of each
       * of its turns"). Same cadence + amount grammar; the banner one-taps it
       * through the max-wins `gainTempHp` seam (temp HP never stack), never
       * `applyHealing`, and never gates on min HP (temp HP don't revive you). Wrap
       * it in the spell's `while-active` block so it surfaces only while the buff
       * is up.
       */
      type: "regen-at-turn-start";
      amount: string;
      condition: "bloodied" | "always";
      requiresMinHp?: boolean;
      asTempHp?: boolean;
    }
  | {
      /**
       * Critical-hit-triggered movement rider (Champion Remarkable Athlete:
       * "immediately after you score a Critical Hit, you can move up to half your
       * Speed without provoking Opportunity Attacks"). `fraction` is the portion
       * of the character's Speed the move covers; `ignoresOpportunityAttacks`
       * (default true) flags the no-OA clause. Collected per source into
       * `onCritMovement`; the consumer (`resolveOnCritMovement`) resolves the
       * concrete distance against the effective walking Speed (round down).
       * Override-first — the engine never moves the token.
       */
      type: "on-crit-movement-rider";
      fraction: "half" | "full";
      ignoresOpportunityAttacks?: boolean;
    }
  | {
      /**
       * Combat-economy rider letting the character spend part of the SAME Attack
       * action's attacks to cast a spell instead of swinging (Eldritch Knight War
       * Magic L7 → replace 1 attack with a Wizard cantrip; Improved War Magic L18
       * → replace 2 attacks with a level-1-or-2 Wizard spell). `attacks` = how
       * many of the Attack action's attacks the cast replaces; the spell must
       * come from `classSpellList`, fall within `[minSpellLevel (default 0),
       * maxSpellLevel]` (`maxSpellLevel: 0` = cantrips only), and match
       * `castTime`. Collected per source into `replaceAttackWithCast`; the
       * consumer (`resolveReplaceAttackWithCast`) caps `attacks` at the
       * character's actual `attacksPerAction`. Override-first — the engine never
       * spends an attack or a slot; it only surfaces the option.
       */
      type: "replace-attack-with-cast";
      attacks: number;
      classSpellList: string;
      minSpellLevel?: number;
      maxSpellLevel: number;
      castTime: "action";
    }
  | {
      /**
       * GENERAL Unarmed-Strike damage upgrade (Monk Martial Arts, College of
       * Dance Bardic Damage) — replaces the per-class `classSpecific` workaround.
       * `die` is a fixed die (`"d6"`) or the deferred `"classSpecific:<key>"`
       * sentinel the consumer resolves from the class-table level row (Monk
       * `martialArtsDie`, Bard `bardicInspirationDie`). `attackAbility` may be
       * USED in place of STR for the attack roll (best-of wins); `damageAbility`
       * (omit = die only) adds its modifier to the damage. Collected into
       * `unarmedStrikeDice`; the consumer (`effectiveUnarmedStrike`) picks the
       * highest-average die and resolves the profile.
       */
      type: "unarmed-strike-die";
      die: string;
      attackAbility?: AbilityCode;
      damageAbility?: AbilityCode;
      damageType: DamageType;
    }
  | {
      /**
       * Extends a melee weapon's reach (Barbarian World Tree "Battering Roots":
       * +10 ft reach with Heavy or Versatile weapons + activate Push/Topple
       * mastery). `bonusFt` is the added reach; `appliesTo` narrows the weapons it
       * rides (`"heavy-or-versatile"` or `"all-melee"`); `extraMasteries` lists
       * mastery properties the feature activates in addition. Collected into
       * `weaponReachBonuses`; the attack-row consumer (`resolveActions`) widens
       * the range + surfaces the extra masteries for matching weapons.
       */
      type: "weapon-reach-bonus";
      bonusFt: number;
      appliesTo: "heavy-or-versatile" | "all-melee";
      extraMasteries?: ReadonlyArray<string>;
    }
  | {
      /**
       * Lets the character expend a spell slot to recover uses of a tracker
       * (Bard Font of Inspiration: "expend a spell slot to regain one use of
       * Bardic Inspiration"). `trackerId` is the target tracker; `usesPerSlot` is
       * how many uses one slot restores. Collected into
       * `spellSlotTrackerRecoveries`; the consumer (`getSpellSlotTrackerRecovery`)
       * resolves the available slot levels + the post-recovery used count.
       */
      type: "spell-slot-tracker-recovery";
      trackerId: string;
      usesPerSlot?: number;
    }
  | {
      /**
       * Tops a tracker back UP to a floor when the character rolls Initiative
       * (Bard Superior Inspiration: "regain expended uses of Bardic Inspiration
       * until you have two"). `trackerId` is the target tracker; `upTo` is the
       * floor it is restored to (only RAISES — never reduces an already-higher
       * count). Collected into `initiativeTrackerTopUps`; the consumer
       * (`getInitiativeTrackerTopUps`) resolves the per-tracker target.
       */
      type: "initiative-tracker-topup";
      trackerId: string;
      upTo: number;
    }
  | {
      /**
       * Declares that the character makes `count` ADDITIONAL weapon attacks with
       * a single Attack action (the "Extra Attack" feature). `count` is the
       * number of EXTRA attacks, NOT the total — Extra Attack ("attack twice")
       * → `count: 1`; Fighter's L11 upgrade → `count: 2`; L20 → `count: 3`.
       *
       * Replaces the old `srdId.includes("extra-attack")` substring heuristic in
       * `attacksPerAction`: every martial's Extra Attack feature (Barbarian /
       * Paladin / Ranger / Monk / Valor & Sword Bard / Battle Smith & Armorer
       * Artificer / Bladesinger) declares this grant, and Warlock's Thirsting
       * Blade (1) / Devouring Blade (2) invocations declare it too.
       *
       * Merge: MAX across grants (the most attacks granted wins). Extra Attack
       * features never STACK in 2024 RAW — multiclassing into a second class with
       * Extra Attack does not give you more attacks, and Devouring Blade
       * UPGRADES Thirsting Blade rather than adding to it. Fighter encodes its
       * scaling count directly in the class table (`classSpecific.extraAttacks`),
       * which the consumer maxes against this aggregate. `min` for the helper is
       * therefore the larger of the table value and the grant aggregate.
       */
      type: "extra-attack";
      count: number;
    }
  | {
      /**
       * B6 — grants `count` ADDITIONAL economy slot(s) of `slot` per turn while the
       * source is active (Fighter Action Surge → an extra Action; the Haste spell →
       * an extra LIMITED action, modeled as a Bonus slot). ALWAYS nested inside a
       * `while-active` block so it counts ONLY while its toggle is lit — the budget
       * is derived per-turn from the active features, never persisted (the player
       * toggles the source on, override-first; the engine never auto-spends a slot).
       * `count` is the number of EXTRA slots (Action Surge = 1). Read by
       * `extraActionsThisTurn` (smart-tracker), NOT folded into the global aggregate
       * (the budget is a combat-only concern, kept off every other surface — YAGNI).
       * Merge for the same slot: SUM across active sources (Action Surge + Haste both
       * lit grant two extra actions).
       */
      type: "extra-action";
      slot: "action" | "bonus";
      count: number;
    }
  | {
      /**
       * During combat, the character can give themself Heroic Inspiration at the
       * start of each turn if they lack it (Champion's Heroic Warrior, L10).
       * Pure marker — STATE stays on the existing `SessionState.inspiration`
       * boolean; this only flips an aggregate flag so the (UI-owned) renderer can
       * surface the "regain Inspiration at start of turn" affordance. Merge: OR.
       */
      type: "heroic-inspiration-at-turn-start";
    }
  | {
      /**
       * The character gains Heroic Inspiration whenever they finish a Long Rest
       * (Human's Resourceful trait). Pure rest-trigger marker — STATE stays on
       * the existing `SessionState.inspiration` boolean; this only flips an
       * aggregate flag so the Long Rest consumer auto-grants Inspiration (and
       * the UI can surface the affordance). Merge: OR. Distinct from
       * `heroic-inspiration-at-turn-start` (Champion, combat-turn trigger).
       */
      type: "heroic-inspiration-on-rest";
    }
  | {
      /**
       * An at-0-HP interrupt: when the character would drop to 0 HP, they can
       * instead drop to 1 (Orc Relentless Endurance, Paladin Undying Sentinel,
       * Boon of Misty Escape — Gaseous Form). `trackerId` is the 1/rest resource
       * the interrupt debits. Collected into `atZeroHpInterrupts`; the consumer
       * (`resolveAtZeroHpInterrupts`) surfaces the one-tap "stay at 1" prompt in
       * the DyingBanner ONLY when the tracker has an unspent use. The `recovery`
       * is descriptive (the underlying tracker owns the real recovery cadence).
       */
      type: "at-zero-hp-interrupt";
      trackerId: string;
    }
  | {
      /**
       * One-shot flat HP bonus, NOT per level (Boon of Fortitude / Bountiful
       * Health, Draconic Sorcerer's Draconic Resilience). Merge: sum. Distinct
       * from `hp-per-level` (which multiplies by level).
       */
      type: "hp-flat";
      amount: number;
    }
  | {
      /**
       * Raises the attunement-slot cap above the default 3 (Artificer's Magic
       * Item Adept → 4, Savant → 5, Master → 6). Merge: MAX (the highest cap
       * granted wins). The Equipment page shows "Attuned: N / cap".
       */
      type: "attunement-slots";
      amount: number;
    }
  | {
      /**
       * EXTRA Exhaustion levels removed on a rest. `recovery` selects the
       * channel: `"long-rest"` (default) adds beyond the default 1 removed on a
       * Long Rest (Monk Self-Restoration: −2 instead of −1 → amount 1);
       * `"short-rest"` is a genuine EXTRA channel (Ranger Tireless removes 1 on a
       * Short Rest, where RAW removes none). The two channels aggregate into
       * separate fields and never mix. Merge: sum (per channel).
       */
      type: "exhaustion-recovery";
      amount: number;
      recovery?: "long-rest" | "short-rest";
    }
  | {
      /**
       * Sets an ability score to a FLOOR value while the source is active
       * (Amulet of Health → CON 19, Gauntlets of Ogre Power → STR 19, Headband
       * of Intellect → INT 19). "No effect if your score is already higher",
       * so the merge is MAX(base, value) — see `effectiveAbilityScores`.
       * Equip-gated via the L2 equipment grant seam.
       */
      type: "ability-score-set";
      ability: AbilityCode;
      value: number;
    }

  // ── AC formula override (highest-applicable wins at render time) ─────────
  | {
      /**
       * Unarmored Defense + variants. The evaluator collects every formula
       * grant; `computeAC` picks the highest applicable result at render
       * time based on the character's current armor state.
       *
       * `condition` declares when the formula applies:
       *  - "no-armor"            — Barbarian Unarmored Defense (10 + DEX + CON)
       *  - "no-armor-no-shield"  — Monk Unarmored Defense (10 + DEX + WIS)
       *  - "always"              — formula always available (rare)
       *  - "while-active"        — only when its wrapping `while-active` toggle
       *    is on (Circle of the Moon Circle Forms: AC = 13 + WIS while in a Wild
       *    Shape form). The form replaces the body's stat block, so the formula
       *    is a self-contained total (armor / shield / item bonuses don't apply)
       *    and `computeAC` takes `max(form AC, normal AC)` — see
       *    `computeAC`'s `activeAcFormulas` parameter.
       *
       * `base` is the floor value. `bonuses` lists the ability modifiers to
       * add. `shieldBonus` is the optional +N if the formula tolerates a
       * shield (default 0).
       */
      type: "ac-formula";
      base: number;
      bonuses: ReadonlyArray<AbilityCode>;
      condition: "no-armor" | "no-armor-no-shield" | "always" | "while-active";
      shieldBonus?: number;
    }
  | {
      /**
       * Raises the Medium-armor DEX-to-AC cap above the RAW default of 2
       * (Medium Armor Master → 3 when DEX is 16+). The cap applies ONLY to the
       * Medium-armor DEX contribution; Light armor (uncapped) and Heavy armor
       * (no DEX) are unaffected. `cap` is the new ceiling (3 for Medium Armor
       * Master). `minDex` gates the benefit on a minimum DEX SCORE (default 16,
       * per the feat's "if you have a Dexterity of 16 or higher"); when the
       * character's DEX score is below it, the cap reverts to the default 2.
       * Merge: MAX cap wins (the most generous bonus); the lowest `minDex`
       * among the winning caps gates it. `computeAC` consumes the aggregate's
       * `mediumArmorDexCap` and applies it in place of the hard-coded 2.
       */
      type: "medium-armor-dex-cap";
      cap: number;
      minDex?: number;
    }

  // ── Choice grants (evaluator → pendingChoices, level-up surfaces picker) ─
  | {
      /**
       * Phase 7 — Choice ASI grant. Declares which abilities the player
       * may pick from (Heavy Armor Master: STR or CON; Athlete: STR/DEX/CON;
       * Skilled "any of your choice": all six). The evaluator records the
       * pending choice in `pendingChoices` if `chosen` is not set, and
       * applies it as an `ability-score` grant once resolved.
       */
      type: "choice-ability-score";
      abilities: ReadonlyArray<AbilityCode>;
      amount: number;
      cap?: number;
    }
  | {
      /** Phase C — Choice skill proficiency from a constrained list. */
      type: "choice-skill-proficiency";
      options: ReadonlyArray<string>;
      amount: number;
    }
  | {
      /**
       * L8 — Choose N skills the character is proficient in (but lacks
       * Expertise in) to gain Expertise. The picker offers only the
       * character's proficient skills; resolution upgrades them to
       * "expertise" in `character.skills`. Skill Expert (1), Prodigy, etc.
       */
      type: "choice-expertise";
      amount: number;
    }
  | {
      /**
       * Skilled-style "pick N skills OR tools" choice. The picker UI
       * surfaces a unified pool. Resolution: skill picks go to
       * `character.skills`; tool picks go to `character.toolProficiencies`
       * (legacy string shape). See `lib/feat-skill-tool-choices.ts`.
       */
      type: "choice-skill-or-tool-proficiency";
      amount: number;
    }
  | {
      /** Phase C — Choice language. Empty `options` means any language. */
      type: "choice-language";
      options: ReadonlyArray<string>;
      amount: number;
    }
  | {
      /** Phase C — Choice tool proficiency from a constrained list. */
      type: "choice-tool-proficiency";
      options: ReadonlyArray<string>;
      amount: number;
    }
  | {
      /**
       * Phase C — Choice cantrip. `classSpellList` constrains the pool to a
       * single class's cantrip list ("wizard", "cleric", …); omit to allow
       * any class's cantrips (rare, e.g. Sage's Boon). When `spellAbility`
       * is set, every cantrip picked through this slot is pinned to that
       * casting ability (Magic Initiate Cleric → "WIS", Wizard → "INT").
       * `spellAbilityChoice` (2024 Magic Initiate) instead defers the ability to
       * a player choice among the listed set — auto-defaulted to the character's
       * BEST of that set at pick time (override-first), stamped as
       * `spellAbilityOverride`. Use one or the other, not both.
       */
      type: "choice-cantrip";
      classSpellList?: ClassId;
      amount: number;
      spellAbility?: AbilityCode;
      spellAbilityChoice?: ReadonlyArray<AbilityCode>;
    }
  | {
      /**
       * Phase C — Choice spell. `classSpellList` constrains the pool;
       * `maxLevel` caps the spell level (level-1 spells of choice from the
       * Wizard list, e.g. Magic Initiate). `spellAbility`, when set, pins
       * the casting ability for every spell picked through this slot —
       * unblocks Magic-Initiate-style feats taken by characters whose base
       * class uses a different ability (e.g. Fighter + Magic Initiate
       * Cleric → Wisdom for those spells).
       */
      type: "choice-spell";
      classSpellList?: ClassId;
      /**
       * choice-spell-multi-list: union of class lists the pick may draw from
       * (Bard Magical Secrets → bard+cleric+druid+wizard; Lore's Magical
       * Discoveries → cleric+druid+wizard). A spell qualifies if it is on ANY
       * listed list. Combines with `classSpellList`; when both are absent the
       * pool is unrestricted ("any spell list"). The picker reads the effective
       * union via `allowedSpellListsForSlot`.
       */
      classSpellLists?: ReadonlyArray<ClassId>;
      maxLevel: number;
      amount: number;
      spellAbility?: AbilityCode;
      /**
       * 2024 Magic Initiate: the casting ability is the player's choice among
       * this set (Int/Wis/Cha) rather than pinned to the list. Auto-defaulted to
       * the character's BEST of the set at pick time (override-first), stamped as
       * `spellAbilityOverride`. Use one of `spellAbility` / `spellAbilityChoice`.
       */
      spellAbilityChoice?: ReadonlyArray<AbilityCode>;
      /**
       * When set, the picker restricts the pool to spells that have the Ritual
       * tag (`spell.ritual === true`) across ALL class lists — Warlock Pact of
       * the Tome's Book of Shadows ("choose two level 1 spells that have the
       * Ritual tag … from any class's spell list"). Combines with `maxLevel`
       * (the L1 cap) and any `classSpellList`/`classSpellLists` restriction; on
       * Pact of the Tome there is no list restriction, so the pool is every
       * Ritual-tagged spell at or below `maxLevel`. Omit (default `false`) for
       * the usual non-ritual choice-spell slots.
       */
      ritualOnly?: boolean;
      /**
       * Restrict the pool to spells of a single school of magic
       * (`spell.school === spellSchool`). The Wizard subclass Savant features are
       * the canonical case — each School Savant (Abjuration / Divination /
       * Evocation / Illusion) adds only that school's Wizard spells to the
       * spellbook for free ("Choose two Abjuration spells of level 2 or lower…").
       * Combines with `classSpellList`/`classSpellLists` (the Savant features set
       * `classSpellList: "wizard"`), `maxLevel` (the L2 cap on the initial
       * picks), and `ritualOnly`. The picker filters on `spell.school ===
       * spellSchool`. Omit for the usual any-school choice-spell slots.
       */
      spellSchool?: SpellSchool;
      /**
       * Restrict the pool to ANY of several schools — the feat "choose one
       * level 1 spell from the Divination or Enchantment school" pattern
       * (Fey-Touched / Shadow-Touched / Vampire-Touched). The picker accepts a
       * spell whose school is in this list. Use either this or the
       * single-school `spellSchool`, not both.
       */
      spellSchools?: ReadonlyArray<SpellSchool>;
      /**
       * When the picks are added to the Wizard's SPELLBOOK rather than auto-
       * prepared — the Savant features ("add them to your spellbook for free")
       * grant spellbook entries that the Wizard still prepares like any other
       * spellbook spell, NOT always-prepared subclass spells. When `true` the
       * resolver lands each pick as a plain spellbook ref (`prepared: false`,
       * `alwaysPrepared` unset) so it counts toward the Wizard's normal prepared
       * budget when prepared; absent / `false` keeps the default
       * `prepared:true + alwaysPrepared:true` (Magic Initiate-style feats).
       */
      toSpellbook?: boolean;
      /**
       * When set, every spell picked through this slot is also free-castable
       * via the named feature's tracker (a free-cast heritage feat → 1/Long Rest
       * slotless cast of the chosen spell). The choice resolver stamps it onto
       * the spell ref's `freeCastSource`.
       */
      freeCastSource?: { sourceId: string; rest: "short" | "long"; usesPerRest: number };
      /**
       * RECURRING school-savant entitlement (Wizard subclass Savants). When set
       * to a `ClassId`, the slot's pick COUNT and `maxLevel` are not the static
       * `amount`/`maxLevel` (which describe only the INITIAL grant at the savant
       * level) but are derived from that class's spell-slot progression at the
       * character's level: 2024 School Savant grants "two [school] spells of level
       * ≤2 at L3, then ONE more each time you gain a new spell-slot level." The
       * entitlement is therefore `count = amount + max(0, maxSpellSlotLevel − 2)`
       * and `maxLevel = maxSpellSlotLevel`, where `maxSpellSlotLevel` is the
       * highest spell level the class can cast at the character's current level
       * (`savantSpellEntitlement`). The picker/level-up consumer must supply the
       * class's spell-slot row as context (`SpellChoiceCtx.spellSlotsByClass`); a
       * level-agnostic caller falls back to the static `amount`/`maxLevel` (the
       * initial picks only). Combines with `spellSchool` + `toSpellbook`. Omit for
       * a one-shot choice-spell.
       */
      recurringPerSpellLevel?: ClassId;
    }
  | {
      /**
       * **Choice-feat (origin-feat grant)** — the source grants the character a
       * WHOLE FEAT of their choice, drawn from a feat `category`. The canonical
       * case is the Warlock invocation **Lessons of the First Ones** ("you gain
       * one Origin feat of your choice"; Repeatable — a *different* Origin feat
       * each time you take it) and the Human **Versatile** trait ("You gain an
       * Origin feat of your choice").
       *
       * Unlike `choice-spell` (which lands loose spell refs) the pick is an
       * entire feat with its own grants / tracker / actions, so resolution adds
       * the chosen feat slug to `character.features` as an ordinary
       * `SrdFeatureRef` and the existing feat pipeline
       * (`resolveGrantSourcesForFeatures`, the tracker/action resolvers) takes
       * it from there — exactly how the Background origin feat is modelled. This
       * grant is therefore a PENDING-CHOICE seam, not an aggregate of effects:
       * the evaluator records a `{ kind: "feat", category, amount }` pending
       * choice the picker surfaces; the consumer (`feat-feat-choices.ts`)
       * enumerates the eligible feats and applies the pick.
       *
       * `category` constrains the pool to one `FeatCategory` ("origin" for both
       * current consumers). `amount` is how many feats this slot grants (1 for
       * every current case). The picker filters out feats the character already
       * has UNLESS the feat is `repeatable` — mirroring "choose a different
       * Origin feat each time" for the Repeatable invocation.
       *
       * Override-first: with no pick made the slot contributes nothing (the
       * feat the player would gain is absent until they choose); the player can
       * later edit/remove the resulting feature like any other.
       */
      type: "choice-feat";
      category: FeatCategory;
      amount: number;
    }

  // ── Weapon attack stat override ──────────────────────────────────────────
  | {
      /**
       * Lets the character use a non-physical ability for weapon attack +
       * damage rolls (Bladesinger's Bladesong: INT for all weapons while
       * active; Artificer Battle Smith: INT for magic weapons). The attack-row
       * resolver uses the BEST of this ability vs the weapon's default
       * (STR/DEX), per RAW "you can use". `magicOnly` restricts it to magic
       * weapons (not yet enforced — pending magic-weapon detection).
       */
      type: "weapon-attack-ability";
      ability: AbilityCode;
      magicOnly?: boolean;
      /**
       * Narrows the ability swap to a weapon CATEGORY. `"monk-melee"` — the 2024
       * Monk's "Monk weapons": Simple Melee weapons and Martial Melee weapons with
       * the Light property (Martial Arts lets a Monk use DEX for attack + damage
       * with them). Omitted ⇒ applies to every weapon (Bladesong INT).
       */
      weaponScope?: "monk-melee";
      /**
       * Optional damage-DIE upgrade for the scoped weapons — the Monk Martial
       * Arts die REPLACES the printed die when LARGER (Shortsword 1d6 → 1d8 at
       * Monk L5; a Dagger 1d4 → 1d6 even at L1). A fixed die (`"d8"`) or the
       * deferred `"classSpecific:<key>"` sentinel (`"classSpecific:martialArtsDie"`),
       * resolved against the OWNING feature's class+level (multiclass-correct,
       * like `unarmed-strike-die`). The weapon resolvers take `max(weaponDie,
       * upgradeDie)`. Omitted ⇒ the ability swap carries no die change. The same
       * `max`-of-die logic as `effectiveUnarmedStrike` (reused via
       * `effectiveWeaponDie`).
       */
      dieUpgrade?: string;
    }
  | {
      /**
       * A to-hit bonus added to weapon attack rolls within a scope — the to-hit
       * counterpart of `weapon-damage-bonus` (which rides the damage roll) and of
       * `damage-rider` (which adds an extra die). Distinct from
       * `weapon-attack-ability` (which swaps the attack ABILITY, not adds a flat
       * term) and from `spell-attack-bonus` (which rides spell attacks only).
       *
       * `amount` is EITHER a flat number OR an ability-derived variant
       * `{ ability, min? }` — add that ability's modifier (clamped UP to `min`,
       * default 0), the SAME `{ ability, min }` shape proven on bonus-to-save
       * (Aura of Protection) and mirroring how `weapon-damage-bonus` carries a
       * polymorphic amount. Archery fighting style → `{ amount: 2, scope:
       * "ranged" }` (flat). Paladin Devotion Sacred Weapon → `{ amount: { ability:
       * "CHA", min: 1 }, scope: "melee" }` inside a `while-active` wrapper: +CHA
       * modifier (minimum +1) to attacks with the imbued Melee weapon while lit.
       * The evaluator can't resolve the ability variant (it has no character /
       * ability scores); the consumer (`resolveWeaponAttackBonuses` in
       * smart-tracker) resolves it against the effective scores per weapon.
       *
       * `scope` narrows which weapon attacks the bonus rides:
       *   - "ranged" — only Ranged weapons (Archery);
       *   - "melee"  — only Melee weapons (+ Unarmed, mirroring `damage-rider`'s
       *     "melee-weapon");
       *   - "any"    — every weapon attack.
       * Thrown weapons used in melee count as melee; a Ranged weapon is keyed off
       * `weaponType === "ranged"` exactly like the existing attack-row logic.
       *
       * Merge: SUM of the resolved `amount`s of every grant whose scope applies
       * to the weapon (so two ranged-bonus sources stack additively into the
       * to-hit). The consumer (`resolveActions` weapon rows) adds the matching
       * total to the computed `attackBonus`. Override-first: skipped entirely
       * when the player pins a per-weapon `attackBonusOverride` (the override
       * replaces the whole to-hit, so the bonus never double-counts).
       */
      type: "weapon-attack-bonus";
      amount: number | { ability: AbilityCode; min?: number };
      scope: "any" | "ranged" | "melee";
    }
  | {
      /**
       * A FLAT bonus added to the DAMAGE roll of weapon attacks within a scope —
       * the damage counterpart of `weapon-attack-bonus` (which rides the to-hit)
       * and the flat sibling of `damage-rider` (which adds a self-contained extra
       * DIE). Barbarian Rage Damage: "When you make an attack using Strength —
       * with either a weapon or an Unarmed Strike — you gain a bonus to the
       * damage" → `{ sourceKey: "rageDamage", scope: "strength" }` inside the
       * Rage `while-active` wrapper, so it applies only while raging (issue #27).
       *
       * The bonus value is EITHER a flat `amount` OR a `sourceKey` into the
       * owning class table's `classSpecific` map, resolved at the character's
       * level IN that class — the SAME key the feature's tracker `rider` chip
       * reads (Rage Damage 2/3/4), so the chip and the weapon formula can never
       * drift (single source of truth). The evaluator can't resolve it (no
       * character); the consumer (`resolveWeaponDamageBonuses` in smart-tracker)
       * resolves it per weapon at render.
       *
       * `scope` narrows which weapon attacks the bonus rides:
       *   - "ranged"   — only Ranged weapons (`weaponType === "ranged"`);
       *   - "melee"    — only Melee weapons (incl. Thrown used in melee);
       *   - "strength" — any attack whose resolved attack ability is STR
       *     (Rage: a thrown Handaxe and an Unarmed Strike qualify; a
       *     DEX-resolved Finesse weapon does not);
       *   - "heavy"    — only weapons with the Heavy property (GWM 2024 Heavy
       *     Weapon Mastery: "+your Proficiency Bonus damage on a hit with a
       *     Heavy weapon"). The consumer matches on the weapon's `properties`.
       *   - "any"      — every weapon attack.
       *
       * `amount` is EITHER a flat number, the `"PB"` sentinel (resolved to the
       * character's Proficiency Bonus at render — GWM's +PB), OR a `sourceKey`
       * into the owning class table.
       *
       * Merge: `[list]` — every applicable entry SUMS into the damage modifier.
       * Folded into the weapon's damage FORMULA (`2d6+3` → `2d6+5`), not an
       * extra-damage chip. Override-first: skipped when the player pins a
       * per-weapon `damageOverride` (the override replaces the whole formula).
       */
      type: "weapon-damage-bonus";
      amount?: number | "PB";
      sourceKey?: string;
      scope: "any" | "ranged" | "melee" | "strength" | "heavy";
    }

  // ── Proficiencies (merge: set-union) ─────────────────────────────────────
  //
  // Canonical id contract (enforced for `skill`/`expertise` by
  // `tests/unit/skill-grant-id-guard.test.ts`):
  //   • `skill` — a lowercase ALL_SKILLS id ("insight", "sleight-of-hand").
  //     `mergeSkillProficiencies` merges it verbatim into `character.skills`
  //     (no casing normalisation), so a capitalised id silently lands as a
  //     separate, non-canonical key and the proficiency is dropped.
  //   • `tool` — an EN display NAME (the stable FACT anchor; the presenter
  //     resolves it to the catalogue tool id and localizes — `displayToolProficiencies`).
  //   • `language` — an EN display NAME (the FACT anchor); the presenter resolves it
  //     to the catalogue language id and localizes (`displayLanguages`).
  | { type: "save-proficiency"; ability: AbilityCode }
  | { type: "skill-proficiency"; skill: string }
  | { type: "expertise"; skill: string }
  | {
      /**
       * Jack-of-all-Trades-style half-proficiency in EVERY skill the character
       * isn't otherwise proficient/expert in (Bard L2 `bard-jack-of-all-trades`).
       * A pure marker — it carries no skill list, because the benefit is "add
       * half your Proficiency Bonus to any ability check that doesn't already
       * use your Proficiency Bonus". The evaluator ORs it into a boolean aggregate
       * (`halfProficiencyAllSkills`); the skill consumer
       * (`mergeSkillProficiencies`) fills `halfProficiency` for every unproficient
       * skill at the BOTTOM of the proficiency lattice — so a real proficiency
       * always wins (#66) and the half is fully DERIVED, never baked into stored
       * `skills` (#57): it appears + disappears exactly with the feature. Merge: OR.
       */
      type: "half-proficiency-all-skills";
    }
  | { type: "language"; language: string }
  | { type: "tool-proficiency"; tool: string }
  | {
      /**
       * Weapon proficiency from a feature (Valor Bard's Martial Training,
       * Bladesinger, etc.). `proficiency` is a stable {@link ProficiencyToken} —
       * a category (`martial-weapons`) or a weapon-type group (`longswords`),
       * the SAME id vocabulary the class table uses. The Equipment page + combat
       * attack-row union these with the class list; the display resolves via
       * `localizeSrd("proficiency", id, "name", locale)`.
       */
      type: "weapon-proficiency";
      proficiency: ProficiencyToken;
    }
  | {
      /** Armor/shield proficiency from a feature — a stable
       *  {@link ProficiencyToken} (`medium-armor`, `shields`). */
      type: "armor-proficiency";
      proficiency: ProficiencyToken;
    }

  // ── Spell grants ─────────────────────────────────────────────────────────
  | {
      type: "always-prepared-spell";
      spellId: string;
      /**
       * Pin the casting ability for this spell — used by heritage feats
       * ("Intelligence is your spellcasting ability for these spells"),
       * Magic Initiate, etc. When set, the injected SrdSpellRef carries
       * `spellAbilityOverride` so DC/attack computation uses this ability
       * regardless of the character's class spellcasting ability.
       */
      spellAbility?: AbilityCode;
      /**
       * Defer the casting ability to the character's species "choose INT/WIS/
       * CHA" pick (2024 Tiefling Fiendish Legacy + Otherworldly Presence) rather
       * than pinning a concrete `spellAbility`. The injection stamps
       * `speciesSpellAbility: true` on the SrdSpellRef; `resolveSpellAbility`
       * then reads the live `character.speciesSpellAbility` (defaulting to
       * `SPECIES_SPELL_ABILITY_DEFAULT`). Mutually exclusive with `spellAbility`
       * — set one or the other.
       */
      spellAbilitySource?: "species";
      /**
       * Minimum character level before this spell is prepared. Used inside a
       * `choice-grant-bundle` whose options list spells across several
       * thresholds (Circle of the Land's terrain Circle Spells unlock at druid
       * 3/5/7/9). The injection consumer (`getAlwaysPreparedFromGrants`) gates
       * on it; the render aggregate ignores it (harmless — the field is unused
       * for display). Omit for spells available as soon as the feature is.
       */
      minLevel?: number;
    }
  | {
      /**
       * Phase C — Free-cast: the character can cast a specific spell N times
       * per Long Rest (or per Short Rest) without expending a spell slot.
       * Magic Initiate (1× LR), Fey-Touched (Misty Step 1× LR), Vampire Touched
       * (Spider Climb 1× LR), Reawakened spells (1× SR), etc.
       *
       * The tracker engine creates an implicit N/<rest> counter on the
       * source feature when `chargesPerRest > 0`. `casterAbility` overrides
       * the spellcasting ability for this specific free-cast (some feats
       * let you pick INT/WIS/CHA).
       */
      type: "free-cast-spell";
      spellId: string;
      chargesPerRest: number;
      /**
       * Optional formula for a SCALED charge count (Forest Gnome: cast Speak with
       * Animals "a number of times equal to your Proficiency Bonus per Long Rest";
       * Circle-of-the-Stars Star Map: Guiding Bolt "a number of times equal to your
       * Wisdom modifier"; Fey-Wanderer Misty Wanderer: Misty Step "Wisdom modifier"
       * times; Cartographer Mapping Magic: Faerie Fire "Intelligence modifier"
       * times). When set, the consumer resolves it through the SHARED
       * `resolveChargesFormula` → `resolveTrackerTotal` vocabulary (`"PB"`, an
       * ability code like `"WIS"`/`"INT"`, `"level"`, and the arithmetic forms) and
       * it OVERRIDES the fixed `chargesPerRest`. Omitted for the common fixed-count
       * case (1× LR).
       */
      chargesFormula?: string;
      rest: "short" | "long";
      // Full AbilityCode range — most feats use INT/WIS/CHA but a handful
      // (Mark of Passage: DEX) pin a physical ability for casting.
      casterAbility?: AbilityCode;
      /**
       * Character-level gate (mirrors `always-prepared-spell.minLevel`): the free
       * cast is only offered once the character reaches this level. Used by the
       * heritage feats whose SECOND spell unlocks at character level 3.
       */
      minLevel?: number;
    }
  | {
      /**
       * D4 — Free-cast FROM A LIST: the character can cast a spell from a bounded
       * pool, N times per rest, WITHOUT a slot — a GUIDED PICKER, not a fixed
       * spell. Two pool shapes (mutually exclusive):
       *
       *  - **class-list pool** (`spellList` + `maxSpellLevel`): ANY spell from a
       *    class list up to a level cap. Cleric Divine Intervention (2024): "take
       *    the Magic action to cast any Cleric spell of level 5 or lower without
       *    expending a spell slot … once per Long Rest."
       *  - **fixed-set pool** (`spellIds`): a NAMED handful — War God's Blessing
       *    (2024 War Domain L6): "expend a use of your Channel Divinity to cast
       *    Shield of Faith or Spiritual Weapon rather than expending a spell slot."
       *    The cast doesn't require Concentration and lasts 1 minute.
       *
       * Distinct from `free-cast-spell` (one fixed spell on its OWN per-spell
       * tracker): here the SPELL is the player's choice within the pool, and the
       * per-rest cap debits a SHARED `trackerId` (an existing feature tracker —
       * Divine Intervention's own `tracker`, War God's Blessing's
       * `cleric-channel-divinity`). The owning feature defines that tracker; this
       * grant carries only the pool. `trackerId` defaults to the source feature id.
       */
      type: "free-cast-from-list";
      /** The class spell-list to draw from (omitted for a fixed-set pool). */
      spellList?: string;
      /** Highest spell level a class-list pick may choose (inclusive; class-list pool only). */
      maxSpellLevel?: number;
      /**
       * A FIXED set of stable spell ids — the entire pool when set (War God's
       * Blessing: `["shield-of-faith", "spiritual-weapon"]`). Mutually exclusive
       * with `spellList`/`maxSpellLevel`.
       */
      spellIds?: readonly string[];
      /**
       * S9 — PER-SPELL charge cost sidecar (spellId → charges) for a VARIABLE-cost
       * pool: a multi-spell charged magic item whose spells debit DIFFERENT charge
       * counts (Wand of Binding → Hold Monster 5 / Hold Person 2; Wand of Fear →
       * Command 1 / Fear 3). A spell absent from the map costs 1 charge (the
       * default), so the two existing feature pools (Divine Intervention, War God's
       * Blessing — a use IS a use) omit it entirely and stay unchanged. The
       * consumer resolves it into `FreeCastFromListPool.costBySpell` (default 1 for
       * every eligible spell — single source, golden rule 6). Never reshapes
       * `spellIds`.
       */
      spellCosts?: Readonly<Record<string, number>>;
      /**
       * Per-rest charge cap. OMIT to INFER it from the debited tracker's resolved
       * total (War God's Blessing rides the whole Channel Divinity pool — 2/3/4 by
       * level — so it must not hardcode a number; golden rules 2/6). Set explicitly
       * only when the pool's cap differs from the tracker total (Divine Intervention
       * = its own dedicated 1/LR tracker, so `1` is redundant-but-explicit there).
       */
      chargesPerRest?: number;
      /** Rest cadence the cap recovers on; defaults to the debited tracker's. */
      rest?: "short" | "long";
      /** The tracker id to debit per use; defaults to the source feature id. */
      trackerId?: string;
      /** Spellcasting ability override for this cast (defaults to the caster's). */
      casterAbility?: AbilityCode;
    }
  | {
      /**
       * At-will free cast — an UNBOUNDED slotless self-cast (no tracker, no
       * per-rest cap). Distinct from `free-cast-spell`, which models a bounded
       * N/rest tracker; this one can be used any number of times. Warlock's
       * at-will Eldritch Invocations are the canonical case (Armor of Shadows →
       * Mage Armor, Mask of Many Faces → Disguise Self, Master of Myriad Forms →
       * Alter Self, Misty Visions → Silent Image, Otherworldly Leap → Jump,
       * One with Shadows → Invisibility, Ascendant Step → Levitate, Visions of
       * Distant Realms → Arcane Eye, Whispers of the Grave → Speak with Dead,
       * Fiendish Vigor → False Life).
       *
       * Like Wizard Spell Mastery, it surfaces as an at-will (`kind: "mastery"`)
       * cast-option row at the spell's BASE level only — never an upcast, never
       * a tracker decrement. Pair it with an `always-prepared-spell` grant for
       * the same spell so the spell becomes visible/prepared on the Spells page
       * (the at-will primitive only models the slotless cast option, not
       * preparedness). `casterAbility` pins the spellcasting ability for this
       * cast (Warlock invocations: CHA).
       *
       * `autoMaxTempHpFormula` (optional) declares that casting THIS way grants
       * the **maximized** Temporary HP of the spell instead of a roll — Fiendish
       * Vigor: "When you cast the spell with this feature, you don't roll the die
       * for the Temporary Hit Points; you automatically get the highest number on
       * the die." Carries the spell's own temp-HP formula verbatim from the SRD
       * (False Life 2024 → `"2d4+4"`); the evaluator resolves it through the pure
       * {@link maximizeDiceFormula} (each `NdX` → `N*X`, plus flat terms) into a
       * concrete `autoMaxTempHp` on the {@link AtWillCastEntry} (2d4+4 → 12). The
       * cast-options consumer surfaces it on the at-will row so the player applies
       * the flat maximized total. NO RNG — the maximization is deterministic, and
       * temp HP are still applied override-first (the engine never auto-sets HP).
       * Omit for every other at-will invocation (a normal slotless cast).
       *
       * Merge: deduped by `spellId` (first source wins) — a spell granted
       * at-will by two sources still yields one at-will row.
       */
      type: "at-will-cast-spell";
      spellId: string;
      casterAbility?: AbilityCode;
      autoMaxTempHpFormula?: string;
    }
  | {
      /**
       * Phase C — Per-spell ritual access (Comprehend Languages as Ritual
       * from Banneret, etc.). For Wizard's Ritual Adept "cast any spell in
       * your spellbook as a ritual", use `ritual-casting-any` below.
       */
      type: "ritual-casting";
      spellId: string;
    }
  | {
      /**
       * Phase C — "Any spell with the Ritual tag from <list>" — Wizard Ritual
       * Adept's class-wide grant. The Spells page reads this to decorate
       * every prepared/known ritual spell with a Ritual-cast button.
       */
      type: "ritual-casting-any";
      classSpellList: ClassId;
    }
  | {
      /**
       * A bonus spell slot whose level scales with character level, restricted
       * to a narrow pool of spells, and recovered on a Short OR Long Rest.
       *
       * A heritage feat's bonus spellcasting: one extra slot, its level
       * = half your character level rounded up (max 5), usable ONLY to cast a
       * spell you have prepared because of a heritage feat, regained on a
       * Short/Long Rest. Distinct from {@link Grant} `free-cast-spell` (which is
       * a slotless cast of one NAMED spell at its base level) — this is a real
       * upcast-capable slot shared across a whole scoped pool, so it surfaces as
       * a cast-option row at every prepared scoped spell at the resolved level.
       *
       * Declares only FACTS; the consumer resolves the live numbers:
       *  - `levelFormula` → a {@link ScopedSlotLevelFormula}; `resolveScopedSlotLevel`
       *    turns it + the character's total level into the slot level.
       *  - `scope` → which prepared spells the slot can cast; the cast-option
       *    consumer (`scopedSlotSourcesForSpell`) resolves the eligible spell set.
       *  - `recovery` → `"short-or-long"` (regained on either rest) etc.; the
       *    smart-tracker creates a 1-use tracker on the source feature with the
       *    matching recovery cadence so expend/regain is tracked + override-able.
       *
       * Merge: collected as a list (one entry per granting source).
       */
      type: "scoped-extra-spell-slot";
      levelFormula: ScopedSlotLevelFormula;
      scope: ScopedSlotSpellScope;
      recovery: "short-or-long" | "short" | "long";
    }

  // ── Casting modifiers (sum per scope) ────────────────────────────────────
  | {
      /**
       * Phase C — Bumps the spell save DC of the named class's spells (or
       * "all" if granted globally). Used by Draconic Sorcerer's Elemental
       * Affinity, Bladesinging's Song of Defense, etc.
       */
      type: "spell-save-dc-bonus";
      amount: number;
      scope: "all" | ClassId;
    }
  | {
      type: "spell-attack-bonus";
      amount: number;
      scope: "all" | ClassId;
    }

  // ── Saving-throw bonus (applies to ALL saves) ────────────────────────────
  | {
      /**
       * Adds a bonus to saving throws. Two value modes:
       *   - ability-based: set `ability` → the consumer adds that ability's
       *     modifier (clamped up to `min`, default 0). Paladin's Aura of
       *     Protection: `{ ability: "CHA", min: 1 }` (+CHA mod, minimum +1).
       *   - flat: set `amount` → a constant numeric bonus.
       *
       * SCOPE: by default the bonus rides EVERY saving throw. Set the optional
       * `appliesToSave` to restrict it to ONE ability's saves only (Circle of
       * the Moon "Increased Toughness" → +WIS modifier to CONSTITUTION saves
       * only: `{ ability: "WIS", appliesToSave: "CON", min: 0 }`). Scoped grants
       * route to a separate `saveBonusByAbility` aggregate so they never leak
       * onto unrelated saves; unscoped grants keep their old all-saves routing
       * (`saveBonusAbilities` / `saveBonusFlat`) for back-compat.
       *
       * The evaluator can't resolve an ability modifier (it has no ability
       * scores), so it records the intent and the consumer (`resolveSaveBonus`
       * in `lib/compute.ts`) resolves it against the character's scores at
       * render, per the requested save.
       */
      type: "save-bonus";
      ability?: AbilityCode;
      appliesToSave?: AbilityCode;
      min?: number;
      amount?: number;
    }

  // ── Concentration-save bonus (CON saves to MAINTAIN Concentration only) ──
  | {
      /**
       * Adds a bonus to the **Constitution saving throw made to maintain
       * Concentration** — and ONLY that save, never every CON save. Bladesinger's
       * Bladesong "Focus" benefit: "When you make a Constitution saving throw to
       * maintain Concentration, you can add your Intelligence modifier to the
       * total." Distinct from `save-bonus` (which rides EVERY save) so it can't
       * leak into unrelated CON saves (poison, Disintegrate, …).
       *
       * Two value modes mirror `save-bonus`:
       *   - ability-based: set `ability` → the consumer adds that ability's
       *     modifier (clamped up to `min`, default 0). Bladesong Focus:
       *     `{ ability: "INT", min: 0 }` (+INT mod to the Concentration save).
       *   - flat: set `amount` → a constant numeric bonus (War Caster's
       *     Advantage is a roll modifier, not this; reserved for any future
       *     flat-bonus source).
       * The evaluator can't resolve an ability modifier (it has no ability
       * scores), so it records the intent; the consumer
       * (`resolveConcentrationSaveBonus` in `lib/compute.ts`) resolves it against
       * the character's scores at render. Typically wrapped in a `while-active`
       * block (Bladesong) so the bonus only applies while the feature is toggled
       * on. Merge: SUM (an ability entry contributes `max(mod, min)`; flat entries
       * add their `amount`).
       */
      type: "concentration-save-bonus";
      ability?: AbilityCode;
      min?: number;
      amount?: number;
    }

  // ── Ability-check bonus (scoped to a skill or an ability's checks) ────────
  | {
      /**
       * Adds a bonus to ABILITY CHECKS within a scope. Two value modes mirror
       * `save-bonus`:
       *   - ability-modifier: `value: "modifier"` (the default) → the consumer
       *     adds `ability`'s modifier, clamped up to `min` (default 0). Fey
       *     Wanderer's Otherworldly Glamour: every Charisma check gains +WIS mod
       *     (minimum +1) → `{ appliesTo: "CHA-checks", ability: "WIS",
       *     value: "modifier", min: 1 }`.
       *   - flat: `value: <number>` → a constant numeric bonus.
       *
       * `appliesTo` is the SCOPE the bonus rides:
       *   - a skill id (e.g. "stealth", "persuasion") → only that one skill;
       *   - "<ABILITY>-checks" (e.g. "CHA-checks") → every check using that
       *     ability;
       *   - "all-checks" → every ability check.
       * The evaluator can't resolve an ability modifier (it has no ability
       * scores), so it records the intent; the Skills consumer resolves it per
       * skill against the character's scores at render — see
       * `resolveAbilityCheckBonus` in `lib/compute.ts`. Additive with any other
       * matching entry; skipped entirely when the player set a manual override
       * on that skill (override-first).
       */
      type: "ability-check-bonus";
      appliesTo: string;
      ability?: AbilityCode;
      value?: "modifier" | number;
      min?: number;
    }
  | {
      /**
       * Adds a bonus to Initiative. `ability` → add that ability's modifier
       * (Gloom Stalker's Dread Ambusher: WIS); `amount` → a flat bonus. The
       * consumer resolves the ability modifier against the character's scores.
       * (Alert's "+Proficiency Bonus to Initiative" stays its own special-case
       * in `computeInitiative` for now — not wired here, so no double-count.)
       */
      type: "initiative-bonus";
      ability?: AbilityCode;
      amount?: number;
    }
  | {
      /**
       * A self-contained extra-damage rider on weapon attacks (Paladin
       * Radiant Strikes: +1d8 Radiant on a Melee weapon hit; Cleric Blessed
       * Strikes Divine Strike, etc.). The combat attack rows surface it as an
       * extra damage chip. `appliesTo` narrows which weapons it rides:
       * "melee-weapon" (Melee weapons + Unarmed) or "weapon" (any). Distinct
       * from spell damage (`spell.damage`) and weapon base damage.
       *
       * Dynamic dice count: most riders are fixed (`dice: "1d8"`). When the
       * extra-dice count scales with character level (Berserker Frenzy: a
       * number of d6s equal to the Rage Damage bonus — 2 at L1, 3 at L9, 4 at
       * L16), declare `diceByLevel` as a level-keyed map of dice strings. The
       * evaluator carries it through unresolved (it has no level); the
       * consumer (smart-tracker attack rows) resolves the highest threshold
       * ≤ the character's level. `dice` remains required as the L1 / fallback
       * value so fixed riders and any consumer that ignores `diceByLevel`
       * keep working unchanged.
       *
       * `damageType` is a concrete `DamageType` for fixed-element riders
       * (Radiant Strikes → "radiant"). The sentinel `"same-as-weapon"` marks a
       * rider whose extra die takes the WEAPON's OWN damage type — 2024 Hunter
       * Colossus Slayer ("the weapon deals an extra 1d8 damage", typeless = the
       * weapon's type). The attack-row consumer resolves the sentinel to the
       * concrete weapon damage type at render, so the UI always receives a real
       * type; any non-weapon consumer treats it as the literal string.
       *
       * `addAbilityMod` (optional) folds an ability MODIFIER into the surfaced
       * damage formula — Psi Warrior's Psionic Strike deals the die PLUS the INT
       * modifier (`1d6` → `1d6+3`). The consumer (smart-tracker attack rows)
       * appends the signed modifier to the resolved die (`+0` is omitted).
       *
       * `resourceCost` (optional) links each use to a tracker the player spends
       * (Psionic Energy Dice → the Psionic Power tracker). Carried through to the
       * attack row as `resourceTrackerId`; the engine never auto-spends it
       * (override-first — the combat UI debits it on use).
       *
       * `amount: "PB"` (the existing PB sentinel) declares a FLAT Proficiency-Bonus
       * extra-damage rider rather than a die — a species revelation's "extra
       * damage equal to your Proficiency Bonus, once on each of your turns". When
       * set, `dice` is omitted (the consumer surfaces a flat `+N` resolved from PB at
       * render). `appliesTo: "attack-or-spell"` widens the scope beyond weapons: the
       * 2024 wording is "when you deal damage to it with an attack OR a spell", so the
       * rider is NOT folded into one weapon row — it surfaces as a once-per-turn
       * self-side reminder (the player adds +PB to whichever attack/spell connects;
       * the app rolls nothing — golden rule 21). A weapon-scoped rider keeps `dice`.
       *
       * `vsMarkedTarget` (optional) marks a "per-hit vs a SPECIFIC creature" rider —
       * Hunter's Mark's +1d6 Force / Hex's +1d6 Necrotic apply only when you hit the
       * MARKED / CURSED target, not every attack. Because the app models no enemies
       * (identity: a companion sheet, not a battle grid), it CANNOT know which attack
       * lands on that creature, so the rider surfaces as a DISPLAY-ONLY chip LABELED
       * "vs marked target" / "vs cursed target" — the player applies it only on the
       * right hit (never auto-summed into the base damage total, like every
       * extra-damage rider). The token (`"marked"` / `"cursed"`, ids not display
       * strings — golden rule 7) drives the localized label at the render edge and is
       * the ONLY marked-target machinery — it reuses the existing `while-active`
       * (auto-light on cast, retract on concentration drop) + `damage-rider` + chip
       * machinery wholesale. The per-target tracking / move-the-mark / Hex's ability-
       * check Disadvantage stay narrative (no modeled enemy). Absent → an
       * always-applies rider (Radiant Strikes, Divine Favor).
       */
      type: "damage-rider";
      dice?: string;
      diceByLevel?: Readonly<Record<number, string>>;
      amount?: "PB";
      vsMarkedTarget?: "marked" | "cursed";
      damageType: DamageType | "same-as-weapon";
      /**
       * Which attacks the rider rides:
       *   - `"melee-weapon"` — any Melee weapon OR an Unarmed Strike (skips Ranged).
       *   - `"weapon"` — any WEAPON attack (melee or ranged); not an Unarmed Strike.
       *   - `"one-handed-melee"` — a Melee weapon held in ONE hand: skips Ranged AND
       *     Two-Handed-property weapons, and never an Unarmed Strike (Dueling: "a
       *     Melee weapon in one hand and no other weapons"). A Versatile weapon
       *     qualifies via its one-handed grip — the rider rides the row's primary
       *     (one-handed) damage, not its two-handed `versatileDamage` stance. The
       *     "no other weapons" (dual-wield) clause is informational: the engine
       *     can't know the live wielded set (a carried backup ≠ dual-wielding), so
       *     it gates only the mechanically determinable grip — the rest is override-
       *     first, matching how every holding-state condition is modeled.
       *   - `"attack-or-spell"` — never a per-attack chip (surfaced separately).
       */
      appliesTo: "melee-weapon" | "weapon" | "one-handed-melee" | "attack-or-spell";
      oncePerTurn?: boolean;
      addAbilityMod?: AbilityCode;
      resourceCost?: { trackerId: string };
    }
  | {
      /**
       * A static bonus added to ONE damage roll of a spell whose damage matches a
       * set of types — the SPELL counterpart of `damage-rider` (which is
       * weapon-only). Draconic Sorcery Elemental Affinity (L6): when you cast a
       * spell that deals your chosen draconic damage type, add your Charisma
       * modifier to one damage roll of that spell.
       *
       * `damageTypes` is the set of triggering damage types; a spell qualifies
       * when its damage includes ANY of them. The empty array is a sentinel for
       * "any spell that deals damage" (a blanket bonus). For a player-chosen type
       * (Elemental Affinity), the chosen type is wired via a `choice-grant-bundle`
       * option carrying a single-element `damageTypes` — so only the picked type
       * lights up.
       *
       * The bonus value is either an ability modifier (`value: "modifier"` + the
       * `ability` to read, floored at `min`) or a flat number (`value: <number>`).
       * The evaluator can't resolve an ability modifier (no scores), so it records
       * the intent; the consumer (`resolveSpellDamageBonus` in `lib/compute.ts`)
       * resolves it against the character's scores per spell at render — exactly
       * like `ability-check-bonus`. `scope` narrows which casting class's spells
       * it rides ("all" or a `ClassId`), mirroring `CastingModifierEntry`.
       * Additive with any other matching entry; override-first (the consumer is
       * skipped entirely when the player set a manual per-spell damage override).
       *
       * `cantripOnly` restricts the bonus to CANTRIPS (spell level 0) — the SPELL
       * counterpart of `cantrip-damage-bonus`, but keyed on "every cantrip of this
       * class" rather than one named cantrip. Cleric Potent Spellcasting ("add your
       * Wisdom modifier to the damage you deal with ANY Cleric cantrip") sets
       * `{ damageTypes: [], cantripOnly: true, ability: "WIS", scope: "cleric" }`,
       * so any damaging Cleric cantrip lights up while a levelled spell is untouched.
       * Omit (default `false`) for the usual "any qualifying spell" bonuses
       * (Elemental Affinity, Radiant Soul).
       *
       * `oncePerTurn` is informational — the SRD wording is "add … to ONE damage
       * roll" (Elemental Affinity) / "once per turn" (Radiant Soul). The engine
       * rolls no dice, so it surfaces the limiter for the UI but never enforces a
       * per-turn counter. Omit (default `false`) when the bonus has no per-turn cap.
       */
      type: "spell-damage-bonus";
      damageTypes: ReadonlyArray<DamageType>;
      ability?: AbilityCode;
      value?: "modifier" | number;
      min?: number;
      scope?: "all" | ClassId;
      cantripOnly?: boolean;
      oncePerTurn?: boolean;
      /** Restrict to spells of these SCHOOLS (Evoker Empowered Evocation). */
      schools?: ReadonlyArray<string>;
    }
  | {
      /**
       * A bonus added to the HIT POINTS a HEALING SPELL restores — the healing
       * counterpart of `spell-damage-bonus`. Cleric Disciple of Life: "Whenever
       * you cast a spell of level 1 or higher that restores Hit Points to a
       * creature, that creature regains additional Hit Points equal to 2 + the
       * spell's level." The engine rolls no dice; the consumer (`resolveHealBonus`
       * in `lib/compute.ts`) appends the resolved flat amount to the spell's heal
       * verdict at render — exactly like `spell-damage-bonus` does for damage.
       *
       * `amount` is the flat base (Disciple of Life: 2). `perSpellLevel` adds the
       * cast slot level on top (Disciple of Life: "+ the spell's level").
       * `minSpellLevel` gates it (Disciple of Life: 1, so 0-level cantrips don't
       * qualify; default 0 = all). `scope` restricts to one class's spell list
       * (Disciple of Life: "cleric"); "all" = any healing spell. Additive with any
       * other matching entry; override-first (spells carry no per-cast heal
       * override today, so nothing to skip).
       */
      type: "heal-bonus";
      amount: number;
      perSpellLevel?: boolean;
      minSpellLevel?: number;
      scope?: "all" | ClassId;
    }
  | {
      /**
       * An ALTERNATE damage type a damaging spell may deal — the player's choice
       * each cast (the type-SWAP counterpart of `spell-damage-bonus`, which adds
       * a number). Great Old One Warlock Psychic Spells: "When you cast a Warlock
       * spell that deals damage, you can change its damage type to Psychic." The
       * engine rolls no dice and never auto-swaps; the consumer
       * (`resolveSpellDamageTypeOverrides` in `lib/compute.ts`) returns the
       * in-scope alternate types and the smart-tracker folds them into the
       * spell's damage-type CHOICE chip — reusing the existing multi/choice
       * rendering, so the player picks the original type or the override per cast.
       *
       * `toType` is the offered type (Psychic). `scope` restricts it to one
       * casting class's spell list (Psychic Spells: "warlock"); "all" = any
       * damaging spell. Override-first; additive with any other override (the
       * choice chip lists every offered alternate alongside the spell's own type).
       */
      type: "spell-damage-type-override";
      toType: DamageType;
      scope?: "all" | ClassId;
    }
  | {
      /**
       * An ALTERNATE damage type the character's UNARMED STRIKE may deal at the
       * player's choice each hit — the unarmed-attack counterpart of
       * `spell-damage-type-override`. Monk Empowered Strikes (L6): "Whenever you
       * deal damage with your Unarmed Strike, it can deal Force damage or its
       * normal damage type." The smart-tracker folds `toType` into the Unarmed
       * Strike row's damage-type CHOICE chip (reusing the multi/choice rendering),
       * so the row reads e.g. "d8+4 Bldg/Force". The engine never auto-swaps; an
       * already-matching type dedupes. Override-first; no dice rolled.
       */
      type: "unarmed-strike-damage-type-option";
      toType: DamageType;
    }
  | {
      /**
       * Lets the caster WAIVE spell components for a class of spells — Great Old
       * One Warlock Psychic Spells: "When you cast a Warlock Enchantment or
       * Illusion spell, you can do so without Verbal or Somatic components." The
       * smart-tracker marks the waived components on the spell's verdict
       * (`componentsWaived`) so the UI can strike them — the player CAN cast
       * without them (e.g. while Silenced/restrained). Informational; engine
       * never auto-casts.
       *
       * `schools` narrows which spell schools qualify (omit/[] = any); `waive`
       * lists the components removed ("v"/"s"/"m"); `scope` restricts to one
       * casting class's spells ("warlock") or "all".
       */
      type: "component-waiver";
      schools?: ReadonlyArray<string>;
      waive: ReadonlyArray<"v" | "s" | "m">;
      scope?: "all" | ClassId;
    }
  | {
      /**
       * A static bonus added to the damage rolls of ONE specific **cantrip**,
       * targeted by SRD spell id — the SPELL-ID counterpart of
       * `spell-damage-bonus` (which is damage-type keyed). Warlock's Agonizing
       * Blast invocation: "Choose one of your known Warlock cantrips that deals
       * damage. You can add your Charisma modifier to that spell's damage rolls."
       * The invocation is REPEATABLE — each copy targets a DIFFERENT eligible
       * cantrip — so a character may carry several `cantrip-damage-bonus` grants,
       * one per chosen cantrip.
       *
       * `spellId` is the chosen cantrip's SRD id. When the player has not yet
       * pinned a choice (the picker writes it back to
       * `session.grantBundleChoices[choiceKey]`), `choiceKey` lets the evaluator
       * read the selection; `defaultSpellId` is the fact's fallback target (the
       * canonical pick — Eldritch Blast for Agonizing Blast) so the bonus
       * auto-computes out of the box and the choice merely RE-targets it.
       *
       * The bonus value is either an ability modifier (`value: "modifier"` + the
       * `ability` to read, floored at `min`) or a flat number (`value: <number>`).
       * The evaluator can't resolve an ability modifier (no scores), so it records
       * the intent; the consumer (`resolveCantripDamageBonus` in `lib/compute.ts`)
       * resolves it against the character's scores per cantrip at render — exactly
       * like `spell-damage-bonus`. Additive with any other entry that targets the
       * same cantrip; override-first (the consumer is skipped entirely when the
       * player set a manual per-spell damage override).
       */
      type: "cantrip-damage-bonus";
      /** Explicit chosen cantrip id; omit to resolve from `choiceKey`/`defaultSpellId`. */
      spellId?: string;
      /** `session.grantBundleChoices` key the picker writes the chosen cantrip id to. */
      choiceKey?: string;
      /** Fallback cantrip id when neither `spellId` nor a `choiceKey` selection is set. */
      defaultSpellId?: string;
      ability?: AbilityCode;
      value?: "modifier" | number;
      min?: number;
    }
  | {
      /**
       * A **cantrip-effect rider** that adds a non-damage on-hit/effect clause to
       * ONE specific cantrip, targeted by SRD spell id — a sibling of
       * `cantrip-damage-bonus` (which adds to the damage roll) for effects that
       * aren't numeric damage. The first variant is FORCED MOVEMENT: Warlock's
       * Repelling Blast invocation — "Choose one of your known Warlock cantrips
       * that requires an attack roll. When you hit a Large or smaller creature
       * with that cantrip, you can push the creature up to 10 feet straight away
       * from you." The invocation is REPEATABLE — each copy targets a DIFFERENT
       * eligible cantrip — so a character may carry several `cantrip-effect-rider`
       * grants, one per chosen cantrip.
       *
       * `effect` discriminates the rider clause; `"forced-movement"` is the only
       * variant today and carries `direction` (always `"push"` for Repelling
       * Blast), `distanceFt` (10), and `maxTargetSize` (the largest size the
       * rider can shove — `"Large"`, so Huge+ creatures are immune).
       *
       * `spellId` is the chosen cantrip's SRD id. When the player has not yet
       * pinned a choice (the picker writes it back to
       * `session.grantBundleChoices[choiceKey]`), `choiceKey` lets the evaluator
       * read the selection; `defaultSpellId` is the fact's fallback target (the
       * canonical pick — Eldritch Blast for Repelling Blast) so the rider
       * auto-applies out of the box and the choice merely RE-targets it
       * (override-first — the picker re-points the same rider). The evaluator
       * collects each into `AggregatedGrants.cantripEffectRiders`; the consumer
       * (`resolveCantripForcedMovement` in `lib/compute.ts`) reports the rider
       * that targets the cantrip being rendered. Multiple sources targeting the
       * same cantrip stack as separate riders (the consumer picks the farthest
       * push — they don't sum; you choose one shove).
       */
      type: "cantrip-effect-rider";
      effect: "forced-movement";
      /** Explicit chosen cantrip id; omit to resolve from `choiceKey`/`defaultSpellId`. */
      spellId?: string;
      /** `session.grantBundleChoices` key the picker writes the chosen cantrip id to. */
      choiceKey?: string;
      /** Fallback cantrip id when neither `spellId` nor a `choiceKey` selection is set. */
      defaultSpellId?: string;
      /** Forced-movement direction relative to the caster. Repelling Blast pushes. */
      direction: "push" | "pull";
      /** Maximum push/pull distance in feet (Repelling Blast: 10). */
      distanceFt: number;
      /** Largest creature size the rider can move (Repelling Blast: "Large"). */
      maxTargetSize: CreatureSize;
    }
  | {
      /**
       * A **range bonus** targeted at ONE specific cantrip by SRD id, scaling by
       * the granting class's level — a numeric sibling of `cantrip-effect-rider`
       * (an on-cast effect that isn't damage). Warlock's Eldritch Spear
       * invocation: "Choose one of your known Warlock cantrips that deals damage
       * and has a range of 10+ feet. When you cast that spell, its range
       * increases by a number of feet equal to 30 times your Warlock level."
       * The invocation is REPEATABLE — each copy targets a DIFFERENT eligible
       * cantrip — so a character may carry several `cantrip-range-bonus` grants,
       * one per chosen cantrip.
       *
       * `spellId` is the chosen cantrip's SRD id. When the player has not yet
       * pinned a choice (the picker writes it back to
       * `session.grantBundleChoices[choiceKey]`), `choiceKey` lets the evaluator
       * read the selection; `defaultSpellId` is the fact's fallback target (the
       * canonical pick — Eldritch Blast for Eldritch Spear) so the bonus
       * auto-applies out of the box and the choice merely RE-targets it
       * (override-first — the picker re-points the same bonus).
       *
       * The added feet = `bonusPerLevel × <granting class's level>`. The
       * evaluator can't resolve the class level (no character context), so it
       * records `bonusPerLevel` + the `scalesWith` class id; the consumer
       * (`resolveCantripRangeBonus` in `lib/compute.ts`) multiplies by the
       * supplied level per cantrip at render — exactly like Eldritch Smite's
       * per-slot-level scaling reads the warlock's pact-slot level. Additive with
       * any other entry that targets the same cantrip.
       */
      type: "cantrip-range-bonus";
      /** Explicit chosen cantrip id; omit to resolve from `choiceKey`/`defaultSpellId`. */
      spellId?: string;
      /** `session.grantBundleChoices` key the picker writes the chosen cantrip id to. */
      choiceKey?: string;
      /** Fallback cantrip id when neither `spellId` nor a `choiceKey` selection is set. */
      defaultSpellId?: string;
      /** Feet of range added per level of `scalesWith` (Eldritch Spear: 30). */
      bonusPerLevel: number;
      /** Class whose level scales the bonus (Eldritch Spear: "warlock"). */
      scalesWith: ClassId;
    }
  | {
      /**
       * A **weapon-attack-cantrip rider** — a cantrip the character KNOWS whose
       * entire effect is "make ONE attack with a held weapon, using your
       * spellcasting ability for the attack & damage rolls, with a Radiant /
       * weapon damage-type choice + level-scaled extra Radiant" (2024 True
       * Strike). Most casters get True Strike via their normal cantrip pool, but
       * some features grant a known cantrip directly (Magic Initiate, subclass
       * bonus cantrips, High Elf's Cantrip trait); when that cantrip is a
       * weapon-attack cantrip, the granting source declares this rider so the
       * combat-action consumer treats the attack as a spellcasting-ability
       * weapon strike with the scaled rider — NOT a stale melee spell attack.
       *
       * `spellId` is the cantrip's SRD id ("true-strike"); the rider's mechanic
       * facts mirror {@link import("@/data/types").WeaponAttackCantripData}. The
       * evaluator collects each into `AggregatedGrants.weaponAttackCantrips`,
       * deduped by `spellId` (first source wins). The consumer
       * (`resolveWeaponAttackCantrip` in `lib/compute.ts`, surfaced by the
       * smart-tracker action summary) resolves the scaled extra damage, attack
       * ability, and damage-type options at render — override-first. No RNG.
       */
      type: "weapon-attack-cantrip";
      spellId: string;
      useSpellcastingAbility: boolean;
      damageTypeChoice: DamageType;
      extraDamageByLevel: Readonly<Record<number, string>>;
      extraDamageType: DamageType;
    }
  | {
      /**
       * A **manipulation of how a weapon's own damage DICE are rolled or what
       * its base damage is** — distinct from `damage-rider` (which adds a
       * SEPARATE extra die/flat term on top). The four 2024 weapon-mastery /
       * fighting-style / origin feats that have no other primitive all reduce to
       * one of four `mode`s:
       *
       *  - `"floor"` — Great Weapon Fighting: "treat any 1 or 2 on a damage die
       *    as a 3". `floorBelow` is the highest die face replaced (2) and
       *    `floorTo` the value it becomes (3). Scoped via `appliesTo:
       *    "two-handed-melee"` (the weapon must be Melee + held in two hands,
       *    i.e. have the Two-Handed or Versatile property). NO dice are rolled —
       *    the consumer only annotates the weapon row so the player applies the
       *    floor when they roll externally (the engine shows formulas, never RNG).
       *
       *  - `"reroll-keep-higher"` — Savage Attacker: "roll the weapon's damage
       *    dice twice and use either roll", once per turn. `oncePerTurn` is true.
       *    Scoped `appliesTo: "weapon"` (any weapon attack). Annotation only.
       *
       *  - `"offhand-ability-mod"` — Two-Weapon Fighting: add the wielder's
       *    ability modifier to the damage of the off-hand (Light-weapon extra)
       *    attack, which RAW omits by default. Scoped `appliesTo: "light-melee"`.
       *    The dual-wield consumer adds the modifier back to the off-hand row's
       *    damage formula (replacing the hard-coded srdId check that previously
       *    special-cased this one feat).
       *
       *  - `"unarmed-strike"` — Unarmed Fighting: the Unarmed Strike deals
       *    Bludgeoning equal to `baseDie` (1d6) + `abilityMod` (STR), upgraded to
       *    `unburdenedDie` (1d8) when not holding any weapon or shield; plus a
       *    start-of-turn `grappleDie` (1d4) to one creature Grappled by you.
       *    `damageType` is the Unarmed Strike's type (bludgeoning). The consumer
       *    emits / upgrades an Unarmed Strike attack row from these facts.
       *
       * Merge: collected as a list (`damageDieModifiers`); the consumer reads it
       * and applies the relevant `mode` to the matching weapon rows. Override-
       * first: every value is informational — a player who pins a per-weapon
       * `damageOverride` keeps full control, and the engine never rolls dice.
       */
      type: "damage-die-modifier";
      mode: "floor" | "reroll-keep-higher" | "offhand-ability-mod" | "unarmed-strike";
      /** Which attacks the modifier rides (mode determines the sensible scope). */
      appliesTo: "weapon" | "two-handed-melee" | "light-melee" | "unarmed";
      /** "floor": the highest die face replaced (2 for Great Weapon Fighting). */
      floorBelow?: number;
      /** "floor": the value a floored face becomes (3 for Great Weapon Fighting). */
      floorTo?: number;
      /** "reroll-keep-higher": once-per-turn limiter (Savage Attacker). */
      oncePerTurn?: boolean;
      /** "unarmed-strike": base damage die when holding a weapon/shield (1d6). */
      baseDie?: string;
      /** "unarmed-strike": upgraded die when unburdened — no weapon/shield (1d8). */
      unburdenedDie?: string;
      /** "unarmed-strike": die dealt to a Grappled creature each turn (1d4). */
      grappleDie?: string;
      /** "unarmed-strike" / "offhand-ability-mod": the ability modifier added. */
      abilityMod?: AbilityCode;
      /** "unarmed-strike": the Unarmed Strike's damage type (bludgeoning). */
      damageType?: DamageType;
    }

  // ── Conditional advantage / disadvantage (set-union, soft-typed) ────────
  | {
      /**
       * Phase C — Permanent advantage on a typed roll. `rollType` narrows to
       * save/check/attack/initiative; `vs` is a free-text descriptor (e.g.
       * "saves vs poison", "checks to grapple", or "" for a blanket clause such
       * as the Assassin's "Advantage on Initiative rolls"). Renderer surfaces
       * these as chips on the Abilities/Combat page near the relevant block.
       *
       * `rollType: "initiative"` is a dedicated consumer hook: Initiative is a
       * DEX check that the engine computes separately (`computeInitiative`), so
       * the advantage half is read off the aggregate by `hasInitiativeAdvantage`
       * rather than rendered only as a chip.
       *
       * `round1` (FRONTIER-S3) marks a ROUND-1-ONLY clause: it applies only during
       * combat round 1 (before a creature has acted) — Assassin Assassinate's
       * "Advantage on attack rolls against any creature that hasn't taken a turn".
       * The turn/round engine surfaces it only when `combatStore.round === 1`, then
       * auto-clears it after round 1. Omitted = a permanent clause (the default).
       */
      type: "advantage-on";
      rollType: "save" | "check" | "attack" | "initiative";
      vs: string;
      round1?: boolean;
      description?: BiText;
    }
  | {
      type: "disadvantage-on";
      rollType: "save" | "check" | "attack" | "initiative";
      vs: string;
      description?: BiText;
    }
  | {
      /**
       * A ROUND-1-only, save-gated damage DOUBLER note (Assassin Death Strike, L17:
       * "When you hit with your Sneak Attack on the first round of a combat, the
       * target must succeed on a Constitution saving throw (DC 8 + Dex mod + PB) or
       * the attack's damage is doubled"). DISPLAY-ONLY — the app models no enemy and
       * never rolls, so it NEVER auto-doubles anything; it surfaces a round-1
       * reminder with the resolved DC. `saveAbility` is the TARGET's save, `saveDcAbility`
       * the character ability that governs the DC (routed through the ONE
       * `featureSaveDc` formula). Collected into `round1DamageDoubles`; the consumer
       * resolves the DC and the UI shows it only while `combatStore.round === 1`
       * (the SAME round-1 gate Assassinate's `advantage-on { round1 }` uses).
       */
      type: "round1-damage-double";
      saveAbility: AbilityCode;
      saveDcAbility: AbilityCode;
    }
  | {
      /**
       * A roll FLOOR: treat a d20 roll below `floor` as `floor`, on rolls of
       * `rollType`, gated by `appliesTo`. Rogue Reliable Talent (L7): "Whenever
       * you make an ability check that lets you add your Proficiency Bonus, you
       * can treat a d20 roll of 9 or lower as a 10" → `{ rollType: "check", floor:
       * 10, appliesTo: "proficient" }`. The engine rolls no dice — the consumer
       * surfaces it as a passive note; `description` is the bilingual blurb.
       */
      type: "roll-floor";
      rollType: "check" | "save" | "attack";
      floor: number;
      appliesTo: "proficient" | "all";
      description?: BiText;
    }
  | {
      /**
       * A SELF-side downside marker: while this grant is in effect, attack rolls
       * AGAINST the character have Advantage. Barbarian Reckless Attack (L2): the
       * second RAW half — "attack rolls against you have Advantage until your next
       * turn" — the price of the offensive STR-attack Advantage. This is NOT enemy
       * modeling (the engine has no attacked-against model and tracks no targets);
       * it is purely a downside REMINDER the player sees on their own sheet. Wrap
       * it in the SAME `while-active` toggle as the offensive half so declaring
       * Reckless lights BOTH the buff and this downside. `description` is the
       * bilingual blurb the rail renders (framed as a Disadv.); the engine rolls
       * no dice and computes nothing from it.
       */
      type: "incoming-attack-advantage";
      description?: BiText;
    }
  | {
      /**
       * The MIRROR of `incoming-attack-advantage`: while in effect, attack rolls
       * AGAINST the character have DISADVANTAGE — a defensive BENEFIT (Blur: "any
       * creature has Disadvantage on attack rolls against you"; Warding Bond's
       * defensive posture family could ride it too). Like its mirror, this is NOT
       * enemy modeling (the engine has no attacked-against model and rolls no
       * dice) — it is a self-side REMINDER the player sees on their own sheet,
       * framed as an ADVANTAGE (your defenses improve). Wrap it in a `while-active`
       * toggle (Blur, a Concentration spell) so it lights/clears with the buff.
       * `description` is the bilingual blurb the rail renders; collected into
       * `incomingAttackDisadvantages`.
       */
      type: "incoming-attack-disadvantage";
      description?: BiText;
    }
  | {
      /**
       * A SELF-side DEFENSIVE reminder LINE — a bilingual prose note rendered in
       * the rail's Defenses section (Warding Bond: "Resistance to all damage; the
       * bonded creature takes the same damage you take"). For defensive facts that
       * carry no clean numeric/typed primitive (a resistance-to-ALL + a
       * shared-damage clause), where the mechanically-valued legs are modeled
       * separately (Warding Bond's +1 AC + +1 saves) and this captures the residual
       * RAW as an informational line — the engine subtracts nothing (golden rule
       * 21). Wrap it in a `while-active` toggle so it lights/clears with the buff;
       * `description` is the bilingual blurb; collected into `defenseNotes`.
       */
      type: "defense-note";
      description?: BiText;
    }

  // ── Activatable / conditional grants (L11) ───────────────────────────────
  | {
      /**
       * L11 — Activatable grants. The inner `grants` apply ONLY while the named
       * toggle is active in the session: Bladesinger's Bladesong, Sorcerer's
       * Innate Sorcery, Barbarian Rage, druid Wild-Shape forms, etc. A single
       * feature can mix always-on grants with a `while-active` block.
       *
       * `activeKey` is a stable toggle id (conventionally the source feature's
       * own id, or a `${featureId}:variant` for multi-toggle features); `label`
       * names the toggle for the UI. The evaluator recurses into `grants` only
       * when `activeKey` ∈ the active set passed to `evaluateGrants`, so an
       * inactive feature never over-reports its buff. When active, the inner
       * grants merge into the SAME aggregate fields as any other grant — so
       * resistances/senses/AC/advantages light up with zero new consumer code.
       *
       * Override-first: the toggle is always user-controllable; nothing forces
       * it on or off. Nested `while-active` grants are ignored (one level only).
       */
      type: "while-active";
      activeKey: string;
      label?: BiText;
      grants: ReadonlyArray<Grant>;
      /**
       * USE-APPLIES (2026-06-12) — optional duration/maintenance metadata for an
       * active state, so the combat turn loop can ENFORCE its lifetime instead of
       * leaving the player to remember it (owner doctrine: the app takes care of
       * everything, always allowing override). Two kinds, sourced verbatim from
       * `dnd2024.wikidot.com` per feature — Rage is just data carrying its rule,
       * never a special case in the engine:
       *
       *  - `"maintained"` — the state ends at the END OF YOUR TURN unless a
       *    maintaining event happened this round (Barbarian Rage: "lasts until the
       *    end of your next turn"; extend by making an attack roll vs an enemy,
       *    forcing a save, TAKING DAMAGE, or taking a Bonus Action to extend — up
       *    to `maxMinutes`). `maintainedBy` lists the in-combat events the turn loop
       *    already knows (`"attack"` = the Attack action / forcing a save consumed
       *    the action slot; `"damage-taken"` = an HP reduction recorded this round,
       *    auto-detected from the session HP setter; `"bonus-extend"` = the
       *    dedicated extend bonus action — the prompt's own `Keep`). At End Turn,
       *    a maintained state whose condition wasn't met surfaces a one-tap
       *    keep/end prompt on the turn meter (never a silent kill — a player may
       *    maintain off-app). `endsEarlyOn` (informational) names the conditions
       *    that drop it immediately (Heavy armor, Incapacitated).
       *
       *  - `"timed"` — a FIXED-timer state that simply lasts `minutes` with no
       *    per-turn maintenance (Sorcerer Innate Sorcery: "1 minute"; Bladesong:
       *    "1 minute"). Informational — the turn loop never auto-prompts these
       *    (the player ends them when the timer lapses); carried so the rail chip
       *    can show the duration.
       *
       * Omitted on a while-active grant whose state has no defined combat
       * lifetime (a permanent stance toggle).
       */
      duration?: WhileActiveDuration;
      /**
       * S1 opt-out for a TARGET-ONLY buff spell (Warding Bond: "You touch ANOTHER
       * creature… it gains +1 AC and saves" — the CASTER never benefits). By
       * default, casting a `while-active` buff spell auto-lights its chip (the S1
       * cast→toggle link, correct for SELF buffs: Shield of Faith, Blur, Mage
       * Armor). `autoActivateOnCast: false` suppresses that stamp — the action
       * resolver never derives `activatesKey` from this grant, so the cast-commit
       * seam lights nothing on the caster. The toggle stays MANUALLY light-able
       * from the rail (override-first) — that is how a WARDED creature's own sheet
       * turns the buff on. Omitted = `true` (auto-light, the self-buff default).
       */
      autoActivateOnCast?: boolean;
    }

  // ── Single-select variant chooser (L12 choice-grant-bundle) ──────────────
  | {
      /**
       * L12 — pick EXACTLY ONE of N named bundles; the selected bundle's grants
       * apply. Unlike `while-active` (independent multi-toggle), this is a
       * single-select variant chooser. The selection is play-time state
       * (`session.grantBundleChoices[bundleKey] = optionId`) and re-selectable
       * — Circle of the Land re-chooses its terrain each Long Rest.
       *
       * The selected option's grants merge into the aggregate like any grant
       * (a terrain's Nature's-Ward `damage-resistance` lights up immediately).
       * Spell grants inside an option carry `minLevel` and are level-gated by
       * the injection consumer, not the evaluator. Two features can share a
       * `bundleKey` (Circle Spells at L3 + Nature's Ward at L10) — one chooser,
       * both contribute per-option grants. Nested choosers are ignored.
       *
       * Override-first: the chooser is always user-controllable; default is
       * unselected (no option's grants apply until the player picks).
       */
      type: "choice-grant-bundle";
      bundleKey: string;
      label?: BiText;
      /**
       * When to offer the chooser UI:
       * - `"creation"` — chosen ONCE at character creation (Elven Lineage, Gnome
       *   Lineage). The activatable-bar / GrantBundleSelector in the sheet header
       *   NEVER shows creation bundles — only the Lore page + creation wizard do.
       * - `"rest"` (default) — re-selectable during play (Circle of the Land
       *   terrain, Elemental Affinity damage type). The header shows these.
       */
      choiceFrequency?: "creation" | "rest";
      options: ReadonlyArray<{
        id: string;
        label?: BiText;
        grants: ReadonlyArray<Grant>;
      }>;
    }

  // ── Granted action (ARCHITECTURE.md combat model) ─────────────────────────────────
  | {
      /**
       * An action a feat/feature/invocation grants that isn't a weapon or a
       * prepared spell — Shield as a Reaction, an at-will Eldritch Invocation,
       * Eldritch Cannon, etc. The Combat page surfaces it as a pure data row,
       * so adding such an action is a data edit (this grant), never combat-code.
       * `slot` is the economy slot it uses; `cost` (optional) is its CostSpec;
       * `trigger` describes a Reaction's condition.
       *
       * `saveAbility` (optional) is the ability a TARGET rolls against when the
       * action forces a saving throw (the maneuver "Trip Attack" → STR, etc.).
       * The concrete DC is character-derived, so the consumer computes it from
       * the originating feature (e.g. `maneuverSaveDc`); this grant only carries
       * the ability so the seam stays pure data, never combat-code.
       */
      type: "granted-action";
      /**
       * Stable catalogue segment for the action's localizable strings (R6+R3
       * SLICE 7c). When set, the grant's `name`/`description`/`trigger` are keyed
       * under `<sourceKey>.grants.<id>`; the codemod wrote that path from this id
       * (or, for the few legacy id-less actions, `slug(name.en)` — which equals
       * the id we now declare). Lets the engine derive the ref without reading any
       * display string (golden rule 7). Omitted only where the grant carries no
       * localizable name (none today).
       */
      id?: string;
      name?: BiText;
      slot: ActionType;
      description?: BiText;
      cost?: CostSpec;
      trigger?: BiText;
      saveAbility?: AbilityCode;
    }

  // ── Manifested weapon (a feature CREATES a usable weapon) ─────────────────
  | {
      /**
       * A weapon a feature *manifests* — a real attack option with its own
       * stat profile, NOT a physical item in `character.weapons` and NOT a
       * generic `granted-action`. Soulknife's **Psychic Blades** (Simple Melee,
       * 1d6 Psychic + ability mod, Finesse, Thrown 60/120, free Vex mastery,
       * plus a Bonus-Action second blade at a smaller die). Each grant becomes
       * one (or two — see `bonusAction`) attack rows on the Combat page whose
       * to-hit/damage the consumer (`resolveManifestedWeaponAttacks` →
       * `resolveActions`) computes from the character's scores, exactly like a
       * carried weapon.
       *
       * `category` / `weaponType` mirror the SRD weapon fields so the attack-row
       * builder treats the manifested weapon identically to a `SrdEquipmentData`
       * weapon (proficiency, finesse stat-pick, ranged/thrown range strings).
       *
       * `damageDie` is the on-hit die (`"1d6"`); the consumer appends the
       * resolved ability modifier. `damageType` is the fixed element.
       *
       * `properties` is the same loose string list a weapon row consumes
       * (`["Finesse", "Thrown (Range 60/120)"]`) — it drives the finesse
       * stat-pick and the range string.
       *
       * `mastery` (optional) names the Weapon Mastery property the manifested
       * weapon offers. `masteryIsFree`, when true, means the feature grants its
       * use *without* it counting against the character's Weapon Mastery picks
       * (Psychic Blades: "you can use this property, and it doesn't count against
       * the number of properties you can use") — so it always lights up, even on
       * a class with no Weapon Mastery feature or with its mastery slots full.
       *
       * `proficient` defaults to `true` — a manifested weapon is always wielded
       * with proficiency (it's a feature of the class). Set `false` only for the
       * rare manifested weapon a feature does NOT grant proficiency with.
       *
       * `bonusAction`, when set, declares the optional second attack the feature
       * allows on the same turn at a (usually smaller) `damageDie` — Psychic
       * Blades' second blade at 1d4. The consumer emits a second, Bonus-Action
       * attack row from it.
       *
       * Override-first: the consumer honours a per-manifested-weapon override in
       * `session.manifestedWeaponOverrides[id]` (attack bonus / damage string),
       * keyed by the row's stable id — so a player can pin custom numbers exactly
       * like a carried weapon's `attackBonusOverride` / `damageOverride`.
       */
      type: "manifested-weapon";
      /**
       * Stable slug for the manifested weapon's attack-row id
       * (`manifested-weapon-${id}`). Lets overrides + pin state key off a value
       * that survives a rename of the bilingual `name`.
       */
      id: string;
      name?: BiText;
      category: WeaponCategory;
      weaponType: WeaponType;
      damageDie: string;
      damageType: DamageType;
      properties: ReadonlyArray<string>;
      mastery?: WeaponMastery;
      masteryIsFree?: boolean;
      proficient?: boolean;
      bonusAction?: {
        name?: BiText;
        slot: ActionType;
        damageDie: string;
      };
    }

  // ── Form attack (a FORM-swapped natural weapon — Wild Shape / Arcane Armor) ─
  | {
      /**
       * A natural-weapon attack row a TRANSFORMATION form grants while it is
       * active (Druid Wild Shape beast bite/claw, Stars Druid Starry Form Archer
       * attack, Artificer Armorer's Thunder Pulse / Lightning Launcher). A
       * form ALREADY swaps AC via a `while-active` `ac-formula` grant (Circle of
       * the Moon AC = 13 + WIS — modeled, untouched); the GAP this fills is the
       * ATTACK row. Declare-the-least: it is the attack counterpart of the
       * AC-formula form grant, NOT a re-model of the form.
       *
       * MUST be declared INSIDE a `while-active` block — the evaluator collects
       * it into `formAttacks` ONLY when its wrapping toggle is active (it stamps
       * the row with the `activeKey`), so the row exists on the combat board
       * EXACTLY while the form is lit and retracts when toggled off. No new
       * session field: the active form is the existing `session.activeFeatures`
       * toggle (override-first — a player tap lights/clears it).
       *
       * The consumer (`resolveFormAttacks`) computes to-hit / damage from the
       * character's scores exactly like a carried / manifested weapon: attack
       * stat = `attackAbility` when set (Armorer's INT), else best-of STR/DEX
       * for Finesse / ranged DEX / else STR; to-hit = mod + PB (when proficient)
       * + exhaustion penalty; damage = `damageDie` + the attack mod.
       *
       * Override-first: the consumer honours a per-row override in
       * `session.manifestedWeaponOverrides[id]` (REUSING the same session weapon-
       * swap store the Soulknife manifested weapon uses — the precedent), keyed
       * by the row's stable id `form-attack-${id}`.
       */
      type: "form-attack";
      /**
       * Stable slug for the form attack's row id (`form-attack-${id}`). Lets
       * overrides + pin state key off a value that survives a `name` rename.
       */
      id: string;
      name?: BiText;
      category: WeaponCategory;
      weaponType: WeaponType;
      damageDie: string;
      /**
       * S12b — the form-attack die keyed by the threshold level at which it begins
       * to apply (Circle-of-Stars **Archer** attack row: `{ 3: "1d8", 10: "2d8" }`
       * — Twinkling Constellations bumps it at Druid 10). `resolveFormAttacks`
       * resolves the highest threshold ≤ the character's level via the shared
       * {@link import("@/lib/utils").pickDiceByLevel}; `damageDie` is the floor
       * below the first threshold. Omit for a flat-die form attack.
       */
      damageDieByLevel?: Readonly<Record<number, string>>;
      damageType: DamageType;
      properties: ReadonlyArray<string>;
      /**
       * Fixed attack/damage ability the form mandates (Armorer's Arcane Armor
       * uses INT for its weapons). Omitted → derive from STR/DEX like a weapon.
       */
      attackAbility?: AbilityCode;
      /** Whether the form attack is wielded with proficiency (default true). */
      proficient?: boolean;
      /**
       * A once-per-turn extra-damage rider the form's weapon deals on a hit
       * (Armorer Infiltrator's Lightning Launcher: "once on each of your turns
       * when you hit … +1d6 Lightning"). Surfaces as the SAME self-side
       * extra-damage chip a weapon `damage-rider` does — `resolveFormAttacks`
       * folds it into `summary.extraDamage` with `oncePerTurn: true`, sourced to
       * the form attack's own name (no modeled enemy; the player adds it on a hit,
       * golden rule 21). Omit for a form weapon with no rider.
       */
      oncePerTurnExtra?: { dice: string; damageType: DamageType };
      /**
       * Whether the form attack carries a localizable on-hit REMINDER (Guardian
       * Thunder Pulse's "target has Disadvantage on attacks vs others"; Dreadnaught
       * Force Demolisher's push/pull). The text itself lives in the SRD catalogue
       * under this grant's `<ref>.note` key (GR7 — no inline BiText); the evaluator
       * carries the ref iff `hasGrantField(ref, "note")`, mirroring how a
       * `granted-action` emits its catalogue `description`. The consumer routes it
       * to `summary.effect`. Self-side reminder only — no enemy is modeled.
       */
    }

  // ── Pact weapon (a CONJURED weapon entity — Pact of the Blade) ────────────
  | {
      /**
       * A **conjured pact weapon** (Warlock's *Pact of the Blade* invocation).
       * As a Bonus Action the Warlock conjures a Simple/Martial Melee weapon of
       * their choice (or bonds with a magic weapon they touch). Distinct from a
       * `manifested-weapon` (Soulknife Psychic Blades — a FIXED die/type/profile):
       * the pact weapon's actual form is a PLAYER CHOICE, so the grant declares
       * only the *rules of the bond*, not a fixed weapon:
       *
       *  - **Proficiency.** The bond grants proficiency with whatever weapon is
       *    conjured — so the consumer always treats it as proficient (and the
       *    evaluator also unions a `"Pact weapon"` token into `weaponProficiencies`
       *    for the Equipment page).
       *  - **Spellcasting ability for attack & damage.** "You can use your
       *    Charisma modifier for the attack and damage rolls" — `attackAbility`
       *    (CHA). The consumer uses it instead of STR/DEX; it also folds into
       *    `weaponAttackAbilities` so a CARRIED weapon the Warlock bonds with
       *    benefits identically (best-of, per RAW "you can use").
       *  - **Damage-type choice.** "You can cause the weapon to deal Necrotic,
       *    Psychic, or Radiant damage or its normal damage type" —
       *    `damageTypeChoices` lists the selectable elemental types; the player's
       *    pick (or the weapon's normal type) is resolved override-first from the
       *    session `pactWeaponConfig`.
       *  - **Spellcasting Focus.** `isFocus` marks that the bonded weapon counts
       *    as a Spellcasting Focus (a marker the focus consumer reads).
       *
       * The conjured-weapon attack row is emitted by `resolvePactWeaponAttacks`
       * (consumer). It defaults to a generic conjured blade (`defaultDamageDie` /
       * `defaultDamageType`) and is fully override-first via `pactWeaponConfig`
       * (player picks the weapon name, damage die, base type, and elemental type).
       *
       * `conjureSlot` is the action economy of conjuring (Bonus Action). Merge:
       * deduped by `sourceId` (a character has at most one pact-weapon bond).
       */
      type: "pact-weapon";
      /** Stable slug for the conjured attack-row id (`pact-weapon-${id}`). */
      id: string;
      name?: BiText;
      /** Ability used for attack + damage rolls (CHA for Pact of the Blade). */
      attackAbility: AbilityCode;
      /** Elemental damage types the player may switch the weapon to deal. */
      damageTypeChoices: ReadonlyArray<DamageType>;
      /** Whether the bonded weapon counts as a Spellcasting Focus. */
      isFocus: boolean;
      /** Action economy of conjuring the weapon (Bonus Action). */
      conjureSlot: ActionType;
      /** Default conjured-blade die when the player hasn't configured one. */
      defaultDamageDie: string;
      /** Default conjured-blade damage type (its "normal" type). */
      defaultDamageType: DamageType;
    }

  // ── Pact-weapon rider (Pact-of-the-Blade invocation riders) ──────────────
  | {
      /**
       * An extra-damage rider that fires ONLY on a hit with a Warlock's
       * conjured pact weapon (the `pact-weapon` primitive) — distinct from the
       * generic `damage-rider`, which rides EVERY weapon attack. Pact-of-the-
       * Blade invocations layer these onto the pact-weapon attack row alone:
       *
       *  - **Eldritch Smite** (L5): once per turn, spend a Pact Magic spell
       *    slot for an extra `1d8` Force, plus another `1d8` per level of the
       *    spell slot, and the target falls Prone if Huge or smaller.
       *  - **Lifedrinker** (L9): once per turn, an extra `1d6` Necrotic /
       *    Psychic / Radiant (player's choice), and you may expend a Hit Die to
       *    heal (roll + CON mod, minimum 1).
       *
       * Fields:
       *  - `dice` — the BASE extra-damage die (Eldritch Smite `1d8` per slot
       *    level; Lifedrinker `1d6` flat).
       *  - `damageType` — a fixed `DamageType`, or `damageTypeChoices` (the
       *    set the player picks from, e.g. Lifedrinker's three types). Exactly
       *    one of the two is set.
       *  - `costsPactSlot` — `true` for Eldritch Smite (the rider is paid for
       *    by expending a Pact Magic slot).
       *  - `scalesPerSlotLevel` — `true` when the base die is dealt PLUS one
       *    die per slot level (Eldritch Smite: an extra `1d8` "plus another 1d8
       *    per level of the spell slot" → `(slotLevel + 1)d8`). The consumer
       *    resolves the warlock's current pact-slot level (Pact Magic slots are
       *    all one level) and emits the scaled dice.
       *  - `prone` — `"huge-or-smaller"` marks the secondary Prone effect; the
       *    consumer surfaces it as a rider note (no creature-size engine).
       *  - `healFromHitDie` — `true` when the rider lets you expend a Hit Die
       *    to heal (Lifedrinker). Override-first: the engine NEVER auto-spends
       *    a slot / Hit Die — the rider is a player-chosen on-hit option.
       *
       * Aggregated into `pactWeaponRiders`; the consumer
       * (`resolvePactWeaponAttacks`) attaches it to the pact-weapon row's
       * `extraDamage` after resolving slot-level scaling.
       */
      type: "pact-weapon-rider";
      /** Stable id for dedupe/attribution (the invocation slug). */
      id: string;
      name?: BiText;
      /** Extra-damage die — Eldritch Smite's base AND per-slot-level die (`1d8`), Lifedrinker `1d6`. */
      dice: string;
      /** Fixed damage type (omit when `damageTypeChoices` is set). */
      damageType?: DamageType;
      /** Player-selectable damage types (omit when `damageType` is fixed). */
      damageTypeChoices?: ReadonlyArray<DamageType>;
      /** Paid for by expending a Pact Magic spell slot (Eldritch Smite). */
      costsPactSlot?: boolean;
      /** Base die PLUS one die per slot level (Eldritch Smite `(slotLevel + 1)d8`). */
      scalesPerSlotLevel?: boolean;
      /** Secondary Prone effect on the target (Eldritch Smite, Huge or smaller). */
      prone?: "huge-or-smaller";
      /** Lets you expend a Hit Die to heal on the hit (Lifedrinker). */
      healFromHitDie?: boolean;
    }

  // ── Familiar / companion enhancement (Investment of the Chain Master) ─────
  | {
      /**
       * A bundle of buffs a feature confers on a **summoned familiar** — the
       * creature conjured by the Find Familiar spell, NOT a feature-declared
       * {@link CompanionStatBlock} (Steel Defender / Eldritch Cannon / Beast
       * Master beast). The familiar's own stat block lives on the spell (the
       * player's chosen Beast/special form), so the engine can't resolve it as a
       * `companion`; instead this grant declares the DELTAS the feature layers on
       * top of whatever form the player summoned, and the consumer
       * (`resolveFamiliarEnhancements`) folds in the only character-derived value
       * (the owner's spell save DC). Warlock **Investment of the Chain Master**
       * (Pact of the Chain, L5+) is the sole 2024 case; the primitive is named
       * generically so future "your familiar gains …" features reuse it.
       *
       * Every field is optional so a feature can confer any subset:
       *  - `extraSpeedFt` + `extraSpeedModes` — a non-walking Speed of
       *    `extraSpeedFt` feet the player picks ONE mode of from `extraSpeedModes`
       *    ("Aerial or Aquatic": Fly OR Swim 40 ft → `40` + `["fly","swim"]`).
       *  - `bonusActionAttack` — `true` when the owner can, as a Bonus Action,
       *    command the familiar to take the Attack action ("Quick Attack").
       *  - `damageTypeConversion` — element(s) the familiar's Bludgeoning /
       *    Piercing / Slashing damage may be switched to ("Necrotic or Radiant
       *    Damage" → `["necrotic","radiant"]`). The player picks per hit.
       *  - `usesOwnerSaveDc` — `true` when a saving throw the familiar forces uses
       *    the OWNER's spell save DC ("Your Save DC"). The evaluator can't resolve
       *    the DC (no scores); the consumer stamps it from the owner at render.
       *  - `reactionResistance` — `true` when the owner can take a Reaction to
       *    grant the familiar Resistance to damage it takes ("Resistance").
       *
       * Override-first: the familiar is a play-time entity the engine never
       * auto-commands; this only surfaces the available options (the player
       * applies the Bonus-Action attack / damage-type swap / Reaction manually).
       * Merge: collected as a list (one entry per granting source), deduped by
       * the source id in the evaluator.
       */
      type: "familiar-enhancement";
      /** Non-walking Speed (feet) the familiar gains, when the feature grants one. */
      extraSpeedFt?: number;
      /** Movement modes the player picks ONE of for `extraSpeedFt` (Fly / Swim). */
      extraSpeedModes?: ReadonlyArray<"fly" | "swim" | "climb">;
      /** Bonus Action to command the familiar to take the Attack action. */
      bonusActionAttack?: boolean;
      /** Elements the familiar's B/P/S damage can be switched to (player's choice). */
      damageTypeConversion?: ReadonlyArray<DamageType>;
      /** Saving throws the familiar forces use the owner's spell save DC. */
      usesOwnerSaveDc?: boolean;
      /** Owner can Reaction-grant the familiar Resistance to damage it takes. */
      reactionResistance?: boolean;
    }

  // ── Cunning Strike option (Rogue catalogue — not the action economy) ──────
  | {
      /**
       * A Rogue **Cunning Strike** option (rogue:main L5 + Improved/Devious
       * Strikes, and subclass adders like Thief Supreme Sneak L9, Scion Strike
       * Fear L9). These are NOT action-economy actions (`granted-action`) — they
       * ride on a Sneak Attack hit and are paid for by **forgoing Sneak Attack
       * dice**, not by an action/bonus/reaction or a tracker. The whole catalogue
       * an effective character knows aggregates into `cunningStrikeOptions`, so
       * adding one (whether base, Devious Strikes, or a subclass grant) is a pure
       * data edit — never combat-code or a regex over the feature prose.
       *
       * `optionId` is a stable, catalogue-unique key (`poison`, `trip`,
       * `stealth-attack`, …) used to dedupe across sources. `cost` is the number
       * of Sneak Attack dice forgone (the "Cost: Nd6" in the wiki). `save`, when
       * set, is the ability the TARGET rolls against; the concrete DC is
       * character-derived (8 + DEX mod + PB), so the consumer
       * (`resolveCunningStrikeOptions`) computes it — this grant only carries the
       * ability so the data↔logic seam stays pure data. `condition`, when set, is
       * the condition the option can impose (for the condition-chip renderer).
       */
      type: "cunning-strike-option";
      optionId: string;
      name?: BiText;
      cost: number;
      description?: BiText;
      save?: AbilityCode;
      condition?: ConditionId;
    }

  // ── Temporary HP grant (override-first — NEVER auto-applied) ──────────────
  | {
      /**
       * A feature/feat that grants the character Temporary Hit Points on a
       * defined event (Warlock Fiend "Dark One's Blessing" → CHA + Warlock
       * level on dropping an enemy; Orc "Adrenaline Rush" → PB on a Dash;
       * Armorer "Defensive Field" → Artificer level; World Tree "Vitality
       * Surge" → Barbarian level on Rage). `formula` is resolved by the
       * tracker-formula language (`resolveTempHp`) into a concrete number —
       * `"CHA+level"`, `"PB"`, `"level"`, `"2*WIS"`, etc. — so the UI can
       * surface a "Gain N temporary HP" entry the player applies manually.
       *
       * Override-first: the engine NEVER auto-applies temp HP (D&D temp HP do
       * not stack — the player chooses the higher pool). NO dice in the
       * formula — die-based grants (1d8, 2× Martial Arts die) are out of
       * scope here and stay as descriptive features.
       *
       * `trigger` (optional) is the bilingual event that grants the temp HP
       * ("when you reduce an enemy to 0 HP"). `slot`, when set, marks the gain
       * as a deliberate action the player spends (Orc Dash = bonus); omit for
       * an automatic/triggered gain (Dark One's Blessing).
       */
      type: "temp-hp";
      formula: string;
      trigger?: BiText;
      slot?: ActionType;
    }
  | {
      /**
       * Adds an ALTERNATE recovery cost to ANOTHER feature's tracker: when the
       * target tracker is exhausted, a use can still be activated by spending
       * `amount` units from the `fromTracker` pool, instead of waiting for the
       * normal rest recovery. Sorcerer's Sorcery Incarnate (L7) declares this on
       * the L1 Innate Sorcery tracker: "If you have no uses of Innate Sorcery
       * left, you can use it if you spend 2 Sorcery Points when you take the
       * Bonus Action to activate it" → `{ targetTracker: "sorcerer-innate-sorcery",
       * amount: 2, fromTracker: "sorcerer-font-of-magic" }`.
       *
       * Distinct from a `TrackerSpec.altRecoveryCost` declared inline on a
       * tracker (the 5 other Sorcerer features whose clause lives in the same
       * feature as their tracker). This grant exists for the CROSS-feature case
       * where the clause and the tracker belong to different features.
       *
       * Merge: collected as a list; the smart-tracker consumer overlays each
       * entry onto its `targetTracker`. Override-first — purely informational
       * (the engine never auto-deducts the pool).
       */
      type: "tracker-alt-recovery";
      targetTracker: string;
      amount: number;
      fromTracker: string;
    }

  // ── PRIM batch (2026-06-10) — the six model-gap primitives ───────────────
  | {
      /**
       * **PRIM-aura/emanation.** A persistent radius effect a feature projects
       * around the character (Druid Wrath of the Sea / Starry Form constellations
       * / Nature's Sanctuary, Paladin Smite of Protection half-cover, Rod of
       * Alertness Protective Aura). The battlefield is not modelled (allies/enemies
       * are not on this single-character sheet, and radius geometry is encounter
       * state), so this grant is **informational by design**: the consumer
       * (`auraVMs` in `lib/views/tracker-view.ts`) surfaces a readable rider note —
       * radius, who it affects, and the structured effect — alongside the feature.
       *
       * `radius` is the emanation size in feet (or `"variable"` when a level table
       * grows it — the `radiusByLevel` map then resolves it). `affects` names whose
       * the effect touches. `effect` is the structured payload (its `kind`
       * discriminates): a recurring save-or-damage emanation (Wrath of the Sea), an
       * at-will ranged attack from the aura (Starry Archer), a heal trigger (Starry
       * Chalice), a flat AC bonus to those inside (Rod of Alertness), temp HP to
       * allies (Boon of the Bright Sun), or a half-cover grant (Smite of
       * Protection). `description` (optional) is a bilingual override blurb; when
       * omitted the presenter composes the note from the structured fields.
       *
       * Override-first: the engine rolls no dice and tracks no geometry — it shows
       * the formula/rider; the player adjudicates the battlefield.
       */
      type: "aura";
      auraId: string;
      radius: number | "variable";
      radiusByLevel?: Readonly<Record<number, number>>;
      affects: AuraAffects;
      effect:
        | {
            kind: "save-damage";
            /** Dice formula, e.g. `"WISd6"` (a number of d6s = WIS mod, min 1). */
            dice: string;
            damageType: DamageType;
            saveAbility: AbilityCode;
            /** Optional forced movement on a failed save (push N ft). */
            pushFt?: number;
            maxTargetSize?: CreatureSize;
          }
        | {
            kind: "ranged-attack";
            dice: string;
            damageType: DamageType;
            rangeFt: number;
            /**
             * S12b — the aura die keyed by the threshold level at which it begins
             * to apply (Circle-of-Stars **Archer**: `{ 3: "1d8", 10: "2d8" }` —
             * Twinkling Constellations bumps the 1d8 to 2d8 at Druid 10). The aura
             * presenter resolves the highest threshold ≤ the character's level via
             * the shared {@link import("@/lib/utils").pickDiceByLevel} (the SAME
             * "highest threshold ≤ level" rule `ActionAttack.diceByLevel` uses);
             * `dice` is the floor below the first threshold. Omit for a flat die.
             */
            diceByLevel?: Readonly<Record<number, string>>;
          }
        | {
            kind: "heal";
            dice: string;
            /** S12b — see `ranged-attack` `diceByLevel` (Circle-of-Stars
             *  **Chalice**: `{ 3: "1d8", 10: "2d8" }`). Omit for a flat die. */
            diceByLevel?: Readonly<Record<number, string>>;
          }
        | { kind: "ac-bonus"; amount: number }
        | { kind: "temp-hp"; formula: string }
        | { kind: "half-cover" }
        | { kind: "roll-floor"; floor: number; appliesTo: "ability-and-concentration" };
      description?: BiText;
    }
  | {
      /**
       * **PRIM-spell-die-augment.** Upgrades the damage DIE of ONE specific spell
       * (Ranger Foe Slayer: "The damage die of your Hunter's Mark is a d10 rather
       * than a d6"). Matched by SRD spell id; the consumer
       * (`resolveSpellDieAugment` in `lib/compute.ts`) rewrites the spell's
       * `damageDice` die size at render so the marked-target / cast verdict shows
       * the upgraded die. `fromDie`/`toDie` are die sizes (6, 10) — the engine
       * rolls no dice, it only re-sizes the printed formula. Largest `toDie` wins
       * when two sources target the same spell. Override-first.
       */
      type: "spell-die-augment";
      spellId: string;
      fromDie: number;
      toDie: number;
    }
  | {
      /**
       * **PRIM-copy-to-2nd-target.** A rider that lets an effect (another feature's
       * free cast, a marked-target benefit, a teleport) extend to a SECOND
       * creature (Greater Mark of Detection Shared Detection, Greater Mark of
       * Passage Inspired Passage, Greater Mark of Scribing Inspired Scribing,
       * Warlock Archfey Bewitching Magic's free Misty Step). Targeting a second
       * creature is a per-cast choice the engine can't auto-apply, so this is an
       * **informational rider**: `appliesToFeature` (optional) names the feature
       * whose effect is duplicated, `effect` is the bilingual blurb of what the
       * second target receives. The consumer (`copyTargetVMs`) surfaces it as a
       * readable note on the owning feature. Override-first.
       */
      type: "copy-to-2nd-target";
      copyId: string;
      appliesToFeature?: string;
      /**
       * Bilingual blurb of what the second target receives. OPTIONAL inline:
       * for a real SRD source (these greater-mark feats) the text is stripped to
       * the i18n catalogue (`<featKey>.grants.<copyId>.effect`) and resolved via
       * `grantField`; the inline BiText survives only on synthetic/test grants.
       */
      effect?: BiText;
    }
  | {
      /**
       * **PRIM-resource-conversion.** Spend resource A to PRODUCE resource B — the
       * converter the alt-recovery seam can't express (alt-recovery only *restores*
       * a use of an existing tracker). Variants by `produces`:
       *  - `"spell-slot"` — Druid Archdruid Nature Magician (N Wild Shape uses →
       *    one slot, each use = 2 spell levels), Sorcerer Font of Magic Creating
       *    Spell Slots (Sorcery Points → a slot per the cost table). `costTable`
       *    maps produced slot level → units of `fromTracker` spent (+ `minLevel`
       *    gate); `perUnitSlotLevels` (Nature Magician) instead means each spent
       *    unit contributes that many slot levels.
       *  - `"pact-slot"` — Warlock Magical Cunning (L2) / Eldritch Master (L20):
       *    spend the feature's ONE Long-Rest charge (`fromTracker`) to un-expend
       *    Warlock Pact-Magic slots — ⌈max/2⌉ for Magical Cunning, ALL when
       *    Eldritch Master upgrades it. Pact Magic is a single-level pool, so the
       *    live amount + pact level are resolved at use-time from the doc.
       *  - `"sorcery-points"` — Font of Magic Converting Spell Slots (a spell slot
       *    → SP equal to the slot level).
       *
       * The cost-engine (`planResourceConversion`) plans the concrete
       * spend/produce ops (immediate-commit-with-undo); the consumer surfaces the
       * conversion as an action affordance. Override-first — never auto-converted.
       */
      type: "resource-conversion";
      conversionId: string;
      produces: "spell-slot" | "pact-slot" | "sorcery-points";
      fromTracker?: string;
      toTracker?: string;
      /** Nature Magician: each spent unit = this many spell levels. */
      perUnitSlotLevels?: number;
      /** Font of Magic: produced-slot-level → { cost, minLevel }. */
      costTable?: ReadonlyArray<{ slotLevel: number; cost: number; minLevel: number }>;
      /** Max produced slot level (Font of Magic = 5). */
      maxSlotLevel?: number;
    }
  | {
      /**
       * **PRIM-item-bound-bonus.** A +N magic bonus that rides ONLY the owning
       * weapon's OWN attack & damage rolls — the ~30 "+N to attack and damage
       * with this magic weapon" items (every +1/+2/+3 weapon, the staves'
       * quarterstaff bonus, Wraps of Unarmed Power). This is the ONE item-bound
       * case with no existing grant kind: a flat `ac-bonus` always lands on AC, a
       * `save-bonus` on every save, and `spell-attack-bonus`/`spell-save-dc-bonus`
       * on all spells — but a +N weapon bonus must touch ONLY that one weapon's
       * row, never every attack. (Cloak/Ring of Protection's AC + saves, and Rod
       * of the Pact Keeper's spell attack & DC, are already modeled by those
       * existing kinds — single source of truth, no parallel target here.)
       *
       * The bonus does NOT aggregate (aggregating would smear it across all
       * attacks); the weapon-layer consumer (`resolveItemBoundWeaponBonus`) reads
       * the OWNING item's grants directly and adds `amount` to that weapon row's
       * to-hit + damage, replacing the manual `attackBonusOverride` seam. Only
       * present while the item is an active grant source (equipped+attuned).
       * Override-first.
       */
      type: "item-bound-bonus";
      target: "weapon-attack-and-damage";
      amount: number;
    };

// ─── Source rows that may carry a `grants` field ────────────────────────────

/** Anything with a SRD id, an EN/IT name, and optionally a grants array. */
export interface GrantSource {
  id: string;
  /**
   * Optional inline display name — set ONLY on synthetic/runtime sources that
   * carry no catalogue `ref`. SRD sources localize their name off the catalogue
   * via `ref` (R6+R3 SLICE 7c/7d), so they omit it. Not read by the evaluator.
   */
  name?: BiText;
  grants?: ReadonlyArray<Grant>;
  /**
   * The source's stable i18n-catalogue reference `{ kind, key }` (R6+R3 SLICE
   * 7c). The evaluator extends `ref.key` with each grant's `.grants.<seg>` path
   * (see {@link srdGrantSegment}) to key that grant's localizable strings, so the
   * aggregate carries a {@link LocText} `srd` ref instead of materialized BiText.
   * Omitted for sources whose grants carry no localizable strings, or for
   * runtime-built sources that supply their own `lit`/`custom` text; the
   * evaluator then falls back to an engine literal. SRD feature/equipment/
   * invocation/maneuver/background/magic-item sources set it.
   */
  ref?: { kind: SrdKind; key: string };
}

// ─── Aggregated effects after evaluation ────────────────────────────────────

/**
 * Non-walking speed value — number of feet, or a walking-speed-relative
 * sentinel: `"equal-to-walking"` (= your Speed) or `"twice-walking"` (= 2× your
 * Speed). The sentinels resolve at render time in `resolveNonWalkingSpeed`.
 */
export type NonWalkingSpeed = number | "equal-to-walking" | "twice-walking";

/** A pending player choice surfaced by `evaluateGrants`. */
export type PendingChoice =
  | {
      sourceId: string;
      kind: "ability-score";
      abilities: ReadonlyArray<AbilityCode>;
      amount: number;
      cap?: number;
    }
  | {
      sourceId: string;
      kind: "skill-proficiency";
      options: ReadonlyArray<string>;
      amount: number;
    }
  | {
      sourceId: string;
      kind: "expertise";
      amount: number;
    }
  | {
      sourceId: string;
      kind: "language";
      options: ReadonlyArray<string>;
      amount: number;
    }
  | {
      sourceId: string;
      kind: "tool-proficiency";
      options: ReadonlyArray<string>;
      amount: number;
    }
  | {
      sourceId: string;
      kind: "cantrip";
      classSpellList?: ClassId;
      amount: number;
      /** Pin casting ability for picks made through this slot. */
      spellAbility?: AbilityCode;
    }
  | {
      sourceId: string;
      kind: "spell";
      classSpellList?: ClassId;
      /** choice-spell-multi-list: union of allowed class lists (Magical Secrets). */
      classSpellLists?: ReadonlyArray<ClassId>;
      maxLevel: number;
      amount: number;
      /** Pin casting ability for picks made through this slot. */
      spellAbility?: AbilityCode;
      /**
       * Restrict the pool to Ritual-tagged spells across all class lists
       * (Pact of the Tome's Book of Shadows). The picker filters on
       * `spell.ritual === true`.
       */
      ritualOnly?: boolean;
      /**
       * Restrict the pool to one school of magic (`spell.school ===
       * spellSchool`). Wizard School Savant features. The picker filters on it.
       */
      spellSchool?: SpellSchool;
      /**
       * Restrict the pool to ANY of several schools (Fey-Touched's
       * "Divination or Enchantment"). The picker filters on membership.
       */
      spellSchools?: ReadonlyArray<SpellSchool>;
      /**
       * The picks land in the Wizard's spellbook (`prepared:false`), not as
       * always-prepared spells. Wizard School Savant features.
       */
      toSpellbook?: boolean;
    }
  | {
      /**
       * Skilled-style "pick N skills OR tools" pending pick. The picker
       * UI surfaces a unified pool. Used by `lib/feat-skill-tool-choices.ts`
       * to resolve into character.skills / character.toolProficiencies.
       */
      sourceId: string;
      kind: "skill-or-tool-proficiency";
      amount: number;
    }
  | {
      /**
       * **Choice-feat** pending pick (origin-feat grant). The source grants a
       * whole feat of choice from `category` (Lessons of the First Ones / Human
       * Versatile → "origin"). The picker (`feat-feat-choices.ts`) enumerates
       * the eligible feats of that category and resolves each pick into a feat
       * ref on `character.features`. `amount` is how many feats to pick (1 for
       * every current case).
       */
      sourceId: string;
      kind: "feat";
      category: FeatCategory;
      amount: number;
    };

/** A free-cast grant resolved against its source for tracker creation. */
export interface FreeCastEntry {
  /** The per-rest tracker id the cast debits. For a feat/feature/species free
   *  cast this is PER-SPELL — `${featId}:${spellId}` — so two free-casts from one
   *  source (Fey-Touched, a heritage feat's granted spells) are tracked
   *  independently (RAW "cast EACH once"). For a MAGIC ITEM it is the bare item id
   *  (the item's shared charge pool). Set in the `free-cast-spell` evaluator. */
  sourceId: string;
  spellId: string;
  chargesPerRest: number;
  /** Scaled charge formula (`"PB"`, an ability code like `"WIS"`/`"INT"`, etc.),
   *  resolved by the consumer via `resolveChargesFormula`; overrides
   *  `chargesPerRest` when set. See the `free-cast-spell` grant's `chargesFormula`. */
  chargesFormula?: string;
  rest: "short" | "long";
  casterAbility?: AbilityCode;
  /** Character-level gate — the free cast is only offered at/above this level. */
  minLevel?: number;
}

/**
 * D4 — a free-cast-FROM-LIST grant resolved against its source: a GUIDED pool the
 * player picks a spell from at cast time (Cleric Divine Intervention → any Cleric
 * spell ≤ 5th, 1/Long Rest, no slot). Unlike {@link FreeCastEntry} (one fixed
 * spell), the spell is the player's choice within the pool — a class list
 * (`spellList` ≤ `maxSpellLevel`) OR a fixed set (`spellIds`, War God's
 * Blessing) — and `trackerId` is the per-rest tracker the cast debits (the
 * owning feature's, e.g. `cleric-channel-divinity`).
 */
export interface FreeCastFromListEntry {
  sourceId: string;
  spellList?: string;
  maxSpellLevel?: number;
  /** A fixed pool of stable spell ids (mutually exclusive with `spellList`). */
  spellIds?: readonly string[];
  /**
   * S9 — per-spell charge cost (spellId → charges) for a VARIABLE-cost item pool
   * (Wand of Binding / Wand of Fear). A spell absent from the map costs 1. The
   * consumer expands this into `FreeCastFromListPool.costBySpell` (default 1 for
   * every eligible spell). Absent for the feature pools (uniform 1-use debit).
   */
  spellCosts?: Readonly<Record<string, number>>;
  /** Explicit per-rest cap; when undefined the consumer infers it from the tracker total. */
  chargesPerRest?: number;
  rest?: "short" | "long";
  /** Tracker to debit per use (the source feature's own tracker). */
  trackerId: string;
  casterAbility?: AbilityCode;
}

/**
 * An at-will (unbounded, slotless) self-cast grant resolved against its source.
 * Unlike {@link FreeCastEntry} there is no charge cap — the spell can be cast
 * any number of times at its base level without expending a slot. `sourceId`
 * is the originating feature (an Eldritch Invocation) so the UI can attribute
 * the at-will row; `casterAbility` pins the spellcasting ability for the cast.
 */
export interface AtWillCastEntry {
  sourceId: string;
  spellId: string;
  casterAbility?: AbilityCode;
  /**
   * When the source maximizes the spell's Temporary HP instead of rolling
   * (Fiendish Vigor → False Life), the already-resolved flat maximized total
   * (2d4+4 → 12). Absent for a normal slotless at-will cast. Override-first —
   * a value the player applies; the engine never auto-sets HP.
   */
  autoMaxTempHp?: number;
}

/**
 * Maximize a dice formula into its highest deterministic total — every `NdX`
 * term becomes `N*X` (its top face) and every flat `±K` term is summed in.
 * Pure, no RNG: it computes the maximum a roll could produce, used by the
 * `at-will-cast-spell` auto-max-temp-HP path (Fiendish Vigor → False Life's
 * `"2d4+4"` → `2*4 + 4 = 12`). Whitespace-tolerant; an unparseable formula
 * yields 0. NEVER rolls — this is the ceiling, not a sample.
 */
export function maximizeDiceFormula(formula: string): number {
  let total = 0;
  // Match every signed term: a dice term (`2d4`) or a flat integer (`4`).
  const termRe = /([+-]?)\s*(\d+)(?:d(\d+))?/g;
  let m: RegExpExecArray | null;
  while ((m = termRe.exec(formula)) !== null) {
    const sign = m[1] === "-" ? -1 : 1;
    const count = Number(m[2]);
    const faces = m[3] === undefined ? undefined : Number(m[3]);
    // A dice term contributes count × top-face; a flat term contributes count.
    const value = faces === undefined ? count : count * faces;
    total += sign * value;
  }
  return total;
}

/**
 * An aggregated `scoped-extra-spell-slot` grant resolved against its source.
 * A bonus, upcast-capable spell slot whose level scales with character level,
 * restricted to a scoped pool of prepared spells, recovered on the declared
 * rest cadence. `sourceId` is the granting FEAT (a heritage feat) — both
 * the cast-option consumer (`scopedSlotSourcesForSpell`) and the smart-tracker
 * (which creates the 1-use expend/regain tracker) attribute the slot to it.
 */
export interface ScopedExtraSlotEntry {
  sourceId: string;
  levelFormula: ScopedSlotLevelFormula;
  scope: ScopedSlotSpellScope;
  recovery: "short-or-long" | "short" | "long";
}

/** A casting modifier scoped per class (or globally). */
export interface CastingModifierEntry {
  amount: number;
  scope: "all" | ClassId;
}

/**
 * A spell-damage bonus the character can add to one damage roll of a qualifying
 * spell (Draconic Sorcery Elemental Affinity → +CHA mod on a spell that deals
 * the chosen draconic damage type). `damageTypes` is the triggering set (empty =
 * any damaging spell). `value` is `"modifier"` (add `ability`'s modifier, floored
 * at `min`) or a flat number. `scope` narrows the casting class. `cantripOnly`
 * restricts the bonus to cantrips (spell level 0 — Cleric Potent Spellcasting);
 * `oncePerTurn` is the informational "one damage roll / once per turn" limiter.
 * The consumer (`resolveSpellDamageBonus`) resolves the modifier per spell at
 * render. Both flags are present only when set (default-omitted) so existing
 * type-keyed entries keep their lean shape.
 */
export interface SpellDamageBonusEntry {
  damageTypes: ReadonlyArray<DamageType>;
  ability?: AbilityCode;
  value: "modifier" | number;
  min: number;
  scope: "all" | ClassId;
  cantripOnly?: boolean;
  oncePerTurn?: boolean;
  /** Restrict to spells of these SCHOOLS (Evoker Empowered Evocation → evocation). */
  schools?: ReadonlyArray<string>;
}

/**
 * A bonus added to the Hit Points a HEALING SPELL restores (the healing
 * counterpart of {@link SpellDamageBonusEntry}). `amount` is the flat base;
 * `perSpellLevel` adds the cast slot level; `minSpellLevel` gates the spell
 * level (cantrips excluded when ≥1); `scope` restricts to a class's spell list.
 * The consumer (`resolveHealBonus`) sums every matching entry per cast.
 */
export interface HealBonusEntry {
  amount: number;
  perSpellLevel: boolean;
  minSpellLevel: number;
  scope: "all" | ClassId;
}

/**
 * An ALTERNATE damage type a damaging spell may deal — the player's choice each
 * cast (the type-swap counterpart of {@link SpellDamageBonusEntry}, which adds a
 * number). `toType` is the offered type (Great Old One Psychic Spells → Psychic);
 * `scope` restricts it to one casting class's spell list ("warlock") or "all".
 * The consumer (`resolveSpellDamageTypeOverrides`) returns every in-scope
 * alternate type; the smart-tracker folds them into the spell's damage-type
 * CHOICE chip (reusing the existing multi/choice rendering) so the player picks
 * the original type or the override per cast. The engine never auto-swaps.
 */
export interface SpellDamageTypeOverrideEntry {
  toType: DamageType;
  scope: "all" | ClassId;
}

/**
 * A component-waiver: the caster may cast spells of the given `schools` (empty =
 * any) without the listed `waive` components, scoped to one casting class or
 * "all" (Great Old One Psychic Spells: Enchantment/Illusion Warlock spells
 * without V/S). The consumer (`resolveComponentWaiver`) returns the waived
 * components for a given spell; the smart-tracker marks them on the verdict.
 */
export interface ComponentWaiverEntry {
  schools: ReadonlyArray<string>;
  waive: ReadonlyArray<"v" | "s" | "m">;
  scope: "all" | ClassId;
}

/**
 * A spell-damage bonus targeted at ONE specific cantrip by SRD id (Warlock's
 * Agonizing Blast → +CHA mod to the chosen cantrip's damage rolls; repeatable,
 * one entry per chosen cantrip). `spellId` is the resolved chosen cantrip.
 * `value` is `"modifier"` (add `ability`'s modifier, floored at `min`) or a flat
 * number. The consumer (`resolveCantripDamageBonus`) sums every entry whose
 * `spellId` matches the cantrip being rendered, per cantrip, at render time.
 */
export interface CantripDamageBonusEntry {
  spellId: string;
  ability?: AbilityCode;
  value: "modifier" | number;
  min: number;
}

/**
 * A non-damage on-hit effect rider targeted at ONE specific cantrip by SRD id
 * (Warlock's Repelling Blast → on a hit with the chosen attack-roll cantrip,
 * push a Large-or-smaller creature up to 10 ft; repeatable, one entry per
 * chosen cantrip). `spellId` is the resolved chosen cantrip. The `effect`
 * discriminant selects the rider clause; `"forced-movement"` carries
 * `direction` ("push"/"pull"), `distanceFt`, and `maxTargetSize` (the largest
 * size the rider can move). The consumer (`resolveCantripForcedMovement`)
 * returns the matching rider for the cantrip being rendered.
 */
export interface CantripEffectRiderEntry {
  spellId: string;
  effect: "forced-movement";
  direction: "push" | "pull";
  distanceFt: number;
  maxTargetSize: CreatureSize;
}

/**
 * A range bonus targeted at ONE specific cantrip by SRD id, scaling by a class's
 * level (Warlock's Eldritch Spear → +30 ft × Warlock level to the chosen damaging
 * cantrip's range; repeatable, one entry per chosen cantrip). `spellId` is the
 * resolved chosen cantrip; `bonusPerLevel` is the per-level feet (30) and
 * `scalesWith` the class whose level multiplies it. The consumer
 * (`resolveCantripRangeBonus`) sums `bonusPerLevel × level` across every entry
 * whose `spellId` matches the cantrip being rendered, per cantrip, at render.
 */
export interface CantripRangeBonusEntry {
  spellId: string;
  bonusPerLevel: number;
  scalesWith: ClassId;
}

/**
 * A flat to-hit bonus on weapon attack rolls, scoped to ranged / melee / any
 * weapons (Archery fighting style → `{ amount: 2, scope: "ranged" }`). The
 * consumer (`resolveActions` weapon rows) sums the `amount`s of every entry
 * whose `scope` applies to the weapon and adds the total to the computed
 * attack bonus. Override-first: skipped when the player pins a per-weapon
 * `attackBonusOverride`.
 */
export interface WeaponAttackBonusEntry {
  /**
   * The to-hit bonus, carried UNRESOLVED: a flat number, OR the ability-derived
   * `{ ability, min }` variant (Sacred Weapon → +CHA mod, min +1). The evaluator
   * has no character/ability scores, so the consumer
   * (`resolveWeaponAttackBonuses` in smart-tracker) resolves the ability variant
   * per weapon — mirroring how `weaponDamageBonuses` carries `number | "PB" |
   * sourceKey` for the consumer to resolve.
   */
  amount: number | { ability: AbilityCode; min?: number };
  scope: "any" | "ranged" | "melee";
  /**
   * Source feature/feat id (provenance). The to-hit breakdown attributes each
   * bonus to the entity that grants it (Archery → the Archery feat) by its
   * ONE catalogue name (golden rule 6) — the SAME pattern `weapon-damage-bonus`
   * carries for the damage breakdown. `resolveWeaponAttackBonuses` (smart-tracker)
   * resolves it to the feature's name `LocText`.
   */
  sourceId: string;
  /**
   * The wrapping `while-active` toggle id when the grant arrived through one
   * (Sacred Weapon → `paladin-devotion-sacred-weapon`) — so the to-hit breakdown
   * can mark the bonus as a conditional, currently-active source. Mirrors
   * `weaponDamageBonuses.whileActiveKey` (Rage).
   */
  whileActiveKey?: string;
}

/**
 * A manipulation of how a weapon's OWN damage dice are rolled / what its base
 * damage is (Great Weapon Fighting floor, Savage Attacker reroll-keep-higher,
 * Two-Weapon Fighting off-hand modifier, Unarmed Fighting Unarmed Strike). The
 * normalised view the attack-row consumer reads — every field is already a
 * concrete value (defaults applied). `sourceId` attributes it to its feature.
 * The engine NEVER rolls dice; the consumer surfaces these as annotations /
 * damage-formula adjustments the player applies when they roll externally.
 */
export interface DamageDieModifierEntry {
  sourceId: string;
  mode: "floor" | "reroll-keep-higher" | "offhand-ability-mod" | "unarmed-strike";
  appliesTo: "weapon" | "two-handed-melee" | "light-melee" | "unarmed";
  /** "floor": highest die face replaced (Great Weapon Fighting → 2). */
  floorBelow?: number;
  /** "floor": value a floored face becomes (Great Weapon Fighting → 3). */
  floorTo?: number;
  /** "reroll-keep-higher": once-per-turn limiter (Savage Attacker). */
  oncePerTurn?: boolean;
  /** "unarmed-strike": base die when holding a weapon/shield (1d6). */
  baseDie?: string;
  /** "unarmed-strike": upgraded die when unburdened (1d8). */
  unburdenedDie?: string;
  /** "unarmed-strike": die dealt to a Grappled creature each turn (1d4). */
  grappleDie?: string;
  /** "unarmed-strike" / "offhand-ability-mod": the ability modifier added. */
  abilityMod?: AbilityCode;
  /** "unarmed-strike": the Unarmed Strike's damage type. */
  damageType?: DamageType;
}

/** A typed AC formula candidate (the highest applicable result wins at render). */
export interface AcFormula {
  sourceId: string;
  base: number;
  bonuses: ReadonlyArray<AbilityCode>;
  condition: "no-armor" | "no-armor-no-shield" | "always" | "while-active";
  shieldBonus: number;
  /**
   * Present ONLY for a `while-active` formula — the toggle key that gates it
   * (Circle of the Moon Circle Forms → `druid-moon-circle-forms`). Lets the AC
   * consumer (and the UI) attribute the form-AC candidate to its toggle.
   */
  activeKey?: string;
}

/**
 * L11 — an activatable feature the player can toggle on/off during play
 * (Bladesong, Innate Sorcery, Rage, …). Surfaced regardless of state so the
 * UI can render a toggle; `active` reflects the current session active-set.
 */
export interface ActivatableGroup {
  key: string;
  sourceId: string;
  label: LocText;
  active: boolean;
}

/**
 * L12 — a single-select variant chooser surfaced by a `choice-grant-bundle`
 * grant (Circle of the Land terrain, etc.). The UI renders one selector per
 * `bundleKey`; `selected` is the current session pick (null = unchosen).
 */
export interface GrantBundle {
  bundleKey: string;
  sourceId: string;
  label: LocText;
  options: ReadonlyArray<{ id: string; label: LocText }>;
  selected: string | null;
  /** Mirrors the grant's `choiceFrequency`; defaults to `"rest"` when absent. */
  choiceFrequency: "creation" | "rest";
}

/**
 * A **choice-resistance** slot surfaced by a `choice-resistance` grant (Boon of
 * Energy Resistance, etc.). The UI renders a multi-select of `options` capped at
 * `amount`; `selected` is the current re-selectable session pick (the validated,
 * deduped, capped subset of `options` already merged into `damageResistances`).
 * `choiceKey` is the `session.grantBundleChoices` key the picker writes back to.
 */
export interface ChoiceResistance {
  choiceKey: string;
  sourceId: string;
  label: LocText;
  options: ReadonlyArray<DamageType>;
  amount: number;
  selected: ReadonlyArray<DamageType>;
}

/**
 * Parse a `choice-resistance` session value (a comma-separated list of
 * `DamageType` tokens stored at `session.grantBundleChoices[choiceKey]`) into a
 * validated pick list: keeps only tokens that appear in `options`, dedupes
 * (first occurrence wins), and caps the result at `amount`. A `null`/`undefined`
 * value, blank tokens, and out-of-list tokens all drop out — so an over-long or
 * tampered value can never grant more or different resistances than the slot
 * allows. Pure (no I/O); the evaluator and any picker UI share it.
 */
export function parseChoiceResistanceValue(
  raw: string | null | undefined,
  options: ReadonlyArray<DamageType>,
  amount: number
): DamageType[] {
  if (raw == null) return [];
  const allowed = new Set<DamageType>(options);
  const picks: DamageType[] = [];
  const seen = new Set<DamageType>();
  for (const token of raw.split(",")) {
    const t = token.trim() as DamageType;
    if (!allowed.has(t) || seen.has(t)) continue;
    seen.add(t);
    picks.push(t);
    if (picks.length >= amount) break;
  }
  return picks;
}

/**
 * The catalogue ref a grant's localizable strings resolve under (R6+R3 SLICE
 * 7c): the source's `{ kind, key }` extended with this grant's `.grants.<seg>`
 * path. `undefined` for sources with no catalogue ref (synthetic/test sources, or
 * runtime sources that supply their own literal text) — the evaluator then falls
 * back to {@link litText} over the grant's inline BiText, preserving behaviour.
 */
type GrantRef = { kind: SrdKind; key: string } | undefined;

/**
 * Build a {@link LocText} for ONE field of a grant: an `srd` catalogue reference
 * when the grant carries a `ref` (a real SRD source), else an engine literal over
 * the grant's inline `BiText` (synthetic/test sources). The `srd` path NEVER
 * reads the BiText, so the data strip deleted it from real SRD sources; the
 * inline `lit` survives ONLY on synthetic/runtime grants (so it's optional).
 */
export function grantField(ref: GrantRef, field: string, lit?: BiText): LocText {
  return ref ? srdText(ref.kind, ref.key, field) : litText(lit ?? EMPTY_BITEXT);
}

/** Fallback BiText for a synthetic grant that carries neither a `ref` nor inline text. */
const EMPTY_BITEXT: BiText = { en: "", it: "" };

/**
 * The catalogue ref of a source's top-level grant at `index` — the same
 * `<sourceKey>.grants.<seg>` the evaluator computes. Exported so the (deliberate)
 * second bundle-collector (`feature-choices.collectGrantBundles`) keys its labels
 * IDENTICALLY to the aggregate, never re-deriving the path math.
 */
export function topGrantRef(src: GrantSource, g: Grant, index: number): GrantRef {
  if (!src.ref) return undefined;
  return {
    kind: src.ref.kind,
    key: srdKey(src.ref.key, srdGrantSegment(grantSegmentArgs(g), index)),
  };
}

/** Exported companion to {@link topGrantRef} for bundle OPTION label refs. */
export function bundleOptionRef(parent: GrantRef, optionId: string): GrantRef {
  return optionGrantRef(parent, optionId);
}

/**
 * The canonical ENGLISH value of a grant field — a FACT (not display): the
 * catalogue EN via `srdEn` when the grant carries a `ref`, else the inline
 * BiText's `.en`. Used where the engine needs the English name as a token
 * (weapon-proficiency match, prone-note label) that survives the data strip.
 */
export function grantFieldEn(ref: GrantRef, field: string, lit?: BiText): string {
  return (ref ? srdEn(ref.kind, ref.key, field) : undefined) ?? lit?.en ?? "";
}

/**
 * Whether an OPTIONAL grant field is present — true when the catalogue carries it
 * (the grant has a `ref` and `srdEn(field)` resolves) OR an inline `lit` BiText is
 * supplied (synthetic/runtime grant). The presence gate survives the data strip:
 * a `granted-action`'s `description`/`trigger` is emitted whenever the catalogue
 * has it, not only when the (now-stripped) inline BiText exists.
 */
export function hasGrantField(ref: GrantRef, field: string, lit?: BiText): boolean {
  return Boolean((ref ? srdEn(ref.kind, ref.key, field) : undefined) ?? lit);
}

/**
 * Compose a child grant's catalogue ref from its parent grant's `ref` by
 * appending the child's `.grants.<seg>` segment (for `while-active` /
 * `choice-grant-bundle` inner grants) — mirroring the codemod's nested path.
 * `undefined` parent → `undefined` child (the literal fallback propagates).
 */
function childGrantRef(parent: GrantRef, child: Grant, index: number): GrantRef {
  if (!parent) return undefined;
  return {
    kind: parent.kind,
    key: srdKey(parent.key, srdGrantSegment(grantSegmentArgs(child), index)),
  };
}

/** Compose a bundle OPTION's catalogue ref (`<grantKey>.options.<optionId>`). */
function optionGrantRef(parent: GrantRef, optionId: string): GrantRef {
  if (!parent) return undefined;
  return { kind: parent.kind, key: srdKey(parent.key, "options", optionId) };
}

/** The id/name args `srdGrantSegment` needs, read off any Grant shape. */
function grantSegmentArgs(g: Grant): { id?: string; optionId?: string; nameEn?: string } {
  // PRIM grants carry their stable id under a kind-specific field (`auraId`,
  // `copyId`, `conversionId`); treat it as the catalogue `id` so localizable
  // strings key on a STABLE id (golden rule 7), never the array index.
  const primId =
    g.type === "aura"
      ? g.auraId
      : g.type === "copy-to-2nd-target"
        ? g.copyId
        : g.type === "resource-conversion"
          ? g.conversionId
          : undefined;
  return {
    ...("id" in g && g.id ? { id: g.id } : primId ? { id: primId } : {}),
    ...("optionId" in g ? { optionId: g.optionId } : {}),
    ...("name" in g && g.name ? { nameEn: g.name.en } : {}),
  };
}

/**
 * ARCHITECTURE.md combat model — a feat/feature/invocation-granted action surfaced on
 * the Combat page (Shield reaction, at-will invocation, …). `sourceId` is the
 * originating feature so the UI can attribute it.
 */
export interface GrantedAction {
  sourceId: string;
  name: LocText;
  slot: ActionType;
  description?: LocText;
  cost?: CostSpec;
  trigger?: LocText;
  /** Ability a TARGET saves against (when the action forces a save). */
  saveAbility?: AbilityCode;
}

/**
 * A weapon a feature manifests (Soulknife's Psychic Blades). The normalised
 * aggregate view the attack-row consumer reads — `sourceId` is the originating
 * feature so the UI can attribute it. Fields mirror the grant; defaults are
 * already resolved (`masteryIsFree`/`proficient` are concrete booleans).
 */
export interface ManifestedWeapon {
  sourceId: string;
  id: string;
  name: LocText;
  /** Canonical English name — a FACT used for the weapon-proficiency match. */
  nameEn: string;
  category: WeaponCategory;
  weaponType: WeaponType;
  damageDie: string;
  damageType: DamageType;
  properties: ReadonlyArray<string>;
  mastery?: WeaponMastery;
  /** True when the mastery use does NOT count against Weapon Mastery picks. */
  masteryIsFree: boolean;
  /** Whether the manifested weapon is wielded with proficiency (default true). */
  proficient: boolean;
  bonusAction?: {
    name: LocText;
    slot: ActionType;
    damageDie: string;
  };
}

/**
 * A natural-weapon attack row a TRANSFORMATION form grants while active (Wild
 * Shape beast bite, Starry Form Archer attack, Armorer Thunder Pulse). The
 * normalised aggregate view the attack-row consumer (`resolveFormAttacks`)
 * reads — `activeKey` is the wrapping `while-active` toggle (so the UI can name
 * the form), `sourceId` the originating feature (so the UI can attribute it).
 * Only present in the aggregate while its form toggle is lit (the evaluator
 * collects it inside the active `while-active` branch). Distinct from a
 * `ManifestedWeapon` (always-on once the feature is owned) — a form attack
 * retracts the moment the form is toggled off.
 */
export interface FormAttack {
  sourceId: string;
  /** The wrapping `while-active` toggle id (the lit form). */
  activeKey: string;
  id: string;
  name: LocText;
  category: WeaponCategory;
  weaponType: WeaponType;
  damageDie: string;
  /** S12b — the form-attack die keyed by threshold level (Stars Archer
   *  `{ 3: "1d8", 10: "2d8" }`); `resolveFormAttacks` resolves it at the
   *  character's level, falling back to `damageDie`. Omit for a flat die. */
  damageDieByLevel?: Readonly<Record<number, string>>;
  damageType: DamageType;
  properties: ReadonlyArray<string>;
  /** Fixed attack/damage ability (Armorer INT); omitted → derive from STR/DEX. */
  attackAbility?: AbilityCode;
  /** Whether the form attack is wielded with proficiency (default true). */
  proficient: boolean;
  /** A once-per-turn extra-damage rider on a hit (Infiltrator Lightning Launcher
   *  +1d6 Lightning). `resolveFormAttacks` folds it into `summary.extraDamage`. */
  oncePerTurnExtra?: { dice: string; damageType: DamageType };
  /** An on-hit self-side reminder ({@link LocText} ref — Guardian Disadvantage,
   *  Dreadnaught push/pull), sourced from the grant's `<ref>.note` catalogue key.
   *  Omitted when the form weapon carries no reminder. Routed to `summary.effect`. */
  note?: LocText;
}

/**
 * A conjured **pact weapon** (Warlock's Pact of the Blade) resolved against its
 * source. Unlike a `ManifestedWeapon` (a fixed weapon profile), this declares
 * only the rules of the bond — the actual weapon form is a player choice the
 * consumer resolves override-first from the session `pactWeaponConfig`.
 */
export interface PactWeapon {
  sourceId: string;
  id: string;
  name: LocText;
  /** Ability used for attack + damage rolls (CHA for Pact of the Blade). */
  attackAbility: AbilityCode;
  /** Elemental damage types the player may switch the weapon to deal. */
  damageTypeChoices: ReadonlyArray<DamageType>;
  /** Whether the bonded weapon counts as a Spellcasting Focus. */
  isFocus: boolean;
  /** Action economy of conjuring the weapon (Bonus Action). */
  conjureSlot: ActionType;
  /** Default conjured-blade die when the player hasn't configured one. */
  defaultDamageDie: string;
  /** Default conjured-blade damage type (its "normal" type). */
  defaultDamageType: DamageType;
}

/**
 * An on-hit extra-damage rider that fires only with a Warlock's conjured pact
 * weapon (Eldritch Smite, Lifedrinker). Resolved against its source; the
 * consumer (`resolvePactWeaponAttacks`) scales the dice by the warlock's
 * pact-slot level when `scalesPerSlotLevel` is set and attaches it to the
 * pact-weapon attack row. Override-first — never auto-spends a slot / Hit Die.
 */
export interface PactWeaponRider {
  sourceId: string;
  id: string;
  name: LocText;
  /** Canonical English name — a FACT used for the rider's prone-note label. */
  nameEn: string;
  /** Extra-damage die (base AND per-slot-level die when `scalesPerSlotLevel`). */
  dice: string;
  /** Fixed damage type (mutually exclusive with `damageTypeChoices`). */
  damageType?: DamageType;
  /** Player-selectable damage types (mutually exclusive with `damageType`). */
  damageTypeChoices?: ReadonlyArray<DamageType>;
  /** Paid for by expending a Pact Magic spell slot (Eldritch Smite). */
  costsPactSlot: boolean;
  /** Die multiplied by the spent slot's level (Eldritch Smite). */
  scalesPerSlotLevel: boolean;
  /** Secondary Prone effect on the target (Eldritch Smite, Huge or smaller). */
  prone?: "huge-or-smaller";
  /** Lets you expend a Hit Die to heal on the hit (Lifedrinker). */
  healFromHitDie: boolean;
}

/**
 * A familiar-enhancement bundle (`familiar-enhancement`) resolved against its
 * source — the buffs a feature layers on a summoned familiar (Warlock
 * Investment of the Chain Master). Carries the declared deltas verbatim; the
 * consumer (`resolveFamiliarEnhancements`) merges these across sources and
 * stamps the owner-derived save DC. Every benefit is optional (a source may
 * confer any subset).
 */
export interface FamiliarEnhancement {
  sourceId: string;
  extraSpeedFt?: number;
  extraSpeedModes?: ReadonlyArray<"fly" | "swim" | "climb">;
  bonusActionAttack?: boolean;
  damageTypeConversion?: ReadonlyArray<DamageType>;
  usesOwnerSaveDc?: boolean;
  reactionResistance?: boolean;
}

/**
 * A Rogue Cunning Strike option in the character's known catalogue (base L5
 * Poison/Trip/Withdraw, Devious Strikes Daze/Knock Out/Obscure, plus subclass
 * adders like Thief Supreme Sneak "Stealth Attack" and Scion "Terrify").
 * `cost` is the number of Sneak Attack dice forgone; `save` (when set) is the
 * ability the TARGET rolls against — the consumer resolves the concrete DC.
 */
export interface CunningStrikeOption {
  sourceId: string;
  optionId: string;
  name: LocText;
  cost: number;
  description: LocText;
  save?: AbilityCode;
  condition?: ConditionId;
}

/** A conditional advantage/disadvantage clause. */
export interface AdvantageClause {
  sourceId: string;
  rollType: "save" | "check" | "attack" | "initiative";
  vs: string;
  description: LocText;
  /**
   * FRONTIER-S3 — `true` when this clause applies only during combat ROUND 1
   * (Assassinate's first-round attack advantage). The turn/round consumer gates
   * it on `round === 1`; absent = a permanent clause.
   */
  round1?: boolean;
  /**
   * Carries the wrapping `while-active` toggle (when any — Rage's STR advantage,
   * Reckless Attack, Innate Sorcery) so the chip can mark itself as a
   * conditional, currently-active source ("· active"), exactly as
   * `weaponDamageBonuses.whileActiveKey` does. Absent = an unconditional clause.
   */
  whileActiveKey?: string;
}

/**
 * A resolved roll-floor (Rogue Reliable Talent): treat a d20 roll below `floor`
 * as `floor`, on `rollType` rolls gated by `appliesTo`. The consumer surfaces it
 * as a passive note (engine rolls no dice).
 */
export interface RollFloorClause {
  sourceId: string;
  rollType: "check" | "save" | "attack";
  floor: number;
  appliesTo: "proficient" | "all";
  description: LocText;
  /**
   * Carries the wrapping `while-active` toggle (when any — Circle of Stars
   * Starry Form, Clockwork Trance of Order) so the passive note can mark itself
   * as a conditional, currently-active source ("· active"), exactly as
   * `weaponDamageBonuses.whileActiveKey` does. Absent = an unconditional floor.
   */
  whileActiveKey?: string;
}

/**
 * A resolved SELF-side downside (Barbarian Reckless Attack): while in effect,
 * attack rolls AGAINST the character have Advantage. The consumer surfaces it as
 * a defensive note framed as a Disadv. — no enemy modeling, no dice.
 */
export interface IncomingAttackClause {
  sourceId: string;
  description: LocText;
  /**
   * Carries the wrapping `while-active` toggle (Reckless Attack) so the note can
   * mark itself "· active" — mirrors `RollFloorClause.whileActiveKey`. Absent =
   * an unconditional downside.
   */
  whileActiveKey?: string;
}

/**
 * A Temporary-HP grant resolved against its source. `formula` is the
 * unresolved tracker-formula string ("CHA+level", "PB", "level"); the consumer
 * (`smart-tracker`) resolves it to a concrete number and surfaces a manual
 * "Gain N temporary HP" entry. Override-first — never auto-applied.
 */
export interface TempHpEntry {
  sourceId: string;
  formula: string;
  trigger?: LocText;
  slot?: ActionType;
}

/**
 * A resolved aura/emanation (PRIM-aura/emanation). Carries the source id +
 * radius + who it affects + the structured effect; the presenter (`auraVMs`)
 * composes a readable note. Informational — no battlefield model.
 */
/**
 * Canonical runtime list of who an aura affects — source of truth for the
 * `character.auraAffects_<affects>` i18n keys. The {@link AuraAffects} union (used
 * on both the `"aura"` grant and {@link AuraClause}) is derived from this tuple, so
 * a new audience widens the type and the guard sees it (golden rule 6).
 */
export const AURA_AFFECTS = [
  "allies",
  "enemies",
  "allies-and-self",
  "all-in-range",
] as const;
export type AuraAffects = (typeof AURA_AFFECTS)[number];

export interface AuraClause {
  sourceId: string;
  auraId: string;
  radius: number | "variable";
  radiusByLevel?: Readonly<Record<number, number>>;
  affects: AuraAffects;
  effect: Extract<Grant, { type: "aura" }>["effect"];
  description?: LocText;
}

/**
 * A resolved spell-die-augment (PRIM-spell-die-augment). The consumer
 * (`resolveSpellDieAugment`) rewrites a spell's `damageDice` die size.
 */
export interface SpellDieAugmentEntry {
  spellId: string;
  fromDie: number;
  toDie: number;
}

/**
 * A resolved copy-to-2nd-target rider (PRIM-copy-to-2nd-target). Informational —
 * the presenter (`copyTargetVMs`) surfaces the bilingual `effect` on the feature.
 */
export interface CopyToTargetClause {
  sourceId: string;
  copyId: string;
  appliesToFeature?: string;
  effect: LocText;
}

/**
 * A resolved resource-conversion (PRIM-resource-conversion). The cost-engine
 * (`planResourceConversion`) plans the concrete spend/produce ops.
 */
export interface ResourceConversionEntry {
  sourceId: string;
  conversionId: string;
  produces: "spell-slot" | "pact-slot" | "sorcery-points";
  fromTracker?: string;
  toTracker?: string;
  perUnitSlotLevels?: number;
  costTable?: ReadonlyArray<{ slotLevel: number; cost: number; minLevel: number }>;
  maxSlotLevel?: number;
}

/** The normalised view a renderer/consumer reads. */
export interface AggregatedGrants {
  // Senses
  darkvisionFt: number;
  blindsightFt: number;
  tremorsenseFt: number;
  truesightFt: number;
  /**
   * "See Invisible" range in feet — see Invisible creatures within this range
   * that aren't behind Total Cover (Aberrant Sorcery Revelation in Flesh). 0
   * when not granted. Distinct from `truesightFt` (Truesight also pierces
   * illusions / shapechangers / the Ethereal Plane).
   */
  seeInvisibleFt: number;

  // Defensive
  /** Set of canonical 2024 damage types the character resists permanently. */
  damageResistances: ReadonlySet<DamageType>;
  damageImmunities: ReadonlySet<DamageType>;
  damageVulnerabilities: ReadonlySet<DamageType>;
  conditionImmunities: ReadonlySet<ConditionId>;
  /**
   * Damage SOURCES the character resists (Abjurer Spell Resistance → `"spell"`).
   * Orthogonal to `damageResistances` (which keys on `DamageType`): a source
   * resistance halves the damage no matter the element, so it lives in its own
   * set the defenses consumer renders alongside the element resistances.
   */
  damageSourceResistances: ReadonlySet<DamageSource>;
  /**
   * FLAT incoming-damage reductions (`flat-damage-reduction` — Heavy Armor
   * Master's −PB on Bludgeoning/Piercing/Slashing while in Heavy armor). Each
   * entry is a self-side informational defense line (the engine does no damage
   * math); the consumer (`deriveFlatDamageReductions`) resolves the `"PB"`
   * sentinel + the wearing-state gate before display. Merge: `[list]`.
   */
  flatDamageReductions: ReadonlyArray<{
    damageTypes: ReadonlyArray<DamageType>;
    amount: number | "PB";
    condition?: "wearing-heavy-armor";
    sourceId: string;
  }>;

  // Movement
  /** Additive walking-speed bonus (post-armor, pre-exhaustion). */
  speedBonusFt: number;
  /**
   * Conditional walking-speed bonuses keyed by wearing-state gate (currently
   * only `"no-heavy-armor"` → Ranger Roving). The consumer
   * (`effectiveWalkingSpeedFt`) adds the matching bucket only when its gate
   * holds. Empty when no gated grant applies.
   */
  conditionalSpeedBonusFt: Readonly<Partial<Record<"no-heavy-armor", number>>>;
  /**
   * Walking-speed bonus that applies ONLY on the character's first combat turn
   * (Gloom Stalker Dread Ambusher's Ambusher's Leap → +10 ft). The SPEED
   * counterpart of the `advantage-on { round1 }` gate: the consumer
   * (`effectiveWalkingSpeedFt`) adds it only when passed `round === 1`, then it
   * auto-clears from round 2+. Summed across `round1`-flagged `speed` grants; 0
   * when none apply.
   */
  round1SpeedBonusFt: number;
  /**
   * Round-1 save-gated damage-DOUBLER notes (Assassin Death Strike). One entry per
   * source; the consumer resolves the DC via `featureSaveDc` and the UI shows it
   * only in combat round 1. DISPLAY-ONLY — the engine never doubles anything.
   */
  round1DamageDoubles: ReadonlyArray<{
    sourceId: string;
    saveAbility: AbilityCode;
    saveDcAbility: AbilityCode;
  }>;
  /** `null` if no non-walking speed is granted; otherwise the max value seen. */
  flySpeed: NonWalkingSpeed | null;
  swimSpeed: NonWalkingSpeed | null;
  climbSpeed: NonWalkingSpeed | null;
  /**
   * Multiplier applied to the effective walking Speed (Boots of Speed → 2).
   * Default 1 (no multiplier). MAX across `speed-multiplier` grants — multipliers
   * never stack in RAW. The consumer (`effectiveWalkingSpeedFt`) multiplies
   * `(base + speedBonusFt)` by this BEFORE subtracting flat exhaustion / armor
   * penalties.
   */
  speedMultiplier: number;
  /**
   * Walking-Speed FLOOR in feet (Boots of Striding and Springing → 30). Default
   * 0 (no floor). MAX across `speed-floor` grants — floors never stack. The
   * consumer (`effectiveWalkingSpeedFt`) applies it LAST, raising the effective
   * walking Speed to at least this value ("Speed becomes N unless higher").
   */
  speedFloorFt: number;

  // Derived stats
  /** Sum of AC bonuses from items / class features. */
  acBonus: number;
  /** Every Unarmored-Defense-style AC formula candidate. */
  acFormulas: ReadonlyArray<AcFormula>;
  /**
   * Raised Medium-armor DEX-to-AC cap (Medium Armor Master → 3 when DEX 16+).
   * `null` when no source overrides it (the RAW default of 2 applies). `cap` is
   * the new ceiling; `minDex` is the DEX SCORE required for it to apply (16 for
   * Medium Armor Master). MAX `cap` wins across grants. `computeAC` reads this
   * and substitutes `cap` for the hard-coded 2 only when the character's DEX
   * score is at least `minDex`.
   */
  mediumArmorDexCap: { cap: number; minDex: number } | null;
  /** HP bonus per character level (Tough = 2, Dwarven Toughness = 1, …). */
  hpPerLevel: number;
  /**
   * Ability-modifier AC bonuses (Bladesong: +INT mod, min 1). Feature-only —
   * the consumer (`effectiveAC`) adds `max(abilityModifier(ability), min)` per
   * entry. Kept separate from the flat `acBonus` so it can't double-count the
   * item-AC pass in `computeAC`.
   */
  acBonusAbilities: ReadonlyArray<{ ability: AbilityCode; min: number }>;
  /** One-shot flat HP bonus (Boon of Fortitude, Draconic Resilience). */
  hpFlat: number;
  /**
   * The per-source attribution of {@link hpFlat} — ONE entry per `hp-flat` grant,
   * stamped with its SOURCE catalogue `ref` (the feat/feature/item/spell `{kind,
   * key}`, an ID — never a display string, golden rule 7) and signed `amount`.
   * Pushed at the SAME seam `hpFlat` accumulates, so it INHERITS the identical
   * recursion + `while-active` descent: a standing Aid (`hp-flat:5` inside a
   * `while-active` block) appears here iff its toggle lifts `hpFlat`. The Max-HP
   * breakdown tip MAPS these (localizing each `ref` → its source name at the view
   * edge) instead of re-walking the grant sources top-level only, so the tip rows
   * sum to EXACTLY `hpFlat` by construction (`sum(amount) === hpFlat`).
   */
  hpFlatParts: ReadonlyArray<{ ref: { kind: SrdKind; key: string }; amount: number }>;
  /** Lowest natural d20 that crits on a weapon attack (default 20; min wins). */
  critThreshold: number;
  /**
   * Lowest natural d20 that a DEATH SAVING THROW counts as a 20 (Champion
   * Survivor "Defy Death", default 20; min wins). Distinct from `critThreshold`
   * (weapon attacks). Consumed by `deathSaveOutcome(roll, deathSaveCritThreshold)`.
   */
  deathSaveCritThreshold: number;
  /**
   * Start-of-turn HP-regain riders (Champion Survivor Heroic Rally). One entry
   * per source; the consumer (`resolveStartOfTurnRegen`) resolves the amount +
   * guard. `requiresMinHp` defaults to `true`.
   */
  startOfTurnRegen: ReadonlyArray<{
    sourceId: string;
    amount: string;
    condition: "bloodied" | "always";
    requiresMinHp: boolean;
    /** Redirect the amount to TEMPORARY HP (Heroism), not healing. Default false. */
    asTempHp: boolean;
  }>;
  /**
   * Critical-hit movement riders (Champion Remarkable Athlete). One entry per
   * source; the consumer (`resolveOnCritMovement`) resolves the distance.
   */
  onCritMovement: ReadonlyArray<{
    sourceId: string;
    fraction: "half" | "full";
    ignoresOpportunityAttacks: boolean;
  }>;
  /**
   * Replace-attack-with-cast riders (Eldritch Knight War Magic / Improved War
   * Magic). One entry per source; the consumer (`resolveReplaceAttackWithCast`)
   * caps `attacks` at the character's `attacksPerAction`.
   */
  replaceAttackWithCast: ReadonlyArray<{
    sourceId: string;
    attacks: number;
    classSpellList: string;
    minSpellLevel: number;
    maxSpellLevel: number;
    castTime: "action";
  }>;
  /**
   * General Unarmed-Strike damage upgrades (Monk Martial Arts, College of Dance
   * Bardic Damage). The consumer (`effectiveUnarmedStrike`) picks the best die.
   */
  unarmedStrikeDice: ReadonlyArray<{
    die: string;
    attackAbility?: AbilityCode;
    damageAbility?: AbilityCode;
    damageType: DamageType;
    /**
     * Source-feature id (provenance) — the consumer resolves a deferred
     * `"classSpecific:<key>"` die against THIS feature's OWNING class at the
     * character's level IN that class (Monk Martial Arts → Monk level), never the
     * primary class read at the total character level (multiclass-correct).
     */
    sourceId: string;
  }>;
  /**
   * Melee weapon reach extensions (Barbarian World Tree Battering Roots). The
   * attack-row consumer widens the reach + surfaces the extra masteries for
   * weapons matching `appliesTo`.
   */
  weaponReachBonuses: ReadonlyArray<{
    bonusFt: number;
    appliesTo: "heavy-or-versatile" | "all-melee";
    extraMasteries: ReadonlyArray<string>;
  }>;
  /**
   * Spell-slot → tracker-use conversions (Bard Font of Inspiration). One entry
   * per source; the consumer (`getSpellSlotTrackerRecovery`) resolves available
   * slot levels + post-recovery used counts.
   */
  spellSlotTrackerRecoveries: ReadonlyArray<{
    trackerId: string;
    usesPerSlot: number;
    sourceId: string;
  }>;
  /**
   * Initiative-trigger tracker top-ups (Bard Superior Inspiration). One entry
   * per source; the consumer (`getInitiativeTrackerTopUps`) resolves the
   * per-tracker floor.
   */
  initiativeTrackerTopUps: ReadonlyArray<{
    trackerId: string;
    upTo: number;
    sourceId: string;
  }>;
  /**
   * At-0-HP interrupts ("drop to 1 instead": Relentless Endurance / Undying
   * Sentinel / Boon of Misty Escape). One entry per granting source, carrying
   * the 1/rest `trackerId` it debits. Consumed by `resolveAtZeroHpInterrupts`,
   * which offers the prompt only when the tracker has an unspent use.
   */
  atZeroHpInterrupts: ReadonlyArray<{ trackerId: string; sourceId: string }>;
  /**
   * Number of EXTRA weapon attacks granted with a single Attack action (the
   * "Extra Attack" feature). 0 when no source grants it. MAX across `extra-attack`
   * grants — Extra Attack features never stack (multiclass), and Devouring Blade
   * UPGRADES Thirsting Blade. Total attacks = `1 + max(extraAttacks, classTable
   * extraAttacks)`; the `attacksPerAction` consumer resolves that.
   */
  extraAttacks: number;
  /**
   * `true` when a source lets the character give themself Heroic Inspiration at
   * the start of each combat turn if they lack it (Champion Heroic Warrior,
   * L10). STATE remains the existing `SessionState.inspiration` boolean — this
   * is only a marker for the (UI-owned) renderer to show the affordance. OR.
   */
  heroicInspirationAtTurnStart: boolean;
  /**
   * `true` when a source grants Heroic Inspiration on finishing a Long Rest
   * (Human Resourceful). STATE remains the existing `SessionState.inspiration`
   * boolean — this is the aggregate the Long Rest consumer reads to auto-grant
   * Inspiration. Merge: OR. See `gainsHeroicInspirationOnLongRest`.
   */
  heroicInspirationOnLongRest: boolean;
  /** Attunement-slot cap (default 3; Artificer raises it — max wins). */
  attunementSlots: number;
  /** Extra Exhaustion levels removed on a Long Rest beyond the default 1 (sum). */
  exhaustionRecoveryBonus: number;
  /**
   * Exhaustion levels removed on a SHORT Rest (Ranger Tireless → 1). A genuine
   * extra channel (RAW removes none on a Short Rest), kept separate from the
   * long-rest bonus. Sum; 0 by default. Consumed by `getShortRestExhaustionRecovery`.
   */
  exhaustionRecoveryShortRest: number;
  /**
   * Ability-score FLOORS from active sources (Amulet of Health → CON 19, …).
   * Max value per ability; abilities with no floor are absent. The consumer
   * takes `max(baseScore, floor)` — see `effectiveAbilityScores`.
   */
  abilityScoreFloors: Readonly<Partial<Record<AbilityCode, number>>>;
  /**
   * ADDITIVE ability-score bonuses from MAGIC-ITEM sources ONLY (Belt of
   * Dwarvenkind +2 CON, the +2 Ioun stones, …), summed per ability and CLAMPED
   * to each grant's `cap` (RAW "to a maximum of 20"). This is the LIVE render
   * channel: `effectiveAbilityScores(base, floors, itemAbilityScoreBonus)` adds
   * it AFTER the floor, so every combat/cast/display surface agrees (rule 6).
   *
   * Source-kind filtered to `magic-item` BY CONSTRUCTION: feat/class/race/
   * background additive ASIs are BAKED into the stored `character.abilityScores`
   * at creation/level-up (`applyFeatAsi`) and would double-count if re-added —
   * they can NEVER enter this channel because they never carry a magic-item
   * `gref.kind`. Equip/attune-gated via the L2 equipment grant seam.
   */
  itemAbilityScoreBonus: Readonly<Record<AbilityCode, number>>;
  /**
   * The resulting-SCORE ceiling per ability for {@link itemAbilityScoreBonus}
   * (RAW "to a maximum of 20" — Belt of Dwarvenkind/Ioun stones cap at 20). The
   * TIGHTEST cap among contributing item grants; absent ⇒ that ability is
   * uncapped. `effectiveAbilityScores` clamps `base + bonus` to this AFTER
   * adding the bonus (so a base CON already at/over the cap gains nothing).
   */
  itemAbilityScoreCap: Readonly<Partial<Record<AbilityCode, number>>>;
  /** Bumps to the spell save DC per scope. */
  spellSaveDcBonus: ReadonlyArray<CastingModifierEntry>;
  /** Bumps to the spell attack bonus per scope. */
  spellAttackBonus: ReadonlyArray<CastingModifierEntry>;
  /**
   * Ability-modifier-based bonuses applied to ALL saving throws — each
   * contributes `max(abilityModifier(ability), min)` (the consumer resolves
   * the modifier). Paladin Aura of Protection: `{ ability: "CHA", min: 1 }`.
   */
  saveBonusAbilities: ReadonlyArray<{ ability: AbilityCode; min: number }>;
  /** Flat numeric bonus applied to ALL saving throws (sum of flat grants). */
  saveBonusFlat: number;
  /**
   * Per-ability-SCOPED save bonuses — each rides ONLY the save whose ability
   * equals `appliesToSave` (Circle of the Moon "Increased Toughness" → +WIS mod
   * to CON saves only). Kept OUT of the all-saves lists so it never leaks onto
   * unrelated saves. The consumer (`resolveSaveBonus`) folds in the entries
   * matching the requested save: an `ability` entry contributes
   * `max(abilityModifier(ability), min)`, otherwise its flat `amount`.
   */
  saveBonusByAbility: ReadonlyArray<{
    appliesToSave: AbilityCode;
    ability?: AbilityCode;
    min: number;
    amount: number;
  }>;
  /**
   * Ability-modifier-based bonuses applied ONLY to a Constitution saving throw
   * made to MAINTAIN CONCENTRATION (Bladesinger Bladesong "Focus" → +INT mod).
   * Each contributes `max(abilityModifier(ability), min)`; resolved by the
   * consumer (`resolveConcentrationSaveBonus`). Kept separate from
   * `saveBonusAbilities` so it never rides unrelated CON saves.
   */
  concentrationSaveBonusAbilities: ReadonlyArray<{ ability: AbilityCode; min: number }>;
  /**
   * Flat numeric bonus applied ONLY to the Constitution saving throw made to
   * maintain Concentration (sum of flat `concentration-save-bonus` grants).
   */
  concentrationSaveBonusFlat: number;
  /**
   * Scoped ability-check bonuses. Each entry rides a `appliesTo` scope (a skill
   * id, `"<ABILITY>-checks"`, or `"all-checks"`); `value` is `"modifier"` (add
   * `ability`'s modifier, floored at `min`) or a flat number. The Skills
   * consumer (`skillBonus` + `resolveAbilityCheckBonus`) resolves and sums the
   * matching entries per skill. Fey Wanderer's Otherworldly Glamour:
   * `{ appliesTo: "CHA-checks", ability: "WIS", value: "modifier", min: 1 }`.
   */
  abilityCheckBonuses: ReadonlyArray<{
    appliesTo: string;
    ability?: AbilityCode;
    value: "modifier" | number;
    min: number;
  }>;
  /** Ability modifiers added to Initiative (consumer resolves each). */
  initiativeBonusAbilities: ReadonlyArray<AbilityCode>;
  /** Flat numeric bonus added to Initiative. */
  initiativeBonusFlat: number;
  /**
   * Self-contained extra-damage riders on weapon attacks (Radiant Strikes, …).
   * `dice` is the fixed / L1 value; `diceByLevel`, when present, is the
   * level-keyed scaling map (Berserker Frenzy) the consumer resolves at the
   * character's level.
   */
  damageRiders: ReadonlyArray<{
    dice?: string;
    diceByLevel?: Readonly<Record<number, string>>;
    /** Flat PB extra-damage sentinel (a species revelation form) — the consumer
     *  resolves it to a `+N` flat amount; mutually exclusive with `dice`. */
    amount?: "PB";
    /** Marks a per-hit "vs a specific marked/cursed creature" rider (Hunter's
     *  Mark / Hex) — the consumer surfaces it as a DISPLAY-ONLY chip labeled "vs
     *  marked / cursed target" (never auto-summed); the token drives the localized
     *  label at the render edge. Absent → an always-applies rider. */
    vsMarkedTarget?: "marked" | "cursed";
    damageType: DamageType | "same-as-weapon";
    appliesTo: "melee-weapon" | "weapon" | "one-handed-melee" | "attack-or-spell";
    oncePerTurn: boolean;
    addAbilityMod?: AbilityCode;
    resourceCost?: { trackerId: string };
    /**
     * Source-feature id (provenance) — the consumer resolves a `diceByLevel`
     * scaling threshold against THIS feature's OWNING class at the character's
     * level IN that class (Ranger Colossus Slayer → Ranger level 11), never the
     * total character level (multiclass-correct). Absent for non-class sources
     * (the consumer then falls back to total level).
     */
    sourceId?: string;
    /**
     * Carries the wrapping `while-active` toggle (when any — Barbarian Rage's
     * Brutal Strike, Divine Favor) so the rider chip can mark itself as a
     * conditional, currently-active source ("· active"), exactly as
     * `weaponDamageBonuses.whileActiveKey` does. Absent = an unconditional rider.
     */
    whileActiveKey?: string;
  }>;
  /**
   * Flat bonuses added to the DAMAGE roll of scope-matching weapon attacks
   * (`weapon-damage-bonus` — Barbarian Rage Damage). The consumer
   * (`resolveWeaponDamageBonuses` in smart-tracker) resolves a `sourceKey`
   * against the source feature's OWNING class table at the character's level in
   * that class, and folds the sum into the weapon's damage modifier.
   * `whileActiveKey` carries the wrapping `while-active` toggle (when any) so
   * the damage breakdown can mark the bonus as a conditional, currently-active
   * source ("+2 Rage · active").
   */
  weaponDamageBonuses: ReadonlyArray<{
    amount?: number | "PB";
    sourceKey?: string;
    scope: "any" | "ranged" | "melee" | "strength" | "heavy";
    sourceId: string;
    whileActiveKey?: string;
  }>;
  /**
   * Static bonuses addable to one damage roll of a qualifying spell (Draconic
   * Sorcery Elemental Affinity → +CHA mod on a spell that deals the chosen
   * draconic damage type). Each entry rides a `damageTypes` trigger set (empty =
   * any damaging spell) and a casting-class `scope`. The consumer
   * (`resolveSpellDamageBonus`) resolves the modifier per spell at render.
   */
  spellDamageBonuses: ReadonlyArray<SpellDamageBonusEntry>;
  /**
   * Bonuses added to the Hit Points a HEALING SPELL restores (Cleric Disciple of
   * Life: +2 + spell level). The consumer (`resolveHealBonus`) resolves the
   * amount per cast at render and appends it to the heal verdict.
   */
  healBonuses: ReadonlyArray<HealBonusEntry>;
  /**
   * Alternate damage types a damaging spell may deal at the player's choice
   * (Great Old One Psychic Spells → Psychic). The consumer
   * (`resolveSpellDamageTypeOverrides`) returns every in-scope alternate type;
   * the smart-tracker folds them into the spell's damage-type choice chip.
   */
  spellDamageTypeOverrides: ReadonlyArray<SpellDamageTypeOverrideEntry>;
  /**
   * Alternate damage types the character's Unarmed Strike may deal at the player's
   * choice (Monk Empowered Strikes → Force). The smart-tracker folds these into
   * the Unarmed Strike row's damage-type choice chip.
   */
  unarmedStrikeDamageTypeOptions: ReadonlyArray<DamageType>;
  /**
   * Component waivers (Great Old One Psychic Spells: cast Enchantment/Illusion
   * Warlock spells without V/S). The consumer (`resolveComponentWaiver`) returns
   * the components a given spell may drop; the smart-tracker marks them.
   */
  componentWaivers: ReadonlyArray<ComponentWaiverEntry>;
  /**
   * Static bonuses targeted at ONE specific cantrip by SRD id (Warlock's
   * Agonizing Blast → +CHA mod to the chosen damaging cantrip's damage rolls).
   * Repeatable — one entry per chosen cantrip. The consumer
   * (`resolveCantripDamageBonus`) resolves the modifier per cantrip at render,
   * matching on `spellId`. Distinct from `spellDamageBonuses`, which is
   * damage-type keyed (any qualifying spell) rather than a single named cantrip.
   */
  cantripDamageBonuses: ReadonlyArray<CantripDamageBonusEntry>;
  /**
   * Non-damage on-hit effect riders targeted at ONE specific cantrip by SRD id
   * (Warlock's Repelling Blast → push a Large-or-smaller creature up to 10 ft
   * on a hit with the chosen attack-roll cantrip). Repeatable — one entry per
   * chosen cantrip. The consumer (`resolveCantripForcedMovement`) returns the
   * matching forced-movement rider per cantrip at render, keyed on `spellId`.
   * Sibling of `cantripDamageBonuses`, for effects that aren't numeric damage.
   */
  cantripEffectRiders: ReadonlyArray<CantripEffectRiderEntry>;
  /**
   * Per-level range bonuses targeted at ONE specific cantrip by SRD id (Warlock's
   * Eldritch Spear → +30 ft × Warlock level to the chosen damaging cantrip's
   * range). Repeatable — one entry per chosen cantrip. The consumer
   * (`resolveCantripRangeBonus`) multiplies `bonusPerLevel` by the supplied class
   * level and sums per cantrip at render, matching on `spellId`. Sibling of
   * `cantripEffectRiders`, for the range clause rather than forced movement.
   */
  cantripRangeBonuses: ReadonlyArray<CantripRangeBonusEntry>;
  /**
   * Feature-GRANTED weapon-attack cantrips (`weapon-attack-cantrip`) — known
   * cantrips (True Strike) whose effect is a spellcasting-ability weapon attack
   * with a Radiant/weapon damage-type choice + level-scaled extra Radiant.
   * Deduped by `spellId` (first source wins). The smart-tracker action-summary
   * consumer reads these (and the `weaponAttackCantrip` field on the SRD spell
   * data of cantrips the character knows normally) so the combat card surfaces
   * the spellcasting-ability attack bonus, the damage-type options, and the
   * scaled extra damage instead of a stale melee spell attack.
   */
  weaponAttackCantrips: ReadonlyArray<WeaponAttackCantripEntry>;

  // Proficiencies / expertise / languages / tools
  saveProficiencies: ReadonlySet<AbilityCode>;
  skillProficiencies: ReadonlySet<string>;
  expertiseSkills: ReadonlySet<string>;
  /**
   * Jack-of-all-Trades — true when some source grants half-proficiency in every
   * otherwise-unproficient skill (Bard L2). The skill consumer fills the half
   * at render; it is NEVER baked into stored `skills` (#57). Merge: OR.
   */
  halfProficiencyAllSkills: boolean;
  languages: ReadonlySet<string>;
  toolProficiencies: ReadonlySet<string>;
  /** Feature-granted weapon proficiencies as {@link ProficiencyToken} ids
   *  (category `martial-weapons`, group `longswords`, or `pact-weapon`). */
  weaponProficiencies: ReadonlySet<ProficiencyToken>;
  /** Feature-granted armor/shield proficiencies as {@link ProficiencyToken} ids. */
  armorProficiencies: ReadonlySet<ProficiencyToken>;
  /**
   * Abilities usable for weapon attack/damage rolls in place of STR/DEX
   * (Bladesong → INT; Battle Smith → INT for magic weapons). The attack-row
   * resolver uses the best applicable ability.
   */
  weaponAttackAbilities: ReadonlyArray<{
    ability: AbilityCode;
    magicOnly: boolean;
    weaponScope?: "monk-melee";
    /** Monk Martial Arts die upgrade for the scoped weapons (replaces the printed
     *  die when larger) — a fixed/deferred die; `sourceId` resolves the deferred
     *  `classSpecific:<key>` against the owning class+level. */
    dieUpgrade?: string;
    sourceId?: string;
  }>;
  /**
   * Flat to-hit bonuses on weapon attack rolls, scoped ranged / melee / any
   * (Archery fighting style → `{ amount: 2, scope: "ranged" }`). The attack-row
   * consumer sums the `amount`s of the entries whose `scope` applies to the
   * weapon being resolved and adds the total to the computed attack bonus.
   * Override-first (skipped when a per-weapon `attackBonusOverride` is pinned).
   */
  weaponAttackBonuses: ReadonlyArray<WeaponAttackBonusEntry>;
  /**
   * Manipulations of a weapon's OWN damage dice (Great Weapon Fighting floor,
   * Savage Attacker reroll-keep-higher, Two-Weapon Fighting off-hand modifier,
   * Unarmed Fighting Unarmed Strike). Each entry rides a scoped `appliesTo`; the
   * attack-row consumer reads it and applies the relevant `mode` to the matching
   * weapon rows (an annotation, an off-hand damage-formula change, or an emitted
   * Unarmed Strike row). The engine never rolls dice. Override-first.
   */
  damageDieModifiers: ReadonlyArray<DamageDieModifierEntry>;

  // Spell grants
  /** Always-prepared spell IDs (Domain spells, Magic Initiate, …). */
  alwaysPrepared: ReadonlyArray<string>;
  /** Per-spell ritual access (not the class-wide "any ritual" — see below). */
  ritualSpells: ReadonlySet<string>;
  /** Class lists from which any prepared/known ritual spell is castable. */
  ritualAnyClasses: ReadonlySet<ClassId>;
  /** Per-rest free-casts of specific spells. */
  freeCasts: ReadonlyArray<FreeCastEntry>;
  /**
   * D4 — Per-rest free-casts FROM A LIST (a guided picker over a class spell list
   * ≤ a level cap): Cleric Divine Intervention. The spell is the player's choice
   * at cast time, gated by `spellList` ≤ `maxSpellLevel`; the cast debits the
   * source feature's per-rest tracker.
   */
  freeCastFromList: ReadonlyArray<FreeCastFromListEntry>;
  /**
   * At-will (unbounded, slotless) self-casts of specific spells (Warlock's
   * at-will Eldritch Invocations). Deduped by `spellId` (first source wins).
   * The cast-options consumer surfaces each as an at-will row at the spell's
   * base level — no tracker, no per-rest cap.
   */
  atWillCasts: ReadonlyArray<AtWillCastEntry>;
  /**
   * Bonus, upcast-capable spell slots restricted to a scoped spell pool and
   * recovered on a Short/Long Rest (a heritage feat's bonus
   * Spellcasting). Each entry carries the declarative level formula + scope +
   * recovery; the cast-option consumer (`scopedSlotSourcesForSpell`) resolves
   * the live slot level and eligible spells, and the smart-tracker creates the
   * 1-use expend/regain tracker. Collected as a list (one per granting source).
   */
  scopedExtraSlots: ReadonlyArray<ScopedExtraSlotEntry>;

  // Conditional advantage/disadvantage chips
  advantages: ReadonlyArray<AdvantageClause>;
  disadvantages: ReadonlyArray<AdvantageClause>;
  /** Roll floors (Rogue Reliable Talent): treat a d20 below `floor` as `floor`. */
  rollFloors: ReadonlyArray<RollFloorClause>;
  /**
   * SELF-side downsides (Barbarian Reckless Attack): while in effect, attack
   * rolls AGAINST the character have Advantage. Rendered as a defensive Disadv.
   * note — a reminder, not enemy modeling.
   */
  incomingAttackAdvantages: ReadonlyArray<IncomingAttackClause>;
  /**
   * SELF-side BENEFITS (Blur): while in effect, attack rolls AGAINST the
   * character have Disadvantage. Rendered as a defensive Advantage note — a
   * reminder, not enemy modeling. The mirror of `incomingAttackAdvantages`.
   */
  incomingAttackDisadvantages: ReadonlyArray<IncomingAttackClause>;
  /**
   * SELF-side defensive reminder LINES (Warding Bond's shared-damage / resistance
   * posture). Bilingual prose surfaced in the rail's Defenses section — a
   * reminder, never damage math (golden rule 21).
   */
  defenseNotes: ReadonlyArray<IncomingAttackClause>;

  // ── PRIM batch (2026-06-10) ──────────────────────────────────────────────
  /**
   * PRIM-aura/emanation — persistent radius effects (Wrath of the Sea, Starry
   * Form constellations, Smite of Protection, Rod of Alertness). Informational:
   * the presenter (`auraVMs`) renders a readable rider per entry.
   */
  auras: ReadonlyArray<AuraClause>;
  /**
   * PRIM-spell-die-augment — per-spell damage-die upgrades (Foe Slayer:
   * Hunter's Mark d6→d10). The consumer (`resolveSpellDieAugment`) re-sizes the
   * matching spell's `damageDice`.
   */
  spellDieAugments: ReadonlyArray<SpellDieAugmentEntry>;
  /**
   * PRIM-copy-to-2nd-target — riders that duplicate an effect onto a second
   * creature (some heritage feats, Bewitching Magic). Informational notes.
   */
  copyToTargets: ReadonlyArray<CopyToTargetClause>;
  /**
   * PRIM-resource-conversion — converters that PRODUCE a resource from another
   * (Nature Magician, Font of Magic). The cost-engine plans the ops; the
   * action consumer surfaces the affordance.
   *
   * NOTE: PRIM-item-bound-bonus has NO aggregate field of its own — its `ac` /
   * `saves` / `spell-attack-and-save-dc` bonuses fold into the existing
   * `acBonus` / `saveBonusFlat` / `spellSaveDcBonus`+`spellAttackBonus`
   * accumulators (single source of truth), and its `weapon-attack-and-damage`
   * bonus is read at the weapon layer (`resolveItemBoundWeaponBonus`).
   */
  resourceConversions: ReadonlyArray<ResourceConversionEntry>;

  /**
   * L11 — every `while-active` toggle seen, with its current active state.
   * The UI renders a toggle per group; when `active`, that group's inner
   * grants have already been merged into the fields above.
   */
  activatableGroups: ReadonlyArray<ActivatableGroup>;

  /**
   * L12 — single-select variant choosers (`choice-grant-bundle`). The UI
   * renders a selector per entry; the selected option's grants have already
   * been merged into the fields above.
   */
  grantBundles: ReadonlyArray<GrantBundle>;

  /**
   * **Choice-resistance** slots (`choice-resistance`). The UI renders a
   * multi-select per entry; the current `selected` picks have already been
   * merged into `damageResistances` above (so the defenses consumer needs no
   * extra wiring). Re-selectable — Boon of Energy Resistance re-chooses each
   * Long Rest.
   */
  choiceResistances: ReadonlyArray<ChoiceResistance>;

  /**
   * ARCHITECTURE.md combat model — feat/feature/invocation-granted actions for the
   * Combat page (Shield reaction, at-will invocations, …).
   */
  grantedActions: ReadonlyArray<GrantedAction>;

  /**
   * Weapons a feature manifests (Soulknife Psychic Blades). Each becomes one
   * (or two — main + bonus-action second blade) attack rows on the Combat page
   * via `resolveManifestedWeaponAttacks`; their to-hit/damage is computed from
   * the character's scores like a carried weapon. Distinct from a carried
   * `SrdWeaponRef`/`CustomWeapon` (not in `character.weapons`) and from a
   * generic `grantedAction` (these have a full weapon stat profile).
   */
  manifestedWeapons: ReadonlyArray<ManifestedWeapon>;

  /**
   * Form-swap natural-weapon attack rows from the character's ACTIVE
   * transformation forms (Druid Wild Shape beast bite, Stars Druid Starry Form
   * attack, Artificer Armorer Thunder Pulse / Lightning Launcher). ONLY the
   * rows from currently-lit forms are present (the evaluator collects them
   * inside the active `while-active` branch), so this array empties the moment
   * every form is toggled off. Each becomes one attack row via
   * `resolveFormAttacks`; its to-hit/damage is computed from the character's
   * scores like a carried weapon. Override-first via
   * `session.manifestedWeaponOverrides` (the shared session weapon-swap store).
   */
  formAttacks: ReadonlyArray<FormAttack>;

  /**
   * Conjured pact weapons (Warlock Pact of the Blade). Each becomes one
   * configurable conjured-weapon attack row via `resolvePactWeaponAttacks` —
   * attack + damage use the declared `attackAbility` (CHA), and the player
   * picks the weapon form / damage type override-first from `pactWeaponConfig`.
   * Distinct from a `manifestedWeapon` (fixed profile) and a carried weapon.
   */
  pactWeapons: ReadonlyArray<PactWeapon>;

  /**
   * On-hit riders that fire ONLY with a conjured pact weapon (Pact-of-the-Blade
   * invocations: Eldritch Smite, Lifedrinker). Distinct from `damageRiders`,
   * which ride every weapon attack. The consumer (`resolvePactWeaponAttacks`)
   * scales slot-cost riders by the warlock's pact-slot level and attaches them
   * to the pact-weapon attack row. Deduped by `id` (first source wins).
   */
  pactWeaponRiders: ReadonlyArray<PactWeaponRider>;

  /**
   * Familiar-enhancement bundles (`familiar-enhancement`) — buffs a feature
   * layers on a summoned familiar (Warlock Investment of the Chain Master).
   * Deduped by source id (first source wins). The consumer
   * (`resolveFamiliarEnhancements`) merges the deltas across sources and stamps
   * the owner's spell save DC; distinct from `companion`-backed stat blocks
   * (Steel Defender / Beast Master), whose form is feature-declared.
   */
  familiarEnhancements: ReadonlyArray<FamiliarEnhancement>;

  /**
   * Rogue Cunning Strike catalogue — every option an effective character knows
   * (base L5, Devious Strikes L14, plus subclass adders). Deduped by `optionId`
   * (first source wins). The consumer (`resolveCunningStrikeOptions`) resolves
   * the save DC against the character.
   */
  cunningStrikeOptions: ReadonlyArray<CunningStrikeOption>;

  /**
   * Temporary-HP grants (Dark One's Blessing, Adrenaline Rush, Defensive
   * Field, …). Each carries the unresolved `formula` + originating source; the
   * consumer resolves it and surfaces a manual "Gain N temporary HP" entry.
   * Override-first — the engine never auto-applies temp HP.
   */
  tempHpGrants: ReadonlyArray<TempHpEntry>;

  /**
   * Cross-feature alternate-recovery grants (`tracker-alt-recovery`). Each
   * entry overlays an alternate "spend N from a pool to restore a use" cost
   * onto another feature's tracker (Sorcery Incarnate → Innate Sorcery). The
   * smart-tracker consumer (`resolveTrackers`) applies the last matching entry
   * per `targetTracker` onto the resolved `ResolvedTracker.altRecoveryCost`.
   */
  trackerAltRecoveries: ReadonlyArray<TrackerAltRecoveryEntry>;

  /**
   * Pending player choices. The level-up wizard reads this list to know
   * which pickers to surface (ability ASI sub-picker, skill picker, etc.).
   */
  pendingChoices: ReadonlyArray<PendingChoice>;
}

/**
 * An aggregated `tracker-alt-recovery` grant: an alternate cost to restore a
 * use of `targetTracker` by spending `amount` units from `fromTracker`.
 */
export interface TrackerAltRecoveryEntry {
  targetTracker: string;
  amount: number;
  fromTracker: string;
}

/**
 * An aggregated `weapon-attack-cantrip` grant — a feature-granted known cantrip
 * (True Strike) that resolves to a spellcasting-ability weapon attack with a
 * Radiant/weapon damage-type choice + level-scaled extra Radiant. The consumer
 * (`resolveWeaponAttackCantrip`) reads the same shape whether it comes from this
 * aggregate or from the SRD spell's `weaponAttackCantrip` field.
 */
export interface WeaponAttackCantripEntry {
  sourceId: string;
  spellId: string;
  useSpellcastingAbility: boolean;
  damageTypeChoice: DamageType;
  extraDamageByLevel: Readonly<Record<number, string>>;
  extraDamageType: DamageType;
}

/** Identity / empty aggregate — useful for the no-grants base case. */
export function emptyAggregate(): AggregatedGrants {
  return {
    darkvisionFt: 0,
    blindsightFt: 0,
    tremorsenseFt: 0,
    truesightFt: 0,
    seeInvisibleFt: 0,
    damageResistances: new Set(),
    damageImmunities: new Set(),
    damageVulnerabilities: new Set(),
    conditionImmunities: new Set(),
    damageSourceResistances: new Set(),
    flatDamageReductions: [],
    speedBonusFt: 0,
    conditionalSpeedBonusFt: {},
    round1SpeedBonusFt: 0,
    round1DamageDoubles: [],
    flySpeed: null,
    swimSpeed: null,
    climbSpeed: null,
    speedMultiplier: 1,
    speedFloorFt: 0,
    acBonus: 0,
    acBonusAbilities: [],
    acFormulas: [],
    mediumArmorDexCap: null,
    hpPerLevel: 0,
    hpFlat: 0,
    hpFlatParts: [],
    critThreshold: 20,
    deathSaveCritThreshold: 20,
    startOfTurnRegen: [],
    onCritMovement: [],
    replaceAttackWithCast: [],
    unarmedStrikeDice: [],
    weaponReachBonuses: [],
    spellSlotTrackerRecoveries: [],
    initiativeTrackerTopUps: [],
    atZeroHpInterrupts: [],
    extraAttacks: 0,
    heroicInspirationAtTurnStart: false,
    heroicInspirationOnLongRest: false,
    attunementSlots: 3,
    exhaustionRecoveryBonus: 0,
    exhaustionRecoveryShortRest: 0,
    abilityScoreFloors: {},
    itemAbilityScoreBonus: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 },
    itemAbilityScoreCap: {},
    spellSaveDcBonus: [],
    spellAttackBonus: [],
    saveBonusAbilities: [],
    saveBonusFlat: 0,
    saveBonusByAbility: [],
    concentrationSaveBonusAbilities: [],
    concentrationSaveBonusFlat: 0,
    abilityCheckBonuses: [],
    initiativeBonusAbilities: [],
    initiativeBonusFlat: 0,
    damageRiders: [],
    weaponDamageBonuses: [],
    spellDamageBonuses: [],
    healBonuses: [],
    spellDamageTypeOverrides: [],
    unarmedStrikeDamageTypeOptions: [],
    componentWaivers: [],
    cantripDamageBonuses: [],
    cantripEffectRiders: [],
    cantripRangeBonuses: [],
    weaponAttackCantrips: [],
    saveProficiencies: new Set(),
    skillProficiencies: new Set(),
    expertiseSkills: new Set(),
    halfProficiencyAllSkills: false,
    languages: new Set(),
    toolProficiencies: new Set(),
    weaponProficiencies: new Set(),
    armorProficiencies: new Set(),
    weaponAttackAbilities: [],
    weaponAttackBonuses: [],
    damageDieModifiers: [],
    alwaysPrepared: [],
    ritualSpells: new Set(),
    ritualAnyClasses: new Set(),
    freeCasts: [],
    freeCastFromList: [],
    atWillCasts: [],
    scopedExtraSlots: [],
    advantages: [],
    disadvantages: [],
    rollFloors: [],
    incomingAttackAdvantages: [],
    incomingAttackDisadvantages: [],
    defenseNotes: [],
    auras: [],
    spellDieAugments: [],
    copyToTargets: [],
    resourceConversions: [],
    activatableGroups: [],
    grantBundles: [],
    choiceResistances: [],
    grantedActions: [],
    manifestedWeapons: [],
    formAttacks: [],
    pactWeapons: [],
    pactWeaponRiders: [],
    familiarEnhancements: [],
    cunningStrikeOptions: [],
    tempHpGrants: [],
    trackerAltRecoveries: [],
    pendingChoices: [],
  };
}

/**
 * Merge two non-walking speed values, taking the larger. The walking-relative
 * sentinels rank above any plausible numeric value because they resolve to a
 * multiple of the walking speed at render time (which is always ≥ 25 ft RAW):
 * `"twice-walking"` (2×) > `"equal-to-walking"` (1×) > numeric feet.
 *
 * Pure — no character context. The render-time resolver in `derive-sheet-views`
 * actually substitutes the walking speed.
 */
function maxNonWalking(
  current: NonWalkingSpeed | null,
  incoming: NonWalkingSpeed
): NonWalkingSpeed {
  if (current === null) return incoming;
  // `"twice-walking"` dominates everything (largest render value).
  if (current === "twice-walking" || incoming === "twice-walking") {
    return "twice-walking";
  }
  if (current === "equal-to-walking" || incoming === "equal-to-walking") {
    return "equal-to-walking";
  }
  return current >= incoming ? current : incoming;
}

/**
 * Exhaustiveness guard for the {@link Grant} discriminated union — the single
 * data↔logic seam. Mirrors `cost-engine.ts`'s `assertNever`: because every
 * `Grant` member is handled by the `applyGrant` switch, the compiler narrows
 * the `default` arm's argument to `never`. Adding a 55th `Grant` kind without a
 * matching `case` then becomes a COMPILE error here instead of a silent
 * runtime drop (no aggregate field written). Grants only ever originate from
 * static SRD data, so the throw is unreachable in normal operation.
 */
function assertNever(x: never): never {
  throw new Error(`Unhandled grant kind: ${JSON.stringify(x)}`);
}

// ─── Evaluator ──────────────────────────────────────────────────────────────

/**
 * Count the INDEPENDENTLY-trackable free-cast spells a source grants at its TOP
 * level: each fixed `free-cast-spell` plus each chosen `choice-spell` that carries
 * a `freeCastSource`. When ≥ 2, every such spell needs its OWN per-spell tracker
 * (RAW "cast EACH of these spells once per rest") so they don't collapse onto one
 * deadlocking counter; ≤ 1 keeps the bare source-id counter (already correct).
 * The single source of truth shared by the grant evaluator, the chosen-spell
 * stamp (`feat-spell-choices`), and the derived rail rows (`smart-tracker`).
 */
export function countTopLevelFreeCasts(grants: ReadonlyArray<Grant> | undefined): number {
  let n = 0;
  for (const g of grants ?? []) {
    if (g.type === "free-cast-spell") n += 1;
    else if (g.type === "choice-spell" && g.freeCastSource) n += 1;
  }
  return n;
}

/**
 * The tracker key a free-cast spell debits: PER-SPELL `${sourceId}:${spellId}`
 * when `multi` (the source grants ≥ 2 free-casts → independent counters), else the
 * bare `sourceId`. Used by every reader/writer of a free-cast tracker so the key
 * can never drift across the cast gate, the spend, the rail row, and recovery.
 */
export function freeCastTrackerKey(
  sourceId: string,
  spellId: string,
  multi: boolean
): string {
  return multi ? `${sourceId}:${spellId}` : sourceId;
}

/**
 * Walk every supplied source row and aggregate its grants into a single
 * `AggregatedGrants`. Sources can come from any of: race traits, feats,
 * class features, equipped magic items, invocations, metamagic, backgrounds.
 *
 * Mutating helper inside; returns a frozen-ish (read-only-typed) result.
 *
 * `activeKeys` (L11) is the session's current active-feature set. A
 * `while-active` grant's inner grants merge into the aggregate only when its
 * `activeKey` is in this set; defaulting to empty means "nothing toggled on",
 * so conditional buffs never over-report when the caller has no session.
 *
 * `bundleChoices` (L12) maps a `choice-grant-bundle`'s `bundleKey` to the
 * selected option id; the selected option's grants merge in. Unselected
 * bundles contribute nothing.
 */
export function evaluateGrants(
  sources: ReadonlyArray<GrantSource>,
  activeKeys: ReadonlySet<string> = new Set(),
  bundleChoices: ReadonlyMap<string, string> = new Map()
): AggregatedGrants {
  // Senses
  let darkvisionFt = 0;
  // D6 — additive darkvision (Gloom Stalker Umbral Sight): summed separately, then
  // folded onto the max base range at finalize so a species' darkvision + Umbral
  // Sight stacks (60 + 60 = 120) instead of merging to 60.
  let darkvisionBonusFt = 0;
  let blindsightFt = 0;
  let tremorsenseFt = 0;
  let truesightFt = 0;
  let seeInvisibleFt = 0;

  // Defensive
  const damageResistances = new Set<DamageType>();
  const damageImmunities = new Set<DamageType>();
  const damageVulnerabilities = new Set<DamageType>();
  const conditionImmunities = new Set<ConditionId>();
  const damageSourceResistances = new Set<DamageSource>();
  const flatDamageReductions: AggregatedGrants["flatDamageReductions"][number][] = [];

  // Movement
  let speedBonusFt = 0;
  const conditionalSpeedBonusFt: Partial<Record<"no-heavy-armor", number>> = {};
  let round1SpeedBonusFt = 0;
  const round1DamageDoubles: AggregatedGrants["round1DamageDoubles"][number][] = [];
  let flySpeed: NonWalkingSpeed | null = null;
  let swimSpeed: NonWalkingSpeed | null = null;
  let climbSpeed: NonWalkingSpeed | null = null;
  let speedMultiplier = 1;
  let speedFloorFt = 0;

  // Derived stats
  let acBonus = 0;
  const acBonusAbilities: { ability: AbilityCode; min: number }[] = [];
  const acFormulas: AcFormula[] = [];
  let mediumArmorDexCap: { cap: number; minDex: number } | null = null;
  let hpPerLevel = 0;
  let hpFlat = 0;
  const hpFlatParts: AggregatedGrants["hpFlatParts"][number][] = [];
  let critThreshold = 20;
  let deathSaveCritThreshold = 20;
  const startOfTurnRegen: AggregatedGrants["startOfTurnRegen"][number][] = [];
  const onCritMovement: AggregatedGrants["onCritMovement"][number][] = [];
  const replaceAttackWithCast: AggregatedGrants["replaceAttackWithCast"][number][] = [];
  const unarmedStrikeDice: AggregatedGrants["unarmedStrikeDice"][number][] = [];
  const weaponReachBonuses: AggregatedGrants["weaponReachBonuses"][number][] = [];
  const spellSlotTrackerRecoveries: AggregatedGrants["spellSlotTrackerRecoveries"][number][] =
    [];
  const initiativeTrackerTopUps: AggregatedGrants["initiativeTrackerTopUps"][number][] =
    [];
  const atZeroHpInterrupts: AggregatedGrants["atZeroHpInterrupts"][number][] = [];
  let extraAttacks = 0;
  let heroicInspirationAtTurnStart = false;
  let heroicInspirationOnLongRest = false;
  let attunementSlots = 3;
  let exhaustionRecoveryBonus = 0;
  let exhaustionRecoveryShortRest = 0;
  const abilityScoreFloors: Partial<Record<AbilityCode, number>> = {};
  const itemAbilityScoreBonus: Record<AbilityCode, number> = {
    STR: 0,
    DEX: 0,
    CON: 0,
    INT: 0,
    WIS: 0,
    CHA: 0,
  };
  // Tightest resulting-SCORE ceiling per ability among contributing item
  // `ability-score` grants (RAW "to a maximum of 20"). Applied against the
  // actual base by `effectiveAbilityScores`; absent ⇒ no cap.
  const itemAbilityScoreCap: Partial<Record<AbilityCode, number>> = {};
  const spellSaveDcBonus: CastingModifierEntry[] = [];
  const spellAttackBonus: CastingModifierEntry[] = [];
  const saveBonusAbilities: { ability: AbilityCode; min: number }[] = [];
  let saveBonusFlat = 0;
  const saveBonusByAbility: {
    appliesToSave: AbilityCode;
    ability?: AbilityCode;
    min: number;
    amount: number;
  }[] = [];
  const concentrationSaveBonusAbilities: { ability: AbilityCode; min: number }[] = [];
  let concentrationSaveBonusFlat = 0;
  const abilityCheckBonuses: {
    appliesTo: string;
    ability?: AbilityCode;
    value: "modifier" | number;
    min: number;
  }[] = [];
  const initiativeBonusAbilities: AbilityCode[] = [];
  let initiativeBonusFlat = 0;
  const damageRiders: AggregatedGrants["damageRiders"][number][] = [];
  const weaponDamageBonuses: AggregatedGrants["weaponDamageBonuses"][number][] = [];
  const spellDamageBonuses: SpellDamageBonusEntry[] = [];
  const healBonuses: HealBonusEntry[] = [];
  const spellDamageTypeOverrides: SpellDamageTypeOverrideEntry[] = [];
  const unarmedStrikeDamageTypeOptions: DamageType[] = [];
  const componentWaivers: ComponentWaiverEntry[] = [];
  const cantripDamageBonuses: CantripDamageBonusEntry[] = [];
  const cantripEffectRiders: CantripEffectRiderEntry[] = [];
  const cantripRangeBonuses: CantripRangeBonusEntry[] = [];
  const weaponAttackCantrips: WeaponAttackCantripEntry[] = [];

  // Proficiencies
  const saveProficiencies = new Set<AbilityCode>();
  const skillProficiencies = new Set<string>();
  const expertiseSkills = new Set<string>();
  let halfProficiencyAllSkills = false;
  const languages = new Set<string>();
  const toolProficiencies = new Set<string>();
  const weaponProficiencies = new Set<ProficiencyToken>();
  const armorProficiencies = new Set<ProficiencyToken>();
  const weaponAttackAbilities: {
    ability: AbilityCode;
    magicOnly: boolean;
    weaponScope?: "monk-melee";
  }[] = [];
  const weaponAttackBonuses: WeaponAttackBonusEntry[] = [];
  const damageDieModifiers: DamageDieModifierEntry[] = [];

  // Spell grants
  const alwaysPrepared: string[] = [];
  const ritualSpells = new Set<string>();
  const ritualAnyClasses = new Set<ClassId>();
  const freeCasts: FreeCastEntry[] = [];
  const freeCastFromList: FreeCastFromListEntry[] = [];
  const atWillCasts: AtWillCastEntry[] = [];
  const scopedExtraSlots: ScopedExtraSlotEntry[] = [];

  // Sources that grant MORE THAN ONE free-cast spell (a fixed `free-cast-spell`
  // + a chosen `choice-spell.freeCastSource`, or several Spells of the Mark).
  // Only these need PER-SPELL tracker keys so each spell is independently 1/rest
  // (RAW "cast EACH once"); a single-free-cast source keeps the bare source-id
  // counter that already worked. Magic items never split (shared charge pool).
  const multiFreeCastSourceIds = new Set<string>();
  for (const src of sources) {
    if (src.ref?.kind === "magic-item") continue;
    if (countTopLevelFreeCasts(src.grants) >= 2) multiFreeCastSourceIds.add(src.id);
  }

  // Advantage / disadvantage chips
  const advantages: AdvantageClause[] = [];
  const disadvantages: AdvantageClause[] = [];
  const rollFloors: RollFloorClause[] = [];
  const incomingAttackAdvantages: IncomingAttackClause[] = [];
  const incomingAttackDisadvantages: IncomingAttackClause[] = [];
  const defenseNotes: IncomingAttackClause[] = [];

  // PRIM batch (2026-06-10)
  const auras: AuraClause[] = [];
  const spellDieAugments: SpellDieAugmentEntry[] = [];
  const copyToTargets: CopyToTargetClause[] = [];
  const resourceConversions: ResourceConversionEntry[] = [];

  // Activatable toggles (L11)
  const activatableGroups: ActivatableGroup[] = [];

  // Single-select variant choosers (L12)
  const grantBundles: GrantBundle[] = [];

  // Choice-resistance slots (pick-N re-selectable damage resistances)
  const choiceResistances: ChoiceResistance[] = [];

  // Granted actions (ARCHITECTURE.md combat model)
  const grantedActions: GrantedAction[] = [];

  // Manifested weapons (Soulknife Psychic Blades) — deduped by id.
  const manifestedWeapons: ManifestedWeapon[] = [];

  // Form-swap attack rows (Wild Shape / Arcane Armor / Starry Form) — only the
  // rows from ACTIVE forms land here (collected inside the active `while-active`
  // branch). Deduped by id.
  const formAttacks: FormAttack[] = [];

  // Conjured pact weapons (Pact of the Blade) — deduped by sourceId.
  const pactWeapons: PactWeapon[] = [];

  // On-hit pact-weapon riders (Eldritch Smite, Lifedrinker) — deduped by id.
  const pactWeaponRiders: PactWeaponRider[] = [];

  // Familiar-enhancement bundles (Investment of the Chain Master) — deduped by sourceId.
  const familiarEnhancements: FamiliarEnhancement[] = [];

  // Cunning Strike catalogue (deduped by optionId — first source wins)
  const cunningStrikeOptions: CunningStrikeOption[] = [];

  // Temporary-HP grants (override-first — never auto-applied)
  const tempHpGrants: TempHpEntry[] = [];

  // Cross-feature alternate-recovery grants (Sorcery Incarnate → Innate Sorcery)
  const trackerAltRecoveries: TrackerAltRecoveryEntry[] = [];

  // Pending choices (player-resolved)
  const pendingChoices: PendingChoice[] = [];

  /**
   * Merge a single grant into the aggregate. Extracted as a closure (over the
   * mutable accumulators above) so `while-active` can recurse into its inner
   * grants without duplicating the switch. `sourceId` is the originating
   * feature/item id (recursed grants inherit their wrapper's source). `gref` is
   * THIS grant's catalogue ref (`<sourceKey>.grants.<seg>`) — the localizable
   * strings the aggregate emits key under it (R6+R3 SLICE 7c). `sourceRef` is the
   * SOURCE's catalogue ref (`{kind, key}` of the feat/feature/item/spell, an ID),
   * inherited UNCHANGED through recursion — used to attribute the per-source
   * `hp-flat` breakdown row to its source NAME (so a while-active Aid row inherits
   * the same descent as `hpFlat`). `activeKey` is set ONLY when the grant came from
   * inside a `while-active` block, so toggle-gated aggregates (the `ac-formula`
   * candidates) can be stamped with the toggle.
   */
  function applyGrant(
    g: Grant,
    sourceId: string,
    gref: GrantRef,
    sourceRef: { kind: SrdKind; key: string } | undefined,
    activeKey?: string
  ): void {
    switch (g.type) {
      // ── Senses ──────────────────────────────────────────────────────
      case "darkvision":
        if (g.range > darkvisionFt) darkvisionFt = g.range;
        break;
      case "darkvision-bonus":
        // D6 — additive: SUMS atop the max base range (Umbral Sight +60).
        darkvisionBonusFt += g.amount;
        break;
      case "blindsight":
        if (g.range > blindsightFt) blindsightFt = g.range;
        break;
      case "tremorsense":
        if (g.range > tremorsenseFt) tremorsenseFt = g.range;
        break;
      case "truesight":
        if (g.range > truesightFt) truesightFt = g.range;
        break;
      case "see-invisible":
        if (g.range > seeInvisibleFt) seeInvisibleFt = g.range;
        break;

      // ── Defensive ───────────────────────────────────────────────────
      case "damage-resistance":
        damageResistances.add(g.damageType);
        break;
      case "damage-immunity":
        damageImmunities.add(g.damageType);
        break;
      case "damage-vulnerability":
        damageVulnerabilities.add(g.damageType);
        break;
      case "condition-immunity":
        conditionImmunities.add(g.condition);
        break;
      case "damage-resistance-source":
        // Resistance keyed to a damage SOURCE (Abjurer Spell Resistance →
        // "spell"). Set-union per source, orthogonal to the per-DamageType set.
        damageSourceResistances.add(g.source);
        break;
      case "flat-damage-reduction":
        // FLAT incoming-damage reduction (Heavy Armor Master's −PB on B/P/S
        // while in Heavy armor). Recorded verbatim; the consumer resolves the
        // "PB" sentinel + the wearing-state gate before the defenses rail
        // renders it and before the RA-05 damage-intake math subtracts it.
        flatDamageReductions.push({
          damageTypes: g.damageTypes,
          amount: g.amount,
          ...(g.condition ? { condition: g.condition } : {}),
          sourceId,
        });
        break;

      // ── Movement ────────────────────────────────────────────────────
      case "speed":
        if (g.round1) {
          // Round-1-only (Ambusher's Leap) — sum into its own bucket; the
          // consumer adds it only when in combat round 1.
          round1SpeedBonusFt += g.amount;
        } else if (g.condition) {
          // Gated on a wearing-state — sum into its conditional bucket; the
          // consumer applies it only when the gate holds.
          conditionalSpeedBonusFt[g.condition] =
            (conditionalSpeedBonusFt[g.condition] ?? 0) + g.amount;
        } else {
          speedBonusFt += g.amount;
        }
        break;
      case "fly-speed":
        flySpeed = maxNonWalking(flySpeed, g.amount);
        break;
      case "swim-speed":
        swimSpeed = maxNonWalking(swimSpeed, g.amount);
        break;
      case "climb-speed":
        climbSpeed = maxNonWalking(climbSpeed, g.amount);
        break;
      case "speed-multiplier":
        // MAX factor wins — multipliers never stack (two doublings ≠ ×4).
        if (g.factor > speedMultiplier) speedMultiplier = g.factor;
        break;
      case "speed-floor":
        // MAX floor wins — floors never stack ("Speed becomes N unless higher").
        if (g.minFt > speedFloorFt) speedFloorFt = g.minFt;
        break;

      // ── Derived stats ───────────────────────────────────────────────
      case "ac-bonus":
        if (g.ability) {
          acBonusAbilities.push({ ability: g.ability, min: g.min ?? 0 });
        } else {
          acBonus += g.amount ?? 0;
        }
        break;
      case "ac-formula":
        acFormulas.push({
          sourceId,
          base: g.base,
          bonuses: g.bonuses,
          condition: g.condition,
          shieldBonus: g.shieldBonus ?? 0,
          // Toggle-gated formulas (Circle of the Moon Circle Forms) carry the
          // `while-active` key that produced them; always-on formulas don't.
          ...(activeKey === undefined ? {} : { activeKey }),
        });
        break;
      case "medium-armor-dex-cap": {
        // MAX cap wins; the lowest minDex among the winning caps gates it
        // (most generous benefit). Default minDex 16 per Medium Armor Master.
        const minDex = g.minDex ?? 16;
        if (mediumArmorDexCap === null || g.cap > mediumArmorDexCap.cap) {
          mediumArmorDexCap = { cap: g.cap, minDex };
        } else if (g.cap === mediumArmorDexCap.cap && minDex < mediumArmorDexCap.minDex) {
          mediumArmorDexCap = { cap: g.cap, minDex };
        }
        break;
      }
      case "hp-per-level":
        hpPerLevel += g.amount;
        break;
      case "hp-flat":
        hpFlat += g.amount;
        // Attribute at the source of truth: the breakdown tip MAPS these instead
        // of re-walking sources, so it inherits the exact while-active descent
        // `hpFlat` gets (Aid's `hp-flat:5` lands here only when its toggle is lit)
        // and `sum(amount) === hpFlat` holds by construction (golden rule 6).
        // `sourceRef` is the source NAME ref (the same the old top-level walk used).
        if (sourceRef) hpFlatParts.push({ ref: sourceRef, amount: g.amount });
        break;
      case "attunement-slots":
        if (g.amount > attunementSlots) attunementSlots = g.amount;
        break;
      case "exhaustion-recovery":
        if (g.recovery === "short-rest") {
          exhaustionRecoveryShortRest += g.amount;
        } else {
          exhaustionRecoveryBonus += g.amount;
        }
        break;
      case "crit-range":
        // The most generous (lowest) threshold wins.
        if (g.threshold < critThreshold) critThreshold = g.threshold;
        break;
      case "death-save-crit-range":
        // The most generous (lowest) threshold wins (mirrors `crit-range`).
        if (g.threshold < deathSaveCritThreshold) deathSaveCritThreshold = g.threshold;
        break;
      case "regen-at-turn-start":
        startOfTurnRegen.push({
          sourceId,
          amount: g.amount,
          condition: g.condition,
          requiresMinHp: g.requiresMinHp ?? true,
          asTempHp: g.asTempHp ?? false,
        });
        break;
      case "on-crit-movement-rider":
        onCritMovement.push({
          sourceId,
          fraction: g.fraction,
          ignoresOpportunityAttacks: g.ignoresOpportunityAttacks ?? true,
        });
        break;
      case "replace-attack-with-cast":
        replaceAttackWithCast.push({
          sourceId,
          attacks: g.attacks,
          classSpellList: g.classSpellList,
          minSpellLevel: g.minSpellLevel ?? 0,
          maxSpellLevel: g.maxSpellLevel,
          castTime: g.castTime,
        });
        break;
      case "unarmed-strike-die":
        unarmedStrikeDice.push({
          die: g.die,
          ...(g.attackAbility ? { attackAbility: g.attackAbility } : {}),
          ...(g.damageAbility ? { damageAbility: g.damageAbility } : {}),
          damageType: g.damageType,
          sourceId,
        });
        break;
      case "weapon-reach-bonus":
        weaponReachBonuses.push({
          bonusFt: g.bonusFt,
          appliesTo: g.appliesTo,
          extraMasteries: g.extraMasteries ?? [],
        });
        break;
      case "spell-slot-tracker-recovery":
        spellSlotTrackerRecoveries.push({
          trackerId: g.trackerId,
          usesPerSlot: g.usesPerSlot ?? 1,
          sourceId,
        });
        break;
      case "initiative-tracker-topup":
        initiativeTrackerTopUps.push({
          trackerId: g.trackerId,
          upTo: g.upTo,
          sourceId,
        });
        break;
      case "at-zero-hp-interrupt":
        atZeroHpInterrupts.push({ trackerId: g.trackerId, sourceId });
        break;
      case "extra-attack":
        // Extra Attack never stacks (multiclass) and Devouring Blade UPGRADES
        // Thirsting Blade — the most extra attacks granted wins.
        if (g.count > extraAttacks) extraAttacks = g.count;
        break;
      case "heroic-inspiration-at-turn-start":
        heroicInspirationAtTurnStart = true;
        break;
      case "heroic-inspiration-on-rest":
        heroicInspirationOnLongRest = true;
        break;
      case "ability-score-set": {
        // Floor: keep the highest value seen per ability ("no effect if your
        // score is already higher" is resolved against the base by the consumer).
        const prev = abilityScoreFloors[g.ability] ?? 0;
        if (g.value > prev) abilityScoreFloors[g.ability] = g.value;
        break;
      }
      case "ability-score": {
        // ADDITIVE ability bonus. ONLY magic-item sources fold into the live
        // render channel — feat/class/race/background ASIs are already BAKED
        // into the stored scores (`applyFeatAsi`), so re-adding them here would
        // double-count. `gref.kind` is the originating source's SRD kind,
        // preserved through `while-active` / `choice-grant-bundle` recursion by
        // `childGrantRef`/`optionGrantRef` (so a bundled Ioun-Stone +2 still
        // reads `magic-item`). A non-item `ability-score` grant is a no-op here
        // (its effect is already in the stored base — golden rule 2).
        if (gref?.kind === "magic-item") {
          itemAbilityScoreBonus[g.ability] += g.amount;
          // The grant's `cap` is the resulting SCORE ceiling (RAW "to a maximum
          // of 20"), NOT a bonus ceiling — it must clamp `base + bonus`, and
          // `base` is unknown here. So carry the TIGHTEST cap per ability for
          // `effectiveAbilityScores` to apply against the actual base.
          if (g.cap != null) {
            const prev = itemAbilityScoreCap[g.ability];
            itemAbilityScoreCap[g.ability] = prev == null ? g.cap : Math.min(prev, g.cap);
          }
        }
        break;
      }
      case "spell-save-dc-bonus":
        spellSaveDcBonus.push({ amount: g.amount, scope: g.scope });
        break;
      case "spell-attack-bonus":
        spellAttackBonus.push({ amount: g.amount, scope: g.scope });
        break;
      case "save-bonus":
        if (g.appliesToSave) {
          // SCOPED — rides only the named ability's saves. An ability entry
          // resolves `max(mod, min)` at render (amount 0); a flat entry carries
          // its `amount` (no `ability` key so the consumer takes the flat path).
          if (g.ability) {
            saveBonusByAbility.push({
              appliesToSave: g.appliesToSave,
              ability: g.ability,
              min: g.min ?? 0,
              amount: 0,
            });
          } else {
            saveBonusByAbility.push({
              appliesToSave: g.appliesToSave,
              min: g.min ?? 0,
              amount: g.amount ?? 0,
            });
          }
        } else if (g.ability) {
          saveBonusAbilities.push({ ability: g.ability, min: g.min ?? 0 });
        } else {
          saveBonusFlat += g.amount ?? 0;
        }
        break;
      case "concentration-save-bonus":
        if (g.ability) {
          concentrationSaveBonusAbilities.push({ ability: g.ability, min: g.min ?? 0 });
        } else {
          concentrationSaveBonusFlat += g.amount ?? 0;
        }
        break;
      case "ability-check-bonus":
        abilityCheckBonuses.push({
          appliesTo: g.appliesTo,
          ...(g.ability ? { ability: g.ability } : {}),
          value: g.value ?? "modifier",
          min: g.min ?? 0,
        });
        break;
      case "initiative-bonus":
        if (g.ability) {
          initiativeBonusAbilities.push(g.ability);
        } else {
          initiativeBonusFlat += g.amount ?? 0;
        }
        break;
      case "damage-rider":
        damageRiders.push({
          ...(g.dice !== undefined ? { dice: g.dice } : {}),
          ...(g.diceByLevel ? { diceByLevel: g.diceByLevel } : {}),
          ...(g.amount ? { amount: g.amount } : {}),
          ...(g.vsMarkedTarget ? { vsMarkedTarget: g.vsMarkedTarget } : {}),
          damageType: g.damageType,
          appliesTo: g.appliesTo,
          oncePerTurn: g.oncePerTurn ?? false,
          ...(g.addAbilityMod ? { addAbilityMod: g.addAbilityMod } : {}),
          ...(g.resourceCost ? { resourceCost: g.resourceCost } : {}),
          sourceId,
          // `activeKey` (set when this rider arrived through a `while-active`
          // block) marks the chip as a conditional, currently-active source —
          // mirrors `weapon-damage-bonus` below (Rage Damage · active).
          ...(activeKey ? { whileActiveKey: activeKey } : {}),
        });
        break;
      case "weapon-damage-bonus":
        // `activeKey` (the applyGrant param) is the wrapping `while-active`
        // toggle when this grant arrived through one — recorded so the damage
        // breakdown can mark the bonus as a conditional source (Rage · active).
        weaponDamageBonuses.push({
          ...(g.amount !== undefined ? { amount: g.amount } : {}),
          ...(g.sourceKey ? { sourceKey: g.sourceKey } : {}),
          scope: g.scope,
          sourceId,
          ...(activeKey ? { whileActiveKey: activeKey } : {}),
        });
        break;
      case "spell-damage-bonus":
        spellDamageBonuses.push({
          damageTypes: g.damageTypes,
          ...(g.ability ? { ability: g.ability } : {}),
          value: g.value ?? "modifier",
          min: g.min ?? 0,
          scope: g.scope ?? "all",
          ...(g.cantripOnly ? { cantripOnly: true } : {}),
          ...(g.oncePerTurn ? { oncePerTurn: true } : {}),
          ...(g.schools ? { schools: g.schools } : {}),
        });
        break;
      case "heal-bonus":
        healBonuses.push({
          amount: g.amount,
          perSpellLevel: g.perSpellLevel ?? false,
          minSpellLevel: g.minSpellLevel ?? 0,
          scope: g.scope ?? "all",
        });
        break;
      case "spell-damage-type-override":
        spellDamageTypeOverrides.push({
          toType: g.toType,
          scope: g.scope ?? "all",
        });
        break;
      case "unarmed-strike-damage-type-option":
        if (!unarmedStrikeDamageTypeOptions.includes(g.toType)) {
          unarmedStrikeDamageTypeOptions.push(g.toType);
        }
        break;
      case "component-waiver":
        componentWaivers.push({
          schools: g.schools ?? [],
          waive: g.waive,
          scope: g.scope ?? "all",
        });
        break;
      case "cantrip-damage-bonus": {
        // Resolve which cantrip the bonus targets: an explicit `spellId` wins;
        // else the player's pick (`grantBundleChoices[choiceKey]`); else the
        // fact's `defaultSpellId` fallback (Eldritch Blast for Agonizing Blast).
        const chosen =
          g.spellId ??
          (g.choiceKey ? bundleChoices.get(g.choiceKey) : undefined) ??
          g.defaultSpellId;
        // No target resolvable → the grant contributes nothing (defensive).
        if (chosen) {
          cantripDamageBonuses.push({
            spellId: chosen,
            ...(g.ability ? { ability: g.ability } : {}),
            value: g.value ?? "modifier",
            min: g.min ?? 0,
          });
        }
        break;
      }
      case "cantrip-effect-rider": {
        // Resolve the targeted cantrip exactly like `cantrip-damage-bonus`: an
        // explicit `spellId` wins; else the player's pick
        // (`grantBundleChoices[choiceKey]`); else the `defaultSpellId` fallback
        // (Eldritch Blast for Repelling Blast). No target → contributes nothing.
        const chosen =
          g.spellId ??
          (g.choiceKey ? bundleChoices.get(g.choiceKey) : undefined) ??
          g.defaultSpellId;
        if (chosen) {
          cantripEffectRiders.push({
            spellId: chosen,
            effect: g.effect,
            direction: g.direction,
            distanceFt: g.distanceFt,
            maxTargetSize: g.maxTargetSize,
          });
        }
        break;
      }
      case "cantrip-range-bonus": {
        // Resolve the targeted cantrip exactly like `cantrip-effect-rider`: an
        // explicit `spellId` wins; else the player's pick
        // (`grantBundleChoices[choiceKey]`); else the `defaultSpellId` fallback
        // (Eldritch Blast for Eldritch Spear). No target → contributes nothing.
        // The class-level scaling is recorded (bonusPerLevel × scalesWith level)
        // and resolved per cantrip at render by `resolveCantripRangeBonus`.
        const chosen =
          g.spellId ??
          (g.choiceKey ? bundleChoices.get(g.choiceKey) : undefined) ??
          g.defaultSpellId;
        if (chosen) {
          cantripRangeBonuses.push({
            spellId: chosen,
            bonusPerLevel: g.bonusPerLevel,
            scalesWith: g.scalesWith,
          });
        }
        break;
      }
      case "weapon-attack-cantrip":
        // Dedupe by spellId — the same weapon-attack cantrip granted by two
        // sources resolves identically; first source wins (keeps attribution).
        if (!weaponAttackCantrips.some((w) => w.spellId === g.spellId)) {
          weaponAttackCantrips.push({
            sourceId,
            spellId: g.spellId,
            useSpellcastingAbility: g.useSpellcastingAbility,
            damageTypeChoice: g.damageTypeChoice,
            extraDamageByLevel: g.extraDamageByLevel,
            extraDamageType: g.extraDamageType,
          });
        }
        break;

      // ── Proficiencies ───────────────────────────────────────────────
      case "save-proficiency":
        saveProficiencies.add(g.ability);
        break;
      case "skill-proficiency":
        skillProficiencies.add(g.skill);
        break;
      case "expertise":
        expertiseSkills.add(g.skill);
        break;
      case "half-proficiency-all-skills":
        halfProficiencyAllSkills = true;
        break;
      case "language":
        languages.add(g.language);
        break;
      case "tool-proficiency":
        toolProficiencies.add(g.tool);
        break;
      case "weapon-proficiency":
        weaponProficiencies.add(g.proficiency);
        break;
      case "armor-proficiency":
        armorProficiencies.add(g.proficiency);
        break;
      case "weapon-attack-ability":
        weaponAttackAbilities.push({
          ability: g.ability,
          magicOnly: g.magicOnly ?? false,
          ...(g.weaponScope ? { weaponScope: g.weaponScope } : {}),
          ...(g.dieUpgrade ? { dieUpgrade: g.dieUpgrade, sourceId } : {}),
        });
        break;
      case "weapon-attack-bonus":
        // To-hit bonus on weapon attacks (Archery → +2 ranged; Sacred Weapon →
        // +CHA mod (min +1) while lit). Collected as a list; the consumer sums
        // the entries whose scope applies to the weapon. Merge: SUM (two
        // same-scope sources stack into the to-hit). `amount` is carried
        // UNRESOLVED (the ability variant needs the character — resolved in the
        // consumer); `sourceId` names the granting entity by its ONE catalogue
        // key (golden rule 6); `activeKey` records the wrapping `while-active`
        // toggle (when any) so the breakdown can mark it as a conditional source.
        weaponAttackBonuses.push({
          amount: g.amount,
          scope: g.scope,
          sourceId,
          ...(activeKey ? { whileActiveKey: activeKey } : {}),
        });
        break;
      case "damage-die-modifier":
        // Manipulation of a weapon's own damage dice (Great Weapon Fighting
        // floor / Savage Attacker reroll / Two-Weapon Fighting off-hand mod /
        // Unarmed Fighting Unarmed Strike). Collected as a list; the attack-row
        // consumer applies the relevant `mode` to the matching weapon rows.
        // Carry every field through unresolved (the evaluator has no weapon /
        // ability scores); spread optional keys only when present so the
        // aggregate stays minimal and parity tests can use `toEqual`.
        damageDieModifiers.push({
          sourceId,
          mode: g.mode,
          appliesTo: g.appliesTo,
          ...(g.floorBelow !== undefined ? { floorBelow: g.floorBelow } : {}),
          ...(g.floorTo !== undefined ? { floorTo: g.floorTo } : {}),
          ...(g.oncePerTurn !== undefined ? { oncePerTurn: g.oncePerTurn } : {}),
          ...(g.baseDie !== undefined ? { baseDie: g.baseDie } : {}),
          ...(g.unburdenedDie !== undefined ? { unburdenedDie: g.unburdenedDie } : {}),
          ...(g.grappleDie !== undefined ? { grappleDie: g.grappleDie } : {}),
          ...(g.abilityMod !== undefined ? { abilityMod: g.abilityMod } : {}),
          ...(g.damageType !== undefined ? { damageType: g.damageType } : {}),
        });
        break;

      // ── Spell grants ────────────────────────────────────────────────
      case "always-prepared-spell":
        if (!alwaysPrepared.includes(g.spellId)) alwaysPrepared.push(g.spellId);
        break;
      case "ritual-casting":
        ritualSpells.add(g.spellId);
        break;
      case "ritual-casting-any":
        ritualAnyClasses.add(g.classSpellList);
        break;
      case "free-cast-spell":
        // When a source grants MULTIPLE free-cast spells, each is INDEPENDENTLY
        // tracked — RAW "cast EACH of these spells once per <rest>". So a
        // multi-free-cast feat (Fey-Touched Misty Step + chosen, a heritage feat's
        // two/three Spells of the Mark) keys its tracker PER-SPELL
        // `${sourceId}:${spellId}` (the set `multiFreeCastSourceIds` flags those
        // sources), so casting one no longer locks the others on a shared counter.
        // A SINGLE-free-cast source keeps the bare `sourceId` (the existing,
        // already-correct one-counter model — nothing to disambiguate). Bundle
        // free-casts (species Legacy) arrive PRE-suffixed and aren't in the set, so
        // they're untouched here. The id is composed once below by
        // `freeCastTrackerKey`.
        freeCasts.push({
          sourceId: freeCastTrackerKey(
            sourceId,
            g.spellId,
            multiFreeCastSourceIds.has(sourceId)
          ),
          spellId: g.spellId,
          chargesPerRest: g.chargesPerRest,
          ...(g.chargesFormula ? { chargesFormula: g.chargesFormula } : {}),
          rest: g.rest,
          casterAbility: g.casterAbility,
          ...(g.minLevel != null ? { minLevel: g.minLevel } : {}),
        });
        break;
      case "free-cast-from-list":
        // D4 — the per-rest tracker defaults to the source feature's own tracker
        // (Divine Intervention's `tracker`, War God's Blessing's
        // `cleric-channel-divinity`), so the cast debits the SAME shared pool.
        freeCastFromList.push({
          sourceId,
          ...(g.spellList ? { spellList: g.spellList } : {}),
          ...(g.maxSpellLevel != null ? { maxSpellLevel: g.maxSpellLevel } : {}),
          ...(g.spellIds ? { spellIds: g.spellIds } : {}),
          ...(g.spellCosts ? { spellCosts: g.spellCosts } : {}),
          ...(g.chargesPerRest != null ? { chargesPerRest: g.chargesPerRest } : {}),
          ...(g.rest ? { rest: g.rest } : {}),
          trackerId: g.trackerId ?? sourceId,
          ...(g.casterAbility ? { casterAbility: g.casterAbility } : {}),
        });
        break;
      case "at-will-cast-spell":
        // Deduped by spellId — two sources granting the same at-will cast
        // still yield a single at-will row (first source wins).
        if (!atWillCasts.some((e) => e.spellId === g.spellId)) {
          atWillCasts.push({
            sourceId,
            spellId: g.spellId,
            casterAbility: g.casterAbility,
            // Fiendish Vigor: casting this way maximizes the spell's temp HP
            // instead of rolling. Resolve the declared formula deterministically
            // (no RNG) so the aggregate carries the concrete maximized total.
            ...(g.autoMaxTempHpFormula !== undefined
              ? { autoMaxTempHp: maximizeDiceFormula(g.autoMaxTempHpFormula) }
              : {}),
          });
        }
        break;
      case "scoped-extra-spell-slot":
        scopedExtraSlots.push({
          sourceId,
          levelFormula: g.levelFormula,
          scope: g.scope,
          recovery: g.recovery,
        });
        break;

      // ── Advantage / disadvantage clauses ────────────────────────────
      case "advantage-on":
        // `activeKey` (set when this clause arrived through a `while-active`
        // block) marks the chip as a conditional, currently-active source —
        // mirrors `weapon-damage-bonus` (Rage's STR advantage · active).
        advantages.push({
          sourceId,
          rollType: g.rollType,
          vs: g.vs,
          description: grantField(gref, "description", g.description),
          ...(g.round1 ? { round1: true } : {}),
          ...(activeKey ? { whileActiveKey: activeKey } : {}),
        });
        break;
      case "disadvantage-on":
        disadvantages.push({
          sourceId,
          rollType: g.rollType,
          vs: g.vs,
          description: grantField(gref, "description", g.description),
          ...(activeKey ? { whileActiveKey: activeKey } : {}),
        });
        break;
      case "round1-damage-double":
        // Round-1 save-gated damage-doubler note (Death Strike) — carry the ability
        // pair; the consumer resolves the DC + the UI shows it only in combat round 1.
        round1DamageDoubles.push({
          sourceId,
          saveAbility: g.saveAbility,
          saveDcAbility: g.saveDcAbility,
        });
        break;
      case "roll-floor":
        rollFloors.push({
          sourceId,
          rollType: g.rollType,
          floor: g.floor,
          appliesTo: g.appliesTo,
          description: grantField(gref, "description", g.description),
          ...(activeKey ? { whileActiveKey: activeKey } : {}),
        });
        break;
      case "incoming-attack-advantage":
        // SELF-side downside (Reckless Attack): when it arrives through a
        // `while-active` block, `activeKey` marks it "· active" — same as the
        // advantage chips it mirrors.
        incomingAttackAdvantages.push({
          sourceId,
          description: grantField(gref, "description", g.description),
          ...(activeKey ? { whileActiveKey: activeKey } : {}),
        });
        break;
      case "incoming-attack-disadvantage":
        // SELF-side BENEFIT (Blur): attacks against you have Disadvantage. When it
        // arrives through a `while-active` block (Blur is a Concentration spell),
        // `activeKey` marks it "· active" — the mirror of the downside above.
        incomingAttackDisadvantages.push({
          sourceId,
          description: grantField(gref, "description", g.description),
          ...(activeKey ? { whileActiveKey: activeKey } : {}),
        });
        break;
      case "defense-note":
        // SELF-side defensive reminder line (Warding Bond's shared-damage /
        // resistance posture). Prose only; the engine computes nothing from it.
        defenseNotes.push({
          sourceId,
          description: grantField(gref, "description", g.description),
          ...(activeKey ? { whileActiveKey: activeKey } : {}),
        });
        break;

      // ── PRIM batch (2026-06-10) ─────────────────────────────────────
      case "aura":
        auras.push({
          sourceId,
          auraId: g.auraId,
          radius: g.radius,
          ...(g.radiusByLevel && { radiusByLevel: g.radiusByLevel }),
          affects: g.affects,
          effect: g.effect,
          ...(g.description && {
            description: grantField(gref, "description", g.description),
          }),
        });
        break;
      case "spell-die-augment": {
        // Largest `toDie` wins when two sources target the same spell.
        const existing = spellDieAugments.find((e) => e.spellId === g.spellId);
        if (existing) {
          if (g.toDie > existing.toDie) {
            existing.toDie = g.toDie;
            existing.fromDie = g.fromDie;
          }
        } else {
          spellDieAugments.push({
            spellId: g.spellId,
            fromDie: g.fromDie,
            toDie: g.toDie,
          });
        }
        break;
      }
      case "copy-to-2nd-target":
        copyToTargets.push({
          sourceId,
          copyId: g.copyId,
          ...(g.appliesToFeature && { appliesToFeature: g.appliesToFeature }),
          effect: grantField(gref, "effect", g.effect),
        });
        break;
      case "resource-conversion":
        resourceConversions.push({
          sourceId,
          conversionId: g.conversionId,
          produces: g.produces,
          ...(g.fromTracker && { fromTracker: g.fromTracker }),
          ...(g.toTracker && { toTracker: g.toTracker }),
          ...(g.perUnitSlotLevels !== undefined && {
            perUnitSlotLevels: g.perUnitSlotLevels,
          }),
          ...(g.costTable && { costTable: g.costTable }),
          ...(g.maxSlotLevel !== undefined && { maxSlotLevel: g.maxSlotLevel }),
        });
        break;
      case "item-bound-bonus":
        // INTENTIONALLY un-aggregated. A `weapon-attack-and-damage` bonus rides
        // ONLY its owning weapon's row, so the weapon-layer consumer
        // (`resolveItemBoundWeaponBonus`) reads the item's grants directly —
        // aggregating it would smear the +N across every attack. The case exists
        // to keep the switch exhaustive (no silent fall-through).
        break;

      // ── Pending choices (level-up wizard pickers) ───────────────────
      case "choice-ability-score":
        pendingChoices.push({
          sourceId,
          kind: "ability-score",
          abilities: g.abilities,
          amount: g.amount,
          cap: g.cap,
        });
        break;
      case "choice-skill-proficiency":
        pendingChoices.push({
          sourceId,
          kind: "skill-proficiency",
          options: g.options,
          amount: g.amount,
        });
        break;
      case "choice-expertise":
        pendingChoices.push({
          sourceId,
          kind: "expertise",
          amount: g.amount,
        });
        break;
      case "choice-language":
        pendingChoices.push({
          sourceId,
          kind: "language",
          options: g.options,
          amount: g.amount,
        });
        break;
      case "choice-tool-proficiency":
        pendingChoices.push({
          sourceId,
          kind: "tool-proficiency",
          options: g.options,
          amount: g.amount,
        });
        break;
      case "choice-skill-or-tool-proficiency":
        pendingChoices.push({
          sourceId,
          kind: "skill-or-tool-proficiency",
          amount: g.amount,
        });
        break;
      case "choice-cantrip":
        pendingChoices.push({
          sourceId,
          kind: "cantrip",
          classSpellList: g.classSpellList,
          amount: g.amount,
          spellAbility: g.spellAbility,
        });
        break;
      case "choice-spell":
        pendingChoices.push({
          sourceId,
          kind: "spell",
          classSpellList: g.classSpellList,
          classSpellLists: g.classSpellLists,
          maxLevel: g.maxLevel,
          amount: g.amount,
          spellAbility: g.spellAbility,
          ritualOnly: g.ritualOnly,
          spellSchool: g.spellSchool,
          spellSchools: g.spellSchools,
          toSpellbook: g.toSpellbook,
        });
        break;

      case "choice-feat":
        // Origin-feat grant (Lessons of the First Ones / Human Versatile):
        // surface a pending feat pick so the picker can prompt the player. The
        // chosen feat is resolved into a `character.features` ref by
        // `feat-feat-choices.ts`; from there the existing feat pipeline applies
        // its grants/tracker/actions — this grant is a CHOICE seam, not an
        // aggregate of effects.
        pendingChoices.push({
          sourceId,
          kind: "feat",
          category: g.category,
          amount: g.amount,
        });
        break;

      // ── Activatable / conditional grants (L11) ──────────────────────
      case "while-active": {
        const active = activeKeys.has(g.activeKey);
        activatableGroups.push({
          key: g.activeKey,
          sourceId,
          label: grantField(gref, "label", g.label),
          active,
        });
        if (active) {
          for (let i = 0; i < g.grants.length; i++) {
            const inner = g.grants[i];
            if (!inner) continue;
            // One level only — a nested while-active is ignored (its buff
            // would need its own toggle; data declares toggles flat).
            if (inner.type === "while-active") continue;
            applyGrant(
              inner,
              sourceId,
              childGrantRef(gref, inner, i),
              sourceRef,
              g.activeKey
            );
          }
        }
        break;
      }

      // ── Single-select variant chooser (L12) ───────────────────────────
      case "choice-grant-bundle": {
        const selected = bundleChoices.get(g.bundleKey) ?? null;
        grantBundles.push({
          bundleKey: g.bundleKey,
          sourceId,
          label: grantField(gref, "label", g.label),
          options: g.options.map((o) => ({
            id: o.id,
            label: grantField(optionGrantRef(gref, o.id), "label", o.label),
          })),
          selected,
          choiceFrequency: g.choiceFrequency ?? "rest",
        });
        if (selected !== null) {
          const chosen = g.options.find((o) => o.id === selected);
          const optionRef = optionGrantRef(gref, selected);
          const innerGrants = chosen?.grants ?? [];
          for (let j = 0; j < innerGrants.length; j++) {
            const inner = innerGrants[j];
            if (!inner) continue;
            // One level only — nested choosers/toggles are ignored.
            if (inner.type === "choice-grant-bundle" || inner.type === "while-active") {
              continue;
            }
            // A `free-cast-spell` inside a multi-spell bundle option (2024 species
            // Legacy: "cast EACH of these spells once per Long Rest without a
            // slot") needs its OWN charge counter — the free-cast is keyed by
            // `sourceId`, so a per-spell suffix gives Hellish Rebuke and Darkness
            // independent 1/LR uses instead of sharing one. (This is the bundle
            // analogue of the `multiFreeCastSourceIds` rule the top-level
            // `free-cast-spell` case applies; it pre-suffixes here so the case —
            // which only re-suffixes ids in that set — leaves it untouched.) Other
            // inner grants keep the bundle's source id (they aggregate flatly).
            const innerSourceId =
              inner.type === "free-cast-spell"
                ? `${sourceId}:${inner.spellId}`
                : sourceId;
            applyGrant(
              inner,
              innerSourceId,
              childGrantRef(optionRef, inner, j),
              sourceRef,
              // Inherit the wrapping `while-active` toggle (when any): a bundle
              // nested in a lit form (Armorer's Armor Model inside the donned
              // Arcane Armor) carries `activeKey` so a `form-attack` in the chosen
              // option stays gated by BOTH the toggle AND the model choice. Plain
              // (un-nested) bundles pass `undefined`, unchanged.
              activeKey
            );
          }
        }
        break;
      }

      // ── Choice-resistance (pick N damage resistances, re-selectable) ───
      case "choice-resistance": {
        // Picks are re-selectable session state stored at
        // `grantBundleChoices[choiceKey]` as a comma-separated DamageType list.
        const picks = parseChoiceResistanceValue(
          bundleChoices.get(g.choiceKey),
          g.options,
          g.amount
        );
        // Each validated pick gains Resistance — set-union into the SAME field
        // the fixed `damage-resistance` grant feeds, so the defenses consumer
        // needs no extra code.
        for (const dt of picks) damageResistances.add(dt);
        // Surface the slot so a picker UI can show the constrained list + picks.
        choiceResistances.push({
          choiceKey: g.choiceKey,
          sourceId,
          label: grantField(gref, "label", g.label),
          options: g.options,
          amount: g.amount,
          selected: picks,
        });
        break;
      }

      // ── Granted action (ARCHITECTURE.md combat model) ──────────────────────────
      case "granted-action":
        grantedActions.push({
          sourceId,
          name: grantField(gref, "name", g.name),
          slot: g.slot,
          ...(hasGrantField(gref, "description", g.description)
            ? { description: grantField(gref, "description", g.description) }
            : {}),
          cost: g.cost,
          ...(hasGrantField(gref, "trigger", g.trigger)
            ? { trigger: grantField(gref, "trigger", g.trigger) }
            : {}),
          saveAbility: g.saveAbility,
        });
        break;

      // ── Manifested weapon (Soulknife Psychic Blades) ──────────────────
      case "manifested-weapon":
        // Dedupe by id — the same feature can't usefully manifest the same
        // weapon twice; first source wins (keeps its attribution).
        if (!manifestedWeapons.some((w) => w.id === g.id)) {
          manifestedWeapons.push({
            sourceId,
            id: g.id,
            name: grantField(gref, "name", g.name),
            nameEn: grantFieldEn(gref, "name", g.name),
            category: g.category,
            weaponType: g.weaponType,
            damageDie: g.damageDie,
            damageType: g.damageType,
            properties: g.properties,
            ...(g.mastery ? { mastery: g.mastery } : {}),
            masteryIsFree: g.masteryIsFree ?? false,
            proficient: g.proficient ?? true,
            ...(g.bonusAction
              ? {
                  bonusAction: {
                    name: grantField(
                      gref
                        ? { kind: gref.kind, key: srdKey(gref.key, "bonusAction") }
                        : undefined,
                      "name",
                      g.bonusAction.name
                    ),
                    slot: g.bonusAction.slot,
                    damageDie: g.bonusAction.damageDie,
                  },
                }
              : {}),
          });
        }
        break;

      // ── Form attack (Wild Shape / Arcane Armor / Starry Form) ──────────
      case "form-attack":
        // A form attack is meaningful ONLY while its form toggle is lit — it
        // MUST sit inside a `while-active` block, so `activeKey` is the wrapping
        // toggle the evaluator stamped on recursion. An always-on `form-attack`
        // (no wrapping toggle, `activeKey === undefined`) is a data error: skip
        // it rather than leak a permanent natural weapon. Dedupe by id (first
        // source wins, keeping attribution).
        if (activeKey !== undefined && !formAttacks.some((f) => f.id === g.id)) {
          formAttacks.push({
            sourceId,
            activeKey,
            id: g.id,
            name: grantField(gref, "name", g.name),
            category: g.category,
            weaponType: g.weaponType,
            damageDie: g.damageDie,
            ...(g.damageDieByLevel ? { damageDieByLevel: g.damageDieByLevel } : {}),
            damageType: g.damageType,
            properties: g.properties,
            ...(g.attackAbility ? { attackAbility: g.attackAbility } : {}),
            proficient: g.proficient ?? true,
            ...(g.oncePerTurnExtra ? { oncePerTurnExtra: g.oncePerTurnExtra } : {}),
            // A localizable on-hit reminder is carried iff the catalogue has the
            // `<ref>.note` key (mirrors how `granted-action` emits its catalogue
            // `description` from presence, not an inline value — GR7).
            ...(hasGrantField(gref, "note") ? { note: grantField(gref, "note") } : {}),
          });
        }
        break;

      // ── Pact weapon (Warlock Pact of the Blade) ───────────────────────
      case "pact-weapon":
        // Dedupe by sourceId — a character has at most one pact-weapon bond
        // (re-conjuring ends the previous bond). First source wins.
        if (!pactWeapons.some((w) => w.sourceId === sourceId)) {
          pactWeapons.push({
            sourceId,
            id: g.id,
            name: grantField(gref, "name", g.name),
            attackAbility: g.attackAbility,
            damageTypeChoices: g.damageTypeChoices,
            isFocus: g.isFocus,
            conjureSlot: g.conjureSlot,
            defaultDamageDie: g.defaultDamageDie,
            defaultDamageType: g.defaultDamageType,
          });
          // The bond grants proficiency with the conjured weapon AND lets you
          // use the spellcasting ability for attack/damage. Fold both into the
          // existing seams so a CARRIED weapon the Warlock bonds with benefits
          // identically (Equipment proficiency union + best-of attack ability).
          // The `pact-weapon` TOKEN localizes from the catalogue (no EN leak).
          weaponProficiencies.add(asProficiencyToken("pact-weapon"));
          if (
            !weaponAttackAbilities.some(
              (wa) => wa.ability === g.attackAbility && !wa.magicOnly
            )
          ) {
            weaponAttackAbilities.push({ ability: g.attackAbility, magicOnly: false });
          }
        }
        break;

      // ── Pact-weapon rider (Eldritch Smite, Lifedrinker) ───────────────
      case "pact-weapon-rider":
        // Dedupe by id (the invocation slug). First source wins — a Warlock
        // never has two copies of the same Pact-of-the-Blade rider.
        if (!pactWeaponRiders.some((r) => r.id === g.id)) {
          pactWeaponRiders.push({
            sourceId,
            id: g.id,
            name: grantField(gref, "name", g.name),
            nameEn: grantFieldEn(gref, "name", g.name),
            dice: g.dice,
            ...(g.damageType ? { damageType: g.damageType } : {}),
            ...(g.damageTypeChoices ? { damageTypeChoices: g.damageTypeChoices } : {}),
            costsPactSlot: g.costsPactSlot ?? false,
            scalesPerSlotLevel: g.scalesPerSlotLevel ?? false,
            ...(g.prone ? { prone: g.prone } : {}),
            healFromHitDie: g.healFromHitDie ?? false,
          });
        }
        break;

      // ── Familiar enhancement (Investment of the Chain Master) ─────────
      case "familiar-enhancement":
        // Dedupe by sourceId — a character never carries the same familiar-
        // enhancement feature twice; first source wins (keeps its attribution).
        if (!familiarEnhancements.some((f) => f.sourceId === sourceId)) {
          familiarEnhancements.push({
            sourceId,
            ...(g.extraSpeedFt != null ? { extraSpeedFt: g.extraSpeedFt } : {}),
            ...(g.extraSpeedModes ? { extraSpeedModes: g.extraSpeedModes } : {}),
            ...(g.bonusActionAttack != null
              ? { bonusActionAttack: g.bonusActionAttack }
              : {}),
            ...(g.damageTypeConversion
              ? { damageTypeConversion: g.damageTypeConversion }
              : {}),
            ...(g.usesOwnerSaveDc != null ? { usesOwnerSaveDc: g.usesOwnerSaveDc } : {}),
            ...(g.reactionResistance != null
              ? { reactionResistance: g.reactionResistance }
              : {}),
          });
        }
        break;

      // ── Cunning Strike option (Rogue catalogue) ───────────────────────
      case "cunning-strike-option":
        // Dedupe by optionId — a character can pick up the same effect from
        // more than one source only conceptually; the catalogue lists each
        // once (first source wins, keeping its attribution).
        if (!cunningStrikeOptions.some((o) => o.optionId === g.optionId)) {
          cunningStrikeOptions.push({
            sourceId,
            optionId: g.optionId,
            name: grantField(gref, "name", g.name),
            cost: g.cost,
            description: grantField(gref, "description", g.description),
            save: g.save,
            condition: g.condition,
          });
        }
        break;

      // ── Temporary HP grant (override-first — never auto-applied) ──────
      case "temp-hp":
        tempHpGrants.push({
          sourceId,
          formula: g.formula,
          ...(hasGrantField(gref, "trigger", g.trigger)
            ? { trigger: grantField(gref, "trigger", g.trigger) }
            : {}),
          slot: g.slot,
        });
        break;

      // ── Cross-feature alternate-recovery cost (Sorcery Incarnate) ─────
      case "tracker-alt-recovery":
        trackerAltRecoveries.push({
          targetTracker: g.targetTracker,
          amount: g.amount,
          fromTracker: g.fromTracker,
        });
        break;

      // ── Extra economy-slot grant (B6 — Action Surge / Haste) ──────────
      case "extra-action":
        // No-op in the GLOBAL aggregate: the per-turn action/bonus budget is a
        // combat-only concern, derived on demand by `extraActionsThisTurn`
        // (smart-tracker) from the ACTIVE while-active sources — never folded
        // into every surface's character aggregate (YAGNI; declare-the-least).
        // Cased here only to satisfy the exhaustiveness guard.
        break;

      // ── Exhaustiveness guard — a future un-cased Grant kind is a compile
      //    error (g narrows to `never` here only if all members are handled). ─
      default:
        assertNever(g);
    }
  }

  for (const src of sources) {
    const grants = src.grants ?? [];
    for (let i = 0; i < grants.length; i++) {
      const g = grants[i];
      if (!g) continue;
      const gref: GrantRef = src.ref
        ? {
            kind: src.ref.kind,
            key: srdKey(src.ref.key, srdGrantSegment(grantSegmentArgs(g), i)),
          }
        : undefined;
      applyGrant(g, src.id, gref, src.ref);
    }
  }

  return {
    // D6 — final darkvision = max BASE range (merge) + summed additive bonus
    // (Umbral Sight). With no base, the bonus still grants its own range (RAW:
    // "Darkvision 60 ft; if you already have Darkvision, its range increases by
    // 60 ft") — `0 + bonus` covers that case naturally.
    darkvisionFt: darkvisionFt + darkvisionBonusFt,
    blindsightFt,
    tremorsenseFt,
    truesightFt,
    seeInvisibleFt,
    damageResistances,
    damageImmunities,
    damageVulnerabilities,
    conditionImmunities,
    damageSourceResistances,
    flatDamageReductions,
    speedBonusFt,
    conditionalSpeedBonusFt,
    round1SpeedBonusFt,
    round1DamageDoubles,
    flySpeed,
    swimSpeed,
    climbSpeed,
    speedMultiplier,
    speedFloorFt,
    acBonus,
    acBonusAbilities,
    acFormulas,
    mediumArmorDexCap,
    hpPerLevel,
    hpFlat,
    hpFlatParts,
    critThreshold,
    deathSaveCritThreshold,
    startOfTurnRegen,
    onCritMovement,
    replaceAttackWithCast,
    unarmedStrikeDice,
    weaponReachBonuses,
    spellSlotTrackerRecoveries,
    initiativeTrackerTopUps,
    atZeroHpInterrupts,
    extraAttacks,
    heroicInspirationAtTurnStart,
    heroicInspirationOnLongRest,
    attunementSlots,
    exhaustionRecoveryBonus,
    exhaustionRecoveryShortRest,
    abilityScoreFloors,
    itemAbilityScoreBonus,
    itemAbilityScoreCap,
    spellSaveDcBonus,
    spellAttackBonus,
    saveBonusAbilities,
    saveBonusFlat,
    saveBonusByAbility,
    concentrationSaveBonusAbilities,
    concentrationSaveBonusFlat,
    abilityCheckBonuses,
    initiativeBonusAbilities,
    initiativeBonusFlat,
    damageRiders,
    weaponDamageBonuses,
    spellDamageBonuses,
    healBonuses,
    spellDamageTypeOverrides,
    unarmedStrikeDamageTypeOptions,
    componentWaivers,
    cantripDamageBonuses,
    cantripEffectRiders,
    cantripRangeBonuses,
    weaponAttackCantrips,
    saveProficiencies,
    skillProficiencies,
    expertiseSkills,
    halfProficiencyAllSkills,
    languages,
    toolProficiencies,
    weaponProficiencies,
    armorProficiencies,
    weaponAttackAbilities,
    weaponAttackBonuses,
    damageDieModifiers,
    alwaysPrepared,
    ritualSpells,
    ritualAnyClasses,
    freeCasts,
    freeCastFromList,
    atWillCasts,
    scopedExtraSlots,
    advantages,
    disadvantages,
    rollFloors,
    incomingAttackAdvantages,
    incomingAttackDisadvantages,
    defenseNotes,
    auras,
    spellDieAugments,
    copyToTargets,
    resourceConversions,
    activatableGroups,
    grantBundles,
    choiceResistances,
    grantedActions,
    manifestedWeapons,
    formAttacks,
    pactWeapons,
    pactWeaponRiders,
    familiarEnhancements,
    cunningStrikeOptions,
    tempHpGrants,
    trackerAltRecoveries,
    pendingChoices,
  };
}
