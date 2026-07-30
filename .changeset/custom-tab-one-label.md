---
"d20-folio": patch
---

fix(i18n): the add-modals' Custom tab is labelled "Custom", from ONE key

The tab now LISTS your kept homebrew as well as creating it, so "Create Custom" no
longer described it. `custom.customTab` becomes "Custom" / "Personalizzati" and is the
single key all three add-modals use — the item modal's parallel `equipment.tabCustom`
is deleted (golden rule 6: one semantic unit, one key). The dedup baseline is updated:
`custom.customTab` / `features.custom` share a value as context-namespaced labels (a
modal tab vs a feature group), and the two entries left stale by the deletion are
dropped.
