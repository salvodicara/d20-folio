# P05 character-owned homebrew instances

The new V2 boundary stores copies at
`folioAccounts/{ownerUid}/characters/{characterId}/homebrew/{instanceId}`.
Each copy has its own revision, the complete immutable owned `LibraryVersion` as
`snapshot`, and separate `state` (`quantity`, `remainingCharges`, `prepared`,
`equipped`, `attuned`). Snapshot includes original provenance; an authorized sheet
reader does not need access to the owner's private library. A template update is
explicit and retains state exactly, even when remaining charges exceed the new
capacity. Presentation reports such mismatch; persistence neither clamps nor refills.
Manual state edits preserve the snapshot and execute no mechanics.

`createInstanceRepository(db, session)` implements `InstanceRepository` from
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
