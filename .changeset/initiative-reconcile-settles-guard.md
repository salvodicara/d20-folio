---
"d20-folio": patch
---

Pin the initiative reconcile-loop invariant with a regression guard (combat-tab stability
hardening). The cockpit's `combatStore.initiative` (an arbitrary string) round-trips through
the `combat/state` subdoc as a number and echoes back as a normalized string; the
`TurnEconomyProvider` reconcile loop settles only once the store and session compare equal.
Verified that the round-trip normalization is a settling projection — every output is a fixed
point — so the loop always terminates after at most one Firestore echo and can never oscillate
into a render-loop freeze. A guard now pins that round-trip idempotency across edge values
(blank, whitespace, zero, negative, decimal, leading-zero, exponent, non-numeric, non-finite,
signed), so a future normalization change can't regress divergence back in.
