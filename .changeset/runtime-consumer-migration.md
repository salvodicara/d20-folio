---
"d20-folio": patch
---

Migrate the d20/grants/store consumer layer onto the canonical runtime contracts: combat surfaces speak the kernel's d20 request/observation API, the grant schema restores every live-authored kind with the per-spell free-cast tracker suffix (fixing a shared-tracker regression), the character store types its committed d20 results exactly, and the campaign/e2e fixtures align with the migrated encounter model.
