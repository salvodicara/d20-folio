---
"d20-folio": patch
---

Deleting an account never touches another player's data: each shared campaign is handed over in one transaction (a change made meanwhile is kept, the leaver's character link goes with them), and a delete that stopped halfway finishes on a second try.
