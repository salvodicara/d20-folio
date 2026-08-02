---
"d20-folio": patch
---

Raise the P3 bundle-budget ceilings for the combat-chronicle epic: entry chunk
63 → 64 KB (the eager PlayTab now mounts the in-encounter declaration panel) and
PWA precache 8255 → 8300 KiB (the new lazy chronicle recorders/reconciler,
EN/IT presenter, party-chronicle live feed and declaration panel are precached
for offline-first). The eager closure is unchanged — the Firebase apply-damage
write stays behind a dynamic import. Baselines updated in the guard and in
docs/ARCHITECTURE.md → "Performance budget (P3)" in the same commit.
