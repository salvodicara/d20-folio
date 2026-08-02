---
"d20-folio": patch
---

perf(character): trim the status-badge icon map to the limiter-causing conditions. A status badge
only exists for a condition that imposes a turn LIMITER, so the eager icon map now imports ONLY
those glyphs and drops `charmed`/`deafened`/`invisible` (no self-side turn limiter → never badged
today; a seam comment restores them if that ever changes). Confirms the badge look is unchanged
and keeps the eager bundle honest against the P3 budget.
