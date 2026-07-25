---
"d20-folio": patch
---

fix(identity): the chrome reset, convergence — the light theme's plate, and the loose count

Two defects the axe + on-art-ink batteries caught after the three phases landed:

- **The light theme lost its plate face and its metal.** Three STRUCTURAL plate tokens
  (`--plate-face`, `--edge-metal`, `--edge-metal-earned`) were declared inside the
  `[data-theme="dark"]` block instead of `:root`. They are theme-independent by indirection — the
  values they point at are what differ — so in light they resolved to nothing, `background` and
  `border` fell back to their initial values, and every light card, panel and dialog rendered
  transparent and border-less over the candlelit backdrop. 21 light surfaces failed contrast. The
  `chrome-system` guard had missed it because it read "everything before the light block" as the
  root; it now walks the true `:root` block, and additionally asserts that a structural primitive is
  NEVER re-declared inside a theme block.
- **The section COUNT went loose on the backdrop.** Now that it is plain type rather than a struck
  disc, it needs the `.on-art-scope` ink flip like its `.sec-meta` sibling — without it the deep
  light ink sat on raw campaign art at 0.014 luminance.

Also hardened: the panel material's `::before` paints a `background-color` floor. The grain tile is
opaque, but a missing texture would otherwise leave an 80%-veil panel with the backdrop bleeding
through it, and light ink on a bled panel fails AA.

Also: the cross-reference to the masthead-animation guard follows its rename to
`page-header.test.tsx` (a broken cross-reference is a bug).
