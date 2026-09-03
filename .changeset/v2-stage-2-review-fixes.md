---
"d20-folio": patch
---

Apply the independent stage-2 review: the `move` step now rejects a non-finite destination
instead of silently defeating the movement-budget check and corrupting position state
(`Number.isFinite` alongside the existing type guards), and the movement rejection's cost id
matches the `namespace:detail` convention every other cost site uses (`turn:movement`).
