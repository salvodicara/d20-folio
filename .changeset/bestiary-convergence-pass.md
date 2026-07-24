---
"d20-folio": patch
---

Bestiary convergence pass (internal, no behaviour change): correct the
`docs/ARCHITECTURE.md` lazy-kind gate description to the shipped code — the
`ensureSrdKind("monster")` gate lives at the two registry consumers (the
`CompendiumPage` route factory and the `CommandPalette` specs-import effect),
deliberately not a specs-barrel top-level await (which would fragment the eager
chunk graph, the `fix(build)` regression already removed); de-duplicate the
beast-projection sync script against the shared helpers (the canonical `formatCr`
from `src/lib/utils.ts` + `JSON.stringify`, verified byte-stable); fix the
`fmtXp` JSDoc on `MonsterStatBlockCard`; and drop the needless readonly-const
spread copies in the monster compendium spec.
