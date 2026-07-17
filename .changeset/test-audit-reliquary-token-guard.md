---
"d20-folio": patch
---

test(identity): guard the Gilded Reliquary frame + engraved-title tokens exist per theme

The just-merged reliquary chrome defines `--frame-ornate` and `--engrave-title` once per theme
(dark strikes gilt, light strikes bronze). `css-token-defined.guard` only proves a token is defined
somewhere, so a dropped light-theme copy would silently paint the light theme with no hero frame /
flat title yet pass the gate. Adds a per-theme count guard (both tokens defined twice, both wired via
border-image + text-shadow) into the existing ornament-vocabulary guard — the cheapest test that pins
the fact.
