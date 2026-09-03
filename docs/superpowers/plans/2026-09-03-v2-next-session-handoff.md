# Next-session handoff — `v2`, stage 1 (dice seam)

Paste the block below as the first message of the next session. It is self-contained; everything
it references is on `origin/v2`. It supersedes `2026-09-03-next-session-handoff.md` (the Phase 2
engine handoff written for `main` before the steering of 2026-09-03): the combat re-architecture
now advances inside the stage-1 program on `v2`, in the order of
`docs/superpowers/plans/2026-09-03-new-app-stage-1.md`.

---

You are continuing the new d20 Folio app on the long-lived branch `v2` (worktree
`.claude/worktrees/d20-folio-combat-arch-db1941`; check `git branch --show-current`, the worktree
may sit on a detached HEAD — push `HEAD:refs/heads/v2` and verify with `git ls-remote`). `main` is
production and is never touched. Speak Italian with the owner; everything in the repository is
English.

## Read first, in this order

1. `PRODUCT.md` §Steering (golden rule 30, giants' shoulders), `CLAUDE.md`.
2. `docs/superpowers/plans/2026-09-03-new-app-stage-1.md` — stage U and stage 0 are closed; you
   execute **stage 1, the dice seam**.
3. `docs/superpowers/specs/2026-09-03-ui-redesign-design.md` §8f rule 37 (rolls) and dossier 18
   (dice tray, physical dice, hidden DM roll) — the agreed behaviour; no screen is implemented in
   stage 1, only the seam and its log line.
4. `docs/superpowers/specs/2026-09-02-total-combat-automation-design.md` §3 (actions, inputs)
   and `src/lib/combat` (the P2 prototype the seam plugs into).
5. `docs/PROGRAM_STATUS.md` → "`v2` — stage 0" for what the branch now carries and the follow-ups.

## What stage 0 left you

- `main` `9b06b75` merged into `v2` (`5d1e640`): closed-world codec with `unknown` buckets,
  `instanceId` identity, per-domain reconciliation with `revision` compare-and-set, diagnostics.
- `scripts/audit-codec-loss.ts` (read-only): fixtures 6/6 byte-identical, production export of 53
  documents zero loss, zero quarantine. `CODEC_READ_SEAMS` and `SHED_COMBAT_STATE_KEYS` enumerate
  the documented read seams; a change outside them fails the audit. Run it again before any deploy
  that reads a stored shape (`docs/RELEASE.md` → "Migrate before you deploy").
- Gates on `v2`: `just ci` (about five minutes), `pnpm test:rules`, `vite build && pnpm test:budget`;
  all green at `e6f8797`.

## First task (done 2026-09-03, commits `0e2d8ee`…`3a6cb72`): architecture reset against the steering

The owner's standing rule (2026-09-03, repeated): no dead weight in the app; everything present
is there for a reason and is optimal; when the conditions change, the architecture changes to stay
optimal. The purpose changed on 2026-09-03 (a digital table, BG3-level automation with the DM's
last word, three campaign automation levels, dice with provenance, a shared encounter log), and
the automation scope changes with it. The stage-1 plan already re-scopes what gets built (stage 3
builds the reducer for the two story encounters only; stage 7 cuts the mechanics kernel, the
command kernel, the supervisor, the old e2e suites), but the target spec
(`2026-09-02-total-combat-automation-design.md`) and the migration program
(`2026-09-02-total-combat-automation-migration.md`, phases P2–P5) still describe the earlier
total-automation scope and are not reconciled. Do this first, as a documented decision round
(superpowers brainstorming + writing-plans, no product code):

1. Reconcile the spec with `PRODUCT.md` §Steering: the three campaign automation levels (full
   auto · propose-and-confirm · log only) as a first-class property of the reducer's outcome
   application, dice provenance (`app | manual`, hidden) on every roll, the campaign encounter log
   as the shared document, the DM's override and undo on every surface; bound the mechanic
   vocabulary and the hard-case list to what the four acceptance stories need, and mark the rest
   as later or out. Amend the ADRs that the change touches; never re-open a decision silently.
2. Mark the migration program's P2–P5 as superseded by stages 1–4 and 7 of the stage-1 plan, or
   fold what survives into those stages.
3. Inventory every module the merge carried onto `v2` and name its fate now: keep, rebuild in
   stage N, or delete now when nothing reads it (rule 10: dead code dies as soon as it is dead,
   not at stage 7). Candidates: the P2 prototype `src/lib/combat`, the mechanics kernel, the
   command kernel, the program supervisor, the P1 migration scripts and their legacy readers
   (`parseLegacyCombatChild`, `applyLegacyCombatToSession`), the old e2e suites, the wayfinder
   plans. Record the inventory in the stage-1 plan and update `CLAUDE.md`'s direction block.

Only then open the dice seam below, with its own written plan.

## Stage 1 — the dice seam

`roll(formula, { by, reason, hidden, mode })` persisted as a log action with faces, total, seed,
roller and source (`app | manual`); three inputs — in-app, manual entry of physical dice, hidden DM
roll. Numbers and a log line first; the shared 3D animation is a later stage. RNG lives only inside
this seam (the production code still enforces "no dice" until the play screen ships). Golden
replays of Marco's turn (story 1) and Sara's ambush (story 2) are the acceptance tests of stages
1–3; write the dice seam so those replays can feed recorded faces.

## Rules that bind you

Superpowers lifecycle (brainstorm briefly → written plan → worktree → TDD → review → verify).
Small Conventional Commits, owner sole author, one `.changeset/*.md` per commit, owning document
reconciled in the same commit; never `--no-verify`. No deploy, no release, no push to `main`. No
old end-to-end specs on `v2` and none added; the gate stays under 15 minutes. Any screen goes
through the screenshot gate (rule 25) — stage 1 has none. Ask the owner only about taste, product
or cost, with an example and a recommended option; close with the state for the next session.
