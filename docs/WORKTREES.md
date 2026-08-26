# Parallel work — worktrees, branches off `main`, agent merges

> **The repo standard for every change** (golden rule 11, `docs/GOLDEN_RULES.md`). Each task gets
> its own **git worktree** + **branch off the freshest `origin/main`**; when it converges, the
> agent **merges it to `main` autonomously** and tears the worktree down. There are **no pull
> requests** — one owner + agents, nobody reviews PRs. The opening review route is an independent
> specification-compliance and correctness review. Ponytail is an optional complexity pass after
> correctness, never the primary review or a substitute for it (golden rule 12). `main` is the
> integration line, NOT production; the owner's only gate is deploy (golden rule 22).

## Why

- **Isolation.** Each worktree is a real working directory on its own branch with its own
  `node_modules`/`dist`/dev server — a `pnpm dev` or long build in one task never disturbs
  another, and no half-staged files bleed between tasks. The shared main checkout stays on `main`,
  untouched, for every concurrent agent (never edit/commit/switch branches there — golden
  rule 11).
- **Parallelism.** Independent tasks advance simultaneously; conflicts are reconciled once, at
  merge time, by rebasing onto the latest `origin/main`.

## The flow

```sh
# 1. Spawn a worktree + branch off the latest main. Installs deps + hooks, copies .env.local.
just wt-new <slug> [kind]          # kind defaults to "feat" → branch <kind>/<slug>
#   e.g.  just wt-new ui-polish            → ~/Workspace/Codex/d20-folio-ui-polish on feat/ui-polish
#         just wt-new wave2-data chore     → ~/Workspace/Codex/d20-folio-wave2-data on chore/wave2-data

# 2. Work in the new directory; commit per coherent step (hooks gate every commit/push).
cd ~/Workspace/Codex/d20-folio-<slug>
git add -A && git commit -m "feat(scope): …"        # never --no-verify; owner = sole author,
                                                    # NO co-author/trailer lines

# 3. Review: use Superpowers correctness/requirements review; add ponytail-review when the
#    diff carries meaningful complexity risk. Address or reason about actionable findings,
#    then verify the final tree (golden rule 12).

# 4. Merge to main FROM the worktree (never touch the shared checkout):
git fetch origin main
git rebase origin/main                              # re-run the gate if the rebase changed anything
git push origin HEAD:main                           # the ff-merge; non-ff rejection ⇒ re-rebase, retry

# 5. Confirm the SHA landed, THEN tear down (removing early orphans an in-flight push):
git ls-remote origin main                           # poll until it shows your SHA
# Leave the task worktree. Do not invoke the stale shared checkout's recipe.
cd ~/Workspace/Codex/d20-folio-program-control       # or another clean worktree at fresh origin/main
just wt-rm <slug>
git branch -d <kind>/<slug>

# At any time: see everything in flight.
just wt-list
```

## Conventions

- **Directory:** `~/Workspace/Codex/<project>-<slug>` (for this repository,
  `~/Workspace/Codex/d20-folio-<slug>`). The main worktree (`~/Workspace/d20-folio`)
  **always stays on `main`**. The logical task root must resolve to its stable physical path and
  must never be inside Documents, iCloud, Dropbox, OneDrive, or another synchronized directory.
- **Branch:** `<kind>/<slug>` — `kind` ∈ `feat` (default) · `fix` · `chore` · `docs` · `refactor`.
  Branch **off `origin/main`**, never off another task branch. A topic branch may be pushed as an
  occasional recoverable milestone (`git push -u origin HEAD:<branch>`); its pre-push is instant.
  Never run a bare mid-task `git push`: a new worktree initially tracks `origin/main`, so a bare
  push can target `main`. The final integration remains `git push origin HEAD:main`, which runs the
  authoritative full gate.
- **Agent fan-out:** each delegated track gets its OWN worktree (`isolation: "worktree"` for
  `Agent`/`agent()`), never the shared tree. When two tasks run together, split ownership along
  the data↔UI seam (below) so merges stay cheap.
- **Pinned bootstrap:** `wt-new` runs `scripts/program-supervisor/bootstrap-worktree.sh` in the
  new worktree. It resolves and verifies Node `24.16.0` plus pnpm `11.2.2`, then installs both the
  root and standalone `functions/` dependency trees and sets `core.hooksPath=.githooks`. The
  `--run` mode executes resolver and verification commands under that same pinned runtime.
- **`.env.local`** is copied into each worktree by `wt-new` so `pnpm dev` works; it is git-ignored
  and never committed.
- **The `content-pack` symlink is created automatically — composed-by-default and read-only.** When the
  maintainer's private pack is available, `wt-new` resolves its absolute physical target before
  linking it into the new worktree, so its final `main` pre-push gate runs in **COMPOSED (pack-present) mode** and pack-side breakage — a
  public API change that breaks a pack test — is caught before merge. When no pack sibling exists
  (external contributors), the link is skipped silently and the worktree gates in **SRD-only mode**,
  which is the correct and complete build for a public tree (`docs/CONTRIBUTING.md` → "The two build
  modes"). `wt-new` echoes which mode it set up. The shared private `main` checkout is read-only;
  the automatic link is safe for verification, never authority to edit private files. The
  belt-and-suspenders check in `.githooks/pre-push` warns loudly if a worktree gates SRD-only while
  the pack actually exists. Private edits follow the paired-worktree protocol below.
- **Committed tooling comes with every worktree.** Tracked files include the committed skills
  (`.claude/skills/` — e.g. the official
  [pbakaus/impeccable](https://github.com/pbakaus/impeccable) design skill, which reads root
  `PRODUCT.md` + `DESIGN.md`; `DESIGN.md` §15 is the project checklist), so every worktree and
  agent session has them with no install step.
- **Hooks are shared.** `core.hooksPath=.githooks` lives in the common git config, so every
  worktree runs the same ref-aware pre-commit/pre-push hooks. **Never `--no-verify`.**
- **Program Supervisor boundary:** `just wt-new` and `just wt-rm` are manual, same-thread adapters
  for `d20-folio-program-control` (or a worktree whose HEAD has just been proved equal to fresh
  `origin/main`). They reject the shared checkout before running the local bootstrap or resolver,
  fetch `origin/main` in preflight, and reject a dirty or stale non-control invoker. Pushing this
  change does not update the shared checkout: its stale worktree recipe must never be invoked.

## Editing the private content pack

Every private edit uses a dedicated private worktree and a paired public verifier. Never edit the
shared private `main` checkout through a public worktree's `content-pack` link.

Before either edit, write one two-repository charter that records:

- the public and private repositories, fresh public base and private base, branches, absolute
  worktrees, owned paths, expected heads, and the verifier's exact absolute `content-pack` target;
- the compatibility contract across both bases, including which old/new public and private pairs
  must remain valid;
- the explicit push order and why every intermediate public/private pairing remains compatible;
- both pre-push SHAs and a rollback order that restores a compatible pair without force-pushing;
- separate recovery locations and a prohibition on placing private source, diffs, bundles, archives,
  paths, or receipts containing private material in public recovery or public Git history.

Create the dedicated private worktree from freshly fetched private `origin/main`; keep the shared
private checkout read-only. Create the paired public verifier from fresh public `origin/main`, then
link its `content-pack` to the dedicated private worktree's exact physical pack directory. Run the
owned focused tests in both repositories, the composed `just ci` gate against that exact pair, and
the public `just ci-srd-only` gate with the pack absent. Record both candidate SHAs and gate receipts.

Prefer a compatibility bridge that makes either push order safe. Otherwise, the charter chooses
private-first only when the new private candidate works with old public main, or public-first only
when the new public candidate works with old private main. If neither intermediate pair is valid,
stop; two Git remotes cannot provide an atomic cross-repository push. After each push, verify the
remote SHA and the composed pair before the next push. Roll back in the chartered compatibility
order with reviewed revert commits; never rewrite either `main`.

## Splitting parallel tasks to minimize conflicts

When two tasks must run together, give them **disjoint ownership** of the tree. The architecture's
single data↔UI seam (`evaluateGrants` → the aggregated read model — see `docs/ARCHITECTURE.md`)
makes a clean split natural:

| Layer                  | Owns                                                                            |
| ---------------------- | ------------------------------------------------------------------------------- |
| **Engine + data** task | `src/data/**`, `src/lib/**`, `tests/unit/**` — adds mechanics via Grants        |
| **Presentation** task  | `src/components/**`, `src/app/**`, `src/stores/**`, CSS/tokens, i18n UI strings |

The engine task surfaces new mechanics **through the aggregated view**; the UI task **reads that
view** read-only. New mechanics then render automatically, and the only overlap to reconcile is
thin consumer-wiring, handled at the rebase.

## Cleaning up stale worktrees

List the registered worktrees first. A clean completed task is removed through `just wt-rm <slug>`
only after its exact reviewed SHA is remotely proven. Never advertise or use force removal as
cleanup. Never remove a worktree while a `main` push from it is still gating; poll the remote SHA
first.

A dirty or locked worktree stays in place until one of these conditions is proved:

1. **Integrated/empty equivalence:** its HEAD is remotely integrated (or its exact changes are
   already represented by a proved integrated commit), and tracked, staged, and untracked state is
   empty or byte-equivalent to that integrated evidence.
2. **Verified recovery capsule:** a separate safe destination contains a manifest of canonical
   worktree/common-dir, branch, base, HEAD, status, refs, and ownership; a complete bundle covering
   every required reachable ref; binary-safe tracked and staged patches; an untracked archive with
   an explicit file inventory; and checksums for every artifact. Restore into a separate probe and
   perform source-match verification against the original status, tracked/staged diffs, untracked
   inventory, and checksums before authorizing removal.

Private and public recovery capsules remain physically separate; no private material enters public
recovery. An app-managed worktree additionally requires a Codex handoff and detach, followed by
proof that no running task or process still owns it. A repository-managed locked worktree likewise
requires proof that its owner is idle. If equivalence, capsule verification, or ownership cannot be
proved, record the blocker and retain the worktree.
