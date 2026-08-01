---
"d20-folio": patch
---

perf(palette): keep the ⌘K query synchronous (the corpus cache already speeds it)

The command palette's results stay synchronous rather than deferred: its roving
keyboard nav (activeIndex reset + `aria-activedescendant`) must track the typed query
in the same commit, and a low-priority deferred render can be starved under load —
stranding ↑↓/↵ on a stale result set (it flaked the palette keyboard-audit journeys).
The ~630-entry compendium fan-out is instead kept cheap by the shared corpus-
normalization cache, so typing stays responsive with the keyboard flow rock-solid.
