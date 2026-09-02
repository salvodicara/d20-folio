# Next-session handoff — total combat automation, Phase 1

Paste the block below as the first message of the next session. It is self-contained: the session
needs nothing from the conversation that produced it. Everything it references is on `main`.

---

You are continuing the **total combat automation** re-architecture of d20 Folio. The architecture
round is complete and integrated; your job is **Phase 1 — data safety**, then Phase 2 proper. Do not
re-open the architecture: disagree with a specific decision only by amending its ADR, with evidence.

## Read first, in this order (all on `main`)

1. `CLAUDE.md` (router; note the "Direction (2026-09-02)" block).
2. `docs/superpowers/specs/2026-09-02-total-combat-automation-design.md` — the target architecture.
3. `docs/superpowers/plans/2026-09-02-total-combat-automation-migration.md` — the phase program;
   you execute **P1** now.
4. `docs/adr/README.md` and ADR-0001…0009 — the decisions and why the alternatives lost.
5. `docs/superpowers/status/2026-09-02-combat-automation-audit.md` — evidence, root causes,
   bug-to-cause map (read §5.3 and §2.7 closely: they name the exact code you will touch).
6. `docs/superpowers/status/2026-09-02-p2-prototype-report.md` — what `src/lib/combat` already
   proves and how to run it.
7. `docs/superpowers/specs/2026-09-02-mechanics-authoring-spec.md` — the authoring contract
   (needed for P2, skim for P1).

Do not read `docs/AUTOMATION_HANDOFF.md`, the G0 ledgers, or the Wayfinder plans as instructions:
they are history and are superseded (ADR-0004).

## Owner rulings that bind you (2026-09-02)

- Trust at the table, minimum cost: no gameplay Cloud Functions; Firestore rules enforce identity,
  membership, ownership and shape only; log + undo are the remedy (ADR-0005).
- One engine for solo and shared play; entity id = character/creature id, never uid.
- Every persisted-shape change migrates live data **before** the deploy that needs it, under the
  snapshot → dry-run → idempotent apply → verify protocol against the six team fixtures and a
  production export (ADR-0009). The owner had to hotfix production live during play on
  2026-08-31; that must never recur.
- Fewer, meaningful tests (ADR-0007): golden replays, property tests, exhaustiveness, few rules and
  e2e; representation tests die with their representations.
- No deploy, no release, no external publishing, no visual change in this work. Integration to
  `main` after review and green gates is yours; deploy is the owner's.
- Codex is blocked. `fix/structural-automation-fixes` is an input: re-author its structural parts
  (snapshot reconciler, codec extraction, once-per-turn ledger, audit script), reject its
  compatibility shim (`fe63954`) and its permissive defaults. Never merge it wholesale.

## What you do

1. Create a fresh worktree from `origin/main` with `just wt-new combat-p1-data-safety` (never work
   in the shared checkout; link `content-pack` read-only as `docs/WORKTREES.md` describes).
2. Run `scripts/program-supervisor/bootstrap-worktree.sh`, then `pnpm test --run tests/unit/combat/`
   and `pnpm test:rules` to confirm the baseline is green.
3. Use `superpowers:writing-plans` to write the bite-sized P1 plan at
   `docs/superpowers/plans/<date>-combat-p1-data-safety.md` from migration-program §P1. It must
   cover, with real code in every step: total codec with unknown-key preservation and typed
   quarantine; `instanceId` on every custom item, weapon, spell, feature and library entry plus the
   migration script; per-domain snapshot reconciliation and a precondition on the parent write; the
   legacy-parent cutover script; the diagnostics layer (`src/lib/diagnostics`, IndexedDB ring
   buffer, `users/{uid}/diagnostics/{id}` create-only rule, admin inbox tab); the character-path
   rules simplification; the deletion list; and the replays that reproduce the two reported losses
   (custom item vanishing, Focus reverting) before and after.
4. Execute it with `superpowers:subagent-driven-development` or `superpowers:executing-plans`,
   TDD throughout (`superpowers:test-driven-development`): failing test first, every time.
5. Gates before integration: `just ci`, `pnpm test:rules`, and `just ci-srd-only` if the pack seam
   moves. Small Conventional Commits, owner as sole author, one `.changeset/*.md` per commit, the
   owning document reconciled in the same commit. Never `--no-verify`.
6. Live migration: produce the read-only report (counts, hashes, issue codes, no private payloads)
   and **stop**; ask the owner for the production export and the apply permission. Do not apply.
7. Finish by rebasing on fresh `origin/main`, pushing explicit `HEAD:main`, confirming the SHA,
   updating `docs/PROGRAM_STATUS.md` (the "Automation direction under re-architecture" section),
   removing the worktree, and writing the next handoff at
   `docs/superpowers/plans/<date>-next-session-handoff.md` in this same format.

## Ask the owner only about

Product or taste calls, cost or privacy changes, anything irreversible (live apply, deploy),
or a decision that contradicts an ADR. Resolve every technical question from the code and the
documents above. Batch questions; do not block on them.

## Definition of done for Phase 1

Every bullet of migration-program §P1 has a merged commit or a written reason; the P1 exit gate is
met; the deletion list is executed; the six fixtures and the production dry-run report zero loss;
the handoff for Phase 2 exists.

IMPORTANTE: rispondi in italiano nella chat; gli artefatti nel repository restano in inglese.

---
