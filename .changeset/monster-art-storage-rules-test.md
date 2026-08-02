---
"d20-folio": patch
---

test(rules): pin the shared monster-art Storage scope

Add a storage-rules test block that pins the intended scope of the shared
monster-art path (`users/{uid}/portraits/monster-*.jpeg`): owner-only write,
any-authenticated read (campaign-member visibility), no unauthenticated read,
owner-only delete. The feature reuses the pre-existing portrait rule unchanged;
this locks the posture so it can never silently widen to world-writable or
public-read.
