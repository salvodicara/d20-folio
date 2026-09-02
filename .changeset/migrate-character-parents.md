---
---

Add the read-only-by-default legacy parent cutover script: unmarked parents move their play session into `combat/state.playState` (creating the child at full HP when absent), every parent gains `revision`, and the report carries counts, hashes and issue codes only. The script runs SRD-only (a plain node process cannot evaluate the composed content pack) and refuses, rather than rewrites, any family whose stored concentration would not survive canonicalization unchanged; `scripts/alias-loader.mjs` now honours the documented `VITE_CONTENT_PACK=0` opt-out. `docs/RELEASE.md` gains the ADR-0009 migrate-before-deploy gate and `docs/PROGRAM_STATUS.md` the pending-migrations list.
