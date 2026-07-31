---
"d20-folio": patch
---

The owner's UX batch (grilled where ambiguous): tab selection can never jump — the
compendium ribbon no longer remounts on type switch (per-type state resets inside the
picker, only the keyed `.cmp-body` remounts), the reveal is a container-only minimal
nearest-edge nudge (never `scrollIntoView`), taps take focus scroll-free, and
re-selecting the active type is a no-op (the open entry survives); the cockpit strip
sheds its scrollbar and dead padding; the tab-search lens becomes a true toggle (the
blur/click flash race dies, closing clears the query); the command palette goes
mobile-native (no keyboard legend, no pre-selected row on touch); and the sheet-tail
sections lose their collapsed ghost padding. Pinned by tests/e2e/tab-no-jump.spec.ts and
new unit suites. The batch tests type cleanly (toHaveValue, optional call tuples).
