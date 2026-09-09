# P02 new application identity and privacy

## Authority and intent

The current owner mandate is the complete request at
`~/Workspace/Codex/d20-folio-p02-new-evidence/OWNER-MANDATE.md`.
Astra's approved full-lab 0.9.3 is the experience reference:
owner receipt, passage 29, in `~/Workspace/Codex/d20-design-dialogue/full-lab/docs/REVIEW.md`.
The original freeze manifest remains historical; initial verification evidence and subsequent
documentary deltas are recorded in PROGRAM_STATUS and the external direction-reset manifest.
The preceding P02 candidate is diagnostic material. Its visual request is withdrawn.
Technical discretion and implementation are authorized; no further technical design approval
is needed. Actual new runtime screenshots still require the owner's pertinent verdict.

## Authorized shell/Account correction — 7 September 2026

The approved 0.9.3 mock plus `shell-review-20260907/DECISIONS.md` and r2 screenshots
supersede the rejected runtime chrome. Account has one stable desktop sidebar and phone
section selector: Profile, Preferences, Notifications, Privacy, Backups and recovery,
Offline data, Support. Preserve the reference fonts, palette, assets and icon placement.
Account is a global utility below the actual account name; four text-only product domains
remain in the header. Desktop search is visible; phone search is a magnifier; help is `?`.
Language toggles directly to the named destination EN/IT, with explicit accessible naming.
No motion/shortcut product switches; keep OS/browser reduced-motion and typing/dialog guards.

P02 search indexes only authorized loaded identities, memberships and real P02 destinations.
Help documents only implemented commands (search, help, Escape). No simulated services or
future game commands. Unimplemented Account services preserve their containing navigation
and explain availability without pretend controls. Privacy explains actual P02 access;
recovery exposes the already implemented original-copy recovery through owned characters.
P09 owns the full multi-domain shell/search. P23 owns reminders/notifications; P27b owns
full Account preferences/export/backups/recovery and P27c installed PWA/offline/support/legal
services. P02 exposes honest destinations and its existing original-copy recovery only.

Personal dice preference has one account field `diceMode`: `digital` or `physical`, absent
on existing schema-1 accounts means `digital`. Field-level writes preserve unrelated profile,
locale and preference changes. It is account-private, guarded by current identity authority;
no character/campaign migration is needed. P15 consumes this single preference and builds
shared animated 3D dice with authoritative results and physical entry. Persisting the choice
is not P15 implementation. Account locale uses the same narrow update seam. Existing cached
owner views work offline; unacknowledged writes never claim saved success.

URLs and browser Back/Forward identify P02 destinations, including all Account sections.
Navigation clears incompatible inspection/dialog/invite requests while preserving valid
roster filters and profile drafts. Auth remounts clear private transient data. No new routing
bridge or gameplay runtime is introduced. Account display names remain private under P02 ACL;
do not copy the mock's unsupported promise that companions see the profile name.

## New boundary

Build a new identity module, not extensions to legacy gameplay. Firebase Auth remains the
identity provider; explicit new `folioAccounts/{uid}` and `folioCampaigns/{id}` document
namespaces separate new V2 data from migration sources. Admin identity remains the existing
trusted users/{uid}.role authority; no client-created admin role. This is the same Firebase
trust/access model, not a new server or privacy policy. No runtime reads or writes legacy
combat/state or characterStore. Only the migration adapter reads supplied legacy copies.

An owned character has stable owner/id, display identity, revision, nullable currentAssignment
(campaignId, assignmentId, version), and an authorized immutable sheet read model. Assignment
history and personal narrative/import recovery are separate owner-private documents. Campaign
membership has one representation; reciprocal roster entries identify owner/id/assignment only,
never a competing assignment authority or personal-state snapshot. Two PCs of one owner may
join the same campaign. A character has zero or one current campaign. No silent first-PC choice.

Assignment changes run online transactions. Both client and rules validate target membership,
reciprocity and current owner revision at commit. A live foreign claim cannot be displaced.
Owner release works after revocation; recovery rereads the actual campaign at commit and cannot
interpret transport failure as revocation. Membership revocation changes campaign authority
without peer writes; obsolete owner claims are cleaned only by their owner. Histories do not
restore access. No deferred assignment operation is presented as successful while offline.

A single session generation fences auth, subscriptions, one-shot inspection, private assets and
unsent writes. Account/campaign/active-PC transitions synchronously clear incompatible view data
and cancel unsent work. Inflight writes may finish in their original authorized context; their
late acknowledgments cannot affect a new one. Inspection is an immutable, scoped read and never
changes active PC or command actor. No legacy editable store hydration. P03 owns command IDs,
retry/ack/outbox and encounter lease CAS; P02 does not claim those future capabilities.

Private notes and DM narrative use literal private ACL paths with authenticated byte consumers.
Unknown collections deny by default. Encounter raw faces/HP/token/fog retain accepted presenter
trust; not implemented in P02. Bearer URLs or already received bytes are not retrospectively
revoked. Import snapshots stay private and recoverable; shared sheet projections exclude
private narrative and unknown extension data. Roundtrip reconstructs all original data from the
private migration record, never discarding unknowns or source notes.

P04/P24 get an immutable addressed source/version offer and recipient-owned acceptance receipt;
revocation stops future access/acceptance, keeps legitimate copies, and never permits peer writes.
Full library materialization and eleven-family editing remain P04/P24 and their dependent blocks.

## Mock mapping and functional boundary

- Account (`account-tools.js`, screen-account-it-dark-1440): profile and current memberships,
  authenticated sign-in/out, locale, explicit invite entry; remaining account utilities P23/P27b/P27c as assigned above.
- Personal roster (`character-management.js`, screen-roster-it-dark-1440): portrait/identity,
  independent/per-campaign filtering, active selection and manage assignment. Creation wizard
  belongs to P10; imports here serve verified migration, not an invented generic wizard.
- Invitation (`account-tools.js`, screen-invite-it-dark-1440): read destination, join without PC
  or with one/more existing owned PCs, explicit confirmation/cancel and errors. Creation/premade
  and claim materialization remain P10/P04; no fake completed paths.
- Campaign roster: all reciprocal rows, distinct owner/id, own release and authorized DM revoke;
  selecting a row opens read-only authorized detail, not command control.
- Read-only sheet boundary: identity and migrated authorized definition are inspectable; full
  interactive sheet/growth/derived gameplay presenter remains P11a. No resource mutation in P02.
- Minimal containing frame uses approved dark full-lab typography, colors, spacing and identity.
  Full four-domain routing/search/return ecosystem remains P09. Do not route to old gameplay.

All actual controls bilingual EN/IT. Desktop 1440x900/1280x800, relevant phone 390x844.
Retain complete Italian names, portraits/fallback, visible focus, Escape/cancel/return and
clear offline/error/revocation states. The mock's future controls must not masquerade as runtime.

## Verification and exit

Behavioral red/green tests: multi-PC assignment, race/recovery, direct malformed/forged writes,
owner/member/DM/admin/anonymous get/list/write including wildcard/attachments, generation fences,
private byte revoke, source/version offers, six fixture-copy dry-run/idempotence/roundtrip/recovery.
Run just ci, pnpm test:rules with demo-d20folio, and just ci-srd-only, format/link/i18n.
Obtain actual independent technical and visual fidelity review on new code/images. Deliver
new runtime vs approved mock screenshots and concrete owner test instructions only after
all autonomous work is done. Keep P02 open through any missing exit; never start P03.
