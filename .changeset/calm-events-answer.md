---
"d20-folio": patch
---

Harden reactive mechanics dispatch so every event carries its exact emission state, freezes eligible program phases at that moment, and rejects forged, stale, duplicated or recreated subscriber work.
