---
"d20-folio": patch
---

chore(budget): step the PWA precache ceiling 9055 → 9066 KiB for the share-links wave's own lazy chunks (SharedCharacterView, SharePopover, the two `share-*` chunks, invite-code, the anonymous /view read seam) — measured 9055.07 KiB / 307 entries on the composed lane, +~11 KiB never-exact-fit headroom; eager + entry ceilings unchanged and under. The MM bestiary pilot was already ceiling'd on main (9044.06 KiB / 301) so it is not the driver.
