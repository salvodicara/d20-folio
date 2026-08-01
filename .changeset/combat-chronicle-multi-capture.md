---
"d20-folio": minor
---

Auto-narrated combat, Phase 2 (multi-target capture): in a live encounter, a committed multi-target action (Magic Missile's darts, Scorching Ray's rays) now opens a MULTI-select target picker, capped at the action's own instance count; single-target swings stay single-select (Phase 1 unchanged). Single- vs multi-select is decided purely from the action's modeled shape (`summary.instances`) — an area save-spell carries no instances and stays single. The declared target SET + its drop bound ride the existing `recentActions` ring (no new write). Solo play remains untouched.
