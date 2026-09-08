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

## Controller and authorized read contract

`CreationFlow` and `ImportFlow` remain mounted under the authenticated account and use the
P09 hash route as the sole step/navigation authority. One owner-keyed local draft record
retains the exact choices or import bytes with a revision and submission binding. The
operation hook owns the only transaction envelope. The controller binds its original route
and draft revision only after that envelope has been written and read back, before SDK
commit. Receipt checks never replace that route fence. Acknowledgement retires only the
submitted draft revision; later edits and later navigation survive. Unreadable retention is
quarantined with exact download and verified archival recovery, never treated as no request.

Import comparison separates file format, source edition declarations, owner classification
and unresolved mechanical reconciliation. Each category shows the original and projected
values side by side in reading order; omitted fields remain explicitly archive-only. A
reviewed checkbox never claims conversion or execution. Refreshing an existing comparison
preserves the owner's proposed classification and reviewed categories while refreshing CAS.

Guided sheets require both authorized origin and class aggregates. Missing or incompatible
required documents block projection, while legacy/imported optional aggregates retain their
existing baseline. One composition projects their facts; base scores are not rewritten with
increases. Frozen initial copies carry their own source closure and require no private child
read. Denial withdraws that source cache, including paired-listener and stale-session races.
Official names and options use the shared acquisition presenter in creation and saved-copy
summaries; authored custom names and exact snapshot bytes remain unchanged.

Guided acquisition records are consultable after creation. Their origin-only editor is
unavailable because class and origin choices have one shared acquisition authority; coherent
in-use editing is owned by the later engine/play block. Personal copy state remains editable
through the existing guarded repository. Consultation and preview do not certify combat
execution. Catalogue export preserves the original catalogue snapshot and source-aware print
context, including intentionally partial official declarations.

Authenticated catalogue context follows class starting and progression declarations into the origin reader, so choice titles, options and their parent conditions share the creation presenter’s EN/IT labels. Included dependency headings independently verify their frozen catalogue source and show its release; ordinary Library inclusions retain their authored names and source version. Canonical training names resolve through the proficiency catalogue, including legacy identifier aliases. Consultation does not modify source snapshots or certify execution.

Saved import comparison resolves the character’s owner and ID even when called with the complete character record; the stored reconciliation reference remains exactly those two fields. Review updates preserve the original and projected character under full-base CAS.

After reload, receipt recovery retires the exact completed draft without stealing navigation. Its acknowledged state offers an explicit View character action. A live save returns through the roster so closing inspection does not reopen the completed wizard.

Creation uses canonical labelled checkbox controls. Logical creation labels reuse existing bilingual keys through one UI key map; canonical source normalization is locale-independent. Review copies and saved copies resolve the exact included catalogue child before localizing its name and release. Custom names and unmatched originals remain authored text. Official class progression headers show the localized level within their already named class; authored custom progression names remain visible.

Roster summaries do not subscribe to every character's private acquisition sources. When a
source name is unavailable in the catalogue, they use the localized custom-entry label rather
than exposing an internal identifier. Authorized inspection uses the frozen authored source name.
The shared sheet resolves canonical equipment-backed tool proficiency names while preserving
legacy training labels and unmatched authored text. Presentation does not rewrite stored facts.
