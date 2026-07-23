---
"d20-folio": minor
---

feat(identity): the roster gets its own realm scene — the Hall of Heroes pair

The character roster now opens inside its own painting: a candlelit trophy hall (dark) and the
same hall at morning (light) replace the app-wide study backdrop while the roster is mounted —
empty armor suits and heraldic pennants hugging the walls, a warm hearth at the far edge, exactly
one lapis pennant among the trophies, and a calm centre band where the character cards and toolbar
sit. It rides the ONE `--app-bg-art` seam through the shared `useRealmBackdrop` hook the
compendium's Grand Library landed, via a new per-theme token pair (`--asset-roster-scene`), so each
theme still downloads only its own plate. Both plates hold the calm-centre law with the real UI
composited (verified in Chromium across dark/light × desktop/mobile, populated roster AND the runic
empty state); the light plate's optional centre calm-down grade was judged unnecessary in situ —
the backdrop's 0.55 opacity over the parchment field already melts the lower-centre mosaic to one
soft honey tone. The pair ships at 82/175 KiB (WebP q75 + sharp_yuv), and the roster's existing
on-art chrome (count chip, select button) stays legible over both plates.
