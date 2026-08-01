---
"d20-folio": patch
---

Every dialog body now ships through the one ModalBody/ModalFoot pair — the six
raw-class stragglers (create/join campaign, confirm, arcane recovery, pool
spend, algorithm import) regain the frame's-margin padding and the shared
action-row chrome; the bespoke `.confirm-body`/`.confirm-actions` padding
regime is retired and a guard now forbids raw body classes.
