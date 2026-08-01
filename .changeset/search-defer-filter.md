---
"d20-folio": patch
---

perf(search): decouple typing from filtering across the picker + compendium

Typing in a large search — the monster picker, the compendium, every Add-X modal —
re-filtered and re-rendered the whole result set synchronously on each keystroke, so
the caret stalled behind hundreds of rows on big pools. The result list is now driven
by a `useDeferredValue` copy of the query: the input stays controlled on the immediate
value (keystrokes paint at once) while the heavy re-filter runs at low priority and a
burst of keystrokes coalesces into one pass. Wired at the shared seam
(`useCompendiumPicker`) so all five Add-X modals and the compendium inherit it.
Results and ranking are unchanged — the deferred set always settles on exactly what
the final query selects; the scroll-memory reset is keyed to the deferred query so it
stays in lock-step with the list on screen. (The ⌘K palette keeps its query
synchronous — its roving keyboard nav must track the typed query in the same commit —
and is sped instead by the corpus-normalization cache.)
