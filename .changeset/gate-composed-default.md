---
"d20-folio": patch
---

Owner worktrees now gate in COMPOSED (pack-present) mode by default, closing the process gap where an
SRD-only-gated merge could silently break the private content pack:

- `just wt-new` auto-creates the `content-pack` symlink in each new worktree whenever the maintainer's
  pack sibling exists — replicating the main checkout's relative link (`../d20-folio-content/content-pack`),
  which resolves identically from any sibling worktree — so the pre-push gate runs the pack's own test
  suites there. External contributors (no pack sibling) skip it silently and gate SRD-only, unchanged;
  the recipe echoes which mode it set up, and the guard on the target resolving means it never links a
  dangle.
- `.githooks/pre-push` prints a loud WARNING (never a hard fail) when the pack exists in the main
  checkout but this worktree hasn't linked it — the gate is running SRD-only and pack-side breakage
  won't be caught. It keys off the pack actually existing, so it can't false-positive for a contributor
  who has no pack.
- Docs updated (`docs/WORKTREES.md`, `docs/CONTRIBUTING.md`, `CLAUDE.md`, `PROGRESS.md`): the symlink is
  now automatic/composed-by-default with an SRD-only fallback, plus a caveat that all worktrees share the
  one pack working tree so concurrent pack-file EDITS can race while gating (reads) is always safe.
