# A rules coverage table that cannot go stale (proposal, 2026-11-12)

**Status: proposal, not built.** The Coordinator asked for it after `RULES_COVERAGE.md` was wrong
four times in one evening (#1064 and the rows around it).

## Why it goes stale

`docs/RULES_COVERAGE.md` and `docs/RULES_GLOSSARY_AUDIT.md` are typed by hand. A row's class
(auto, 1-tap, reference, manual) and its gap text are written once and then drift. The engine moves
on in a PR that never opens the doc. Only five catalogue rows are recounted by a test
(`rules-coverage-*.test.ts`), and even those copy the number into the doc by hand.

The proof that a rule works already exists: the conformance suite (`tests/unit/conformance`, one
`rule()` per corpus case). A case tagged `status: "works"` must pass in CI. Any other status runs as
`it.fails` and must fail. So the status field is proven, and it can be read without running a test
(`cases.ts` already reads the files as static text for the guard and `conformance-count.ts`).

## The proposal: generate the table from the cases, and fail CI on drift

1. **The rules lane tags each conformance case** with three new fields on `RuleCase`:
   - `glossary`: the SRD Rules Glossary entry or entries it proves (`"squeezing"`, `"prone"`).
   - `class`: `"auto"` (no input) or `"tap"` (one declaration applies it).
   - `screen`, only when no screen calls the engine yet: the function a screen must call
     (`"passBreathTurn"`). The generator checks the source tree for a call outside tests, the same
     static scan `play-parity.guard.test.ts` does. When a screen calls it, «UI pending» disappears by
     itself.
2. **The entry list** is `src/data/rules-glossary-entries.ts`: the 137 SRD glossary ids with their
   English and Italian names (SRD, public). It is the table's rows, so no entry can be forgotten.
3. **A row's class is computed, never typed:**
   - the best `class` among its passing (`works`) cases;
   - a row whose cases are all pending shows «gap» with those cases' titles (its gap text);
   - a row with no case reads `manual` unless it is in `TABLE_SIDE` with a reason (a short hand
     list for what Folio leaves to the table by design: no grid, a DM ruling).
     A hand entry can only _lower_ a claim, never raise one.
4. **Catalogue rows** (spells, class features, species, items, monsters) take their counts from the
   classifiers the five `rules-coverage-*` tests already contain, exported and called by the
   generator. Feats, Invocations and Metamagic get a classifier the same way. Today those three are
   "recounted by hand".
5. **`pnpm rules:coverage`** (a script, static and fast) writes both docs between generated
   markers. A guard test regenerates the text and fails when the committed doc differs. So a PR that
   flips a case to `works` must regenerate the doc, or CI is red. The free prose (the reference
   tools, the history) stays outside the markers.

## What it costs

- **The rules lane:** tag about 290 existing cases (`glossary`, `class`, sometimes `screen`). Then
  write a case for each glossary entry with none; there are about 20 today, judging by the audit's
  137 against the cases' sources. Then the `TABLE_SIDE` list (about 10 entries, already listed in
  the audit). Roughly one session.
- **The engine lane:** the generator, the guard, the exported classifiers, and the entry list.
  Roughly one session.
- **Rollout:** a first PR shows the generated table next to today's. The Coordinator compares them.
  Each difference is either a stale hand row (fixed by the switch) or a missing tag (fixed by the
  rules lane). Then the hand table is deleted.

## What it does not do

- It proves what the engine applies, not how good the screen is. «UI pending» says only that no
  screen calls the engine yet.
- It never rolls a die or judges a ruling. «Table-side» stays a short, explained hand list.
