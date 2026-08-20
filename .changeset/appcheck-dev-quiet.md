---
"d20-folio": patch
---

Local dev never initializes App Check — localhost is not a registered reCAPTCHA domain, so the live key could only produce console noise; VITE_APPCHECK_DEBUG=true stays the explicit dev opt-in.
