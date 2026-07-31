---
"d20-folio": patch
---

react-router 7 -> 8.3.0: clears both open Dependabot highs (RSC-mode CSRF
bypass - triaged non-exploitable here, we never enable RSC mode, but zero
open advisories beats a standing triage). No API changes reach our SPA
usage: typecheck, the full unit suite, and the full e2e matrix all pass
untouched.
