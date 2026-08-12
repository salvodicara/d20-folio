---
"d20-folio": patch
---

Preserve a character's unfinished action economy when navigating from their sheet to the campaign
hub and back, while retaining the existing reset on real turn boundaries and character switches.
Track both away-to-own transitions and missed round changes so reactions, movement, actions and
turn-scoped undo entries refresh exactly once at the next genuine turn start.
