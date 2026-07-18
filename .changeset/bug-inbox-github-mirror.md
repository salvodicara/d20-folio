---
"d20-folio": minor
---

The admin bug inbox now MIRRORS the open public issues: on each load it reconciles against
GitHub and cascade-purges every report whose issue is CLOSED (Storage screenshot first, then
the Firestore doc — idempotent, retried on the next load; nothing is deleted when GitHub can't
be reached, and never a report that isn't on GitHub). Each row also gains an expand-in-place
DETAIL view of the private remainder the public issue omits: the user-written description,
reporter identity, the sanitized debug context, and the screenshot rendered inline (with an
explicit "unavailable" state on load failure). The closed-issue lookup caches only successes
(a transient failure retries on the next load) and ignores pull requests, and the security
rules forbid a client pre-setting the issue linkage — a forged issue number can never route a
report into the purge.
