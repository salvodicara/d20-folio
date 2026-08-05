---
"d20-folio": patch
---

Test audit, wave 2 — false confidence removed: two unit files that tested a locally re-implemented copy of production logic (retroactive-CON HP, Dwarven Toughness) are gone — the real seams were already pinned in character-infer/grants/compute; the cast-options subset twin, the duplicated long/short-rest basics, the codec-envelope re-pins, and the knockout e2e re-pin now each live in exactly one place; the raw-palette guard is ONE guard again (the colocated copy's drifted allowlist was silencing two files).
