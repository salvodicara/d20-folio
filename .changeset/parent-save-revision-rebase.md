---
---

Re-base the character parent's compare-and-set cursor on every rejected save, not only on the rules' refusal. A rejected write never landed, so the generation it claimed was never stored; keeping the cursor made the retry claim `acknowledged + 2`, which the rules deny — turning one transport failure into a real conflict that discards the pending edit. A non-conflict rejection now keeps the payload pending and resends it at `acknowledged + 1`.
