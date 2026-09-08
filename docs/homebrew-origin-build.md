# Character origin build persistence

`origin-build-repository.ts` stores one aggregate at
`folioAccounts/{ownerUid}/characters/{id}/origins/build`. `origin-build.ts` owns its
codec and composition. The imported sheet is unchanged. This prepares character
origins; it does not execute combat, growth, inventory transfers or a legacy bridge.

`createOriginBuildRepository(db, session)` exposes `read`, `watch`, `watchIssues`,
`saveIntent(character, base, targetId, selectionOrNull)`, `commit` and `reconcile`.
The exported `OriginBuildRepository`, `OriginBuildOperation`, `OriginBuildReceipt`
and `OriginBuildIssue` types are the UI boundary. A null read means absent only;
incompatible stored content emits exact serialized recovery and an error.

An intent changes exactly one stable root. Other map entries remain structurally
identical; array order matters. An operation includes a derived predecessorId witness for the highest prior ordinal;
rules compare that root and independently prove all prior ordinals are lower.
Insertions append acquisition ordinals; replacements
retain them and removals never renumber. A source-changing intent verifies one exact
actor-owned immutable LibraryVersion, whose flat dependency bundle travels inside
that root. Answer-only changes and removal need no source read, so deleting or
revoking a source never destroys an already acquired snapshot. Library offers and
acceptance retain their existing consent boundary; there is no child grant or queue.

P03 Envelope/OperationController and the existing UI envelope storage remain the
only submission mechanism. The UI persists and reads back the complete envelope
before calling commit. Each intent gets an immutable session ticket. Auth/scope
changes invalidate tickets, including A→B→A. `commit` compares the exact operation
against its ticket, reads the exact receipt first, checks the user and original
character revision/assignment, compares the complete stored aggregate, and writes
one next aggregate plus one receipt atomically. Firebase gets `maxAttempts: 1`.
Conflict preserves the caller's original base. Duplicate delivery returns the same
receipt, including an apparent stale-base race where the receipt read preceded
the competing identical commit. Only an exact readable receipt can acknowledge
that operation; unrelated stale bases remain conflicts. `reconcile` can inspect a persisted exact envelope after reload; it does
not issue a write ticket or authorize automatic replay.

Before ticket creation and before send, the aggregate is limited to180000 UTF-8
bytes, the complete envelope to600000 bytes and each complete JSON tree to4096
nodes. The target selection is derived from `selections[targetId]`, with no third
snapshot copy in the envelope. Repeated base/next content counts every time; multibyte text is
counted as bytes. Oversize content is rejected without truncating its original.
The model codec separately validates root count, snapshot JSON and origin shape.

Firestore permits owner writes only, including for admin accounts. Current P02
sheet readers can read the aggregate without library access. Blocked status wins;
revoked membership, a mismatched reciprocal roster and archived campaign deny peer
reads. Owner personal access remains available after campaign archive. Rules bind
receipt creation to one exact aggregate transition, compare original character
before/after, source before/after and the complete base, reject sibling writes and
allow only one changed root. Rules bound the answer map to1024 paths and exceptions list to128. The codec
validates every answer array/string and exception field; rules do not iterate
those1024 potential paths. Target rules verify acquisition order; receipt rules
validate authority, source and outer selection shape. This split avoids duplicating costly
source checks under the expression budget. Rules enforce storage authority and
bounded shape; the pure composer owns D&D legality.

A source-changing transaction reads five distinct documents: receipt, user,
character, aggregate and root version. Rules additionally use before/after states
for receipt, character, aggregate and version; repeated calls are cached. There
are no reads per bundled child or unaffected root. The target rule needs user plus
receipt-before/after; the receipt rule needs user, character-before/after,
aggregate-before/after and version-before/after. Each write stays within ten access
calls, with the combined request below twenty even before cross-write caching.

Malformed remote aggregates stay unavailable: recovery exposes the exact original
through the existing library recovery codec, and UI archives/readbacks/downloads it.
P07 does not support replacing malformed remote aggregates. A null-base intent
cannot overwrite an existing malformed document. No server deletion or migration
is smuggled into recovery. Compatible unknown declarations remain preserved but do
not certify a valid modeled insertion. Local malformed envelopes likewise use the
existing archive-before-replacement storage contract.

Evidence uses a separate explicit demo-d20folio emulator cluster. It does not prove
production Firestore byte/expression/index/transaction behavior, App Check/IAM,
provider authentication, HTTPS/hosting or installed-PWA devices. Those remain
separately authorized staging/release checks; no production writes or deployment
are part of this repository change.

The direct-SDK boundary is deliberate and tested: an owner can send nested answers
that satisfy the coarse rules map bound but fail the strict codec. This cannot
grant another identity access or alter a sibling/foreign character. A subsequent
repository read reports the original as incompatible with exact recovery instead
of treating it as a missing build. Exception `authorUid` is descriptive metadata;
the aggregate's authenticated receipt actor records who actually wrote the change.

The maximum-bundle rules fixture retains the literal payload schema type (`1`)
when constructing its LibraryVersion; this type annotation does not alter stored JSON.

Maximum-shape evidence distinguishes coarse raw writes from legal authoring. The raw
rules cardinality test deliberately stores unvalidated SDK placeholders and proves
only one-root/source/ACL bounds. Separate tests use `includeOriginDependency` to
construct one root plus31 conforming feature definitions, validate the full composed
receipt budget, and persist/read the legal closure alongside31 valid acquired roots.
Compact maxima fit; larger individually valid multibyte drafts may exceed the shared
aggregate budget when combined. That path rejects before send and preserves the full
base and selected draft. Cardinality limits never promise every size combination fits.

## Creation source and choice context

Selections optionally retain `resolvedChoices: Record<path, DefinitionSnapshot[]>`
alongside path answers. Existing records omit it unchanged. Root and selected catalogue
snapshots use [explicit sources](homebrew-sources.md), with injected exact adapter
verification. `composeOriginBuild`, `validateOriginSelection`, `projectOriginCharacter`
and `createOriginBuildRepository` accept optional ChoiceResolutionContext. Ordinary
single-root source changes still require an exact owned LibraryVersion and do not mint
new catalogue sources or change resolvedChoices; new catalogue selection belongs to the
atomic creation operation. Unchanged snapshots and retained answers remain recoverable.
Attributed inherited class facts survive origin projection independently of ambiguous
imported baseline values, without introducing stored class-derived fields in the parent.

## Shared class and origin acquisition

`composeAcquisitionBuilds(character, originBuild, classBuild, context)` keeps the separate origin
and class aggregate owners while returning one attributed composition. `composeOriginBuild` remains
its origin-only wrapper. Initial class root/starting/progression frames use stable paths and class
level1. Root prerequisites precede its own facts. Class saving throws, declared casting, training
and foundation choices precede origins; dependent class choices follow origins, allowing expertise
to use background skills. Frame eligibility remains fixed through these phases. Obsolete answers
are diagnosed only after deferred choices. No retry loop or synthetic class-as-origin is used.

`OriginComposition.selectedEquipment` contains `{selectionId, path, snapshot, quantity}` for pool
selected items. The exact snapshot is the materialization source; it is not a fictitious root
closure dependency. The evaluator itself performs no inventory writes or currency spending.
Independent selected closures retain separate dependency traversal and local casting choices even
when their local dependency keys coincide. Source snapshots remain immutable.

Training prerequisites use `{kind:"training", category:"armor"|"weapon", id}` and require
an earlier attributed training fact. A candidate cannot satisfy its own prerequisite.
An explicit reason can override that rule, without overriding unsupported source data.
Catalogue adaptation uses the same canonical training tokens as class foundations.
