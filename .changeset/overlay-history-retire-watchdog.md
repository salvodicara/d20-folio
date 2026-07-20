---
"d20-folio": patch
---

Harden the overlay-history retirement traversal against a missed popstate. The
in-flight `retireInFlight` flag was cleared ONLY by the traversal's `popstate`, so a
dropped or coalesced pop (a backgrounded/frozen tab) left it stuck true forever —
every later overlay op (command palette, hardware/gesture Back) queued behind it with
nothing to ever flush the queue, a deadlock only a page refresh cleared. A self-healing
watchdog armed alongside the flag now performs the missed cleanup deterministically if
the pop never lands (clearing the flag and draining the queue exactly as the popstate
handler would); the real popstate cancels the watchdog, so the healthy path is unchanged
and never double-flushes.
