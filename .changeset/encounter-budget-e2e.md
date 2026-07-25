---
"d20-folio": patch
---

test(e2e): encounter XP-budget journey

Extends the encounter-picker Playwright journey with the DM budget readout: in the
seeded dev encounter the round-bar readout grades the party at rest (150 XP costed),
then adding Goblin Warrior ×2 through the picker ticks the modal's own budget strip
live to 250 XP, and after closing the round-bar readout shows the same total — one
source, two mounts, verified in real Chromium.
