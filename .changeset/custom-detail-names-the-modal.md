---
"d20-folio": patch
---

fix(sheet): a homebrew's detail names the modal, like an SRD entry's does

Reading a kept custom entry left the modal titled "Custom" while the SRD tab of the
same modal swaps its title to the entry's name. The Custom tab now reports the open
entry through the same `onDetailTitle` seam the SRD picker uses, in all three add
modals: the title shows the homebrew's name while its detail is open and reverts when
you go Back.
