---
"d20-folio": minor
---

The public read-only page a character share link opens. `/view/{uid}/{charId}` renders the sheet to
anyone with the link — no account, no sign-in — reusing the same read-only sheet the DM and admin
viewers already render, so a shared character looks exactly like the real thing minus every control.
A link that has been revoked, or points at a deleted character, lands on one quiet page instead of an
error. The page keeps itself out of search results.
