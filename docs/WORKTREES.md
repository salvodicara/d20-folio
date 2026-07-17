# Parallel work — worktrees, branches off `main`, agent merges

> **The repo standard for every change** (golden rule 11, `docs/GOLDEN_RULES.md`). Each task gets
> its own **git worktree** + **branch off the freshest `origin/main`**; when it converges, the
> agent **merges it to `main` autonomously** and tears the worktree down. There are **no pull
> requests** — one owner + agents, nobody reviews PRs; the adversarial `ponytail-review`
> convergence loop (golden rule 12) is the review. `main` is the integration line, NOT production:
> the owner's only gate is deploy (golden rule 22).

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
#   e.g.  just wt-new ui-polish            → ../d20-folio-ui-polish on feat/ui-polish
#         just wt-new wave2-data chore     → ../d20-folio-wave2-data on chore/wave2-data

# 2. Work in the new directory; commit per coherent step (hooks gate every commit/push).
cd ../d20-folio-<slug>
git add -A && git commit -m "feat(scope): …"        # never --no-verify; owner = sole author,
                                                    # NO co-author/trailer lines

# 3. Converge: gate green, then an INDEPENDENT agent runs ponytail-review on the diff;
#    apply or rebut every finding until a zero-finding pass (max 3 rounds — golden rule 12).

# 4. Merge to main FROM the worktree (never touch the shared checkout):
git fetch origin main
git rebase origin/main                              # re-run the gate if the rebase changed anything
git push origin HEAD:main                           # the ff-merge; non-ff rejection ⇒ re-rebase, retry

# 5. Confirm the SHA landed, THEN tear down (removing early orphans an in-flight push):
git ls-remote origin main                           # poll until it shows your SHA
cd ../d20-folio                                     # leave the worktree before removing it
just wt-rm <slug>
git branch -d <kind>/<slug>

# At any time: see everything in flight.
just wt-list
```

## Conventions

- **Directory:** `../<project>-<slug>` next to the main checkout. The main worktree (`d20-folio`)
  **always stays on `main`**.
- **Branch:** `<kind>/<slug>` — `kind` ∈ `feat` (default) · `fix` · `chore` · `docs` · `refactor`.
  Branch **off `origin/main`**, never off another task branch. Branches are local scaffolding for
  the worktree; they are not pushed — the only push is the final `HEAD:main` merge, so never run a
  bare mid-task `git push` (the branch tracks `origin/main`, so a bare push targets `main`).
- **Agent fan-out:** each delegated track gets its OWN worktree (`isolation: "worktree"` for
  `Agent`/`agent()`), never the shared tree. When two tasks run together, split ownership along
  the data↔UI seam (below) so merges stay cheap.
- **`.env.local`** is copied into each worktree by `wt-new` so `pnpm dev` works; it is git-ignored
  and never committed.
- **Committed tooling comes with every worktree.** Tracked files include the committed skills
  (`.claude/skills/` — e.g. the official
  [pbakaus/impeccable](https://github.com/pbakaus/impeccable) design skill, which reads root
  `PRODUCT.md` + `DESIGN.md`; `DESIGN.md` §15 is the project checklist), so every worktree and
  agent session has them with no install step.
- **Hooks are shared.** `core.hooksPath=.githooks` lives in the common git config, so every
  worktree runs the same pre-commit/pre-push gate. **Never `--no-verify`.**

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

```sh
git worktree list                       # what exists
just wt-rm <slug>                       # safe remove (refuses if dirty)
git worktree remove --force <path>      # force (discards uncommitted work)
git worktree prune                      # drop admin entries for deleted dirs
```

A worktree locked by a running agent shows `locked`; unlock with `git worktree unlock <path>` (or
`git worktree remove -f -f <path>` if the locking process is dead). Never remove a worktree while
a push from it is still gating — the pre-push hook dies when `node_modules` vanishes; poll origin
for the SHA first (step 5 above).
