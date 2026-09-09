# Worktrees

Every change gets its own worktree (golden rule 11). There is no PR flow: a task converges, is
reviewed, passes its gates, and is pushed to its destination branch from the worktree itself.

The destination decides the procedure. `v2` is the new application and takes the five steps below;
`main` is the production app and takes the ten-line adapter at the end. Never send v2 work to
`main`, and never edit in another task's checkout or in a long-lived checkout.

## The v2 procedure

Identical for Claude Code and Codex; nothing in it depends on a harness.

1. **Establish the base.** Read `CLAUDE.md`, `docs/program/NEXT.md` and the block's row in
   `docs/program/PROGRAM.md`. Run `git fetch origin main v2`, then prove the invoking checkout is
   clean and its HEAD equals fresh `origin/v2`. Record the physical path, the refs and the
   destination before creating anything. `git worktree list` shows what already exists; refuse a
   slug whose branch or path is taken.

2. **Create the worktree.** From that verified invoker, one line:

   ```sh
   git worktree add -b task/<slug> ~/Workspace/Codex/d20-folio-<slug> origin/v2
   ```

   The branch prefix is `task/` — harness-neutral, one branch per task. Then run
   `scripts/worktree/bootstrap-worktree.sh` inside the new directory: it verifies the pinned
   toolchain (Node 24.16.0, pnpm 11.2.2), installs the root and standalone `functions/`
   dependencies, and sets `core.hooksPath=.githooks`. Point `TMPDIR` at a task-owned path under
   `~/Workspace/Codex`. Copy `.env.local` from the invoker if the task needs `pnpm dev`.

3. **Compose and place the evidence.** Link the v2 private pack twin read-only so the gate runs
   composed:

   ```sh
   ln -s ~/Workspace/d20-folio-content-v2/content-pack ~/Workspace/Codex/d20-folio-<slug>/content-pack
   ```

   The link is for verification, never authority to edit private files, and no production
   credential is ever copied into a preview — use synthetic DEV profiles or an authorized staging
   fixture environment. Task evidence (screenshots, logs, receipts) lives outside the repository in
   `~/Workspace/Codex/d20-folio-<slug>-evidence` until integration, then moves to the archive under
   `~/Workspace/Codex/archive-<date>/`. Only the manifest and curated screenshots enter the
   repository, under `docs/program/reference/`.

4. **Do the work.** TDD, small Conventional Commits with one staged `.changeset/*.md` each, and the
   document that owns every changed fact reconciled in the same commit. Reconcile
   `docs/PROGRAM_STATUS.md` when the frontier, a gate or an integration SHA moves. Then review
   (Superpowers requesting/receiving code review, plus ponytail-review on a risky diff) and verify
   against the real running application, not against jsdom.

5. **Integrate.** Fetch and rebase on fresh `origin/v2`, re-run the affected gates — `just ci`, plus
   `just ci-srd-only` when the licensing seam moved and `pnpm test:rules` for rules changes — and
   deliver curated runtime screenshots as chat images. Then:

   ```sh
   git push origin HEAD:v2          # explicit refspec, never a bare push
   git ls-remote origin v2          # poll until it shows your SHA
   git worktree remove ~/Workspace/Codex/d20-folio-<slug>
   git branch -d task/<slug>
   ```

   Remove only the task's own clean worktree, and only after the remote SHA is proven — removing
   early orphans an in-flight push. Never remove the long-lived `v2` or production checkout.
   Integration authorizes no deployment, staging deploy, real-data migration or new cost.

## Production fixes on `main`

```sh
just wt-new <slug> [kind]      # kind ∈ feat|fix|chore|docs|refactor; branches off fresh origin/main
cd ~/Workspace/Codex/d20-folio-<slug>
# work; commit per coherent step with its changeset; never --no-verify
git fetch origin main && git rebase origin/main
git push origin HEAD:main      # the main pre-push hook runs the authoritative gate
git ls-remote origin main      # poll until it shows your SHA
just wt-rm <slug> && git branch -d <kind>/<slug>   # from a clean worktree at fresh origin/main
```

`wt-new` and `wt-rm` hardcode `origin/main`, so they are production-fix tools only. They refuse a
dirty or stale invoker; run them from a clean worktree whose HEAD has just been proven equal to
fresh `origin/main`, never from the shared checkout. Every visual change on `main` still needs the
owner's screenshot approval before integration (golden rule 25).

## Editing the private content pack

The public repository and the private pack are one product (golden rule 28). A pack edit uses its
own private worktree created from freshly fetched private `origin/main`, plus a paired public
verifier whose `content-pack` link points at that exact private directory; the shared private
checkout stays read-only. Before either push, write a short two-repository charter recording both
bases, both branches, the absolute worktrees, the exact link target, which old/new pairs must stay
compatible, the push order and why each intermediate pair is valid, both candidate SHAs, and a
rollback order that restores a compatible pair without force-pushing. Run the owned focused tests in
both repositories, `just ci` against that exact pair, and `just ci-srd-only` with the pack absent.
Prefer a compatibility bridge that makes either order safe; if no intermediate pair is valid, stop —
two remotes cannot push atomically. Verify each remote SHA before the next push. Private material
never enters public history or public recovery.

## Retiring a worktree that is not clean

List the registered worktrees first. A dirty or locked worktree stays in place until either its HEAD
is remotely integrated and its tracked, staged and untracked state is empty or byte-equivalent to
that integrated evidence, or a verified recovery capsule exists outside synchronized storage: a
complete Git bundle for the exact ref, `git diff --binary --output` for tracked changes, an archive
of exactly `git ls-files --others --exclude-standard`, a manifest with source SHA and disposition,
and SHA-256 checksums — restored into a separate probe and compared against the original status,
diffs, inventory and checksums before removal. Force removal is never advertised as cleanup. If
equivalence or capsule verification cannot be proved, record the blocker and keep the worktree.
