# Release process

> Treat d20 Folio as professional software. Every shipped version is reproducible from a tag, and
> **version / `CHANGELOG.md` / git tag / GitHub release move in lockstep** (golden rule 17).

## Versioning

We follow [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

| Bump      | When                                                                                   |
| --------- | -------------------------------------------------------------------------------------- |
| **MAJOR** | Incompatible character/JSON schema change, or removal of a public capability           |
| **MINOR** | Backwards-compatible feature add (new mechanic, wizard step, SRD entries, schema add)  |
| **PATCH** | Backwards-compatible bug fix, copy/translation tweak, performance fix, dependency bump |

While at **0.x** (pre-1.0), breaking changes may land in any _minor_ bump. The live version is the
`version` field in `package.json`; the release tag is `v<version>`.

## Releasing — `just release`

**`just release` is THE release flow, permanently — by design: owner-triggered, agent-executed
end to end.** There is no release workflow in CI: the changelog section is **synthesized** (golden
rule 17) — a judgment step no "Version Packages" bot can perform — so the agent runs the whole
ritual deliberately, on the owner's go. The owner may review and adjust
wording before it publishes, but never writes it (the owner writes nothing —
`docs/GOLDEN_RULES.md` → Philosophy). Deploys ship separately — the owner fires `just deploy`
(the primary, local deploy) or `gh workflow run deploy.yml` (the remote twin).

`just release` drives `@changesets/cli` and enforces golden rule 17. The steps:

1. **Bump + consume changesets** — `pnpm changeset version` (bumps `package.json`, prepends an
   auto-aggregated `## X.Y.Z` block to `CHANGELOG.md`, deletes the consumed changesets, refreshes the
   lockfile).
2. **Synthesize the new `CHANGELOG.md` section** (golden rule 17) — the agent rewrites the verbose
   auto-dump into a professional section: a headline plus several curated entries grouped like a
   real product changelog (`### Added` / `### Changed` / `### Fixed`, or thematic), covering
   everything user-meaningful, never bloated. `just release` PAUSES here for that rewrite. Never
   ship the raw machine output.
3. **Commit** `package.json` + `CHANGELOG.md` + `pnpm-lock.yaml` (`chore(release): vX.Y.Z`) and push to
   `main`.
4. **Tag + push** — `git tag vX.Y.Z && git push origin vX.Y.Z` (the tag is the reproducibility anchor).
5. **GitHub release** — `just release` runs `scripts/release-notes.mjs vX.Y.Z` and feeds its output
   to `gh release create --notes-file`, PROJECTING the version's curated `CHANGELOG.md` section onto
   the release body — self-contained professional notes, never a "see CHANGELOG" pointer, never
   GitHub's raw commit dump. See "Release notes = the projected CHANGELOG section".

### Release notes = the projected CHANGELOG section

`CHANGELOG.md` is the single source of truth; the GitHub release notes are a faithful PROJECTION of
it — never a second authoring surface, never a pointer. `scripts/release-notes.mjs <version>`
(PERMANENT tooling — not a one-off, golden rule 10 does not apply) slices the version's
`## <version>` section out of `CHANGELOG.md`, drops the redundant heading (the release title already
shows the version), trims it, and appends a `**Full changelog:**
https://github.com/salvodicara/d20-folio/compare/<prevTag>...<thisTag>` link (omitted only when
there is no earlier tag). It is dependency-free (Node stdlib) and exits non-zero if the version has
no CHANGELOG section, so `just release` (`set -euo pipefail`) aborts before publishing empty notes.

**To re-sync an already-published release** after a curated-changelog edit — or to backfill an old
one — reproject with the same script:

```sh
node scripts/release-notes.mjs 0.16.5 > /tmp/rn.md && gh release edit v0.16.5 --notes-file /tmp/rn.md
```

## Deploying — `just deploy`

`just deploy` runs the full gate + the Playwright e2e matrix, then `firebase deploy`
(hosting + Firestore/Storage rules). **Only with explicit owner permission** (golden rule 22) — never
deploy on your own initiative.

**Local is the primary path.** `just deploy` on the owner's machine is THE ship mechanism;
`gh workflow run deploy.yml` is its remote twin (the same recipe on a GitHub runner — it composes
the private content pack first; see `deploy.yml`'s header). While a repo is private, free-tier
Actions minutes exhaust constantly, so never lean on the remote path to ship there.
`FOLIO_SKIP_E2E=1 just deploy` is allowed **only when that exact commit already has a green full
e2e run**; otherwise run the full `just deploy`, which executes the whole Playwright e2e matrix
locally before `firebase deploy`.

## What goes in `CHANGELOG.md`

**Yes:** owner-visible behaviour changes, new automations, new SRD batches, schema changes (with
migration notes), Italian-translation corrections. **No:** internal refactors, test-only changes,
doc tweaks, lint/format passes (those live in git history).

## Reproducibility

Given a tag `vX.Y.Z`: `package.json` pins exact deps (via `pnpm-lock.yaml`), the `CHANGELOG.md`
section gives the rationale, the tag pins the commit, and `pre-push` guaranteed the gate was green
there. Enough to bisect a regression to a single release.
