---
"d20-folio": patch
---

Custom monsters + monster portraits — the persistence model. The account library
gains a fifth `monster` kind: a reusable custom-monster template (name · AC · HP ·
creature type · CR · notes · portrait) that strips no play state and re-seeds per
encounter, capped like every other library entry. The same library document now also
carries a per-user `monsterArt` map — a portrait override keyed by a bestiary monster's
`srdId` — so one listener and one debounced writer serve both. Encounter monsters carry
an optional creature type + portrait, copied onto the shared encounter doc at add time
so every table member sees the same art beside the hero portraits. Storage reuses the
existing per-user `portraits/` path (a `monster-` filename prefix, world-readable like a
character portrait).
