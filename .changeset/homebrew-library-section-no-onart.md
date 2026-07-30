---
"d20-folio": patch
---

chore(settings): author the homebrew-library section without the retiring `onArt` flag

`main` has since removed `Section`'s `onArt` prop (the visual rollback). The prop is
optional on this branch's base, so the new library section is authored WITHOUT it —
valid on both bases, forward-consistent with its sibling sections after the rebase, and
one fewer compile break to resolve at merge.
