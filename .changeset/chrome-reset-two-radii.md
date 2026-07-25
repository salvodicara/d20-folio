---
"d20-folio": patch
---

feat(identity): the chrome reset, phase 3 — two radii, and there is no third

The chrome ran **eight** distinct corner radii in simultaneous use on one cockpit page
(`0, 1, 2, 4, 8, 12, 50%, 999px`). There are two now: a plate is **10px**, a chip is **square**.

- The six-value `--radius-sm/md/lg/xl/2xl/full` scale collapses to `--r-plate` / `--r-chip`. Every
  literal sub-4px facet (1px, 2px, 3px, 5px) joins the chip value; every card/panel/plaque scale
  joins the plate value. The Tailwind `@theme` bridge re-points every `rounded-*` utility at the
  same two values, so markup and stylesheet can never drift into a third.
- **The square-corner ruling is reversed.** The masthead, the cockpit identity band and dialogs went
  `border-radius: 0` to give the corner knot a "true crossing" to seat on. The reference has no
  square-cornered panel, and its **ornamented** corners are rounded too — the mark radiates inside
  the curve. The one-line law that ruling served survives and is strengthened (an ornament REPLACES
  the line, L2); only the squareness goes.
- **The corner mark is unmounted, and returns redrawn.** The shipped knot re-drew ~30px of the
  host's own rail in each direction from a square vertex; on a rounded plate that straight swell
  cannot register on the arc — it reads as a thickened, offset segment of line that abruptly returns
  to the border, which is precisely the two-line defect L2 forbids. Rather than ride the arc wrong,
  it comes off with the square corners and returns as the corner terminal (a glint fan alone, seated
  inside the radius, contributing no run line) plus the run cartouche. That releases the 10.6 KB
  raw SVG payload the four corner tiles carried in both themes.
- A **circle** (`50%`) is now said as a circle wherever one was written as `999px`: coins, seals,
  sockets, orbs, portrait wells. A circle is a shape, not a radius. The settings switch track keeps
  `--radius-pill` as the app's one true pill; the three rectangular pills that were not switches
  (the level chip, the economy filter cap, the wizard "kept" tag) take the chip facet.

The radius law is guard-pinned in `chrome-system.guard.test.ts`: every `border-radius` in the chrome
must resolve to one of the two values, a circle, the one pill, or a calc off the plate value for an
inner edge inside its own border.
