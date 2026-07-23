---
"d20-folio": minor
---

feat(identity): the wizards get their own realm scene — the Ritual of Making scriptorium pair

Character creation and level-up now open inside their own painting: a candlelit scriptorium (dark)
and the same chamber at morning (light) replace the app-wide study backdrop while either wizard is
mounted — a great blank-paged ledger on its desk right-of-centre with the glowing lapis inkwell and
standing quill beside it, an armillary sphere and star-chart banners at the edges, and a faint gold
ritual circle on the floor, while the calm corridor where the wizard column sits stays quiet in
both plates. Because both wizards share one chrome (`WizardFrame`), the realm mounts there ONCE and
covers both surfaces; it rides the ONE `--app-bg-art` seam through the shared `useRealmBackdrop`
hook via a new per-theme token pair (`--asset-creation-scene`), so each theme still downloads only
its own plate. Both plates hold the calm-centre law with the real UI composited (verified in
Chromium across dark/light × desktop/mobile, creation AND level-up): the ledger fills only the
empty right gutter as atmosphere, the mobile cover slice stays on the calm corridor with no focal
bias needed, and every optional dossier grade (calm-margin widening, centre compression, blue
taming, honey pull-down) was judged unnecessary in situ. The pair ships at 95/153 KiB (WebP q75 +
sharp_yuv), and the wizards' on-art chrome — orbs, chapter titles, the page-turn pager seals —
stays legible over both plates.
