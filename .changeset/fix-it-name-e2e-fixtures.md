---
"d20-folio": patch
---

test(e2e): realign the IT-name fixtures the deploy e2e matrix pins, after the official IT SRD 5.2.1 re-sourcing (public `b8a6ba6` + pack `fb0740c9`) renamed the underlying names. The Crafter feat is now **Fabbricante** (`level-up.spec` asks-ledger tests), and the No-Truncation stress anchors follow the renamed / re-derived longest IT names (**Incensiere del Controllo degli Elementali dell'Aria**, **Custodia per mappe o pergamene**, **Dotazione da Avventuriero**). Test-only — no app change; unblocks the deploy gate (the full e2e matrix runs only at deploy, not pre-push, so these stale fixtures weren't caught earlier).
