---
"d20-folio": patch
---

chore(perf): re-baseline the PWA precache ceiling to 8046 KiB after the RA-wave W2 rules content (RA-18/19/20/21/32/34 + the Hex/Hunter's Mark toggle labels) grew existing JS/JSON chunks with ~28 new bilingual strings and the four new BASE_ACTIONS entries — measured 8040.32 KiB, no new precache entries or assets.
