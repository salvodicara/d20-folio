# Rules glossary audit — 2026-11-10

Every entry of the SRD 5.2.1 Rules Glossary and the Playing the Game chapter, checked against `main`
(after #971) in code and tests. **modeled**: the engine applies it, with no input or one tap.
**table-side**: left to the table by design (no grid, a DM ruling, narrative). **gap**: a table
would want the app to apply it and it does not. A gap marked _(no screen)_ has a tested engine that
nothing calls yet. A gap marked _(engine)_ is missing in the engine itself, and is also a failing
conformance case (corpus category 18).
[RULES_COVERAGE.md](RULES_COVERAGE.md) maps the catalogues; this file maps the rules themselves. A PR
that closes a gap updates its row.

**Count: 137 entries: 116 modeled (10 with a small partial gap), 10 table-side, 11 gaps.** Of
the 12 gaps listed below, 5 were fixed on 2026-11-10 (#973–#976); the 7 left need a new control
and wait for direction, each with its engine (or headless model) ready. On the monster side, Sap and
Slow are written but not yet shown: `monsterTurnModifiers` is the model for the DM's card.

## Gaps, most frequent at real tables first

| #   | Entry                                       | Missing                                                               | Kind        | Smallest fix                                                   |
| --- | ------------------------------------------- | --------------------------------------------------------------------- | ----------- | -------------------------------------------------------------- |
| 1   | ~~Weapon Mastery: Sap, Slow~~ (fixed #976)  | Logged only. Sap and Slow change no number                            | engine      | Sap: Disadvantage on the target's next attack; Slow: −10 ft    |
| 2   | ~~Grappling, Shove~~ (fixed #973)           | The save is labelled STR only; 2024 lets the target pick STR or DEX   | engine      | "STR or DEX" save on both options                              |
| 3   | Aura (Aura of Protection)                   | Only the paladin gets the save bonus; allies in the aura get nothing  | (no screen) | An "in the aura" state on the ally adding the source's CHA mod |
| 4   | Per Day (monster N/Day, Recharge)           | `spendMonsterUse` exists, nothing calls it                            | (no screen) | Spend/restore on the DM monster card                           |
| 5   | ~~Travel Pace~~ (fixed #974)                | The effect text is 2014's (−5 passive, "move stealthily")             | engine      | 2024: Fast Disadvantage on Perception/Survival, Slow Advantage |
| 6   | Burning (hazard)                            | `environment.ts` is done, nothing sets or ticks it                    | (no screen) | An "On fire" state and a turn-start prompt                     |
| 7   | ~~Dodge~~ (fixed #975)                      | Does not end on Incapacitated or Speed 0                              | engine      | Add those two end conditions                                   |
| 8   | ~~Petrified~~ (fixed #975)                  | Its Poisoned immunity is not applied to the sheet's active conditions | engine      | Feed condition-granted immunities into the active conditions   |
| 9   | Suffocation (hazard)                        | `suffocation.ts` is done, nothing starts holding breath               | (no screen) | A Hold breath / Breathe control                                |
| 10  | Mounted Combat                              | `mounts.ts` is done, nothing calls `mountCreature`                    | (no screen) | "Mount on…" in the encounter                                   |
| 11  | Improvised Weapons                          | Proficiency word only; no 1d4 attack without the proficiency bonus    | engine      | An "Improvised weapon" base attack                             |
| 12  | Breaking Objects; Dehydration, Malnutrition | `object-targets.ts` and `provisions.ts` are done, nothing calls them  | (no screen) | An object target row; a day's food and water at Long Rest      |

Small partial gaps on modeled entries: Armor Training doesn't block casting; Curses (Bestow Curse
changes nothing); Flying (no fall cue at Speed 0 or Incapacitated); Heavily/Lightly Obscured
(fog and foliage are not light levels); Climbing/Swimming (speed modifiers skip climb, fly and swim
speeds); Concentration (Extended Spell's Advantage); Long Rest (once per 24 hours not enforced);
Jumping (feet not charged automatically); Experience Points (no DM award at fight end).

## Every entry

| Entry                                         | Status     | Where (one test) or why                                                                             |
| --------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| Ability Check                                 | modeled    | `compute.ts` skillBonus; `compute.test.ts`                                                          |
| Ability Score and Modifier                    | modeled    | `ability.ts`; `ability-score-breakdown.test.ts`                                                     |
| Action                                        | modeled    | `combat-economy.ts`; `combat-economy.test.ts`                                                       |
| Advantage, Disadvantage                       | modeled    | `d20-test.ts` evaluateD20Test; `advantage-rail.test.ts`                                             |
| Ally, Enemy                                   | modeled    | `play/help.ts`; `help-action.test.ts`                                                               |
| Area of Effect (all shapes)                   | table-side | No grid: the table picks targets, the damage tray resolves each                                     |
| Armor Class                                   | modeled    | `compute.ts` computeAC; `grants-ac-bonus-parity.test.ts`                                            |
| Armor Training                                | modeled    | `condition-effects.ts` (partial: casting not blocked); `state-text.test.ts`                         |
| Attack action                                 | modeled    | `turn-economy.ts` (Extra Attack, Light, Nick); `phase4-economy-parity.test.ts`                      |
| Attack Roll                                   | modeled    | `compute.ts` weapon/spell attack bonus; `compute.test.ts`                                           |
| Attitude                                      | table-side | An NPC's attitude is the DM's; Influence is a check against the DM's DC                             |
| Attunement                                    | modeled    | `attunement-guard.ts`; `attunement-guard.test.ts`                                                   |
| Aura                                          | gap        | #3                                                                                                  |
| Blinded                                       | modeled    | `condition-effects.ts`; `condition-effects.test.ts`                                                 |
| Blindsight, Truesight                         | modeled    | `light-states.ts` sightUnder; `can-see.test.ts`                                                     |
| Bloodied                                      | modeled    | `hp-band.ts`; `hp-band-bloodied.test.ts`                                                            |
| Bonus Action                                  | modeled    | `turn-economy.ts`; `combat-economy.test.ts`                                                         |
| Breaking Objects                              | gap        | #12                                                                                                 |
| Bright Light, Dim Light, Darkness, Darkvision | modeled    | `light-states.ts`; `light-states.test.ts`                                                           |
| Burning                                       | gap        | #6                                                                                                  |
| Cantrip                                       | modeled    | `utils.ts` scaleCantripDice; `utils.test.ts`                                                        |
| Carrying Capacity                             | modeled    | `compute.ts`; `carry-as-larger-size.test.ts`                                                        |
| Challenge Rating                              | modeled    | `encounter-difficulty.ts`; `encounter-difficulty.test.ts`                                           |
| Charmed                                       | modeled    | `condition-effects.ts`; `condition-effects.test.ts`                                                 |
| Climbing, Crawling, Swimming                  | modeled    | `play/difficult-terrain.ts` ×2 meter (partial); `difficult-terrain.test.ts`                         |
| Concentration                                 | modeled    | `compute.ts` DC, `play/concentration.ts`; `conformance/02-concentration.test.ts`                    |
| Condition                                     | modeled    | `condition-effects.ts`; `conformance/09-conditions.test.ts`                                         |
| Cover                                         | modeled    | `cover-states.ts`; `cover-states.test.ts`                                                           |
| Creature Type                                 | modeled    | `play/damage-tray.ts` riders by type; `polymorph.test.ts`                                           |
| Critical Hit                                  | modeled    | `vitals.ts` (two failures at 0 HP); `damage-tray.test.ts`                                           |
| Curses                                        | modeled    | Cursed items bind (`item-overlays.ts`); partial: Bestow Curse                                       |
| D20 Test                                      | modeled    | `d20-test.ts`; `d20-test.test.ts`                                                                   |
| Damage, Damage Roll, Damage Types             | modeled    | `damage-intake.ts`; `damage-intake.test.ts`                                                         |
| Damage Threshold                              | modeled    | `damage.ts`; `tray-threshold.test.ts`                                                               |
| Dash                                          | modeled    | `combat-economy.ts`; `combat-economy.test.ts`                                                       |
| Dead                                          | modeled    | `character-status.ts`; `character-status.test.ts`                                                   |
| Deafened                                      | modeled    | `condition-effects.ts`; `condition-effects.test.ts`                                                 |
| Death Saving Throw                            | modeled    | `character-d20-tests.ts`, `vitals.ts`; `death-save-table-rules.test.ts`                             |
| Dehydration, Malnutrition                     | gap        | #12                                                                                                 |
| Difficult Terrain                             | modeled    | `play/difficult-terrain.ts`; `difficult-terrain.test.ts`                                            |
| Difficulty Class                              | modeled    | Save DCs computed, check DCs typed by the DM; `feature-dc-breakdown.test.ts`                        |
| Disengage                                     | table-side | Logged; opportunity attacks are positional                                                          |
| Dodge                                         | modeled    | `base-action-states.ts` (ends on Incapacitated, Speed 0); `base-action-states.test.ts`              |
| Exhaustion                                    | modeled    | `compute.ts`, `character-status.ts`, `play/rests.ts`; `speed-exhaustion.test.ts`                    |
| Experience Points                             | modeled    | `experience.ts` (partial: no DM award); `experience.test.ts`                                        |
| Expertise                                     | modeled    | `compute.ts`; `expertise-pick.test.ts`                                                              |
| Falling                                       | modeled    | `play/fall.ts`; `fall-damage.test.ts`                                                               |
| Flying, Hover                                 | modeled    | `play/flight.ts` (partial: fall cue at Speed 0); `fly-hover.test.ts`                                |
| Frightened                                    | modeled    | `condition-effects.ts` (line of sight); `conformance/09-conditions.test.ts`                         |
| Grappled                                      | modeled    | `condition-effects.ts`, `combat-effects.ts`; `incapacitation-sweep.test.ts`                         |
| Grappling                                     | modeled    | `compute.ts` DC, `play/escape-grapple.ts` (save: STR or DEX); `escape-grapple.test.ts`              |
| Hazard                                        | gap        | Falling only reaches a screen: #6, #9, #12                                                          |
| Healing                                       | modeled    | `play/vitals.ts`; `combat-hp.test.ts`                                                               |
| Heavily, Lightly Obscured                     | modeled    | `light-states.ts` (partial: fog, foliage); `light-states.test.ts`                                   |
| Help                                          | modeled    | `play/help.ts`, `outcome-offer.ts`; `help-check.test.ts`                                            |
| Heroic Inspiration                            | modeled    | `PlayInspiration.tsx`, `play/rests.ts`; `heroic-inspiration-on-rest.test.ts`                        |
| Hide                                          | modeled    | `play/states.ts`; `hide-ends.test.ts`                                                               |
| Hit Point Dice                                | modeled    | `play/hit-point-dice.ts`; `hit-point-dice-spend.test.ts`                                            |
| Hit Points, max HP reduction                  | modeled    | `play/vitals.ts`; `combat-hp.test.ts`                                                               |
| Illusions                                     | table-side | Believing or seeing through an illusion is the DM's ruling                                          |
| Immunity                                      | modeled    | `damage-intake.ts`, `play/vitals.ts`; `condition-immunity.test.ts`                                  |
| Improvised Weapons                            | gap        | #11                                                                                                 |
| Incapacitated                                 | modeled    | `condition-effects.ts`; `incapacitation-sweep.test.ts`                                              |
| Influence, Search, Study                      | modeled    | `play/checks.ts`; `action-checks.test.ts`                                                           |
| Initiative                                    | modeled    | `surprise-state.ts`, `encounter.ts`; `initiative-bonus.test.ts`                                     |
| Invisible                                     | modeled    | `condition-effects.ts`; `invisibility-ends.test.ts`                                                 |
| Jumping                                       | modeled    | `jump.ts` (partial: feet not charged); `jump-distances.test.ts`                                     |
| Knocking Out a Creature                       | modeled    | `combat-transition.ts`; `tray-knock-out.test.ts`                                                    |
| Long Rest                                     | modeled    | `play/rests.ts` (partial: once per 24 h); `character-store-rest.test.ts`                            |
| Magic action                                  | modeled    | `smart-tracker.ts` base-magic; `conformance/11-movement.test.ts`                                    |
| Occupied, Unoccupied Space                    | table-side | The map is Owlbear's; the meter counts feet                                                         |
| Opportunity Attacks                           | modeled    | Reaction card; reach and leaving it are positional; `conformance/06-...test.ts`                     |
| Paralyzed                                     | modeled    | `condition.ts`, `attacks-against.ts`; `condition-effects.test.ts`                                   |
| Passive Perception                            | modeled    | `compute.ts` passiveScore; `passive-advantage-step.test.ts`                                         |
| Per Day                                       | modeled    | PC trackers; monster uses: gap #4                                                                   |
| Petrified                                     | modeled    | `condition.ts` (immune to Poisoned); `condition-rules-honoured.test.ts`                             |
| Poisoned                                      | modeled    | `condition-effects.ts`; `condition-effects.test.ts`                                                 |
| Possession                                    | modeled    | Save chip applies Incapacitated; Magic Jar engine has no screen                                     |
| Proficiency                                   | modeled    | `proficiency.ts`, `compute.ts`; `proficiency-breakdown.test.ts`                                     |
| Prone                                         | modeled    | `condition-effects.ts`, `stand-up.ts`; `conformance/09-conditions.test.ts`                          |
| Reach                                         | modeled    | `smart-tracker.ts` reachFt; `weapon-property.test.ts`                                               |
| Reaction                                      | modeled    | `combatStore.ts`; `conformance/06-reactions-timing.test.ts`                                         |
| Ready                                         | modeled    | `play/ready.ts`; `ready-spell.test.ts`                                                              |
| Resistance, Vulnerability                     | modeled    | `damage-intake.ts`; `conformance/01-stacking.test.ts`                                               |
| Restrained                                    | modeled    | `condition-effects.ts`; `condition-effects.test.ts`                                                 |
| Ritual                                        | modeled    | `ritual.ts`; `ritual.test.ts`                                                                       |
| Round Down                                    | modeled    | `damage-intake.ts`; `conformance/01-stacking.test.ts`                                               |
| Saving Throw                                  | modeled    | `compute.ts`, `saves-checks-view.ts`; `d20-test.test.ts`                                            |
| Shape-Shifting                                | modeled    | `play/forms.ts`, `polymorph.ts`; `conformance/03-forms.test.ts`                                     |
| Short Rest                                    | modeled    | `play/rests.ts`; `short-rest-healing.test.ts`                                                       |
| Shove                                         | modeled    | `smart-tracker.ts` base-shove (save: STR or DEX); `conformance/06-...test.ts`                       |
| Simultaneous Effects                          | modeled    | The turn's owner orders; `conformance/01-stacking.test.ts`                                          |
| Size                                          | modeled    | Carrying, Enlarge/Reduce; space is the table's; `carry-as-larger-size.test.ts`                      |
| Speed                                         | modeled    | `rider-speed-loss.ts`, `compute.ts`; `speed-breakdown.test.ts`                                      |
| Spell, one slot per turn                      | modeled    | `combatStore.ts` commitSpellSlotCast; `conformance/05-...test.ts`                                   |
| Spell Attack                                  | modeled    | `compute.ts` spellAttackBonus; `conformance/05-...test.ts`                                          |
| Spellcasting Focus                            | modeled    | `play/hands.ts`; `hands.test.ts`                                                                    |
| Stable                                        | modeled    | `vitals.ts`; `stable-from-state.test.ts`                                                            |
| Stunned                                       | modeled    | `condition-effects.ts` (can move, 2024); `conformance/09-conditions.test.ts`                        |
| Suffocation                                   | gap        | #9                                                                                                  |
| Surprise                                      | modeled    | `ThisTurnTracker.tsx` chip, `surprise-state.ts`; `surprise-state.test.ts`                           |
| Target                                        | table-side | Choosing a target is the table's; the tray records who was hit                                      |
| Telepathy                                     | table-side | A way of talking; shown on stat blocks                                                              |
| Teleportation                                 | table-side | Positional; no grid                                                                                 |
| Temporary Hit Points                          | modeled    | `play/vitals.ts`, `damage-intake.ts`; `false-life-temp-hp.test.ts`                                  |
| Tremorsense                                   | modeled    | A sense row; not sight by the rules; `conformance/12-vision.test.ts`                                |
| Unarmed Strike                                | modeled    | `smart-tracker.ts`; `unarmed-strike-die-catalogue.test.ts`                                          |
| Unconscious                                   | modeled    | `condition-effects.ts`; `conformance/09-conditions.test.ts`                                         |
| Utilize, free object interaction              | modeled    | `smart-tracker.ts`; `object-interaction.test.ts`                                                    |
| Weapon properties                             | modeled    | `smart-tracker.ts` (all ten); `weapon-facts.test.tsx`                                               |
| Weapon Mastery                                | modeled    | Nick, Graze, Topple, Vex, Sap, Slow apply; Push and Cleave are the table's; `mastery-rider-view.ts` |
| Travel Pace                                   | modeled    | `rules.json` 2024 pace effects; `travel-pace.test.ts`                                               |
| Exploration, marching order                   | table-side | Narrative and positional                                                                            |
| Social interaction                            | modeled    | Influence check; attitude and DC are the DM's                                                       |
| Initiative order and turns                    | modeled    | `turn-economy.ts`; `turn-economy.test.ts`                                                           |
| Mounted Combat                                | gap        | #10                                                                                                 |
| Underwater Combat                             | modeled    | `situational-states.ts`; `situational-states.test.ts`                                               |
| Two-weapon fighting                           | modeled    | `smart-tracker.ts` (Light, Nick); `conformance/15-area-damage.test.ts`                              |
| Ranged in melee, long range                   | modeled    | `situational-states.ts`; `situational-states.test.ts`                                               |
| Unseen attackers and targets                  | modeled    | `situational-states.ts`, `light-states.ts`; `can-see.test.ts`                                       |
| Massive damage, 0 HP                          | modeled    | `damage-intake.ts`; `damage-intake.test.ts`                                                         |
| Monsters vs PCs at 0 HP                       | modeled    | `encounter.ts`; `monster-knock-out.test.ts`                                                         |
| Interrupting a rest                           | table-side | A rest commits when done; an interrupted one is a Short Rest the table taps                         |
| Time tracking                                 | modeled    | `play/time.ts`; `time-passes.test.ts`                                                               |

(Rows that group several glossary entries, such as the light levels, count each entry separately
in the total.)
