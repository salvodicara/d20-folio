---
"d20-folio": patch
---

Combat Chronicle: drop the unused whole-feed presenter (`localizeChronicleFeed` +
`ChronicleFeedRow`) — the live feed resolves each line itself — un-export the
internal-only `chronicleOutcomeLine`, and tidy the exhaustiveness doc note.
