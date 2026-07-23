---
"d20-folio": patch
---

Add the `MonsterStatBlock` data model, the composed monsters aggregate, and the CR to XP/PB derivation helpers (numbers derived from CR, not stored), plus the `srd-monsters` lazy chunk split; drop the codex browse route from idle prefetch so its heavy chunk graph never downloads on startup.
