---
"d20-folio": patch
---

refactor(ui): move `ModalTabSwitcher` from the cockpit's `CustomCreationForms` into shared chrome (`components/shared/ModalTabSwitcher`) and give it an optional `labels` override (defaulting to the current SRD/Custom captions). Generic modal chrome now lives beside `ModalShell`, so a new consumer never drags the cockpit's custom-creation forms into its chunk; the five cockpit Add-X modals are byte-identical.
