---
"d20-folio": patch
---

Keep a newer pending operation and revoked-session recovery intact when an earlier asynchronous
acknowledgment finishes. Cleanup rechecks the session ticket and exact stored envelope identity.
