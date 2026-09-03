# Next-session handoff — total combat automation, Phase 2

Paste the block below as the first message of the next session. It is self-contained: the session
needs nothing from the conversation that produced it. Everything it references is on `main`.

---

You are continuing the **total combat automation** re-architecture of d20 Folio. Phase 1 (data
safety) is integrated on `main` (SHA `7b95f24`); its two live migrations were **applied to
production on 2026-09-03** (owner-authorized, both `--check` green); the P1 **deploy is still pending** (owner gate). Your job is **Phase 2 — engine core**, pure and with no production reach,
plus the P1 follow-ups listed below. Do not re-open the architecture: disagree with a specific
decision only by amending its ADR, with evidence.

## Read first, in this order (all on `main`)

1. `CLAUDE.md` (router; note the "Direction (2026-09-02)" block).
2. `docs/superpowers/specs/2026-09-02-total-combat-automation-design.md` — the target architecture.
3. `docs/superpowers/plans/2026-09-02-total-combat-automation-migration.md` — the phase program;
   §P1 is marked with its commits; you execute **P2** now.
4. `docs/adr/README.md` and ADR-0001…0009 (ADR-0008 carries a P1 amendment: diagnostics live in
   the top-level `diagnostics/{id}` collection).
5. `docs/superpowers/plans/2026-09-02-combat-p1-data-safety.md` — what P1 built, task by task, and
   `docs/PROGRAM_STATUS.md` → "Automation direction under re-architecture" → "Pending migrations".
6. `docs/superpowers/status/2026-09-02-p2-prototype-report.md` — what `src/lib/combat` already
   proves and how to run it.
7. `docs/superpowers/specs/2026-09-02-mechanics-authoring-spec.md` — the authoring contract (P2's
   yardstick).

Do not read `docs/AUTOMATION_HANDOFF.md`, the G0 ledgers, or the Wayfinder plans as instructions:
they are history and are superseded (ADR-0004).

## Owner rulings that bind you (2026-09-02)

- Trust at the table, minimum cost: no gameplay Cloud Functions; Firestore rules enforce identity,
  membership, ownership and shape only; log + undo are the remedy (ADR-0005).
- One engine for solo and shared play; entity id = character/creature id, never uid.
- Every persisted-shape change migrates live data **before** the deploy that needs it, under the
  snapshot → dry-run → idempotent apply → verify protocol against the six team fixtures and a
  production export (ADR-0009). P1's two migrations are pending exactly that owner gate.
- Fewer, meaningful tests (ADR-0007): golden replays, property tests, exhaustiveness, few rules and
  e2e; representation tests die with their representations.
- No deploy, no release, no external publishing, no visual change in this work. Integration to
  `main` after review and green gates is yours; deploy is the owner's.
- Codex is blocked. `fix/structural-automation-fixes` remains an input only (its reconciler, codec
  extraction and audit script were re-authored in P1; its once-per-turn ledger is a P2/P3 input).

## State you inherit from Phase 1

- Persistence: total character codec (`src/lib/codec-failure.ts`, unknown buckets, typed
  quarantine), `instanceId` on every custom entry and library entry, per-domain snapshot
  reconciliation (`src/lib/character-snapshot-reconciler.ts`), `revision` compare-and-set in the
  rules, every parent v1 (`playStateVersion` is a dead stored field until P3), the character-path
  rules reduced to owner/admin/co-member + shape, diagnostics (`src/lib/diagnostics`,
  `diagnostics/{id}`, admin inbox section).
- Scripts: `scripts/lib/migration-kit.ts`, `scripts/migrate-custom-identity.ts`,
  `scripts/migrate-character-parents.ts` — read-only by default; `--check`/`--apply --backup`
  are owner-run. `scripts/alias-loader.mjs` now expands `import.meta.glob`, so scripts run
  pack-composed under plain node.
- **Pending owner gate: the P1 deploy.** Both migrations are applied and verified on production
  (2026-09-03). Immediately before the deploy re-run both `--check`; if the identity check reports
  pending changes (old-client autosaves strip `instanceId`s until the new client ships), re-apply it
  (idempotent, same deterministic ids). After the deploy, delete both scripts, their tests and the
  script-only legacy readers (`parseLegacyCombatChild`, `applyLegacyCombatToSession`) in one commit.
  Never deploy yourself; ask the owner (golden rule 22).

## What you do

1. Create a fresh worktree from `origin/main` (`just wt-new combat-p2-engine`; if the harness
   already put you in a linked worktree at fresh `origin/main`, replicate `wt-new`'s side effects:
   link `content-pack` read-only, copy `.env.local`, run
   `scripts/program-supervisor/bootstrap-worktree.sh`).
2. Baseline: `pnpm test --run tests/unit/combat/`, `pnpm test:rules`, `pnpm exec vite build &&
pnpm test:budget` (the pre-push gate also runs the bundle budget; run it locally first).
3. Use `superpowers:writing-plans` to write `docs/superpowers/plans/<date>-combat-p2-engine-core.md`
   from migration-program §P2 with real code in every step: the full authoring vocabulary, the
   monster adapter, the coverage generator + drift guard, the personal-aggregate schema, the 22
   hard-case replays + the four incident replays, the payment/exhaustiveness/import guards, the
   21 program conversions, and the §P2 deletion list (`src/lib/command/**`, the functions bundle
   step, K1 tests, `cost-engine` planner + parity harness, `mechanics-trigger.ts`, Wayfinder
   charters). Carry the P1 follow-ups below as the plan's first task.
4. Execute with `superpowers:subagent-driven-development` — ONE implementer per worktree at a
   time (the pre-commit hook stashes the whole tree; the rules emulator ports are shared).
5. Gates before integration: `just ci`, `pnpm test:rules`, `pnpm exec vite build && pnpm
test:budget`, and `just ci-srd-only` when the pack seam moves. Small Conventional Commits,
   owner sole author, one `.changeset/*.md` per commit, the owning document reconciled in the same
   commit. Never `--no-verify`.
6. Finish by rebasing on fresh `origin/main`, pushing explicit `HEAD:main`, confirming the SHA,
   updating `docs/PROGRAM_STATUS.md`, removing the worktree, and writing the next handoff at
   `docs/superpowers/plans/<date>-next-session-handoff.md` in this same format.

## P1 follow-ups to fold into the P2 plan (first task)

Carry these as the P2 plan's first task (small, reviewed items) or as named P3 deletions; every
one is recorded in `.superpowers` ledgers that no longer exist, so this list is the record:

- **Persistence.** (a) After a non-conflict save rejection the payload stays pending but nothing
  re-queues it until the next store change: add a retry on reconnect. (b) Two parent writes can be
  in flight at once (`save()` does not await `inflight`); a rejection of the first re-bases the
  cursor under the second — the rules deny the under-claim and the CAS branch converges, but the
  send seam should be serialized. (c) `includeMetadataChanges` on the parent listener re-parses the
  envelope on every echo/confirm transition (CPU only) — measure, then gate or debounce in P3.
  (d) `roster.quarantine` is logged per snapshot for a permanently bad row (dedupe by document id).
- **Scripts.** (e) `parseLegacyCombatChild` and `applyLegacyCombatToSession` exist only for
  `scripts/migrate-character-parents.ts` (guarded by a no-`src` import test) — delete them with the
  script once the cutover has run on production. (f) `stampEnvelope`'s SRD-id reservation in the
  identity migration has no covering test. (g) `deleteApp()` in a `finally` can replace the printed
  refusal with a disposal error (exit code unaffected). (h) The backup manifest omits the
  `combat/state` children the cutover creates (a rollback deletes them by re-planning).
  (i) `scripts/alias-hooks.mjs` duplicates the pack-enabled rule of `scripts/content-pack-mode.ts`
  and expands `import.meta.glob` by regex (comments/strings are masked; regex literals are not).
  (j) The private pack barrel's export order is a latent ESM cycle that the loader warm-up defuses —
  a rule-28 two-repo fix.
- **Codec.** (k) Compact-state scalar readers still absence-default (documented seam 4 in
  `docs/CHARACTER_SCHEMA.md`); it dies with the parent play state in P3. (l) The library codec keeps
  the stored entry `id` even when it differs from `item.instanceId`; the identity migration realigns
  them — after the live run, assert `id === item.instanceId` at read.
- **Tests.** (m) The 118 rules cases include 5 migration-emulator cases; budget those separately
  from the ≤ 120 rules ceiling. (n) `just ci` does not run the bundle budget or the rules lane; the
  pre-push hook does — run `pnpm exec vite build && pnpm test:budget` and `pnpm test:rules` locally
  before every integration.
- **Diagnostics.** (o) The `diagnostics/{id}` create rule has no server-side rate limit (client caps
  only: 10 per session, 50 per user per build) — acceptable for a friends table; revisit if abused.
- **Inputs for P2/P3.** (p) The Codex once-per-turn rider ledger (`a737e24` on
  `fix/structural-automation-fixes`) is an input to the intent/cost model; re-author, never merge.
  (q) `writeCombatTurnEconomy` and `CombatPersistence.writeTurnEconomy` were deleted in P1; the
  turn economy rides the complete child write until the personal Encounter aggregate replaces it.

## Ask the owner only about

Product or taste calls, cost or privacy changes, anything irreversible (live apply, deploy),
or a decision that contradicts an ADR. Resolve every technical question from the code and the
documents above. Batch questions; do not block on them.

## Definition of done for Phase 2

Every bullet of migration-program §P2 has a merged commit or a written reason;
`docs/automation-coverage.json` committed with zero `unsupported` for the composed catalogue's
combat clauses; replays green in both build modes; the §P2 deletion list executed; the handoff for
Phase 3 exists.

IMPORTANTE: rispondi in italiano nella chat; gli artefatti nel repository restano in inglese.

---
