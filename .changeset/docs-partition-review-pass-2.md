---
"d20-folio": patch
---

Docs-partition review pass 2: the fixture-bound e2e specs no longer hardcode the private fixture's character name — a shared `tests/e2e/team-fixture.ts` derives the expected name from the pack fixture JSON at runtime and the specs skip themselves when the pack is absent (the public snapshot ships zero name literals); the pack coverage doc's 19 headerless table fragments (an artifact of the row-level partition moves) are rejoined under proper header+separator rows so they render as tables and scripted row edits can't silently misfire.
