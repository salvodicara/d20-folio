# Test portfolio

What the `v2` gate is made of, what it costs, and what was deliberately deleted. The **split**
between the lanes — which check runs at commit, at push, per merge — is owned by
[`CONTRIBUTING.md`](CONTRIBUTING.md) § The gate split and is not repeated here; this page owns the
**contents** of the suites, their numbers and their budgets.

The shape of the portfolio was decided in [`adr/0007-test-portfolio-reset.md`](adr/0007-test-portfolio-reset.md)
("far fewer tests, professional patterns; real regressions still slip") and its `v2` amendment of
2026-09-03. The v1 portfolio document is history at
[`archive/v1/TEST_PORTFOLIO.md`](archive/v1/TEST_PORTFOLIO.md).

## 1. The lanes that exist

Verified against `package.json`, `vitest.config.ts`, `vitest.rules.config.ts`,
`playwright.config.ts`, `playwright.visual.config.ts` and `justfile`.

| Lane                    | Command                                | Contents                                                                                                          |
| ----------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **unit — fast**         | `pnpm test:fast`                       | `node` environment, jsdom-free pure logic: `tests/unit/**/*.test.ts` + `src/**/*.test.ts` + the pack's own suites |
| **unit — slow**         | `pnpm test:slow`                       | `jsdom`: every `*.test.tsx` plus the DOM-bound `.test.ts` listed in `tests/lanes.ts`                              |
| **unit — both**         | `pnpm test` (`just ci`'s `test`)       | the two projects above; `pnpm test:coverage` adds the v8 thresholds                                               |
| **budget**              | `pnpm test:budget`                     | its own vitest project — reads `dist/`, so it runs **after** `vite build`, never in the pre-build run             |
| **rules**               | `pnpm test:rules`                      | `tests/rules/*` (14 files) on the Firestore + Storage emulators, `demo-` project, no cost                         |
| **accessibility sweep** | `pnpm test:e2e` / `test:e2e:all`       | `tests/e2e/a11y.spec.ts` and `a11y-hp-states.spec.ts` on the `chromium` and `mobile` projects                     |
| **screenshot lane**     | `pnpm visual:review` / `visual:motion` | `playwright.visual.config.ts`, isolated (`testDir: tests/visual`) so ordinary discovery never loads it            |
| **SRD-only**            | `just ci-srd-only`                     | `typecheck:srd-only` + `test:srd-only` + `build:srd-only` — the composition the public snapshot builds            |
| **Functions**           | `pnpm test:functions`                  | the standalone `functions/` npm workspace                                                                         |

`just ci` = `typecheck` + `lint --max-warnings 0` + `test` + `test:functions` + `build`. It is the
authoritative local gate before an integration push to `v2`; **`v2` pushes run no hook gate**, so
the local list must be a superset of what `.githooks/pre-push` would have run — the bundle budget in
particular ([`CONTRIBUTING.md`](CONTRIBUTING.md)).

## 2. What the unit lane is actually made of

The regression spine is not a wall of representation tests (ADR-0007):

- **Golden replays of the acceptance stories** — `tests/unit/combat/replays/`, six committed logs
  that must fold to an expected state: `marco-first-turn`, `sara-ogre-ambush`,
  `position-and-reach`, `map-fog-and-hidden`, `dice-provenance`, `pc-projection`. One per hard case
  and per incident; a failure points at a replay, not at a snapshot diff.
- **Property tests** — fold determinism under permutation and codec round-trip totality against
  hostile input (`tests/unit/combat/codec.property.test.ts`).
- **Compile-time exhaustiveness** for every closed union, plus the architectural guards:
  `architecture-direction.guard` (the one-way dependency direction and the presenter seam),
  `pure-modules-guard`, `dice-randomness.guard` (no RNG outside `src/lib/dice.ts`),
  `content-pack-partition.guard` and the SRD-string guards, `mechanics-kernel-freeze.guard`,
  `route-coverage.guard`, `play-sprite.guard`.
- **Rules tests that guard live data** — `tests/rules/`, including the two emulator encounter
  suites (`encounter-io`, `encounter-two-clients`) and the identity, shared-operations, library,
  homebrew, origins, preparation, creation and storage boundaries.
- **The accessibility sweep**, on desktop and mobile profiles, in the single supported dark theme
  and both locales (golden rule 35: axe serious/critical findings are zero).
- **The owner's screenshot lane**, which produces the evidence golden rule 25 requires.

## 3. The last measured numbers

These are the **final pinned gates of the P10 closure**, quoted from the archived ledger
[`archive/v1/PROGRAM_STATUS-2026-09-09.md`](archive/v1/PROGRAM_STATUS-2026-09-09.md) at integration
SHA **`59b20e75`**. They are the last measured figures on record; nothing in this document
re-measures them, and the controller records the `just ci` wall-clock of the current integration
beside them:

| Composition            | Files | Tests  | Also proven                                                       |
| ---------------------- | ----- | ------ | ----------------------------------------------------------------- |
| Composed (pack + SRD)  | 919   | 19,929 | typecheck · zero-warning lint · build · PWA                       |
| Functions              | 7     | 129    | —                                                                 |
| SRD-only               | 739   | 14,248 | 2 intentional private-loader skips · typecheck · build · PWA      |
| Rules (full, emulator) | 14    | 287    | 0 skips, including snapshot / dry-run / repeated-apply / recovery |

Any figure not carrying a SHA is not a measurement. Re-measure before quoting.

## 4. The fifteen-minute target

The gate must stay **under fifteen minutes** (owner, 2026-09-03; golden rule 14). That number is the
reason the portfolio has its current shape, and it constrains every addition:

- a slow check never enters a hook — it belongs in a remote per-merge lane;
- the fast and slow lanes exist precisely so pure logic never pays for jsdom;
- `--cache` stays on wherever it helps, so a no-op re-run costs seconds;
- adding a suite that pushes the gate past the ceiling is a regression, whatever it tests.

## 5. The performance budget

`tests/unit/bundle-budget.guard.test.ts` (the `budget` vitest project) reads the **production
build** and pins four numbers:

| Ceiling                    | Value     | What it bounds                                                          |
| -------------------------- | --------- | ----------------------------------------------------------------------- |
| `ENTRY_CEILING_KB`         | 65 KB gz  | the index entry script alone                                            |
| `EAGER_CEILING_KB`         | 850 KB gz | the entry script plus its full eager static closure                     |
| `PRECACHE_CEILING_KIB`     | 9,781 KiB | every file Workbox precaches                                            |
| `NEW_EAGER_CHUNK_LIMIT_KB` | 50 KB gz  | ratchet: a new eager chunk above this needs an explicit allowlist entry |

Rules for touching them, from the guard's own header: never raise a ceiling to an exact-fit measured
value — leave deliberate headroom — and **update the constant and the recorded baseline in the same
commit**. Each existing constant carries its dated raise rationale inline; that comment block is the
baseline record. The precache ceiling interacts with the PWA configuration in `vite.config.ts`
(Workbox precaches `**/*.{js,css,html,ico,png,svg,webp,woff2}` with a 4 MiB per-file limit), so a new
asset family is a budget decision, not a build detail.

The `EAGER_CEILING_KB` line is explicitly over its original baseline (727.1 KB → 850) and is
recorded in the guard as a standing frontier item, not as a comfortable margin.

## 6. What was deleted, and why

- **The v1 end-to-end suite.** ADR-0007's `v2` amendment: "The 60 old end-to-end specs were deleted
  on `v2` on 2026-09-03" — they ran only on `main`'s `verify.yml`, and at almost an hour per run the
  owner ruled them unacceptable. **No end-to-end journeys exist on `v2` and none are added.**
  `playwright.config.ts` keeps two projects, `chromium` and `mobile`, running the accessibility
  sweep only.
- **Representation-pinning tests** die phase by phase **with the representation they pin**; each
  deletion names it. Parity harnesses for duplicates that were never adopted are gone.
- **The old visual atlases as authority** and the character-only mechanics kernel's suites are
  approved cuts of the `v2` branch ([`../PRODUCT.md`](../PRODUCT.md) § Steering).

**One inconsistency is still live and is not a documentation error.** `.github/workflows/verify.yml`
triggers only on a push to `main` and still carries the 8-shard Playwright e2e matrix that `v2` no
longer has; reconciling that workflow with the rebuilt portfolio is a separate task, recorded in
[`CONTRIBUTING.md`](CONTRIBUTING.md) § The gate split.

## 7. Fixtures

**The validation set is the six team fixtures** — one each for the barbarian, bard, monk, paladin,
rogue and wizard roles. They live in the private content pack and are composed through the
gitignored `content-pack/` symlink; the public tree derives what it needs at runtime and skips when
the pack is absent (`tests/e2e/team-fixture.ts`), because the stored names are personal data. They
are **verification fixtures, never production data** (domain rule D7): `MOCK_CHARACTER` remains the
only production mock. Any schema, derived-value or stored-string change validates against all six
([`CHARACTER_SCHEMA.md`](CHARACTER_SCHEMA.md) §7).

`tests/fixtures/creation-candidate.ts` supplies the typed creation candidate the creation and rules
suites share, and `tests/_harness/`, `tests/helpers/` hold the shared harness.

## 8. Three guards still read the archived v1 ledger

The v1 automation-coverage files were archived, not deleted, precisely because three suites read
them. Each carries the same comment — _"v1 coverage ledger, frozen under docs/archive/v1 on
2026-09-09; this guard leaves with the mechanics kernel"_ — so the dependency is deliberate and
time-boxed:

| Guard                                              | Reads                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `tests/unit/combat/coverage.guard.test.ts`         | `docs/archive/v1/automation-coverage.prototype.json`                                       |
| `tests/unit/mechanics-transcription.guard.test.ts` | `automation-coverage.generated.json`, `automation-coverage.feature-actions.generated.json` |
| `tests/unit/grant-kind-exposure.guard.test.ts`     | `docs/archive/v1/AUTOMATION_COVERAGE.md` — every open gap must still be recorded there     |

Do not move or prune those four archived files while these guards exist. They leave together with
the mechanics kernel ([`adr/0003-mechanics-kernel-not-adopted.md`](adr/0003-mechanics-kernel-not-adopted.md)).

## 9. Adding a test

Golden rule 13: TDD for behaviour changes — observe the failure first. Golden rule 14: the cheapest
test that pins the fact, at the **lowest lane that can observe it**. A DOM-bound `.test.ts` belongs
in `tests/lanes.ts`, not in the fast lane. A new closed union gets its exhaustiveness check, not a
list of examples. A new incident gets a golden replay named after it. A rules change ships emulator
tests in the same commit (golden rule 33).
