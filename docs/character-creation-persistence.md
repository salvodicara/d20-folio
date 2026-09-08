# Guided character creation persistence

`src/lib/character-creation/repository.ts` owns the initial guided creation transaction. It accepts
`CreationCandidate {character, origins, classes, loadout}` and writes exactly five absent documents:
parent character revision0, `origins/build`, `classes/build` and `loadout/initial` revision1, plus
one immutable operation receipt with revision0. The parent remains level1 with null assignment and
portrait. Existing import operations remain separate and retain their previous behavior.

The parent must declare `sheet.build.creation` with schema1 and kind `guided`. `intent(candidate)`
allocates one opId, preserves the draft character ID and other creation metadata, stamps the marker's
operationId and every aggregate/item lastOperation witness, validates and freezes the complete
output. Initial item IDs begin with `initial_` and each item starts at revision1. Character references
must match across all outputs. `CreationOperation` extends the shared Envelope with kind
`character-create`, character reference and output; baseRevision0 and null authority mean absence.
`CreationReceipt` contains that exact operation and revision0.

`createCreationRepository(db, session, {verifyCatalogue, validateCandidate})` requires both injected
functions. The synchronous semantic validator belongs to the pure creation composer. Independently,
the repository parses all four outputs, checks revisions, references, witnesses and source
conformance/ownership, and authenticates every catalogue snapshot through the exact verifier.
A source identity cannot name differing snapshots. Roots, selected answers and loadout sources
share one deduplicated source-read set; each owned Library version is read from the server exactly
once at commit and compared as exact immutable JSON values. Included foreign/private children travel inside their
received root closure and require no foreign source reads. Later source revocation does not rewrite
already received instances.

`commit(operation, check?)` requires the live intent ticket, exact envelope and current session.
A→B→A, queued scope changes, caller checks and every awaited operation are fenced. All reads precede
writes; the SDK gets maxAttempts1. The receipt is read first, then actor status, all four target
absences and owned source versions. Existing targets reject without partial writes. A matching
receipt acknowledges only that exact operation; a mismatching one fails. There is no automatic
retry or polling. `reconcile(operation)` independently validates the restored output and reads the
exact receipt; it cannot issue a new write ticket. An absent receipt remains unknown/absent, never
permission to replay a restored envelope.

Each origin, class and loadout aggregate retains its180000 UTF-8/4096-node budget. The complete
operation, including every repeated snapshot, is bounded to600000 UTF-8/4096 nodes before intent
and commit. Oversize data is rejected without truncation. There is no artificial item cap claiming
that every catalogue/custom combination fits those limits.

## Rules and authorized reads

A guided parent marker binds the parent create to its exact new receipt and output. Each child
create likewise binds to the same receipt, actor, character and output section. The receipt proves
all four predecessors absent and all four exact outputs present in the same transaction. Orphan,
incomplete, reused and sibling-target receipts reject. Blocked users and administrator writes to
another owner's guided character reject. Preexisting non-guided P02/import parent creation remains
unchanged; omitting the guided marker cannot authorize the official creation child documents.

Rules validate storage authority and bounded outer shape, not the catalogue adapter or arbitrary
nested mechanics. The client validates all nested items, sources and declarations before intent,
commit and receipt acknowledgement. A direct owner SDK write can satisfy the coarse rule shape
while containing malformed nested item data; the authorized instance reader then quarantines the
exact original through its existing issue/recovery seam instead of treating it as a valid copy.
Tests explicitly exercise this distinction. No additional unrolled item limit is imposed in rules.

Class-build and initial-loadout reads use the existing authorized character-sheet matrix: owner,
trusted administrator and live assigned/reciprocal campaign readers. Revoked or mismatched claims
lose those reads. Owner lookups of absent child documents are allowed so creation can prove absence.

`initial_` items are addressed only through `loadout/initial`. Existing homebrew-state operations
compare the exact whole group, preserve its source map and every sibling, and update exactly one
item plus group revision/witness. A homebrew-update additionally requires both old and new direct
owned Library snapshots, the same entry ID, unchanged state and an exact current owned version.
Bundled and catalogue source switching remains unavailable. Individual `/homebrew/initial_*`
writes reject. No new instance operation, copied source registry or state owner is introduced.

Creation performs six base document reads (receipt, actor, four targets), plus one per distinct
owned Library source. The receipt's rule check uses actor plus before/after states of four targets;
each output's rule check uses actor plus before/after receipt. Cached aggregate access stays below
ten calls per write and twenty per transaction. Grouped state rules use actor, parent/group states
and receipt; direct Library updates additionally verify the version before/after. Client source
reads do not add per-child rule lookups. Demo-emulator evidence does not prove production quotas,
App Check, provider sign-in, HTTPS hosting, installed-PWA devices or UI runtime.
