# Rules coverage (generated)

<!-- Written by `pnpm rules:coverage` from the code and the tests; do not edit by hand.
     tests/unit/rules-coverage-generated.test.ts fails when this page is out of date. -->

Side by side with the hand-written [RULES_COVERAGE.md](RULES_COVERAGE.md) and
[RULES_GLOSSARY_AUDIT.md](RULES_GLOSSARY_AUDIT.md) until the coordinator has compared
them; then those tables go. How each class is counted: `tests/unit/__helpers__/rules-coverage.ts`.

## Catalogues (public SRD 5.2.1): what the data declares

**Declared, not proven.** These counts read what each entry's data declares: auto =
an effect the engine could apply with no input; 1 tap = a counter, an action, a cast or
a pick; text only = nothing declared, the table plays it by hand. A declared effect
that no screen applies still counts as auto here; the proven class comes from the
edge cases below, through the functions a screen calls.

| Catalogue | Entries | Declared auto / 1 tap / Text only / Impossible |
| --- | --- | --- |
| Spells | 339 | 58 / 201 / 80 / 0 |
| Class features | 218 | 123 / 88 / 7 / 0 |
| Species traits | 33 | 21 / 9 / 3 / 0 |
| Feats | 19 | 9 / 6 / 4 / 0 |
| Magic items | 258 | 114 / 97 / 47 / 0 |
| Monster entries (330 stat blocks) | 1326 | 0 / 653 / 673 / 0 |

## Edge cases

263 of the corpus's 304 edge cases work, each proven by a public test; 10 more have a public test waiting for the engine (docs/architecture/2026-11-edge-cases/corpus.md). Cases about pack content are counted by the pack's own tests.

## Rules Glossary

124 rows: 106 modeled, 10 table-side, 8 gaps. Modeled = the audit found the engine applies it, and the tests named exist (they prove the engine, not yet that a screen calls it); table-side = left to the table by design; gap = a table would want the app to apply it. First pass from RULES_GLOSSARY_AUDIT.md, under review by the rules lane.

| Entry | Status | Proof | Where, or why |
| --- | --- | --- | --- |
| Ability Check | modeled | `compute.test.ts` | `compute.ts` skillBonus; `compute.test.ts` |
| Ability Score and Modifier | modeled | `ability-score-breakdown.test.ts` | `ability.ts`; `ability-score-breakdown.test.ts` |
| Action | modeled | `combat-economy.test.ts` | `combat-economy.ts`; `combat-economy.test.ts` |
| Advantage, Disadvantage | modeled | `advantage-rail.test.ts` | `d20-test.ts` evaluateD20Test; `advantage-rail.test.ts` |
| Ally, Enemy | modeled | `help-action.test.ts` | `play/help.ts`; `help-action.test.ts` |
| Area of Effect (all shapes) | table-side | — | No grid: the table picks targets, the damage tray resolves each |
| Armor Class | modeled | `grants-ac-bonus-parity.test.ts` | `compute.ts` computeAC; `grants-ac-bonus-parity.test.ts` |
| Armor Training | modeled | `state-text.test.ts` | `condition-effects.ts` (partial: casting not blocked); `state-text.test.ts` |
| Attack action | modeled | `phase4-economy-parity.test.ts` | `turn-economy.ts` (Extra Attack, Light, Nick); `phase4-economy-parity.test.ts` |
| Attack Roll | modeled | `compute.test.ts` | `compute.ts` weapon/spell attack bonus; `compute.test.ts` |
| Attitude | table-side | — | An NPC's attitude is the DM's; Influence is a check against the DM's DC |
| Attunement | modeled | `attunement-guard.test.ts` | `attunement-guard.ts`; `attunement-guard.test.ts` |
| Aura | gap | engine done; no screen calls `usePartyAura` | #3 |
| Blinded | modeled | `condition-effects.test.ts` | `condition-effects.ts`; `condition-effects.test.ts` |
| Blindsight, Truesight | modeled | `can-see.test.ts` | `light-states.ts` sightUnder; `can-see.test.ts` |
| Bloodied | modeled | `hp-band-bloodied.test.ts` | `hp-band.ts`; `hp-band-bloodied.test.ts` |
| Bonus Action | modeled | `combat-economy.test.ts` | `turn-economy.ts`; `combat-economy.test.ts` |
| Breaking Objects | gap | engine done; no screen calls `objectTarget` | #12 |
| Bright Light, Dim Light, Darkness, Darkvision | modeled | `light-states.test.ts` | `light-states.ts`; `light-states.test.ts` |
| Burning | gap | engine done; no screen calls `setOnFire` | #6 |
| Cantrip | modeled | `utils.test.ts` | `utils.ts` scaleCantripDice; `utils.test.ts` |
| Carrying Capacity | modeled | `carry-as-larger-size.test.ts` | `compute.ts`; `carry-as-larger-size.test.ts` |
| Challenge Rating | modeled | `encounter-difficulty.test.ts` | `encounter-difficulty.ts`; `encounter-difficulty.test.ts` |
| Charmed | modeled | `condition-effects.test.ts` | `condition-effects.ts`; `condition-effects.test.ts` |
| Climbing, Crawling, Swimming | modeled | `difficult-terrain.test.ts` | `play/difficult-terrain.ts` ×2 meter (partial); `difficult-terrain.test.ts` |
| Concentration | modeled | `conformance/02-concentration.test.ts` | `compute.ts` DC, `play/concentration.ts`; `conformance/02-concentration.test.ts` |
| Condition | modeled | `conformance/09-conditions.test.ts` | `condition-effects.ts`; `conformance/09-conditions.test.ts` |
| Cover | modeled | `cover-states.test.ts` | `cover-states.ts`; `cover-states.test.ts` |
| Creature Type | modeled | `polymorph.test.ts` | `play/damage-tray.ts` riders by type; `polymorph.test.ts` |
| Critical Hit | modeled | `damage-tray.test.ts` | `vitals.ts` (two failures at 0 HP); `damage-tray.test.ts` |
| Curses | modeled | `item-overlays-rules.test.ts` | Cursed items bind (`item-overlays.ts`); partial: Bestow Curse |
| D20 Test | modeled | `d20-test.test.ts` | `d20-test.ts`; `d20-test.test.ts` |
| Damage, Damage Roll, Damage Types | modeled | `damage-intake.test.ts` | `damage-intake.ts`; `damage-intake.test.ts` |
| Damage Threshold | modeled | `tray-threshold.test.ts` | `damage.ts`; `tray-threshold.test.ts` |
| Dash | modeled | `combat-economy.test.ts` | `combat-economy.ts`; `combat-economy.test.ts` |
| Dead | modeled | `character-status.test.ts` | `character-status.ts`; `character-status.test.ts` |
| Deafened | modeled | `condition-effects.test.ts` | `condition-effects.ts`; `condition-effects.test.ts` |
| Death Saving Throw | modeled | `death-save-table-rules.test.ts` | `character-d20-tests.ts`, `vitals.ts`; `death-save-table-rules.test.ts` |
| Dehydration, Malnutrition | gap | engine done; no screen calls `endDays` | #12 |
| Difficult Terrain | modeled | `difficult-terrain.test.ts` | `play/difficult-terrain.ts`; `difficult-terrain.test.ts` |
| Difficulty Class | modeled | `feature-dc-breakdown.test.ts` | Save DCs computed, check DCs typed by the DM; `feature-dc-breakdown.test.ts` |
| Disengage | table-side | — | Logged; opportunity attacks are positional |
| Dodge | modeled | `base-action-states.test.ts` | `base-action-states.ts` (ends on Incapacitated, Speed 0); `base-action-states.test.ts` |
| Exhaustion | modeled | `speed-exhaustion.test.ts` | `compute.ts`, `character-status.ts`, `play/rests.ts`; `speed-exhaustion.test.ts` |
| Experience Points | modeled | `experience.test.ts` | `experience.ts` (partial: no DM award); `experience.test.ts` |
| Expertise | modeled | `expertise-pick.test.ts` | `compute.ts`; `expertise-pick.test.ts` |
| Falling | modeled | `fall-damage.test.ts` | `play/fall.ts`; `fall-damage.test.ts` |
| Flying, Hover | modeled | `fly-hover.test.ts` | `play/flight.ts` (partial: fall cue at Speed 0); `fly-hover.test.ts` |
| Frightened | modeled | `conformance/09-conditions.test.ts` | `condition-effects.ts` (line of sight); `conformance/09-conditions.test.ts` |
| Grappled | modeled | `incapacitation-sweep.test.ts` | `condition-effects.ts`, `combat-effects.ts`; `incapacitation-sweep.test.ts` |
| Grappling | modeled | `escape-grapple.test.ts` | `compute.ts` DC, `play/escape-grapple.ts` (save: STR or DEX); `escape-grapple.test.ts` |
| Hazard | gap | engine done; no screen calls `setOnFire`, `holdBreath`, `endDays` | Falling only reaches a screen: #6, #9, #12 |
| Healing | modeled | `combat-hp.test.ts` | `play/vitals.ts`; `combat-hp.test.ts` |
| Heavily, Lightly Obscured | modeled | `light-states.test.ts` | `light-states.ts` (partial: fog, foliage); `light-states.test.ts` |
| Help | modeled | `help-check.test.ts` | `play/help.ts`, `outcome-offer.ts`; `help-check.test.ts` |
| Heroic Inspiration | modeled | `heroic-inspiration-on-rest.test.ts` | `PlayInspiration.tsx`, `play/rests.ts`; `heroic-inspiration-on-rest.test.ts` |
| Hide | modeled | `hide-ends.test.ts` | `play/states.ts`; `hide-ends.test.ts` |
| Hit Point Dice | modeled | `hit-point-dice-spend.test.ts` | `play/hit-point-dice.ts`; `hit-point-dice-spend.test.ts` |
| Hit Points, max HP reduction | modeled | `combat-hp.test.ts` | `play/vitals.ts`; `combat-hp.test.ts` |
| Illusions | table-side | — | Believing or seeing through an illusion is the DM's ruling |
| Immunity | modeled | `condition-immunity.test.ts` | `damage-intake.ts`, `play/vitals.ts`; `condition-immunity.test.ts` |
| Improvised Weapons | gap | engine done; no screen calls `improvisedWeaponAttack` | #11 |
| Incapacitated | modeled | `incapacitation-sweep.test.ts` | `condition-effects.ts`; `incapacitation-sweep.test.ts` |
| Influence, Search, Study | modeled | `action-checks.test.ts` | `play/checks.ts`; `action-checks.test.ts` |
| Initiative | modeled | `initiative-bonus.test.ts` | `surprise-state.ts`, `encounter.ts`; `initiative-bonus.test.ts` |
| Invisible | modeled | `invisibility-ends.test.ts` | `condition-effects.ts`; `invisibility-ends.test.ts` |
| Jumping | modeled | `jump-distances.test.ts` | `jump.ts` (partial: feet not charged); `jump-distances.test.ts` |
| Knocking Out a Creature | modeled | `tray-knock-out.test.ts` | `combat-transition.ts`; `tray-knock-out.test.ts` |
| Long Rest | modeled | `character-store-rest.test.ts` | `play/rests.ts` (partial: once per 24 h); `character-store-rest.test.ts` |
| Magic action | modeled | `conformance/11-movement.test.ts` | `smart-tracker.ts` base-magic; `conformance/11-movement.test.ts` |
| Occupied, Unoccupied Space | table-side | — | The map is Owlbear's; the meter counts feet |
| Opportunity Attacks | modeled | `conformance/06-reactions-timing.test.ts` | Reaction card; reach and leaving it are positional; `conformance/06-...test.ts` |
| Paralyzed | modeled | `condition-effects.test.ts` | `condition.ts`, `attacks-against.ts`; `condition-effects.test.ts` |
| Passive Perception | modeled | `passive-advantage-step.test.ts` | `compute.ts` passiveScore; `passive-advantage-step.test.ts` |
| Per Day | modeled | `smart-tracker.test.ts`, `monster-uses-view.test.ts` | PC trackers; monster uses: gap #4 |
| Petrified | modeled | `condition-rules-honoured.test.ts` | `condition.ts` (immune to Poisoned); `condition-rules-honoured.test.ts` |
| Poisoned | modeled | `condition-effects.test.ts` | `condition-effects.ts`; `condition-effects.test.ts` |
| Possession | modeled | `magic-jar.test.ts` | Save chip applies Incapacitated; Magic Jar engine has no screen |
| Proficiency | modeled | `proficiency-breakdown.test.ts` | `proficiency.ts`, `compute.ts`; `proficiency-breakdown.test.ts` |
| Prone | modeled | `conformance/09-conditions.test.ts` | `condition-effects.ts`, `stand-up.ts`; `conformance/09-conditions.test.ts` |
| Reach | modeled | `weapon-property.test.ts` | `smart-tracker.ts` reachFt; `weapon-property.test.ts` |
| Reaction | modeled | `conformance/06-reactions-timing.test.ts` | `combatStore.ts`; `conformance/06-reactions-timing.test.ts` |
| Ready | modeled | `ready-spell.test.ts` | `play/ready.ts`; `ready-spell.test.ts` |
| Resistance, Vulnerability | modeled | `conformance/01-stacking.test.ts` | `damage-intake.ts`; `conformance/01-stacking.test.ts` |
| Restrained | modeled | `condition-effects.test.ts` | `condition-effects.ts`; `condition-effects.test.ts` |
| Ritual | modeled | `ritual.test.ts` | `ritual.ts`; `ritual.test.ts` |
| Round Down | modeled | `conformance/01-stacking.test.ts` | `damage-intake.ts`; `conformance/01-stacking.test.ts` |
| Saving Throw | modeled | `d20-test.test.ts` | `compute.ts`, `saves-checks-view.ts`; `d20-test.test.ts` |
| Shape-Shifting | modeled | `conformance/03-forms.test.ts` | `play/forms.ts`, `polymorph.ts`; `conformance/03-forms.test.ts` |
| Short Rest | modeled | `short-rest-healing.test.ts` | `play/rests.ts`; `short-rest-healing.test.ts` |
| Shove | modeled | `conformance/06-reactions-timing.test.ts` | `smart-tracker.ts` base-shove (save: STR or DEX); `conformance/06-...test.ts` |
| Simultaneous Effects | modeled | `conformance/01-stacking.test.ts` | The turn's owner orders; `conformance/01-stacking.test.ts` |
| Size | modeled | `carry-as-larger-size.test.ts` | Carrying, Enlarge/Reduce; space is the table's; `carry-as-larger-size.test.ts` |
| Speed | modeled | `speed-breakdown.test.ts` | `rider-speed-loss.ts`, `compute.ts`; `speed-breakdown.test.ts` |
| Spell, one slot per turn | modeled | `conformance/05-multiclass-spellcasting.test.ts` | `combatStore.ts` commitSpellSlotCast; `conformance/05-...test.ts` |
| Spell Attack | modeled | `conformance/05-multiclass-spellcasting.test.ts` | `compute.ts` spellAttackBonus; `conformance/05-...test.ts` |
| Spellcasting Focus | modeled | `hands.test.ts` | `play/hands.ts`; `hands.test.ts` |
| Stable | modeled | `stable-from-state.test.ts` | `vitals.ts`; `stable-from-state.test.ts` |
| Stunned | modeled | `conformance/09-conditions.test.ts` | `condition-effects.ts` (can move, 2024); `conformance/09-conditions.test.ts` |
| Suffocation | gap | engine done; no screen calls `holdBreath` | #9 |
| Surprise | modeled | `surprise-state.test.ts` | `ThisTurnTracker.tsx` chip, `surprise-state.ts`; `surprise-state.test.ts` |
| Target | table-side | — | Choosing a target is the table's; the tray records who was hit |
| Telepathy | table-side | — | A way of talking; shown on stat blocks |
| Teleportation | table-side | — | Positional; no grid |
| Temporary Hit Points | modeled | `false-life-temp-hp.test.ts` | `play/vitals.ts`, `damage-intake.ts`; `false-life-temp-hp.test.ts` |
| Tremorsense | modeled | `conformance/12-vision.test.ts` | A sense row; not sight by the rules; `conformance/12-vision.test.ts` |
| Unarmed Strike | modeled | `unarmed-strike-die-catalogue.test.ts` | `smart-tracker.ts`; `unarmed-strike-die-catalogue.test.ts` |
| Unconscious | modeled | `conformance/09-conditions.test.ts` | `condition-effects.ts`; `conformance/09-conditions.test.ts` |
| Utilize, free object interaction | modeled | `object-interaction.test.ts` | `smart-tracker.ts`; `object-interaction.test.ts` |
| Weapon properties | modeled | `weapon-facts.test.tsx` | `smart-tracker.ts` (all ten); `weapon-facts.test.tsx` |
| Weapon Mastery | modeled | `mastery-riders.test.ts` | Nick, Graze, Topple, Vex, Sap, Slow apply; Cleave shows its once-per-turn damage (no positive ability modifier); Push is the table's; `mastery-rider-view.ts` |
| Travel Pace | modeled | `travel-pace.test.ts` | `rules.json` 2024 pace effects; `travel-pace.test.ts` |
| Exploration, marching order | table-side | — | Narrative and positional |
| Social interaction | modeled | `action-checks.test.ts` | Influence check; attitude and DC are the DM's |
| Initiative order and turns | modeled | `turn-economy.test.ts` | `turn-economy.ts`; `turn-economy.test.ts` |
| Mounted Combat | gap | engine done; no screen calls `mountCreature` | #10 |
| Underwater Combat | modeled | `situational-states.test.ts` | `situational-states.ts`; `situational-states.test.ts` |
| Two-weapon fighting | modeled | `conformance/15-area-damage.test.ts` | `smart-tracker.ts` (Light, Nick); `conformance/15-area-damage.test.ts` |
| Ranged in melee, long range | modeled | `situational-states.test.ts` | `situational-states.ts`; `situational-states.test.ts` |
| Unseen attackers and targets | modeled | `can-see.test.ts` | `situational-states.ts`, `light-states.ts`; `can-see.test.ts` |
| Massive damage, 0 HP | modeled | `damage-intake.test.ts` | `damage-intake.ts`; `damage-intake.test.ts` |
| Monsters vs PCs at 0 HP | modeled | `monster-knock-out.test.ts` | `encounter.ts`; `monster-knock-out.test.ts` |
| Interrupting a rest | table-side | — | A rest commits when done; an interrupted one is a Short Rest the table taps |
| Time tracking | modeled | `time-passes.test.ts` | `play/time.ts`; `time-passes.test.ts` |
