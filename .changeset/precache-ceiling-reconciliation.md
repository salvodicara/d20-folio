---
"d20-folio": patch
---

The PWA precache ceiling steps 9033 → 9055 KiB for the MM-2025 bestiary pilot (wave 1 — the pack
half's first 10 statblocks EN+IT). A/B'd on one app SHA with only the pack varying: precache
9023.64 KiB / 300 entries → 9044.06 KiB / 301, eager 776.64 → 777.88 KB gz across the same 14
chunks. The guard's audit trail also gains the two earlier raises (binding corners, quickbuild) that
had only ever been recorded in `docs/ARCHITECTURE.md`, so both trails read the same history again.

The A/B also surfaced a seam debt, now ledgered as a MUST-FIX before MM wave 2: the lazy monster
corpus composes `packMonsters` from the eager-reachable `@pack` barrel, so pack monsters are
double-shipped into the eager `cockpit-engine` chunk as well as the lazy catalogues — leaving 1.12
KB gz under the eager ceiling, where the manifest's remaining 163 statblocks would need ~20.
