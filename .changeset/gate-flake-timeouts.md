---
"d20-folio": patch
---

test(gate): realistic explicit timeouts for the two proven load-flaky tests

Two tests each timed out twice at the 5s default during full pre-push runs under
machine load while green in isolation: the creation-navigate Monk
tool-proficiency case (the file's heaviest full-wizard interaction render) now
carries an explicit 15s per-test budget, and the cinzel-no-italic guard (a
static sweep reading every src/ file from disk) carries a 10s suite budget. No
behavior change; the budgets only absorb parallel-lane transform contention.
