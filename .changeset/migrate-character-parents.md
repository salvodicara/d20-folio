---
---

Add the read-only-by-default legacy parent cutover script: unmarked parents move their play session into `combat/state.playState` (creating the child at the app's own effective maximum HP when absent), every parent gains `revision`, and the report carries counts, hashes and issue codes only. The plan reproduces what the client's own cutover would write — the same `parseCharacterEnvelope` hydration, the same `effectiveMaxHp`, and a final strict re-parse of the projected `combat/state` — and never touches `build` or `updatedAt`, so the public share projection needs no write. `docs/RELEASE.md` gains the ADR-0009 migrate-before-deploy gate and `docs/PROGRAM_STATUS.md` the pending-migrations list.
