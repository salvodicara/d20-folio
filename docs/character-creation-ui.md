# Guided creation interface

`CreationWizard` is the controlled V2 view. Its parent supplies the one `CreationDraft`,
`CreationPreview`, route-owned `CreationStep`, recorded Library versions and lifecycle state.
The view emits `onChange`, `onStep`, `onConfirm`, `onLibrary` and `onExit`; it performs no
storage, authentication, routing or Firebase writes. Every edit retains the route step as
the draft hint. Only the parent's successful write/readback state may display the saved
message. Pending or unavailable controller state disables edits and confirmation.

Six steps cover identity and standard languages; species/background; class; base abilities
and background increases; starting equipment; and review. Standard-array, point-buy and
manual scores use the shared ability checks. Manual scores outside3–18 need an attributed
reason; unsupported values outside1–30 remain invalid. The view never rolls scores or
silently assigns official choices. A complete valid preview is required for confirmation.

Source selectors offer the complete composed catalogue and frozen Library versions. A
source switch preserves its answer record; returning to the source restores those answers.
Catalogue pools use `preview.options(choice)`, preserving the composer's acquisition-phase
context for expertise and spellbook preparation. Search filters the full pool, while selected
options remain available for removal. Each spell, feat, invocation or equipment snapshot has a separate read-before-choice disclosure
with localized description and its complete declared definition; opening it never selects it. Multi-select counts, parent dependencies, retained
inactive answers and explicit clearing are visible. Inactive sources and answers grant no
benefits. The Library action leaves preservation and return navigation to the controller.

The review shows source/version, base/increase/total scores, maximum HP, gold, selected
feats/options, attributed acquisitions and exact personal copies. Known, prepared, spellbook
and free-cast entitlements have separate labels. Recorded exceptions keep path, code, reason
and author; only the shared evaluator's enumerated prerequisite/nonrepeatability/ability-cap
codes can receive an acquisition exception. Unsupported declarations cannot be bypassed.
Full original declarations remain consultable, without claiming execution of combat mechanics.

EN/IT chrome lives in `creationV2.json`. Catalogue names and authored grant-option labels
resolve through stable SRD keys; custom names remain authored content. Native controls,
fieldsets, keyboard focus on step changes and responsive two-column/one-column composition
follow the approved V2 creation reference and existing identity shell. Actual optimized
runtime, controller/repository behavior and viewport screenshots are separate verification
boundaries from these controlled component tests.

The old no-prop wizard remains byte-identical in `LegacyCreationWizard.tsx`, imported only
by the existing legacy route and its tests. The new view has no legacy compatibility branch
or evaluator import. The existing Fighter quickbuild preset now names Defense, and Rogue
names Perception/Investigation expertise, satisfying the newly typed level-one requirements
while preserving the existing editable quickbuild behavior. V2 requires explicit answers.
