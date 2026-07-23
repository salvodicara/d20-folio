---
"d20-folio": patch
---

Add a lazy SRD-kind tier to the i18n layer: display-only content catalogues (starting with the bestiary) load on demand per locale via `ensureSrdKind`, staying off the eager startup bundle while the six completeness locks hold unchanged.
