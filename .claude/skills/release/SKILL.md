---
name: release
description: Cut a versioned release (version bump, curated CHANGELOG section, tag, GitHub release). Use when asked to release, tag, or publish a version.
---

# Release

Version, `CHANGELOG.md`, git tag and GitHub release move in lockstep. A release is separate from a
deploy and needs the owner's go.

1. **Owner's go** for this release. Done on an explicit yes.
2. **Every catalogue entry is painted** (owner, 2026-11-05). In the composed checkout,
   `pnpm art:coverage --strict` passes: no spell, class, subclass, feature, feat, item, piece of
   equipment or monster falls back to a glyph. The icon redo list (near-duplicates) is closed with
   the coordinator's sign-off. Done when both hold.
3. **`just release`.** It bumps the version from the staged changesets and pauses.
4. **Curate the section.** Start from the version's draft, `docs/release/vX.Y.Z-draft.md` (the
   sessions' running notes and its "Dati e compatibilità" list). Rewrite the machine-aggregated
   `## X.Y.Z` block into a short product changelog: a headline, then `### Added` / `### Changed` / `### Fixed` entries a player would care
   about. Done when every user-visible change is covered and nothing internal is listed.
5. **Finish `just release`.** It commits `chore(release): vX.Y.Z`, tags, pushes (owner-gated push to
   `main`), and publishes the GitHub release from `scripts/release-notes.mjs`.
6. **Tell the owner** the version and its headline.

Reference: `docs/RELEASE.md` (semver table, what belongs in the changelog).
