# d20 Folio architecture

How today's code is put together, with the file that proves each claim. Product direction lives
in `docs/strategy/2026-10-16-product-brief.md`; the ADRs in `docs/adr/` and the 2026-11 notes in
`docs/architecture/` describe decisions and designs, and say themselves when they are a target
rather than today's code. Where this file and the code disagree, the code wins: fix this file.

## What the app is

d20 Folio is a digital character sheet and session companion for D&D 2024, used live by the
owner's two groups at the table or on Owlbear. It is a bilingual (EN/IT), offline-capable PWA on
React 19 + TypeScript + Vite 8 + Zustand 5 + Firebase (Auth, Firestore, Storage, Hosting, Cloud
Functions); it never rolls dice — players roll, the sheet computes, pays, logs and undoes.

### Two UIs, one engine

- **Today's sheet** (the default build): `src/features/**`, `src/components/**`, `src/hooks/**`,
  framed by `src/app/AppShell.tsx`. The character page is `CharacterCockpit`
  (`src/features/character/CharacterCockpit.tsx`), the campaign page `CampaignHubPage`.
- **The new UI** (preview, `VITE_NEW_UI=1`): `src/domains/<domain>/` (`play`, `roster`,
  `campaign`, `combat`, `chronicle`, `notes`, `treasury`) plus the design-system primitives in
  `src/ui/`, framed by `src/app/NewAppShell.tsx`. Each domain holds pure view-model files
  (`*-view.ts`) and a `ui/` folder of React screens.
- `src/app/router.tsx` swaps three routes when the flag is on: `/characters` → `RosterScreen`,
  `/characters/:characterId` → `PlayScreen`, `/campaigns/:campaignId` → `CampaignScreen`. The
  `/ui` stories page exists in dev and the preview only. Every other route is today's UI in both
  builds.
- Production ships whichever the owner picks at deploy time (`deploy.yml` input `new_ui`).
- The new UI reuses today's IO and hooks: `src/domains` imports `@/features` and `@/hooks`
  freely. Nothing outside `src/domains` imports it except the router.

## Layers and dependency direction

```
src/data      catalogue: ids + mechanics only (Grant lists, tables, numbers). No display text.
src/types     shared types (CharacterDoc, CombatState, CombatEvent, CampaignDoc, ...).
src/lib       the rules core and IO:
              grants.ts (evaluateGrants -> AggregatedGrants), rules/ (compileGrant, foldRules),
              activities/ (every active mechanic as one Activity shape), play/ (pure play
              transitions: sheet-events.ts, damage, rests, forms, concentration, ...),
              session-log/ (the campaign session log fold), views/ (presenters),
              mechanics-*.ts (the older kernel, see below), *-io.ts + firestore.ts (Firebase IO).
src/stores    Zustand: characterStore, combatStore, undoStore, saveStore, libraryStore,
              authStore, uiStore, toastStore, confirmStore.
src/i18n      en/ and it/ catalogues (ui/ + srd/), localizeSrd resolver, loaders.
src/platform  browser/Firebase adapters for the runtime pack and email-link sign-in.
UI            src/features, src/components, src/hooks, src/app  (today's sheet)
              src/domains, src/ui                                (the new UI)
```

Rules that are enforced (`tests/unit/architecture-direction.guard.test.ts`, which resolves every
import, alias or relative):

- `lib`, `stores`, `data`, `types` never import `features`, `app`, `components` or `hooks`.
- Engine core (`lib` except `lib/views` and `lib/pdf`, plus `stores`, `data`, `types`) never
  imports `@/i18n`, `i18next` or `react-i18next`. Localization is the presenters' job; toasts
  and log lines leave the engine as data (`src/types/toast.ts`, `src/types/combat-log.ts`).
- `lib/views/**` and `lib/pdf/**` are presenters: they may read the locale and `localizeSrd`,
  not React, stores or Firebase. `tests/unit/pure-modules-guard.test.ts` pins a listed set of
  pure modules (many `lib/views` files, `character-snapshot-reconciler.ts`, `libraryStore`).

Not enforced by a guard today: `src/domains`, `src/ui` and `src/platform` are not in the guard's
directory lists. In practice no engine file imports them. There is no ESLint boundaries plugin
(`eslint.config.js` holds only the i18n `defaultValue` ban and the TypeScript/React rule sets).

### The rules core in one paragraph

Catalogue entries declare passive effects as `grants: Grant[]` (`src/lib/grant-schema.ts`);
`evaluateGrants` (`src/lib/grants.ts`) walks a character's sources into `AggregatedGrants`;
families of Grant kinds migrate one at a time to the generic rule grammar in `src/lib/rules/`
(`foldRules` decides stacking; same-effect deduplication per
`docs/architecture/2026-11-effect-identity.md`). Active mechanics are read through
`src/lib/activities/` (translators from spells, actions, items, creatures). `src/lib/views/
derive-character.ts` turns a `CharacterDoc` into the computed sheet. The older `mechanics-*`
kernel (~23.5k lines in `src/lib/mechanics-*.ts`) is still wired in through `characterStore`,
`features/character/rest-world-boundary.ts`, `solo-world-turn.ts` and
`features/campaigns/party-world-lease.ts`; ADR-0003 rules it is not the destination.
`packages/folio-core/` publishes the same engine (SRD only) as `@d20-folio/core`, built by
`pnpm core:build`.

## Persistence

All Firebase access goes through `src/lib/firebase.ts` (App Check, Firestore with
`persistentLocalCache` + multi-tab manager, emulator wiring when `VITE_USE_EMULATORS=true`).
`VITE_DEV_BYPASS_AUTH` routes the same document contracts to a local replica
(`src/lib/dev-document-store.ts`) for dev and e2e.

### Documents actually used

| Path                                                          | Holds                                                                                                                                                                                                               | Writer (rules)                                                                                                                                    | Code                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `users/{uid}`                                                 | profile, `role`, `status`, `lastActiveAt`                                                                                                                                                                           | self creates; self updates only `lastActiveAt`; admin the rest                                                                                    | `src/lib/auth.ts`                                                     |
| `users/{uid}/characters/{charId}`                             | `{ schema: 3, build, state: {}, cache, revision, attachedCampaignId?, shared?, status, portrait… }`                                                                                                                 | owner; a campaign DM may only clear `attachedCampaignId` while removing the member                                                                | `src/lib/firestore.ts`                                                |
| `…/characters/{charId}/combat/state`                          | `CombatState`: HP, conditions, death saves, solo round/initiative, turn economy, active effects, and `playState` (every other mutable session fact)                                                                 | owner, campaign DM/admin, attached party members (peer effect updates)                                                                            | `src/lib/combat-state-io.ts`, `src/types/combat-state.ts`             |
| `…/characters/{charId}/combat/spends`                         | peer spends ledger (what an ally's hit used up on this sheet)                                                                                                                                                       | attached peers append; owner removes what it folded                                                                                               | `src/lib/peer-spends-io.ts` (writer behind `VITE_PEER_SPENDS_LEDGER`) |
| `…/characters/{charId}/public/sheet`                          | sanitized projection for share links (anonymous `get` only)                                                                                                                                                         | written atomically with the parent                                                                                                                | `src/lib/public-character-projection.ts`, `setCharacterSharing`       |
| `…/characters/{charId}/snapshots/{id}`                        | owner's saved versions                                                                                                                                                                                              | owner                                                                                                                                             | `saveCharacterSnapshot` in `src/lib/firestore.ts`                     |
| `…/characters/{charId}/privateNotes/{id}`                     | notes only the author sees                                                                                                                                                                                          | owner                                                                                                                                             | `src/lib/session-log/private-notes.ts`                                |
| `users/{uid}/library/index`                                   | homebrew library, ≤ 100 entries                                                                                                                                                                                     | owner                                                                                                                                             | `src/lib/library-io.ts`                                               |
| `campaigns/{campId}`                                          | roster (`members`, `memberDetails`, `dmUid`), `inviteCode`, `joinsLocked`, `tableRules`, `treasury` + `treasuryLog`, the live `encounter` (incl. `effectOps`), `encounterInit`, `encounterSkipped`, `nextSessionAt` | DM/admin freely; members within narrow diffs (own initiative row, own skip, start/join/end fight, effect ops, shared fields); self-join by invite | `src/features/campaigns/campaign-io.ts`, `src/types/campaign.ts`      |
| `campaigns/{id}/combat/ended`                                 | the last ended fight, so it can be reopened                                                                                                                                                                         | DM; a member only as half of an end/reopen transaction                                                                                            | `combat-lifecycle-io.ts`                                              |
| `campaigns/{id}/sessionLogs/{sessionId}` (+ `items/{itemId}`) | the session log                                                                                                                                                                                                     | members append one own item per write                                                                                                             | `src/lib/session-log-io.ts`                                           |
| `campaigns/{id}/chest`, `pickups`, `chestLog`                 | party chest stacks, items waiting for a sheet, who took what                                                                                                                                                        | any member, shape-checked                                                                                                                         | `chest-io.ts`, `chest-writes.ts`                                      |
| `campaigns/{id}/notes` / `dmNotes`                            | revealed notes / DM-hidden notes (reveal = move the doc)                                                                                                                                                            | members / DM only                                                                                                                                 | `campaign-io.ts`                                                      |
| `campaigns/{id}/chronicle/main`                               | the shared campaign chronicle text (transactional edits with version history)                                                                                                                                       | members                                                                                                                                           | `campaign-io.ts`, `chronicle-versions.ts`                             |
| `campaigns/{id}/sessions/{id}`                                | old per-session records, read-only fallback                                                                                                                                                                         | members                                                                                                                                           | `campaign-io.ts`                                                      |
| `campaigns/{id}/dmItems`, `itemReveals`                       | DM-only item state / what was revealed (M20)                                                                                                                                                                        | DM; members read reveals                                                                                                                          | rules only; no client code yet                                        |
| `bug_reports/{id}`                                            | player bug reports                                                                                                                                                                                                  | create by reporter; admin reads                                                                                                                   | `src/features/report/report-io.ts`                                    |
| `diagnostics/{id}`                                            | automatic error reports (ADR-0008)                                                                                                                                                                                  | create-only, bounded shape; admin reads                                                                                                           | `src/lib/diagnostics-io.ts`, `src/lib/diagnostics/`                   |
| `admin_audit/{id}`                                            | admin deletion audit                                                                                                                                                                                                | Functions only                                                                                                                                    | `functions/src/index.ts`                                              |

Storage (`storage.rules`): `users/{uid}/portraits/*`, `campaigns/{id}/banner.jpeg`,
`bug-reports/{uid}/*` (images only, size-capped) and `content-pack/**` (readable only with the
`pack` auth claim).

### Character codec and the revision compare-and-set

- One format for Firestore and export: `{ schema: 3, build, state, meta? }`
  (`src/lib/character-codec.ts`). `build` is id-based choices and overrides; everything a grant
  determines is dropped and re-derived. Only schema 3 is accepted. Unknown keys round-trip; a
  malformed element quarantines the document with a typed `CodecFailure` instead of being
  dropped. Contract: `docs/CHARACTER_SCHEMA.md`.
- On the stored parent `state` is always `{}` (rule `parentStateEmptyAfter`); the session lives
  in `combat/state.playState` (`src/lib/session-state-codec.ts`). The portable export still
  carries the compact `state`.
- `cache` is a small SRD-free roster summary (`src/lib/character-cache.ts`).
- `revision` is a compare-and-set generation: a write that changes `build`, `state` or `cache`
  must be exactly `revision + 1` (rule `revisionAdvancesWithBuild`). The debounced saver
  (`createDebouncedSave`, 2 s) allocates the revision at send time. A stale offline write is
  rejected on reconnect and surfaces as a save error.
- The parent and `combat/state` listeners are reconciled per domain
  (`src/lib/character-snapshot-reconciler.ts`): a pending local write keeps showing until the
  server acknowledges or rejects it.

### Play state and offline

- `combat/state` is written whole with `setDoc` (offline-queueable, last write wins for the
  owner/DM). A hit on another player's character goes through a transaction in
  `campaign-io.writeCampaignCombatEffect` (the target's own damage rule, `lib/play/
peer-damage.ts`; plus the `combat/spends` append when the ledger flag is on), so the acting
  device must be online; the target need not be.
- In a campaign fight a PC's initiative lives in `campaigns/{id}.encounterInit[uid]`, and the
  round on the shared `encounter`; solo, both live in `combat/state`.
- The DM's fight edits (`encounter-edit-log.ts`, `encounter-edit-sync.ts`) are pure reducers
  kept in a log, shown at once and sent in batches: each batch is a transaction replayed onto
  the server's newest fight, tried again while online when it fails, so another device's write
  is kept. After a send, a snapshot that differs from the write is checked by a read, never
  taken as is (it may be older, delivered late). Pinned by `encounter-edit-races.test.ts` and
  the seeded `encounter-edit-fuzz.test.ts`. **Known, bounded:** three paths still write the
  fight whole, last writer wins, so another device's change made meanwhile can be
  overwritten (never the DM's own edit): offline (queued, written on reconnect), closing or
  hiding the campaign page (the waiting edits are written at once so they survive the
  unload), and every transaction try failing while online (after about 7.5 s). Closing them
  needs a write that replays the edits on the server: a Cloud Function or a rules-validated
  edit queue the server applies, instead of the client's whole write.
- Offline: Firestore's persistent cache plus a Workbox service worker (`vite-plugin-pwa`,
  `vite.config.ts`) that precaches the app shell and catalogue chunks. Proven by
  `tests/e2e-offline/offline-it.spec.ts`.

## Play log, undo, session log

- **Events as data.** The character's own log is `LogEntry { event: CombatEvent, ts, id }`
  (`src/types/character.ts`, `src/types/combat-log.ts`), capped at 200 (`src/lib/play/log.ts`).
  Events hold ids and numbers, never translated text; `src/lib/views/combat-log-view.ts`
  localizes at render.
- **Sheet events.** `src/lib/play/sheet-events.ts` names each sheet transition and applies it
  purely (`applySheetEvent`); `characterStore.dispatch` runs them.
- **Play log in shadow.** `src/lib/play/play-log.ts` folds a checkpoint plus entries (event,
  undo, redo, correct) into a character. It runs in shadow mode only
  (`play-log-shadow.ts`, wired in `characterStore.ts`): it records and checks parity against the
  live character, changes nothing the player sees. Design: `docs/architecture/play-log.md`.
- **Undo.** `src/stores/undoStore.ts`: an in-memory per-character LIFO of reverse-applier
  closures (depth 50), shared by toasts, the topbar control and ⌘Z. It covers only the owner's
  own character and its `combat/state`; shared campaign documents never enter it. A reload
  clears it.
- **Campaign session log.** `campaigns/{id}/sessionLogs/{sessionId}` =
  `{ schema: 1, log: LogItem[], lastAt }`, appended with `arrayUnion` (works offline). Readers
  also accept one document per item under `items/` (phase 3b,
  `docs/architecture/session-log-per-event.md`); writers still append to the array.
  `src/lib/session-log/fold.ts` folds items, corrections and narrative overrides
  deterministically; `encounter-mirror.ts` mirrors the DM's live encounter (turns and Combat
  Chronicle beats) into it idempotently; `report.ts` builds the session report.

## The content-pack seam

- Public SRD 5.2.1 content lives in `src/data/**` and `src/i18n/{en,it}/srd/`. Everything else
  lives in the private `content-pack/` (a gitignored symlink to the separate
  `d20-folio-content` repo; `.gitignore`).
- Code reads private content only through `@pack` (and the lazy sub-entries `@pack/monsters`,
  `@pack/monster-art`, `@pack/item-art`, `@pack/icon-art`, `@pack/i18n-en-prose`). One function decides what the
  alias means, shared by Vite, both Vitest configs and the Node script loader
  (`scripts/content-pack-mode.ts` → `packAliases()`):
  - `content-pack/index.ts` present and `VITE_CONTENT_PACK` unset: the pack is bundled
    (composed build).
  - `VITE_CONTENT_PACK=0` or no `content-pack/`: `src/data/pack-empty.ts` (SRD-only).
  - `VITE_CONTENT_PACK=runtime` (+ `VITE_PACK_VERSION`): `src/data/pack-runtime.ts`. The
    bundle carries no private content; after sign-in an account with the `pack` auth claim
    downloads the versioned JSON from Storage `content-pack/<version>/`, cached for offline
    (`src/platform/pack-source.ts`, `pack-firebase.ts`). Others get the empty pack.
- Wire format and types: `src/data/pack-wire.ts`, `pack-types.ts`.
- Pack tooling (`scripts/pack/`): `emit-pack.ts` writes the runtime JSON, `upload-pack.ts`
  uploads it, `pack-access.ts` lists/grants the `pack` claim (dry run by default),
  `check-public-bundle.ts` fails if any long pack string or pack image appears in `dist/`.
- Guards: `tests/unit/content-pack-partition.guard.test.ts` (no Product-Identity terms in
  public i18n, `src/data` or docs; every `source:` in `src/data` is `"SRD"`), and
  `tsconfig.srd-only.json` / `pnpm typecheck:srd-only`. The steps for any change here are in the
  `srd-boundary` skill.

## Security

### Firestore rules

`firestore.rules` (~1,400 lines) gates by identity, membership and ownership:

- **Roles.** Owner = `request.auth.uid` matches the path uid. Member = uid in
  `campaigns/{id}.members`. DM = `campaigns/{id}.dmUid`. Admin = `users/{uid}.role == "admin"`,
  read with `get()`. Blocked = `users/{uid}.status == "blocked"` (`isNotBlocked()`). Anonymous
  readers reach only `public/sheet`.
- **Cross-user access is derived live** from the campaign doc via the character's
  `attachedCampaignId`; there are no stored reader lists.
- **Hidden things are path-gated** (`dmNotes`, `dmItems`): rules are not filters, so a hidden
  doc lives in a collection a member cannot list.
- **ADR-0005 is the direction, not yet the state.** It says rules enforce access and shape, not
  gameplay, and that nobody writes into another user's subtree. Today attached peers still
  write another player's `combat/state` (effect updates checked field by field) and append to
  `combat/spends`, and the campaign doc rules validate encounter and effect-op structure.
- Tests: `tests/rules/firestore-rules.test.ts`, `storage-rules.test.ts`.

### Auth claims and App Check

- `onUserRoleWritten` mirrors `role: "admin"` and `status: "blocked"` into Auth custom claims
  (`functions/src/role-claims.ts`; backfill `scripts/backfill-role-claims.ts`). Firestore and
  Storage rules still read the user doc with `get()`; the only claim the rules read today is
  `pack` (`storage.rules`).
- App Check: the client initializes reCAPTCHA Enterprise when `VITE_APPCHECK_SITE_KEY` is set
  (`src/lib/firebase.ts`), with a debug-token path for dev/CI. The deploy requires the key. The
  Functions do not set `enforceAppCheck`.

### Cloud Functions

`functions/src/index.ts` (2nd gen, Node 24, `europe-west1`). No gameplay code (ADR-0004). The
deploy checks the exported set with `scripts/functions-expected.mjs`, which reads it from the
built `functions/lib` (no hand-kept list).

| Function             | Trigger                                      | Job                                                                                |
| -------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `onBugReportCreated` | Firestore create `bug_reports/{id}`          | opens a privacy-stripped GitHub issue                                              |
| `ownerDigest`        | schedule, 08:00 Europe/Rome                  | one email to the owner: new sign-ups and error reports                             |
| `onUserRoleWritten`  | Firestore write `users/{uid}`                | syncs role/status claims                                                           |
| `deleteUser`         | callable                                     | account deletion (admin any other user, a player themself), audit in `admin_audit` |
| `onBudgetAlert`      | Pub/Sub `budget-kill`                        | detaches billing when actual cost passes the budget                                |
| `ogShell`            | HTTP, Hosting rewrite `/view/**`, `/join/**` | Open Graph meta for share and invite links                                         |
| `ogImage`            | HTTP, Hosting rewrite `/og/**`               | the link-preview image                                                             |

Secrets come from Secret Manager (`defineSecret`). Rewrites: `firebase.json`.

## CI/CD

- **`ci.yml`**, every PR and push to `main`, SRD-only (the runner has no `content-pack/`), in
  parallel jobs: Functions lint/test/build; typecheck + lint (`--max-warnings 0`); unit
  (`pnpm test`) plus the rules conformance count; build + SRD catalogue + `core:build` + bundle
  budget; design rules (`tests/e2e/ui-*` and `fight-smoke` on the `chromium` and `new-ui`
  Playwright projects); rules against the Firebase emulators (`pnpm test:rules`).
- **`verify.yml`**, every push to `main` (and on demand), composed: pins the content-pack commit
  and records it as the `verified-pack` artifact; typecheck, lint, unit with the pack suites,
  build, budget; the full Playwright run in 8 shards (merged HTML report only on failure); the
  offline e2e.
- **`deploy.yml`**, owner-dispatched only (`just deploy` dispatches it):
  1. waits for green CI and Verify on the exact SHA;
  2. deploys only the pack commit Verify composed (an explicit `pack_sha` must match it);
  3. builds with explicit flags (`VITE_PEER_SPENDS_LEDGER=true`, `VITE_COMBAT_EFFECTS_V26=true`,
     `VITE_NEW_UI` from the input, `VITE_CONTENT_PACK=runtime` when `runtime_pack` is set) and
     runs the bundle budget (and `check-public-bundle` for the runtime pack);
  4. runs the read-only migration checks (`scripts/migrate-*.ts --check`), requires live billing
     and takes a Firestore export to `gs://d20-folio-backups/`;
  5. deploys Functions with `--force` and checks every expected Function is active on Node 24;
  6. (runtime pack) Storage rules, then the pack upload;
  7. Firestore + Storage rules, then Hosting, so a client never meets rules that refuse it;
  8. checks the budget kill-switch is still armed (`scripts/safe-01.sh status`).
- **Release**: `just release` (owner-triggered, agent-run): `changeset version`, a curated
  `CHANGELOG.md` section, tag `v<version>`, GitHub release from `scripts/release-notes.mjs`.
  Every commit stages a `.changeset/*.md` (pre-commit hook). See `docs/RELEASE.md` and the
  `release` / `deploy` skills.
- Live-data changes are never part of CI: they follow the `live-data-migration` skill
  (ADR-0009).

## Tests

- **Unit** (`vitest.config.ts`): project `fast` (node, no DOM: `tests/unit/**/*.test.ts`,
  `src/**/*.test.ts`, the pack's fast tests), project `slow` (jsdom: every `.test.tsx` plus the
  `.test.ts` files listed in `tests/lanes.ts`), project `budget` (`bundle-budget.guard.test.ts`,
  run after a build). `pnpm test` runs fast + slow; `pnpm test:srd-only` forces
  `VITE_CONTENT_PACK=0`. The pack's own suites live in `content-pack/tests/unit/` and run only
  when the pack is composed.
- **Guards** (`tests/unit/*guard*.test.ts`): architecture direction, pure modules, i18n parity
  and dedup, no SRD strings in data, content-pack partition, bundle budget, and many UI/design
  guards.
- **Conformance suite**: one test per case of
  `docs/architecture/2026-11-edge-cases/corpus.md`, in `tests/unit/conformance/01-…17-*.test.ts`
  (SRD) and `content-pack/tests/unit/conformance/` (pack). `rule()` in
  `tests/unit/conformance/rule.ts`: `status: "works"` is a plain `it`; an `M<n>` family or
  `"data"` is `it.fails`, so the body asserts the rule and turns red when the mechanism lands,
  and that change flips the status. `conformance-cases.guard.test.ts` checks one test per case;
  `scripts/conformance-count.ts` prints "conformance N/total" in CI and fails if a `works` case
  breaks.
- **Rules emulator** (`vitest.rules.config.ts`, `tests/rules/`): the Firestore and Storage access
  matrices, plus emulator tests for the session log, the chest, combat lifecycle and contention,
  and the one-off scripts (`backfill-role-claims`, `migrate-character-parents`, …).
- **Functions**: `functions/src/*.test.ts` (`pnpm test:functions`).
- **E2E** (`playwright.config.ts`, `tests/e2e/`, about 130 specs): projects `chromium` (the
  default), `mobile` (Pixel 7, a listed subset), `new-ui` (`VITE_NEW_UI` server on its own port:
  `ui-play-fidelity`, `fight-smoke`), `portrait-sw` and `portrait-sw-mobile` (real service
  worker). Separate configs: `playwright.offline.config.ts` (`tests/e2e-offline`),
  `playwright.pack.config.ts` (`tests/e2e-pack`, the runtime pack; `just e2e-pack`),
  `playwright.visual.config.ts` (`tests/visual`, curated screenshots and motion).

## i18n

- Every user-visible string ships in EN and IT: `src/i18n/{en,it}/ui/` and `…/srd/`. Code stores
  ids and renders labels.
- `localizeSrd` (`src/i18n/resolver.ts`) and i18next's `missingKeyHandler`
  (`src/i18n/index.ts`) throw in dev/test; production falls back to English.
- ESLint bans `t()` defaults (`eslint.config.js`). `i18n-parity.test.ts` checks key parity and
  English left in IT.
- The build fails on any leak (`i18nLeakLock` in `vite.config.ts`, same detectors as the tests,
  `scripts/i18n/`).

## Where new code goes

- A catalogue fact: `src/data` (ids + mechanics) plus its text in both `src/i18n/*/srd/`;
  private content in `content-pack/` through `@pack`.
- A rule or play transition: `src/lib` (pure; `lib/play/` for play, `lib/rules/` for passive
  rules), tested in `tests/unit`, with a conformance case if it is in the corpus.
- A view model: `src/lib/views/` (today's UI) or `src/domains/<domain>/*-view.ts` (new UI).
- A screen: `src/domains/<domain>/ui/` for the new UI; today's sheet only for fixes.
- A new stored shape: rules change + rules test + the `live-data-migration` skill before the
  deploy that reads it.
