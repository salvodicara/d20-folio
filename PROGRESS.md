# Progress

Where d20 Folio stands today, in one page. No history: the changelog, the changesets and git own
that.

## The milestone

**One whole session of the group without opening Owlbear, D&D Beyond or a calculator**
([`PRODUCT.md`](PRODUCT.md) § Steering). Everything below is measured against that single sentence,
not against a count of shipped screens.

## Current block

**PD — Engagement and progressive-disclosure design**, inserted between P10 and P11a by the
owner's feedback of 9 September 2026: the experience is "troppo fredda, distaccata e
amministrativa". PD must study Baldur's Gate 3 and D&D Beyond for real and record the evidence,
redesign the character-creation journey as the representative path, produce a raster art direction
for spells and combat content, and prove both expert speed and beginner discovery. The owner's
verdict closes PD; **P11a does not start before it**.

The single source for what to do next is [`docs/program/NEXT.md`](docs/program/NEXT.md); the
execution frontier and the closed blocks are in
[`docs/PROGRAM_STATUS.md`](docs/PROGRAM_STATUS.md); the whole plan P01–P30 with its dependencies is
[`docs/program/PROGRAM.md`](docs/program/PROGRAM.md).

## Where the work happens

Two branches, never merged:

- **`main`** — the production app the group actually plays on. It receives production fixes only,
  cherry-picked into `v2` when they matter there.
- **`v2`** — the new application, rebuilt from zero. It is released only when the milestone is
  reached.

Blocks **P01 through P10** are closed on `v2` (identity and privacy, shared state and offline,
library and versions, the homebrew editors for all eleven families, the class and subclass model
and editors, the shell, and guided creation with import). Their integration SHAs and evidence are
tabulated in [`docs/PROGRAM_STATUS.md`](docs/PROGRAM_STATUS.md); P10 closed at `59b20e75`.

## Release state of `main`

- Version `0.24.0` (`package.json`), last release tag **`v0.24.0`**, changelog head `## 0.24.0`
  ([`CHANGELOG.md`](CHANGELOG.md)).
- `main` is at `9b06b75` as recorded by [`docs/PROGRAM_STATUS.md`](docs/PROGRAM_STATUS.md).
- `main` is the integration line, **not** proof of what is deployed. What production runs is known
  only from the deploy the owner triggered, never inferred from a branch.

## What v2 is not yet

None of the following has happened, and none is authorised by any plan in this repository — each
is an explicit owner gate (golden rule 33):

| Not yet                      | Owner                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Any deploy, staging included | owner gate, per change                                                                                               |
| Real-data migration          | **P30** (data import and verified cutover), with **P11b** for the personal-data cutover, under the ADR-0009 protocol |
| Cutover from production      | **P30**; production keeps running untouched until then                                                               |
| A release cut for `v2`       | after the milestone, never as part of an integration                                                                 |

Two further gates are open in [`docs/PROGRAM_STATUS.md`](docs/PROGRAM_STATUS.md): the staging
Google sign-in provider (an owner console action, pending since 2026-09-03) and PD's own verdict.

Also unresolved by design, not by omission: the live play surface is reachable in code but the
shell still declares the `table` scope unavailable
([`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §8), the personal encounter document still holds a
legacy shape until P11b ([`docs/CHARACTER_SCHEMA.md`](docs/CHARACTER_SCHEMA.md) §5), and
out-of-combat mechanical freedom still needs its own design pass
([`docs/program/NEXT.md`](docs/program/NEXT.md) § Open).

## Where to look for what

| Question                                | Document                                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| What are we building, and for whom      | [`PRODUCT.md`](PRODUCT.md)                                                                                     |
| What must always be true                | [`docs/PRODUCT_CONSTITUTION.md`](docs/PRODUCT_CONSTITUTION.md), [`docs/GOLDEN_RULES.md`](docs/GOLDEN_RULES.md) |
| What to do next                         | [`docs/program/NEXT.md`](docs/program/NEXT.md)                                                                 |
| The whole plan and its order            | [`docs/program/PROGRAM.md`](docs/program/PROGRAM.md)                                                           |
| The frontier, closed blocks, open gates | [`docs/PROGRAM_STATUS.md`](docs/PROGRAM_STATUS.md)                                                             |
| Dated owner decisions                   | [`docs/program/DECISIONS.md`](docs/program/DECISIONS.md)                                                       |
| How the system is built                 | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                                                                 |
| What the rules engine executes          | [`docs/MECHANICS.md`](docs/MECHANICS.md)                                                                       |
| What is stored, and how it migrates     | [`docs/CHARACTER_SCHEMA.md`](docs/CHARACTER_SCHEMA.md)                                                         |
| The visual and interaction contract     | [`DESIGN.md`](DESIGN.md)                                                                                       |
| The gate lanes and their numbers        | [`docs/TEST_PORTFOLIO.md`](docs/TEST_PORTFOLIO.md)                                                             |
| Why a structural decision was taken     | [`docs/adr/`](docs/adr/)                                                                                       |
| How to work on this repository          | [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md), [`docs/WORKTREES.md`](docs/WORKTREES.md)                       |
| What changed and when                   | [`CHANGELOG.md`](CHANGELOG.md), `.changeset/`, git                                                             |
| Anything about v1                       | [`docs/archive/v1/`](docs/archive/v1/) — history, never an instruction                                         |
