---
"d20-folio": patch
---

Retire the golden-replay runner's pre-log `relations` seed: `dice-provenance.json`'s visibility
facts are now `declare` actions inside the replayed log, closing the gap stage 1 left open.
