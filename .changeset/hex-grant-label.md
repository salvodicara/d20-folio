---
"d20-folio": patch
---

Hex now shows a proper label when you concentrate on it. Hex (and Hunter's Mark) grant an activatable
"buff active" toggle, but their toggle labels were missing from the string catalogue, so the toggle
rendered a broken placeholder (the raw key, e.g. `⟦spell:hex.grants.0.label⟧`) instead of readable
text in the deployed app. Both labels are now present in English and Italian ("Hex active" /
"Sortilegio attivo", "Hunter's Mark active" / "Marchio del Cacciatore attivo"), and the grant-label
completeness guard now sweeps every spell — the source class it had been skipping — so no buff spell
can ship a missing toggle label again.
