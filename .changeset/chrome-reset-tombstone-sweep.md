---
"d20-folio": patch
---

refactor(identity): sweep the chrome reset's tombstones — dead declarations, superseded comment blocks and prose naming deleted tokens as live. Two replaced comment blocks were left sitting ABOVE their replacements (the lasagna in comment form); a "square corners" note sat on the line that reversed that ruling; `.endturn` kept the `position`/`overflow` host seat of a deleted glint; `.modal-body:focus-visible` and `:focus-visible[tabindex="-1"]` kept `box-shadow: none` for a focus shadow that no longer exists — the second was also a latent violation, out-specifying `.folio-panel` at (0,2,0) so a focused `tabindex="-1"` plate would have shed its material. Also drops `--plate-face-veil`, a ninth material primitive with one consumer that only restated `--plate-face` at a per-theme alpha: the alpha is now `--plate-veil-alpha` and the gradient is inline at `.folio-panel::before` (verified pixel-identical in both themes). Eight primitives, guard-pinned.
