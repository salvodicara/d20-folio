---
"d20-folio": patch
---

test: reach far-down picker entries by search under the result cap

Follow-through for the result-row cap: a picker/browse list now mounts at most 60
rows, so an entry that sorts past the cap in a large pool (a magic item, a monster,
a spell) is reached by SEARCH or a FACET rather than an unfiltered scroll. The
compendium browse specs and the Add-Item magic-items test now assert a populated list
plus a query/facet to surface a specific far entry — matching the shipped behavior in
both build modes (the pack's large pools are where the cap actually engages).
