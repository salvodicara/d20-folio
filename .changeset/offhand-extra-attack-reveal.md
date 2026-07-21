---
"d20-folio": patch
---

Fixed Two-Weapon Fighting for characters with Extra Attack: dual-wielding two Light weapons now
correctly reveals the off-hand attack. Previously a Fighter, Ranger, Barbarian, or anyone else with
Extra Attack who attacked with a Light weapon never saw their off-hand attack appear, because the
main swing was tracked through the Extra-Attack ledger rather than the Action slot the reveal gate
watched. Committing a Light main-hand attack now surfaces the off-hand (and its Nick free-attack)
in every case; the once-per-turn off-hand cap and undo still hold.
