---
---

The Storage seam for campaign map backgrounds: `campaigns/{campaignId}/maps/{mapId}.jpeg`, DM/admin write and member read in `storage.rules` (cross-service membership lookup, 8 MiB and image-type ceilings), and `src/lib/map-io.ts` (upload returning the `MapBackground` reference, per-campaign usage summed from Storage metadata, a 100 MiB courtesy quota, delete). `compressImage` moves to `src/lib/image-compress.ts`.
