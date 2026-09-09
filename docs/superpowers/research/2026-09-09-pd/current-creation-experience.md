# Current character-creation experience (v2, block P10) — factual inventory

Produced against `origin/v2` @ 6576148d; all paths are relative to the repository root. Facts only.

**Which flow is live.** `src/main.tsx:74` renders `IdentityApp`; `IdentityApp.tsx:889` mounts `CreationFlow`.
`src/app/router.tsx:202` (`/characters/new` → `LegacyCreationWizard`) is reached only through `src/App.tsx`,
which nothing imports — the v1 2389-line wizard is carried, not mounted. Everything below describes
`src/features/creation/CreationFlow.tsx` + `CreationWizard.tsx`.

## 1. Steps, in order

`src/lib/character-creation/steps.ts` — `["identity","origins","class","abilities","equipment","review"]`.

| #   | Step · file                                | Asks · required / default                                                                                                                                |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | start panel · `CreationFlow.tsx:287-296`   | one button + one paragraph                                                                                                                               |
| 1   | identity · `CreationWizard.tsx:114-165`    | name, alignment `<select>` (10), 2 additional languages. Required: name, exactly 2 distinct languages. Alignment defaults to `"neutral"` (`model.ts:38`) |
| 2   | origins · `:167-174` + `WizardSources.tsx` | species and background `<select>`s, then every choice they emit (tool, origin-feat sub-choices). All required; no defaults                               |
| 3   | class · same, `sourceRoles=["class"]`      | class `<select>` + skills, fighting style, weapon mastery, cantrips/spellbook/prepared (`root-adapter.ts:264-410`). All required; no defaults            |
| 4   | abilities · `WizardAbilities.tsx`          | method `<select>`, six scores, background +2/+1 or +1×3. Method defaults `"standard"`, scores `null` (`model.ts:39-40`)                                  |
| 5   | equipment · `:191-224` + `WizardChoice`    | class package (Fighter A/B/C, Wizard A/B) + background package-or-gold; both required                                                                    |
| 6   | review · `WizardReview.tsx`                | read-back + Create, gated on `preview.valid`                                                                                                             |

**No recommended / quick path.** `src/data/quickbuild.ts` and `src/lib/quickbuild.ts` are imported only by
`LegacyCreationWizard.tsx` and `src/features/creation/steps/steps.ts` (legacy-only). Nothing in the live flow
pre-fills, suggests or ranks an option.

**Back / forward.** `nav.wizard-steps` (`CreationWizard.tsx:88-101`) renders all six steps as always-enabled
buttons — free jumping either way, no gating — plus footer Back and Continue/Create. The step is a route
segment, so browser back/forward works; focus moves to the panel `<h2>` on change (`:53-57`).

**Draft persistence.** `new CreationDraftStorage(sessionStorage, "folio-creation-draft:" + uid, …)`
(`CreationFlow.tsx:46`) — **sessionStorage, not localStorage**: the draft dies when the tab closes. Nothing
reaches Firestore until Create.

**Happy-path length** (SRD only, standard array, Dwarf = the species with zero choice grants,
`src/data/races.ts:248`):

- **Fighter / Dwarf / Soldier** — 13 decision groups, **24 selections + 5 navigation clicks = 29
  interactions**: name 1, languages 2 | species 1, background 1, tool proficiency 1 ("Gaming Set" is an
  umbrella, `root-adapter.ts:162-178`) | class 1, skills 2 (`fighter.ts:31`), fighting style 1 (`:151-155`),
  weapon mastery 3 (`:123`) | six scores 6, increases 2 | two equipment packages 2 | Create 1.
- **Wizard / Dwarf / Sage** — 14 decision groups, **34 selections + 6 navigation clicks = 40 interactions**:
  identity 3 | species 1, background 1, Magic Initiate (Wizard) cantrips 2 + spell 1 from the fixed
  background feat (`backgrounds.ts:32`) | class 1, skills 2, cantrips 3, spellbook 6, prepared 4
  (`root-adapter.ts:355-408`) | scores 6, increases 2 | two equipment packages 2 | Create 1.

## 2. User-visible strings

Namespaces: `src/i18n/{en,it}/ui/creationV2.json` (110 leaf keys each) and `creationFlow.json` (50 each) —
**160 EN + 160 IT, full parity, zero missing**. Borrowed keys are remapped in `src/i18n/creation-keys.ts`
(44 `acquisition` + 4 `flow` entries).

**Administrative / validation register — 61 EN keys (122 strings with IT).**

- `creationV2` (35) = 10 diagnostic codes (`manual-range`, `invalid-score`, `standard-array`, `point-range`,
  `point-budget`, `background-distribution`, `creation-{name,source,languages}-required`, `choice-count`)
  - 13 issue-chrome keys (`blocked` "Complete the highlighted choices before creating your character.",
    `issues` "Choices to complete", `issue` "This declaration needs review before creation.", `technical`
    "Declaration details", `invalid`, `unsupported`, `unresolved`, `declared`, `declaredHint`, `noFacts`,
    `unavailable`, `noResults`, `abilityPending`) + 8 retention keys (`inactive`, `inactiveHint`,
    `retained*`, `restoreSource`, `savedAnswer`, `saved`, `unsaved`) + 4 override keys (`exception`, `reason`,
    `recordException`, `scope`).
- `creationFlow` (26) = 11 storage/receipt keys (`storageError`, `unreadableDraft`, `unreadableRequest`,
  `checkReceipt`, `reviewAgain`, `retryStorage`, …) + 15 import-reconciliation keys (`notConversion`,
  `preservedUnresolved`, `archiveOnly`, `notProjected`, `edition.*`, …).

**Plus 162 more reachable keys**: `l.diagnostic` falls back to `homebrewV2.diagnostics.<code>`
(`acquisition-presenters.ts:283-287`), and that namespace has **162 leaf keys** — e.g. `required` "Complete
this field", `obsolete-answer` "An answer refers to a choice no longer offered by this version.",
`unsupported-declaration` "Declared limitation: no automatic interpretation". Total administrative surface:
**223 EN keys**.

**Explains a choice or its consequence — 21 EN keys (42 strings).** Six explain _how to fill the form_
(`intro`, `languageHint`, `arrayHint`, `pointsHint`, `manualHint`, `distribution`); `depends` explains a
gate; 13 are mechanical fact templates rendered in the review list (`hp-per-level`, `movement*`,
`armor-class`, `shieldBonus`, `spellcasting`, `spellPolicy`, `uses`, `none`, `training`, `goldAlternative`);
`creationFlow` adds `startHelp`, `importHelp`. **No key explains what a species, class or background is, or
what picking one will mean in play.** The remaining 78 keys are neutral chrome (nouns, headings, units).

Ratio administrative : explanatory = **61 : 21** in the flow's own namespaces, **223 : 21** including the
diagnostic catalogue.

## 3. How choices are explained today

- **Source picker** (`WizardSources.tsx:64-77`): a native `<select>` of bare names, then a `<details>` whose
  body is `l.snapshot(snapshot, "description")` — resolved via `acquisition-presenters.ts:25-35` → SRD
  catalogue → `CreationSource.description`, which `catalogue-source.ts:47` sets to
  `srdEn(kind, id, "description") ?? ""`. **`i18n/en/srd/classes.json`: 12 entries, `name` only, 0
  descriptions. `races.json`: 9 species, 0 descriptions. `backgrounds.json`: 4 of 4.** The disclosure
  renders an empty paragraph for every class and species; only backgrounds have one sentence.
- **Per-option reading** (`WizardChoices.tsx:137-148`): options whose pool resolves a snapshot (feats,
  spells, invocations, equipment) get a `<details>` "Read {{name}}" plus a nested "Declaration details"
  holding `JSON.stringify(o.snapshot.definition, null, 2)`. Description coverage: feats 20/20, invocations
  30/33, equipment 163/165, spells 349/574. Fighting-style, skill and weapon-mastery options resolve no
  snapshot — bare checkbox, no reading.
- **"What this gives you"**: only afterwards, on step 6 — `WizardReview.tsx:125-181` lists "Selected
  options", "Acquired benefits", the ability table, Maximum HP, Gold, Personal copies.
- **Live consequence preview**: the aside (`CreationWizard.tsx:296-322`) shows the name, source names, a
  saved/unsaved line, and — only once `preview.classes && preview.maxHp > 0` — Maximum HP and Gold. No AC,
  speed, skills or spell slots.
- **Tooltips / compendium links / explain-on-demand**: `grep` over `src/features/creation/*.tsx` (legacy
  excluded) finds **zero** `Tooltip`, `title=`, glossary or compendium references.

## 4. Imagery

**Entirely text-only**: `grep` for `img|svg|Icon|art|portrait|image` over `src/features/creation/*.tsx` and
the two stylesheets (`creation-wizard.css` 293 lines, `creation-flow.css` 46 lines) returns no image, icon
or illustration. Art in the repo, _not_ used here: `assets/monsters/*.webp` (hundreds, via
`src/data/monster-art.ts`), `assets/items/{equipment,magic}/*.webp` (5 files, `src/data/item-art.ts`),
`public/og-card*.jpg`. `src/assets/icons/play-sprite.svg` is the licensed sprite, used by the play surface
only. There is **no species, class or background art and no portrait step** — portraits are set later on the
sheet (`src/i18n/en/ui/portrait.json`), never during creation.

## 5. Validation and error model

- **Producer**: `compose.ts:299-377` builds `issues: OriginDiagnostic[]` (`{path, code, severity}`; severity
  `invalid` | `unsupported`) and sets `valid: issues.length === 0`.
- **Surface**: `WizardIssues` (`WizardChoices.tsx:251-306`) renders a section headed "Choices to complete" as
  a **summary block below the current step's fields** (filtered per step at `CreationWizard.tsx:158-163`,
  `:196-215`). **No error is attached to the offending control**: no field-level state, no scroll-to-error,
  no count badge on the step nav. Each entry = choice name, diagnostic sentence, and a `<details>`
  "Declaration details" exposing `{path} · {code}` verbatim (e.g. `root/skills · choice-count`).
- **Blocking**: no step blocks navigation; only Create does — `disabled={p.disabled || !p.preview.valid}`
  (`CreationWizard.tsx:242`) with a `role="status"` line "Complete the highlighted choices before creating
  your character." on review only (`:228-232`). A beginner who skipped class skills reaches step 6, meets a
  disabled button and one generic sentence, and must walk back hunting the "Choices to complete" block.
- **"Exception"** (P10 spec 60-65, 264-266): an attributed override recorded as
  `{path, code, reason, authorUid}` (`model.ts:159-175`). UI = a `<details>` "Rule exception" with a
  free-text reason box and a "Record exception" button (`WizardChoices.tsx:216-249`), offered only for the
  nine `RULE_EXCEPTIONS` codes (`:198-208` — seven `prerequisite-*`, `nonrepeatable-feat`, `ability-maximum`)
  plus `manual-range`; `unsupported` severity is never excepted.
- **"Cascade"** (spec line 229): changing a cause keeps old answers, marked inactive rather than deleted —
  `selectCreationSource` retains every prior selection keyed by source (`model.ts:48-64`); inactive choices
  render disabled with "Retained, inactive choice" / "These answers are kept for returning to this branch.
  They currently grant nothing."; dependants show "Available after: {{parent}}: {{option}}"
  (`WizardChoices.tsx:110-119`); `WizardRetained` (`:308-401`) adds "Retained answers" / "Previous sources" /
  "Use this source again" plus a `<pre>{JSON.stringify(selection.answers)}</pre>` dump.

## 6. Expert speed

- **Import**: `ImportFlow.tsx` (511 lines), route `creation: "import"` (`IdentityApp.tsx:883`) — a
  comparison-and-reconciliation review (file format, rules edition, eight preserved-category checkboxes,
  original-vs-projected columns), not a fast lane: `notConversion` and `preservedUnresolved` say up front
  that mechanical reconciliation stays unresolved.
- **Quick build**: none in the live flow (§1).
- **Keyboard**: native `<select>`/`<input>`/`<fieldset>` and Radix `CheckboxField`, so tab order works;
  focus moves to the step heading on change (`CreationWizard.tsx:53-57`). No accelerators, no
  Enter-to-advance, no in-wizard palette; the only type-ahead is a `type="search"` box shown when a pool
  exceeds 8 options (`WizardChoices.tsx:121`).
- **Remembered preferences**: none — `newCreationDraft` (`model.ts:32-47`) always resets to name "",
  alignment "neutral", method "standard", six `null` scores, no sources.
- **Minimum expert interactions**: **29 (Fighter), 40 (Wizard)**. No path reduces it.

## 7. Gap table

| Area                      | Today (fact · file)                                                                                                                         | Owner principle                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Entry                     | Heading + paragraph + button; `startTitle` reuses `palette.actionNewCharacter` "New character" · `creation-keys.ts:42-46`                   | **Violates** "engage in the birth" — the door is a menu item |
| Class / species           | Bare `<select>` of names; description `<details>` resolves to `""` for 12/12 classes, 9/9 species · `i18n/en/srd/{classes,races}.json`      | **Violates** "help understand the choices"                   |
| Imagery                   | Zero images/icons · `src/features/creation/**`                                                                                              | **Violates** "lived as a game in the browser"                |
| Consequence preview       | Aside = name, source names, saved-state, HP, Gold; rest waits for step 6 · `CreationWizard.tsx:296-322`                                     | **Violates** "choices and their consequences"                |
| Copy register             | 61 administrative + 162 diagnostic keys vs 21 explanatory; strings expose `path · code` and raw JSON · `WizardChoices.tsx:139-146, 279-284` | **Violates** "bank back office"                              |
| Error model               | Per-step summary block, no field-level error, no gating, one generic blocked line at the end · `WizardChoices.tsx:251`                      | **Violates** — literally "missing fields"                    |
| Expert lane               | No quickbuild, presets or remembered preferences; 29/40 minimum                                                                             | **Violates** "the expert must act fast"                      |
| Beginner lane             | No tooltips, compendium links or recommendations                                                                                            | **Violates** "the beginner must investigate"                 |
| Draft safety              | `sessionStorage` only · `CreationFlow.tsx:46` — closing the tab loses it                                                                    | **Violates** — the work is not precious                      |
| Navigation freedom        | Six steps always clickable both ways; step is a route; focus managed · `CreationWizard.tsx:88-101`                                          | **Serves** "act fast without mandatory explanations"         |
| Non-destructive branching | Source changes retain and can restore prior answers · `model.ts:48-64`                                                                      | **Serves** exploration — but as a JSON dump                  |
| Read-before-choose        | "Read {{name}}" disclosure where a snapshot resolves (feats 20/20, spells 349/574)                                                          | **Serves** "investigate while playing" — partial             |
| Bilingual parity          | 160/160 EN and IT keys, no gaps                                                                                                             | **Serves** the bilingual invariant                           |
