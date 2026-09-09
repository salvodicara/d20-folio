---
"d20-folio": patch
---

Archive the v1 documentation set and the tactical-codex-atlas visual boards under
`docs/archive/v1/` (history preserved via `git mv`), with a new `docs/archive/v1/README.md`
salvage index. Three v1 guard tests (`grant-kind-exposure`, `combat/coverage`,
`mechanics-transcription`) now read the automation coverage ledger from its archived path.
