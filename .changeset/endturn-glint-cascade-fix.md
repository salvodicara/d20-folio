---
"d20-folio": patch
---

The End Turn button's hover glint actually plays now — its host seat was cascade-reset by the recipe's own `all: unset`; the sheen ink is also tokenized per theme (`--glint-ink`) so light and dark sweeps share one geometry, and the glint block's header comment now names the real easing (`--ease-standard`).
