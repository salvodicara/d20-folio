---
"d20-folio": minor
---

feat(campaign): the DM's "Add monster" control now opens a bestiary picker modal — search the full 331-monster corpus (name + prose), facet by CR band / size / type, read the full statblock, set a count (capped at 20), and add. A bestiary add pre-fills the group from the statblock (localized name · AC · average HP · blank initiative) and stamps the additive `srdId`; the manual path survives as the modal's Custom tab. Reuses `CompendiumPicker`/`monsterSpec` via a derived add-mode spec — no bespoke browser. The whole bestiary surface loads in ONE lazy chunk on first open, so the app's eager bundle gains zero bytes (tripwired). Adds a spec-driven `quantityMax` to the shared picker footer.
