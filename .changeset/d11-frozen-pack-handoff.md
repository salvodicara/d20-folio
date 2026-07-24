---
"d20-folio": patch
---

Amended golden rule D11 (the public/pack split is licensing, never scope) with a concurrency
carve-out: when the private content pack is currently owned by another worktree (frozen read-only),
the pack-side twin of a change becomes a tracked, explicit handoff run the moment the pack is
workable — still the same unit of work, never a silent deferral. Internal contributor-process rule;
no user-facing behavior change.
