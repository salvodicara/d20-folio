---
"d20-folio": patch
---

docs(mechanics): the marked-target rider label points at the key family it actually uses

Two canonical docs still named `combat.vsMarkedTarget_<token>` as the live key for the "vs marked /
cursed target" rider label. That family was merged into `combat.attackScope_*` when the attack-scope
clauses adopted the same phrases, so both references were dangling.
