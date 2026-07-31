---
"d20-folio": patch
---

test(share): pin that the public `/view` page follows the VIEWER's locale, not the owner's. It is client-rendered in the recipient's browser and already reuses the app's i18n bootstrap (navigator/localStorage detection); a regression test flips the active locale to IT and asserts the read-only chrome renders in Italian, with the English form proven absent — the mirror image of the OG card's owner-locale rule.
