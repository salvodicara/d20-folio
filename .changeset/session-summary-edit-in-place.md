---
"d20-folio": patch
---

Campaign → Sessions: the session-summary read↔edit swap no longer resizes/jumps the box. Editing a
recap used to hard-swap the rendered markdown for a FIXED 4-row (min-height 88px) textarea that bore no
relation to the content — a jarring geometry jump, compounded by an autofocus scroll-yank and an action
row that changed shape. The editor is now content-sized (`field-sizing: content`) seeded off the read
content and capped at the same reading bound, so read and edit share one footprint (no fixed rows, no
drag handle); focus no longer yanks the accordion; and the empty / read / edit states are unified into
one structure whose right-aligned action row keeps the same height whether it holds one button (Edit /
Add) or two (Cancel / Save). Committing a recap stays an explicit Save/Cancel (safe against
accidental blur-loss); only the short session name commits on blur.
