---
"d20-folio": patch
---

Combat Chronicle Phase 1 (correlation): the DM's live feed now fuses each player's
declared attacks with the HP it applies. A declared HIT that lands on a matching HP drop
becomes a confirmed, auto-attributed hit line (with the DM's real damage amount); a
declared MISS becomes a certain miss line; an ambiguous match (more than one attacker
could account for the damage) wears a subtle "uncertain" marker so the DM can confirm
which. The fusion is deterministic — a hit line needs a real HP delta and a miss line
needs an explicit tap; nothing is ever inferred — and it costs no extra Firestore budget
(the reconciliation is derived, never written back). The DM can still one-tap re-attribute
any pending or uncertain line and edit or remove any line when saving the chapter; the
Phase-0 fallback attribution stays for undeclared (paper-play) damage.
