---
"d20-folio": patch
---

Make the `party-unified` Custom-tab picker tests deterministic. Opening the
Add-monster modal mounts the SRD Bestiary tab by default, and in jsdom the
virtualized `ResultList` can't measure a positive-height viewport — so it renders
all ~330 corpus rows un-windowed (the deliberate zero-height fallback; production
measures a real viewport and windows to ~40 rows, so the heaviness is jsdom-only).
Combined with the lazy chunk import + `ensureSrdKind("monster")` corpus load, this
is the file's heaviest interaction (~2.4s under load) and intermittently overran
the default 5s per-test cap under CI machine load. Raise the per-test timeout to
15s on exactly the two picker-opening tests (assertions unchanged; no global
loosening). Test-harness only — no app or token change.
