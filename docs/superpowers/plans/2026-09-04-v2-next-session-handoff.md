# Next-session handoff — `v2`, the map surface verdict and stage 6

Paste the block below as the first message of the next session. It is self-contained; everything it
references is on `origin/v2` (the engine of stage 5) and on `origin/v2-stage5-map-surface` (the map
surface, a proposal until the owner's screenshot verdict). Confirm both with
`git ls-remote origin refs/heads/v2 refs/heads/v2-stage5-map-surface` before relying on them.

---

You are continuing the new d20 Folio app on the long-lived branch `v2` (worktree
`.claude/worktrees/d20-folio-combat-arch-db1941`; check `git branch --show-current` — this
worktree can end up detached at `v2`'s tip after a push, so re-point it with
`git branch -f v2 HEAD && git switch v2` if so; push `HEAD:refs/heads/v2` and verify with
`git ls-remote origin refs/heads/v2`). The private content pack has its own `v2` branch: worktree
`/Users/salvatoredicara/Workspace/d20-folio-content-v2`, and this worktree's `content-pack`
symlink points at it (rule 28: both `v2` branches move in the same motion; stage 5 touched
nothing pack-related, so nothing is pending there). `main` is production and is never touched.
Speak Italian with the owner; everything in the repository is English.

## Read first, in this order

1. `PRODUCT.md` §Steering (golden rules 30–32), `CLAUDE.md` (the Direction block).
2. `docs/superpowers/plans/2026-09-03-new-app-stage-1.md` — stages U, 0, 1, 2, 3, 4 are closed and
   stage 5's ENGINE is closed; stage 5's SURFACE waits on the owner's verdict; you execute what the
   owner decided about it (below), then **stage 6, one play surface** (item 6): dossier 14 as
   approved in direction — initiative strip, map, hotbar of the selected entity, log with undo,
   DM drawer with hidden/fog/HP editor. Old `PlayTab`, `CombatResolver`, `TurnEconomyProvider`
   stay unreferenced until the surface works, then die (stage 7).
3. `docs/superpowers/specs/2026-09-04-v2-stage-5-minimum-map-design.md` — the map's contract:
   §2 (why the map lives on the encounter document), §3 (the model), §4 (reducer semantics), §5
   (the drop policy table), §6 (who sees what), §7 (the Storage seam), §8 (the surface), §10 (what
   was deferred and why).
4. `docs/PROGRAM_STATUS.md` → "`v2` — stage 5" — what was built, the review's findings and the
   fix wave, the rulings, the deferred list, the gate numbers, and the staging note (no Storage
   bucket on staging until Blaze).
5. `docs/superpowers/specs/2026-09-03-ui-redesign-design.md` §5f (rules 28–34, the play screen),
   §8f (rules 39–44) and §10a (the Owlbear ledger): stage 6's contract for the chrome around the
   map.

## The map surface (stage 5, task 7) — where it stands

Built on the proposal branch `v2-stage5-map-surface` (pushed at `0a2c9031`, one commit on top of
`v2`'s `c2bb130d`): `src/features/play/map/{MapCanvas.tsx,geometry.ts,map.css}`, the `map` i18n
shard (EN + IT, tooltips on every control), the DEV-only route `/_map`
(`src/app/routes/map-dev.tsx`, mounted behind `import.meta.env.DEV` in `router.tsx`), the
fast-lane geometry tests and the jsdom `MapCanvas` tests (who sees what; which event a drop emits).
`pnpm typecheck`, eslint and the two suites are green on the branch; the full gate has NOT been
run on it (it is a proposal, not an integration candidate yet).

Screenshots were delivered in the chat of 2026-09-04 (desktop 1440 × 900 and 1024 × 768, dark and
light, IT and EN): the DM's view with fog and the hidden wolf, the player view, the drag ruler in
its three tones (ok / needs a Dash / beyond, from the player's role) and the snap-back, the fog
rectangle being drawn and revealed. The owner's verdict decides what you do first:

- **Approved (possibly with corrections):** apply the corrections on the proposal branch, run
  the full gate there (`just ci`, `pnpm test:rules`, `pnpm build && pnpm test:budget`,
  `just ci-srd-only`), rebase onto fresh `origin/v2`, fast-forward `v2` to it (push
  `HEAD:refs/heads/v2`), delete the proposal branch on origin, and record the integration in
  `docs/PROGRAM_STATUS.md` → stage 5 (the surface is then part of stage 6's ground).
- **Rejected in direction:** record the verdict in `docs/PROGRAM_STATUS.md`, keep the pure
  parts (`geometry.ts`, the i18n shard, the tests that survive) and rebuild the rendering to the
  verdict — inside stage 6, where dossier 14's chrome is built anyway.
- **No verdict yet:** do not integrate; start stage 6's non-visual work (the personal
  `combat/state` cutover under the migration protocol, the projections that build entities with
  `reveal.token: true`, the encounter subscription wiring) and keep the surface on its branch.

What the surface deliberately does NOT have (stage 6's, per the design addendum §8): the tool
rail and sub-toolbars, the grid panel, the token pill, the DM drawer, portraits on tokens (initials
today), token footprints (every token is one cell), and any styling of the harness strip.

## Seams stage 5 left open that stage 6 must consider

- **`reveal.token` has no production default yet.** No `src/` code constructs an `Entity` (only
  the test helpers do); stage 6's PC and monster projections MUST set `reveal: { …, token: true }`
  or every token starts hidden. The codec requires the field.
- **Deletion of map backgrounds is the surface's.** The reducer never deletes Storage objects: a
  `map: null`, a replacement or an `undo` of a `map` op leaves the object in place;
  `deleteMapBackground` exists for the surface that clears a background, and an undo after a
  delete yields a dead URL (`src/lib/map-io.ts` header).
- **The quota is check-then-act** (two racing uploads can overshoot by one file) and a client
  courtesy; the £1 kill-switch is the backstop.
- **Bounded `rolls` in the checkpoint** — still deferred (stage 4 residual): the safe pruning
  is known (at compaction, drop every roll whose spender is not a still-open `declared`
  intent); it belongs with stage 6's compaction wiring. The map's measured cost (~270 nodes for
  a realistic table) does not force it.
- **`checkpointThrough`'s single-client liveness cliff** and the other stage-4 minors listed in
  PROGRAM_STATUS → stage 5 → "Deferred" stay open.
- **`FEET_PER_CELL` is fixed at 5 ft, chessboard only, no token footprint** — the grid panel of
  rule 34 shows "1,5 m · casella" read-only; a per-map scale is additive when a consumer asks.
- **The personal `combat/state` is still `CombatState`** — its cutover to the personal
  `Encounter` is stage 6's, under the snapshot → dry-run → idempotent apply → verify protocol;
  `personalEncounterRef` aliases a LIVE document and `leaveTable`'s `personal: null` must never
  be passed for a document that merely failed to parse.
- **The old campaign hub's encounter writers** are rule-denied and still present; they die at
  stage 6 with the surfaces that host them. Do not build on them.

## Staging

`firestore.rules` did not change in stage 5 (nothing to deploy there). `storage.rules` did, and
the staging project has NO Storage bucket: `gcloud storage buckets list --project
d20-folio-staging` lists none and billing is not enabled — Firebase Storage default buckets on
projects created after October 2024 need the Blaze plan (free within the no-cost quota). Linking
a billing account is the owner's action (console; a £1 budget alert like production); until then
the map plays on the emulator (`pnpm dev:emulators`). Staging deploys are owner-permitted for
staging only (2026-09-04, "puoi farlo quando vuoi"); production is never touched. Once the bucket
exists: `firebase deploy --only storage -P staging`.

## Owner confirmations to honour

- **Admin-supreme** — built in stage 4, extended to the Storage map path in stage 5 (admin =
  DM-level under `campaigns/{id}/maps/*`). Do not regress it.
- **Out-of-combat mechanical freedom** — still open; needs its own design pass before item 8.
  Stage 5 neither answered nor foreclosed it.

## Rules that bind you

Superpowers lifecycle (brainstorm briefly → written plan → worktree → TDD → review → verify).
Small Conventional Commits, owner sole author, one `.changeset/*.md` per commit, owning document
reconciled in the same commit; never `--no-verify`. No deploy to production, no release, no push
to `main`. No end-to-end spec on `v2`; the gate (`just ci`, `pnpm test:rules`, `pnpm build &&
pnpm test:budget`, `just ci-srd-only` when a public module changes) stays under 15 minutes — the
numbers at the close of stage 5 are in `docs/PROGRAM_STATUS.md`. Every screen goes through the
owner's screenshot approval gate (rule 25) before integration: curated captures across the
affected theme, locale and viewport matrix, delivered as actual chat images. Ask the owner only
about taste, product or cost, with an example and a recommended option. When you finish: rewrite
this handoff file for the session after yours, and paste its prompt block in full as the last
message of the chat.
