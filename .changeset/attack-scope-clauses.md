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

Each scoped line is netted against the verdict rather than printed beside it, so a Barbarian who is
Prone and attacking recklessly reads "Disadv. · Straight roll on Strength attacks" — one true
statement per roll, never two contradictory ones. A scope the card's rolls can never be in (a
Sorcerer-spell clause on a weapon swing) is dropped outright, and the unproficient-armor penalty
stops claiming a wizard's spell attacks, which it never touched.

Every attack clause must now declare that scope, so the mistake is no longer expressible in the
data. And Vow of Enmity became the 1-minute activation it is in the rules: spending Channel
Divinity on its card utters the vow, lights the toggle, and starts a countdown that ends the vow
after a minute — before that, an Oath of Vengeance paladin no longer carries a permanent Advantage
they never earned.
