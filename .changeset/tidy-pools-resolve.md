---
"d20-folio": minor
---

Route Divine Intervention, War God's Blessing, and charged multi-spell item pools through the shared spell-resolution pipeline. Chosen spells now resolve targets and deterministic effects before spending, record their real spell and charge source, preserve concentration and undo atomically, honor typed save/DC/duration overrides, and reject stale or unaffordable commits.
Keep the same cast and rest contracts green in both composed and SRD-only builds.
