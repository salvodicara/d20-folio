# New app — stage 1 program plan (2026-09-03)

Owner: the steering in `PRODUCT.md` §Steering. This plan turns the first milestone — one whole
session of the group inside the app — into ordered stages on the long-lived branch `v2`. Each
stage gets its own written plan (superpowers writing-plans) when it starts; this document fixes
the order, the gates and what is out.

## Ground rules for `v2`

- `main` = production. Fixes only, released by the owner as today. `v2` never merges into `main`
  until the milestone is reached; `main` fixes are cherry-picked into `v2` when relevant.
- Every `v2` change is owner-approved visually when it changes a screen (golden rule 25) and goes
  through `just ci`; the pack twin (`content-pack/`) moves in the same motion (rule 28).
- Staging is mandatory before anyone plays on `v2`: a separate Firebase project on the free tier
  (owner creates it in the console: Firestore, Auth with Google, Storage, Hosting), the six team
  fixtures seeded anonymised, emulators in CI, the £1 kill-switch armed. `v2` never touches the
  production project.
- The four acceptance stories in the steering are the scope test; golden replays of stories 1 and
  2 are the engine's acceptance tests.
- **The test portfolio and CI are rebuilt with the new app (owner, 2026-09-03, repeated).** The
  62 end-to-end specs of the old app are not carried over and `v2` adds none of them: the old
  suites cost almost an hour per run and that is not acceptable. `v2` keeps the unit and rules
  tests that guard live data, the golden replays of the four acceptance stories, one
  accessibility sweep, and the screenshot suite that serves the visual gate — nothing else in
  the gate. Target for the `v2` gate: under 15 minutes end to end. The old end-to-end suites
  were deleted on `v2` on 2026-09-03 (architecture reset); the accessibility sweep and the
  screenshot lane are the only browser suites, rebuilt screen by screen from stage 6.
- **No dead weight (owner, 2026-09-03).** Everything on `v2` has a reason and a named fate
  (see "Module fates" below): keep, rebuild in stage N, or delete now when nothing reads it.
  Dead code dies when it is dead, never "at stage 7".

## Staging setup (once, before stage 0 is played)

1. Owner creates the Firebase project `d20-folio-staging` (Spark plan): Firestore, Authentication
   with Google, Storage, Hosting; a budget alert at £1 like production. The alias is already in
   `.firebaserc` (`firebase use staging`).
2. Agent adds `.env.staging.local` (untracked) with the staging `VITE_FIREBASE_*` values, deploys
   rules and indexes with `firebase deploy --only firestore,storage -P staging` on the owner's word,
   and seeds the six team fixtures anonymised through the existing import path.
3. Hosting deploys to staging are owner-triggered like production (`-P staging`); `v2` CI runs on
   the emulators and never needs credentials.

### Staging status (2026-09-03, done by the agent with the owner's CLI login)

- Project `d20-folio-staging` created (Spark), web app registered, `.env.staging.local` written
  (gitignored; run the app against staging with `pnpm dev --mode staging`).
- Firestore database created in `europe-west1` (same as production); rules and indexes deployed.
- Pending: Authentication "Get started" + Google provider (console-only; needs a browser signed in
  as the owner — the Claude in Chrome extension, or two clicks by the owner). Needed only when
  people sign in on staging (stage 5–6); emulator tests do not need it.
- Caveat to verify at stage 5: Firebase Storage default buckets on projects created after
  October 2024 require the Blaze plan (still free within quota, but a billing account must be
  linked). Production is on Blaze already; staging will need the owner's yes before linking.

## Stages, in order

U. **UI/UX agreement (blocking, before any product code).** The owner must see and approve, from
images, how the whole new app will look and behave for the milestone: Campagna (home, session
card, calendar, notes and recap, chronicle, party, DM preparation), Personaggio (Panoramica ·
Incantesimi · Inventario · Privilegi · Progressione, printable sheet, item transfer), Gioca
(desktop player, desktop DM, phone second screen, dice tray and shared roll, map tools, DM
drawer), Compendio (list, entry, explain-on-demand), Costruttore (creation, level-up),
onboarding and login, settings, share view. Method: one screen at a time, dossier with real
reference screens of the leading products (BG3, D&D Beyond, Owlbear, Foundry, Roll20, Kanka…)
beside our rendition, the licensed icon sprite, the approved v8 visual system; verdict "va
bene / cosa stona" per screen; a screen map (flows between screens) approved last. Output:
the design spec updated with every approved screen and a visual bible board.
**Status (2026-09-03): closed.** Delivered and approved in direction by the owner — 80 screens, the screen map and
dossiers 16–21 reviewed by the owner («più o meno ci siamo»), corrections applied (spec §8e–8f,
rules 39–44, §10 parity ledgers); small remaining dislikes are corrected on the implemented screens behind the screenshot
gate; the next session opens stage 0. Design artifacts and reference captures stay outside the repository
(`~/.agents/state/d20-folio/design-2026-09/`). 0. **Safety gate (blocking).** Migration P1 items 1–3 from
`docs/superpowers/plans/2026-09-02-combat-p1-data-safety.md`: closed-world codec with unknown-key
preservation, `instanceId` on custom equipment/spells/features, per-domain sync so conflicts
surface. Dry-run against the six fixtures and a production export. Nothing else ships before.
**Status (2026-09-03): closed on `v2`.** `main` `9b06b75` (P1 items 1–6 integrated) merged into
`v2` at `5d1e640`; the dry-run tool is `scripts/audit-codec-loss.ts` (read-only, ADR-0009): six
team fixtures 6/6 byte-identical; a fresh production export of 53 documents (12 parents, 26
snapshots, 12 combat states, 3 libraries) — zero loss, zero quarantine; 25 documents conformed on
documented read seams only (`CODEC_READ_SEAMS`, `SHED_COMBAT_STATE_KEYS`), all frozen snapshots
carrying pre-migration shapes or obsolete residue. Plan and receipt:
`docs/superpowers/plans/2026-09-03-stage-0-data-safety-gate.md`, `docs/PROGRAM_STATUS.md`.

1. **Dice seam.** `roll(formula, {by, reason, hidden, mode})` persisted as a log action with
   faces, total, seed, roller, source (`app | manual`); three inputs (in-app, manual entry, hidden
   DM). Numbers and a log line first; the shared 3D animation is a later stage. Opened on
   2026-09-03 with the architecture reset
   (`2026-09-03-v2-architecture-reset.md`, done) and the seam plan
   (`2026-09-03-v2-stage-1-dice-seam.md`; ADR-0010).
2. **Positions and areas in the aggregate.** `position` on entities, `area` in the mechanic
   vocabulary (sphere, cone, line, cube, cylinder); reach, range band, area membership and
   "who left reach" derived with provenance `derived`, declared facts as the fallback.
3. **Reducer for the two story encounters.** From `src/lib/combat`: move, weapon attack,
   cantrip and levelled area save spell, monster multiattack via an adapter over the typed stat
   blocks, conditions, concentration, damage and 0 HP, opportunity-attack window, `override`,
   `undo`, the three campaign automation levels (ADR-0011). Vocabulary and hard cases: exactly
   the stage-3 tier of the target spec (§4, §7) and of the authoring spec (§6); a `later` kind
   conforms as `unsupported`, never half-built. Golden replays for Marco's turn and Sara's ambush.
4. **Shared encounter document.** `campaigns/{id}/encounters/{eid}` append-only log, one
   listener per client, rules reduced to identity, membership, ownership and shape for that
   collection.
5. **Minimum map.** Background upload (compressed, per-campaign quota), square grid with scale,
   tokens bound to entity ids, drag with a Foundry-style ruler, rectangle fog, hidden tokens.
   No scenes, layers, drawing, pointer, walls, vision or lighting yet.
6. **One play surface.** Dossier 14 as approved in direction: initiative strip, map, hotbar of
   the selected entity, log with undo, DM drawer with hidden/fog/HP editor. Old `PlayTab`,
   `CombatResolver`, `TurnEconomyProvider` stay unreferenced until the surface works, then die.
7. **Cuts.** What still reads something at stage 6 dies here: the mechanics kernel and its 47
   test files, the old play surfaces and their render tests, `cost-engine`, `dice-formula` /
   `integer-expression` / `d20-test`, the dev scaffolding routes, `POSITIONING.md`, the atlas
   authority — once nothing reads them (rule 10). Done on 2026-09-03 already: K1, the program
   supervisor, the old end-to-end suites, the P1/P3 migration scripts, the superseded plans.
   Salvage typed data and coverage knowledge.
8. **The rest of the session.** Character screen in the BG3 grammar (dossier 15), campaign home
   with session card and calendar, notes and recap, chronicle from the log, loot and gold,
   handouts, typed homebrew forms, 3D dice, compendium explain-on-demand, phone second screen.
   Ordered by the jobs table in `PRODUCT.md` once the community research lands.

## Module fates (architecture reset, 2026-09-03)

Evidence: the reverse import graph and document inventory recorded in
`2026-09-03-v2-architecture-reset.md`. A fate is named for every module the merge carried onto
`v2`; "delete now" means nothing read it.

| Module                                                                                                  | Fate                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/combat/**`, `src/data/combat/prototype-catalogue.ts`                                           | **keep** — base of the dice seam (stage 1) and of the story reducer (stage 3); the prototype catalogue is the test catalogue until stage 3                     |
| `src/lib/combat-io.ts`                                                                                  | deleted 2026-09-03 (no reader); stage 4 writes the append/subscribe/checkpoint adapter                                                                         |
| mechanics kernel (`mechanics-*`, `mechanic-occurrence*`, 31 files)                                      | **dies at stage 6** with the old play surfaces that read it; frozen by `mechanics-kernel-freeze.guard` (37 readers); `mechanics-trigger.ts` deleted 2026-09-03 |
| K1 `src/lib/command/**`, Functions bundle, orphan types                                                 | deleted 2026-09-03                                                                                                                                             |
| program supervisor (`state`/`runtime`/`cli`), operating model, its plans                                | deleted 2026-09-03; the worktree helpers live in `scripts/worktree/`                                                                                           |
| P1/P3 migration scripts, `parseLegacyCombatChild`, `applyLegacyCombatToSession`                         | deleted 2026-09-03 on `v2` (they run from `main`); `mergeCombatTrio` stays as the live trio merge                                                              |
| older one-off scripts (`migrate-shared-notes`, `backfill-*`, `drop-playerhandle`)                       | keep until `main` proves them spent, then deleted on `main` and cherry-picked                                                                                  |
| `scripts/lib/migration-kit.ts`                                                                          | keep — read by `audit-codec-loss`; the apply path is re-proven by the emulator test of `v2`'s first release migration                                          |
| `dice-formula`, `integer-expression`, `d20-test`                                                        | replaced by the dice seam (stage 1); die at stage 6 with their readers                                                                                         |
| `automation-corpus`, `automation-compiler`, `docs/AUTOMATION_COVERAGE.md`                               | replaced at stage 3 by the derived coverage (spec §10); the knowledge they guard is salvaged as typed data                                                     |
| `cost-engine.ts`                                                                                        | dies at stage 6 with the kernel; `CostSpec` stays as data                                                                                                      |
| old end-to-end specs                                                                                    | deleted 2026-09-03; the a11y sweep and `tests/visual` stay and are rebuilt from stage 6                                                                        |
| Wayfinder/K1/supervisor/P2-prototype plans and status records, Phase-2 handoff, `AUTOMATION_HANDOFF.md` | deleted 2026-09-03 (git history is the history role)                                                                                                           |
| migration program (`2026-09-02-total-combat-automation-migration.md`)                                   | kept as history; P2–P5 marked superseded                                                                                                                       |

## Gates

- Stage 0 done = fixtures round-trip byte-identical and a production export dry-run reports zero
  drops.
- Stages 1–4 done = both golden replays pass on the emulator with two clients (DM and player)
  folding the same log; an override and an undo from each side.
- Stage 5–6 done = the group plays one combat on staging without Owlbear; owner screenshots
  approved.
- Milestone = one whole session on staging; then release planning (`docs/RELEASE.md`).

## Out of stage 1

Sheet redesign, level-up rebuild, journal, scheduling, typed homebrew UI, 3D dice animation,
table-play shared display, the name decision.
