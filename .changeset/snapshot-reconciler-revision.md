---
---

Character persistence reconciles the parent and `combat/state` listeners per domain (a pending local write is never republished over by a sibling snapshot), the debounced save reports resolve/reject/cancel, and every build write is compare-and-set on a stored `revision` enforced by the rules; a conflict surfaces as a save error instead of clobbering. Two replays pin the reported losses (custom item vanishing, Focus reverting).
