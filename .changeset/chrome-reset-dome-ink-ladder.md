---
"d20-folio": patch
---

fix(a11y): derive the dark plate's specular dome from the ink ladder — `--text-faint` was failing AA under it. The pool shipped at 10% alpha with only `--text-muted` compensated, which left the faintest ink register (help text, placeholders, slot labels, timestamps, log timestamps) at 3.64:1 on the `.folio-panel` composite and 4.13:1 on the opaque `.modal`/`.info-card` plate. The pool is now 4% — 1.59× the plate's corner luminance at token level, 2.32× as actually rendered, i.e. the reference's own 2.4×, where 10% rendered 4.24× — and `--text-faint` is `#a09272`: all three registers (secondary 7.25 · muted 5.46 · faint 4.64) clear the floor with a visible L\* step between them. The composite-floor guard now checks a grid (every domed ground × both small-prose registers) plus a minimum tier separation, instead of the single (panel, `--text-muted`) pair that let the regression through.
