# Next-session handoff — `v2`, stage 2 (positions and areas)

Paste the block below as the first message of the next session. It is self-contained; everything
it references is on `origin/v2`.

---

You are continuing the new d20 Folio app on the long-lived branch `v2` (worktree
`.claude/worktrees/d20-folio-combat-arch-db1941`; check `git branch --show-current`; push
`HEAD:refs/heads/v2` and verify with `git ls-remote`). The private content pack has its own `v2`
branch: worktree `/Users/salvatoredicara/Workspace/d20-folio-content-v2`, and this worktree's
`content-pack` symlink points at it (rule 28: both `v2` branches move in the same motion; push
the pack with `git -C /Users/salvatoredicara/Workspace/d20-folio-content-v2 push origin v2`).
`main` is production and is never touched. Speak Italian with the owner; everything in the
repository is English.

## Read first, in this order

1. `PRODUCT.md` §Steering (golden rules 30–32), `CLAUDE.md` (the Direction block).
2. `docs/superpowers/plans/2026-09-03-new-app-stage-1.md` — stages U, 0 and 1 are closed; the
   "Module fates" section names what is kept, rebuilt or already deleted; you execute **stage 2,
   positions and areas in the aggregate**.
3. `docs/superpowers/specs/2026-09-02-total-combat-automation-design.md` §1 (invariants,
   including the map-derived facts), §2.3 (relations), §4 and §7 (the stage-3 tier you are
   preparing for), and the authoring spec §6 (vocabulary tiers).
4. `docs/superpowers/specs/2026-09-03-ui-redesign-design.md` §5c (position and movement without
   a map), §5f rules 33–34 (tokens, map tools) — behaviour only; no screen in stage 2.
5. `docs/adr/0010-dice-seam-rolls-are-log-actions.md` and `src/lib/combat/dice.ts`,
   `src/lib/dice.ts`, `tests/unit/combat/replays/` — what stage 1 built and how a replay feeds
   recorded rolls.
6. `docs/PROGRAM_STATUS.md` → "`v2` — stage 1" for the numbers and the gate.

## What stage 1 left you

- Rolls are `roll` actions with formula, faces, total, seed, source (`app | manual`), `hidden`,
  roller and purpose; the fold verifies an app roll from its seed and rejects a tampered one;
  intents answer `d20`/`dice` inputs with `{ roll: ActionId }`; undoing a roll re-validates the
  intent as `missing-answer`. Randomness for dice exists only in `src/lib/dice.ts`
  (`tests/unit/dice-randomness.guard.test.ts` pins every other random source as an id).
- The roll log line renders in EN and IT through `src/lib/views/roll-view.ts`; hidden faces are
  concealed from everyone but the DM and the roller.
- Golden replays: `tests/unit/combat/replays.test.ts` folds every `replays/*.json`; the first is
  `dice-provenance.json`. Stories 1 and 2 land in stage 3 as `marco-first-turn.json` and
  `sara-ogre-ambush.json`.
- The architecture reset is done: K1, the program supervisor, the old e2e suites, the P1/P3
  migration scripts and the superseded plans are gone; the mechanics kernel is frozen
  (`tests/unit/mechanics-kernel-freeze.guard.test.ts`) until stage 6.

## Stage 2 — positions and areas in the aggregate

`position` on entities (grid cell or map coordinates with a scale), `area` in the mechanic
vocabulary (sphere, cone, line, cube, cylinder), and the derived facts — reach, range band, area
membership, "who left reach" — computed from positions with provenance `derived`, with declared
relations (`declare` actions) as the fallback when no map is loaded. The declared relations that
today's replay runner seeds before the log become log actions. Design first (superpowers
brainstorming, giants' shoulders: Foundry's measurement and template shapes, Owlbear's ruler and
grid), then a written plan, then TDD; add the `move` step and the reach events the stage-3
reducer needs. No screen, no map upload (stage 5).

## Rules that bind you

Superpowers lifecycle (brainstorm briefly → written plan → worktree → TDD → review → verify).
Small Conventional Commits, owner sole author, one `.changeset/*.md` per commit, owning document
reconciled in the same commit; never `--no-verify`. No deploy, no release, no push to `main`. No
end-to-end spec on `v2`; the gate (`just ci`, `pnpm test:rules`, `vite build && pnpm test:budget`,
`just ci-srd-only` when a public module changes) stays under 15 minutes. Any screen goes through
the screenshot gate (rule 25). Ask the owner only about taste, product or cost, with an example
and a recommended option; close with the state for the next session and rewrite this handoff.
