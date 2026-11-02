# Edge-case families: detailed mechanisms

The two halves of the fitness pass, verbatim. Their family numbers are local to each half; [../2026-11-edge-cases.md](../2026-11-edge-cases.md) gives the merged, ranked list (M1–M20) and says which local families each one folds.

# Part A: categories 1–8

## A: Families (c)/(d)

Ranked by severity, where severity = how often it comes up at the table × how wrong the result is, on a 1–5 scale.

### A-F2 — Transformation as a derived layer, not stamped overrides — severity 4, size L, class (d)

- **Covers:**
  - Concentration: shape-shifting keeps concentration and uses the form's CON (2); Wild Shape ends on Incapacitated (2).
  - Wild Shape: Moon AC vs beast AC, what Wild Shape keeps, Wild Shape at 0 HP, no casting in form, equipment in form (3).
  - Polymorph defenses and overflow (3); monster shape-changers (3); the multiclass-prerequisite caveat (5).
- **Today:**
  - `assumeBeastForm` stamps the beast's AC, speeds and **all six scores into the stored build** (`polymorph.ts:162-191`; `forms.ts:54-87`), with `prior` kept for a restore. The breakdown can only say "manual adjustment" (`withOverride`, `value-breakdown.ts:219`).
  - Form rules are a code table keyed by spell id (`SELF_FORM_RULES`, `POLYMORPH_SPELL_IDS`, `polymorph.ts:31`, `:63-91`).
  - Wild Shape isn't a form at all: it is a tracker, temp HP and a CR chip (`druid.ts:229-265`). Moon's in-form benefits hang off a separate manual toggle (`pack:…/druid.ts:21-29`).
  - The beast's defenses are never applied, gear keeps granting, and casting isn't blocked.
- **Mechanism:**
  ```ts
  // catalogue (spell or feature): what assuming a form does
  interface FormRule { pool: "beasts"|"bestiary"; crCap?: IntExpr; sizeMax?: Size;
    keeps: ("INT"|"WIS"|"CHA"|"CON"|"hp"|"features"|"proficiencies"|"species-traits")[];
    proficiencies: "better-of"|"form"; tempHp: "form-hp"|IntExpr; endsOn: ("temp-hp-0"|"incapacitated"|"0-hp")[];
    reshift?: boolean; gear: "per-item"; whileInForm: Grant[] }      // e.g. spellcasting-blocked + exceptions
  // session: the only stored state
  activeForm?: { source: GrantRef; formId: string; statBlock?: BeastStatBlock; gear?: Record<instanceId,"merged"|"worn"|"dropped"> }
  ```
  The evaluator puts a `form` layer between the build and the aggregate. Ability scores, AC base, speeds, defenses, senses and attacks are read from the form for every stat not listed in `keeps`. Proficiency becomes `max(own, form)`. Merged gear drops out of `effectiveEquipment`. Breakdown parts are labelled "Wild Shape: Brown Bear".
- **Stored shape:** yes. `polymorphForm.prior`, plus the build fields stamped on any live character currently in a form, have to be unwound to the new `activeForm`. That needs a live-data migration (tiny population: only characters mid-form).
- **Retires:** `SELF_FORM_RULES`, `POLYMORPH_SPELL_IDS`, `SELF_FORM_SPELL_IDS`, `polymorphBuildPatch` / `revertBuildFromPrior`, the form-retraction branch in `changeConcentration` (`concentration.ts:39-43`, `:72-80`), `selfFormRule(...).endsWithoutTempHp` in the store (`characterStore.ts:1519-1522`), `form-attack`, and the Moon `ac-formula condition:"while-active"` stopgap.

### A-F5 — Turn-scoped usage windows — severity 3, size M, class (c)

- **Covers:** Sneak Attack on others' turns (6); once per turn vs on your turn (8); lair legendary action (6).
- **Today:**
  - `Recovery` has a single `per-turn` value (`src/data/types.ts:216`). `recoverPerTurnTrackers` runs only at the owner's turn start (`states.ts:128-142`, `end-turn.ts:110`, `extra-turn.ts:57`).
  - `damage-rider.oncePerTurn` is display only. Sneak Attack is special-cased by id in four places (`PlayTab.tsx:168`, `TurnEconomyProvider.tsx:220`, `build-combat-playbook.ts:89`, `playbook-view.ts:161`).
- **Mechanism:**
  ```ts
  type UsageWindow = "any-turn" | "own-turn" | "round" | "first-attack-own-turn";
  interface TrackerSpec { …; perWindow?: { window: UsageWindow; max: number } }
  interface TrackerState { used: number; windowKey?: string }   // e.g. "r3:monster-7"
  ```
  The evaluator compares `windowKey` with the live `currentTurnKey()` (it already exists for the slot gate, `TurnEconomyProvider.tsx:397-400`). A different key means the tracker is fresh again, so no refill job runs at all. Lair: `legendary.uses: IntExpr` with an `inLair` fact.
- **Stored shape:** additive (`windowKey` optional). No migration.
- **Retires:** the Sneak Attack id special cases and `recoverPerTurnTrackers` (with its play-log event `recover-per-turn-trackers`, `sheet-events.ts:151`).

### A-F7 — Damage-packet participants (absorbers, incoming transforms, attacker-side modifiers) — severity 3, size M, class (c)

- **Covers:** Arcane Ward (1); Uncanny Dodge / Deflect-style halving (6); Elemental Adept (7). Polymorph overflow would plug in here too, once F2 lands.
- **Today:**
  - `resolveDamageIntake` handles flat reduction, immunity, resistance and vulnerability (`damage-intake.ts:171-232`).
  - `resolvePersistentDamage` adds one-off reducers for transfer, retaliation and floors (`combat-effects.ts:407-520`).
  - The Ward is a tracker that the pipeline never reads. The Uncanny Dodge runtime is deleted, and nothing on the attacker side can switch off the target's resistance.
- **Mechanism:** one ordered list of packet stages contributed by grants, with RAW slots:
  ```ts
  type PacketStage =
    | {
        at: "pre-defense";
        op: "scale";
        factor: 0.5;
        when: { trigger: "hit-by-attack" };
        cost?: Cost;
      } // Uncanny Dodge
    | { at: "post-resistance"; op: "absorb"; pool: TrackerRef } // Arcane Ward, before temp HP
    | {
        at: "defense";
        op: "ignore-resistance";
        side: "attacker";
        damageTypes: DamageType[];
      }; // Elemental Adept
  ```
  The order is fixed: flat → immunity → resistance (minus attacker-ignored types) → vulnerability → absorbers → temp HP → HP. Each stage is a breakdown part and a log beat. Optional stages (reactions) are offered on the entry tray and paid through `commitAction`, so they undo with the hit.
- **Stored shape:** no (catalogue plus a pure reducer).
- **Retires:** `damage-transfer`, `damage-retaliation` and `zero-hp-floor` special handling in `resolvePersistentDamage`; the `flat-damage-reduction` budget path (it becomes a stage); `reduce-damage` (`activities/types.ts:356-360`); `damage-die-reduction` (a defense line only).

### A-F3 — Summon / companion instance lifecycle — severity 3, size M, class (c), additive shape

- **Covers:**
  - Concentration-linked summons (2); Find Familiar (4); Find Steed (4).
  - Beast Master revive/replace and Share Spells (4); True Polymorph's controlled creature, from both 3 and 4; antimagic (4).
  - Giant Insect web and Putrid Spirit riders (4).
- **Today:**
  - Companion presence is _derived_: a card shows when the spell is known, or while concentrating on a concentration spell (`companion-row-view.ts:315-343`, `:396-398`).
  - HP sits in `companionHp[id#n]`. Encounter links are `{summonId, casterId}` with no source or lifetime (`summon-links.ts:10-35`).
  - Non-concentration summons never record their cast level. Companion attacks carry text riders, not Activity effects. Find Familiar is special-cased by id (`familiar-ids.ts:16`).
- **Mechanism:**

  ```ts
  interface SummonInstance {
    id: string;
    source: GrantRef;
    castLevel?: number;
    variantId?: string;
    hp: { current: number };
    state: "present" | "suppressed" | "dead" | "gone";
    endsOn: (
      | "concentration"
      | "0-hp:vanish"
      | "0-hp:dies"
      | "owner-death"
      | "long-rest"
      | "dismiss"
      | "timer"
    )[];
    controlUntil?: TurnEdge;
    diedAt?: Clock;
  }
  // catalogue: CompanionStatBlock gains lifecycle + `actions: Activity[]` (replacing attacks[] + rider text)
  ```

  - Casting creates an instance, and the existing `StatusEnd` / `endStatuses` sweep ends it (concentration end, timers, rests).
  - The encounter `summons` link points at the instance id. Revive (Beast Master) is an `Activity` effect `{kind:"revive-companion"}`.
  - Share Spells / Life Bond become an effect recipient fan-out `recipient: "self+companion"`.

- **Stored shape:** additive `session.summons[]`. The old `companionHp` keys are read as instance #1. No mandatory migration.
- **Retires:** `FIND_FAMILIAR_SPELL_ID` special cases, the concentration gating in `companion-row-view.ts`, `releaseCompanion` / `setCompanionCount` as separate transitions, `familiar-enhancement`, and `familiar-forms` (both become companion-block variants).

### A-F1 — Effect identity and stacking policy — severity 2–3, size M, class (c)

- **Covers:** same-name effects don't stack, overlapping auras, same-name speed reductions (1).
- **Today:**
  - `Rule` has no identity (`rules/index.ts:130-145`); `foldRules` only knows max/min/add buckets (`:421-455`).
  - De-duplication is scattered: the key Set, per-kind max, `resolve-grant-sources.ts:398` first-wins, and roughly 12 "dedupe by id" comments in `grants.ts` (`:2564-2582`, `:3066`, `:3246`, `:3663-3818`).
  - Incoming speed reductions are log-only (`rider-taken.ts:50-52`).
- **Mechanism:** give every folded contribution an `effectKey` (catalogue entry id, plus the variant for a different-name same-source) and a policy:

  ```ts
  interface Rule { …; effect?: { key: string; policy: "strongest"|"newest"|"recipient-choice" } }
  ```

  - `foldRules` first collapses contributions sharing an `effect.key`: strongest by value, ties to the newest occurrence. `recipient-choice` reads the pick from `grantBundleChoices`.
  - Then the existing buckets apply.
  - Incoming riders such as Slow (−10 ft until a turn edge) become a timed `ActiveCombatEffect` grant-group carrying `speed` with an effect key, so they get the same collapse rule. That also fixes self-lit plus ally-cast double Bless.

- **Stored shape:** no.
- **Retires:** the ad hoc dedupe branches in `grants.ts`, the key-based dedupe in `resolveCombatEffectGrantSources`, and the informational-only `aura` (ally auras become effects with `recipient-choice`).

### A-F4 — Cast instance record and spell provenance — severity 2, size M, class (d)

- **Covers:**
  - Prepared spells belong to one class, Spell Scroll class restriction, Wild Magic in multiclass casters (5).
  - Extended Spell's concentration advantage (2).
  - One Metamagic per spell with exceptions, and Twinned's eligibility and +1 level (7).
  - The Innate Sorcery scope caveat (7).
- **Today:**
  - The owning class is derived from list membership with a tie fallback (`spell-owning-class.ts:1-20`), so there is no stored `viaClass`.
  - Metamagic choices are paid and logged, then forgotten. The primary count is hard-wired to 1 (`cast-options.ts:263-275`).
  - Scrolls have no spell parameter (`part-1.ts:935-941`).
- **Mechanism:**

  ```ts
  interface SrdSpellRef { …; viaClass?: ClassId | "feat" | "species" | "item" }     // stored, optional
  interface CastRecord { spellId; viaClass; slot?: {level; pact}; castLevel; metamagic: string[]; free?: GrantRef }
  // session.concentration gains { castRecord }; on-cast hooks and save contexts read it
  interface MetamagicPolicy { primaries: IntExpr }   // 1, or 2 while Innate Sorcery is active (a while-active grant raises it)
  ```

  - Twinned gets the predicate `requiresUpcastTargets` (it reads `targeting.maxTargetsPerUpcast`) and an `effectiveLevel = castLevel + 1` for its check.
  - Scrolls become an `EquipmentRef.params: { spellId }` instance parameter.

- **Stored shape:** yes but additive (`viaClass`, `params`). The backfill can be derived where unambiguous; ties stay unset (today's behaviour). No forced migration.
- **Retires:** most of `spell-owning-class.ts`, the `wild-magic-surge` list-membership check, `METAMAGIC_FEATURE_ID`-adjacent applicability flags, `stacksWithPrimary` as a special flag (it becomes a policy), and `SORCERY_POINTS_TRACKER_ID` in `cast-payment.ts:20` (metamagic pays through the cost engine).

### A-F6 — Event-triggered recoveries with nested limits ("feature amends feature") — severity 2, size M, class (c)

- **Covers:** features that refresh on initiative, Sorcerous Restoration, Rage upkeep (Persistent Rage) and Relentless Rage (8); Font of Magic (5).
- **Today:** one schema kind per pattern:
  - `initiative-tracker-topup` (`grant-schema.ts:559-563`), `tracker-alt-recovery` (`:2325-2330`), `heroic-inspiration-at-turn-start` / `-on-rest`;
  - `onCast.effect:"refill-tracker"` (`data/types.ts:460-491`), `resource-conversion.produces` hard-coded to three outputs (`grant-schema.ts:2438-2464`).
  - None of them has its own usage limit or condition, and created slots can't exceed the maximum.
- **Mechanism:**
  ```ts
  interface TriggerRule {
    on:
      | "initiative-rolled"
      | "short-rest"
      | "long-rest"
      | "turn-start"
      | "cast"
      | "use:<id>";
    if?: Predicate; /* tracker remaining == 0, castRecord.school, … */
    do: CommitOp[]; /* gain-tracker, top-up, gain-temp-slot{level, expires:"long-rest"}, set-duration{maintained:false}, heal */
    limit?: { per: "long-rest" | "short-rest" | "turn"; max: number };
    optional?: true;
    exclusiveWith?: string;
  }
  ```
  These run through the existing cost engine ops (`cost-engine.ts:50-62`) with logging and causal undo. A `gain-temp-slot` sits in `session.extraSlots`, which a Long Rest clears.
- **Stored shape:** additive (limit counters live in `session.trackers` under synthetic ids; optional `extraSlots`). No migration.
- **Retires:** `initiative-tracker-topup`, `tracker-alt-recovery`, `heroic-inspiration-*`, `onCast.refill-tracker`, the hard-coded `produces` union, `ARCANE_RECOVERY_FEATURE_ID` (`TurnEconomyProvider.tsx:190`), and the `trackerTopUp` action field.

### A-F8 — Outcome-gated effects and lifecycle-end hooks — severity 2, size S–M, class (c)

- **Covers:** Counterspell refund (6); Stunning Strike on a success (7); what survives when concentration ends (True Polymorph), ending-an-effect penalties (2); True Polymorph permanence (3).
- **Today:**
  - Only `damage` effects have a `gate` (`activities/types.ts:267-288`). `conditionApplication.on` is fail-only.
  - Tactical Mind uses a one-off `refundOnFail` flag (`activities/types.ts:362`).
  - `afterEffect` can only grant something until a target turn boundary (`grant-schema.ts:1996-2003`). There is no completion or end hook.
  - "Ends when temp HP run out" is inferred from the presence of a `damage-retaliation` grant (`combat-effects.ts:364-370`; `smart-tracker.ts:7052-7064`).
- **Mechanism:**
  ```ts
  interface EffectBase { fromLevel?; on?: "always"|"hit"|"miss"|"save-failed"|"save-succeeded"|"check-failed"|"check-succeeded" }
  interface CostRule { refund?: { on: "check-failed"|"countered" } }
  interface WhileActiveDuration { …; onEnd?: Effect[]; onComplete?: { becomes: "permanent"|Duration }; endsOn?: ("temp-hp-0"|…)[] }
  ```
  The entered outcome (save or check result, "countered") picks a branch. The end and complete hooks run in `endStatuses` / `advanceEffectTimers` (`smart-tracker.ts:9026`) as one logged, undoable commit.
- **Stored shape:** no.
- **Retires:** `refundOnFail`, the `requiresAppliedTempHp` inference, `afterEffect`'s single shape, and `conditionApplication.on`.

### A-F9 — One integer-expression language for every scaled number — severity 2, size M, class (c)

- **Covers:** Conjure Minor Elementals upcast dice, the summon multiattack count, Find Steed fly at 4th (4); the Sorcerous Restoration amount and Relentless Rage DC (8). It also underpins F6 and F4.
- **Today:** at least seven scaling dialects:
  - `diceByLevel` (`grant-schema.ts:1326`), `castLevelScaling` (`grants.ts:186`), `byCastLevel` (`grant-schema.ts:2024-2030`);
  - `spellLevel {acPer,hpPer}`, `damagePerSpellLevel` / `damageDicePerSpellLevel` (CompanionStatBlock / CompanionAttack);
  - tracker string formulas (`"level*5"`, `"WIS"`) plus `levels[]`, and `classSpecific` table columns.
  - A typed `IntegerExpression` with bindings already exists (`src/lib/integer-expression.ts`; used by `d20-test.ts`, `resources.ts`), but catalogue grants can't use it.
- **Mechanism:**
  ```ts
  type Scalar = number | IntegerExpression; // bindings: castLevel, classLevel:<id>, totalLevel, PB, mod:<ABL>, counter:<trackerId>
  type DiceScalar = { count: Scalar; die: number; plus?: Scalar };
  ```
  Each numeric field accepts `Scalar`, and one `bindScalars(ctx)` resolves it. The breakdown shows the bound terms ("2 + castLevel(5)"), and a homebrew validator reuses the existing exact-schema conformer.
- **Stored shape:** no (catalogue only). Stored tracker overrides are unaffected.
- **Retires:** `diceByLevel`, `castLevelScaling`, `byCastLevel`, `spellLevel.acPer/hpPer`, `damage(Dice)PerSpellLevel`, `TrackerSpec.levels[]`, string tracker formulas, and the `classSpecific.relentlessRageDc` / `relentlessRageHp` style columns.

---

## A: (b) data gaps

| Row to add or fix                                                                                                                                                           | File                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `companion` stat blocks (slot-scaled, with lifecycle once F3 lands) for Summon Beast, Fey, Undead (Putrid Spirit rider), Elemental, Aberration, Construct, Celestial, Fiend | `pack:data/spells.ts:683, 785, 941, 1152, 1229, 1246, 1511, 1824` (blocks beside them, mirroring `src/data/spells/companions.ts`) |
| Conjure Minor Elementals rider `appliesTo:"attack-or-spell"` (RAW "any attack", including Scorching Ray). Its +1d8/level upcast needs F9.                                   | `src/data/spells/level4.ts:146-156`                                                                                               |
| Hex / Hunter's Mark: a Bonus Action `granted-action` "move the mark" inside each `while-active`                                                                             | `src/data/spells/level1.ts` hex (~`:650`), hunters-mark (~`:690`)                                                                 |
| Indomitable: a free action spending the tracker, with "+Fighter level" on the reroll (also Disciplined Survivor's reroll)                                                   | `src/data/classes/fighter.ts:266-280` (and monk)                                                                                  |
| Moonlight Step: `total` minimum 1, plus `alternateCost:{kind:"spell-slot",minLevel:2}`                                                                                      | `pack:data/classes/druid.ts:83-95`                                                                                                |
| Sorcerous Restoration: should be a Short Rest recovery of `floor(sorcererLevel/2)` Sorcery Points, not an action (needs F9 for the amount)                                  | `src/data/classes/sorcerer.ts:238-253`                                                                                            |
| Beast Master: revive action (Magic action plus a slot, full HP) and "replace after a Long Rest"                                                                             | `pack:data/classes/ranger.ts:132-152`                                                                                             |
| Base Wild Shape: a lit state (`while-active`, `endsEarlyOn:["incapacitated"]`) carrying `spellcasting-blocked`, as a stopgap before F2 (Moon's toggle would reuse it)       | `src/data/classes/druid.ts:229-265`; `pack:data/classes/druid.ts:21-29`                                                           |
| Rage `maintainedBy` lacks "forced a save" (the keep/end prompt covers it, but the data says less than RAW)                                                                  | `src/data/classes/barbarian.ts:151-160`                                                                                           |
| Stale comment pointing to the deleted `lib/damage-reaction.ts`                                                                                                              | `src/data/classes/rogue.ts:268-277`                                                                                               |
| Find Steed's Fly 60 ft from 4th level is only rider text (needs F9: speeds that scale with cast level)                                                                      | `src/data/spells/companions.ts:9-31`                                                                                              |

# Part B: categories 9–17

## B: Families (c)/(d)

Ranked by severity (how often it bites × how wrong the result is).

### B-F1 — Damage lands through the target's own pipeline · severity 5 · size M · no migration

- **Cases:** 10 instant death / death-save failure on peer hits; 15 resistance per target, Evasion, allies in the area, concentration saves from areas; 17 area spells hitting allies. Also every DM monster attack on a PC.
- **Today:** `reducePcDamage` (`combat-transition.ts:85`) is complete but owner-only (`play/damage.ts:46`). Peer writes go through `reduceHpDelta` (`combat-state.ts:323`). Concentration queueing lives in the store (`characterStore.ts:1510-1560`). Evasion's rule sits in a dead path (`combat-resolution.ts:534-601`). The tray bakes in defenses on the caster's side with one damage type (`damage-tray.ts:226-249,378-399`).
- **Mechanism:**
  ```ts
  interface DamagePacket {            // written by any client, resolved by one pure reducer
    id: string; attacker: CombatantRef | null; label: LocText;
    parts: { amount: number; type?: DamageType; delivery: "attack"|"save"|"automatic"; source?: "spell"|"ranged-weapon" }[];
    outcome: { attack?: "hit"|"critical"|"miss"; save?: "saved"|"failed"; saveAbility?: AbilityCode; onSave: "half"|"none" };
  }
  resolvePacket(targetDoc, combatState, packet) =
    resolveCombatDamage(parts, outcome, onSave, defensesOf(targetDoc))   // Evasion, per-type defenses
    |> reducePcDamage(...)                                              // temp, 0 HP, saves, death, consumed effects
    |> queueConcentrationSave(dc from pre-temp total)                   // moved out of the store
  ```
  Run it inside the existing `writeCampaignCombatEffect` transaction, which already reads the target's parent doc (`campaign-io.ts:1011-1020`). Return the receipt for the log and the revert.
- **Stored data:** a new mutation kind plus an additive receipt; `CombatState` already holds `pendingConcentrationSaves`. No migration.
- **Retires:** `reduceHpDelta`'s damage branch for peers; the tray's `targetDefense`/defense toggle pre-bake; the polymorph-end and concentration rules in `characterStore.applyDamage`; it makes `resolveCombatDamage`/`saveDamageRules` live code.

### B-F2 — Condition occurrences with provenance, end triggers, suppression and immunity · severity 4 · size M · no migration if additive

- **Cases:** 9 exhaustion immunity, Hide, Hide vs spell invisibility, grapple ends when the grappler is Incapacitated, Frightened line of sight and Heroism suppression, Knock Out, Abjure Foes; 12 unseen sources. (The Invisibility spell's end on an act depends on this.)
- **Today:**
  - Manual chips are a bare `string[]` (`character.ts:1079`).
  - Encounter conditions carry an actor and a duration limited to `concentration|turn-boundary|encounter` (`combat-effect.ts:41-53`).
  - Data says early exits stay "explicit table corrections" (`data/types.ts:818-821`).
  - `endStatesOnAct` and `state-condition` only work for potions (`play/states.ts:102`, `effective-conditions.ts:41`).
  - Immunity is never applied.
  - There are two gate tables: `CONDITION_GATES` (`condition-effects.ts:75`) and `CONDITION_RULES` (`condition.ts:160`, world, richer).
- **Mechanism:**

  ```ts
  type ConditionEnd =
    | { on: "turn-edge"; anchor: "actor" | "target"; phase: "turn-start" | "turn-end" }
    | { on: "repeat-save"; ability: AbilityCode; dc: number; at: "target-turn-end" } // prompt, entered roll
    | { on: "target-damaged" }
    | { on: "actor-incapacitated" }
    | { on: "concentration" }
    | {
        on: "target-act";
        act: "attack-roll" | "deal-damage" | "cast-spell" | "verbal-spell" | "loud-noise";
      };
  interface ConditionOccurrence {
    id: string;
    conditionId: ConditionId;
    origin: "manual" | "hide" | "effect" | "state";
    actor?: CombatantRef;
    ends: ConditionEnd[];
    suppressedUnless?: "sees-source"[];
  }
  ```

  - One `effectiveConditions(doc, aggregate)` drops a condition the creature is immune to. It reports that condition as suppressed, not removed, so it comes back when Heroism ends.
  - One `endConditionsOn(event)` is called from `takeDamage`, End Turn, `performAct`, a condition change and a resolved packet (F1).
  - Generate `CONDITION_GATES` from `CONDITION_RULES`, so there is one table.

- **Stored data:** keep `conditions: string[]` as the manual layer and add an optional `conditionOccurrences`. No migration; unifying the two later would need one.
- **Retires:** the potion-only `potionStatesEndingOn`/`potionStateConditions`; the `hiddenDc` special field (it becomes an occurrence's metadata); the `grappled` id-keyed `scoped` limiter (`condition-effects.ts:89-101`); the duplicated gate table; and the special-case Unconscious shed in `setHp` (`play/vitals.ts:39-66`).

### B-F3 — The zero-HP pipeline: ordered savers and outcomes · severity 3 · size M · no migration

- **Cases:** 10 stable wakes after 1d4 hours, knocking out, Disintegrate vs Relentless Endurance, Relentless Rage, attunement ending at death, familiar/steed/beast at 0.
- **Today:**
  - `at-zero-hp-interrupt` only offers "drop to 1 for a tracker use" (`grant-schema.ts:600`, `smart-tracker.ts:9601`).
  - `zero-hp-floor`; `hp-threshold` covers Power Words only (`activities/types.ts:350-355`).
  - Companions just floor at 0 (`play/companions.ts:11`).
- **Mechanism:**
  ```ts
  { type: "at-zero-hp"; phase: "would-drop"|"dropped"; requiresActive?: string;
    gate?: { save: { ability: AbilityCode; dc: IntExpr /* 10 + 5*uses */ } };
    cost?: { trackerId: string } ; outcome: { setHp: IntExpr } }        // Relentless Rage: 2*level
  ActivityEffect { kind: "on-reduce-to-zero"; outcome: "dust"|"knock-out-1hp"|"dies" }   // Disintegrate, melee knock-out option
  CompanionStatBlock.atZeroHp: "vanish-drop-gear"|"dies"|{ revivable: { withinMinutes: 60, cost: "spell-slot" } }
  ```
  The evaluator runs the savers in an order the player chooses, then the outcomes. A dying→stable track gets a `wakeAt` clock entry that `time-passes` honours.
- **Stored data:** an optional `stableSince` and the tracker counter (trackers exist). No migration.
- **Retires:** the Relentless Rage rider chips (`barbarian.ts:106-111`); the fixed "drop to 1" semantics; and the per-id familiar handling at 0.

### B-F4 — Forms as data, not a spell-id table · severity 4 · size L · migration only if `spellId` is renamed

- **Cases:** 10 Wild Shape at 0, Polymorph overflow re-resolved against the true form; 14 custom partial shape-changers; 17 Wild Shape mid-combat (and cat-9 "Incapacitated ends Wild Shape").
- **Today:**
  - `SELF_FORM_RULES` and `POLYMORPH_SPELL_IDS` are keyed by spell id (`polymorph.ts:31,63-91`).
  - Wild Shape is a tracker, a temp-hp grant and a CR chip (`druid.ts:230-262`), with a patched `wildShapeMaxCR` (`smart-tracker.ts:2059-2083`).
  - Circle forms are `while-active` `ac-formula`/`form-attack` hacks.
- **Mechanism:**
  ```ts
  interface FormRule {
    pool: "beasts" | "bestiary";
    maxCr: IntExpr;
    sizeMax?: CreatureSize;
    excludedTypes?: CreatureType[];
    keeps: {
      abilities: AbilityCode[];
      hp: true;
      proficiencies: "best-of" | "own";
      features: boolean;
      species: boolean;
    };
    casting: "none" | "listed" | "all-but-costly";
    tempHp: IntExpr | "form-hp";
    acFloor?: IntExpr;
    endsOn: ("no-temp-hp" | "incapacitated" | "zero-hp" | "bonus-action")[];
    reshift: boolean;
    concentrationCon: "form" | "best-of";
  }
  // carried by an Activity effect { kind: "assume-form"; rule: FormRule } on Wild Shape, Polymorph, Shapechange, homebrew
  ```
  `assumeBeastForm` reads the rule from the activity. The F1 reducer splits a hit at the form boundary and resolves the remainder against the true-form defenses.
- **Stored data:** keep `polymorphForm.spellId` as is and add `sourceKind` — no migration. Renaming it to `sourceId` would need one.
- **Retires:** `SELF_FORM_RULES`, `POLYMORPH_SPELL_IDS`, the `wildShapeMaxCR` row patch, the Wild Shape temp-hp grant and the circle-form AC/attack hacks.

### B-F5 — Damage entry as typed parts, plus attacker-side modifiers and die faces · severity 3 · size M · no migration

- **Cases:** 15 resistance per target (mixed types, Elemental Adept), per-spell vs per-ray bonuses; 17 physical dice (minimum faces, rerolls), damage typed without a split.
- **Today:**
  - Intake supports typed parts and instances (`damage-intake.ts:171`, `combat-resolution.ts:585`).
  - The tray carries one `damageType` (`damage-tray.ts:41`); `onRoll20` other-type lines are the only second-type path (`:355`).
  - No grant penetrates defenses.
  - Riders know only `oncePerTurn`.
- **Mechanism:**
  ```ts
  interface EnteredDamage {
    parts: {
      amount: number;
      type: DamageType;
      tag: "weapon" | "spell" | `rider:${string}`;
      faces?: number[];
    }[];
  }
  interface AttackerDamageMods {
    ignoreResistance?: DamageType[];
    faceFloor?: { min: number; tags: string[] };
  }
  // grants: { type: "damage-penetration", damageTypes, ignores: "resistance" }, { type: "damage-face-floor", min, appliesTo }
  // rider cardinality: { per: "hit"|"turn"|"cast" }
  ```
  `resolveDamageIntake(parts, targetDefenses, attackerMods)`. The tray offers one total per declared type (prefilled from the action's damage parts) and keeps a single-total fallback.
- **Stored data:** the log's `effect-given` gains optional `parts`. No migration.
- **Retires:** the `onRoll20Lines` second-type special path, `DamageTrayPlan.damageType` and the per-row defense toggle.

### B-F6 — Zones: persistent, anchored areas with a per-creature ledger · severity 3 · size M · additive

- **Cases:** 11 forced movement into areas, moving Conjure Animals' pack; 12 Darkness vs Daylight, Darkness on an object (both (d)); 15 Spirit Guardians exclusions and once-per-turn.
- **Today:** `SpellRecurrence` tokens re-offer the card (`data/types.ts:773-780`, `smart-tracker.ts:7119-7135`). `aura` is informational. Nothing tracks who already saved this turn, whom the caster spared, or a zone's spell level.
- **Mechanism:**
  ```ts
  interface Zone {
    id: string;
    effectId: string /* concentration-owned */;
    actor: CombatantRef;
    spellLevel: number;
    anchor: "caster" | "point" | { object: string };
    trigger: SpellRecurrence;
    spared: string[];
    light?: "darkness" | "magical-darkness" | "bright";
    triggered: Record<string /*combatantId*/, string /*turnKey*/>;
  }
  ```
  "X entered / starts here" opens a pre-filled tray row and refuses a second one with the same turnKey (F9). A light zone counters another by `spellLevel`.
- **Stored data:** a new optional `encounter.zones`. No migration.
- **Retires:** the `recurrence` display-only branch and `aura` as text-only.

### B-F7 — Kill attribution and cross-creature event triggers · severity 3 · size M · additive

- **Cases:** 17 monster kills and who dealt them (Hex/Hunter's Mark move, GWM Hew, "reduce to 0" features); 15 Guardian of Faith's damage budget; 9 the grappler's identity; Life Bond (17, the outside-the-tracker case).
- **Today:** `attackerId` is optional on Chronicle rows (`combat-chronicle.ts:68,105`). A player's tray against a monster only logs (`DamageTray.tsx:216`). There are no event triggers.
- **Mechanism:**
  ```ts
  EncounterEvent { kind: "damaged"|"reduced-to-zero"|"healed"; target: CombatantRef; actor: CombatantRef|null; amount: number }
  Grant { type: "on-event"; event: "you-reduce-to-zero"|"marked-target-at-zero"|"healed-by-own-spell";
          offer: { actionId: string } | { resource: { id: string; delta: IntExpr } } }
  Activity.budget?: { counts: "damage-dealt"; max: IntExpr; endsWhenSpent: true }   // Guardian of Faith
  ```
  The DM's `applyAdversaryDamage` stamps `downedBy` and emits the event. The actor's client turns matching grants into one-tap offers (no auto-resolution).
- **Stored data:** additive `downedBy` and an additive events kind.
- **Retires:** ad-hoc text for Hex/Mark moves and Hew.

### B-F8 — One speed pipeline for every movement mode, plus self-movement · severity 2 · size S · none

- **Cases:** 11 speed changes on every speed, jump multiplier, flyer falls, movement attached to actions.
- **Today:** the staged walk pipeline is `effectiveWalkingSpeedFt` (`smart-tracker.ts:9199-9248`); non-walk speeds bypass it (`sheet-view.ts:731`).
- **Mechanism:** `speedFor(kind: SpeedKind)` applies the same stages to every speed: base → adds → multiplier → exhaustion/armour → condition `speedZero` → floor/cap. Add a `jump:long|high` multiplier rule key, an activity effect `{ kind: "self-move"; fraction: 0.5; provokes: false }` that credits the turn's movement budget, and a derived `airborne` fact that prompts a fall on Prone, speed 0 or Incapacitated without `hover`.
- **Retires:** the walk-only `round1SpeedBonusFt` stage special-casing becomes one stage list.

### B-F9 — Turn identity for per-turn limits · severity 3 · size S · additive

- **Cases:** 17 per-turn limits on others' turns (Sneak Attack on an OA, Spirit Guardians' second save); it also feeds F6's ledger.
- **Today:** per-turn trackers refill at the owner's turn start only (`play/states.ts:130-143`).
- **Mechanism:** add `turnKey = \`${round}:${currentCombatantId}\``(the`EncounterPosition`data exists,`combat-effect.ts:118-124`). Change `TrackerState.usedInTurn?: string`: a per-turn tracker is available when `usedInTurn !== turnKey`. Without a tracker, a "new turn" tap advances a local key.
- **Retires:** the owner-turn-start refill (`recoverPerTurnTrackers`) and part of the `SNEAK_ATTACK_*` id special cases.

### B-F10 — Vision: light level × sight profile · severity 2 · size S · none

- **Cases:** 12 magical darkness, Devil's Sight, Blindsight, Truesight.
- **Today:** `sightUnder(level, darkvisionFt)` with two levels (`light-states.ts:14,41-48`); Devil's Sight is darkvision 120 (`invocations.ts:107-112`).
- **Mechanism:**
  ```ts
  type LightLevel = "dim" | "darkness" | "magical-darkness";
  interface SightProfile {
    darkvisionFt: number;
    seesMagicalDarknessFt: number;
    blindsightFt: number;
    truesightFt: number;
  }
  // grant { type: "darkvision", range, penetratesMagicalDarkness?: true }
  ```
  `sightUnder(level, profile)`. Blindsight and truesight negate darkness within range. The chip carries the source's range note.
- **Stored data:** a new activeFeatures key only.
- **Retires:** the Devil's Sight darkvision hack.

### B-F11 — Table rules (campaign settings) · severity 2 · size M · additive

- **Cases:** 14 optional rules, flanking, fumbles, potion economy, gritty rests, own exhaustion track, familiars attacking, hide policy, death-save variants; 16 natural 1 on checks.
- **Today:** constants are spread around — `REST_MINUTES` (`status-lifetime.ts:37`), `clampExhaustion`/−2/−5 (`compute.ts:58-84`), `DEATH_*_LIMIT`, `consumableActionSlot`. `CampaignDoc` has no settings (`campaign.ts:454`).
- **Mechanism:**
  ```ts
  interface TableRules {
    rest: "standard" | "gritty" | "heroic";
    exhaustion: { max: number; d20PerLevel: number; speedPerLevel: number };
    deathSaves: { successes: number; failures: number };
    nat1: { checks: "none" | "fail"; attacks: "miss" | "fumble-note" };
    flanking: "off" | "advantage" | "+2";
    potions: { self: "bonus" | "action"; feed: "bonus" | "action" };
    familiarsAttack: boolean;
  }
  ```
  Pass it as an explicit `rules` argument (default = RAW) into the pure functions that hold those constants. A solo sheet uses RAW.
- **Stored data:** additive `CampaignDoc.tableRules?`. No migration.

### B-F12 — Cross-sheet one-shot and helper effects · severity 2 · size S · additive (codec tolerance needed)

- **Cases:** 16 Help, Dispel Magic ending another creature's spell; 13 feeding a potion (partial); 10 Raise Dead's penalty set by the caster (partial).
- **Today:** the `ActiveCombatEffect` carrier exists (`combat-effect.ts:91-103`). The duration has no "until used" kind, there is no fading-penalty payload, and a PC's self-lit spell state can't be ended from outside.
- **Mechanism:** `duration: { kind: "until-used"; uses: 1; cap: turn-boundary }`. It is consumed by the target's next matching d20 entry: check, or attack against a named creature. Add `payload: { kind: "fading-penalty"; amount: 4 }` and a "dispel" op that ends the encounter effect, or asks the owner client to end the matching self state.
- **Retires:** Help being log-only (`play/help.ts`).

### B-F13 — Item lifecycle gaps · severity 2 · size S each · none

- **Cases:** 13 attunement prerequisites, dawn as its own clock event, command words vs speech, potion miscibility, ammunition recovery.
- **Today:** `attunement: boolean` (`data/types.ts:3415`). Dawn is aliased to the Long Rest (`rests.ts:72-76`). Entered-roll bands exist only for depletion.
- **Mechanism:**
  - `attunement: boolean | { by: { classes?: string[]; spellcaster?: true; species?: string[] } }`, checked by `canAttune`.
  - A `time-passes`/DM "dawn" event that refills `dawn` counters separately from a rest.
  - Activation `requires: { speech?: true }` checked against conditions.
  - A generic `EnteredRollTable { die: "d20"|"d100"; bands: {min, max, outcome}[] }` reused by depletion and miscibility.
  - At encounter end, an "ammunition recovered: ⌊spent/2⌋" one-tap.

### B-F14 — DM-only and per-instance item state · severity 1 · size L · new collection, no migration

- **Cases:** 13 cursed attunement, Identify, sentient items, artifacts, evolving items; 17 hidden curses.
- **Today:** no curse field; `ItemResourceState` holds counters only (`character.ts:1014`); the DM can't write member docs except through the narrow combat patch.
- **Mechanism:** `dmItemOverlays/{memberUid}_{instanceId}`, read-gated, holding `{ cursed?: { text; revealed: boolean; blocksUnattune: true }; extraGrants?: Grant[]; rolledProperties?: {...}[]; sentient?: {...} }`. The aggregate composes the revealed overlays.
- **Stored data:** a new collection plus Firestore rules.

### B-F15 — A creature roster outside encounters · severity 2 · size M · new data

- **Cases:** 17 creatures outside the tracker (DM-only NPCs, untracked familiars and beasts).
- **Today:** NPCs are ally monsters inside an encounter only (`campaign.ts:132`); companions live on the owner sheet.
- **Mechanism:** a campaign `creatures` collection of `{ id, statBlockRef|homebrew, hp, conditions, owner?: CombatantRef }`. An encounter references entries instead of copying them, and effects (F12) can target them out of combat.

### B-F16 — World facts outside the model · severity 1 · not proposed

- **Cases:** 12 none; 13 magic items resisting damage; 14 Bastions, Circle Magic, Factions; 15 objects in the area; 16 hands and somatic components, planes.
- **Today:** objects exist only in the world model (`types/vitals.ts:59`). Keep these as reference text, and revisit if an owner wants a subsystem.
- **Also:** case 14 "mixed 2014/2024 content" belongs to the category-1 effect-identity family (no same-name dedupe, engine-map §2), not a new one here.

---

## B: (b) Data gaps

| Row                                                                             | Fix                                                                                                                                            | Where                                                                       |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Invisible → Advantage on Initiative; Incapacitated → Disadvantage on Initiative | Add initiative `advantages`/`disadvantages` clauses (the world table already has them, `condition.ts:255-278`)                                 | `src/lib/condition-effects.ts:75` `CONDITION_GATES`                         |
| Slow Fall                                                                       | `damageReduction` with a level multiplier of 5 on falling damage (needs a `levelMultiplier` field beside `addLevel`)                           | `src/data/classes/monk.ts:476-482`                                          |
| Mounted Combatant                                                               | Mounted Strike (Advantage vs unmounted smaller, gated on the `mounted` situation key), Leap Aside (Evasion for the mount), Veer (reaction row) | `pack:data/feats.ts:460-471`                                                |
| Compelled Duel                                                                  | Target-side Disadvantage vs creatures other than the caster (lands once monsters aggregate grants)                                             | `pack:data/spells.ts:229-247`                                               |
| Abjure Foes                                                                     | WIS save vs spell DC, Frightened `conditionApplication`, targets = CHA mod, 1 minute (end-on-damage waits on F2)                               | `src/data/classes/paladin.ts:284-296`                                       |
| Invisibility (spell)                                                            | `endsEarlyOn: ["attack-roll","deal-damage","cast-spell"]` (only takes effect once F2 generalises `endStatesOnAct`)                             | `src/data/spells/level2.ts:511-541`                                         |
| Elemental Adept                                                                 | Penetration + face-floor grants (after F5)                                                                                                     | `pack:data/feats.ts:251-266`                                                |
| Devil's Sight                                                                   | `penetratesMagicalDarkness` (after F10)                                                                                                        | `src/data/invocations.ts:107-112`                                           |
| Disintegrate                                                                    | `on-reduce-to-zero: dust` (after F3)                                                                                                           | `src/data/spells/level6.ts:134-153`                                         |
| Relentless Rage                                                                 | `at-zero-hp` with escalating DC (after F3)                                                                                                     | `src/data/classes/barbarian.ts:411-420`                                     |
| Guardian of Faith                                                               | 60-damage budget (after F7)                                                                                                                    | `src/data/spells/level4.ts:379-391`                                         |
| Knock Out (Cunning Strike)                                                      | Lifetime 1 minute + `target-damaged` + repeat save (after F2)                                                                                  | `src/data/classes/rogue.ts:370-375`                                         |
| Uncanny Dodge                                                                   | Stale comment cites the deleted `lib/damage-reaction.ts`; reword to "halving entered by hand"                                                  | `src/data/classes/rogue.ts:264-277`                                         |
| Persistent Rage / Uncanny Metabolism (cat-8 overlap seen here)                  | 1/Long Rest gate on the topup; Metabolism's heal                                                                                               | `src/data/classes/barbarian.ts:440-445`, `src/data/classes/monk.ts:518-527` |
