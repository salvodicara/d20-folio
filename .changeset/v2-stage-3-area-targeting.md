---
"d20-folio": patch
---

`TargetSpec.count` accepts `"area"` with an `AreaShapeSpec`: the reducer derives affected entities
itself from the caster's declared origin/aim and every entity's current position (stage 2's
`areaMembership`), never from a client-supplied target list. No new step vocabulary — an area
save-and-halve spell reuses the existing `save`+`damage` step pair.
