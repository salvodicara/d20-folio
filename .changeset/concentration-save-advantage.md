---
"d20-folio": patch
---

The Concentration-save prompt now shows when you have Advantage on the save. A character with
War Caster or the Warlock's Eldritch Mind invocation has Advantage on Constitution saving throws to
maintain Concentration — the grant was already aggregated but the "roll a Concentration save" toast
never surfaced it. Taking damage while concentrating now reads the netted Advantage off the
aggregate (a same-source Disadvantage cancels it, per RAW) and appends "Advantage" / "Vantaggio" to
the toast, so the reminder to roll matches the rules at the table. No dice are rolled — the app only
tells you your save total and that it has Advantage.
