---
"d20-folio": patch
---

The **PDF character-sheet export now draws the character's resources.** The renderer had long
computed a full resource view-model — every consumable pool (Rage, Bardic Inspiration, Channel
Divinity, Ki, Sorcery Points, magic-item charges …) with its remaining count and recovery cadence —
but never drew it, so the exported PDF silently dropped the character's trackers. It now appends a
faithful-to-the-sheet **Resources ledger**: one row per pool with its name, a die badge where it
rolls one, the pool as pips (small pools, filled = remaining) or a "remaining / total" count with its
unit (larger pools), and the recovery cadence (Short Rest / Long Rest / Dawn). A character with no
trackers gets no empty page, and a long list paginates rather than clipping. The recovery labels and
counts read from the same single source the on-screen cockpit uses, so the print snapshot matches the
app exactly.
