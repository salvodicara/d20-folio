---
"d20-folio": minor
---

feat(identity): route changes dissolve scene into scene — the backdrop crossfade

Changing realm used to hard-cut the app-wide backdrop from one painterly plate to the next — at
the raised presence that cut read as a viewport flash, off the settling motion grammar. Every
swap on the one backdrop seam (the realm scene hook and the campaign hub's banner seam) now rides
a crossfade: the outgoing scene's exact painted state — image, crop focal, zoom, veil, mask —
is held on a ghost layer at the painter's own depth while the new plate lands beneath, then fades
out on the standard ease over half a second, so the Hall of Heroes melts into the Grand Library
the way BG3's menus change rooms. Back-to-back swaps in one navigation coalesce, so the ghost
always shows the scene you were actually looking at; reduced-motion users keep the instant cut.
Verified frame-by-frame in real Chromium, with the orchestration pinned by a unit suite.
The suite also hardens the ornament guard's URI extraction against undefined capture groups.
