# Mechanics

How d20 Folio's rules engine works today: what the catalogue says, how it folds into a sheet,
how a use is played, and how the rules are tested. When this page and the code disagree, the code
wins; fix this page in the same change.

The engine never rolls. The player rolls physical dice and enters the result; the sheet pays,
applies, logs and undoes. Every number a rule produces can be explained by the value breakdown
(`src/lib/value-breakdown.ts`, `ruleParts` in `src/lib/rules/index.ts`).

No module reads English prose to decide a rule. Code speaks ids; text lives in the localized
catalogue (`src/i18n/<locale>/srd/*.json`) and is resolved only at render.

## 1. The catalogue

Types: `src/data/types.ts`. Public SRD 5.2.1 data: `src/data/`. Everything else lives in the
private `content-pack/` and joins through the `@pack` seam (`src/lib/pack-merge.ts`; an id clash
throws at init).

### What an entry is

- Spells `SrdSpellData` (`src/data/spells/`), class features `SrdClassFeatureData`
  (`src/data/classes/`), feats `SrdFeatData`, species traits `SrdRaceTrait`, magic items
  `SrdMagicItemData` (`src/data/magic-items/`), monsters `MonsterStatBlock` with typed entries
  (attack, save, narrative, spellcasting; `src/data/monsters/`), beast forms `BeastStatBlock`,
  companions `CompanionStatBlock` (a spell's or feature's `companion`).
- Also invocations, maneuvers, metamagic, backgrounds, weapons, armor, gear, conditions.

### Flat fields vs authored effects

- **Flat fields** hold most mechanics. A spell's `damageDice`, `damageDicePerUpcast`,
  `saveAbility`, `attackType`, `damageOnSave`, `instances`, `secondaryDamage`, `healDice`,
  `conditionApplication`, `targeting`, `revives`, `hitPointThreshold`, `onReduceToZero`… A
  feature action (`SrdActionDef`) has the same vocabulary plus `EffectRiders` (forced movement,
  speed reduction, HP-max reduction, swallow).
- **Authored effects** (`CatalogueEffect`, `src/lib/catalogue-effects.ts`) are the few effects no
  flat field states. They are a subset of `ActivityEffect` with one exact schema:
  `damage`, `temp-hp`, `speed-bonus`, `fall-if-aloft`, `speed-halved`, `speed-zero`,
  `next-attack-advantage`, `save-disadvantage` (`against: "actor-spells"`), `recover-slots`,
  `exhaustion`, `damage-roll-penalty`, `hit-point-dice`, `dispel`, `self-move`. Every effect
  may carry `fromLevel`, `saveOutcome` (`"success"`, or `"any"`: made or failed),
  `vsCreatureTypes`, `notVsCreatureTypes`.
- Where they appear: a spell's `effects`, `onEnd` (Fly: a target still aloft falls),
  `perTargetChoice` (the caster picks one list per target); a feature action's `effects`;
  a `granted-action` grant's `effects`; a repeat save's `onFailedRepeatSave`; an
  `action-outcome-rider` grant's `effects` (`actionOf`: another feature whose action outcome it
  adds to, stamped as `summary.outcomeRiders`; its states sit in the rider's own `targetStates`).
- Other spell facts: `counter: { slot: "kept" }` (Counterspell), `budget` (below), `zone`
  (below), `formRule` (forms), `companion` / `summonedMonsters` / `bestiaryPick` /
  `summonTurn` (summons), `suppressesMagic` (Antimagic Field), `followUp` (an action the
  active spell grants without a new slot), `recurrence`, `endsOnSuccessfulSave`.

### Numbers: `Scalar` and dice

`src/lib/scalar.ts`, `src/types/integer-expression.ts`.

- A `Scalar` is a plain number or an `IntegerExpression` (`fixed`, `binding`, `add`,
  `multiply`, `divide` with floor/ceil, `min`, `max`, `table`).
- Bindings come from one vocabulary, `SCALAR_BINDINGS`: `level.total`, `level.class.<id>`,
  `level.feature`, `pb`, `ability.mod.<A>`, `ability.score.<A>`, `cast.level`,
  `cast.base-level`, `tracker.used.<id>`, `zero-hp.uses.<id>`. Anything else fails conform.
- A `DiceScalar` is a dice string (`"2d6"`), a `DiceFormula` with expression counts, or a
  `DiceTable` (`{ kind: "dice-table", input, rows: [{ atLeast, dice }], below }`), so a step
  can change the die size.
- Every resolution reports the bindings it read, so the breakdown can say "cast level 4".
- Older dialects still exist beside it: `NdM` upcast strings (`damageDicePerUpcast`, resolved by
  `scaleUpcastDice`), tracker formula strings (`"PB"`, `"level*5"`, `src/lib/tracker-formula.ts`)
  and an Activity's `byLevel` maps.

### While-active states

A `while-active` grant (`src/lib/grant-schema.ts`) is a state the sheet can light; its nested
grants apply only while its `activeKey` is lit.

- `activeKey`: the state's id. Lit keys are `session.activeFeatures` plus the world's standings
  (`sessionActiveKeys`, `src/lib/world-standing-grants.ts`); a key active both ways counts once.
- `duration`: `maintained` (kept up by an attack or a bonus-action extend: Rage; `upkeep-waiver`
  drops the upkeep), `timed` (minutes, `maxRounds`, `byCastLevel`, `endsEarlyOn`), or
  `turn-boundary` (`phase`, `turns`). `afterEffect` lights a short successor state.
- `activatedByCast`: spell ids whose cast lights it by itself (Smite of Protection on Divine
  Smite). Read by `statesActivatedByCast` (`src/lib/play/on-cast.ts`).
- `activatedByAction`: only these action rows of the feature enter it (Step of the Wind's Focus
  version). Absent: every action of the feature does.
- `recipient`: `caster` lights on the caster when the cast commits; `selected` waits for a
  target (Warding Bond, Bless on others) and lands as an encounter effect.
- `targetScope` (`marked` / `cursed`), `minLevel`, `label`, and `activation` (an item's action,
  tracker or `resourceCost`, `reuseSave`).
- A feature's `targetStates` are states its actions put on a target (Stunning Strike's half
  Speed); they never light on the owner. `onlyAgainstCreator: true` makes the grants count only
  against the creature that put the state there: a `disadvantage-on` save `vs: "spells"` shows
  on that caster's spell tray row (`incomingSaveModes`), never another caster's.
- Other lit-key families feed the same fold: base actions (Dodge), cover, light, situations,
  surprise, Wish stress, drunk potions (`potion:<itemId>`), fading penalties
  (`aggregateWithConditions`, `src/lib/aggregate-character.ts`).

### Triggers

Two grammars:

- **Reaction tokens** (`ReactionTrigger`, closed list `ALL_REACTION_TRIGGERS`): when a reaction
  may be taken (`hitByAttack`, `creatureCastsSpell`, `creatureLeavesReach`,
  `creatureAttacksYou`, `creatureFailsD20Test`…). On a reaction spell (`reactionTrigger`, one
  or several) or action (`trigger`). Shown as a localized "Trigger: …" line; a new token needs
  its `combat.reactionTrigger_<token>` key in both locales.
- **Trigger rules** (M8): `{ type: "trigger", on, if?, do, limit? }`.
  - `on`: `initiative`, `short-rest`, `long-rest`, `turn-start`, `turn-end`,
    `reduced-to-zero`, `d20-test-failed`, `cast-spell`, `damage-dealt`.
  - `if`: `school`, `slot`, `target: "marked"`, `within`, `by: "any-creature"`.
  - `do`: `restore-tracker` (`full` or an `amount` formula), `offer { actionId }`,
    `hit-point-dice`, and on `cast-spell` with a slot `temp-hp { perSlotLevel }` (Abjuration
    Adept) and `speed-bonus { perSlotLevel }` (feet added to this turn's movement,
    Transmutation Adept), applied at the cast inside its undo (`firedCastTriggers().gains`).
  - `limit`: `{ max, per: long-rest | short-rest | turn | round }`, counted on the session
    tracker keyed by the source id.
  - Read today (`src/lib/smart-tracker.ts`): `firedTriggerRestores` for `initiative` and
    `short-rest` (Persistent Rage, Sorcerous Restoration); `firedTriggerOffers` for
    `reduced-to-zero` (Hunter's Mark / Hex move, `src/lib/play/mark-offers.ts`). The rest of the
    vocabulary is valid data and inert until its reader lands.
- **On-cast specs** on a class feature (`mechanics.onCast`: tracker refill, lower-slot regain,
  Wild Magic surge), applied as cast refunds (`src/lib/play/on-cast.ts`,
  `src/lib/on-cast-effects.ts`).

### Zones and budgets

- `SpellZone` (M9): `anchor` (caster / point / point-or-object), `spellLevel`, `light`,
  `spares: "chosen"`, `triggers` (`enter`, `start-turn`, `end-turn`, `move-within`).
- Runtime `src/lib/zones.ts`: `activeZones`, `zoneTriggers` (once per creature per turn, except
  `move-within`; spared creatures skipped), `zoneLight` (darkness vs light by level, newer wins a
  tie), `defaultSpared` (every ally, never none), `zoneEffectForCast`. No geometry: the table
  says who is inside; the engine says whether it counts. Details:
  `docs/architecture/2026-11-zones.md`.
- `budget: { max, counts: "damage-dealt" }` (Guardian of Faith: 60), counted by `budgetSpent`.

### Conditions and `ends`

- `CombatConditionApplication`: `options`, `max`, `on` (`hit`, `failed-save`, `automatic`,
  `passed-check`), `lifetime` / per-condition `lifetimes` (`source`, `manual`, `timed`,
  `turn-boundary`) and `ends`.
- `ConditionEnd`: `target-damaged`; `repeat-save` (ability, at the target's turn end, optional
  `onFailedRepeatSave` effects); `actor-incapacitated` (a grapple).
- One pure rule decides early ends: `src/lib/condition-ends.ts`; the fight reads it through
  `src/lib/play/fight-condition-ends.ts`.

## 2. Grants → rules

### The Grant language

- A `Grant` is a typed mechanic on a catalogue entry (`grants: Grant[]`). Its grammar is one exact
  runtime schema, `GRANT_SCHEMA` in `src/lib/grant-schema.ts` (154 kinds today); the TypeScript
  type is inferred from it. Composite kinds (`while-active`, `choice-grant-bundle`) nest grants
  through the same schema.
- Per-kind meaning is documented next to each kind in `grant-schema.ts` and its evaluator branch
  in `src/lib/grants.ts`.
- `conformGrant` / `conformGrants` validate catalogue grants; `conformHomebrewGrant` accepts a
  player's looser text.

### The fold

- `aggregateCharacterGrants(character, session)` (`src/lib/aggregate-character.ts`) is the one
  input for sheet-wide numbers. It:
  1. applies the form layer (merged gear stops granting);
  2. gathers sources: build (`resolveAllGrantSources`, `src/lib/resolve-grant-sources.ts`),
     encounter effects aimed at this character, the lit-key families above;
  3. calls `evaluateGrants(sources, activeKeys, bundleChoices, context)` (`src/lib/grants.ts`);
  4. re-evaluates without conditions the character is immune to, returning `conditions`,
     `suppressedConditions` and `form`.
- `effectiveConditions(doc)` is the read for anything that applies a condition's rules.
- `evaluateGrants` returns `AggregatedGrants`: typed lists (free casts, granted actions, AC
  formulas, activatable groups, triggers, zero-HP savers…) plus `values`, the folded rules.

### Rules

`src/lib/rules/index.ts` is the passive-rules grammar most simple kinds compile to
(`compileGrant`):

- A `Rule` is `add` / `max` / `min` on a `RuleTarget`, or a `flag`. Targets include
  `sense:*`, `speed:*`, `jump:*`, `prof:*`, `defense:*`, `ac:bonus`, `save:*`,
  `initiative:bonus`, `spell:save-dc:*`, `spell:attack:*`, `crit:*`, `attunement:slots`,
  `block:*`, `exhaustion:recovery:*`, `ability:floor:*`.
- `foldRules`: rules on one target group into buckets (`stack`, default the op); a bucket folds
  by its op (highest, lowest, sum) and the buckets add. Darkvision = highest base + every bonus.
- `when` keeps a conditional contribution apart (`no-heavy-armor`, `round-1`, armor states);
  the reader passes the facts it knows. Ability terms (`{ ability, min? }`) stay unresolved.
- Kinds not compiled to rules keep their own evaluator branch in `grants.ts`.

### Stacking: the same effect applies once

`docs/architecture/2026-11-effect-identity.md` (M10). Before `foldRules`,
`sameEffectsDontStack` groups rules by source identity (the catalogue entry, or the English
name for an entry-less homebrew source). Within an identity with several sources, `add` rules
become `max` (penalties `min`) in their own bucket, so two Shields of Faith give +2. Different
effects still stack. Same-name effects outside the grant fold (two Slow masteries) are not
covered yet.

## 3. Activities

`src/lib/activities/` — one shape (`Activity`, `types.ts`) for everything a creature can do.

- **Fields**: `source`, `cost` (economy, minutes, reaction `trigger(s)`, ritual, components,
  `pay` / `orPay`, `economyCategory`, `maxUsesPerTurn`, `ammunition`), `requires`, `target`,
  `attack` / `save` / `skill`, `repeats`, `effects`, `perTargetChoice`, `concentration`,
  `duration`, `recurrence`, `followUp`, `fact`.
- **Translators**: `from-spell.ts` (`translateSpell`), `from-action.ts` (feature, trait, feat,
  item, invocation and homebrew actions), `from-creature.ts` (monster entries, beast and
  companion attacks), `from-weapon.ts`, `from-item.ts` (item activation),
  `from-granted-action.ts`. Monster prints are read by `monster-print*.ts`.
- **Effect kinds** (`ActivityEffect`): `damage`, `heal`, `temp-hp`, `condition`,
  `end-condition`, `status`, `mark`, `maintain`, `grant-die`, `heroic-inspiration`,
  `stabilize`, `revive`, `hp-threshold`, `restore-resource`, `reduce-damage`, `check-bonus`,
  `next-attack-advantage`, `speed-halved`, `speed-zero`, `speed-bonus`, `speed-reduction`,
  `fall-if-aloft`, `recover-slots`, `exhaustion`, `damage-roll-penalty`, `hit-point-dice`,
  `dispel`, `self-move`, `forced-movement`, `hp-max-reduction`, `swallow`.
- **Gaps**: a translation returns `{ activity, gaps }`. A source field the Activity cannot carry
  is a named gap, never a silent drop. The allowed gaps and reasons are pinned in
  `tests/unit/activities-translation.test.ts` (summons, zone, budget, `onEnd`, `counter`,
  monster multiattack and movement, prose-only entries, a few data-to-fix fields).
- **Readers**: `resolveActions` (`src/lib/smart-tracker.ts`) builds the sheet's action rows from
  Activities; `src/lib/activities/catalogue.ts` lists every catalogue activity for tests.

## 4. Play

All play rules are pure transitions in `src/lib/play/` (character in, next character out). Side
effects (log, undo, persistence, the encounter) stay with the store
(`src/stores/characterStore.ts`) and the providers.

### The one commit path

- Every use goes through `executeAction(action, intent?)` in
  `src/features/character/center/TurnEconomyProvider.tsx` (old cockpit and the new UI's
  `src/domains/play/ui/*` alike). It:
  1. picks the execution (`executionFor`, `src/lib/play/cast-execution.ts`): inside a fight a
     non-spell use spends the turn's economy; spells, cast pools, extended casts and anything
     outside a fight do not; a ritual takes no slot;
  2. prepares it (`prepareResolution`): pool spends, free-cast lists, cast level, source and
     Metamagic (`configureSpellCast`);
  3. asks for targets when the use has a target step (`targetStepFor`);
  4. commits (`commitCastOption` for spells, else `commitAction`): payment revalidated against
     the live character (`src/lib/play/cast-payment.ts`), the state lit
     (`activateActionState`, `action-state-commit.ts`), Concentration held, the log written.
- Undo is causal (`beginCausalUndo`, `src/lib/play/causal-patch.ts`): it takes back exactly what
  the commit changed and refuses if someone else changed the same field since.
- Sheet changes are named events applied by `applySheetEvent` (`src/lib/play/sheet-events.ts`).
  `withEventConsequences` settles 0-HP consequences and ends attunement at death on every path.
- The turn economy itself: `src/stores/combatStore.ts` (slots this turn) and the pure planner
  `src/lib/turn-economy.ts`. End Turn's decisions (maintained-state prompts, what ended):
  `src/lib/play/end-turn.ts`. Per-turn caps (`maxUsesPerTurn`) and `per-turn` trackers are only
  spent inside a fight (`spendsOncePerTurnUse`).

### Trackers and rests

- Trackers: `TrackerSpec` (`total` formula, `recovery`: `long-rest`, `short-rest`, `dawn`,
  `per-turn`, `manual`; `isPool`, `unit`, `longRestRecovery`, `autoRecover: false`), resolved by
  `resolveTrackers` (`smart-tracker.ts`). Item charges: `SrdMagicItemData.resources`
  (`src/lib/item-resources.ts`).
- `longRestCharacter` / `shortRestCharacter` (`src/lib/play/rests.ts`). A rest needs at least
  1 HP. Long Rest: HP to the effective max (HP-max reductions end first), every Hit Point Die
  back, 1 Exhaustion level off (+ `exhaustion-recovery` grants), rest-based trackers back
  (`manual` ones kept), states that end on the rest, long-rest summons gone, fading penalties
  down by one. Short Rest: the player enters the rolled Hit Dice total; `short-rest` trigger
  rules fire.
- Recoveries that buy one resource with another (Font of Inspiration, Arcane Recovery):
  `src/lib/play/recoveries.ts`.

### Time and dawn

`src/lib/play/time.ts`.

- `passTime(doc, minutes)` runs every countdown (1 round = 6 s). What runs out ends as at End
  Turn; turn-bound and maintained states can't outlast a stretch away from the turn order.
- `session.timeOfDay` is optional (minutes since midnight). Dawn is 06:00, dusk 18:00.
  Crossing dawn recharges dawn item charges (`equipmentAfterDawn`). With no time of day set, a
  Long Rest counts as a dawn (`restCrossesDawn`).
- The campaign clock (`src/lib/play/clock.ts`, `campaign-clock.ts`): a character in a campaign
  reads its time of day and countdowns from `campaign.gameClock` through `clockFor`; a solo sheet
  reads its own. No other file reads `session.timeOfDay` (`clock-reads.guard`). Countdowns are
  derived on read: `docAtClock` passes the campaign minutes since `session.clockSeen`, so any
  viewer sees them; the owner's device stores that catch-up (`catchUpCampaignClock`). A member's
  «Passa il tempo» or rest steps the clock forward (at most 1440 minutes, recorded as theirs);
  the undo steps back, by the writer or the DM only (firestore.rules `gameClockWrite`). Behind
  `VITE_COMBAT_EFFECTS_V26`.
- Stable at 0 HP is tracked (`stableMinutes`); the 1d4-hour wake is the table's roll.

### Conditions

- Rules for the 15 conditions: `CONDITION_RULES` (`src/lib/condition.ts`, includes Exhaustion
  and implied conditions) and `CONDITION_GATES` (`src/lib/condition-effects.ts`, the self-side
  slot bans, auto-fails and roll modes). Attacks against a creature:
  `src/lib/play/attacks-against.ts`.
- Add / remove: `src/lib/play/conditions.ts` (world-first: booked in the mechanics world when it
  can express it, else the chip alone).
- Source-gated conditions (Frightened only while the source is seen): `sheetConditionEffects`
  (`src/lib/condition-sources.ts`), the one entry point.
- Immunity suppresses a condition in the fold (it returns when the immunity ends).
- Exhaustion: a 0–6 stepper (`src/lib/compute.ts`), −2 per level on D20 Tests.

### Concentration

- `changeConcentration` (`src/lib/play/concentration.ts`): swapping or dropping ends every state
  the old spell held, its countdown and a self form it sustained (unless held in full and
  `permanentWhenHeld`). Stored as an id ref (`src/lib/concentration.ts`).
- Damage asks a save, DC `min(30, max(10, floor(damage / 2)))` (`concentrationSaveDc`,
  `compute.ts`); the player rolls. Incapacitating conditions break it
  (`conditionBreaksConcentration`).
- `concentration-damage-proof` spares the save: on one `spellId` (Relentless Hunter), on
  `spells: "any"` (Boon of the Iron Mind) or `spells: { school }` (Focused Conjuration)
  (`damageQueuesConcentrationSave`). With `alsoWhileIncapacitated`, only Petrified and
  Unconscious still end it (`conditionEndsHeldConcentration`, Iron Mind).

### Damage, 0 HP and death

- `takeDamage` (`src/lib/play/damage.ts`) composes the hit's stages in RAW order: an incoming
  halving (Uncanny Dodge), absorb pools (Arcane Ward), then `reducePcDamage`
  (`src/lib/combat-transition.ts`): persistent-effect transfers and floors, temporary HP,
  0 HP → Unconscious, damage at 0 = a death-save failure (two on a critical), massive damage
  kills. Own defenses: `src/lib/damage-intake.ts` (flat reductions, then resistance, then
  vulnerability).
- A hit from another player or the DM runs the same rule (`src/lib/play/peer-damage.ts`, M1).
- Zero-HP savers (`at-zero-hp-interrupt` grants: Relentless Endurance, Relentless Rage):
  `src/lib/play/zero-hp-savers.ts`; the drop records which states were lit.
- `onReduceToZero` (Disintegrate) settles after the savers. Dying ends attunement and
  owner-death summons. Revive: `src/lib/play/revive.ts` (within the spell's minutes; dust
  needs `fromDust`). Raise Dead's fading −4: `src/lib/play/fading-penalties.ts`.

### Forms

`docs/architecture/2026-11-forms-layer.md` (M2).

- A form is `session.activeForm`, a layer read by the aggregate, never written into the build.
  Old stamped forms (`session.polymorphForm` + `prior`) still revert.
- The rule is catalogue data: `SelfFormRule` (`formRule` on Polymorph, Shapechange, Animal
  Shapes, True Polymorph and Wild Shape). Pool, CR cap (or a class-table column), size, kept
  scores, gear merging, Temporary HP, `endsOn`, `blocksCasting` (+ `form-casting` grants).
- Transitions: `src/lib/play/forms.ts`, `src/lib/polymorph.ts`, `src/lib/form-pool.ts`,
  `src/lib/form-casting.ts`. `takeDamage` and `addCondition` end a form when due.

### Summons and companions

`docs/architecture/2026-11-summons.md` (M6).

- Stat blocks: `CompanionStatBlock` with `lifecycle.endsOn` (`concentration`, `0-hp:vanish`,
  `0-hp:dies`, `owner-death`, `damaged`, `timer`, `long-rest`) and `revive`. Raised monsters:
  `summonedMonsters`; picked ones: `bestiaryPick`; turn order: `summonTurn`
  (`src/lib/play/summon-initiative.ts`).
- Instances: `session.summons[sourceId]` (cast level, `fallen`); HP, variant and count stay in
  `companionHp` / `companionVariant` / `companionCount`. Transitions:
  `src/lib/play/companions.ts`. Companion attacks: `src/lib/play/companion-attack.ts`.

### Effects across sheets

- What one creature puts on another rides the encounter's append-only effect ledger
  (`apply` / `revoke` ops; `src/types/combat-effect.ts`, `src/lib/combat-effects.ts`).
  Payloads: `grant-group` (a lit state on the target), `target-mark`, `condition`, `zone`.
  Durations: the actor's Concentration, a turn boundary, or the encounter. One effect per
  stacking key; undo revokes the exact instance.
- The target's aggregate folds them in (`resolveCombatEffectGrantSources`). Outcome riders
  (Stunning Strike's success, Web Bolt): `src/lib/play/outcome-effects.ts`.
- Writers of a feature's target state, a zone and a condition's save DC wait for the v0.26.0
  Firestore rules behind `VITE_COMBAT_EFFECTS_V26` (`src/lib/deployed-rules.ts`). Pool and
  state spends from another device wait behind `VITE_PEER_SPENDS_LEDGER`
  (`docs/architecture/2026-11-cross-device-hits.md`).
- The DM's monsters play from their stat block: `src/lib/play/monster-action.ts`,
  `monster-multiattack.ts`, `monster-concentration.ts`; the encounter world:
  `src/lib/encounter-world-store.ts`.

### Smaller rules

- **Hands** (`src/lib/play/hands.ts`): free hands from the equipped shield and the last weapon
  attacked with; a cast whose S/M components need a hand gets a warning only. The table's count
  wins.
- **Flight** (`src/lib/play/flight.ts`): a flyer without hover falls if knocked Prone; the
  sheet has no altitude, so it warns (`proneInFlight`). Falling damage: `src/lib/play/fall.ts`.
  Fly ending: `fall-if-aloft`.
- **Ammunition**: a ranged weapon declares its `ammunitionId`; each attack expends one piece.
  `recoveredAmmunition` (half, rounded down) exists but has no screen yet.
- **Attunement** (`src/lib/attunement-guard.ts`): `canAttune` checks the limit (3 +
  `attunement:slots`), one copy per item and `attunementBy` (spellcaster, class, species, or an
  attuned item). `force` overrides. Unequipping a copy ends its lit states
  (`src/lib/play/item-held-states.ts`).
- **Potions**: drinking lights `potion:<itemId>` (`src/lib/potion-states.ts`); mixing offers
  the DM's d100 table (`src/lib/play/potion-mixing.ts`).
- Also in `src/lib/play/`: cover, light, surprise, Help, grapple, mounts, swarms, suffocation,
  provisions, terrain, Ready, Counterspell's kept slot, the cast record, Wish, Magic Jar.

## 5. Table rules

`src/lib/table-rules.ts` (M16).

- `RAW_TABLE_RULES` is 2024 RAW: short rest 60 min, long rest 8 h; Exhaustion max 6, −2 D20
  and −5 ft per level; death saves 3/3; potions drink and administer as a Bonus Action;
  flanking off; no fumbles; familiars don't attack; a natural 1 does nothing special on a check
  or save and misses on an attack; Hide RAW; hero/plot points off; Bastions, Circle Magic,
  factions and evolving items off.
- A campaign may store `tableRules` overrides (`src/types/campaign.ts`), conformed field by
  field on read (`conformTableRules`, `src/features/campaigns/campaign-io.ts`) and merged over
  RAW by `effectiveTableRules`. A solo sheet always plays RAW.
- Pure functions take `rules: TableRules = RAW_TABLE_RULES` as an argument; nothing reads them
  globally. Today `src/lib/status-lifetime.ts` (rest lengths), `src/lib/compute.ts`
  (Exhaustion cap), `src/lib/srd-resolve.ts` (potion economy) and `src/lib/play/checks.ts`
  (natural 1) accept them. No screen passes a campaign's rules yet, and rests, death saves and
  damage still use their RAW constants.

## 6. The conformance suite

`tests/unit/conformance/` (public) and `content-pack/tests/unit/conformance/` (pack subjects).
Corpus: `docs/architecture/2026-11-edge-cases/corpus.md` (297 cases), judged in
`verdicts.md`, grouped into families in `families.md`; plan in
`docs/architecture/2026-11-edge-cases.md`.

### Writing a case

```ts
rule(
  {
    category: 9,
    case: "Title exactly as in corpus.md",
    source: "SRD; SAC #4",
    status: "works",
  },
  () => {
    /* assert the RULE, with real catalogue data and play functions */
  }
);
```

- `rule()` (`tests/unit/conformance/rule.ts`): `status: "works"` is a plain `it`; an `M<n>`
  family or `"data"` is `it.fails`. The body still asserts the rule, so the day the mechanism
  lands the test turns red and the change flips the status.
- A case that needs code not written yet imports it at run time
  (`await import(/* @vite-ignore */ id)`), so a missing module fails the case, not the build.
- `tests/unit/conformance-cases.guard.test.ts` checks every corpus case has exactly one test;
  pack subjects are listed in `tests/unit/conformance/pack-cases.ts`.
- CI prints `conformance <green>/297` (`scripts/conformance-count.ts`, ci.yml and verify.yml);
  a `[works]` case that fails is a regression and fails the step.

### Families

M1 damage through the target's own pipeline · M2 forms as a computed layer · M3 condition
occurrences (source, early ends, immunity) · M4 damage packet stages · M5 turn-scoped usage
windows · M6 summon lifecycles · M7 zero-HP pipeline · M8 trigger rules · M9 zones · M10 effect
identity and stacking · M11 one number language · M12 outcome-gated effects and end hooks · M13
cast record · M14 one speed pipeline · M15 vision · M16 table rules · M17 one-shot effects on
another sheet · M18 item lifecycle · M19 a creature roster outside encounters · M20 DM-only item
overlays.

### Count today (static count of the status tags, main `297f8f98`)

- **265 of 297 cases are tagged `works`**: 245 of 267 public, 20 of 30 pack.
- **32 pending**: M20 7, M6 6, M4 2, M3 2, M16 2, M17 2, M18 2, M19 2, and one each for M1,
  M2, M8, M10, M12, M13, M14. No case is tagged `"data"`.
- CI's printed number counts only `[works]` cases that pass.

## 7. Homebrew

Homebrew uses the catalogue's own shapes and the same exact schemas (`src/lib/exact-schema.ts`).

- One validator per kind: `src/lib/homebrew-grants.ts` (feature grants),
  `homebrew-spells.ts` (`CustomSpell.mechanics`, the `SrdSpellData` shape),
  `homebrew-items.ts` (weapons and items, the magic-item shape), `homebrew-actions.ts`
  (feature actions, `SrdActionDef`), `homebrew-monsters.ts` (stat blocks; a text-only entry
  is read by the monster-print readers). The shared field loop: `src/lib/homebrew-conform.ts`.
- A field the schema rejects is left out of play: never repaired, never erased from storage. An
  unknown field (a newer client's) is kept and inert.
- After validation homebrew takes the catalogue's path (`homebrewSpellData` → `translateSpell`,
  `homebrewActionDef` → `translateAction`, grants → `resolveGrantSourcesForFeatures`).
- `tests/unit/homebrew-expressibility.guard.test.ts` fails CI when a grant kind, spell, item,
  stat-block or action field, or Activity effect kind exists that homebrew cannot express and
  round-trip through both codecs. Exemptions name their reason.
- Same-name stacking treats an entry-less homebrew source as the catalogue entry with its
  English name (M10).

## Adding a mechanic

Test first (a conformance case or unit test from the rule's text). Add the data once in its exact
schema (a flat field, a `CatalogueEffect`, a grant kind or a rule target), then one generic reader
in `src/lib/`; never a branch on a feature id. Homebrew gets it through the same schema (the guard
checks). New strings ship in both locales; non-SRD content goes to the pack.
