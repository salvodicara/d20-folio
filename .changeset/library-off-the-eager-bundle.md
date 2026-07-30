---
"d20-folio": patch
---

perf(library): the homebrew library leaves the eager bundle

The library's listener was called straight from `AppShell`, which put its store, model
and Firestore IO in the always-eager entry bundle and pushed both the entry chunk and
the eager closure past their P3 ceilings. It is now a renderless `LibraryMount`,
lazy-loaded exactly like the shell's combat mount, so the whole graph rides a 1.1 KB
chunk that loads after first paint: the entry (61.8 KB gz) and the eager closure
(775.6 KB gz, same 14 chunks) are back under budget with the feature's eager delta at
ZERO. The Custom tab also leaf-imports the picker's detail scaffold instead of the
barrel, so the compendium's spec set can never ride along.

The PWA precache ceiling steps 8967 → 8989 KiB for the feature's own (fully lazy) code,
with the baseline table in `docs/ARCHITECTURE.md` → "Performance budget (P3)" updated in
the same commit.
