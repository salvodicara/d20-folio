---
"d20-folio": patch
---

perf(search): precompute the normalized search corpus instead of rebuilding it per keystroke

Every keystroke rebuilt each entry's searchable text from scratch: for the bestiary,
all ~330 monsters re-ran `monsterProse` (a nested loop of i18n lookups over every
statblock entry × locale × field) and `matchesSearch` re-normalized the whole corpus.
Both are stable while the user types, so they are now memoized: `monsterProse` caches
its haystack per `${id}:${locale}` (the same precomputed-`searchEn` precedent the
inventory uses), and `matchesSearch`/`matchQuality` normalize STABLE candidates through
a bounded corpus cache (the query stays un-cached, so nothing grows without bound).
Match and ranking results are identical — a transparency guard pins byte-stable
searchText and unchanged match outcomes in EN and IT.
