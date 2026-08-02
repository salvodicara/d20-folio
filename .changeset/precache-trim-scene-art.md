---
"d20-folio": patch
---

perf(pwa): move the 12 heavy scene/backdrop plates out of the Workbox precache into a dedicated "scene-art" CacheFirst runtime cache, so a fresh visitor no longer force-downloads art for routes they haven't opened yet (composed-lane precache 9481.90 → 8185.52 KiB); still offline-capable after the one visit that painted a scene (Workbox default status-200 caching, same-origin), and the precache budget guard's ceiling drops to lock in the win.
