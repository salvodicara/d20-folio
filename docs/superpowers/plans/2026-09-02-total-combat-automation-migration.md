# Total combat automation — migration program

> **Superseded on 2026-09-03 (P2–P5).** The steering (`PRODUCT.md` §Steering, golden rule 31)
> replaced this phase program with the stages of
> [`2026-09-03-new-app-stage-1.md`](2026-09-03-new-app-stage-1.md) on the long-lived branch
> `v2`. P0 and P1 are history: P1 was integrated on `main` at `7b95f24` (docs to `9b06b75`),
> its two migrations were applied to production on 2026-09-03 and its deploy is owned by
> `main`. P2–P5 are superseded as noted under each heading; what survived was folded into
> stages 1–4 and 7. Nothing below is an instruction any more.

> **For agentic workers:** this is the phase-level program. Each phase is executed from its own
> bite-sized plan written with `superpowers:writing-plans` at phase start (Phase 2's prototype
> plan is [2026-09-02-p2-prototype-vertical.md](2026-09-02-p2-prototype-vertical.md)). Every phase
> runs in a fresh worktree from `origin/main`, lands green through `just ci` (and `just ci-srd-only`
> when the pack seam moves, `pnpm test:rules` when rules move), and ends with its deletion list
> executed. No phase leaves a compatibility layer alive past its exit gate.

**Goal:** replace three combat executors, a single-character state model and a semantic rules engine
with one entity-generic reducer over an event-sourced Encounter aggregate, without ever putting a
stored character at risk or breaking the deployed table.

**Spec:** [target architecture](../specs/2026-09-02-total-combat-automation-design.md) ·
[authoring spec](../specs/2026-09-02-mechanics-authoring-spec.md) · ADR-0001…0009 ·
[audit](../status/2026-09-02-combat-automation-audit.md).

## Global constraints

- No RNG, no LLM, no geometry, no visual change without the screenshot gate (golden rule 25).
- Every persisted-shape change ships with snapshot → dry-run → idempotent apply → verify against
  the six team fixtures **and** a production export, in the release that needs it (ADR-0009).
- No compatibility layer outlives its phase; every migration input has its death named here.
- Owner gates: deploy and live apply are owner-triggered per change; integration to `main` is not.
- One worktree per phase; Codex is blocked (owner, 2026-09-02); Conventional Commits, owner sole
  author, a `.changeset/*.md` per commit, the owning document reconciled in the same commit.
- Tests follow ADR-0007: replays, properties, exhaustiveness, few rules/e2e; representation tests
  die with their representations.

## Phase map

| Phase | Outcome                                                                                              | Production risk            | Owner gate                                                            |
| ----- | ---------------------------------------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------- |
| P0    | audit, specs, ADRs, this plan, prototype, doc reconciliation                                         | none (pure module + docs)  | read and approve                                                      |
| P1    | data safety: total codec, ids, per-domain sync, legacy cutover, diagnostics                          | every character read/write | live migration run                                                    |
| P2    | engine core: full vocabulary, monster adapter, coverage generator, all replays; dead kernels deleted | none                       | **superseded** → stages 1, 3 (bounded tier); cuts done 2026-09-03     |
| P3    | solo cutover, family by family, legacy branches deleted                                              | every solo play write      | **superseded** → stages 3, 6 (one play surface replaces the families) |
| P4    | shared cutover: encounter documents, slim campaign, rules rewrite, executable monsters               | campaigns and encounters   | **superseded** → stage 4                                              |
| P5    | deletion of `mechanics-*`, `session.world`, legacy executors; docs folded; test count target         | none                       | **superseded** → stages 6–7 (partly done 2026-09-03)                  |
| UI    | one-tap surfaces (separate round, screenshot-gated)                                                  | visual                     | screenshot approval                                                   |

## P0 — this round

**Exit gate:** documents above committed; prototype green under `just ci` and `pnpm test:rules`;
`docs/PROGRAM_STATUS.md` records the direction change; owner has the handoff prompt.
**Deletions:** dead branches (done 2026-09-02).

## P1 — Data safety (before any engine change)

Why first: Incident 2's class and the 2026-08-31 outage live here, independent of the engine.

**Execution (integration A + B, 2026-09-02/03).** 1 → the codec round in the P1 worktree; 2 →
`664200b`, `cc8cca4`, `2ce550c`; 2 (scripts) → `e9109ff`, `dd6b655`; 3 → `f1b4d6c`, `50c7296`;
4 (script) → `e38c577`, `43e212e`, `d8161e1`; 4 + 6 (code + rules cutover) → this commit; 5 →
the diagnostics round. The live migrations are PREPARED, not run: the owner runs them before the
deploy that needs them.

1. **Total codec.** `character-codec.ts`: `parseEquipment`/`parseCustomEquipment` and every sibling
   parser become closed-world exact-schema parsers that (a) preserve unknown keys in an `unknown`
   bucket written back verbatim, (b) quarantine with a typed path on structural failure, (c) never
   `continue` past an entry. Property test: `parse(serialize(doc)) ≡ doc` over generated documents
   with unknown keys and hostile shapes.
2. **Identity.** `instanceId` on every `CustomEquipment`, `CustomWeapon`, custom spell/feature and
   library entry. Migration script `scripts/migrate-custom-identity.ts` (read-only default,
   `--apply --backup`), run under the protocol; `inventory-view` keys by id; name-keyed identity
   deleted.
3. **Per-domain sync.** Re-author Codex's `character-snapshot-reconciler.ts` (design: dirty domain
   keeps local until acknowledged; conflict surfaces `SaveStatus="error"`); `subscribeToCharacter`
   and `subscribeCombatState` pass `hasPendingWrites`; `createDebouncedSave` reports resolve/reject.
   The parent write gains a precondition on `revision` (rules compare-and-set; a
   transaction does NOT work offline, and an offline-queued write is exactly the case that
   must be rejected on reconnect rather than clobber) and surfaces conflicts instead of
   clobbering. Replays: the two reported losses (custom item, Focus revert) as subscription
   tests that fail before and pass after.
4. **Legacy cutover.** Migrate every unmarked parent to v1 with the existing cutover machinery
   (script + protocol); then delete the unmarked-legacy branches in `firestore.ts:86-104,395-420`
   and the legacy escape hatch in the rules (`publicSheetMatchesAfter` third disjunct). **Executed:**
   `CharacterDoc.playStateVersion`, `PlayStateOwnership`, `omitCombatTrio`,
   `nonCombatSessionChanged`, `CombatPersistence.writeTurnEconomy`/`writeCombatTurnEconomy`,
   `campaign-io.storedPlayStateOwnership` and the peer `combat/state` create path are deleted;
   `applyCombatToSession`/`parseCombatState` require the v1 `playState`; the pre-cutover
   `applyLegacyCombatToSession`/`parseLegacyCombatChild` survive for the migration script alone.
5. **Diagnostics.** `src/lib/diagnostics/` logger + ring buffer + `users/{uid}/diagnostics/{id}`
   create-only rule + admin inbox tab (non-visual: reuses the bug inbox list).
6. **Rules, character paths only.** Owner-only writes on `characters/{id}` and `combat/state`
   (peer effect update stays until P4, isolated in one function); delete `peerLegacyCoreCreate`,
   `playStateVersion*` predicates after step 4; `combat/{stateId}` wildcard becomes `combat/state`.
   **Executed:** also `hasV1CombatOwnerAfter`, `validV1ParentStateAfter` (folded into
   `parentStateEmptyAfter`), the `publicSheetMatchesAfter` third disjunct and
   `isExactPublicCharacterSheet`'s marker line. The suite is 118 cases across `tests/rules/`.

**Exit gate:** six fixtures + production export dry-run report zero loss; replays green; rules
tests ≤ 120 cases; `pnpm test:rules`, `just ci`, `just ci-srd-only` green; live migrations applied
and verified by the owner before the deploy that needs them — **applied and `--check`-verified on
production 2026-09-03 (owner-authorized); deploy pending**.
**Blast radius:** all character documents. **Rollback:** restore the tagged backup, redeploy the
previous SHA. **Deletions:** silent-drop branches in the codec, name-keyed identity, unmarked-legacy
readers, `peerLegacyCoreCreate`, `playStateVersion*` predicates, the rules test cases for them —
executed 2026-09-03 (see the execution map above).

## P2 — Engine core (pure, no production reach)

> Superseded: the vocabulary is tiered to the stories (authoring spec §6) and built in stage 3;
> the dice seam is stage 1; K1, `mechanics-trigger.ts`, the Wayfinder charters and the
> `feat/wayfinder-*` disposition were executed on `v2` on 2026-09-03 (architecture reset).

1. Complete `src/lib/combat/` to the authoring spec: every trigger, cost, input, step, predicate,
   lifetime; the monster adapter `monsterMechanics`; the coverage generator with its drift guard;
   the personal-aggregate schema (`combat/state` v2 shape, not yet written by the app).
2. Golden replays for all 22 hard cases and for the four incidents; fold-permutation property;
   payment guard; exhaustiveness guard; import guard (`src/lib/combat` imports no React/Firebase/
   i18n/Zustand/clock/RNG).
3. Convert the 21 hand-written `mechanicsProgram`s (16 public, 5 pack) and the spell/feature
   dialects for the P3 families into `Mechanic` data; conformance errors are loud.
4. Delete: `src/lib/command/**`, `functions` bundle step in `scripts/build-functions.ts`, the K1
   tests, `cost-engine.ts planCommit/applyCommitOps` + `phase4-economy-parity.test.ts`,
   `mechanics-trigger.ts`, `feat/wayfinder-*` worktrees after owner confirmation, the Wayfinder
   charters in `docs/PROGRAM_STATUS.md`.

**Exit gate:** `docs/automation-coverage.json` committed with zero `unsupported` for the composed
catalogue's combat clauses; replays green in both build modes. **Blast radius:** none.
**Rollback:** revert the branch.

## P3 — Solo cutover, family by family

> Superseded: there is no family-by-family cutover of the old surfaces; stage 6 replaces them
> with one play surface and stage 7 deletes them. Of the follow-ups below: the legacy readers
> and `scripts/migrate-character-parents.ts` were deleted on `v2` on 2026-09-03 (they run from
> `main`); the `includeMetadataChanges` measurement and the separate emulator-test budget move
> to stage 4; the backup-manifest note stays valid for `main`'s runbook.

Order (each family = one worktree, one plan, one deletion list): resources and conversions →
casts (Spells tab and Play tab through one intent seam) → attacks and Extra Attack → conditions
and concentration → damage entry and reactions → rests, day phases and timers → items and charges
(run `migrate-item-resources.ts` under the protocol, then delete `ref.charges` and item-id
trackers).

Per family: `characterStore` mutators become `append(intent)` + fold; the personal aggregate
replaces `session.*` for that family in `combat/state` (v2 migration under the protocol, one
release); the legacy branches in `TurnEconomyProvider`/`CombatResolver`/`characterStore` and the
`mechanics-*` mirror for that family are deleted in the same worktree; their representation tests
are deleted; a replay pins the family.

**Follow-ups carried in from P1** (recorded here so they are not rediscovered):

- `parseLegacyCombatChild` (`combat-state-codec.ts`) and `applyLegacyCombatToSession`
  (`combat-state.ts`) exist ONLY for the P1 cutover script and are deleted in the same worktree that
  deletes `scripts/migrate-character-parents.ts` — not before, and never left as readers.
- Revisit the `includeMetadataChanges: true` re-parse cost on `subscribeToCharacter`: the parent
  document is re-parsed on the cache→server metadata transition too, which the per-domain reconciler
  needs today but the append-only log may not. Measure before keeping it.
- Budget the migration emulator tests SEPARATELY from the ≤ 120 rules-case ceiling. They live under
  `tests/rules/` because they need the emulator, not because they are access-policy cases, and the
  P4 rules rewrite needs its ~20 cases without evicting them.
- The backup manifest does NOT list documents the migration CREATES (a `combat/state` child for a
  never-wounded character): `writeBackupDirectory` records a `before` per changed document, and a
  created child has none. A rollback therefore deletes those children by RE-PLANNING the corpus
  (the plan names every `create`), it cannot restore them from the manifest.

**Exit gate (phase):** no solo write reaches `combat-*.ts` or `mechanics-*`; `combat/state` is
schema-2 for every live document; bundle budgets re-measured. **Blast radius:** all solo play.
**Rollback:** previous SHA + restore of `combat/state` backups. **Deletions:** the `playStateVersion`
stored field (dead since P1, still written by the P1 cutover script for the old client) together with
`scripts/migrate-character-parents.ts`, `applyLegacyCombatToSession` and `parseLegacyCombatChild`;
the family branches, `session.world` writers (readers die in P5), `combat-transition.ts`,
`combat-hp.ts`,
`combat-outcomes.ts`, `combat-resolution.ts`, `combat-test-context.ts`, `combat-economy.ts`.

## P4 — Shared cutover

> Superseded by stage 4 (shared encounter document, one listener, rules reduced to access) and
> stage 8 (chronicle from the log).

1. `campaigns/{id}/encounters/{eid}` documents; `combat-io.ts` append/subscribe/checkpoint.
2. Campaign document slimmed: delete `encounter`, `encounterInit`, `encounterSkipped`,
   `memberDetails[uid].character`, `memberDetails[uid].role`; migration ends any live encounter
   at a quiet time agreed with the owner, then rewrites campaign docs under the protocol.
3. Rules rewrite to the ≈150-line access policy (design §5.4) with a new ~20-case suite; deploy
   in the same release as the migration.
4. Party lease (`join`/`leave`/`sync` actions) replacing `party-world-lease.ts`; DM party board
   reads the encounter; monsters executable through the adapter; DM runs turns headlessly through
   the existing encounter surfaces (no visual change) — the one-tap UI is the later round.
5. Chronicle chapter generated from the log at `end`; `combat-chronicle.ts` events deleted.
6. Delete: `isCampaignDmDetach` on the character parent (the `table:leave` lease makes the owner's
   own client clear the attachment), `campaign-io.ts` encounter/peer sections (split into thin typed
   clients),
   `deliver-member-effects`, `effectOps`/`memberEffects`/`world` fields and their codecs,
   `combat-effects.ts`, `combat-effect-io.ts`, `encounter-world-*.ts`, `refresh-attached-sheets.ts`,
   the 31 semantic rule predicates and their tests.

**Exit gate:** rules ≤ 200 lines; no rule reads a game field; no write into another user's
subtree exists; one encounter listener per client; two-client offline replay green in the
emulator. **Blast radius:** campaigns. **Rollback:** previous SHA + campaign backups + previous
rules.

## P5 — Deletion and documentation

> Superseded by the stage 6–7 cuts; the reset of 2026-09-03 already deleted K1, the program
> supervisor, the old end-to-end suites, `docs/AUTOMATION_HANDOFF.md` and the superseded plans.

Delete `src/lib/mechanics-*.ts` and their tests, `session.world`, `session-state-codec.ts` v1,
`TurnEconomyProvider` composite branches and `CombatResolver` orchestration that survived P3/P4,
`docs/AUTOMATION_HANDOFF.md`, the generated explainer, `docs/AUTOMATION_COVERAGE.md` (replaced by
the generated rendering), the G0 ledgers (history only). Fold the specs into `docs/ARCHITECTURE.md`
and `docs/MECHANICS.md`; ratify the constitution wording (design §12); grep guards forbid imports of
deleted modules. **Exit gate:** test count within an order of magnitude of the design target;
bundle budgets re-measured and lowered; `docs/PROGRAM_STATUS.md` closes the program.

## Live-data protocol (every phase that moves a shape)

1. Export production (owner) → `snapshot/<date>/` outside the repo.
2. `scripts/migrate-<shape>.ts` read-only: counts, hashes, per-document issue codes, zero private
   payload in output.
3. Six fixtures + export dry-run: zero `loss`, zero `ownership-mismatch`.
4. Owner approval → `--apply --backup` with per-document update-time preconditions.
5. Verify: reread, global hashes, idempotent re-run reports zero changes; a fresh client hydration
   of each fixture.
6. Deploy the release that reads the new shape; delete the script and the compatibility reader in
   the next commit.

## Risk register (program level)

| Risk                                            | Phase      | Mitigation                                                                  |
| ----------------------------------------------- | ---------- | --------------------------------------------------------------------------- |
| Migration surprises in live data                | P1, P3, P4 | production export dry-run before every apply; issue codes; rollback backups |
| A family cutover regresses a table mid-campaign | P3, P4     | replays per family; deploy on quiet days; owner gate                        |
| Vocabulary gaps discovered late                 | P2         | the classification record lists every SRD clause; coverage guard is loud    |
| Two agents on one seam                          | all        | one worktree per phase; Codex blocked                                       |
| Bundle growth                                   | P2–P4      | ceilings re-measured per phase; deletions counted                           |
