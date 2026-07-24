---
"d20-folio": patch
---

Concentrating on Hex no longer crashes the sheet. Hex (and Hunter's Mark) grant an activatable
"buff active" toggle, but their toggle labels were missing from the string catalogue, so rendering
the toggle threw through the strict resolver. Both labels are now present in English and Italian
("Hex active" / "Sortilegio attivo", "Hunter's Mark active" / "Marchio del Cacciatore attivo"), and
the grant-label completeness guard now sweeps every spell — the source class it had been skipping —
so no buff spell can ship a missing toggle label again.
