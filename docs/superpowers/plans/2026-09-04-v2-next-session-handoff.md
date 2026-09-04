# Next-session handoff — `v2`, stage 5 (the minimum map)

Paste the block below as the first message of the next session. It is self-contained; everything it
references is on `origin/v2`, pushed at the stage-4 close on 2026-09-04 (the tip is the commit that
carries this file: `git log --oneline -1`; confirm the remote matches it with
`git ls-remote origin refs/heads/v2` before relying on it).

---

You are continuing the new d20 Folio app on the long-lived branch `v2` (worktree
`.claude/worktrees/d20-folio-combat-arch-db1941`; check `git branch --show-current` — this
worktree can end up detached at `v2`'s tip after a push, so re-point it with
`git branch -f v2 HEAD && git switch v2` if so; push `HEAD:refs/heads/v2` and verify with
`git ls-remote origin refs/heads/v2`). The private content pack has its own `v2` branch: worktree
`/Users/salvatoredicara/Workspace/d20-folio-content-v2`, and this worktree's `content-pack`
symlink points at it (rule 28: both `v2` branches move in the same motion; push the pack with
`git -C /Users/salvatoredicara/Workspace/d20-folio-content-v2 push origin v2` — stage 4 touched
nothing pack-related, so nothing is pending there). `main` is production and is never touched.
Speak Italian with the owner; everything in the repository is English.

## Read first, in this order

1. `PRODUCT.md` §Steering (golden rules 30–32), `CLAUDE.md` (the Direction block).
2. `docs/superpowers/plans/2026-09-03-new-app-stage-1.md` — stages U, 0, 1, 2, 3 and 4 are closed;
   you execute **stage 5, the minimum map** (item 5): background upload (compressed, per-campaign
   quota), square grid with scale, tokens bound to entity ids, drag with a Foundry-style ruler,
   rectangle fog, hidden tokens. **No scenes, no layers, no drawing, no pointer, no walls, no
   vision, no lighting.** Read its "Staging setup" section too — including the Storage caveat
   under "Staging status": Firebase Storage default buckets on projects created after October 2024
   require the Blaze plan (free within quota, but a billing account must be linked). Production is
   on Blaze; staging is not, and linking it needs the owner's yes.
3. `docs/superpowers/specs/2026-09-02-total-combat-automation-design.md` — the map paragraphs:
   - **§1, "The map is part of the table"** — the app owns positions, distances, areas and simple
     fog on an Owlbear-level map, derives reach, range bands and area membership from them
     (provenance `derived`), and keeps declared relational facts (`declared`) for cover, most
     visibility, elevation and map-less play. Walls, dynamic vision and lighting are out of scope.
     That sentence is the whole scope boundary of this stage; do not widen it.
   - **§2.3 Relations** — the seven declared tactical facts (`adjacent`, `range`, `visible`,
     `cover`, `engaged`, `aura-member`, `mark`). The map does not replace them: it derives some of
     them and leaves the rest declared.
   - **§5** — the shared document the map's facts will have to live in or beside (see the design
     question below).
4. `docs/superpowers/specs/2026-09-03-v2-stage-2-positions-areas-design.md` — stage 2's design:
   `position` on entities, Chebyshev distance, the four-band range ladder, area membership for the
   five SRD shapes. The map is the surface over exactly this data; the geometry already exists and
   must not be re-derived in a view layer.
5. `docs/PROGRAM_STATUS.md` → "`v2` — stage 4" — what the shared document now does, the rulings
   taken during its execution, the deferred minors, the gate numbers to beat, and the "Out of
   stage 4" list (several of its items are stage 5's context).

## Stage 5 — the minimum map

Stage 4 closed the shared encounter document: two authenticated clients append to
`campaigns/{id}/encounters/{eid}` and fold it to the same state, with a codec, compaction and
`firestore.rules` reduced to identity, membership, ownership and shape. Stage 5 gives the table
something to look at: a background image, a square grid with a scale, tokens bound to entity ids,
drag with a Foundry-style ruler, rectangle fog, and hidden tokens.

### The first design question: where the map's data lives

Decide this before writing code, and record the decision in the plan. **Does the map live on the
campaign encounter document, or on a sibling document?** The evidence to weigh:

- **The encounter document's budget.** A Firestore document is capped at 1 MiB. Compaction already
  fires at 200 actions or 512 KiB (`src/lib/combat/checkpoint.ts`), the rules cap the stored log at
  1,000 entries, and the codec quarantines any document past `exact-schema`'s 50,000-node budget
  counted over the log and the checkpoint together (`src/lib/combat/codec.ts`).
  Fog rectangles and token positions expressed as `declare` / `move` actions consume that same
  budget, and unlike combat actions they are produced by dragging, which is a high-frequency
  gesture.
- **Against that: one document is one listener and one fold.** Positions are already
  `Entity.position` inside the folded state, and a `move` action is already how a position changes.
  Fog as a `declare`d fact would inherit undo, attribution and the two-client determinism proof for
  free. A sibling map document would need its own codec, its own rules, its own listener and its own
  answer to "what does undo mean here".
- **A middle option exists** and should be considered explicitly: the _ephemeral_ part of dragging
  (the in-flight ruler, the cursor) is not persisted at all, and only the committed destination is
  an action — which is how the reducer already works. The question is then only about fog and the
  background reference.
- **The background image goes to Firebase Storage**, not Firestore, with a per-campaign quota and
  client-side compression before upload. That is a new seam (`storage.rules` exists; see
  `tests/rules/storage-rules` in the rules lane) and it is the one part of this stage that needs
  the staging Blaze caveat above resolved before anyone can play on staging.

Bring the owner a recommendation with the trade-off in one paragraph, not the question raw.

### Seams stage 4 left open that stage 5 must consider

- **`log-only` withholds `move` whole.** At the `log-only` automation level the reducer computes
  the verdict and withholds the transition, `move` included — so a `log-only` table cannot move a
  token through the reducer at all. Position becomes a direct-patch override path (the way
  `vitals.hp` already is) at stage 6. A map built as if `move` always applies will be wrong for
  half the automation levels; design for both from the start.
- **No concurrent-append test exists.** The hybrid `seq` clock orders two clients' appends
  deterministically by construction, but nothing contends for the document in a test. Dragging two
  tokens at once is exactly the gesture that produces a same-round-trip race, so a contended-append
  case in the rules lane (`tests/rules/`) is a cheap, well-placed addition for this stage.
- **The personal `combat/state` is still `CombatState`, not an `Encounter`.** The cutover of
  `users/{uid}/characters/{id}/combat/state` to the personal `Encounter` aggregate belongs to
  stage 6, together with the old cockpit that reads it, under the snapshot → dry-run → idempotent
  apply → verify protocol. Stage 5 must not start it as a side effect of needing positions.
- **`personalEncounterRef` aliases a LIVE document, and `personal: null` means "it does not
  exist".** `users/{uid}/characters/{id}/combat/state` is the `CombatState` today's cockpit owns,
  so a read that fails to parse has found a legacy document, never a missing one — a caller must
  never pass `null` for it to `leaveTable`, which would `set` an `Encounter` over a live play
  session; that conversion is the stage-6 cutover under the migration protocol.
- **The old campaign hub's encounter writers are rule-denied and still present.** They die at
  stage 6 with the surfaces that host them. Do not repair them; do not build the map on top of
  them.
- **`memberDetails[uid].character` and `.role` are still in live data.** The spec deletes them and
  the rules no longer let them be written, but existing campaign documents carry them; they are
  cleared by `v2`'s first release migration at stage 8, not now.
- **The §8 codec round-trip PROPERTY test is still unwritten.** The codec has example-based
  round-trips only. If stage 5 adds a persisted map shape, it inherits that gap — write the
  property test for whatever new codec it introduces rather than repeating the omission.
- **`FoldedState.rolls` is unbounded.** It is never pruned, so a checkpoint's folded state grows
  by roughly 11 nodes per accepted roll; the codec's 1,000-entry rules cap on the stored log
  assumes a small checkpoint (1,000 realistic intents plus a populated checkpoint measures near
  34,200 of the 50,000-node budget today). A bounded-`rolls` decision belongs here or at stage 6,
  before a heavier map or automation payload pushes a real table over the budget.
- **`checkpointThrough` has a single-client liveness cliff.** With `nowMs` far behind every stamp
  already in the log, it returns `null` on that one client until its own clock catches up — any
  correctly-clocked peer still compacts, but the wiring stage 5/6 adds must not make a single
  client the only one that can.

## Owner confirmations to honour

- **Admin-supreme — decided and built in stage 4.** `users/{uid}.role == "admin"` carries DM-level
  rights on every encounter document and owner-level rights on every user path except
  `characters/{id}/public/sheet`; membership stays explicit (the owner's account is a member of his
  group's campaign). Nothing to decide; just do not regress it — any new map path gets the same
  admin treatment. See `docs/adr/0005-rules-enforce-access-not-gameplay.md` (2026-09-04 amendment).
- **Out-of-combat mechanical freedom — still open.** Owner (2026-09-03): players need the same
  freedom D&D 2024 actually gives them — casting spells and doing other mechanically-resolved
  things outside a formal combat encounter, not only inside one. The reducer is already
  entity-generic (ADR-0001; `Encounter.host: {kind:"personal"} | {kind:"campaign"}`), so this needs
  no re-architecture — it needs mechanics authored against the same seams for non-combat use, plus
  confirming whether the personal `Encounter` aggregate is meant to be usable independent of any
  campaign lease (§5.2). It needs its own design pass before item 8 of the stage-1 plan. Stage 5
  does not answer it and must not foreclose it.

## Rules that bind you

Superpowers lifecycle (brainstorm briefly → written plan → worktree → TDD → review → verify).
Small Conventional Commits, owner sole author, one `.changeset/*.md` per commit, owning document
reconciled in the same commit; never `--no-verify`. No deploy, no release, no push to `main`. No
end-to-end spec on `v2`; the gate (`just ci`, `pnpm test:rules`, `pnpm build && pnpm test:budget`,
`just ci-srd-only` when a public module changes) stays under 15 minutes — the numbers at the close
of stage 4 are in `docs/PROGRAM_STATUS.md` → "`v2` — stage 4" → "Gates on `v2` at the close". If
stage 5 changes `firestore.rules` or `storage.rules` — the background upload almost certainly does
— `pnpm test:rules` is mandatory, not conditional.

**Stage 5 has no screen either, unless the map surface itself is what you build.** If any screen is
built, it goes through the owner's screenshot approval gate (rule 25) before integration: curated
before/after captures across the affected theme, locale and viewport matrix, delivered as actual
chat images, never as local file paths. Do not integrate a visual change on your own judgement.

**The staging deploy of rules and indexes is owner-gated** (`firebase deploy --only
firestore,storage -P staging`) and is recommended before anyone plays on staging — stage 4's rules
have not been deployed anywhere. Ask for it; never run it unasked.

Ask the owner only about taste, product or cost, with an example and a recommended option. When you
finish: rewrite this handoff file for the session after yours, and paste its prompt block in full
as the last message of the chat, so the owner can archive the chat and start the next one by
pasting it (the owner never keeps sessions open).
