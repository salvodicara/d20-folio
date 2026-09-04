---
---

Route the lease's personal write-back through the `combat/state` document's one sanctioned encoder: `encodeLegacyWriteBack` returns a branded payload only that encoder can mint, so a write can no longer skip the guard that refuses a document the read edge would then refuse forever, and it carries the `updatedAt` stamp every other writer emits. The encoder moves to `combat-state-writeback.ts` and is re-exported from `combat-state-io.ts` unchanged.
