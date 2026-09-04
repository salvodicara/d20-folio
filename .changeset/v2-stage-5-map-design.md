---
---

Stage 5 design: the minimum map lives on the encounter document as `map`/`fog` table ops and `position`/`reveal.*` overrides; the background goes to Storage under `campaigns/{id}/maps/*` with client-side compression and a per-campaign quota.
