---
"d20-folio": patch
---

feat(combat): pin Disadvantage on Initiative for a surprised character (RA-25)

The Initiative vital's advantage toggle now has a fourth setting: Disadvantage. When your character
is surprised — or a DM rules Disadvantage on your Initiative roll — you can pin it on the sheet, and
the Init corner shows a danger-hued mark in play (matching the existing gold Advantage mark). The
edit toggle cycles Auto (from features) → Advantage → Disadvantage → Normal. Surprise is a per-scene
call the sheet can't derive on its own, so it stays a manual pick; every automatic Initiative
Advantage (the Assassin's Assassinate) still resolves on its own. No dice are rolled — the app shows
the state, you roll externally.
