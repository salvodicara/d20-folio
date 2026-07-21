---
"d20-folio": patch
---

The Add-item equipment picker no longer snaps its results list back to the top when the character
saves in the background. Scrolling the list while the ~2s auto-save (or any session/HP tick) fired
used to reset the scroll to row 0, because the list's scroll memory was keyed on the results array —
which is re-created on every character-store write even when the visible rows are identical. The
scroll now resets only when the search query or a filter actually changes, and holds its place
through background saves.
