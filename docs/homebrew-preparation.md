# Campaign preparation and pinned rules

P06 reuses immutable `LibraryVersion` snapshots and the P03 operation envelope, session,
CAS and receipt protocol. It does not start combat or add a replay queue.

`folioCampaigns/{campaignId}/preparations/{preparationId}/monsters/{id}` stores a
`PreparedCopy` with schema 1, exact IDs, revision, full snapshot, separate monster state,
and lastOperation. Monster state contains kind, label (120 characters), nonnegative safe
integer currentHp/tempHp, up to 64 canonical condition tokens, and up to 32 resource
remaining values keyed by stable IDs. `defaultPreparedState` initializes HP from maxHp,
resource remaining from declared capacities, and zero temporary HP.

`folioCampaigns/{campaignId}/rules/{id}` stores the same copy contract with null
preparationId and `{kind: "campaign-rule", enabled: boolean}` state. A new rule defaults
to disabled. Activation is an explicit state operation. Selecting a template has no effect.
Members may read campaign rules; preparation reads require current DM/admin access.
Every mutation requires a current unblocked DM/admin and a nonarchived campaign.
Receipt reads recheck current campaign access, including when the requester owns the
receipt. An administrator's inspection does not grant another account's source consent.

`createPreparationRepository(db, session)` exposes list/watch/watchIssues, addIntent,
updateIntent, stateIntent, removeIntent, commit and reconcile. A monster requires an
explicit preparation ID; rules use null. Intent captures the exact complete loaded base,
campaign revision, destination, source and state. Its campaign must match the selected
session. Commit reads the receipt first for idempotency, then validates current user,
campaign, complete base, and actor-owned stable source before atomic target/receipt writes.
Source versions must already exist unchanged before the transaction. Accept a foreign
creator's offer into the actor's library before reuse, including for administrators.

Explicit version updates retain state exactly, including remaining values over new
capacities; no clamp, refill or template propagation occurs. They retain source entry and
owner identity. State operations retain the complete snapshot. Each clone has its own ID.
Removal deletes only the addressed copy. Its operation ID is `remove_` plus the copy's
last operation ID, allowing delete rules (which have no next document) to locate the exact
new removal receipt. Retries return the original receipt without deleting a later copy or
altering a later revision. Source versions and grants remain intact.

Every write has a live session ticket bound to its immutable operation. Scope ABA, auth
changes, explicit local lifetime checks, and offline state fence attempts and callbacks.
Transactions use one SDK attempt. There is no reconnect replay. Reconcile may read an exact
persisted envelope after reload, but does not create a write ticket. A missing receipt is
not permission to replay. UI consumers fence preparation selection/mount lifetime through
the existing operation controller and commit callback; preparation is not an Encounter lease.

Malformed stored copies are excluded from usable lists and exposed through watchIssues
with their path and serialized exact recovery original. They are never silently projected
or overwritten. Unknown template fields remain in immutable snapshots. P05 character
instance validation stays restricted to weapon/equipment/spell/feature.

Firestore couples every fresh receipt to exactly one destination and validates the complete
before/after transition. Bounded resource numeric checks are divided between the two
mandatory atomic writes to stay within Firestore's expression budget. Version updates
reuse the already validated exact base state rather than repeating every scalar check. Neither write can
stand alone or authorize a sibling. Canonical condition validation uses the same finite
vocabulary as authoring. Client codecs additionally validate resource identifier syntax;
rules protect bounded numeric shape and authority, while incompatible originals remain
recoverable through the reader.

The future custom-combat acceptance contract remains: custom and official definitions use
the same engine for costs, effects, reactions and consequences; in-use authoritative facts
remain editable with provenance and causal correction/undo. These preparation state edits
prove persistence only. They are not combat commands, engine execution, rolls, or undo.

Focused unit and real demo Firestore rules tests cover codec/family separation, exact
snapshots, state preservation, idempotency, deletion, member/admin privacy, revoked/blocked
access, forged sources, detached receipts, sibling writes, stale bases/campaign revisions,
maximum state bounds, malformed recovery, restored-envelope reconciliation and offline
non-replay. Production/provider/AppCheck/IAM/index/transaction-limit/device acceptance
remains a separately authorized release concern.

## Editor recovery and capacity comparison

The campaign view retains the loaded copy and campaign revision with each local state draft. A
refresh never replaces that base; changed remote state requires explicit review. Pending operations
are stored and read back before submission. Unknown outcomes after reload use the exact envelope
and receipt; acknowledgment removes only the matching sent draft. Incompatible local records are
archived with verified readback before a fresh draft is allowed. The current DM/admin can remove
copies from earlier source owners; only the source owner can read a newer private library version.

Version updates preserve current HP, temporary HP, conditions and resource amounts. The UI reports
HP above the new maximum, resource amounts above a new capacity and resource IDs no longer declared,
without clamping them. Resource identities share the authoring validator; defaults reject incompatible
resource rows instead of filtering them out. These are preparation facts, not Encounter execution.

Unit codec/intent tests mock the Firebase SDK; the demo rules suite independently exercises the real SDK and atomic storage boundary.
