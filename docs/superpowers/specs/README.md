# Block specifications

One specification per block, named `YYYY-MM-DD-<block>-design.md`. From 2026-09-10 every
specification opens with its reference dossier, before any design (golden rule 30, enforced by
`tests/unit/docs-budget.test.ts`). Earlier specifications are grandfathered history.

## Reference dossier

One entry per surface or mechanism of the block, six lines each:

- **Surface** — the screen, component, data model or workflow this entry covers.
- **Product** — who already does it well: Baldur's Gate 3, D&D Beyond, Owlbear Rodeo, Foundry VTT,
  Roll20, Kanka…
- **Evidence** — URL, capture path under `docs/program/reference/`, or research file.
- **Copied** — the pattern taken as it is.
- **Adapted** — what changed for d20 Folio.
- **Why** — the reason the adaptation is not a reinvention.

A design with no dossier has not started. An invented pattern where a proven one exists is a
specification ❌. Assets are never copied — only patterns and taxonomies.
