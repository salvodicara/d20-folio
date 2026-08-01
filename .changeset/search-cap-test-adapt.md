---
"d20-folio": patch
---

test: reach far-down picker entries by search under the virtualized list

Follow-through for the virtualized result list: only the on-screen window of rows is
mounted, so an entry that sorts past the first screenful in a large pool (a magic
item, a monster, a spell) is in the DOM only once scrolled to — reached in a test by
SEARCH or a FACET rather than asserted in an unscrolled list. The compendium browse
specs and the Add-Item magic-items test assert a populated list plus a query/facet to
surface a specific far entry — matching the shipped behavior in both build modes (the
pack's large pools are where windowing actually engages).
