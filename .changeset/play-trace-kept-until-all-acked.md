---
"d20-folio": patch
---

An offline play edit (hit points, a spent resource) keeps its safety copy until every queued play write is acknowledged. Before, a later write with nothing to send could erase it while the edit still waited in the queue, so a newer app version could refuse the edit with no copy left to offer back.
