# Next-session handoff — `v2`, stage 4 (the shared encounter document)

Paste the block below as the first message of the next session. It is self-contained; everything it
references is on the `v2` branch in the worktree named below, whose tip is the stage-3 close commit
(`git log --oneline -1`). `origin/v2` was last pushed at `acc01e2` (the stage-2 close); push the
stage-3 commits and verify with `git ls-remote origin refs/heads/v2` before relying on the remote.

---

You are continuing the new d20 Folio app on the long-lived branch `v2` (worktree
`.claude/worktrees/d20-folio-combat-arch-db1941`; check `git branch --show-current` — this
worktree can end up detached at `v2`'s tip after a push, so re-point it with
`git branch -f v2 HEAD && git switch v2` if so; push `HEAD:refs/heads/v2` and verify with
`git ls-remote origin refs/heads/v2`). The private content pack has its own `v2` branch: worktree
`/Users/salvatoredicara/Workspace/d20-folio-content-v2`, and this worktree's `content-pack`
symlink points at it (rule 28: both `v2` branches move in the same motion; push the pack with
`git -C /Users/salvatoredicara/Workspace/d20-folio-content-v2 push origin v2` — stage 3 touched
nothing pack-related, so nothing is pending there). `main` is production and is never touched.
Speak Italian with the owner; everything in the repository is English.

## Read first, in this order

1. `PRODUCT.md` §Steering (golden rules 30–32), `CLAUDE.md` (the Direction block).
2. `docs/superpowers/plans/2026-09-03-new-app-stage-1.md` — stages U, 0, 1, 2 and 3 are closed; you
   execute **stage 4, the shared encounter document** (item 4): `campaigns/{id}/encounters/{eid}`
   as an append-only log, one listener per client, and `firestore.rules` reduced to identity,
   membership, ownership and shape for that collection.
3. `docs/superpowers/specs/2026-09-02-total-combat-automation-design.md` §5 — this is stage 4's
   actual scope, and all four subsections matter:
   - **§5.1 Documents and owners** — the full path/owner/reader matrix. `campaigns/{id}/encounters/{eid}`
     is written by **any member** (append to `log`, `arrayUnion` only) and by DM/admin (checkpoint,
     settings, delete); read by members and admin. `campaigns/{id}` itself carries identity,
     settings, treasury, `members[]` and `memberDetails[uid]` = `{ displayName, photoURL,
characterId }`. The personal aggregate stays at `users/{uid}/characters/{id}/combat/state`.
     The list of **deleted** fields is part of the spec: `memberDetails[uid].character`, `.role`,
     the embedded `encounter`, `encounterInit`, `encounterSkipped`, `memberEffects`, `effectOps`,
     `world`, `playStateVersion`, `session.world`, `ref.charges`, item-id session trackers, the
     `snapshots` shape laxity, and every peer-write path into another user's subtree. The DM's
     party stats come from live reads, never a cache; during an encounter one listener replaces N.
   - **§5.2 The lease** — solo and shared use one schema. A PC joins by a `table:join` action
     appended by its own owner's client, carrying the entity projected from the personal aggregate;
     that client also sets `attached: { campaignId, encounterId, epoch }` on the character doc.
     While attached the campaign encounter owns the PC's combat facts. `table:leave`, `table:end`
     or an observed end makes the owner's client fold, write back as `table:sync`, and clear
     `attached`. Nobody else ever writes the owner's documents; a DM acting on an offline PC
     appends to the encounter log and the PC's owner folds it on reconnect.
   - **§5.3 Write mechanics and cost** — appending is `updateDoc(encounterRef, { log:
arrayUnion(action) })`: commutative, offline-queueable, latency-compensated, one write per
     action, one listener per client. Compaction at `log.length > 200` or 512 KiB: append a
     `checkpoint`, then the DM's client rewrites the document truncated to actions after it, under
     a precondition on the previous checkpoint seq. The personal aggregate keeps the same shape with
     a single writer; the parent build write keeps its debounce and gains a `revision` precondition.
   - **§5.4 Authorization model** — the actors are **owner**, **member**, **DM** (`dmUid`), **admin**
     (`users/{uid}.role`) and **anonymous reader**; "controller" is a data fact inside the encounter,
     not a role, and a spectator is a member without an attached character. Rules enforce identity,
     membership, ownership and shape; the reducer enforces game legality; the table enforces manners
     (attributed log + undo). The owner's stated threat model (2026-09-02) is that a malicious member
     can append any well-formed action to an encounter they belong to — the fold trusts it, the
     receipt names them, anyone can undo it, the DM can remove them — and that is what keeps the
     rules at ≈150 lines. Read the list of predicates that must **disappear** (`coreConditions`,
     `validPeerEffectState`, `validMember*`, `validCombatEffectOpsChange`, `turnFieldsOnlyChanged`,
     `combatEffectFieldsOnlyChanged`, `encounterInit*`, `isAttachedPeer`, `peer*`,
     `playStateVersion*`) before touching `firestore.rules`.
4. `docs/adr/0010-dice-seam-rolls-are-log-actions.md` and
   `docs/adr/0011-campaign-automation-levels.md` — the two accepted decisions the shared document
   has to carry across clients (roll provenance and hidden rolls; the automation level as a
   campaign setting).
5. `docs/PROGRAM_STATUS.md` → "`v2` — stage 3" for what the reducer now does, the rulings taken
   during its execution, the deferred minors, and the gate numbers to beat.
6. `docs/superpowers/plans/2026-09-03-v2-stage-3-reducer.md` and the two golden replays
   (`tests/unit/combat/replays/marco-first-turn.json`, `sara-ogre-ambush.json`) — they are the
   fixtures stage 4 has to make pass through two clients on the emulator.

## Stage 4 — the shared encounter document

Stage 3 closed the pure reducer: both story replays pass against it in-memory. Stage 4 puts that
log in Firestore and makes two clients fold the same one. Concretely: the append/subscribe/
checkpoint adapter (the deleted `src/lib/combat-io.ts` was explicitly left for this stage — module
fates in `2026-09-03-v2-architecture-reset.md`), the `campaigns/{id}/encounters/{eid}` document and
its codec (§5.5 totality rules apply: one `exact-schema`, unknown top-level keys preserved), the
lease actions (`table:join`, `table:leave`, `table:sync`, `table:end`), compaction, and the reduced
`firestore.rules` with `pnpm test:rules` proving them.

**Open with the `intent.ts` split, before any stage-4 code lands on top of it.** That file is now
~1,200 lines and is the meeting point of payment, lifetimes, AC derivation, damage delivery, answer
reading, area binding, the step runner, concentration, the automation gate, repositioning,
overrides and checks — every new capability touches it. Split it into `answers.ts`, `override.ts`
and `reposition.ts` (behaviour-preserving, the existing tests are the proof) as task one; the
stage-4 adapter then has somewhere to attach.

The stage-1 plan's gate for stages 1–4 is the bar: **both golden replays pass on the emulator with
two clients (DM and player) folding the same log; an override and an undo from each side.** Stage 3
met only the pure-reducer half of it.

### Seams stage 3 left open that stage 4 must decide

- **Per-target save-roll attribution.** `rollsUsable` binds a roll to the intent's entity, so a
  target's save rolled inside a caster's intent is logged with `roller: null`. In a shared document
  that is a real question: does the target's own client roll and append it, or does the caster's
  intent carry it? Decide it here, because the answer changes the action shape.
- **Who may read a hidden roll's faces.** Hidden rolls are stored, not suppressed
  (Sara's replay asserts `rolls.r-ogre-atk.hidden: true`). Design §1 says a hidden roll shows its
  faces only to the DM and to the roller — in a shared document readable by every member, that is
  either a rules-level read restriction (a subdocument), or a client-side convention, or the faces
  are not stored in the shared log at all. This must be decided, not inherited.
- **`log-only` withholds `move`** and every reaction window opened inside a withheld run, so a
  `log-only` table cannot move tokens through the reducer until position becomes a direct-patch
  override path. That is a stage-6 concern, but stage 4 should not design around the current
  behaviour as if it were permanent.
- **At `log-only`, nothing about a declaration commits.** The final branch review reversed the
  earlier ruling here: a held attack at `log-only` now leaves no window, no `declared` entry, no
  ordinal and no payment — only the receipt reports what would have happened. A declaration is the
  first half of an outcome, so it is withheld whole; otherwise a switch back to `full-auto` would
  resolve an unpaid window into a paid outcome, and the reaction the window invites would itself be
  withheld. In a shared document this matters twice over: the other clients see the same log and
  must reach the same conclusion about whether a window exists.
- **An `override` emits no `CombatEvent`**, so a DM-inflicted death fires no `hp-zero` subscriber,
  ends no concentration and clears no marks — unlike the identical outcome reached through damage.
  Stage 4 puts overrides in front of other people's clients; decide there whether that asymmetry
  survives.

## Owner confirmations to honour in this stage (verbatim from `docs/PROGRAM_STATUS.md`, 2026-09-03)

- **Admin-supreme account.** Owner (2026-09-03): wants everything a DM can do to extend to his own
  account, since — at least at first — he has to guide the actual DM the way he already does
  today. The design doc already has the actor (§5.1, §5.4): `users/{uid}.role === "admin"` gets
  owner-level access on every user path (`users/{uid}`, `characters/{id}`, `combat/state`) and
  DM-level rights on an encounter's checkpoint and settings. What it does not say is that an admin
  may append actions to a campaign encounter they are not a member of (encounter `update` =
  member and the log grew). Stage 4, which writes those rules, decides between "admin is an
  implicit member of every campaign" and "the owner's account is added as a member of his group's
  campaign" — the second is smaller and matches how he plays today — and sets the owner's `role`
  to `admin`.
- **Out-of-combat mechanical freedom.** Owner (2026-09-03): players need the same freedom D&D
  2024 actually gives them — casting spells and doing other mechanically-resolved things outside
  a formal combat encounter, not only inside one. The reducer is already entity-generic and not
  combat-specific by construction (ADR-0001; `Encounter.host: {kind: "personal"} | {kind:
"campaign"}`), so this needs no re-architecture — it needs mechanics authored against the same
  seams for non-combat use, plus confirming whether the personal `Encounter` aggregate is meant to
  be usable independent of any campaign lease (open question, not yet verified against §5.2). The
  current design's `later`-tiered "narrative clauses, no mechanical consequence to compute" (§7
  residuals) describes illusions/social effects, not a player's mechanically resolved spellcast
  outside initiative — that distinction needs its own design pass before item 8 ("the rest of the
  session") in the stage-1 plan.

The admin-supreme decision activates **exactly here** — this is the stage that writes the access
matrix and `firestore.rules`. Do not let it pass unresolved.

## Rules that bind you

Superpowers lifecycle (brainstorm briefly → written plan → worktree → TDD → review → verify).
Small Conventional Commits, owner sole author, one `.changeset/*.md` per commit, owning document
reconciled in the same commit; never `--no-verify`. No deploy, no release, no push to `main`. No
end-to-end spec on `v2`; the gate (`just ci`, `pnpm test:rules`, `vite build && pnpm test:budget`,
`just ci-srd-only` when a public module changes) stays under 15 minutes — the numbers at the close
of stage 3 are in `docs/PROGRAM_STATUS.md` → "Gates on `v2` at the close". Stage 4 changes
`firestore.rules`, so `pnpm test:rules` is mandatory, not conditional. Any screen goes through the
screenshot gate (rule 25) — stage 4 has no screen either. Ask the owner only about taste, product
or cost, with an example and a recommended option. When you finish: rewrite this handoff file for
the session after yours, and paste its prompt block in full as the last message of the chat, so the
owner can archive the chat and start the next one by pasting it (the owner never keeps sessions
open).
