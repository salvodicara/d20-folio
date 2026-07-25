---
"d20-folio": patch
---

fix(a11y): the light `--cond-*-ink` ramp now clears WCAG-AA on every ground it actually paints on. Like the damage ramp before it, the condition guard only pinned the family against `--bg-surface-1/2` and the chip tint — never against `--bg-recessed`, the carved `.beast-ref`/`.mon-ref` statblock plaque that `.rt-cond` prose lands on inside a monster's traits — so six of the fifteen light inks sat below the 4.5:1 floor there (deafened 3.685:1, blinded 3.756, exhaustion 4.009, prone 4.081, stunned 4.120, charmed 4.453). The guard now derives the plaque's ground straight out of `folio.css`, and each failing ink is darkened minimally in OKLCH at its own hue; blinded and stunned separate from invisible / paralyzed by chroma (mirroring the dark ramp) where the floor caps them at the same lightness, so the family stays readable at a glance.
