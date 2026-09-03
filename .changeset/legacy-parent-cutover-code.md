---
---

Every character parent is v1: the unmarked-legacy readers, the `playStateVersion` marker and the legacy `combat/state` shapes are gone from the client; the character-path Firestore rules enforce owner/admin/co-member access, an empty parent state, the revision compare-and-set and the exact public sheet only (`playStateVersion*`, `peerLegacyCoreCreate` and the legacy escape hatch deleted); the rules suite shrinks to access matrices (118 cases).
