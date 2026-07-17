---
"d20-folio": patch
---

Publishability guard + test-side sweep: the partition guard now also scans the public doc surface (`docs/*.md`, root `*.md`, `.github/**`) for the PI lexicon and identity values (admin uid, owner email, live-fixture names) with the nominative BG3 reference allowlisted; the public automation-coverage guard scopes itself to the public corpus via `@pack` so the pack residual ledgers live only pack-side (mirror duplication deleted); pack-entity prose, live-fixture identifiers, and stale scrape-mirror citations are scrubbed from public tests and code comments. The identity denylist itself lives pack-side (`content-pack/private-terms.json`) so the guard never re-leaks the values it forbids.
