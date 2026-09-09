# Next-session handoff — `v2`, stage 3 (the reducer for the two story encounters)

Paste the block below as the first message of the next session. It is self-contained;
everything it references is on `origin/v2` at `79c8549`.

---

You are continuing the new d20 Folio app on the long-lived branch `v2` (worktree
`.claude/worktrees/d20-folio-combat-arch-db1941`; check `git branch --show-current` — this
worktree can end up detached at `v2`'s tip after a push, so re-point it with
`git branch -f v2 HEAD && git switch v2` if so; push `HEAD:refs/heads/v2` and verify with
`git ls-remote origin refs/heads/v2`). The private content pack has its own `v2` branch: worktree
`/Users/salvatoredicara/Workspace/d20-folio-content-v2`, and this worktree's `content-pack`
symlink points at it (rule 28: both `v2` branches move in the same motion; push the pack with
`git -C /Users/salvatoredicara/Workspace/d20-folio-content-v2 push origin v2` — this stage
touched nothing pack-related, so nothing to push there yet). `main` is production and is never
touched. Speak Italian with the owner; everything in the repository is English.

## Read first, in this order

1. `PRODUCT.md` §Steering (golden rules 30–32), `CLAUDE.md` (the Direction block).
2. `docs/superpowers/plans/2026-09-03-new-app-stage-1.md` — stages U, 0, 1 and 2 are closed; you
   execute **stage 3, the reducer for the two story encounters** (item 3).
3. `docs/superpowers/specs/2026-09-02-total-combat-automation-design.md` §3 (execution model,
   automation levels), §4 (mechanics as data), §7 (hard-case walkthroughs — read the "Tiers
   (2026-09-03)" note at its top: only cases 3, 5, 6, 7, 9, 11, 12, 15, 16, 21 are stage-3 scope;
   everything else is `later`), and the authoring spec's §6 vocabulary tiers.
4. `docs/superpowers/specs/2026-09-03-v2-stage-2-positions-areas-design.md` — what stage 2 built
   and, importantly, what it deliberately left out (no `TargetSpec.count: "area"` wiring, no
   fifth range band) that stage 3 is now the right time to add if the stories need it.
5. `docs/adr/0011-*.md` if it exists (automation levels) — if not, the automation-level
   application rule is only described in the design doc §3.2 ("Outcome application by automation
   level") and has **no reducer implementation yet**; you are the one who builds it.
6. `docs/PROGRAM_STATUS.md` → "`v2` — stage 2" for the numbers and the gate.

## Important: read the code before planning — most of the reducer already exists

`src/lib/combat` is not a blank slate. It is the kept P2 prototype (module fates,
`2026-09-03-v2-architecture-reset.md`): `intent.ts` (941+ lines) already has a working
`applyIntent`/`runProgram`/`runStep` that executes `attack`, `save`, `damage`, `heal`,
`effect-start`, `condition`, `move-mark`, `turn-claim`, `negate`, `manual-table` and (as of
stage 2) `move` steps, with cost payment, concentration, reaction windows (including a real
opportunity-attack window, both from a manual `declare` and from a real `move`), and undo via the
fold. `table.ts` has the clock (start/turns/rest/day-phase). The prototype catalogue
(`src/data/combat/prototype-catalogue.ts`) already has a longbow, a shortsword with its
opportunity-attack program, a goblin scimitar, Hunter's Mark, Shield, a save-gated homebrew
spell, and `core:move`. **Your first task is a gap analysis, not a from-scratch build**: write
`marco-first-turn.json` and `sara-ogre-ambush.json` against the acceptance stories in `PRODUCT.md`
§Steering, run them, and see what's actually missing. From the design doc's tiering, the concrete
gaps are very likely: the monster-stat-block adapter (`monsterMechanics(block) → Mechanic[]`,
authoring spec §4 — nothing calls this yet, Multiattack included), a real area-effect mechanic
(Fireball) that needs `TargetSpec.count: "area"` wired to stage 2's `areaMembership`, the three
campaign automation levels actually gating outcome application (today `resolve()` always applies
immediately — there is no `full-auto | propose-and-confirm | log-only` branch anywhere), and
0 HP/dying (`hp-zero`, `life: "dying"` — check `damage.ts` first, it may already be there).
Confirm each gap by reading the code, not by assuming this list is complete or correct.

## Stage 3 — the reducer for the two story encounters

From `src/lib/combat`: move (done, stage 2), weapon attack, cantrip and levelled area save spell,
monster multiattack via an adapter over the typed stat blocks, conditions, concentration, damage
and 0 HP, opportunity-attack window (done), `override` (done), `undo` (done, at the fold level),
the three campaign automation levels (ADR-0011 if it exists, else design doc §3.2). Vocabulary and
hard cases: exactly the stage-3 tier of the target spec (§4, §7) and of the authoring spec (§6); a
`later` kind conforms as `unsupported`, never half-built. Golden replays for Marco's turn and
Sara's ambush are the acceptance gate for this stage (`docs/superpowers/plans/
2026-09-03-new-app-stage-1.md` → "Gates": "both golden replays pass on the emulator with two
clients (DM and player) folding the same log; an override and an undo from each side" — note the
"two clients" and "emulator" parts are stage 4's shared-encounter-document scope, not stage 3's;
stage 3's own bar is the two replays passing against the pure reducer, which is what this session
should actually finish).

## Rules that bind you

Superpowers lifecycle (brainstorm briefly → written plan → worktree → TDD → review → verify).
Small Conventional Commits, owner sole author, one `.changeset/*.md` per commit, owning document
reconciled in the same commit; never `--no-verify`. No deploy, no release, no push to `main`. No
end-to-end spec on `v2`; the gate (`just ci`, `pnpm test:rules`, `vite build && pnpm test:budget`,
`just ci-srd-only` when a public module changes) stays under 15 minutes — it was 4 min 26 s +
15 s + 5 s (+ 2 min 13 s for the SRD-only variant) at the close of stage 2. Any screen goes
through the screenshot gate (rule 25) — stage 3 has no screen either. Ask the owner only about
taste, product or cost, with an example and a recommended option. When you finish: rewrite this
handoff file for the session after yours, and paste its prompt block in full as the last message
of the chat, so the owner can archive the chat and start the next one by pasting it (the owner
never keeps sessions open).
