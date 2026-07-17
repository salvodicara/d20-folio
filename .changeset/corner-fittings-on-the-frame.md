---
"d20-folio": patch
---

The reliquary corner goldwork now sits ON the frame like a bookbinding fitting: the ornament's arms lie on the panel's border lines and the corner gem caps the vertex where they merge, instead of floating inset inside the panel. One recipe fix (a border-image outset on the shared hero-frame overlay) propagates to every ornamented surface — the framed mastheads, the cockpit identity band, and dialogs. The modal and the crested masthead no longer child-paint-clip (the crest self-clips via its mask; the modal head's gradient band rounds its own top corners to the card radius), so the fitting straddles the corner uncut, and long unbroken dialog titles now wrap instead of overrunning the card.
