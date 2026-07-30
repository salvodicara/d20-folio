---
"d20-folio": minor
---

Under the hood: one ready-made level-1 build per class (`src/data/quickbuild.ts`), a pure
applicator that turns a preset into creation state (`src/lib/quickbuild.ts`), the seeded flavour
roller behind Randomize (`src/lib/quickbuild-random.ts`), and the choice model both share — every
pending `choice-*` slot a new character owes — lifted out of the wizard into
`src/lib/creation-choices.ts`, so the pickers the wizard renders and the answers a preset fills can
never drift apart. Presets are authored against the FULL game (each class's own printed spell
recommendations and its conventional origin) and the private content pack REPLACES a public preset
per class through a new `overlayPackRecord` seam, keeping the SRD-only build on its licence-clean
fallbacks. Guarded by a legality/completeness battery derived from the preset table, a seeded
property battery over every class, and the real wizard driven per preset.
