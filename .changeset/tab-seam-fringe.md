---
"d20-folio": patch
---

The active tab is now truly one piece with its page: the seat line is never
drawn where it must not exist (resting tabs' own border + the row's gap
gradient — paint order makes a line across the active tab impossible), the
page drops its top border, inset elevation sheens, and upward-shadow bleed,
the head band equals the tab fill by definition, and a revealed off-edge tab
lands clear of the dissolve zone.
