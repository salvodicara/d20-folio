---
"d20-folio": patch
---

Raise the composed PWA precache ceiling 9066 → 9515 KiB. The 9066 line was the
wave-1 bestiary PILOT baseline (10 pack statblocks); the pack bestiary has since
been authored to ~160 statblocks across the a-b…t-z tranches, growing the lazy
`monsters-*` catalogue shards (~16 new precache entries, all offline-first lazy
chunks — the eager closure is unchanged). That authoring lands in the pack repo,
which has no pre-push budget gate, so the drift accumulated untracked; this is
the first public composed push to surface it. Measured 9503.94 KiB / 323 entries
(of which +22 KiB is the 5 new choice-damage monsters), +~11 KiB never-exact-fit
headroom.
