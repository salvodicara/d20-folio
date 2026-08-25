# 2026-08-25 Worktree Consolidation Record

This dated status record preserves the evidence and disposition from the complete public/private worktree audit. It is history after the listed branches advance; the active program ledger and Git own current state.

## Audited disposition

| Worktree / branch                                                   | Evidence at audit                                                                     | Disposition                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `docs/agent-first-operating-model` at `9fa3298`                     | clean, equal to `origin/main` before the specification                                | retained through specification review and planning                                    |
| `feat/automation-k1` at `f974afd`                                   | clean; three unique commits; deterministic kernel and Functions build                 | retained for review, gates, and integration                                           |
| `feat/wayfinder-b00-successor` at `7b66c82`                         | clean; one unique B00 foundation commit and curated evidence                          | retained; T8A precedes the visual gate and owner image approval                       |
| `test/wayfinder-test-t8a-runtime-fix` at `9fa3298` plus dirty patch | unique visual-state isolation repair                                                  | retained for TDD repair, review, integration, and retirement                          |
| app-managed detached `2ca0` at `1ccb8af`                            | clean; no unique Git state; conversation preserved by task handoff                    | removed after handoff verification                                                    |
| `fix/live-save-storm` at `1ccb8af`                                  | clean and fully contained in `origin/main`                                            | worktree and branch removed                                                           |
| `docs/automation-first-reset` at `7590b18` plus prototype           | commit patch-equivalent to main; unique DEV prototype, two assets, and 18 screenshots | verified recovery capsule created; worktree and branch removed                        |
| `feat/wayfinder-causal-protocol` at `09f3f69` plus dirty state      | frozen experiment already classified by the integrated disposition ledger             | verified recovery capsule created; worktree and branch removed; never merge wholesale |

## Recovery proof

Capsules are stored outside the repository under `~/Workspace/Codex/d20-folio-worktree-audit/recovery/`. Complete Git bundles were verified, tracked patches passed reverse-apply checks, untracked archives matched their source lists exactly, and all artifacts have SHA-256 checksums.

| Capsule                     | Bundle SHA-256                                                     | Tracked patch SHA-256                                              | Untracked archive SHA-256                                          |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `automation-first-reset`    | `7d73642581c667922f50a0e9576ef198d02de9d7b7e64d3a2237bec6ef75f55f` | `9ddc65a4bb538c34e60a3c5ccc8bd167a454c15a3f36a8df133d7cc427255446` | `1aa770d4ef4f3f2fd64afc3cea83202fe7be46a9790ee4af0f30bf672d3a51ea` |
| `wayfinder-causal-protocol` | `54a32c3a224e5152bda39d9305d704c5dcd1cbdabb7c3406b4966991589c1807` | `886da5a44a4a7be0c08b1744d13d9272e3df7f29f1e31f09b599d575c8d5bd74` | `2bf77bd37f9dd0372417a3531eee79885b59ed4ee9a615dc4a9426c154057baf` |

Each capsule contains a `MANIFEST.md` with its source SHA, contents, disposition, and recovery commands. Neither capsule contains private content-pack source.

## Private repository

The private content repository was freshly fetched and verified clean on `main` at `1d5226f`. Sixteen local non-main branches already contained in `main` were deleted. Its sole registered worktree remains the shared clean `main` checkout; no remote branch or private source file was modified.

## Cleanup result

The obsolete public worktrees were removed only after proof of integration, patch equivalence, or verified recovery. The retained useful worktrees were moved beneath `~/Workspace/Codex` and their `content-pack` links were repaired to the clean private checkout. The cleanup reclaimed approximately 1.46 GB while retaining approximately 121 MB of recovery evidence.
