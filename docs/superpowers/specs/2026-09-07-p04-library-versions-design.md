# P04 — Library and versions

## Mandate and scope

V2 is a new application; Astra owns technical decisions. Approved Astra mock 0.9.3 plus the
7 September shell/Account delta binds the experience, not legacy components or runtime.
Acquire transferable BG3 organization, interactions and feedback and useful Beyond/Roll20
capabilities under D&D 2024. The mock does not cap functional depth. Complete P04 only;
P05–08 own full family editors, P24 inventory transfer, P27 broader recovery. No legacy bridge,
production writes, deployment, cost, main push or implicit integration permission.

## Single library authority

One account-owned library entry contract covers weapon, equipment, spell, feature, monster,
campaignRule, species, feat, background, class and subclass. Custom content lives here.
An entry identifies an immutable definition version; versions retain source identity and
provenance. Definition fields are name, description, tags and a versioned authoring payload.
The payload is retained without interpreting prose or claiming engine support. Common codec
validates schema, family, JSON safety, limits and provenance. Incompatible input returns its
original serialized data and an error; never silently drops fields or repairs a version.
Family-specific semantic validation and import/export/print acceptance remain future editors.

The entry head and version are written atomically by an owner save with original base CAS
and a P03 operation receipt. Revision zero denotes a verified missing entry/new local draft;
loading is distinct from absence. An existing entry is never saved before it is loaded.
Each change creates an immutable version; historical versions remain inspectable. Copies
are independent entries with pinned source/version and grant receipt. Explicit comparison
and update create a new local version; source changes never mutate copies or instances.
An in-use instance references a pinned definition plus separate quantity/remaining charges/
prepared state. Definition updates preserve these instance fields and require explicit choice.

## Addressed grant

An owner creates an immutable addressed offer with an exact definition snapshot, source
reference/version and recipient UID. Recipients can discover addressed active offers, inspect
that snapshot and explicitly accept. Acceptance writes only their own entry/version and
immutable grant receipt, atomically with the P03 operation receipt. The deterministic grant
identity prevents duplicate materialization even with competing acceptance intents or a lost
response. No sender, campaign member, DM or admin accepts for another recipient.

Sender revocation changes only the sender's offer. Acceptance reads current offer authority
and rules inspect its post-commit state. Competing revoke/accept serializes: revocation first
prevents delivery; acceptance first preserves the copy and receipt. Revocation closes future
access; received bytes cannot be revoked. No recipient write to sender state. Sender-visible
acceptance status derives from a minimal grant receipt, never a peer-owned mutable flag.
P24 consumes this protocol and adds quantity/reservation/compensation; P04 does not claim it.

## Shared state, security and UI

Reuse P03 OperationController, stable intent identity, exact receipt matching and SessionController
invalidation. Extend the shared envelope/receipt transport for library saves, offer creation,
acceptance and revocation. No new outbox, polling or automatic reconnect replay. Local drafts
and verified owner snapshots are account-separated in sessionStorage; local data confers no ACL.
Autosave debounces an edit only while loaded, online and free of unresolved intent. Unknown
retains the same envelope and requires receipt reconciliation. Conflict preserves the draft and
shows current saved content; an explicit review permits a new intent. Auth/scope/revocation
fence callbacks and unsent writes including A→B→A; offline drafts remain recoverable.

Private library/version reads are owner/admin under existing blocked-account precedence.
Campaign membership and DM status grant no library ownership. Addressed offer reads expose
only offered content; unknown paths deny. Attachments use authenticated SDK access and exact
ACL paths; copying metadata must not retain a revoked sender asset dependency. No production
credentials; acceptance evidence uses explicit demo services and synthetic contents only.

The real library page joins the existing four-domain shell. Preserve reference typography,
palette, icons and placement. A family navigator, searchable entries, detail/edit common
metadata, version history/comparison and addressed sharing affordances implement P04.
Empty/loading/draft/pending/confirmed/conflict/recovery/revoked states are real. EN/IT dark
1440×900,1280×800,390×844; accessible focus, Escape and browser history. Complete functionality
before fine polish, without micro-aesthetic verdicts. Show actual runtime images before the
indispensable owner runtime/integration verdict; no approval recycled from P03.

## Acceptance

Red/green tests for eleven-family roundtrip/incompatible retention; loaded autosave; pinned
instance separation and explicit version updates. Real emulator clients prove owner/member/
DM/admin/anonymous get/list/write/wildcard/attachment ACL, receipt forgery rejection, competing
saves, revoke before/after acceptance, racing acceptance/revoke, duplicate intents, response
loss/reconciliation, scope invalidation and offline/reload recovery. Six private fixture COPIES
retain exact original recovery. Independent actual-diff and visual review; just ci; full rules
on owned demo cluster; ci-srd-only if public/private pack seam changes. Preserve failed attempts
and skipped scope honestly. PROGRAM_STATUS alone owns frontier, writers, gates and SHAs.
