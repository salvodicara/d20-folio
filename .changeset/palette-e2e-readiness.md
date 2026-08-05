---
"d20-folio": patch
---

The command-palette keyboard e2e specs now wait for the async search index to land instead of racing it with fixed timeouts — the latent break the first ambient Verify run caught.
