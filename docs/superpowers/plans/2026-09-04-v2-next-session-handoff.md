# Next-session handoff — `v2`, the group's first combat on staging, the polish pass, stage 7

Paste the block below as the first message of the next session. It is self-contained; everything it
references is on `origin/v2` (verify the tip with `git ls-remote origin refs/heads/v2` — the commit
that carries this file is the tip) and on the private pack's `origin/v2` (`b6073dd0`).

---

You are continuing the new d20 Folio app on the long-lived branch `v2` (worktree
`.claude/worktrees/d20-folio-combat-arch-db1941`; check `git branch --show-current` — this
worktree can end up detached at `v2`'s tip after a push, so re-point it with
`git branch -f v2 HEAD && git switch v2` if so; push `HEAD:refs/heads/v2` and verify with
`git ls-remote origin refs/heads/v2`). The private content pack has its own `v2` branch: worktree
`/Users/salvatoredicara/Workspace/d20-folio-content-v2`, and this worktree's `content-pack`
symlink points at it (rule 28: both `v2` branches move in the same motion; stage 6 touched the
pack — `areaShape` on its area spells, two pack tests — and both are pushed). `main` is production
and is never touched. Speak Italian with the owner; everything in the repository is English.

## Read first, in this order

1. `PRODUCT.md` §Steering (golden rules 30–32), `CLAUDE.md` (the Direction block).
2. `docs/superpowers/plans/2026-09-03-new-app-stage-1.md` — stages U and 0–6 are closed in code.
   Item 6's gate ("the group plays one combat on staging without Owlbear; owner screenshots
   approved") is NOT yet played: that is this session's first job. Then the polish pass, then
   item 7 (the cuts).
3. `docs/PROGRAM_STATUS.md` → "`v2` — stage 6" — what was built (tasks 1–4), the reviews and fix
   rounds, every ruling, the deferred lists (the engine's and the surface's), the staging state,
   the gate numbers.
4. `docs/superpowers/specs/2026-09-04-v2-stage-6-play-surface-design.md` — the contract as built:
   D1 (the personal `combat/state` stays `CombatState`; the lease writes the trio back through the
   branded encoder; the personal `Encounter` waits for item 8), D2 (mechanics ride the log; the
   static catalogue is `core:*`), D3–D4 (projections, the adapter, `areaShape`, `upcast: true` on
   every projected slot cost), D5 (`campaigns/{id}/encounters/live`), D7 (the target flow), D8
   (compaction, `spent` kept), D9 (the surface).
5. `docs/superpowers/specs/2026-09-03-ui-redesign-design.md` §5f, §8f, §10a — the play screen's
   contract for the polish pass.

## Where things stand

- **Code.** `origin/v2` carries stage 6 whole: the engine and client (tasks 1–3, integrated at
  `29534e3e` after a whole-branch review and one fix wave) and the play surface (task 4,
  integrated at `fa858c80` after three scoped review rounds). Gates at the close are in
  `docs/PROGRAM_STATUS.md` (about 8 min 50 s combined; the precache ceiling moved 9525 → 9781 KiB
  for the one lazy play chunk pair).
- **The owner's verdict (2026-09-04).** He saw the curated capture matrix twice (before and after
  his two corrections — the framed panels' bracket corners, the HUD's mirrored clusters — both
  applied and pinned by a geometry assertion in the visual lane) and ruled: in direction, "tutti i
  dettagli visivi li potremo rivedere una volta che il lavoro sarà ultimato". Grid snapping stays
  (Foundry, Roll20 and Owlbear snap by default); free placement is a later option; his one
  condition: player freedom is not sacrificed.
- **Staging.** Blaze linked (billing account of production, £1 budget with 50 % / 100 % alerts),
  default Storage bucket in `europe-west1`, Firestore and Storage rules released, Identity
  Platform initialised, hosting deployed at https://d20-folio-staging.web.app. **Still pending, the
  owner's console action:** Authentication → Sign-in method → Google → Enable → Save (the API
  refuses without an OAuth client the console creates; the Claude-in-Chrome extension was not
  connected). Nothing is seeded on staging yet.
- **Worktrees.** The task worktrees of stage 6 are removed; only the `v2` worktree and the pack's
  remain. The proposal branches `v2-stage5-map-surface` and `v2-stage6-play-surface` are deleted
  on origin (integrated).

## This session, in order

1. **The stage 5–6 gate: one combat on staging.** (a) Confirm the Google provider is enabled (ask
   the owner for the two clicks if not — it is the only thing you cannot do). (b) Seed staging:
   the owner's account as DM (and `role: admin` on his user document, a console/Admin-SDK action
   recorded in stage 4), his group's campaign, the six team fixtures anonymised through the
   existing import path (`docs/superpowers/plans/2026-09-03-new-app-stage-1.md` → Staging setup,
   step 2); `scripts/dev-seed-sandbox.ts` is the emulator seed to adapt, never pointed at
   production (`d20-folio`). (c) Rebuild and redeploy hosting (`pnpm exec vite build --mode
staging && firebase deploy --only hosting -P staging` — staging deploys are owner-permitted;
   production never). (d) Play a combat with the owner from `/campaigns/<id>/play`: DM opens the
   table, adds monsters from the dock, players sit, initiative, a turn each, Fireball, a hidden
   token, fog, an undo, a correction from the HP editor. Every defect goes into a list; the
   engine ones are fixed under the Superpowers lifecycle, the visual ones join the polish pass.
2. **The polish pass.** The deferred surface minors in `docs/PROGRAM_STATUS.md` → stage 6 →
   "Deferred (the surface)" plus whatever the combat surfaces; check every screen against the
   standing corrections (bracket corners, mirrored clusters) and rule 40 (tooltips) before
   showing it; deliver before/after captures across the matrix as chat images (rule 25).
3. **Stage 7 — the cuts** (item 7 of the stage-1 plan): the mechanics kernel and its 47 test
   files, the old play surfaces (`PlayTab`, `CombatResolver`, `TurnEconomyProvider`) and their
   render tests, `cost-engine`, `dice-formula` / `integer-expression` / `d20-test`, the dev
   scaffolding routes, `POSITIONING.md`, the atlas authority — once nothing reads them (rule 10),
   with `docs/MECHANICS.md` absorbing the authoring spec. Write the plan first; the reverse import
   graph decides the order.

## Seams to honour

- **`combat/state` is `CombatState`** until item 8 rebuilds the sheet; `leaveTable`'s only
  write-back is the `document` variant through `encodeLegacyWriteBack` over a SERVER-confirmed
  parse (`readServerCombatState`, 8 s timeout, honest notice). Never write a personal `Encounter`.
- **Mechanics ride the log.** A client never resolves a mechanic from local data; the static
  catalogue is `CORE_MECHANICS`. A projection must never emit a `core:` id. Node budget: ≈ 1,200
  nodes per projected PC, 44,032 / 50,000 measured for six PCs + 1,000 intents under the rules'
  1,000-entry cap; "compact on node count or lower the cap" is deferred.
- **The vocabulary is the stage-3 tier + `dash`.** The wizard fixture automates 2 of 25 steps;
  growing the vocabulary (grant-bearing `effect-start`, richer targeting, `propose-and-confirm`)
  is item 8's design work, not a side task.
- **One writer per worktree**, and one pack checkout is shared by every worktree through the
  symlink — do not commit pack-side from a parallel task until integration. Reviewers are
  read-only (no probe files in a worktree). Worktrees need `.env.local` copied in for the dev
  server and the visual lane.
- **Owner-facing rules.** Ask only about taste, product or cost, with an example and a
  recommended option; every screen goes through the screenshot gate as chat images; the app
  never names other products (rule 41).

## Rules that bind you

Superpowers lifecycle (brainstorm briefly → written plan → worktree → TDD → review → verify).
Small Conventional Commits, owner sole author, one `.changeset/*.md` per commit, owning document
reconciled in the same commit; never `--no-verify`. No deploy to production, no release, no push
to `main`. No end-to-end spec on `v2`; the gate (`just ci`, `pnpm test:rules`, `pnpm build &&
pnpm test:budget`, `just ci-srd-only` when a public module changes) stays under 15 minutes.
When you finish: rewrite this handoff file for the session after yours, and paste its prompt
block in full as the last message of the chat.
