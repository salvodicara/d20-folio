# Architecture

The map of d20 Folio **v2** as the code on branch `v2` is today. Read it before changing a
boundary, persistence, Firebase or the shape of the encounter document. Every "how it works"
claim below names the file that makes it true; when the code and a spec or an ADR disagree, the
code is what this document records, and the disagreement is stated.

The diagrams are archify sources under [`diagrams/`](diagrams/) (golden rule 39): the `.json` is
the fact, the `.svg` a build product. Regeneration is [`diagrams/README.md`](diagrams/README.md).

## 1. Purpose and boundaries

d20 Folio v2 is a new application rebuilt from zero on the long-lived branch `v2`. `main` is the
production app the group still plays on; the two branches are never merged
([`../CLAUDE.md`](../CLAUDE.md) § Direction). Firebase projects are `d20-folio` (production,
alias `default`) and `d20-folio-staging` (alias `staging`), both declared in `.firebaserc`;
nothing on `v2` deploys to either without a per-change owner gate (golden rule 33).

This document owns **how the system is built**: layers, seams, the engine, persistence, the pack
seam, the gates. It does not own:

- **why** a structural decision was taken — [`adr/`](adr/), indexed in §12;
- **what is planned and in which order** — [`program/PROGRAM.md`](program/PROGRAM.md) (P01–P30,
  PD) and the frontier in [`PROGRAM_STATUS.md`](PROGRAM_STATUS.md);
- **product intent and rules** — [`../PRODUCT.md`](../PRODUCT.md),
  [`PRODUCT_CONSTITUTION.md`](PRODUCT_CONSTITUTION.md), [`GOLDEN_RULES.md`](GOLDEN_RULES.md);
- **stored shapes** — [`CHARACTER_SCHEMA.md`](CHARACTER_SCHEMA.md); **rules automation** —
  [`MECHANICS.md`](MECHANICS.md); **the visual contract** — [`../DESIGN.md`](../DESIGN.md);
  **where the program stands** — [`../PROGRESS.md`](../PROGRESS.md).

The v1 architecture document is history at [`archive/v1/ARCHITECTURE.md`](archive/v1/ARCHITECTURE.md).

## 2. Layers and dependency direction

![Client layers, the combat engine, the pack seam and the Firebase surfaces of d20 Folio v2](diagrams/system-architecture.svg)

_Source: [`diagrams/system-architecture.json`](diagrams/system-architecture.json) (archify
`architecture`); its `meta.repository.revision` pins every cited path._

Dependencies point **data/types/stores/lib → views → features/app/components/hooks**, never
backwards. Three guards hold the line, and each one resolves every import specifier (alias or
relative) so the direction cannot be spelled around:

| Guard                                             | What it pins                                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `tests/unit/architecture-direction.guard.test.ts` | `lib`/`stores`/`data`/`types` never import `features`/`app`/`components`/`hooks`, not even type-only      |
| the same file, R2                                 | engine core never imports `@/i18n`, `i18next` or `react-i18next`, and never imports `lib/views`           |
| `tests/unit/pure-modules-guard.test.ts`           | the pure modules stay free of React, Firebase and stores; `lib/views` is React-, store- and Firebase-free |

**The presenter seam.** `src/lib/views/**` is the only engine-side layer allowed to localize, and
even there the translator is a parameter: `src/lib/views/encounter-log-view.ts` and
`src/lib/views/roll-view.ts` take `t` as an argument and import no i18next. Nothing localized is
ever stored, so a language switch re-localizes the whole feed (golden rule 7).
`src/lib/pdf/**` is the export-side analogue of a view.

**The `Grant` seam.** A mechanic-bearing source declares typed `Grant`s (`src/lib/grant-schema.ts`,
`src/lib/grants.ts`); `aggregateCharacterGrants` (`src/lib/aggregate-character.ts`) folds them into
the character's effective stats, and the sheet reads the aggregate — never prose (golden rule 5).
The combat engine consumes the _result_ of that pipeline through a projection, not the pipeline
itself (§3).

**Where the app starts.** `src/main.tsx` renders `IdentityBoundary` → `IdentityApp`
(`src/features/identity/IdentityApp.tsx`). `src/App.tsx` and `src/app/router.tsx` — the v1
React-Router shell — are no longer reached from `main.tsx`; see §13.

## 3. The engine

![Intent, preflight, the dice seam, the append-only log, the fold and the read models](diagrams/encounter-dataflow.svg)

_Source: [`diagrams/encounter-dataflow.json`](diagrams/encounter-dataflow.json) (archify
`dataflow`)._

`src/lib/combat` is one pure, total reducer over an append-only log (ADR-0001, ADR-0002). It has
no clock, no randomness, no I/O and no locale; every union is closed and every switch ends in
`assertNever` (`src/lib/combat/ids.ts`).

- **The aggregate.** `Encounter = { schema: 1, id, host, log, checkpoint?, unknown? }`
  (`src/lib/combat/types.ts`). `host` is `{ kind: "personal", uid, characterId }` or
  `{ kind: "campaign", campaignId }` — solo and shared play share the model; only the host
  document differs.
- **The reducer.** `resolve(state, action, catalogue)` (`src/lib/combat/resolve.ts`) dispatches
  the eight action kinds — `intent`, `declare`, `override`, `resolve`, `check`, `roll`, `table`,
  `undo` — to `intent.ts`, `reposition.ts`, `override.ts`, `table.ts`. It returns
  `{ kind: "applied", state, receipt }` or `{ kind: "rejected", rejection }`; `Rejection` is a
  closed union of sixteen typed reasons, never a bare `null`.
- **The fold.** `fold(encounter, catalogue, start?)` (`src/lib/combat/fold.ts`) sorts the log by
  the hybrid logical clock (`Seq = { ms, counter, by }`, `src/lib/combat/ids.ts`), skips undone
  actions and their dependents, and replays the rest. Two clients holding the same actions fold
  to the same state and the same rejections whatever order they arrived in.
- **Undo is fold-level.** `resolve` returns `unknown-action` for an `undo` on purpose
  (`resolve.ts`); `undoneIds` in `fold.ts` is what makes an undo take effect, and an
  undo-of-undo restores the target.
- **The dice seam (ADR-0010).** `src/lib/dice.ts` is the only module in the app that draws
  randomness for a die; `tests/unit/dice-randomness.guard.test.ts` pins every other random source
  in `src/` as an id or a non-dice seed. An `app` roll draws one 32-bit seed and derives its faces
  with the pure `mulberry32` generator of `src/lib/combat/dice.ts`; a `manual` roll carries the
  faces a person read off physical dice and `seed: null`. Either way the roll enters the log as a
  `roll` action and `verifyRoll` re-checks faces and total on every client.
- **Rolls are spent once.** `state.spent` maps a roll id to the action that consumed it;
  `rollsUsable` in `resolve.ts` reads `spent` _before_ the record, so a roll settled before a
  checkpoint still reads as consumed after one.
- **The catalogue.** `buildCatalogue(values)` (`src/lib/combat/catalogue.ts`) conforms every
  mechanic once at load. `mechanicOf` resolves the definitions a seated entity **carried into the
  log** (`FoldedState.mechanics`) before the static catalogue, so the fold is identical on a client
  that never loaded the bestiary. The static catalogue in production is exactly
  `CORE_MECHANICS` — six `core:*` mechanics in `src/data/combat/core-catalogue.ts` — built once in
  `src/features/play/table/use-table.ts`.
- **Projections.** `src/lib/combat-projection.ts` turns a `CharacterDoc` into an `Entity` plus the
  mechanics it carries; `src/lib/combat/monster-adapter.ts` turns a `MonsterStatBlock` into
  `Mechanic`s. Both live outside `src/lib/combat`, and `tests/unit/combat/boundary.guard.test.ts`
  keeps the kernel from importing them.
- **Read models.** `src/lib/combat/map.ts` (`mapView`, movement budget, concealment),
  `src/lib/views/encounter-log-view.ts` (prose log), `src/features/play/InitiativeStrip.tsx`.
- **Compaction.** `src/lib/combat/checkpoint.ts`: `COMPACT_ACTIONS = 200`,
  `COMPACT_BYTES = 512 KiB`, `CHECKPOINT_GRACE_MS = 5 min`. A checkpoint declares the past closed,
  so undo cannot reach behind it and redo across it is impossible.

**Automation levels (ADR-0011) — what the code accepts today.** `Automation` declares three
members (`types.ts`), but `FoldedState.settings.automation` is
`Exclude<Automation, "propose-and-confirm">` (`types.ts`) and `applyTable`'s `settings` op rejects
`propose-and-confirm` explicitly at `src/lib/combat/table.ts:365` with
`"propose-and-confirm is not built until stage 6"`. `commitAt` (`src/lib/combat/intent.ts`) is the
one place the level decides anything: the verdict always runs and the receipt always reports it;
`full-auto` lands the applied state, `log-only` lands the bookkeeping state only. **ADR-0011
describes the target; two of its three levels exist in code.**

## 4. Shared play

![One attack with a reaction window across player, encounters/live and the DM](diagrams/intent-sequence.svg)

_Source: [`diagrams/intent-sequence.json`](diagrams/intent-sequence.json) (archify `sequence`)._

![The encounter clock: idle, gathering, turns, ended, with windows, correction and compaction](diagrams/encounter-lifecycle.svg)

_Source: [`diagrams/encounter-lifecycle.json`](diagrams/encounter-lifecycle.json) (archify
`lifecycle`)._

**One live table per campaign.** `campaigns/{campaignId}/encounters/live` — `LIVE_ENCOUNTER_ID` and
`liveTableRef` in `src/features/play/table/table-store.ts`; there is no pointer field and no
encounter list.

**The Firestore seam.** `src/lib/combat-io.ts` is the only module that knows the encounter lives
in a document. Five verbs: `createEncounter`, `appendAction`, `subscribeEncounter`,
`checkpointEncounter`, `deleteEncounter`. Two boundaries are load-bearing:

1. it imports `firebase/firestore` and never `@/lib/firebase`, so the same code runs unmocked in
   `tests/rules/encounter-io.emulator.test.ts`;
2. appending is `arrayUnion`, never a read-modify-write — two players appending in the same
   round-trip both land, and `Seq` (not arrival order) decides the fold.

Compaction is the one operation that rewrites the document, so it runs in a transaction with an
explicit compare-and-set on the stored checkpoint and returns `"stale"` rather than writing when
it cannot prove what it would discard.

**Who reads and writes.** `src/features/play/table/table-store.ts` is one store per mounted play
screen: it holds the newest snapshot, memoises the fold on the log's content fingerprint (a local
append arrives twice — pending, then acknowledged — with identical bytes), stamps `id`/`seq`/`by`
on every action, and attempts opportunistic compaction when the viewer's role is DM-capable.
`src/features/play/table/use-table.ts` is the only file below the surface that touches the app's
singletons (`db`, the wall clock, the seq clock). `src/features/play/table/dispatch.ts` builds a
tile's three pure steps — `planIntent` (running the reducer's own `preflightIntent`, so a refused
tile never spends a roll), `rollsFor`, `intentBody`.

**The lifecycle.** `Clock.phase` is `"idle" | "gathering" | "turns" | "ended"` (`types.ts`,
`initialState()` in `fold.ts`), and `applyTable` guards each transition: `start` only from `idle`
or `ended`, `begin-turns` only from `gathering`, `end-turn` only in `turns` with a current entity,
`end` unguarded (it clears `windows` and `declared`). There is no `paused` and no `closed` state.
Held states are reaction windows (`FoldedState.windows`, opened only when
`subscribersFor` — `src/lib/combat/windows.ts` — finds an entity that both subscribes to the event
and still has its reaction) and pending concentration checks (`FoldedState.checks`).

**The lease.** `src/lib/combat-lease.ts`: a PC joins by a `table:join` action appended by its
**owner's** client, which also writes `lease: { campaignId, encounterId, epoch }` on its own
character parent. While leased, the campaign encounter owns the PC's combat facts. On leave the
owner's client folds the encounter, writes back and clears the lease. Each verb is one
`writeBatch`, atomic and offline-queueable. Nobody ever writes a peer's documents.

**The personal seam, until P11b.** `personalEncounterRef` (`combat-io.ts`) points at
`users/{uid}/characters/{characterId}/combat/state`, which **today still holds a legacy
`CombatState`**, not an `Encounter`. `src/lib/combat-state-writeback.ts` projects the folded
entity's HP, temp HP, conditions and death saves over that document and preserves every other
field verbatim. Its header names its own fate: the module is deleted, not migrated, when the
personal aggregate becomes an `Encounter` (P11b in [`program/PROGRAM.md`](program/PROGRAM.md)).

## 5. Identity, roster, membership

**Two Firestore worlds coexist, and both are live.** `firestore.rules` matches the P02 tree
(`folioAccounts/{uid}`, `folioCampaigns/{id}`, `folioInvites/{id}`, `folioLibraryOffers/{id}`)
**and** the legacy tree (`users/{uid}`, `campaigns/{campId}`). Creation writes under
`folioAccounts` (`characterPath`, `src/lib/identity/model.ts`); the shared encounter and the
personal combat document still live under the legacy prefix (`combat-io.ts`). Neither is dead:
`users/{uid}` carries the profile, `role` and `status` that both rules files and the client admin
gate read, and `campaigns/{campId}` carries the membership the encounter rules resolve. Unifying
them is program work, not a documentation fix.

**The model** (`src/lib/identity/model.ts`) is parse-on-read with closed key sets that throw on an
unknown key: `FolioAccount` (`schema`, `displayName`, `locale`, `diceMode`), `FolioCharacter`
(with `currentAssignment: Assignment | null` and an `AuthorizedSheet` of `build` + `state`),
`FolioCampaign` (`dmUid`, `members`, `revision`, `archived`, `joinOpen`), `RosterEntry`.
`identityId` constrains every path segment to `^[A-Za-z0-9_-]{1,128}$`.

**Assignment is reciprocal.** A character's owner document holds the authoritative claim; the
campaign roster row `folioCampaigns/{id}/roster/{ownerUid}~{characterId}` (`rosterId`) must agree,
and `firestore.rules` enforces the agreement in both directions (`reciprocal`, `reciprocalRow`,
`oldClaimLive`). A member may write only its own roster row (`rowOwner`).

**Session scope.** `SessionController` (`src/lib/identity/session.ts`) is one epoch over auth,
selection, subscriptions, private bytes and unsent writes: `transition`/`revoke` bump a
generation, run every tracked cleanup, and `ticket()`/`guard()` make a write from a stale epoch
throw `stale-session` instead of landing.

**Repositories.** `src/lib/identity/repository.ts` (characters, campaigns, roster),
`src/lib/shared/repository.ts` (notes and assignment, over the `Envelope`/receipt contract in
`src/lib/shared/model.ts`), `src/lib/identity/assets.ts` (authenticated portrait bytes).
Rules coverage lives in `tests/rules/identity-boundary.test.ts` and
`tests/rules/shared-operations.test.ts`.

## 6. Library, homebrew, versions

**Eleven families, one schema.** `LIBRARY_FAMILIES` (`src/lib/library/model.ts`): `weapon`,
`equipment`, `spell`, `feature` (P05); `monster`, `campaign-rule` (P06); `species`, `feat`,
`background` (P07); `class`, `subclass` (P08a–c).

**Template and instance are different objects.** `LibraryEntry` (the draft plus `stableVersion`
and `provenance`) lives at `folioAccounts/{uid}/library/{id}`; each published version is an
immutable `LibraryVersion` at `…/library/{id}/versions/{version}` (`libraryPath`,
`src/lib/library/model.ts`). A character's own copy is a `LibraryInstance`
(`quantity`, `remainingCharges`, `prepared`) under
`folioAccounts/{uid}/characters/{characterId}/homebrew/{instanceId}` (`instancePath`,
`src/lib/homebrew/instances.ts`) — charges and preparation are instance-owned and never written
back into the template.

**Offer → materialise → revoke.** `src/lib/library/repository.ts`: `offerIntent` writes a
`LibraryOffer` (schema 2, carrying the definition by value) to `folioLibraryOffers/{id}`;
`acceptIntent` materialises a **recipient-owned copy** with `provenance` naming the source entry,
version, sender, offer and grant, and refuses a second acceptance by reading the `GrantReceipt`
first; `revokeIntent` flips `revoked` on the offer — the recipient's existing copy survives, only
future access is withdrawn. Every operation carries an `opId` and lands one receipt under
`folioAccounts/{uid}/receipts/{id}`, so a retry is idempotent.

**Authoring vocabulary.** `src/lib/homebrew/model.ts` and `src/lib/homebrew/conformance.ts` own
the typed schemas and diagnostics; `src/lib/homebrew/origins.ts`, `origin-build.ts`, `classes.ts`,
`preparation.ts`, `advanced.ts` own their families. The editors are `src/features/library/*`
(`LibraryWorkspace.tsx`, `LibraryEditor.tsx`, the per-family field sets) and contain no engine.
Family behaviour in play is [`MECHANICS.md`](MECHANICS.md).

## 7. Creation and import

![Creation and import through the five-document transaction to the read seams](diagrams/character-persistence.svg)

_Source: [`diagrams/character-persistence.json`](diagrams/character-persistence.json) (archify
`dataflow`)._

**The guided flow** is `src/lib/character-creation/`: `draft.ts` and `model.ts` (the retained
draft), `catalogue.ts` / `catalogue-pools.ts` / `catalogue-source.ts` (typed sources, verified by
snapshot), `abilities.ts`, `grant-adapter.ts`, `equipment-adapter.ts`, `root-adapter.ts`, and
`compose.ts` (the candidate). The surface is `src/features/creation/*`.

**One atomic write of five documents.** `commit()` in `src/lib/character-creation/repository.ts`
runs a single transaction (`maxAttempts: 1`) that, in order:

1. reads the receipt at `folioAccounts/{uid}/operations/{opId}` (`receiptPath`,
   `src/lib/shared/model.ts`) and returns it unchanged if the operation already landed —
   the idempotency guard;
2. reads `users/{uid}` and refuses a blocked account;
3. proves the four target paths do **not** exist (`stale-base` otherwise);
4. re-reads every `LibraryVersion` the candidate cites and throws `incompatible-source` when the
   stored bytes differ;
5. writes the character parent (`characterPath`), `…/origins/build`, `…/classes/build`,
   `initialLoadoutPath(...)` and the receipt.

A `fence()` runs before and after every await, so a session revocation mid-transaction aborts
instead of writing. `assertJsonBudget` (`src/lib/shared/json-budget.ts`) caps the operation at
600,000 bytes / 16,384 nodes.

**Import and reconciliation.** `src/lib/character-creation/import-review.ts` classifies an
incoming v3 document by category (origins, classes, abilities, equipment, spells, custom,
overrides, state, unrecognized) and separates the **rules edition** (2014 vs 2024) from the **file
format**, using `dryRunMigration` (`src/lib/identity/migration.ts`) whose explicit `Shape` grammar
admits only known members into an authorized sheet — no text scanning. The original is preserved
verbatim; review is acknowledged preservation, never a claim that mechanics were converted.
`src/lib/character-creation/import-repository.ts` commits it under the same receipt contract.

**Snapshots.** `users/{uid}/characters/{charId}/snapshots/{snapId}` (rules block at
`firestore.rules`), reconciled by `src/lib/character-snapshot-reconciler.ts`.

## 8. Shell and navigation

The mounted shell is `src/features/identity/IdentityApp.tsx` → `IdentityWorkspace.tsx`, with
navigation owned by `src/features/identity/navigation.ts` and bound through
`IdentityNavigation.tsx`.

**Four permanent scopes**, declared in order in `primaryDestinations` (`navigation.ts`):
`campaign`, `table`, `characters`, `library`. `table` carries `unavailable: true` — the live play
surface is not yet reachable from this shell; `IdentityWorkspace.tsx` renders a
`tableUnavailable` panel for it. Account sections (`accountSections`) are a separate group, and
`featureDestinations` feeds the function search.

**Routing is native history over a hash.** `parseRoute` / `routeHash` (`navigation.ts`) parse and
re-serialise `#<page>?<params>` through a whitelist, so an unknown page resolves to `unavailable`
and an unsafe id is dropped. `NavigationController` writes a `folioNavigation` record into
`window.history.state` (uid, lifetime, index, frame) and restores the query, scroll offset and
focus target per frame on `popstate`/`hashchange`; `parentRoute` gives every leaf a deterministic
return. Deep links, Back and Forward are therefore the browser's own, not a re-implementation.

## 9. Persistence, offline and rules

**Rules enforce access, never gameplay (ADR-0005).** `firestore.rules` decides who may read or
write which document and that a document has the declared shape and size; game legality is the
reducer's. The load-bearing block is the encounter:

- `read` — admin or campaign member; `create`/`delete` — admin or DM;
- `update` — admin or DM freely, a member only when `logOnlyGrew()` holds: the write touches
  `log` alone, the list is longer, **and the stored log is still a byte-identical prefix of the
  written one**. A size comparison alone would let a member silently rewrite history;
- `validEncounterShape()` caps the log at 1,000 entries, deliberately below the codec's 50,000
  JSON-node ceiling, because a document that quarantines on every client could never be compacted
  (`checkpointEncounter` refuses to rewrite a quarantined document).

`storage.rules` covers P02 assets (`folioAccounts/{uid}/characters/{id}/{private|portraits}/…`,
DM notes, offer artwork) and the legacy portrait, banner, map and bug-report paths. `isAdmin()` in
both files reads the same `users/{uid}.role` field the client gate reads, so the three gates
cannot drift. Emulator coverage: `tests/rules/*`.

**Codecs are closed-world and total.** `src/lib/combat/codec.ts` mirrors `mechanic.ts` field for
field; an unknown step kind, trigger or action kind **quarantines** the document rather than
being dropped, and top-level keys this build does not know are preserved verbatim under
`Encounter.unknown` (merged stored-value-wins during compaction). `src/lib/character-codec.ts` is
the v3 portable-character codec — the only supported format, no upgrade-on-read: every collection
is total, unknown keys are preserved in an `unknown` bucket on the character, the session and
every entry and written back last, so a round trip is byte-identical; a structurally malformed
element quarantines the whole document with a typed `{ code, path }`.

**`instanceId` is identity.** Every custom entry (`CustomSpell`, custom equipment, custom
features — `src/types/character.ts`) carries a stable `instanceId`; nothing is ever keyed by
display name (golden rule 7).

**Offline and listeners.** `subscribeEncounter` uses `includeMetadataChanges: true` so a local
append surfaces as `pending` and then acknowledged; consumers treat `pending` as presentation
state and skip re-folding. `appendAction` and the lease batches queue offline; the compaction
transaction does not (Firestore transactions need the server), which is exactly why compaction is
opportunistic. One listener per mounted screen, created while rendering and connected from an
effect so a StrictMode double-mount re-opens what its own cleanup closed (`use-table.ts`; golden
rule 35 makes listener behaviour a release bar). The PWA is
`VitePWA` in `vite.config.ts`: `registerType: "autoUpdate"`, Workbox precaching
`**/*.{js,css,html,ico,png,svg,webp,woff2}` with a 4 MiB per-file ceiling. Writes strip
`undefined` (`src/lib/strip-undefined.ts`, domain rule D1).

**Diagnostics (ADR-0008).** The encounter log is the forensic record of play; structured error
reports go to the top-level `diagnostics/{id}` collection (create-only for the writing uid, admin
read/delete) — `src/lib/diagnostics/`, `src/lib/diagnostics-io.ts`. No third-party sink.

## 10. Licensing partition and the pack seam

Public `src/data` and `src/i18n/*/srd` carry only SRD 5.2.1 content; everything else lives in the
private `content-pack/` (a gitignored symlink to the pack twin). The switch is one file,
`scripts/content-pack-mode.ts`: `@pack` resolves to `content-pack/index.ts` **iff** that file
exists **and** `VITE_CONTENT_PACK !== "0"`, otherwise to the typed-empty stub
`src/data/pack-empty.ts`. `vite.config.ts` and `vitest.config.ts` consume the same helpers, and
heavy catalogue data owns narrow sub-entries (`@pack/monsters`, `@pack/monster-art`,
`@pack/item-art`) so it never rides the eager `@pack` barrel.

Design against the full product; keep both compositions green when the seam is touched
(golden rule 28). `tests/unit/content-pack-partition.guard.test.ts` and the SRD-string guards
(`no-srd-strings-in-data`, `no-srd-name-literals`) hold the partition; the pack's own suites join
the same lanes and run only in pack mode (`vitest.config.ts`).

## 11. Gates and budgets

- **Pre-commit** (`.githooks/pre-commit`) is lean: a staged `.changeset/*.md` is mandatory, the
  graphify graph is refreshed when staged `src`/`tests`/`functions`/`scripts` code changed
  (never fatal, golden rule 38), then `lint-staged`. Never `--no-verify`.
- **`just ci`** = `typecheck` + `lint --max-warnings 0` + `test` (the `fast` node lane and the
  `slow` jsdom lane, split by `tests/lanes.ts`) + `test:functions` + `build`. It is the
  authoritative gate before an integration push to `v2`; the fifteen-minute ceiling is golden
  rule 14.
- **`just ci-srd-only`** = `typecheck:srd-only` + `test:srd-only` + `build:srd-only`, run when the
  licensing seam is touched.
- **`pnpm test:rules`** runs `tests/rules/*` against the Firestore and Storage emulators; every
  rules change ships emulator tests (golden rule 33).
- **Budgets.** `tests/unit/bundle-budget.guard.test.ts` reads the production build and pins the
  entry chunk, the whole eager static closure and the Workbox precache total, plus a ratchet on
  any new eager chunk. Raise a ceiling only with deliberate headroom, never to an exact-fit
  measured value, and update the constant and the recorded baseline in the same commit.

Suite composition, measured durations and what was deleted belong to
[`TEST_PORTFOLIO.md`](TEST_PORTFOLIO.md) (ADR-0007).

## 12. ADR index

Full text in [`adr/`](adr/); each line is the decision, not its reasoning.

| ADR                                                   | Decision                                                                                                 |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [0001](adr/0001-one-entity-generic-reducer.md)        | One pure entity-generic reducer over an `Encounter` aggregate; every creature is an `Entity`             |
| [0002](adr/0002-append-only-action-log.md)            | Clients never write state — they append `Action`s; every client folds the same log to the same state     |
| [0003](adr/0003-mechanics-kernel-not-adopted.md)      | The `mechanics-*` kernel is salvaged for ideas and tests, not adopted as the runtime                     |
| [0004](adr/0004-k1-and-wayfinder-disposition.md)      | K1 deleted and the Wayfinder S1 retired; the A1 topology direction is kept                               |
| [0005](adr/0005-rules-enforce-access-not-gameplay.md) | Firestore rules enforce identity, membership, ownership and shape; game legality is the reducer's        |
| [0006](adr/0006-one-mechanics-authoring-format.md)    | One versioned mechanics authoring format for SRD, pack and homebrew                                      |
| [0007](adr/0007-test-portfolio-reset.md)              | Golden replays, property tests and exhaustiveness replace a representation-pinning suite; no e2e on `v2` |
| [0008](adr/0008-diagnostics-zero-cost.md)             | The domain log plus in-house error reports in `diagnostics/{id}`; no third-party telemetry sink          |
| [0009](adr/0009-migrate-before-deploy.md)             | A persisted-shape change migrates live data in the same release, before the deploy that needs it         |
| [0010](adr/0010-dice-seam-rolls-are-log-actions.md)   | Rolls are log actions with provenance; randomness for dice lives only in `src/lib/dice.ts`               |
| [0011](adr/0011-campaign-automation-levels.md)        | Three campaign automation levels applied at the moment an outcome would be applied                       |

## 13. Legacy still present

V2 was rebuilt beside the v1 code rather than on top of it, so the following still ship in `src/`
and are scheduled to die with the surfaces that read them. None of it is a boundary to design
against.

- **The `mechanics-*` kernel** — `src/lib/mechanics-*.ts`, `src/lib/mechanic-occurrence*.ts` and
  their `src/types/mechanics-*.ts` companions (ADR-0003). It is **frozen**:
  `tests/unit/mechanics-kernel-freeze.guard.test.ts` pins the exact list of production modules
  that import it (37 entries, shrink-only), so a new reader is a deliberate decision rather than
  an accident. New combat work builds on `src/lib/combat`.
- **The v1 play surfaces that read it** — `src/features/character/center/tabs/PlayTab.tsx`,
  `EngineActionFlow.tsx`, the `spells/Engine*` strip, `useMechanicsCast.ts`,
  `src/features/campaigns/party-world-lease.ts` and the rest of the frozen list.
- **The v1 React-Router shell** — `src/App.tsx` and `src/app/router.tsx` with its `AppShell`,
  `routes/` and `shell/` tree. `src/main.tsx` mounts `IdentityApp` instead, so nothing in the
  running app reaches them; `tests/unit/route-coverage.guard.test.ts` and the e2e surface census
  still parse the router file.
- **The legacy combat modules of `src/lib`** — `combat-state*.ts`, `combat-resolution.ts`,
  `combat-outcomes.ts`, `combat-effects.ts`, `turn-economy.ts` and neighbours, which back the v1
  cockpit and the personal `combat/state` document (§4).
- **`tests/e2e/`** — ADR-0007's amendment records that the 60 old end-to-end specs were deleted on
  `v2`; what remains is the accessibility sweep (`a11y.spec.ts`, `a11y-hp-states.spec.ts`) and the
  surface census the route guard reads. No new e2e journeys are added on `v2`.

Each item's removal is owned by a block in [`program/PROGRAM.md`](program/PROGRAM.md), and each
removal deletes the tests that pinned its representation rather than porting them (ADR-0007).
