---
"d20-folio": patch
---

fix(sheet): the tag picker's Esc is owned by one layer only — the dismiss hook — so it can never leak into edit mode, and an idle picker still lets Esc through.
