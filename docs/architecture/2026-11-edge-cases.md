# D&D 2024 edge cases against the engine (2026-11-02)

**Question.** Can the engine model every D&D 2024 rule, edge cases included, with as much
automation as the product policy allows (the app never rolls; the sheet pays, logs and undoes), and
can it grow by data rather than by special cases?

**Method.** 287 edge cases from the owner's wiki (dnd2024.wikidot.com), the 2024 Sage Advice
Compendium, the 2025 errata, Foundry dnd5e issues, D&D Beyond and EN World threads, plus the
at-the-table gaps seen at Cragmaw ([corpus](2026-11-edge-cases/corpus.md)). Each case was judged
against the engine model on main `656937b2`, with file:line evidence, on five questions:
represented, automated, explained in the breakdown, logged, undoable
([verdicts](2026-11-edge-cases/verdicts.md)). The (c)/(d) cases were then grouped into families, one
general mechanism each ([detailed mechanisms](2026-11-edge-cases/families.md)).

## Result

| Class                                 | Cases 1–8 | Cases 9–17 | Total |
| ------------------------------------- | --------- | ---------- | ----- |
| (a) works (some only with UI pending) | 91        | 70         | 161   |
| (b) missing data entry                | 5         | 4          | 9     |
| (c) missing generic mechanism         | 33        | 58         | 91    |
| (d) the model can't express it        | 11        | 14         | 25    |

The core shapes are sound: grants, the stacking fold, the damage intake order, the breakdown, the
causal undo and the session log hold most of the rules. The gaps cluster in a small number of
missing **general** mechanisms, and today several of them are papered over by per-feature special
cases (hard-coded ids such as Sneak Attack, Find Familiar, Arcane Recovery, the spell-id form table,
and one-feature grant kinds). Each family below replaces a set of those special cases.

**Live defect found on the way (M1).** When anyone other than the player damages a PC (the DM's
monster attack, the DM's party card, an ally's area spell), HP is written through `reduceHpDelta`
(`src/features/campaigns/campaign-io.ts:982` → `src/lib/combat-state.ts:323`), which only
subtracts. The full rule `reducePcDamage` (`src/lib/combat-transition.ts:85`) runs only on the
player's own damage. So a PC the DM drops to 0 gets no Unconscious and no death-save failure,
resistances and Evasion are skipped, and no concentration save is queued.

## Families, ranked

Severity = how often it bites at the table × how wrong the result is (1–5). Shape: "none" = catalogue
and pure code only; "additive" = new optional stored fields, no migration; "migration" = goes through
`live-data-migration`.

| #   | Family                                                                                                                                                 | Sev | Size | Shape                                | Folds      | Owner                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | ---- | ------------------------------------ | ---------- | ------------------------------ |
| M1  | **Damage lands through the target's own pipeline**: one typed packet any client writes, resolved by `reducePcDamage` in the existing transaction       | 5   | M    | additive                             | B-F1       | engine                         |
| M2  | **Forms as a computed layer**: a `FormRule` on Wild Shape, Polymorph, Shapechange and homebrew; the form overlays stats instead of stamping the build  | 4   | L    | migration (characters mid-form only) | A-F2, B-F4 | engine                         |
| M3  | **Condition occurrences**: source, end triggers (repeat save, on damage, on act, turn edge), suppression, immunity; one condition table                | 4   | M    | additive                             | B-F2       | engine                         |
| M4  | **Damage packet stages and typed parts**: absorbers (Arcane Ward), incoming halving (Uncanny Dodge), attacker-side penetration, mixed types, die faces | 3   | M    | none                                 | A-F7, B-F5 | engine                         |
| M5  | **Turn-scoped usage windows**: per-turn limits keyed by whose turn it is, not refilled at the owner's turn start                                       | 3   | S    | additive                             | A-F5, B-F9 | engine                         |
| M6  | **Summon instances with a lifecycle**: cast level, source, ends-on (concentration, 0 HP vanish/die, rest), revive; companion actions as Activities     | 3   | M    | additive                             | A-F3       | lane 2 (data) + engine (store) |
| M7  | **Zero-HP pipeline**: ordered savers with gates and costs, on-zero outcomes (dust, knock out), per-companion behaviour, waking from stable             | 3   | M    | additive                             | B-F3       | engine                         |
| M8  | **Trigger rules**: one `on event → if → do, with limit` grammar for recoveries, kill attribution and cross-creature reactions                          | 3   | M    | additive                             | A-F6, B-F7 | engine (runtime) + lane 2      |
| M9  | **Zones**: persistent anchored areas with a per-creature, per-turn ledger, spared targets and spell level                                              | 3   | M    | additive                             | B-F6       | engine                         |
| M10 | **Effect identity and stacking policy**: an effect key with strongest / newest / recipient-choice, folded before the buckets                           | 2–3 | M    | none                                 | A-F1       | engine                         |
| M11 | **One number language (`Scalar`)**: every scaled number in the catalogue is an `IntegerExpression`; retires seven scaling dialects                     | 2   | M    | none                                 | A-F9       | lane 2                         |
| M12 | **Outcome-gated effects and end hooks**: effects on save success, refunds when countered, on-end and on-complete (permanence)                          | 2   | S–M  | none                                 | A-F8       | engine                         |
| M13 | **Cast record and spell provenance**: which class a spell is cast through, Metamagic policy, scroll parameters                                         | 2   | M    | additive                             | A-F4       | lane 2 (data) + engine         |
| M14 | **One speed pipeline for every movement mode**, plus self-movement and falling                                                                         | 2   | S    | none                                 | B-F8       | lane 2                         |
| M15 | **Vision as light level × sight profile** (magical darkness, Devil's Sight, Blindsight, Truesight)                                                     | 2   | S    | none                                 | B-F10      | lane 2                         |
| M16 | **Table rules on the campaign**: gritty rests, exhaustion track, death-save variants, flanking, potion economy (default RAW)                           | 2   | M    | additive                             | B-F11      | lane 2                         |
| M17 | **One-shot effects on another sheet**: Help, Dispel on another creature's spell, feeding a potion, fading penalties                                    | 2   | S    | additive                             | B-F12      | engine                         |
| M18 | **Item lifecycle**: attunement prerequisites, dawn as its own event, command words vs speech, roll-outcome tables, ammunition recovery                 | 2   | S    | none                                 | B-F13      | lane 2                         |
| M19 | **A creature roster outside encounters**: NPCs and companions that exist between fights                                                                | 2   | M    | new collection                       | B-F15      | to agree                       |
| M20 | **DM-only item overlays**: curses, sentient items, artifacts, evolving items                                                                           | 1   | L    | new collection + rules (owner-gated) | B-F14      | later                          |

Not proposed: world facts outside the model (objects, planes, hands, Bastions; B-F16). They stay
reference text until a subsystem is wanted.

## Data gaps (b)

The nine data rows, with their files, are listed at the end of each part of
[families.md](2026-11-edge-cases/families.md). Lane 2 adds them; the ones that wait on a family (for
example Disintegrate on M7, Devil's Sight on M15) land with that family.

## Order of work

1. **M1 first**: it is a live defect and the base for M3, M4 and M7.
2. Foundations that unblock the rest: **M11** (numbers) and **M5** (turn windows), both small.
3. **M2, M3, M4, M10**: the families that retire the most special cases.
4. The others by severity.

Each family ships test-first, with cases taken from the [verdicts](2026-11-edge-cases/verdicts.md)
rows it covers, and retires the special cases it lists. Shape changes go through
`live-data-migration`. Player-visible changes are shown to the coordinator before merge.

## Status

- **M1** done (#535): a peer's hit runs `takeDamage` in the write transaction
  (`src/lib/play/peer-damage.ts`). States a hit consumes on the target stay for M4.
- **M7, savers** done: one `at-zero-hp-interrupt` shape (use, save with a Scalar DC, HP left),
  `src/lib/play/zero-hp-savers.ts`. The fall records the states that were on
  (`session.zeroHpDrop`), so Relentless Rage works although the fall ends Rage. Still open in M7:
  on-zero outcomes (Disintegrate's dust, knocking out), the stable 1d4-hour wake, attunement ending
  at death, and companions at 0 (with M6). Concentration lost at the fall is not given back when a
  saver works.
- **M3, immunity** done: `aggregateCharacterGrants` returns the conditions in effect with
  immune ones suppressed (`conditions`, `suppressedConditions`), and `effectiveConditions(doc)`
  is the read for rules; an immune creature gains no Exhaustion. Still open in M3: end rules
  (Hide's acts, on damage, repeat saves, the grappler incapacitated), Knock Out and Abjure Foes
  data, unseen sources.
- **M3, sourced Exhaustion** done: a condition that lasts while its source does names it, so the
  fight ends it with the spell; a spell's Exhaustion is a level on the sheet, capped by its `upTo`
  (`src/lib/play/exhaustion.ts`), and a failed repeat save's comes from `failedRepeatSaveEffects`.
- **Engine-ready, needs a caller** (the conformance case stays pending until a player reaches it):
  `OBJECT_DEFENSES` and `damageToItem` wait for the tray to name an object or an item as a target;
  `sentientConflictDc` waits for a sentient item's card.
- **Hits from another device** (the shared root of the M1, M4 and M7 limits): the spends ledger,
  [design](2026-11-cross-device-hits.md). Reader, fold and rules are in; the writer switches on
  with `VITE_PEER_SPENDS_LEDGER` after the rules deploy.
