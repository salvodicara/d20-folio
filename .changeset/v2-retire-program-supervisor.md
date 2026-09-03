---
"d20-folio": patch
---

Retire the program supervisor on `v2` (its state, runtime and CLI, their tests and `package.json` scripts, the agent-first operating model and its plans): nothing invoked it. The worktree helpers the `justfile` uses move to `scripts/worktree/`.
