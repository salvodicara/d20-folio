---
"d20-folio": patch
---

Make the unit suite pass in a genuinely pack-less tree (the public snapshot, where `content-pack/` does not exist on disk — a composition the in-repo SRD-only lane never exercised): the cross-family table ledger in `fast-lane.meta` now runs only where the pack tests exist, the `vs`-slug guard's sanity floor is composition-aware, and `buildCharacterExport`'s lazy Storage-SDK import is single-flight — concurrent dynamic imports of the mocked module raced vitest's mock registry and evaluated the real Firebase module, which throws without Firebase env.
