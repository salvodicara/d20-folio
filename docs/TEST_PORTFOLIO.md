# Test Portfolio

The test portfolio of the new app on `v2`, rebuilt with it (steering, 2026-09-03; ADR-0007). It
owns what the gate runs, what each lane proves, the golden-replay contract and the deletion ledger.
Counts are health indicators, not quotas. `main` keeps the old portfolio until the milestone.

## The `v2` gate

| Command                                    | What it proves                                                            | Budget                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| `just ci`                                  | typecheck, lint, Vitest fast + slow lanes (root + pack), Functions, build | under 15 minutes end to end (measured about 5 at stage 0) |
| `pnpm test:rules`                          | Firestore/Storage access matrices on the emulator                         | under 1 minute                                            |
| `pnpm exec vite build && pnpm test:budget` | bundle ceilings                                                           | with the build                                            |
| `just ci-srd-only`                         | the public composition, whenever the pack seam is touched                 | same                                                      |
| `pnpm test:e2e` (by hand until stage 6)    | the accessibility sweep, both profiles, dark and light                    | not in a gate                                             |
| `pnpm visual:review` / `visual:motion`     | the owner's screenshot lane (golden rule 25)                              | not in a gate                                             |

No end-to-end journey runs on `v2` and none is added: a story is proved by its golden replay, a
screen by the screenshot gate, a live-data invariant by unit and rules tests.

## Lanes and counts (2026-09-03, after the architecture reset)

| Lane                 | Files                              | Notes                                                                                               |
| -------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| unit fast (`node`)   | 445 root `.test.ts` (58 guards)    | pure logic, codecs, guards; `tests/lanes.ts` lists the 13 DOM-bound `.ts` that run in the slow lane |
| unit slow (`jsdom`)  | 194 root `.test.tsx` + 13 `.ts`    | render tests of the old surfaces; shrink as the new surfaces replace them                           |
| combat engine        | 12 files under `tests/unit/combat` | the engine's proofs, the dice module and the golden replays (`replays/*.json`)                      |
| pack unit (composed) | 177                                | `content-pack/tests/unit`, pack branch `v2`                                                         |
| rules (emulator)     | 2 files, 113 cases                 | `firestore-rules` 101, `storage-rules` 12                                                           |
| Functions            | 7                                  | standalone npm package                                                                              |
| accessibility sweep  | 2 specs, 432 registrations         | `tests/e2e/a11y*.spec.ts` over `tests/e2e/surfaces.ts`                                              |
| screenshot lane      | 2 specs                            | `tests/visual`, own config, artifacts under `artifacts/visual-review/`                              |

Count them with `find tests/unit -name '*.test.ts' | wc -l` (445), `find tests/unit -name '*.test.tsx' | wc -l`
(194), `find tests/unit -name '*.guard.test.ts*' | wc -l` (58), `grep -c "^\s*it(" tests/rules/*.test.ts`
(101 + 12) and `pnpm exec playwright test --list | tail -n 1` (432).

## Golden replays

`tests/unit/combat/replays/*.json`, one runner (`tests/unit/combat/replays.test.ts`): a log of
actions folds to an expected state and an expected list of rejections. One replay per hard case
and per acceptance story; stories 1 and 2 (`marco-first-turn.json`, `sara-ogre-ambush.json`) are
the gate of stages 1–3. Rolls in a replay carry recorded faces (manual) or a seed (app), so the
same replay proves the dice seam and the reducer together. Format: `{ name, dm, entities
(testEntity options), initiative, order, relations (seeded until stage 2), log (actions
without seq; the runner stamps `ms: 5000 + index`), expect: { applied, rejections
[{ action, rejection }], state { "dotted.path": value } } }`; `applied` counts the replay's
own log, skipping undone actions and undos.

## Deletion ledger

Every deletion names the representation it died with (golden rule 10). Reset of 2026-09-03
(`docs/superpowers/plans/2026-09-03-v2-architecture-reset.md`, evidence table):

| Deleted                                                                                                                                                                                 | Died with                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `tests/unit/resolve-command.{contract,golden}.test.ts`                                                                                                                                  | K1 (`src/lib/command`), no production reader                                            |
| `tests/unit/program-supervisor-{state,runtime}.test.ts`, the runbook guards of the worktree test                                                                                        | the program supervisor                                                                  |
| `tests/unit/migrate-{custom-identity,character-parents,item-resources}.test.ts`, `tests/rules/migrate-character-parents.emulator.test.ts`, `tests/rules/migration-kit.emulator.test.ts` | the P1/P3 scripts (they run from `main`)                                                |
| the legacy-reader cases of `combat-state-io-roundtrip`, the P1 fence in `architecture-direction.guard`                                                                                  | `parseLegacyCombatChild`, `applyLegacyCombatToSession`                                  |
| `tests/unit/mechanics-trigger.test.ts`                                                                                                                                                  | `mechanics-trigger.ts`, no reader                                                       |
| 60 `tests/e2e/*.spec.ts`, `visual-gate.ts`, the pixel harnesses, `_perf-probe`, the portrait service-worker projects                                                                    | the old end-to-end portfolio (steering)                                                 |
| `content-pack/tests/unit/team-item-resource-migration.test.ts` (pack `v2`)                                                                                                              | `migrate-item-resources.ts`                                                             |
| the e2e-helper key drift case of `content-pack/tests/unit/chronicle-dev-fixture.test.ts` (pack `v2`)                                                                                    | `tests/e2e/ready.ts`                                                                    |
| the CLI cases of `tests/unit/migration-kit.test.ts`                                                                                                                                     | the kit's apply path and CLI (`runGuardedMigration`, `parseCliOptions`), unread on `v2` |

Still to die, with their representations: the 36 root and 3 pack test files that import the
mechanics kernel (stage 6, with the kernel and the old play surfaces), `automation-corpus`/`automation-compiler` and the coverage
guards (stage 3, with the derived coverage), the render tests of the old surfaces (as each new
surface lands behind the screenshot gate).
