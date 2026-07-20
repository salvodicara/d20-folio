---
"d20-folio": patch
---

Search now matches on WORD TOKENS instead of the whole query as one contiguous substring. The
shared `matchesSearch` splits the normalized query into whitespace tokens and matches when EVERY
token appears somewhere in the joined candidate corpus, so word order and interstitial words no
longer break a match: an Italian player typing "pozione guarigione" now finds "Pozione di
Guarigione" (the interstitial "di" simply isn't a query token). The fix lives in the ONE shared
matcher, so it propagates everywhere search runs — the roster, the ⌘K command palette, and every
picker. Case-, accent-, partial-token- and bilingual-insensitivity are preserved, and the
name-over-description ranking of `rankedSearch` is unchanged.
