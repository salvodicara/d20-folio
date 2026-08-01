---
"d20-folio": patch
---

Fix the compendium type-switch crash (GitHub #7): a render-phase state reset
lets the current pass finish with the OLD state, so the spell facet
predicates ran against another type's filter shapes (value.conc of
undefined) and every later switch re-crashed the body, leaving stale lit
tabs. The picker now derives PASS-LOCAL effective values (query, facets,
selection) whenever the spec changes, and a regression suite pins the
spec-switch survival.
