# Program Status

The execution ledger of the new app on the long-lived branch `v2`. Update it whenever a stage
opens or closes, a gate is run, an owner gate opens, or an integration SHA changes. It does not
own product/release status (`PROGRESS.md`), release history (`CHANGELOG.md`) or the test
portfolio (`docs/TEST_PORTFOLIO.md`); those owners are linked, never copied. Production facts
(deploys, live migrations) are owned by `main`'s copy of this file.

## Reconciliation snapshot

- Steering: `PRODUCT.md` §Steering (owner, 2026-09-03), the top of the authority stack.
- Program: `docs/superpowers/plans/2026-09-03-new-app-stage-1.md` (stages U, 0–8 and their gates).
- Branch: `v2` (worktree `.claude/worktrees/d20-folio-combat-arch-db1941`), forked from `main` at
  `77ea77a`; `origin/main` `9b06b75` merged at `5d1e640`. `main` is production and receives fixes
  only; `v2` never merges into `main` before the milestone.
- Private twin: `d20-folio-content` branch `v2` (worktree
  `/Users/salvatoredicara/Workspace/d20-folio-content-v2`, forked from its `main` `5a428960`);
  this worktree's `content-pack` symlink points at it. Rule 28: every pack seam moves on both `v2`
  branches in the same motion.
- Next session: `docs/superpowers/plans/2026-09-03-v2-next-session-handoff.md`.

## Pending on `main`

The P1 data-safety deploy: both P1 migrations were applied to production on 2026-09-03 and are
`--check`-green; the deploy of `main` `9b06b75` waits for the owner's word (`docs/RELEASE.md` →
"Migrate before you deploy"). The scripts and their runbook live on `main` only.

## `v2` — stage 0, data safety gate (2026-09-03)

Owner plan: `docs/superpowers/plans/2026-09-03-new-app-stage-1.md` (stage 0) and
`docs/superpowers/plans/2026-09-03-stage-0-data-safety-gate.md`. `v2` forked from `main` at
`77ea77a`, before the P1 data-safety commits; `origin/main` `9b06b75` was merged into `v2` at
`5d1e640` (no conflicts), so the closed-world codec, `instanceId` identity, per-domain
reconciliation, the legacy cutover, diagnostics and the reduced character-path rules are on the
branch. The stage-0 proof is `scripts/audit-codec-loss.ts` (read-only in every mode; counts,
hashed findings and codes only):

| Corpus                                         | Result                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Six team fixtures (portable exports, composed) | 6/6 byte-identical                                                                                                                                     |
| Production export 2026-09-03 (53 documents)    | 12 parents equal · 3 libraries equal · 12 combat states (8 equal, 4 conformed) · 26 snapshots (5 equal, 21 conformed) · **zero loss, zero quarantine** |
| Production backups of the two P1 migrations    | pre-migration shapes refused as designed (`malformed-entry` without `instanceId`, `invalid-v1-play-state` without a play state); not a gate input      |

"Conformed" means every changed path sits on a documented one-way read seam (`CODEC_READ_SEAMS`
in `character-codec.ts`, `SHED_COMBAT_STATE_KEYS` in `combat-state-codec.ts`): the retired solo
`state.round`, retired `build.overrides` language/tool label strings, tracker-id and
concentration-ref conforms, one legacy boolean initiative-advantage leg, and the retired
`initiativeEpoch` residue on four combat states. Snapshots are immutable (created, never
re-written), so nothing is written back; the seams are enumerated so the audit fails on any
change outside them. The export lives privately outside the repository. Gates on `v2` at
`e6f8797`: `just ci` 5 min 8 s (typecheck, lint, unit fast+slow lanes, Functions, build), `pnpm test:rules` 24 s (118 cases on the emulator), `vite build` + `pnpm test:budget` green (6 budget cases). The first `just ci` run on `v2` failed only the public-surface partition guard on research notes committed during stage U (product-identity terms); reworded in `3eb0795`. A code review of the audit commits (2026-09-03) found no critical issue; its three important points — the reader normalizes log rows in place, three seam patterns were broad enough to absorb an undocumented drop, the combat-state key list was untied from the writer — were fixed in `e6f8797` (deep copy before parsing, seams anchored to exact paths with negative tests, key list typed against `CombatState`); the export re-audited with the same counts.

Follow-ups recorded here (not stage 0): a pure `combatStateWriteData(state, updatedAt)` in `combat-state-codec.ts` so the audit diffs against the real writer and the migration script's parity copy dies (rule 10); a `skippedKinds` breakdown in the audit report; the library codec preserves `item` verbatim but drops an
unknown ENTRY-level key (`{ id, savedAt, kind, item }` only) — production carries none; a future
entry-level field needs an `unknown` bucket on `LibraryEntry` before an older client may write.

## `v2` — stage 1, architecture reset and dice seam (2026-09-03)

Plans: `docs/superpowers/plans/2026-09-03-v2-architecture-reset.md` (documents and deletions) and
`docs/superpowers/plans/2026-09-03-v2-stage-1-dice-seam.md` (the seam).

**Architecture reset (done).** The target spec and the authoring spec were reconciled with the
steering (rolls as log actions, three automation levels at outcome application, the DM's last
word, the shared encounter log, vocabulary and hard-case tiers bounded to the stories); ADR-0001…
0009 accepted with dated amendments, ADR-0010 (dice seam) and ADR-0011 (automation levels) added;
migration phases P2–P5 marked superseded. Deleted on `v2` because nothing read them (evidence in
the reset plan): K1 and its Functions bundle, the program supervisor core and the agent-first
operating model, the P1/P3 migration scripts with their script-only legacy readers, `combat-io.ts`,
`mechanics-trigger.ts`, 60 end-to-end specs with the pixel harnesses and the perf probe, and the
superseded Wayfinder/K1/P2 plans and status records. The mechanics kernel is frozen by
`tests/unit/mechanics-kernel-freeze.guard.test.ts` (37 pinned readers) until stage 6; the
migration kit keeps only what the audit reads (its apply path and CLI were unread and died too). The pack twin
dropped its item-resource migration test on the pack's `v2` branch. `ci.yml` now runs on pushes to
`v2`.

**Dice seam.** _Recorded when stage 1 closes (numbers, gate wall time, commits)._

## Delete zone

Nothing here may be deleted merely because it looks complete. `v2` owns two worktrees: this one
and the pack twin `d20-folio-content-v2`; neither is a candidate. The other worktrees `just
wt-list` shows (`Codex/*` program-control and Codex task trees, `d20-folio-tactical-codex-design-lab`,
`combat-p1-data-safety-*`) belong to `main`-era programs and are owned by `main`'s copy of this
ledger; `v2` neither uses nor removes them.
