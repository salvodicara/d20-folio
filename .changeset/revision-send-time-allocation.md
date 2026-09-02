---
---

The character parent's compare-and-set generation is allocated when the write actually leaves, not when it is queued, so a payload superseded inside the debounce window no longer burns a number the server never saw (which the rules then denied, silently discarding the edits). A metadata-only write may now also advance the generation by one, which is what the real sharing publish and snapshot restore send. The store's `revision` always reports the last server-acknowledged generation, the save error keeps the real Firestore message, and one unreadable roster row is skipped instead of blanking the whole roster.
