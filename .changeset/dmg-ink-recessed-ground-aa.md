---
"d20-folio": patch
---

fix(a11y): the light `--dmg-*-ink` ramp now clears WCAG-AA on every ground it actually paints on. The ink guard only ever pinned the family against `--bg-surface-1/2`, never against `--bg-recessed` — the carved `.beast-ref`/`.mon-ref` statblock plaque the compendium monster entry really renders on — so eleven of the thirteen light pigments shipped below the 4.5:1 floor there (poison at 3.378:1 on `compendium-monster-entry [light]`). The guard now derives the plaque's ground straight out of `folio.css`, and each failing pigment is darkened minimally in OKLCH at its own hue + chroma; radiant is the one the floor cannot leave at its own lightness — it and lightning cap at the same value on their shared hue — so it goes deeper instead.
