---
"d20-folio": patch
---

Re-baselined the bundle budget's entry-chunk ceiling (61 → 62 KB gz) to absorb the ⌘K reference
palette entries' shell code (the always-mounted palette's search entries + their bilingual keyword
terms). No user-facing change; the reference data itself stays lazy (loaded only with the Combat
tab), so the cold first-paint download is unaffected.
