---
"d20-folio": minor
---

Combat Chronicle — the player-damage flip. On a hit, the player now types the damage
they rolled in the in-encounter declaration panel and it applies to the target monster's
HP right away, so the chronicle narrates the player's number (previously the DM lowered
HP and the app read that delta). Single-target takes one damage field, Magic Missile a
per-target field, and Fireball one rolled number applied in full to everyone (the DM
trims those who save). The damage lands on the shared encounter through a narrow,
member-scoped Firestore write, and every applied number stays fully correctable — the DM
freely re-adjusts any monster's HP and can undo any applied hit line in the live feed
(removing the line and restoring the HP in one tap). Bilingual EN + IT, with an
explain-on-demand tip on the new damage field.
