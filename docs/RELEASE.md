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
`docs/GOLDEN_RULES.md` → Philosophy). Deploys ship separately — the owner fires
`gh workflow run deploy.yml --ref main` directly or through the `just deploy` dispatcher; both
names reach the same GitHub Actions production path.

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

## Deploying — promote a verified SHA

A deploy **promotes a SHA that CI + Verify have already proven green** (golden rule 14: every
merge to `main` runs the SRD-only gate and the composed unit + full sharded e2e matrix remotely,
ambiently). **Only with explicit owner permission** (golden rule 22) — never deploy on your own
initiative.

- **Production path:** `gh workflow run deploy.yml --ref main` — waits for green CI + Verify on the
  target SHA (up to 40 min if still in flight), refuses a newer unverified content pack, composes and
  builds, checks the bundle budget and Blaze posture, exports Firestore, deploys every Cloud Function
  on Node 24, requires all six healthy, then deploys Hosting plus Firestore/Storage rules and requires
  SAFE-01 armed. `just deploy` only verifies that the clean checkout equals `origin/main` and dispatches
  this workflow; it never calls Firebase locally.

If the SHA's Verify run was superseded (cancelled by a newer merge) or the content pack moved
after it ran (a pack-only merge), re-verify first: `gh workflow run verify.yml --ref main`.

### Migrate before you deploy (ADR-0009)

Before deploying a SHA that reads a new persisted shape, run the migration(s) listed under
"Pending migrations" in `docs/PROGRAM_STATUS.md` with `--check` green against production; a deploy
with a pending migration is refused. The two currently prepared:

```sh
node --import ./scripts/alias-loader.mjs scripts/migrate-custom-identity.ts --check
node --import ./scripts/alias-loader.mjs scripts/migrate-character-parents.ts --check
```

Both are read-only in `--check`; each needs `GOOGLE_APPLICATION_CREDENTIALS` pointing at a
`d20-folio` service-account key. `scripts/alias-loader.mjs` composes the private content pack exactly
as the app does, so a migration resolves the same ids and catalogues the client would.
`migrate-character-parents.ts` hydrates through the SRD-aware codec and therefore PROVES the pack
composed before it plans anything, in every mode: with the `content-pack` symlink missing or
`VITE_CONTENT_PACK=0` exported it refuses with
`Refusing: content pack not composed — the plan would rewrite pack-only references` and exits 1,
rather than quietly rewriting a pack-only spell reference.

An `--apply` run commits at most 500 documents in ONE atomic batch. `migrate-character-parents.ts`
writes up to two documents per character (the parent and its `combat/state`), so it migrates at most
**~250 characters per run**; it refuses rather than splitting the batch, and a corpus larger than that
needs the write ceiling revisited before the run rather than a partial apply.

## What goes in `CHANGELOG.md`

**Yes:** owner-visible behaviour changes, new automations, new SRD batches, schema changes (with
migration notes), Italian-translation corrections. **No:** internal refactors, test-only changes,
doc tweaks, lint/format passes (those live in git history).

## Reproducibility

Given a tag `vX.Y.Z`: `package.json` pins exact deps (via `pnpm-lock.yaml`), the `CHANGELOG.md`
section gives the rationale, the tag pins the commit, and `pre-push` guaranteed the gate was green
there. Enough to bisect a regression to a single release.
