---
"d20-folio": patch
---

Review pass 1 on the open-sourcing scaffolding: the gate-split prose in `.githooks/pre-push`, `.githooks/pre-commit`, and golden rule 14 now states the branch's model (deploys local-primary via `just deploy` with `deploy.yml` as the dispatch-only remote twin; `ci.yml` the ambient push/PR gate, dormant while private); `buildCharacterExport`'s single-flight Storage import no longer memoizes a rejection (a transient chunk-load failure retries on the next export — regression test pins it); the snapshot builder drops its tautological second exclusion sweep; and PROGRESS.md's mention of the builder script reads as private-tree-only, so the public tree carries no dangling path.
