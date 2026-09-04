---
"d20-folio": patch
---

Add `monsterMechanics(block)`: converts a typed `MonsterStatBlock`'s structured actions into
reducer-ready programs, degrading anything prose-only (Multiattack included — the corpus has no
structured attack count for it yet) to `manual-table` rather than half-building it.
