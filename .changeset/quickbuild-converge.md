---
"d20-folio": patch
---

Quickbuild internals converge after review: the wizard applies the exact state object the
"has anything been sculpted?" yardstick compares against (one list, not two), the randomizer
asserts on an empty pool instead of defaulting around one, the default build reads straight off
the preset record, and the authored and rolled presets are now held to ONE shared legality
battery instead of two copies of it.
