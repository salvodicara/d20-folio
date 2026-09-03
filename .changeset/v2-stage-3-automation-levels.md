---
"d20-folio": patch
---

Add the `full-auto`/`log-only` campaign automation levels to the combat reducer (ADR-0011):
`log-only` computes the same verdict but withholds its state transition, letting the DM apply it
by hand through `override`. `propose-and-confirm` is rejected until stage 6 builds it.
