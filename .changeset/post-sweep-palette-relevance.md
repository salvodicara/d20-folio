---
"d20-folio": patch
---

fix(palette): ⌘K ranks results by match quality — a word or compound-tail match always beats a substring buried inside another word, so "cover" stops returning the Recovery entries (a mid-word match still answers when nothing better matches at all).
