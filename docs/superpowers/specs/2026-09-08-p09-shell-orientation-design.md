# P09 — Shell and orientation

## Approved direction and scope

Implement only P09 against Astra full-lab 0.9.3 and shell/Account r2, 7 September.
Owner 8 September standing delegation authorizes independent verification, actual image delivery
and reviewed green integration into v2 without repeated exhaustive owner visual consent.
The owner reviews detailed usability on the completed usable application. Never claim personal
owner inspection of every control. No deployment, production switch, real-data migration or cost.

V2 is a completely new application. Existing legacy runtime/router imposes no continuity;
no combat bridge or second runtime. Adopt all transferable BG3 behavior, organization and
feedback and useful Beyond/Roll20 capabilities, with D&D 2024 rules and the approved Astra
experience. The mock is not a ceiling on functional depth. Custom authoring feeds the same
extensible engine as official content; future engine/play blocks must demonstrate custom
costs/effects, authoritative in-use edits and causal undo (ordinary/boundary/composition),
separately from template changes. Preserved unsupported data/manual explicit consequences
cannot substitute for deterministic automation of modeled mechanics. P09 does not execute play.

Clear familiar controls, named subject/source/copy, explicit consequences and recoverable
errors apply across the app. Preserve depth through progressive disclosure, never hide capabilities.

## Ownership and chosen approach

Use one V2 navigation seam in src/features/identity/navigation.ts plus its React provider/hook.
The existing hash URL remains compatible; native History supplies Back/Forward. A small typed
route codec replaces the current duplicated page/history handling. This is preferable to wiring
the dormant legacy src/app/router.tsx, whose routes do not represent this application, or adding
an independent router to each workspace. No new package is required.

- Navigation owns route, safe URL parameters, per-history-entry provenance, query/selection/scroll
  and page focus. One declaration drives permanent domains, feature search and supported shortcuts.
- SessionController remains the sole auth/campaign/active-PC lifetime and authority invalidation
  seam. Route changes alone are not session changes. Navigation restoration cannot confer ACLs.
- IdentityApp owns authorized subscriptions and resolves route character/campaign references
  through the existing repositories. Inspection does not select an active PC or future actor.
- LibraryWorkspace consumes the same navigation seam for tabs/family/selected entry and removes
  folio-library-view as a second navigation store. LibraryDraftController remains sole owner of
  draft/base/envelope/unknown reconciliation. No draft is copied into navigation storage.
- FolioAccount remains sole owner of displayName, locale and digital/physical dice preference;
  existing watch/save seams are reused. No extra preference store or polling.
- IdentityWorkspace/IdentityAccount own layout and actions, identity.css existing r2 tokens,
  EN/IT identity strings own all new user-visible copy. The current mast styling is owned by DESIGN.md.

## Routes, context and return behavior

Permanent mast order follows actual approved r2 images: Campaign, At the table, Character,
Library. EXPERIENCE-MAP's domain table is taxonomy, not an instruction to reorder that mast.
The 8 September owner correction supersedes the original icon-plus-label interpretation:
retain the approved text-only r2 mast and its At the table LED, as recorded in DESIGN.md.
Account is global with seven stable sections and grouped desktop sidebar/phone selector.

Routes cover Account sections, own characters, invitation, selected campaign, Library creations,
sharing and bestiary, plus authorized character inspection and a Library entry. Hashes from P02
remain recognized. Unknown routes show a clear unavailable destination and a real recovery link,
not a silent success. Table and later blocks are clearly unavailable; no legacy route is exposed.

Allowlist URL fields: destination/tab/family, resource references and nonsensitive assignment
filter. Never serialize names, free-text queries, notes, invitation codes, draft content or ACLs.
Resource references are lookup requests, not grants. Invalid/deleted/revoked resources render an
explanation and a valid parent return. Browser history and explicit breadcrumb return preserve
originating list filters, query, selection and scroll within a valid session lifetime.
A detail opened directly has a declared parent fallback instead of depending on external history.

Transient frames are account/scope bound and invalidated on actual session transitions/revocation,
including A→B→A; old callbacks cannot restore a selection or send an action. Draft envelopes are
preserved/invalidate via P03, never auto-replayed. Returning through a picker does not edit a
source template, spend costs or select an actor. Existing modal pickers retain focus/scroll and
current form through close/cancel; route return does not create a second picker draft.

## Shell and accessibility

Visible desktop function search, phone magnifier; ? help; direct destination EN/IT button with
explicit accessible name. No animation or shortcut product toggle. Preserve reduced-motion
system preference, typing/IME/repeat/dialog guards. Go-to accelerators invoke the same destinations
as visible controls; omit unimplemented action shortcuts from active help.
Search groups functions by domain, supports EN/IT domain aliases, distinguishes current location,
requires context when appropriate, and gives an actionable empty result. Owned character and
membership results derive only from already-authorized data. No global private-data search.
Nearest primary/group active state remains visible on secondary pages. Breadcrumbs identify
current context; Back has a valid origin/root. Moving page focuses its main heading, modal
close returns focus to originating control. Stable Account sidebar/phone select does not remount.

Match r2 dark composition at 1440x900,1280x800,390x844: desktop mast, responsive two-row header,
44px touch targets, clear label hierarchy, no horizontal overflow. Account content/sidebar and
library/editor bodies retain approved design and full functionality. Paper unchanged unless a
necessary shell exclusion changes print, in which case actual PDFs require independent review.

## Acceptance and evidence

Ordinary: actual Google app/provider Auth Emulator sign-in; named campaign → roster → authorized
sheet → back; characters filter/query → inspection → return; Library family/query → class/subclass
entry → parent picker cancel/confirm → return; each Account section and persisted preferences.
Boundary: unknown/deleted/revoked deep link; direct reload; Back/Forward; no history fallback;
no search result; storage failure; offline draft/reconnect; pending/unknown/CAS exact receipt;
A→B→A and independent users. Composition: authoring draft + Account/language + browser return,
Library reuse to character/campaign with identity and source retained, no active actor switch.

Use a fresh optimized build and explicit local demo Firebase with independent authenticated users.
No DEV shortcuts, substitute backend or invented success. Verify final UI plus actual documents
and receipts. Retain failed/red and passing logs, scripts/fixtures, source/build hashes. Prior P08c
proofs do not certify changed P09 paths; unchanged source evidence may carry only via exact hashes
and explicit applicability. No emulator equivalence to production provider/indices/AppCheck/IAM,
HTTPS, physical device or installed-PWA lifecycle; record those separately gated gaps.

Independent spec/code and actual screenshot review are required. Deliver actual dark EN/IT
images at all three sizes for changed surfaces/states. Six fixture exact recovery if stored/model/
derived changes; SRD-only if catalog/adapter seam; full demo rules if authorization surface changes.
Fresh composed just ci at final integration source is mandatory. Rebase fresh origin/v2,
hooked explicit HEAD:v2, verify remote SHA, stop owned services and remove only clean owned
worktrees. PROGRAM_STATUS alone owns frontier/lease/gate/integration; external HANDOFF/manifests
own evidence. Only after closure emit one complete successor; do not execute P10.
