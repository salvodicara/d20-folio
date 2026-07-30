---
"d20-folio": patch
---

The statblock surfaces clear the a11y gate again. The light damage ramp's `cold` ink was the one
arm the plaque fix never measured (a leaf prints only its own damage types, so the browser probe
saw Acid alone) and it sat at 4.49:1 on the carved plaque — it steps one notch deeper (#2a6486,
4.77:1, level with acid). The DM's encounter statblock modal grew its own scroll `div` instead of
the shared recipe, so a keyboard user could not reach it to scroll (axe
`scrollable-region-focusable`, both themes); the recipe now has one home, `ModalScrollColumn`,
which the compendium detail column takes too — read-only bodies only, since a scroll column with
interactive content already satisfies the rule. The contrast guard stops hand-listing what it
sweeps: both ink ramps (`--dmg-*-ink`, `--cond-*-ink`) and the plaque's own ground are derived out
of the stylesheet behind a non-empty floor, so a new damage type, a new condition or a re-seated
plaque widens the sweep by itself.
