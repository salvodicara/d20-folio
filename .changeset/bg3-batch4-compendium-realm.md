---
"d20-folio": minor
---

feat(identity): the Compendium gets its own realm scene — the Grand Library pair

The compendium realm now opens inside its own painting: a candlelit Grand Library nave (dark) and
its sunlit morning sibling (light) replace the app-wide study backdrop while the codex is mounted,
riding the ONE `--app-bg-art` seam the campaign hub already uses — a new per-theme token pair
(`--asset-compendium-scene`) plus a tiny shared `useRealmBackdrop` hook that future realm scenes
reuse. Both plates hold the calm-centre law with the real UI composited (verified in Chromium
across dark/light × desktop/mobile): the two-leaf tome spread sits over the plate's quiet centre
aisle, richly painted shelves and candle bloom recede at the edges, and each theme downloads only
its own plate. The pair ships at 85/75 KiB (WebP q75 + sharp_yuv); the light plate's optional
centre grade was judged unnecessary in situ.
