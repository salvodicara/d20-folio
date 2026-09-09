# PD research — Baldur's Gate 3, D&D Beyond, and the current creation flow

## 0. How to use this document

Claude wrote PD's research half (2026-09-09): Astra owns visual/taste (`DECISIONS.md`; `PROGRAM.md` §roles).
No visual verdict (§9–§10). Evidence: [`2026-09-09-pd/`](2026-09-09-pd/) — E1 creation, E2 combat, E3 DDB, E4 disclosure, E5 current.
Citations `(E4 §1; S3)`: file/section, § Sources.
Astra's next: creation screens + art; verdict closes PD.

## 1. The owner's brief, restated as testable outcomes

The brief is `docs/program/DECISIONS.md` (2026-09-09) and `PRODUCT.md` § Clarity: the experience is "troppo fredda, distaccata e amministrativa" and creating a character answers "mancano i campi"; the expert acts fast with no mandatory explanation, the beginner investigates and learns while playing, and neither costs depth. Numbers come from the evidence where it has them; otherwise the target is a delta from our own baseline.

1. **A first-timer completes a Fighter without reading a rule outside the app:** every required choice explains itself in place, and nothing task-required lives only in a hover tooltip (E4 §1; S1, S2). Today 12/12 classes and 9/9 species render an empty description (E5 §3).
2. **A quick path yields a legal, playable level-1 character from ≤ 3 inputs**, D&D Beyond's Quick Build count (E3 §1; S8). Today the shortest valid path is 29 interactions for a Fighter, 40 for a Wizard (E5 §1, §6).
3. **An expert finishes in materially fewer than 29 / 40 interactions**, via a one-click recommended preset per decision family that stays editable, as BG3 does for the 27-point pool (E1 §1; S12). No verified BG3 click-count exists, so the target is our own delta (E1 §4).
4. **No step presents more than 3–4 decision fields, the flow stays at or below 8 net steps, and a progress indicator carries per-step completion state** — that field band carries a 30–40% completion improvement, usability "does seem to suffer" at 8+ steps, and a missing indicator costs 28% more abandonment in e-commerce checkouts (E4 §1, §6; S5, S6). Today 6 steps carry 13–14 decision groups and the step buttons show no state (E5 §1, §5).
5. **The copy register inverts:** every required choice gains an explanatory string, and none exposes a path, code or raw JSON. Today the ratio is 61 administrative to 21 explanatory keys — 223 to 21 counting the diagnostic catalogue the flow renders from — and the UI prints `root/skills · choice-count` and `JSON.stringify` dumps (E5 §2, §5).
6. **Each validation message names its field and its fix, attached to the offending control** — "Choose a subclass", not "Required" (E4 §6; S4). Today: one summary block per step, no field-level state, no gating (E5 §5).
7. **No disclosure hierarchy exceeds two levels;** beyond two "users often get lost" (E4 §1; S1). Today both levels hide implementation detail — a `<details>` inside a `<details>` ending in a JSON dump (E5 §3).
8. **Every choice that changes a derived value shows what changes before the click**, as Fire Emblem's forecast and Into the Breach's telegraphing do (E4 §2, §4; S15, S16), **and the draft survives closing the tab**, as GOV.UK's "Save and complete later" does (E4 §6; S3). Today the aside shows only the name, the source names, a saved/unsaved line and — once a class exists — Maximum HP and Gold, while the draft lives in `sessionStorage` (E5 §1, §3).

## 2. What the current flow does — facts

From E5, against `origin/v2`; paths are repository-relative. `src/main.tsx` renders `IdentityApp`, which mounts `CreationFlow`; the 2389-line `LegacyCreationWizard` is reachable only through `src/App.tsx`, which nothing imports. Steps come from `src/lib/character-creation/steps.ts`, after a start panel of one heading, one paragraph and one button (E5 §1).

| Step      | Asks                                           | Required                       | Default             |
| --------- | ---------------------------------------------- | ------------------------------ | ------------------- |
| identity  | name, alignment (10), 2 extra languages        | name; exactly 2 languages      | alignment `neutral` |
| origins   | species, background, and the choices they emit | both sources; every choice     | none                |
| class     | class, skills, fighting style, mastery, spells | class; every choice            | none                |
| abilities | method, six scores, background +2/+1 or +1×3   | valid scores; the distribution | `standard`, `null`  |
| equipment | class package, background package-or-gold      | both                           | none                |
| review    | read-back and Create                           | the preview must be `valid`    | —                   |

- **No recommended or quick path is reachable:** `src/data/quickbuild.ts` and `src/lib/quickbuild.ts` are imported only by the legacy wizard, and nothing live pre-fills, suggests or ranks an option (E5 §1).
- **Navigation and drafts.** All six steps stay enabled in either direction, the step is a route segment so browser back and forward work, and focus moves to the panel heading on change. The draft lives in `sessionStorage` and nothing reaches Firestore until Create (E5 §1).
- **Strings and explanation** (E5 §2, §3). 160 EN and 160 IT keys, full parity: 61 administrative or validation, 21 explanatory — only 6 of which explain how to fill the form — plus 162 diagnostic keys borrowed from the homebrew editor, giving 223 against 21, and **none of the 160 explains what a species, class or background is, or what picking one will mean in play**. The source picker is a `<select>` of bare names plus a `<details>` resolving `srdEn(kind, id, "description") ?? ""`, and the English SRD catalogue carries `name` only for all 12 classes and all 9 species, so it renders empty for each (the 4 backgrounds have text). Feats, spells, invocations and equipment get a "Read {{name}}" disclosure with real text (feats 20/20, equipment 163/165, spells 349/574); fighting style, skill and mastery options are bare checkboxes, and zero `Tooltip`, glossary or compendium references appear in the six live files.
- **Imagery and expert speed** (E5 §4, §6). No image, icon or illustration in `src/features/creation/**`, no species, class or background art and no portrait step. Import is a reconciliation review, not a fast lane, and there is no quick build, no accelerators and no remembered preferences, so the expert minimum equals everyone's: 29 and 40.
- **Error model** (E5 §5). `compose.ts` emits `OriginDiagnostic {path, code, severity, selectionId?}` and sets `valid` from their absence; `WizardIssues` renders a per-step summary block exposing `{path} · {code}` verbatim. No error sits on the offending control, no step blocks navigation, and only Create is gated — so an unpicked class skill is discovered at step 6 and hunted for backwards.
- **Already serving the brief** (E5 §7): bidirectional navigation with managed focus, non-destructive branching, an attributed rule exception, read-before-choose where a catalogue carries text, and EN/IT parity. Nine areas violate an owner principle: entry, class/species, imagery, consequence preview, copy register, error model, expert lane, beginner lane, draft safety.

## 3. Baldur's Gate 3 — the model for playing

**Creation** (E1 §1; S11, S12, S13). Order: origin → race/subrace → appearance → class → background → abilities → skills → name, all but appearance mandatory; "Proceed" "illuminates only when all requirements are met". A one-click **Recommended** preset fills the 27-point pool to the class ideal, the primary ability carries a star on the allocator, and skills are a class-filtered 2–4 from about 5 or 6. The step list looks sequential but is not — "each section can be completed in any order" — a flexibility E1 §6 records the UI as under-communicating.

**Explanation and consequences** (E1 §2, §3; S11). The flavour-versus-mechanics split on the class and race panels **could not be verified from text-only sources**; what is confirmed is a right panel that "dynamically updates… showing current class and race choices, available spells or abilities, spell slot organization". Nested tooltips are a Larian pattern game-wide but **not confirmed for creation**. Consequences are concrete instead: wizards pick 3 cantrips and 6 spells inside creation, and each background shows its two granted proficiencies beside its flavour text.

**Reversibility is asymmetric, signalled by mechanism rather than copy** (E1 §2; S14, S17). Class, subclass, abilities, skills and spells change later for 100 gold through Withers; race, subrace and appearance do not, and the cosmetic-only Magic Mirror still excludes race. **No source shows a "this is permanent" label at the point of choice** — permanence is communicated only by omission, a gap to state explicitly rather than copy.

**Engagement, uptake and criticism** (E1 §1, §3, §4, §6; S18, S19, S20). A live 3D model reacts to picks, with curated presets chosen over sliders because "small millimetre changes can make or break a face completely"; voice is previewable in one click; 17 narration types shift the narrator's tone. Telemetry: 88 years in the creator, about 9% of playtime, and **93% chose custom over the six pre-made Origins**; **no verified expert click-count exists**. Against that, "overwhelming" is the most repeated complaint, and irreversible race is a persistent regret.

**Combat and spell UI** (E2 §1, §3, §5; S21, S22, S23). The cost badge pairs an icon with a word — Action is "a green circle with the word 'Action'", Bonus Action an orange triangle; concentration folds into the Duration field; Save DC is a flat caster-derived number; keywords carry stable reusable definitions (Advantage: "roll the D20 twice, take the higher"). Action, Bonus Action, Reaction and Movement refresh each turn, reactions firing on a trigger from their own tab under a three-state always / never / "Ask" control. The hotbar groups Common, Class, Racial, Situational, Weapon and Spells; targeting shows a live hit-chance percentage and save spells the DC; Examine is free.

**Iconography taxonomy — described, never copied** (E2 §2; S24, S25). Conditions are small icons anchored top-left of the portrait, with a rarer floating-overhead treatment for high-salience changes; bg3.wiki catalogues the icon assets and one category per school, and eight schools organise the corpus. **The colour-per-school palette and the "monochrome icon on coloured background" rule are unconfirmed by any fetchable source, and that art is Larian's copyrighted work: taxonomy reference only, never traced or copied.** What transfers is the taxonomy, the anchoring, and cost named as well as shaped.

**Gaps and defects** (E2 §1, §4, §6; S26, S27). BG3 has no DM, so pause, inspect-any-actor, force-a-result and edit-HP-mid-combat have no precedent, and the simultaneous-turn model exists only because there is no DM — not transferable without an explicit decision. Spell tooltips carried a wrong Save-DC-related figure for months while the roll maths stayed correct (partially verified); an upcast picker once failed to register a higher slot; the hotbar is widely called "too cluttery" (forum-level).

## 4. D&D Beyond — the model for owning a character

**Four entry points, each scoped to an intended use** (E3 §1; S7): Premade (fully editable), Standard, Quick Build (species, class, name — "handy when time is of the essence"), Randomize. **Step order is contested inside D&D Beyond's own posts** — one tutorial gives Preferences → Class → Background → Species → Abilities → Equipment, another the 2024 order Class → Origin → Abilities → Alignment — and E3 records that the two were never reconciled (S9).

**Explanation and guidance** (E3 §1, §4; S7, S8, S9). Required picks get a distinct visual state that blocks progression, outlined in blue, rather than after-the-fact validation. A global **Help Text** toggle in the header, on by default, is D&D Beyond's own recommendation for new users and the only verified single explain-on-demand switch found in this research, and a **Sources / Partnered Content** checklist scopes the builder to the books in play as its first step. The 2025 **Quickbuilder** shows class and species as art tokens, explicitly "iconic D&D art, not walls of text", on a low-traffic testbed because Quick Build "doesn't see much use" (E4 §3; S8).

**Where art is spent and where it is withheld** (E3 §3; S28). Portraits carry official book art with user upload, as a header element rather than per-mechanic, and items carry art — but **spells are text-only beyond a small school badge**: Fireball's page is a text block with one Evocation badge. **The book art and the Quickbuilder's art tokens are WotC's copyrighted assets, not D&D Beyond's — the same caveat as BG3's iconography (§3): only the placement pattern is copied, never the art itself.** **This is the one place where the strongest external evidence and the owner's brief point in opposite directions**: D&D Beyond withholds art from the highest-frequency lookup surface, exactly the surface the owner wants illustrated. The reconciliation is Astra's (§10).

**The sheet, the campaign and the anti-patterns** (E3 §2, §5, §6; S10, S30, S31, S32, S33). Confirmed tabs are Actions, Spells and Inventory (snippet-level, unverified); rest buttons reset per-rest resources at once, but the Short Rest panel shows what each Hit Die returns and **does not auto-roll or apply it** (snippet-level, unverified), and PDF export matches WotC's template while being reported flaky (snippet-level, unverified). The DM gets live sheet access plus a real-time Game Log, and the Encounter Builder bands difficulty over a budget bar — contested as a heuristic. The anti-patterns: the sitewide `[tag]` tooltips work in forums and homebrew text but **explicitly not on the character sheet**; the 2025 relayout drew the largest negative thread here, "sterile, empty, and zero D&D flavor"; and shared homebrew repeatedly fails to reach players.

## 5. Progressive disclosure and onboarding — the evidence base

**Canon** (E4 §1, §5; S1, S2, S3). Show "only a few of the most important options… Offer a larger set upon request". It works when a task splits into low-interaction steps with strong information scent; it fails when steps are interdependent, beyond two levels ("users often get lost"), or when the primary list hides items needed often. Hover-only tooltips as the sole channel for needed information are an accessibility failure, and wizards "are not gracefully interruptible" — mitigate with step indicators, save and resume, and prior answers as defaults.

**Numbers** (E4 §1, §3, §6; S5, S6). On a long task multi-step lifts conversion up to 300% over one giant page and 3–4 fields per step improves completion 30–40%, while single-page wins on a short task. Average checkout length is 5.1–5.42 steps and usability "does seem to suffer" at 8 or more. Without a progress indicator abandonment is 28% higher in e-commerce checkouts; multi-step forms show 32–34% starter abandonment. **No D&D-specific figure exists.**

**Help, defaults and game mechanisms** (E4 §1, §2; S15, S16, S17b). Tutorials "don't result in better task performance" and are routinely skipped, and up-front guidance is "hard to remember… when the user needs it", so pull-triggered help beats push tutorials. Recommended defaults help because "one 'good' choice automatically selected" means "fewer people will fail to make a choice" altogether — E4 marks this opinion-leaning. BG3's difficulty is a preset switchable mid-run and its Origins let a wrong pick never block; Slay the Spire colours keywords gold with tap-or-hover definitions; Hades' Codex and the Civilopedia are opt-in and free to ignore; Into the Breach telegraphs every enemy action, so preview replaces explanation; Fire Emblem forecasts hit chance and damage pre-commit.

**The D&D newcomer, digitally** (E4 §3, §4, §5). The hard parts are ability-score-to-modifier translation, proficiency stacking and spell-slot pacing; new players "stare at their character sheet like it's a tax form", and creation is "overly involved and fiddly" once feats, race and class interact. Roll20's Charactermancer pairs each decision with the relevant rulebook passage, and Foundry builders converge on Identity → Species → Class → Background → Abilities → Skills → Spells → Equipment → Review. **No published completion telemetry exists** for premades, and **no controlled study on identity-first versus -last ordering was found**. On errors, the message under a field "should relate specifically to that field", and GOV.UK offers "Save and complete later" on every page (E4 §6; S3, S4).

**The twelve rules, reconciled with §3–§4.** (1) Cap disclosure at 2 levels (S1) — safe, since BG3's nesting is unverified. (2) One pre-selected recommended default per step, one click to accept, inline-overridable — BG3's preset and star. (3) Nothing task-required lives only in a hover tooltip (S2) — D&D Beyond's sheet is the counter-example. (4) Contextual help at the decision point, not tutorial overlays (S2). (5) A live pre-commit preview for any choice affecting derived stats (S15) — Folio shows five fields. (6) Auto-save every step, resuming where left off (S3) — only Folio's storage tier is wrong. (7) Each step is a single decision-family — Folio's `origins` mixes species and background. (8) Validation names the field and the fix (S4) — contradicted by `root/skills · choice-count`. (9) A glossary layer on demand, never auto-opened (E4 §2; S29). (10) A quick path in ≤3 inputs beside the full custom path (S8) — qualified by 7% uptake in BG3. (11) Any assist toggle stays changeable mid-session (E4 §2; S34). (12) A progress indicator above 6–8 net decision-steps (S5, S6).

## 6. Patterns to copy, with evidence

Twelve observable behaviours, each with a check writable as a test or measurable on a build.

| #   | Pattern                                         | Seen in                      | Solves                       | Verify                                             |
| --- | ----------------------------------------------- | ---------------------------- | ---------------------------- | -------------------------------------------------- |
| 1   | One-click preset fills a decision family        | BG3 allocator (E1; S12)      | Expert speed, blank page     | Every preset yields a valid preview; Fighter < 29  |
| 2   | Primary ability badged on the allocator         | BG3 (E1 §3)                  | Beginner sees what matters   | Each `classTables` entry resolves a marker         |
| 3   | Pick lists filtered and short, 2–4 of ~5–6      | BG3 skills (E1 §1; S13)      | The 3–4 fields-per-step band | Each pool is ≤6 options, else searchable           |
| 4   | A flavour choice states its grant inline        | BG3 backgrounds (E1 §3)      | Knowing what a choice means  | Each option row renders its granted ids            |
| 5   | Primary action disabled, gaps shown in place    | BG3 (S11); DDB (S7)          | Ends "mancano i campi"       | Unpicked skill: nav counts it, control says so     |
| 6   | Errors name the field and fix, on the control   | UK Parliament DS (S4)        | Replaces `path · code`       | Each code maps to a message naming a control       |
| 7   | Three creation speeds, quick one a minority     | DDB (S7); BG3 (S19)          | Expert and beginner in one   | Quick path valid from ≤3 inputs, nothing exclusive |
| 8   | One global help-verbosity toggle, on by default | DDB Help Text (S7)           | No mandatory explanation     | Renders both ways; persists; never locked          |
| 9   | Marked keywords define themselves, ≤2 levels    | Slay the Spire (S17b)        | Learning while choosing      | `GlossaryTip` covers the labels; no 3rd level      |
| 10  | Pre-commit forecast of what a choice changes    | Fire Emblem (S15); ItB (S16) | Understanding consequences   | A preview diff reports AC, speed, skills, slots    |
| 11  | Cost and category named as well as shaped       | BG3 badge (E2 §1; S22)       | Legibility, accessibility    | Every badge has a shape and a text label           |
| 12  | Reversibility stated at the point of choice     | BG3 Withers (E1 §2; S14)     | Knowing what is undoable     | Each choice renders a reversibility fact           |

## 7. Do-not-copy list

Flaws documented in the sources, not preferences.

1. A tooltip layer that stops working where lookup matters — D&D Beyond's `[tag]` tooltips are disabled on the sheet itself (E3 §6; S31).
2. Displayed numbers diverging from simulated ones — BG3's spell tooltips carried a wrong Save-DC figure for months (E2 §6; S26). One source of truth, one test suite.
3. Maths shown but not applied — the Short Rest panel states what each Hit Die returns, then demands manual HP entry (E3 §2, snippet-level, unverified).
4. Permanence communicated only by omission, or a step list that implies an order it does not enforce (E1 §2, §6; S11, S14).
5. Genericising a genre product for cleanliness — the 2025 D&D Beyond relayout — or burying one-tap mobile features for a visual refresh (E3 §6; S30).
6. An unbounded flat action list, and newly granted or temporary abilities that fail to surface where they are used (E2 §6; S27).
7. A computed number without inspectable maths (E3 §5; S32), an ambiguous chooser state (E2 §6), or silent content-visibility drift (E3 §6; S33).
8. Push tutorials and unskippable beats (E4 §1, §5; S2, S3), overwhelming the newcomer by exposing everything at once (E1 §6; S20), and assuming BG3's simultaneous-turn model transfers to a table with a DM (E2 §4).

## 8. Consequences for the engine and data — Claude's lane

Concrete gaps, each with the file that would own it and what already exists. None is a visual decision.

**8.1 Recommended-build data — exists, wired to the wrong flow.** `src/data/quickbuild.ts` declares one ready-made level-1 build per class (`abilityOrder`, `boost`, `classSkills`, `cantrips`, `spells`, `choices`, `languages`, `lineage`), guarded so every composed class has one and extended by the pack, and `src/lib/quickbuild.ts` is the pure applicator. `src/data/quickbuild.ts` is imported only by the legacy wizard; `src/lib/quickbuild.ts` also by `src/lib/quickbuild-random.ts` and its type by `src/data/pack-empty.ts` — still a legacy-only chain (E5 §1). **Gap:** the applicator targets the legacy `creationChoiceSlots` seam, not P10's `OriginChoice` seam, so a new module beside `src/lib/character-creation/` must replay a preset through `selectCreationSource` and `answerCreationChoice`, pinned by a test that every preset is `valid`.

**8.2 Explanation text per source — the largest content gap.** `catalogue-source.ts` resolves a description as `srdEn(kind, id, "description") ?? ""`, and `src/i18n/en/srd/classes.json` carries `name` only for all 12 classes while `races.json` has none for its 9 species. **Gap:** author a description per class and species in `src/i18n/{en,it}/srd/` under the licensing partition — SRD 5.2.1 public, non-SRD in the private pack — guarded by a test that no creation source resolves an empty description. Beginner one-liners already exist, unmounted: `create.tip_<classId>` covers 13 classes in both locales (Fighter: "Great for beginners. Second Wind heals you in a pinch, Action Surge gives an extra turn burst.") and `src/lib/views/creation-view.ts` exposes `classTip` and `classGalleryVMs` to the legacy `steps/ClassGallery.tsx`; species and backgrounds have none.

**8.3 The glossary — exists, with zero uses in the live flow.** `src/components/shared/GlossaryTip.tsx` is the single plain-language glossary primitive (click-to-open popover, keyboard and touch equivalent, one level) and `src/i18n/{en,it}/ui/glossary.json` holds 49 terms including `armorClass`, `proficiencyBonus`, `spellSlot` and `pointBuy`. It serves the sheet, level-up, the compendium and the legacy wizard — and none of the six live creation files. **Gap:** wire it, and add the missing creation terms (species, background, subclass, fighting style, weapon mastery, standard array).

**8.4 Consequence-preview projections — the data exists, the delta does not.** `CreationPreview` (`compose.ts`) already carries `abilities`, `maxHp`, `gold`, `composition`, `origins`, `classes`, `loadout` and a full `character: FolioCharacter`, and `previewCreation` is pure, but the aside reads five fields (E5 §3). **Gap:** a pure "what changes if I choose X" projection — a speculative draft, a second `previewCreation`, a diff — owned by a new module in `src/lib/views/`. No engine change.

**8.5 Drafts and diagnostics.** `CreationFlow.tsx` passes `sessionStorage` to the storage-agnostic `CreationDraftStorage`, so surviving the tab is one argument, while a cross-device draft is a Firestore document owned by `docs/CHARACTER_SCHEMA.md`. Unknown `OriginDiagnostic` codes fall back to `homebrewV2.diagnostics` — 162 keys authored for the homebrew editor, not for a player (E5 §2) — so creation needs its own message catalogue naming the field and the fix, plus enough anchoring on the diagnostic (the control, not only a `path`) for the UI to attach it.

**8.6 Raster art addressing.** `src/data/monster-art.ts` and `src/data/item-art.ts` are the pattern: id-keyed maps built with `import.meta.glob` over `assets/**/*.webp`, overlaid by the pack, with URLs kept out of character data and i18n so art can be remastered without a migration, plus a stated rule that art is a corpus — a partial collection is a defect. **Gap:** a `src/data/spell-art.ts` and `assets/spells/`, and equivalents for species, class and background if creation carries imagery. The images and their style are Astra's.

**8.7 Three smaller gaps.** `steps.ts` is a flat six-entry const and the step is a route segment, so splitting `origins` or reordering is a cheap edit — that is where Astra's step order lands. Anything the redesign persists on a character passes through `src/lib/character-codec.ts` and is a schema change owned by `docs/CHARACTER_SCHEMA.md`. And the flow is at 160/160 EN/IT keys (E5 §2), so class plus species descriptions cost 21 more entries per locale.

## 9. Open questions only the owner can answer

1. **Does a ≤3-input quick path belong where the character's birth must engage?** Both references qualify it — 7% uptake in BG3, "doesn't see much use" at D&D Beyond (E1 §3; E3 §1). Building it is cheap (§8.1); offering it at the door is a product call.
2. **Are class and species descriptions authored in-house or taken from SRD 5.2.1, and does the private pack own the non-SRD text?** A licensing-partition call (§8.2).
3. **Does creation gain a portrait or identity-image step?** Portraits are set on the sheet today (E5 §4) and D&D Beyond keeps them a sheet header element (E3 §3); this changes the schema and the art corpus.
4. **Where does the raster corpus come from, and how complete must it be?** Answered 2026-09-09: generated with GPT, BG3-inspired, never identical — see DECISIONS.md. Completeness is open: art is a corpus, a partial collection a defect (`src/data/item-art.ts`).
5. **Is a global "explain everything" verbosity toggle acceptable?** The evidence supports one (E3 §1), but the 2026-09-07 owner decision rejected switches that disable parts of the experience.

## 10. Reserved to Astra — not decided here

Nothing in §1–§8 pre-empts these.

- **The art style of the raster set**, within the owner's boundary: BG3-inspired, never identical — medium, treatment, palette, finish, and how "curated, contemporary, rich without being gaudy" is realised; §8.6 supplies the addressing mechanism and completeness rule. **Whether spells carry art at all**, against §4's evidence, belongs here too.
- **The layout of every step**, the panels' composition, and how §8.4's forecast is shown.
- **Identity-first versus identity-last ordering** — E4 §5 found no controlled study, BG3 asks for the name last, Foundry builders start with identity; §8.7 makes it cheap either way.
- **Colour, typography, iconography and the shape of the register**, and the contradiction in `DESIGN.md` §7 between the mock's green-circle / orange-triangle / purple-star register and the shipped `--at-*` tokens.
- **Portrait treatment and the entry surface**, and **the screenshot matrix** for the verdict.

## Sources

The set behind every claim above carrying a number, a quotation or a documented defect; each evidence file keeps its own full list. Qualifications an evidence file attaches are repeated at the point of use.

- **S1–S3** NN/g, https://www.nngroup.com/articles/`<slug>`/ — S1 `progressive-disclosure`; S2 `tooltip-guidelines`and`onboarding-tutorials`; S3 `wizards`, with GOV.UK "Complete multiple tasks", https://design-system.service.gov.uk/patterns/complete-multiple-tasks/
- **S4** UK Parliament DS, writing error messages — https://designsystem.parliament.uk/how-tos/writing-error-messages/ · **S5** Baymard, checkout form fields — https://baymard.com/blog/checkout-flow-average-form-fields · **S6** Vaimo, checkout length — https://www.vaimo.com/blog/conversion-optimisation-checkout-length/
- **S7–S10** D&D Beyond, https://www.dndbeyond.com/posts/`<id>`— S7`1059`builder tutorial; S8`2135-behind-the-screen-the-new-quickbuilder-and-future`; S9 `1787`the 2024 builder; S10`1087`campaigns and`1135` Encounter Builder · **S28** direct fetches: /spells/fireball (text plus one school badge), /equipment/shortsword (items carry art)
- **S11, S22** GameRant, https://gamerant.com/`<slug>`— S11`baldurs-gate-3-character-creation-guide-ui-explained/`; S22 `baldurs-gate-3-action-economy-explained-…-all-actions-bg3/` · **S12** RPG Site, BG3 creation guide — https://www.rpgsite.net/feature/14583-baldurs-gate-3-character-creation-guide-the-best-classes-races-and-subclasses-to-choose
- **S13, S14, S26** PC Gamer, https://www.pcgamer.com/`<slug>`— S13`baldurs-gate-3-abilities-proficiency-and-skills/`; S14 `baldurs-gate-3-respec-guide/`, with Escapist and GameSkinny on changing race (S17); S26 `games/baldurs-gate/baldur-s-gate-3-s-spell-tooltips-have-been-lying-to-you-…` (partially verified) (Baldur's Gate 3)
- **S15** Fire Emblem Wiki, combat forecast — https://fireemblemwiki.org/wiki/Combat_forecast · **S16** Into the Breach enemy intentions — https://atomicbobomb.home.blog/2020/05/17/into-the-breach-enemy-intentions/ · **S17b** Slay the Spire Wiki — https://slaythespire.wiki.gg/wiki/Module:CardTooltip · **S29** Hades Wiki, Codex — https://hades.fandom.com/wiki/Codex · **S34** bg3.wiki, Difficulty — https://bg3.wiki/wiki/Difficulty
- **S18** Game Developer, an inclusive character creator — https://www.gamedeveloper.com/art/building-an-inclusive-character-creator-for-the-fantasy-world-of-baldur-s-gate-3 · **S19** TheGamer, 88 years in the creator — https://www.thegamer.com/baldurs-gate-3-player-time-spent-in-character-creator-88-years-stats/ (Baldur's Gate 3)
- **S20, S27** Steam Community, https://steamcommunity.com/app/1086940/discussions/0/`<id>`— S20`3792631782308722218`; S27 `4848778928896905084`and`3471730015126690544` (forum-level)
- **S21, S24, S25** bg3.wiki, https://bg3.wiki/wiki/`<page>`— S21`Actions`; S24 `Conditions`, `Category:Condition_Icons`; S25 `Spells` · **S23** GamesRadar, advantage — https://www.gamesradar.com/baldurs-gate-3-disadvantage-advantage/, with Fextralife, https://baldursgate3.wiki.fextralife.com/Prone
- **S30–S33** D&D Beyond forums, thread ids — S30 237200 "Rant: New Layout Sucks"; S31 56575 tooltips dead on the sheet; S32 190355 and 138400 encounter difficulty; S33 161101 shared content not visible
