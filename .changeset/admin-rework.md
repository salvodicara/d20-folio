---
"d20-folio": minor
---

Admin console rework (owner-grilled): an OMNI-search — one field finds users
by name/email, characters by name (resolved to the owner's row with a
why-chip), and campaigns by name (resolved to the DM's row) — with the
character index loaded lazily on first search; user rows become the
campaigns-style disclosure cards (identity + metrics at rest, dates +
character roster + block/delete inside the chevron-revealed detail); and the
list renders bounded (25 rows + "show more") so communities of hundreds stay
snappy. Campaign summaries now carry the campaign name.
