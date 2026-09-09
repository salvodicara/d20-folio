# The program

The delivery program for d20 Folio v2, in the repository so that Claude Code and Codex read the
same thing. Read [`NEXT.md`](NEXT.md) first; read the rest only when the block needs it.

| File                                | Owns                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------- |
| [`NEXT.md`](NEXT.md)                | The only handoff: current block, closed SHAs, open work, opening prompt    |
| [`PROGRAM.md`](PROGRAM.md)          | Blocks P01–P30 and PD, dependencies, exit acceptance, next-block selection |
| [`CHECKLIST.md`](CHECKLIST.md)      | The A–D controls that close a block                                        |
| [`DECISIONS.md`](DECISIONS.md)      | Dated owner decisions, newest first                                        |
| [`reference/`](reference/README.md) | The approved mock's manifest, the shell r2 decisions, curated screenshots  |

Reading order for a new session: `CLAUDE.md` → `NEXT.md` → the current block's row in `PROGRAM.md`
→ the pertinent screenshots in `reference/` → `CHECKLIST.md` when closing.

Execution state — frontier, gates, integration SHAs — is owned by
[`docs/PROGRAM_STATUS.md`](../PROGRAM_STATUS.md), never duplicated here. Product direction is owned
by [`PRODUCT.md`](../../PRODUCT.md); durable repository rules by
[`docs/GOLDEN_RULES.md`](../GOLDEN_RULES.md).
