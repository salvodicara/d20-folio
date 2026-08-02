---
"d20-folio": minor
---

The status ledge — BG3-style status badges on the turn meter. The Play tab's floating status
banners ("Concentrating on X" + "Stop concentrating"; "Disadvantage on attack rolls (Frightened)")
are replaced by compact iconic badges integrated into the turn altar's bottom tier: the gold
concentration badge wears the spell's name, each limiting condition is one badge in its own
condition hue with a per-condition glyph, Exhaustion carries its level, and the slot advisory
reads in the warning tone. Detail is explain-on-demand: every badge opens a folio popover with
the full effect sentences — the concentration popover carries the one-tap "Stop concentrating"
and the blocked-cause note. One badge per CAUSE (`composeStatusBadges` over the
`composeTurnLimiters` VMs, which now carry a stable `causeId`); action prompts (Prone stand,
regen apply, round-1 reminder, maintained keep/end) stay visible action banners.
