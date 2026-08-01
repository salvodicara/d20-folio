---
"d20-folio": patch
---

perf(search): decouple typing from filtering across every search surface

Typing in a large search — the monster picker, the compendium, ⌘K, every Add-X modal
— re-filtered and re-rendered the whole result set synchronously on each keystroke,
so the caret stalled behind hundreds of rows on big pools. The result list is now
driven by a `useDeferredValue` copy of the query: the input stays controlled on the
immediate value (keystrokes paint at once) while the heavy re-filter runs at low
priority and a burst of keystrokes coalesces into one pass. Wired at the shared seam
(`useCompendiumPicker`) so all five Add-X modals and the compendium inherit it, and
in the ⌘K command palette (its ~630-entry compendium fan-out). Results and ranking
are unchanged — the deferred set always settles on exactly what the final query
selects; the scroll-memory reset is keyed to the deferred query so it stays in
lock-step with the list on screen.
