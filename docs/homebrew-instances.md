# P05 character-owned homebrew instances

The new V2 boundary stores copies at
`folioAccounts/{ownerUid}/characters/{characterId}/homebrew/{instanceId}`.
Each individually addressed copy has its own revision, the complete immutable owned
`LibraryVersion` as `snapshot`, and separate `state` (`quantity`, `remainingCharges`, `prepared`,
`equipped`, `attuned`). Snapshot includes original provenance; an authorized sheet
reader does not need access to the owner's private library. A template update is
explicit and retains state exactly, even when remaining charges exceed the new
capacity. Presentation reports such mismatch; persistence neither clamps nor refills.
Manual state edits preserve the snapshot and execute no mechanics.

`createInstanceRepository(db, session, verifyCatalogue?)` implements `InstanceRepository` from
`src/lib/homebrew/instances.ts`. `addIntent`, `updateIntent`, and `stateIntent`
produce frozen P03-compatible envelopes, consumed by the existing operation
controller via `commit`/`reconcile`. There is no second queue or engine.
A caller supplies the loaded `FolioCharacter`; the transaction and security rules
compare its revision and assignment and the exact previous instance. Add/update
must equal an existing immutable version from that character owner's library.
P05 conformance is a separate authoring/application boundary; this persistence
module validates P04 structure and restricts the four base families.

Every mutation and its immutable operation receipt form one atomic transaction.
Rules couple the receipt to the exact addressed character and instance, preserve
character authority through the whole atomic operation, and deny detached receipts,
piggyback sibling writes, forged snapshots, state smuggling, and foreign-owner
writes including administrator consent. Owner-only mutations remain independent
of campaign membership. Current sheet read ACL requires the live assignment and
reciprocal roster for DM/member access; owner/admin inspection uses P02's existing
read policy. Blocked users have neither access.

A repeated original operation returns its exact receipt, including after later
edits. Session epoch tickets fence stale commits and late callbacks, including
A→B→A. Reload recovery may read an exact receipt for a persisted same-account,
same-scope envelope but does not issue a commit ticket. Missing receipt never
replays an old write. No reconnect/autoretry queue is installed.

`list` and `watch` isolate incompatible records rather than hiding the complete
sheet. `watchIssues` exposes their path and lossless recovery serialization; the
UI must show the issue and offer its original. Account/scope invalidation clears
issue data and unsubscribes watches. Full character objects are accepted wherever
the API takes a structural `CharacterRef`; only owner/id identify the collection.

Verification: focused parser tests and demo Firestore adversarial tests in
`tests/unit/homebrew-instances.test.ts` and
`tests/rules/folio-homebrew.rules.test.ts`; P02/P03/P04 rules regressions run on the
same owned demo cluster. Runtime UI acceptance and combined release gates belong
to the integrating P05 task; these module tests do not claim deployment acceptance.

## Sheet draft lifecycle

`HomebrewSheet` retains a manual state's original instance snapshot and loaded
character authority from the first edit. Session storage keys include the signed-in
account, character owner, character ID and instance ID; two characters may reuse
an instance ID without sharing drafts or operation recovery. A watch update never
silently replaces a dirty draft's base. The sheet compares original/current/local
state and requires explicit review of the latest instance and authority before
issuing a fresh intent. A conflict response also requires that review even when a
new watch snapshot has not arrived. The repository remains responsible for the
final exact CAS check.

Template comparison captures its own instance and character base. Checking or
confirming an update is disabled while a manual draft is dirty, and confirmation
is disabled if the compared base changes. Acknowledgment clears only the matching
submitted state draft; template acknowledgment cannot erase another state edit.
Reloaded unknown receipts preserve drafts until explicit reconciliation succeeds.
Zero-capacity mismatches remain visible; quantity is always numeric, with zero
representing an emptied quantity field, while remaining charges may be null.

Malformed instance originals are offered only for the current character. Listener
success/error callbacks and async version-lookup success/catch handlers are fenced
by the session epoch and mount lifetime. Cleanup releases subscriptions without
running invalidation UI work during normal unmount or StrictMode effect replay.
`tests/unit/homebrew-sheet.test.tsx` exercises these concurrent UI lifecycles with
mock repositories and the real operation controller/hook.

Incompatible local state drafts are archived before any working-draft replacement
or removal. Archive entries have fresh, write-once session-storage addresses under
the same account/character/instance key and preserve exact original bytes. Existing
identical originals are reused without rewriting them. The archive write is read
back before the working draft changes. A failed archive/read/write blocks the
replacement and leaves the visible state unchanged; an unreadable original cannot
be silently replaced. Reopening the sheet offers all archived originals, including
originals from multiple separate incompatible drafts. This is recovery storage,
not a mutation queue, and it grants no operation authority.

## Initial creation loadout

`folioAccounts/{ownerUid}/characters/{characterId}/loadout/initial` groups the initial
items/spells in one schema1 document: `character`, `revision`, `sources`, `instances`,
`lastOperation`. Each item is the same HomebrewInstance with a reserved `initial_` ID;
individually addressed additions reject that namespace. General list/watch combines
both addresses, waits for both subscriptions before emitting and isolates recoverable
malformed records. Each item has exactly one address; no parent equipment/spell array
or individual duplicate is written.

`InstanceSnapshot` accepts an explicit DefinitionSnapshot or bundled snapshot
`{kind:"bundled",schema:1,sourceKey,dependencyPath,definition}`. `sources` stores each
originating DefinitionSnapshot once under its complete `sourceIdentity` key. The
bundle path is the exact key in that root's flat dependencies map. Decoder equality
binds the included definition to that map. It never reads a current character origin,
private child Library entry, offer or grant. A received root therefore retains acquired
private gear/spells after original offer revocation or later origin replacement.
Initial creation must compare this map and every selected item to its authenticated
selected source closure; a self-consistent raw map alone is not source authorization.

`stateIntent` for an initial item captures the whole group last loaded by list/watch,
requires its target to equal the supplied item, and freezes it as optional
`InstanceOperation.initialBase`. `baseRevision` and receipt revision refer to the group;
the changed item also advances its own revision. Commit CAS compares the exact whole
initialBase, source map and siblings included. It updates just the target state/revision
and lastOperation plus group revision/lastOperation, preserving all other bytes. One
P03 receipt records the exact operation. Direct owned LibraryVersion copies retain exact owned source updates at either address;
the grouped source-update operation also carries initialBase, preserves item state and
all siblings/sources, and reads the exact new owned immutable version. Catalogue/bundled
grouped copies support state edits but do not manufacture an owned version to update.
No source permission check or origin pointer is needed for a state-only operation.

The initial loadout uses180000 UTF8/4096 nodes; the full state operation (base, selected
item snapshot and next intent) uses600000 UTF8/4096 nodes. Explicit source verifier
injection authenticates catalogue claims on reads and state operations; absent verification
produces recoverable incompatible data. Existing individual byte shape and addresses
remain unchanged. Firestore initial creation/state predicates are owned by the P10
creation/rules integration; the model does not claim emulator acceptance by itself.
