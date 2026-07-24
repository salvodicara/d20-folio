---
"d20-folio": patch
---

fix(identity): converge the atmosphere wave — first-paint ghost skip, duration guard, lens-blade wording

Three review findings on the backdrop-crossfade + Starbound-frame wave, applied together:

- **First-paint double-entrance.** Cold-loading directly onto a realm route ran the backdrop
  crossfade ghost AND the painter's one-shot `app-bg-fade` entry animation at once — a doubled
  entrance. The seam now skips the ghost on its first-ever commit (the entry animation covers it)
  and crossfades every subsequent route-to-route change. Verified in real Chromium: cold-load
  `/characters` spawns zero ghosts (single clean entry), navigating to `/compendium` spawns exactly
  one (the crossfade still plays).
- **Cross-boundary duration guard.** The fade duration lives twice — `FADE_MS` in
  `backdrop-transition.ts` and `transition: opacity 480ms` on `.bg-ghost` in `index.css` (with the
  removal fallback assuming CSS ≤ `END_MS`). A unit test now reads the `.bg-ghost` duration out of
  the CSS verbatim and pins it equal to `FADE_MS` and below `END_MS`, so the two can't silently
  drift.
- **Ornament-vocabulary wording.** `DESIGN.md` §5's no-organic-foliage law was self-contradicted by
  the seat divider's "slender leaf blades"; the SVG is a geometric vesica/lens, so the element is
  renamed "lens blades" (and the matching folio.css comment) so the law stands unqualified.
