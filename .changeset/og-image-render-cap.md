---
"d20-folio": patch
---

The link-preview picture service is now hardened against being hammered. Because it draws each
card fresh and the image address can carry throwaway query junk (`…png?i=1,2,3…`) that the CDN
treats as a brand-new picture every time, a flood of such requests could otherwise redraw the same
card over and over. It now caps how many cards it will draw at once and remembers each freshly
drawn card in memory for a short while, so a burst on one link is drawn once and re-served
instantly instead of redrawn per hit. The result is served identically, links keep working, and
the app stays up under a flood without ever tripping the emergency budget cut-off.
