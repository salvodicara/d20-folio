---
"d20-folio": patch
---

Rewrite `docs/ARCHITECTURE.md` (30 KB) and `docs/MECHANICS.md` (28 KB) from the v2 code, replacing the archived v1 documents: layers and guards, the reducer and its dice seam, the shared `encounters/live` document and its lease, identity, library, creation, the shell, persistence and rules, the pack seam, the gates and the ADR index; and, in MECHANICS, the absorbed authoring format, the vocabulary the reducer executes today, the automation levels, the E01–E22 assignment and an honest list of what is not automated. Both documents embed the five archify diagrams from `docs/diagrams/` and record where the code contradicts a spec or an ADR — `propose-and-confirm` is declared by ADR-0011 but refused by `applyTable`, `negate` conforms but executes as a no-op, and two Firestore worlds (`folioAccounts/*` and `users/*` + `campaigns/*`) are both live.
