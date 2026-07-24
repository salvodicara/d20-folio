---
"d20-folio": patch
---

Homebrew spell-slot counts now stick. You could already edit a slot level's total in the spells
editor, but the count was silently reset the next time you changed a class or level, or leveled up.
That override is now durable: it is pinned to your character and re-applied through every recompute,
with a reset-to-auto button to return any level to its rules-derived count (RA-33). A multiclassed
Sorcerer/Warlock can pin the normal and Pact-Magic pools at the same level independently, and
changing class correctly clears a now-stale override. No character loses data — the override is
stored only when a count differs from the default.
