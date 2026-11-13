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

### Before you deploy: stored data and the live client (ADR-0009)

**The next version's draft** lives in `docs/release/vX.Y.Z-draft.md` (now `v0.26.2-draft.md`): the
player-facing notes and the "Dati e compatibilità" list (migrations, writers held off until old
clients are gone, what an old client sees). Sessions add to it through PRs; the release starts from it.

**Pending migrations: none (2026-11-13).** `deploy.yml` runs four read-only checks after composing
the pack: `migrate-custom-identity.ts`, `migrate-character-parents.ts`, `migrate-item-resources.ts`
and `migrate-monk-base-speed.ts`, each with `--check`. A pending change or an unreadable stored
document stops the promotion; the workflow never applies anything. A new migration goes through the
`live-data-migration` skill (snapshot → `--check` → owner's yes → `--apply --backup <fresh dir>` →
`--check` green) before the client that needs it ships, and its `--check` joins `deploy.yml`.

**A stored-shape change needs a migration or a tolerant reader.** That covers a new or renamed
field, and also **a new value in a stored closed list** (an enum the reader checks: economy
categories, trigger events, condition ids, sizes…). The live client's strict reader refuses the
whole document over one value it does not know: in v0.26.1 a cast's new category «magic» broke the
sheet (#1158). Write only values the live release knows, or ship the tolerant reader first.

**The checks before a deploy** (all read-only; output is counts only):

1. **Build the live release locally**, from the SHAs of the last deploy run and the pack it
   checked out:

   ```sh
   bash scripts/setup-deployed-baseline.sh /absolute/fresh/dir <app-sha> <pack-sha>
   ```

2. **Forward compatibility (local): the live client reads what this tree writes.** Any refused
   value blocks the deploy.

   ```sh
   node --import ./scripts/alias-loader.mjs scripts/survey-forward-compat.ts \
     --baseline-root /absolute/fresh/dir/app
   ```

   CI runs the same check against the live release's frozen shape
   (`tests/unit/forward-compat-gate.test.ts`). After each deploy, refresh that fixture with
   `--release vX.Y.Z --write-fixture tests/unit/__fixtures__/forward-compat-vX.Y.Z.json`.

3. **Stored documents still load (production):** `scripts/survey-v026-compat.ts`. Its `--detail`
   shows each rewrite's shape, for example «number → absent».
4. **Derived numbers (production):** `scripts/survey-v026-derived-diff.ts`, with
   `--baseline-root` set to the release's `app` directory and `--detail` to trace a field to its
   catalogue ids. Every changed field must match a merged rules fix listed in its `EXPECTED`; an
   unexpected one is a bug to look at before the deploy.

Checks 3 and 4 read production: only the coordinator runs them, with the operator's credential.

**Hosting and rules ship together.** `deploy.yml` deploys Hosting plus the Firestore/Storage rules
in one run. Rules ahead of the client would deny the old client's saves; never split them.

**After the deploy, open tabs reload.** An open tab keeps its old JavaScript until it reloads. The
app shows «A new version is ready — Reload» once the new service worker takes over; until then,
saves the new rules refuse show a save error, and no stored document is harmed.

## What goes in `CHANGELOG.md`

**Yes:** owner-visible behaviour changes, new automations, new SRD batches, schema changes (with
migration notes), Italian-translation corrections. **No:** internal refactors, test-only changes,
doc tweaks, lint/format passes (those live in git history).

## Reproducibility

Given a tag `vX.Y.Z`: `package.json` pins exact deps (via `pnpm-lock.yaml`), the `CHANGELOG.md`
section gives the rationale, the tag pins the commit, and CI + Verify carry the gate's verdict for
it. Enough to bisect a regression to a single release.
