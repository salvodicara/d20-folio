---
"d20-folio": patch
---

fix(combat): an attack advantage that only holds against one creature stops claiming every swing

A clause the sheet cannot resolve — Precise Hunter's Advantage against your Hunter's Mark target,
Vow of Enmity's against the vowed creature, Studied Attacks' against the one you missed,
Assassinate's against a creature that has not acted, Reckless Attack's Strength-only reach, Innate
Sorcery's spell-only reach — was netted into the attack card's Adv./Disadv. verdict as though it
applied to every roll. The card now STATES the scope instead: "+9 to hit · Adv. vs marked target",
the same grammar the Hunter's Mark damage rider already shows beside it. Only a clause that truly
applies to every attack roll still reads as a bare verdict.

Every attack clause must now declare that scope, so the mistake is no longer expressible in the
data. And Vow of Enmity became the 1-minute activation it is in the rules: spending Channel
Divinity on its card utters the vow, lights the toggle, and starts the countdown — before that, an
Oath of Vengeance paladin no longer carries a permanent Advantage they never earned.
