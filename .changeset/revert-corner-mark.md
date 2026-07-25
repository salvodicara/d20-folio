---
"d20-folio": patch
---

fix(identity): revert the corner ornament to the owner-approved style-A knot

Owner-ordered revert: the chrome reset's "MARK" (`--mark-tl/tr/bl/br` — long straight-ray corner
scratches — plus `--mark-run`, the 216×40 run cartouche) read as "horrible… broken lines" and is
gone. Restored the last state the owner approved (`c66f2e1`): `--frame-ornate` — the wave-volute
knot + rail-swell + weld-diamond + five-ray glint fan — mounted as four fixed-size 64px per-corner
layers on all three earned hero registers (framed masthead, gilt cockpit identity band, and
dialogs — `.modal::after` rejoins the mount). The ceremonial seat divider (`--seat-orn`, the
260×24 winged fleur on dialog heads) is restored alongside its fading `border-image` seat rule.

Corner seating verified in real Chromium at 1× and 4×, both themes, all three registers: the
knot's rail swell clears the vertex cleanly on the chrome reset's rounded 10px plate radius, so
rounded corners are kept (no square-corner override needed).

`ornament-vocabulary.guard.test.ts` re-pinned against the restored anatomy (mutation-proved);
`DESIGN.md` §5 and `PROGRESS.md` updated to describe the restored vocabulary as current.
