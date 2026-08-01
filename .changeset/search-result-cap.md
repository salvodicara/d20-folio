---
"d20-folio": patch
---

perf(compendium): cap the mounted result rows (no more full-pool reconcile per keystroke)

The shared picker/compendium result list mounted a row for EVERY entry — all ~330
monsters, ~420 spells — so each keystroke reconciled the whole list and cold
modal-open paid to build it (a 0-result query was instant, proving rendering, not
matching, dominated). The list now mounts at most 60 rows and, when the pool
overflows, shows a quiet "Refine to see more (N total)" footer (EN + IT) carrying the
truthful full total — the count line still reports the real number, so nothing is
hidden silently. No dependency added; the shown rows render and behave identically
(same markup, same keyboard traversal), so it is a pure rendering-cost fix.
