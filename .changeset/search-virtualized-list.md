---
"d20-folio": patch
---

perf(compendium): virtualize the result list — the whole pool, windowed

The shared picker/compendium result list used to mount a row for EVERY entry (all
~330 monsters, ~420 spells), so each keystroke reconciled the entire list and cold
open paid to build it. It now WINDOWS: only the on-screen slice plus an overscan
margin is mounted (≈16 rows), over a full-height spacer, so the reader still scrolls
the ENTIRE pool — no cap, no ceiling, no "refine" message — while typing and cold open
stay cheap. Implemented as a small dependency-free windowed list (`ResultList`'s
`VirtualRows`): it measures one real row's stride, tracks the scroll box, and mounts
the visible range; where there is no layout to measure (jsdom, zero-height hosts) it
renders every row, un-windowed but correct. The row markup, verdict, already-added
state, selection, and the page's arrow-key nav are unchanged (a generous overscan
keeps the next row mounted for ↑/↓); scroll-depth restore is now exact raw `scrollTop`
against the fixed-height spacer. No dependency added — the eager bundle and precache
budgets are untouched.
