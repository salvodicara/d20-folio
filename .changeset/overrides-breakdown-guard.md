---
"d20-folio": minor
---

A number set by hand stays explained: AC, initiative, speed, Proficiency Bonus, max HP, saves, skills, passives, the spell save DC and attack, a spell-based action DC and a weapon's to-hit keep their computed lines and add one "Manual adjustment" line for the difference, so the lines still sum to the number shown. A pin sets the modifier: a hand-set skill now takes the Exhaustion penalty on top, as a hand-set save already did. The core exports `isHandSet(parts)`. The sheet's numbers now include the spell save DC and attack, and a guard checks that every one of them can be set by hand.
