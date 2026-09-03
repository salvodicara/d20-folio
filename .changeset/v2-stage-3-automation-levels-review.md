---
"d20-folio": patch
---

Fix the combat reducer's `log-only` gate: a held reaction window now withholds its cost too, and the gate is one `commitAt` switch over a type-narrowed automation level instead of three duplicated checks.
