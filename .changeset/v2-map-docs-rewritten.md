---
"d20-folio": patch
---

Rewrite the remaining map documents from the v2 code: `docs/CHARACTER_SCHEMA.md` (the stored shapes, the closed-world codec contract, the legacy `users/**` world still live, the migration protocol), `DESIGN.md` (dark-only, the frozen mock 0.9.3 as reference, the 7 September shell corrections, PD as the open design question, with the token frontmatter pruned to what `src/index.css` actually references), `PROGRESS.md` (the milestone, the current block and where to look for what) and `docs/TEST_PORTFOLIO.md` (the v2 gate lanes, the last measured P10 numbers at `59b20e75`, the performance budget and what was deleted). Add `tests/unit/docs-budget.test.ts`, which makes every documentation size cap enforceable and pins the handoff headings and the committed graph. Trim `docs/diagrams/README.md` under its 2,000-byte cap and turn the plain mentions of the four rewritten documents in `docs/ARCHITECTURE.md` and `docs/MECHANICS.md` into links.
