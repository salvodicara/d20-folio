---
"d20-folio": patch
---

Replace the four GitHub Actions workflows with a lean two-workflow set for the public repo: `ci.yml` (one job — typecheck, lint, unit tests, build, bundle budget — on every push to main and every PR, SRD-only by construction, self-skipping while the repo is private) and a rewritten dispatch-only `deploy.yml` that mirrors `just deploy` on a runner (composes the private content pack, runs the full gate + e2e matrix, then deploys hosting + rules). `test.yml`, `visual.yml`, and `update-snapshots.yml` are deleted (superseded / no committed pixel baselines); deploys are documented as local-primary throughout.
